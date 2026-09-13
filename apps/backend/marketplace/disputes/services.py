from datetime import timedelta

from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from marketplace.accounts.permissions import can_start_trade, has_role
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.finance import services as finance
from marketplace.logistics.fulfillment import visible_orders
from marketplace.logistics.models import Shipment, ShipmentItem
from marketplace.operations.models import StoredFile
from marketplace.operations.policy import value as policy_value
from marketplace.operations.services import audit, notify
from marketplace.support import services as support

from .models import CaseNote, DiscrepancyCase, DiscrepancyLine, DisputeDecision, Remedy


def lock_case(actor, pk):
    ref = (
        get_object_or_404(DiscrepancyCase, pk=pk, order__in=visible_orders(actor))
        if actor
        else get_object_or_404(DiscrepancyCase, pk=pk)
    )
    order = finance.lock_order(ref.order_id, actor)
    case = DiscrepancyCase.objects.select_for_update().get(pk=pk)
    case.order = order
    return case


def unresolved(claim):
    maker = claim.decisions.filter(source="manufacturer").first()
    decided = claim.decisions.filter(source="operator").aggregate(
        accepted=Sum("accepted"), rejected=Sum("rejected")
    )
    return (
        claim.quantity
        - (maker.accepted if maker else 0)
        - (decided["accepted"] or 0)
        - (decided["rejected"] or 0)
    )


def ensure_open(case):
    if case.closed_at:
        raise Conflict("پرونده بسته است.")


def decision_data(row):
    remedy = getattr(row, "action", None)
    shipment = getattr(remedy, "shipment", None) if remedy else None
    return {
        "id": str(row.pk),
        "actor": str(row.actor_id),
        "source": row.source,
        "accepted": row.accepted,
        "rejected": row.rejected,
        "remedy": row.remedy,
        "reason": row.reason,
        "created_at": row.created_at,
        "evidence": [str(pk) for pk in row.evidence.values_list("pk", flat=True)],
        "compensation": {
            "id": str(remedy.pk),
            "completed_at": remedy.completed_at,
            "waived_at": remedy.waived_at,
            "waiver_reason": remedy.waiver_reason,
            "financial_event": str(remedy.financial_event_id)
            if remedy.financial_event_id
            else None,
            "shipment": {
                "id": str(shipment.pk),
                "purpose": shipment.purpose,
                "status": shipment.status,
                "tracking_code": shipment.tracking_number,
                "items": [{"line": str(row.claim.line_id), "quantity": row.accepted}],
                "origin": row.claim.case.order.destination
                if shipment.purpose == "return"
                else shipment.request.group.snapshot["origin_address"],
                "destination": shipment.request.group.snapshot["origin_address"]
                if shipment.purpose == "return"
                else row.claim.case.order.destination,
            }
            if shipment
            else None,
        }
        if remedy
        else None,
    }


def claim_data(claim):
    return {
        "id": str(claim.pk),
        "line": str(claim.line_id),
        "shipment": str(claim.shipment_id),
        "quantity": claim.quantity,
        "kind": claim.kind,
        "description": claim.description,
        "evidence": [str(pk) for pk in claim.evidence.values_list("pk", flat=True)],
        "response_deadline": claim.response_deadline,
        "referred_at": claim.referred_at,
        "unresolved_quantity": unresolved(claim),
        "decisions": [decision_data(row) for row in claim.decisions.order_by("created_at", "pk")],
    }


def case_data(case):
    ticket = getattr(case, "ticket", None)
    return {
        "id": str(case.pk),
        "order": str(case.order_id),
        "closed_at": case.closed_at,
        "claim_deadline": case.order.discrepancy_deadline,
        "ticket": str(ticket.pk) if ticket else None,
        "lines": [claim_data(row) for row in case.lines.order_by("created_at", "pk")],
        "notes": [
            {
                "id": str(note.pk),
                "actor": str(note.actor_id),
                "claim": str(note.claim_id) if note.claim_id else None,
                "text": note.text,
                "created_at": note.created_at,
                "evidence": [str(pk) for pk in note.evidence.values_list("pk", flat=True)],
            }
            for note in case.notes.order_by("created_at", "pk")
        ],
    }


@transaction.atomic
def read(*, actor, pk):
    locked_actor(actor)
    return case_data(get_object_or_404(DiscrepancyCase, pk=pk, order__in=visible_orders(actor)))


