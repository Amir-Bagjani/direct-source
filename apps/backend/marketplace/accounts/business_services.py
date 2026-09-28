from django.db import transaction
from rest_framework.exceptions import ValidationError

from marketplace.common.exceptions import Conflict
from marketplace.operations.services import audit

from .models import (
    Address,
    Business,
    Membership,
    User,
    VerificationApplication,
    VerificationSection,
)
from .permissions import active_user, require_owner


@transaction.atomic
def create_business(*, actor, address, **data):
    user = User.objects.select_for_update(no_key=True).get(pk=actor.pk)
    if not active_user(user):
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied()
    if Membership.objects.filter(user=user).exists():
        raise Conflict("هر کاربر فقط یک کسب‌وکار می‌تواند داشته باشد.")
    business = Business.objects.create(**data)
    Membership.objects.create(user=user, business=business)
    Address.objects.create(business=business, **address)
    application = VerificationApplication.objects.create(business=business)
    VerificationSection.objects.bulk_create(
        [
            VerificationSection(application=application, kind="identity"),
            VerificationSection(application=application, kind="activity"),
        ]
    )
    audit(
        actor=user,
        action="business.created",
        target=business,
        after={"status": business.status, "kind": business.kind},
    )
    return business


@transaction.atomic
def set_controlled_access(*, actor, business_id, enabled, reason):
    actor = User.objects.select_for_update(no_key=True).get(pk=actor.pk)
    require_owner(actor)
    if not reason.strip():
        raise ValidationError({"reason": "دلیل الزامی است."})
    business = Business.objects.select_for_update().get(pk=business_id)
    if enabled and business.status != "verified":
        raise Conflict("کسب‌وکار باید تأیید شده باشد.")
    before = business.controlled_access
    business.controlled_access = enabled
    business.save(update_fields=["controlled_access", "updated_at"])
    audit(
        actor=actor,
        action="business.controlled_access",
        target=business,
        reason=reason,
        before={"enabled": before},
        after={"enabled": enabled},
    )
    return business


@transaction.atomic
def update_draft(*, actor, business_id, address, logo, **data):
    from marketplace.operations.models import StoredFile

    from .permissions import require_business_owner

    business = Business.objects.select_for_update().get(pk=business_id)
    require_business_owner(actor, business)
    activity = business.verification.sections.get(kind="activity")
    if business.status != "draft" and not (
        business.status == "changes_requested" and activity.status == "changes_requested"
    ):
        raise Conflict("فقط پروفایل پیش‌نویس یا بخش فعالیت برگشتی قابل ویرایش است.")
    if (
        logo is not None
        and not StoredFile.objects.select_for_update()
        .filter(
            pk=logo,
            owner=actor,
            business=business,
            purpose="business_logo",
            scan_status="clean",
            deleted_at__isnull=True,
        )
        .exists()
    ):
        raise ValidationError({"logo": "لوگوی معتبر متعلق به کسب‌وکار لازم است."})
    for key, value in data.items():
        setattr(business, key, value)
    business.logo_id = logo
    business.save(update_fields=[*data, "logo", "updated_at"])
    current = business.addresses.order_by("created_at", "id").first()
    if current is None:
        Address.objects.create(business=business, **address)
    else:
        for key, value in address.items():
            setattr(current, key, value)
        current.save(update_fields=[*address, "updated_at"])
    audit(
        actor=actor,
        action="business.draft_updated",
        target=business,
        after={"fields": [*data, "address", "logo"]},
    )
    return business
