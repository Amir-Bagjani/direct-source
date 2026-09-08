from django.db import transaction
from rest_framework.exceptions import ValidationError

from marketplace.common.exceptions import Conflict
from marketplace.operations.services import audit

from .models import Business, BusinessRevision, PlatformRole, User, VerificationApplication
from .permissions import has_role, require_owner


@transaction.atomic
def set_operator(*, actor, user_id, enabled, reason):
    if not reason.strip():
        raise ValidationError({"reason": "دلیل الزامی است."})
    # Role changes and commands serialize against these same user locks.
    users = {
        u.pk: u
        for u in User.objects.select_for_update().filter(pk__in=[actor.pk, user_id]).order_by("pk")
    }
    require_owner(users[actor.pk])
    target = users.get(user_id)
    if target is None:
        raise ValidationError({"user_id": "کاربر پیدا نشد."})
    if enabled and (not target.is_active or target.is_suspended):
        raise Conflict("کاربر فعال نیست.")
    role, created = PlatformRole.objects.get_or_create(
        user=target, role="operator", defaults={"is_active": enabled}
    )
    before = False if created else role.is_active
    role.is_active = enabled
    role.save(update_fields=["is_active", "updated_at"])
    if not enabled:
        # Lock Business before Application, matching verification commands.
        ids = list(
            VerificationApplication.objects.filter(
                assigned_to=target, business__status__in=["pending", "changes_requested"]
            ).values_list("business_id", flat=True)
        )
        revision_business_ids = list(
            BusinessRevision.objects.filter(
                assigned_to=target, status__in=["pending", "changes_requested"]
            ).values_list("business_id", flat=True)
        )
        list(
            Business.objects.select_for_update()
            .filter(pk__in=set(ids + revision_business_ids))
            .order_by("pk")
        )
        for revision in (
            BusinessRevision.objects.select_for_update()
            .filter(assigned_to=target, status__in=["pending", "changes_requested"])
            .order_by("pk")
        ):
            revision.assigned_to = None
            revision.save(update_fields=["assigned_to", "updated_at"])
            audit(
                actor=actor,
                action="business.revision_released",
                target=revision,
                reason=reason,
                before={"assignee": str(target.pk)},
                after={"assignee": None},
            )
        for application in (
            VerificationApplication.objects.select_for_update()
            .filter(business_id__in=ids, assigned_to=target)
            .order_by("pk")
        ):
            application.assigned_to = None
            application.save(update_fields=["assigned_to", "updated_at"])
            audit(
                actor=actor,
                action="verification.released",
                target=application,
                reason=reason,
                before={"assignee": str(target.pk)},
                after={"assignee": None},
            )
    audit(
        actor=actor,
        action="operator.access_changed",
        target=role,
        reason=reason,
        before={"active": before},
        after={"active": enabled},
    )


@transaction.atomic
def reassign(*, actor, business_id, user_id, reason):
    if not reason.strip():
        raise ValidationError({"reason": "دلیل الزامی است."})
    users = {
        u.pk: u
        for u in User.objects.select_for_update().filter(pk__in=[actor.pk, user_id]).order_by("pk")
    }
    require_owner(users[actor.pk])
    target = users.get(user_id)
    if target is None or not has_role(target, "operator"):
        raise ValidationError({"user_id": "اپراتور فعال لازم است."})
    business = Business.objects.select_for_update().get(pk=business_id)
    app = VerificationApplication.objects.select_for_update().get(business=business)
    before = str(app.assigned_to_id) if app.assigned_to_id else None
    app.assigned_to = target
    app.save(update_fields=["assigned_to", "updated_at"])
    audit(
        actor=actor,
        action="verification.reassigned",
        target=app,
        reason=reason,
        before={"assignee": before},
        after={"assignee": str(user_id)},
    )
