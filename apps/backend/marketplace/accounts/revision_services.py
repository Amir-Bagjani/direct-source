import copy
import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.common.exceptions import Conflict
from marketplace.operations.services import audit, notify

from .models import Business, BusinessRevision, User
from .permissions import has_role, require_business_owner, require_operator
from .verification_services import check_files


def snapshot(business):
    address = business.addresses.order_by("created_at", "id").first()
    return {
        "profile": {
            **({"logo": str(business.logo_id)} if business.logo_id else {}),
            "name": business.name,
            "phone": business.phone,
            "description": business.description,
            "address": {key: getattr(address, key) for key in ["province", "city", "address"]},
        },
        **{s.kind: s.data for s in business.verification.sections.all()},
    }


def validate_documents(actor, business, data):
    from marketplace.operations.models import StoredFile

    logo = data["profile"].get("logo")
    if (
        logo
        and not StoredFile.objects.filter(
            pk=logo,
            owner=actor,
            business=business,
            purpose="business_logo",
            scan_status="clean",
            deleted_at__isnull=True,
        ).exists()
    ):
        raise ValidationError({"logo": "لوگوی معتبر متعلق به کسب‌وکار لازم است."})
    identity, activity = data["identity"], data["activity"]
    check_files(
        actor,
        business,
        "identity",
        [identity[key] for key in ["card_front", "card_back", "selfie"]],
    )
    check_files(actor, business, "activity", activity["files"])
    if activity["evidence_type"] == "alternative" and len(activity["files"]) < 2:
        raise ValidationError("حداقل دو شاهد مستقل لازم است.")


@transaction.atomic
def propose(*, actor, business_id, changes):
    actor = User.objects.select_for_update(no_key=True).get(pk=actor.pk)
    business = Business.objects.select_for_update().get(pk=business_id)
    require_business_owner(actor, business)
    if (
        business.status != "verified"
        or business.revisions.filter(status__in=["pending", "changes_requested"]).exists()
    ):
        raise Conflict("کسب‌وکار تأییدشده بدون بازنگری باز لازم است.")
    before = snapshot(business)
    proposed = {**copy.deepcopy(before), **json.loads(json.dumps(changes, cls=DjangoJSONEncoder))}
    if "profile" in changes and "logo" not in changes["profile"] and business.logo_id:
        proposed["profile"]["logo"] = str(business.logo_id)
    if proposed == before:
        raise ValidationError("تغییری ثبت نشده است.")
    validate_documents(actor, business, proposed)
    revision = BusinessRevision.objects.create(
        business=business,
        before=before,
        proposed=proposed,
        identity_status="pending" if before["identity"] != proposed["identity"] else "approved",
        activity_status="pending"
        if before["profile"] != proposed["profile"] or before["activity"] != proposed["activity"]
        else "approved",
    )
    audit(
        actor=actor,
        action="business.revision_submitted",
        target=revision,
        after={"status": revision.status},
    )
    return revision


def locked_revision(actor, revision_id):
    actor = User.objects.select_for_update(no_key=True).get(pk=actor.pk)
    business_id = BusinessRevision.objects.values_list("business_id", flat=True).get(pk=revision_id)
    business = Business.objects.select_for_update().get(pk=business_id)
    revision = BusinessRevision.objects.select_for_update().get(pk=revision_id)
    return actor, business, revision


@transaction.atomic
def resubmit(*, actor, revision_id, changes):
    actor, business, revision = locked_revision(actor, revision_id)
    require_business_owner(actor, business)
    if revision.status != "changes_requested" or business.status != "verified":
        raise Conflict()
    if not changes:
        raise ValidationError("بخش برگشتی را اصلاح کنید.")
    for key in changes:
        section = "activity" if key == "profile" else key
        if getattr(revision, f"{section}_status") != "changes_requested":
            raise Conflict("فقط بخش برگشتی قابل‌اصلاح است.")
    changes = copy.deepcopy(changes)
    if "profile" in changes and "logo" not in changes["profile"]:
        if "logo" in revision.proposed["profile"]:
            changes["profile"]["logo"] = revision.proposed["profile"]["logo"]
    revision.proposed = {
        **revision.proposed,
        **json.loads(json.dumps(changes, cls=DjangoJSONEncoder)),
    }
    validate_documents(actor, business, revision.proposed)
    for section in ["identity", "activity"]:
        if getattr(revision, f"{section}_status") == "changes_requested":
            if section not in changes and not (section == "activity" and "profile" in changes):
                raise ValidationError("همهٔ بخش‌های برگشتی باید اصلاح شوند.")
            setattr(revision, f"{section}_status", "pending")
    revision.status = "pending"
    revision.save()
    audit(actor=actor, action="business.revision_resubmitted", target=revision)
    return revision


@transaction.atomic
def claim(*, actor, revision_id):
    actor, business, revision = locked_revision(actor, revision_id)
    require_operator(actor)
    if revision.status != "pending" or revision.assigned_to_id is not None:
        raise Conflict()
    revision.assigned_to = actor
    revision.save(update_fields=["assigned_to", "updated_at"])
    audit(
        actor=actor,
        action="business.revision_claimed",
        target=revision,
        after={"assignee": str(actor.pk)},
    )
    return revision


@transaction.atomic
def review(*, actor, revision_id, kind, decision, reason):
    actor, business, revision = locked_revision(actor, revision_id)
    require_operator(actor)
    if not has_role(actor, "owner") and revision.assigned_to_id != actor.pk:
        raise PermissionDenied()
    if (
        kind not in ["identity", "activity"]
        or decision not in ["approved", "changes_requested", "rejected"]
        or not reason.strip()
    ):
        raise ValidationError("بخش، تصمیم و دلیل معتبر لازم است.")
    if (
        business.status != "verified"
        or revision.status not in ["pending", "changes_requested"]
        or getattr(revision, f"{kind}_status") != "pending"
    ):
        raise Conflict()
    setattr(revision, f"{kind}_status", decision)
    setattr(revision, f"{kind}_reason", reason)
    statuses = {revision.identity_status, revision.activity_status}
    if "rejected" in statuses:
        revision.status = "rejected"
    elif "changes_requested" in statuses:
        revision.status = "changes_requested"
    elif statuses == {"approved"}:
        if snapshot(business) != revision.before:
            raise Conflict("نسخهٔ مبنا تغییر کرده است.")
        # Current business and identity change in the same commit; no mixed version is exposed.
        profile = revision.proposed["profile"]
        business.name, business.phone, business.description = (
            profile["name"],
            profile["phone"],
            profile["description"],
        )
        validate_documents(business.membership.user, business, revision.proposed)
        business.logo_id = profile.get("logo")
        business.save(update_fields=["name", "phone", "description", "logo", "updated_at"])
        address = business.addresses.order_by("created_at", "id").first()
        for key, value in profile["address"].items():
            setattr(address, key, value)
        address.save()
        for section in business.verification.sections.all():
            section.data = revision.proposed[section.kind]
            section.save(update_fields=["data", "updated_at"])
        revision.status = "approved"
    revision.save()
    audit(
        actor=actor,
        action="business.revision_reviewed",
        target=revision,
        reason=reason,
        after={"section": kind, "decision": decision, "status": revision.status},
    )
    notify(
        recipient=business.membership.user,
        topic="business.revision_reviewed",
        payload={
            "business_id": str(business.pk),
            "revision_id": str(revision.pk),
            "status": revision.status,
        },
    )
    return revision
