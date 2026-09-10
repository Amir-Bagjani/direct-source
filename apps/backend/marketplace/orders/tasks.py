from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from .lifecycle import expire_order
from .models import CancellationRequest, Order


@shared_task(name="orders.expire_orders")
def expire_orders():
    now = timezone.now()
    ids = list(
        Order.objects.filter(
            Q(status="pending", response_deadline__lte=now)
            | Q(status="accepted", payment_deadline__lte=now)
            | (
                Q(status__in=["pending", "accepted"], group__isnull=False)
                & (Q(retailer__status="suspended") | Q(manufacturer__status="suspended"))
            )
        )
        .order_by("created_at")
        .values_list("pk", flat=True)[:1000]
    )
    from .cancellation import expire_cancellation

    expired = sum(expire_order(pk) for pk in ids)
    cancellations = list(
        CancellationRequest.objects.filter(status="pending", deadline__lte=now).values_list(
            "order_id", flat=True
        )[:1000]
    )
    return expired + sum(expire_cancellation(pk) for pk in cancellations)
