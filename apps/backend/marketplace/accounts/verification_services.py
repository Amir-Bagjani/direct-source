from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.common.exceptions import Conflict
from marketplace.operations.models import StoredFile
from marketplace.operations.services import audit, notify

from .models import Business, User, VerificationApplication, VerificationSection
from .permissions import has_role, require_business_owner, require_operator


def locked_application(business_id):
    business = Business.objects.select_for_update().get(pk=business_id)
    application = VerificationApplication.objects.select_for_update().get(business=business)
    return business, application


def require_assignee(actor, application):
    require_operator(actor)
    if not has_role(actor, "owner") and application.assigned_to_id != actor.pk:
        raise PermissionDenied("ابتدا مسئولیت پرونده را بپذیرید.")


def check_files(actor, business, kind, ids):
    if len(ids) != len(set(ids)) or not ids or len(ids) > 10:
        raise ValidationError("مدارک باید مستقل و حداکثر ۱۰ فایل باشند.")
    if StoredFile.objects.filter(
        pk__in=ids,
        owner=actor,
        business=business,
        purpose=kind,
        scan_status="clean",
        deleted_at__isnull=True,
    ).count() != len(ids):
        raise ValidationError("مدرک نامعتبر، اسکن‌نشده یا متعلق به پروندهٔ دیگری است.")


@transaction.atomic
def save_section(*, actor, business_id, kind, data):
    business, app = locked_application(business_id)
    require_business_owner(actor, business)
    section = VerificationSection.objects.get(application=app, kind=kind)
    if business.status not in ["draft", "changes_requested"] or section.status not in [
        "draft",
        "changes_requested",
    ]:
        raise Conflict("این بخش قابل‌ویرایش نیست.")
    ids = (
        [data[key] for key in ["card_front", "card_back", "selfie"]]
        if kind == "identity"
        else data["files"]
    )
    check_files(actor, business, kind, ids)
    if kind == "activity" and data["evidence_type"] == "alternative" and len(ids) < 2:
        raise ValidationError("حداقل دو شاهد مستقل لازم است.")
    section.data = {
        key: str(value) if key != "files" else [str(x) for x in value]
        for key, value in data.items()
    }
    section.save(update_fields=["data", "updated_at"])
    audit(actor=actor, action="verification.section_saved", target=section, after={"kind": kind})
    return section


@transaction.atomic
def submit(*, actor, business_id):
    business, app = locked_application(business_id)
    require_business_owner(actor, business)
    if business.status not in ["draft", "changes_requested"]:
        raise Conflict()
    for section in app.sections.all():
        if section.status == "approved":
            continue
        if not section.data:
            raise ValidationError("هر دو بخش باید تکمیل باشند.")
        data = section.data
        ids = (
            [data[key] for key in ["card_front", "card_back", "selfie"]]
            if section.kind == "identity"
            else data["files"]
        )
        check_files(actor, business, section.kind, ids)
        section.status = "pending"
        section.save(update_fields=["status", "updated_at"])
    before = business.status
    business.status = "pending"
    business.save(update_fields=["status", "updated_at"])
    app.submitted_at = timezone.now()
    app.save(update_fields=["submitted_at", "updated_at"])
    audit(
        actor=actor,
        action="verification.submitted",
        target=business,
        before={"status": before},
        after={"status": business.status},
    )
    return business


@transaction.atomic
def claim(*, actor, business_id):
    actor = User.objects.select_for_update().get(pk=actor.pk)
    require_operator(actor)
    business, app = locked_application(business_id)
    if (
        business.status not in ["pending", "rejected", "changes_requested"]
        or app.assigned_to_id is not None
    ):
        raise Conflict("پرونده قابل پذیرش مسئولیت نیست.")
    app.assigned_to = actor
    app.save(update_fields=["assigned_to", "updated_at"])
    audit(actor=actor, action="verification.claimed", target=app, after={"assignee": str(actor.pk)})
    return business


@transaction.atomic
def review(*, actor, business_id, kind, decision, reason):
    actor = User.objects.select_for_update().get(pk=actor.pk)
    if decision not in ["approved", "changes_requested", "rejected"]:
        raise ValidationError({"decision": "تصمیم معتبر نیست."})
    business, app = locked_application(business_id)
    require_assignee(actor, app)
    if not reason.strip():
        raise ValidationError({"reason": "دلیل الزامی است."})
    section = app.sections.get(kind=kind)
    if business.status not in ["pending", "changes_requested"] or section.status != "pending":
        raise Conflict()
    before = section.status
    section.status, section.reason = decision, reason
    section.save(update_fields=["status", "reason", "updated_at"])
    statuses = set(app.sections.values_list("status", flat=True))
    old_business_status = business.status
    if "rejected" in statuses:
        business.status = "rejected"
    elif "changes_requested" in statuses:
        business.status = "changes_requested"
    elif statuses == {"approved"}:
        business.status = "verified"
        business.first_verified_at = business.first_verified_at or timezone.now()
    business.save(update_fields=["status", "first_verified_at", "updated_at"])
    audit(
        actor=actor,
        action="verification.reviewed",
        target=section,
        reason=reason,
        before={"status": before, "business_status": old_business_status},
        after={"status": decision, "business_status": business.status},
    )
    notify(
        recipient=business.membership.user,
        topic="verification.reviewed",
        payload={"business_id": str(business.pk), "kind": kind, "status": decision},
    )
    return business


@transaction.atomic
def reopen(*, actor, business_id, reason):
    actor = User.objects.select_for_update().get(pk=actor.pk)
    business, app = locked_application(business_id)
    require_assignee(actor, app)
    if not reason.strip():
        raise ValidationError({"reason": "دلیل الزامی است."})
    if business.status != "rejected":
        raise Conflict()
    app.sections.exclude(status="approved").update(status="changes_requested", reason=reason)
    business.status = "changes_requested"
    business.save(update_fields=["status", "updated_at"])
    audit(
        actor=actor,
        action="verification.reopened",
        target=business,
        reason=reason,
        before={"status": "rejected"},
        after={"status": business.status},
    )
    return business
