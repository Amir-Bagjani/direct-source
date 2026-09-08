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
    user = User.objects.select_for_update().get(pk=actor.pk)
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
    actor = User.objects.select_for_update().get(pk=actor.pk)
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
