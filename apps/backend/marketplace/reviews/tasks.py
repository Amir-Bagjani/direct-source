from celery import shared_task
from django.db import OperationalError
from django.db.models import Q
from django.utils import timezone

from marketplace.orders.models import Order

from .models import Entitlement
from .services import create_entitlements, expire_order

BATCH_SIZE = 1000


@shared_task(
    name="reviews.process_reviews",
    autoretry_for=(OperationalError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 5},
)
def process_reviews(*, phase=None, after=None):
    queries = {
        "entitle": Order.objects.filter(status="completed", delivered_at__isnull=False).exclude(
            entitlements__isnull=False
        ),
        "deadline": Order.objects.filter(
            pk__in=Entitlement.objects.filter(deadline__lte=timezone.now())
            .filter(
                Q(expired_at__isnull=True, review__submitted_at__isnull=True)
                | Q(review__submitted_at__isnull=False, review__published_at__isnull=True)
            )
            .values("order_id")
        ),
    }
    counts = {"entitle": 0, "deadline": 0}
    for name, query in queries.items():
        if phase and phase != name:
            continue
        if after:
            query = query.filter(pk__gt=after)
        ids = list(query.order_by("pk").values_list("pk", flat=True)[:BATCH_SIZE])
        for pk in ids:
            if name == "entitle":
                counts[name] += bool(create_entitlements(order_id=pk))
            else:
                expire_order(pk)
                counts[name] += 1
        if len(ids) == BATCH_SIZE:
            process_reviews.delay(phase=name, after=str(ids[-1]))
    return counts
