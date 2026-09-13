import re
from contextvars import ContextVar
from typing import Any
from uuid import uuid4

from django.db import connection

from marketplace.common.middleware import request_id_var

from .models import AuditEvent, OutboxEvent

audit_context: ContextVar[dict[str, Any] | None] = ContextVar("audit_context", default=None)


def redact(value):
    if isinstance(value, dict):
        return {
            k: "[redacted]"
            if any(
                part in k.lower()
                for part in (
                    "password",
                    "secret",
                    "token",
                    "authorization",
                    "raw_code",
                    "delivery_code",
                    "signed_url",
                )
            )
            else redact(v)
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact(item) for item in value]
    if isinstance(value, str):
        value = re.sub(
            r"https?://\S*[?&](?:X-Amz-|Signature|token=)\S*", "[redacted]", value, flags=re.I
        )
        return re.sub(r"(?:Bearer\s+\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+)", "[redacted]", value)
    return value


def audit(*, actor, action, target, reason="", before=None, after=None):
    if not connection.in_atomic_block:
        raise RuntimeError("Audit must commit with the domain command.")
    from marketplace.accounts.permissions import has_role

    context = audit_context.get() or {}
    return AuditEvent.objects.create(
        actor=actor,
        actor_role=context.get("role")
        or (
            "owner"
            if has_role(actor, "owner")
            else "operator"
            if has_role(actor, "operator")
            else "business"
            if actor
            else "system"
        ),
        command_source=context.get("source", "domain"),
        correlation_id=context.get("correlation") or request_id_var.get() or str(uuid4()),
        action=action,
        aggregate_type=target._meta.label_lower,
        aggregate_id=target.pk,
        reason=redact(reason),
        before=redact(before or {}),
        after=redact(after or {}),
        request_id=request_id_var.get(),
    )


def notify(*, recipient, topic, payload):
    if not connection.in_atomic_block:
        raise RuntimeError("Notification intent must commit with the domain command.")
    return OutboxEvent.objects.create(recipient=recipient, topic=topic, payload=payload)