@transaction.atomic
def add_claim(
    *,
    actor,
    order_id,
    line_id,
    quantity,
    kind,
    description,
    evidence,
    idempotency_key,
    shipment_id=None,
):
    order = finance.lock_order(order_id, actor, buyer=True)
    payload = dict(
        line=str(line_id),
        quantity=quantity,
        kind=kind,
        description=description,
        evidence=sorted(map(str, evidence)),
        shipment=str(shipment_id) if shipment_id else None,
    )
    prior = DiscrepancyLine.objects.filter(case__order=order, command_key=idempotency_key).first()
    if prior:
        if prior.request_hash != finance.digest(payload):
            raise Conflict("کلید ادعا متفاوت است.")
        return case_data(prior.case)
    if not can_start_trade(order.retailer):
        raise PermissionDenied()
    if (
        order.status != "active"
        or not order.delivered_at
        or not order.discrepancy_deadline
        or timezone.now() >= order.discrepancy_deadline
    ):
        raise Conflict("ثبت مغایرت فقط تا پایان ۷۲ ساعت پس از تحویل کامل مجاز است.")
    if not order.financial_events.filter(kind="payment").exists():
        raise Conflict("پرداخت معتبر سفارش لازم است.")
    line = get_object_or_404(order.lines, pk=line_id)
    finance.integer(quantity, line.quantity)
    if not quantity or kind not in ["shortage", "wrong_item", "damaged", "defective"]:
        raise ValidationError("نوع مشکل و تعداد مثبت لازم است.")
    support.require_text(description)
    shipments = Shipment.objects.filter(
        purpose="order", status="delivered", items__group_item__line=line
    ).distinct()
    if shipment_id is None:
        if shipments.count() != 1:
            raise ValidationError("مرسولهٔ دریافت‌شده را مشخص کنید.")
        shipment = shipments.get()
    else:
        shipment = get_object_or_404(shipments, pk=shipment_id)
    received = (
        ShipmentItem.objects.filter(shipment=shipment, group_item__line=line).aggregate(
            qty=Sum("quantity")
        )["qty"]
        or 0
    )
    claimed = DiscrepancyLine.objects.filter(line=line).aggregate(qty=Sum("quantity"))["qty"] or 0
    shipment_claimed = (
        DiscrepancyLine.objects.filter(line=line, shipment=shipment).aggregate(qty=Sum("quantity"))[
            "qty"
        ]
        or 0
    )
    if (
        claimed + quantity > line.quantity
        or shipment_claimed + quantity > received
        or quantity > finance.balance(order)["retained"][str(line.pk)]
    ):
        raise Conflict("تعداد ادعا از مقدار قابل‌ادعا بیشتر است.")
    files = support.attachments(
        actor=actor, ids=evidence, business=order.retailer, order=order, minimum=1
    )
    case, _ = DiscrepancyCase.objects.get_or_create(order=order)
    ensure_open(case)
    finance.set_hold(
        order_id=order.pk,
        reference=str(case.pk),
        kind="discrepancy",
        reason="پروندهٔ مغایرت باز است.",
    )
    claim = DiscrepancyLine.objects.create(
        case=case,
        line=line,
        shipment=shipment,
        quantity=quantity,
        kind=kind,
        description=description,
        command_key=idempotency_key,
        request_hash=finance.digest(payload),
        response_deadline=timezone.now()
        + timedelta(hours=policy_value("discrepancy_response_hours")),
    )
    claim.evidence.set(files)
    audit(
        actor=actor,
        action="dispute.claimed",
        target=claim,
        after={"case": str(case.pk), "quantity": quantity},
    )
    notify(
        recipient=order.manufacturer.membership.user,
        topic="dispute.claimed",
        payload={"case": str(case.pk), "claim": str(claim.pk)},
    )
    return case_data(case)


@transaction.atomic
def add_note(*, actor, pk, text, evidence=(), claim_id=None):
    case = lock_case(actor, pk)
    ensure_open(case)
    support.require_text(text)
    claim = get_object_or_404(case.lines, pk=claim_id) if claim_id else None
    files = support.attachments(
        actor=actor, ids=evidence, business=case.order.retailer, order=case.order
    )
    note = CaseNote.objects.create(case=case, claim=claim, actor=actor, text=text)
    note.evidence.set(files)
    audit(actor=actor, action="dispute.note", target=case, after={"note": str(note.pk)})
    return case_data(case)


