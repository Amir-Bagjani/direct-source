import json
from typing import Any

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from marketplace.accounts.permissions import has_role, require_operator, require_owner
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.finance.services import digest, required_reason
from marketplace.orders.api import StrictCommand

from . import work
from .models import OperationCommand
from .services import audit, audit_context


class NoParameters(StrictCommand):
    pass


class ChoiceParameters(StrictCommand):
    decision = serializers.CharField(max_length=40)


class BusinessReviewParameters(ChoiceParameters):
    section = serializers.ChoiceField(choices=["identity", "activity"])


def dispatch(actor, kind, target, command, params, reason, key):
    from django.shortcuts import get_object_or_404

    from marketplace.accounts import verification_services
    from marketplace.catalog import publication
    from marketplace.catalog.publication_api import ReviewInput
    from marketplace.disputes import services as disputes
    from marketplace.disputes.api import DisputeDecisionInput
    from marketplace.disputes.models import DiscrepancyLine
    from marketplace.finance import services as finance
    from marketplace.logistics import fulfillment
    from marketplace.logistics import services as logistics
    from marketplace.logistics.fulfillment_api import (
        AssignmentInput,
        DecisionInput,
        OperationalExceptionInput,
        StatusInput,
    )
    from marketplace.orders import cancellation, lifecycle
    from marketplace.reviews import services as reviews
    from marketplace.reviews.api import ModerationInput
    from marketplace.support import services as support
    from marketplace.support.api import MessageInput, TicketStatusInput

    from . import suspensions

    class CaseDecisionParameters(DisputeDecisionInput):
        claim_id = serializers.UUIDField()

    serializers_map = {
        "business_review": BusinessReviewParameters,
        "product_review": ReviewInput,
        "shipping_assign": AssignmentInput,
        "shipping_exception": OperationalExceptionInput,
        "shipping_specification": DecisionInput,
        "delivery_decide": StatusInput,
        "dispute_decide": CaseDecisionParameters,
        "ticket_reply": MessageInput,
        "ticket_status": TicketStatusInput,
        "review_moderate": ModerationInput,
        "cancellation_decide": ChoiceParameters,
        "disposition_decide": ChoiceParameters,
    }
    schema = serializers_map.get(command, NoParameters)()
    extras = set(params) - set(schema.fields)
    if extras or any(k in params for k in ["reason", "idempotency_key"]):
        raise ValidationError("پارامتر ناشناخته یا رزروشده است.")
    payload = dict(params)
    if "reason" in schema.fields:
        payload["reason"] = reason
    if "idempotency_key" in schema.fields:
        payload["idempotency_key"] = key
    schema = type(schema)(data=payload)
    schema.is_valid(raise_exception=True)
    data = dict(schema.validated_data)
    if command == "business_review":
        if data["decision"] not in ["approved", "changes_requested", "rejected"]:
            raise ValidationError("تصمیم معتبر نیست.")
        verification_services.review(
            actor=actor,
            business_id=target.business_id,
            kind=data["section"],
            decision=data["decision"],
            reason=reason,
        )
    elif command == "business_reopen":
        verification_services.reopen(actor=actor, business_id=target.business_id, reason=reason)
    elif command == "product_review":
        publication.transition(actor=actor, pk=target.pk, action="review", **data)
    elif command == "tariff_activate":
        logistics.activate_tariff(actor=actor, pk=target.pk, enabled=True, reason=reason)
    elif command == "retry_order":
        lifecycle.expire_order(target.pk)
        if target.status == "active":
            finance.refund_cancellation(target.pk) if getattr(
                target, "cancellation", None
            ) and target.cancellation.status == "refund_pending" else finance.settle(
                order_id=target.pk
            )
    elif command == "settle":
        finance.settle(actor=actor, order_id=target.pk, reason=reason)
    elif command == "cancellation_decide":
        if data["decision"] not in ["accept", "reject"]:
            raise ValidationError("تصمیم معتبر نیست.")
        cancellation.decide(actor=actor, pk=target.pk, operator=True, reason=reason, **data)
    elif command.startswith("shipping_"):
        fn: Any = {
            "shipping_assign": fulfillment.assign,
            "shipping_exception": fulfillment.operational_exception,
            "shipping_specification": fulfillment.review_specifications,
        }[command]
        fn(actor=actor, request_id=target.pk, **data)
    elif command == "delivery_decide":
        fulfillment.track_status(actor=actor, shipment_id=target.pk, **data)
    elif command == "dispute_decide":
        claim = get_object_or_404(DiscrepancyLine, pk=data.pop("claim_id"), case=target)
        disputes.decide(actor=actor, claim_id=claim.pk, operator=True, **data)
    elif command == "dispute_close":
        disputes.close(actor=actor, pk=target.pk)
    elif command == "ticket_reply":
        support.reply(actor=actor, pk=target.pk, **data)
    elif command == "ticket_status":
        support.transition(actor=actor, pk=target.pk, **data)
    elif command == "ticket_reopen":
        if target.status != "closed":
            raise Conflict("تیکت بسته لازم است.")
        target.status, target.closed_at, target.resolved_at = "in_review", None, None
        target.save(update_fields=["status", "closed_at", "resolved_at", "updated_at"])
    elif command == "review_moderate":
        reviews.moderate(actor=actor, pk=target.pk, **data)
    elif command.startswith("suspension_"):
        suspensions.transition(
            actor=actor, pk=target.pk, action=command.removeprefix("suspension_"), reason=reason
        )
    elif command == "disposition_decide":
        suspensions.decide(actor=actor, pk=target.pk, reason=reason, **data)


