import re
import unicodedata

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from marketplace.accounts.permissions import require_operator
from marketplace.common.exceptions import Conflict
from marketplace.operations.services import audit, notify

from .models import Attribute, AttributeOption, Category, TaxonomyProposal
from .services import locked_actor, producer, save_taxonomy


def normalize(value):
    value = unicodedata.normalize("NFKC", str(value)).translate(str.maketrans("يك", "یک"))
    return re.sub(r"\s+", " ", value.replace("\u200c", " ")).strip().casefold()


@transaction.atomic
def propose(*, actor, data):
    actor = locked_actor(actor)
    business = producer(actor, data.pop("business").pk)
    category, attribute = data.get("category"), data.get("attribute")
    kind = data["kind"]
    if (
        (kind == "category" and attribute)
        or (kind == "attribute" and (not category or attribute))
        or (kind == "option" and (not attribute or category))
    ):
        raise ValidationError("محدودهٔ پیشنهاد با نوع آن سازگار نیست.")
    if attribute and attribute.kind != "choice":
        raise ValidationError("مقدار استاندارد فقط برای ویژگی فهرستی است.")
    key = str(attribute.pk if attribute else category.pk if category else "root")
    name = normalize(data["name"])
    if not name:
        raise ValidationError("نام معتبر لازم است.")
    query = dict(kind=kind, scope_key=key, normalized_name=name, status="pending")
    try:
        with transaction.atomic():
            obj = TaxonomyProposal.objects.create(
                business=business, scope_key=key, normalized_name=name, **data
            )
    except IntegrityError:
        existing = TaxonomyProposal.objects.filter(**query).first()
        if existing is None:
            raise
        raise Conflict(
            {"detail": "پیشنهاد مشابه در انتظار بررسی است.", "proposal_id": str(existing.pk)}
        ) from None
    audit(actor=actor, action="catalog.proposal_created", target=obj, after={"kind": kind})
    return obj


@transaction.atomic
def review_proposal(*, actor, pk, decision, reason, definition=None):
    actor = locked_actor(actor)
    require_operator(actor)
    list(Category.objects.select_for_update().order_by("id"))
    obj = get_object_or_404(TaxonomyProposal.objects.select_for_update(), pk=pk)
    if obj.status != "pending":
        raise Conflict("پیشنهاد قبلاً تعیین تکلیف شده است.")
    if decision not in ["approved", "rejected"] or not reason.strip():
        raise ValidationError("تصمیم و دلیل لازم است.")
    if decision == "approved":
        if definition is None:
            raise ValidationError("تعریف کامل مورد تأییدشده لازم است.")
        data = dict(definition)
        scope_field = {"category": "parent", "attribute": "category", "option": "attribute"}[
            obj.kind
        ]
        expected = obj.attribute if obj.kind == "option" else obj.category
        if data.get(scope_field) != expected:
            raise ValidationError("تعریف باید در محدودهٔ همین پیشنهاد باشد.")
        # Approval is atomic with the operator's complete catalogue definition.
        data["is_active"] = True
        model = {"category": Category, "attribute": Attribute, "option": AttributeOption}[obj.kind]
        result = save_taxonomy(actor=actor, model=model, data=data)
        obj.result_id = result.pk
    obj.status, obj.reason, obj.reviewed_by = decision, reason, actor
    obj.save()
    audit(
        actor=actor,
        action="catalog.proposal_reviewed",
        target=obj,
        reason=reason,
        before={"status": "pending"},
        after={"status": decision, "result_id": str(obj.result_id) if obj.result_id else None},
    )
    notify(
        recipient=obj.business.membership.user,
        topic="catalog.proposal",
        payload={"proposal_id": str(obj.pk), "status": decision},
    )
    return obj