def refer(claim):
    if unresolved(claim) == 0:
        return
    if claim.referred_at is None:
        claim.referred_at = timezone.now()
        claim.save(update_fields=["referred_at", "updated_at"])
        audit(
            actor=None,
            action="dispute.referred",
            target=claim,
            after={"quantity": unresolved(claim)},
        )
        support.referral(claim.case)


def reviewed_files(case, ids):
    if not ids or len(ids) > 10 or len(set(map(str, ids))) != len(ids):
        raise ValidationError("مدارک بررسی‌شدهٔ غیرتکراری لازم‌اند.")
    files = list(
        StoredFile.objects.filter(pk__in=ids, scan_status="clean", deleted_at__isnull=True)
        .filter(
            Q(discrepancy_lines__case=case)
            | Q(case_notes__case=case)
            | Q(ticket_messages__ticket__case=case)
        )
        .distinct()
    )
    if len(files) != len(ids):
        raise NotFound("مدرک متعلق به پرونده نیست.")
    return files


@transaction.atomic
def decide(
    *,
    actor,
    claim_id,
    accepted,
    rejected,
    reason,
    idempotency_key,
    operator=False,
    remedy="refund",
    evidence=(),
):
    ref = get_object_or_404(DiscrepancyLine, pk=claim_id, case__order__in=visible_orders(actor))
    case = lock_case(actor, ref.case_id)
    claim = DiscrepancyLine.objects.get(pk=ref.pk)
    source = "operator" if operator else "manufacturer"
    if operator:
        ticket = get_object_or_404(support.Ticket, case=case)
        support.responsible(actor, ticket)
    elif case.order.manufacturer.membership.user_id != actor.pk:
        raise NotFound()
    if not operator and remedy != "refund":
        raise ValidationError("پذیرش تولیدکننده فقط بازپرداخت دارد.")
    effective_remedy = remedy if accepted else "none"
    payload = dict(
        actor=str(actor.pk),
        source=source,
        accepted=accepted,
        rejected=rejected,
        reason=reason,
        remedy=effective_remedy,
        evidence=sorted(map(str, evidence)),
    )
    prior = claim.decisions.filter(command_key=idempotency_key).first()
    if prior:
        if prior.request_hash != finance.digest(payload):
            raise Conflict("کلید تصمیم متفاوت است.")
        return decision_data(prior)
    ensure_open(case)
    finance.integer(accepted, claim.quantity)
    finance.integer(rejected, claim.quantity)
    support.require_text(reason)
    if not accepted + rejected or effective_remedy not in [
        "none",
        "refund",
        "replacement",
        "return",
    ]:
        raise ValidationError("تعداد و راهکار معتبر لازم است.")
    if operator:
        if not claim.referred_at or accepted + rejected > unresolved(claim):
            raise Conflict("تصمیم فقط روی تعداد ارجاع‌شدهٔ حل‌نشده مجاز است.")
        files = reviewed_files(case, evidence)
    else:
        if (
            claim.referred_at
            or timezone.now() >= claim.response_deadline
            or claim.decisions.filter(source="manufacturer").exists()
        ):
            raise Conflict("پاسخ ثبت‌شده یا خارج از مهلت قابل تغییر نیست.")
        if accepted + rejected != claim.quantity:
            raise ValidationError("پاسخ باید همهٔ تعداد این ردیف را پوشش دهد.")
        files = reviewed_files(case, evidence) if evidence else []
    decision = DisputeDecision.objects.create(
        claim=claim,
        actor=actor,
        source=source,
        accepted=accepted,
        rejected=rejected,
        remedy=effective_remedy,
        reason=reason,
        command_key=idempotency_key,
        request_hash=finance.digest(payload),
    )
    decision.evidence.set(files)
    if accepted:
        action = Remedy.objects.create(decision=decision)
        if remedy == "refund":
            refund(action)
        else:
            from marketplace.logistics.remedies import create_shipment

            create_shipment(action)
    if not operator and rejected:
        refer(claim)
    audit(
        actor=actor,
        action="dispute.decided",
        target=decision,
        reason=reason,
        after={"accepted": accepted, "rejected": rejected, "remedy": effective_remedy},
    )
    notify(
        recipient=case.order.retailer.membership.user,
        topic="dispute.decided",
        payload={"case": str(case.pk), "decision": str(decision.pk)},
    )
    return decision_data(decision)


