from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import InboxNotification, OutboxEvent


class InternalInbox:
    def deliver(self, event):
        InboxNotification.objects.get_or_create(
            event=event,
            defaults={
                "recipient_id": event.recipient_id,
                "topic": event.topic,
                "payload": event.payload,
            },
        )


@shared_task(
    name="operations.deliver_outbox",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 5},
)
def deliver_outbox():
    # PostgreSQL is both the durable intent store and the inbox provider store.
    # No network I/O takes place while these rows are locked.
    with transaction.atomic():
        events = (
            OutboxEvent.objects.select_for_update(skip_locked=True)
            .filter(delivered_at__isnull=True, available_at__lte=timezone.now())
            .exclude(topic__startswith="email.")
            .order_by("available_at", "id")[:100]
        )
        count = 0
        for event in events:
            InternalInbox().deliver(event)
            event.delivered_at = timezone.now()
            event.attempts += 1
            event.save(update_fields=["delivered_at", "attempts", "updated_at"])
            count += 1
        return count


@shared_task(name="operations.deliver_email_outbox")
def deliver_email_outbox():
    from datetime import timedelta

    from marketplace.accounts.email_services import send_challenge

    count = 0
    for _ in range(20):
        with transaction.atomic():
            event = (
                OutboxEvent.objects.select_for_update(skip_locked=True)
                .filter(
                    topic__in=["email.verify", "email.reset"],
                    delivered_at__isnull=True,
                    available_at__lte=timezone.now(),
                    attempts__lt=5,
                )
                .order_by("available_at", "id")
                .first()
            )
            if event is None:
                break
            event.attempts += 1
            event.available_at = timezone.now() + timedelta(minutes=5)
            event.save(update_fields=["attempts", "available_at", "updated_at"])
        try:
            send_challenge(event)
        except Exception:
            # Persistent attempts/lease allow retry after broker or worker failure.
            # Never log SMTP exceptions; they can include recipient or message content.
            continue
        OutboxEvent.objects.filter(pk=event.pk).update(delivered_at=timezone.now())
        count += 1
    return count
