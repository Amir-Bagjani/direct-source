import copy
import hashlib
import json
import uuid

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.accounts.models import Business
from marketplace.accounts.permissions import require_business_owner, require_operator
from marketplace.common.exceptions import Conflict
from marketplace.logistics.models import VariantPackage
from marketplace.logistics.services import lock_services
from marketplace.operations.services import audit, notify

from .models import Category, Product, ProductRevision, Variant, VariantSupply
from .publication import validate_publication
from .services import image_ids, locked_actor, values_for

CONTENT = ["category", "name", "description", "brand", "manufacturer_model", "attributes", "images"]


def content(product):
    return {
        "profile": {
            key: str(product.category_id) if key == "category" else getattr(product, key)
            for key in CONTENT
        },
        "variants": [
            {"id": str(v.pk), "sku": v.sku, "attributes": v.attributes, "images": v.images}
            for v in product.variants.filter(is_active=True).order_by("id")
        ],
    }


def apply_content(product, proposed):
    profile = proposed["profile"]
    category = get_object_or_404(Category, pk=profile["category"])
    product.category = category
    for key in CONTENT[1:]:
        setattr(product, key, profile[key])
    product.attributes = values_for(category, "product", product.attributes, product.attributes)
    product.images = image_ids(product.business, product.images, 8)
    product.full_clean()
    product.save()
    existing = {str(v.pk): v for v in product.variants.all()}
    product.variants.filter(is_active=True).exclude(
        pk__in=[row["id"] for row in proposed["variants"]]
    ).update(is_active=False, disabled_code="revision_removed")
    seen = set()
    for row in proposed["variants"]:
        key = row["id"]
        if key in seen:
            raise ValidationError("تنوع تکراری است.")
        seen.add(key)
        variant = existing.get(key)
        if variant and not variant.is_active:
            raise ValidationError("تنوع بایگانی‌شده قابل بازگردانی از این مسیر نیست.")
        if variant is None:
            if "supply" not in row or "package" not in row:
                raise ValidationError("تنوع تازه باید عرضه و بستهٔ کامل داشته باشد.")
            variant = Variant(id=key, product=product, business=product.business)
        elif "supply" in row or "package" in row:
            raise ValidationError("اطلاعات عملیاتی تنوع موجود از مسیر مستقل تغییر می‌کند.")
        variant.sku = row["sku"]
        variant.attributes = values_for(category, "variant", row["attributes"], variant.attributes)
        variant.images = image_ids(product.business, row["images"], 3)
        variant.combination = hashlib.sha256(
            json.dumps(variant.attributes, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
        variant.full_clean()
        variant.save()
        if key not in existing:
            supply = VariantSupply(variant=variant, **row["supply"])
            supply.full_clean()
            supply.save()
            package = VariantPackage(variant=variant, **row["package"])
            package.full_clean()
            package.save()
    product.variants.filter(is_active=True).exclude(pk__in=seen).update(
        is_active=False, disabled_code="revision_removed"
    )
    validate_publication(product)


def validate_candidate(product, proposed):
    # ponytail: reuse real constraints and publication guards in a rolled-back savepoint.
    # No external side effects or notifications occur in apply_content.
    with transaction.atomic():
        apply_content(Product.objects.get(pk=product.pk), proposed)
        transaction.set_rollback(True)


@transaction.atomic
def save_revision(*, actor, product_id, changes, pk=None):
    actor = locked_actor(actor)
    reference = get_object_or_404(Product, pk=product_id, business__membership__user=actor)
    business = Business.objects.select_for_update().get(pk=reference.business_id)
    require_business_owner(actor, business)
    list(Category.objects.select_for_update().order_by("id"))
    lock_services()
    product = Product.objects.select_for_update().get(pk=product_id)
    if (
        product.published_at is None
        or product.status not in ["published", "inactive"]
        or business.status != "verified"
    ):
        raise Conflict("محصول قبلاً منتشرشده و کسب‌وکار تأییدشده لازم است.")
    if pk:
        revision = get_object_or_404(
            ProductRevision.objects.select_for_update(), pk=pk, product=product
        )
        if revision.status not in ["draft", "changes_requested"]:
            raise Conflict("بازنگری قفل است.")
    else:
        if product.revisions.filter(status__in=["draft", "pending", "changes_requested"]).exists():
            raise Conflict("یک بازنگری باز وجود دارد.")
        revision = ProductRevision(
            product=product, before=content(product), proposed=content(product)
        )
    proposed = copy.deepcopy(revision.proposed)
    profile = dict(changes.get("profile", {}))
    if "category" in profile:
        profile["category"] = str(profile["category"].pk)
    proposed["profile"].update(profile)
    if "variants" in changes:
        proposed["variants"] = changes["variants"]
        known = {row["id"] for row in revision.proposed["variants"]}
        live = {str(pk) for pk in product.variants.values_list("pk", flat=True)}
        for row in proposed["variants"]:
            if "id" in row and str(row["id"]) not in known | live:
                raise ValidationError("شناسهٔ تنوع باید از نسخهٔ جاری یا همین بازنگری باشد.")
            row.setdefault("id", str(uuid.uuid4()))
            row.setdefault("attributes", {})
            row.setdefault("images", [])
    proposed = json.loads(json.dumps(proposed, cls=DjangoJSONEncoder))
    if proposed == revision.before:
        raise ValidationError("تغییری ثبت نشده است.")
    validate_candidate(product, proposed)
    revision.proposed = proposed
    revision.save()
    audit(
        actor=actor,
        action="catalog.revision_saved",
        target=revision,
        after={"status": revision.status},
    )
    return revision


@transaction.atomic
def act(*, actor, pk, action, decision="", reason="", code=""):
    actor = locked_actor(actor)
    reference = get_object_or_404(ProductRevision, pk=pk)
    business = Business.objects.select_for_update().get(pk=reference.product.business_id)
    if action in ["submit", "cancel"]:
        require_business_owner(actor, business)
    else:
        require_operator(actor)
    list(Category.objects.select_for_update().order_by("id"))
    lock_services()
    product = Product.objects.select_for_update().get(pk=reference.product_id)
    revision = ProductRevision.objects.select_for_update().get(pk=pk)
    old = revision.status
    if action == "submit":
        if old not in ["draft", "changes_requested"]:
            raise Conflict()
        validate_candidate(product, revision.proposed)
        revision.status, revision.assigned_to = "pending", None
    elif action == "claim":
        if old != "pending" or revision.assigned_to_id not in [None, actor.pk]:
            raise Conflict()
        revision.assigned_to = actor
    elif action == "cancel":
        if old not in ["draft", "pending", "changes_requested"] or not reason.strip():
            raise Conflict()
        revision.status, revision.reason = "cancelled", reason
    elif action == "review":
        if old != "pending":
            raise Conflict()
        if revision.assigned_to_id != actor.pk:
            raise PermissionDenied()
        if (
            decision not in ["approved", "changes_requested", "rejected"]
            or not reason.strip()
            or not code.strip()
        ):
            raise ValidationError("تصمیم، کد و دلیل الزامی است.")
        if decision == "approved":
            if product.status not in ["published", "inactive"]:
                raise Conflict()
            apply_content(product, revision.proposed)
        revision.status, revision.reason, revision.code = decision, reason, code
    revision.save()
    audit(
        actor=actor,
        action="catalog.revision_" + action,
        target=revision,
        reason=reason,
        before={"status": old},
        after={"status": revision.status},
    )
    if action == "review":
        notify(
            recipient=business.membership.user,
            topic="catalog.revision",
            payload={"revision_id": str(pk), "status": revision.status},
        )
    return revision
