from django.db import connection

from marketplace.common.middleware import request_id_var

from .models import AuditEvent, OutboxEvent


def audit(*, actor, action, target, reason="", before=None, after=None):
    if not connection.in_atomic_block:
        raise RuntimeError("Audit must commit with the domain command.")
    return AuditEvent.objects.create(
        actor=actor,
        action=action,
        aggregate_type=target._meta.label_lower,
        aggregate_id=target.pk,
        reason=reason,
        before=before or {},
        after=after or {},
        request_id=request_id_var.get(),
    )


def notify(*, recipient, topic, payload):
    if not connection.in_atomic_block:
        raise RuntimeError("Notification intent must commit with the domain command.")
    return OutboxEvent.objects.create(recipient=recipient, topic=topic, payload=payload)