@transaction.atomic
def execute(*, actor, kind, pk, command, reason, idempotency_key, parameters=None):
    if kind == "suspension" and command in work.OWNER_COMMANDS:
        from .suspensions import lock_scope

        lock_scope(actor, pk)
    else:
        locked_actor(actor)
    require_operator(actor)
    required_reason(reason)
    if command not in work.COMMANDS.get(kind, []) and not (
        kind == "ticket" and command == "ticket_reopen"
    ):
        raise ValidationError("اقدام برای این موجودیت مجاز نیست.")
    if command in work.OWNER_COMMANDS or command == "ticket_reopen":
        require_owner(actor)
    payload_hash = digest(
        {
            "actor": str(actor.pk),
            "kind": kind,
            "pk": str(pk),
            "command": command,
            "reason": reason,
            "parameters": parameters or {},
        }
    )
    previous = OperationCommand.objects.filter(command_key=idempotency_key).first()
    if previous:
        if previous.request_hash != payload_hash:
            raise Conflict("کلید اقدام قبلاً برای درخواست دیگری استفاده شده است.")
        return previous.result
    target = work.domain_lock(kind, pk)
    work.enforce(actor, kind, pk)
    token = audit_context.set(
        {
            "role": "owner" if has_role(actor, "owner") else "operator",
            "source": "operations." + command,
            "correlation": str(idempotency_key),
        }
    )
    try:
        before = {
            "status": getattr(target, "status", ""),
            "updated_at": target.updated_at.isoformat(),
        }
        dispatch(actor, kind, target, command, parameters or {}, reason, idempotency_key)
        target.refresh_from_db()
        result = {
            "kind": kind,
            "target": str(pk),
            "command": command,
            "status": getattr(target, "status", ""),
            "completed_at": timezone.now().isoformat(),
        }
        audit(
            actor=actor,
            action="operations.command",
            target=target,
            reason=reason,
            before=before,
            after=result,
        )
        OperationCommand.objects.create(
            actor=actor,
            command_key=idempotency_key,
            request_hash=payload_hash,
            result=json.loads(json.dumps(result, cls=DjangoJSONEncoder)),
        )
        return result
    finally:
        audit_context.reset(token)
