from celery import shared_task
from django.db import OperationalError
from django.db.models import Q
from rest_framework.exceptions import APIException

from marketplace.orders.models import Order

from .models import CompensationDecision, FinancialEvent
from .services import apply_decision, refund_cancellation, settle

BATCH_SIZE = 1000


@shared_task(
    name="finance.process_orders",
    autoretry_for=(OperationalError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 5},
)
def process_orders(*, phase=None, after=None):
    """Keyset continuations keep held/invalid old rows from starving later orders."""
    queries = {
        "cancellation": Order.objects.filter(
            cancellation__status="refund_pending", financial_events__kind="payment"
        ),
        "compensation": CompensationDecision.objects.exclude(
            pk__in=FinancialEvent.objects.filter(kind__in=["refund", "adjustment"]).values(
                "idempotency_key"
            )
        ),
        "settlement": Order.objects.filter(status="active", financial_events__kind="payment")
        .filter(
            Q(delivered_at__isnull=False)
            | Q(finance_holds__kind="discrepancy", finance_holds__released_at__isnull=False)
        )
        .exclude(financial_events__kind="settlement"),
    }
    commands = {
        "cancellation": refund_cancellation,
        "compensation": apply_decision,
        "settlement": lambda pk: settle(order_id=pk),
    }
    counts = {"refunded": 0, "settled": 0}
    for name, query in queries.items():
        if phase is not None and phase != name:
            continue
        if after is not None:
            query = query.filter(pk__gt=after)
        ids = list(query.order_by("pk").values_list("pk", flat=True).distinct()[:BATCH_SIZE])
        for pk in ids:
            try:
                commands[name](pk)
                counts["settled" if name == "settlement" else "refunded"] += 1
            except APIException:
                # A rejected domain command stays pending/held; technical failures retry.
                continue
        if len(ids) == BATCH_SIZE:
            process_orders.delay(phase=name, after=str(ids[-1]))
    return counts
