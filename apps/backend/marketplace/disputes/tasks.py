from celery import shared_task
from django.db import OperationalError
from rest_framework.exceptions import APIException

from .models import DiscrepancyCase
from .services import process_case

BATCH_SIZE = 1000


@shared_task(
    name="disputes.process_cases",
    autoretry_for=(OperationalError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 5},
)
def process_cases(*, after=None):
    query = DiscrepancyCase.objects.filter(closed_at__isnull=True)
    if after:
        query = query.filter(pk__gt=after)
    ids = list(query.order_by("pk").values_list("pk", flat=True)[:BATCH_SIZE])
    closed = 0
    for pk in ids:
        try:
            closed += process_case(pk)
        except APIException:
            continue
    if len(ids) == BATCH_SIZE:
        process_cases.delay(after=str(ids[-1]))
    return closed
