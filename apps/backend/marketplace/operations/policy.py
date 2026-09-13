from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from marketplace.accounts.permissions import require_owner
from marketplace.catalog.services import locked_actor
from marketplace.logistics.services import lock_services

from .models import PolicyVersion
from .services import audit

BOUNDS = {
    "order_hours": (1, 168),
    "payment_hours": (1, 168),
    "cancellation_hours": (1, 168),
    "discrepancy_hours": (1, 720),
    "discrepancy_response_hours": (1, 336),
    "review_days": (1, 90),
}


def current():
    row = (
        PolicyVersion.objects.filter(scope="deadlines", effective_at__lte=timezone.now())
        .order_by("-effective_at", "-created_at", "-pk")
        .first()
    )
    return (
        dict(row.values)
        if row
        else {
            "order_hours": 24,
            "payment_hours": 24,
            "cancellation_hours": 24,
            "discrepancy_hours": 72,
            "discrepancy_response_hours": getattr(settings, "DISCREPANCY_RESPONSE_HOURS", 48),
            "review_days": settings.REVIEW_WINDOW_DAYS,
        }
    )


def value(key):
    return current()[key]


@transaction.atomic
def configure(*, actor, values, reason, effective_at=None):
    from marketplace.finance.services import required_reason

    locked_actor(actor)
    require_owner(actor)
    required_reason(reason)
    lock_services()
    if not values or set(values) - BOUNDS.keys():
        raise ValidationError("تنظیم ناشناخته است.")
    for key, val in values.items():
        if type(val) is not int or not BOUNDS[key][0] <= val <= BOUNDS[key][1]:
            raise ValidationError("مقدار تنظیم خارج از بازه است.")
    if effective_at and effective_at < timezone.now():
        raise ValidationError("زمان اثر نمی‌تواند در گذشته باشد.")
    before = current()
    row = PolicyVersion.objects.create(
        actor=actor,
        reason=reason,
        values={**before, **values},
        effective_at=effective_at or timezone.now(),
    )
    audit(
        actor=actor,
        action="operations.policy_changed",
        target=row,
        reason=reason,
        before=before,
        after={"values": row.values, "effective_at": row.effective_at.isoformat()},
    )
    return {"id": str(row.pk), "values": row.values, "effective_at": row.effective_at.isoformat()}