def refund(action):
    """Caller owns Order lock; financial outcome and remedy completion commit together."""
    decision = action.decision
    order = decision.claim.case.order
    if action.completed_at:
        return
    retained = dict(finance.balance(order)["retained"])
    key = str(decision.claim.line_id)
    if retained[key] < decision.accepted:
        raise Conflict("این تعداد قبلاً بازپرداخت شده است.")
    retained[key] -= decision.accepted
    outcome = finance.register_decision(
        order_id=order.pk,
        reference=str(decision.pk),
        reason=decision.reason,
        retained=retained,
        source="discrepancy",
        actor=None,
    )
    action.financial_event = finance.apply_decision(outcome.pk)
    action.completed_at = timezone.now()
    action.save(update_fields=["financial_event", "completed_at", "updated_at"])


@transaction.atomic
def remedy_progress(*, actor, pk, status, reason, evidence, tracking_code=""):
    from marketplace.logistics.remedies import progress

    ref = get_object_or_404(Remedy, pk=pk, decision__claim__case__order__in=visible_orders(actor))
    case = lock_case(actor, ref.decision.claim.case_id)
    ensure_open(case)
    ticket = get_object_or_404(support.Ticket, case=case)
    support.responsible(actor, ticket)
    files = reviewed_files(case, evidence)
    action = Remedy.objects.select_for_update().get(pk=pk)
    support.require_text(reason)
    progress(
        action, actor=actor, status=status, reason=reason, files=files, tracking_code=tracking_code
    )
    if status == "delivered" and not action.completed_at:
        if action.decision.remedy == "return":
            refund(action)
        else:
            action.completed_at = timezone.now()
            action.save(update_fields=["completed_at", "updated_at"])
    audit(
        actor=actor,
        action="dispute.remedy_progress",
        target=action,
        reason=reason,
        after={"status": status, "evidence": [str(f.pk) for f in files]},
    )
    return decision_data(action.decision)


@transaction.atomic
def waive(*, actor, pk, reason, evidence):
    from marketplace.logistics.fulfillment import transition

    ref = get_object_or_404(Remedy, pk=pk, decision__claim__case__order__in=visible_orders(actor))
    case = lock_case(actor, ref.decision.claim.case_id)
    support.responsible(actor, get_object_or_404(support.Ticket, case=case))
    ensure_open(case)
    support.require_text(reason)
    files = reviewed_files(case, evidence)
    action = Remedy.objects.get(pk=pk)
    if (
        action.completed_at
        or action.waived_at
        or not hasattr(action, "shipment")
        or action.shipment.status != "ready"
    ):
        raise Conflict("جبران اجراشده یا در مسیر قابل منتفی‌کردن نیست.")
    transition(action.shipment, "cancelled", actor=actor, reason=reason, evidence=files[0])
    action.waived_at, action.waiver_reason = timezone.now(), reason
    action.save(update_fields=["waived_at", "waiver_reason", "updated_at"])
    audit(
        actor=actor,
        action="dispute.remedy_waived",
        target=action,
        reason=reason,
        after={"evidence": [str(f.pk) for f in files]},
    )
    return decision_data(action.decision)


def close_locked(case):
    if case.closed_at:
        return True
    if timezone.now() < case.order.discrepancy_deadline or any(
        unresolved(row) for row in case.lines.all()
    ):
        return False
    if Remedy.objects.filter(
        decision__claim__case=case, completed_at__isnull=True, waived_at__isnull=True
    ).exists():
        return False
    case.closed_at = timezone.now()
    case.save(update_fields=["closed_at", "updated_at"])
    finance.set_hold(
        order_id=case.order_id,
        reference=str(case.pk),
        kind="discrepancy",
        reason="رسیدگی و جبران پرونده تکمیل شد.",
        release=True,
    )
    audit(actor=None, action="dispute.closed", target=case)
    notify(
        recipient=case.order.retailer.membership.user,
        topic="dispute.closed",
        payload={"case": str(case.pk)},
    )
    return True


@transaction.atomic
def close(*, actor, pk):
    case = lock_case(actor, pk)
    if not has_role(actor, "operator", "owner"):
        raise PermissionDenied()
    ticket = getattr(case, "ticket", None)
    if ticket:
        support.responsible(actor, ticket)
    if not close_locked(case):
        raise Conflict("مهلت ثبت، تصمیم‌ها یا جبران پرونده کامل نیست.")
    return case_data(case)


@transaction.atomic
def process_case(pk):
    case = lock_case(None, pk)
    for claim in case.lines.filter(referred_at__isnull=True, response_deadline__lte=timezone.now()):
        refer(claim)
    return close_locked(case)
