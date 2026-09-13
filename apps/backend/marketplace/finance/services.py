"""Atomic financial commands. Domain hooks are trusted in-process, never public callbacks."""

import hashlib
import json
from uuid import NAMESPACE_URL, UUID, uuid5

from django.conf import settings
from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.accounts.models import Business
from marketplace.accounts.permissions import can_start_trade, has_role, require_owner
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.logistics.services import lock_services
from marketplace.operations.services import audit, notify
from marketplace.orders.models import CancellationRequest, Order
from marketplace.orders.services import accept_payment

from .models import (
    CommissionRate,
    CompensationDecision,
    FinanceHold,
    FinancialEvent,
    Invoice,
    LedgerEntry,
)


def fee(goods, bps):
    return ((goods * bps + 50000) // 100000) * 10


def rates():
    row = CommissionRate.objects.order_by("-created_at", "-pk").first()
    return (
        {"retailer_bps": row.retailer_bps, "manufacturer_bps": row.manufacturer_bps}
        if row
        else {
            "retailer_bps": getattr(settings, "RETAILER_COMMISSION_BPS", 200),
            "manufacturer_bps": getattr(settings, "MANUFACTURER_COMMISSION_BPS", 200),
        }
    )


@transaction.atomic
def change_rates(*, actor, retailer_bps, manufacturer_bps, reason):
    actor = locked_actor(actor)
    require_owner(actor)
    required_reason(reason)
    # Shared with checkout/preview: rate activation cannot split their snapshots.
    lock_services()
    for value in [retailer_bps, manufacturer_bps]:
        integer(value, 10000)
    before = rates()
    row = CommissionRate.objects.create(
        actor=actor, reason=reason, retailer_bps=retailer_bps, manufacturer_bps=manufacturer_bps
    )
    audit(
        actor=actor,
        action="finance.rates_changed",
        target=row,
        reason=reason,
        before=before,
        after=rates(),
    )
    return rates()


def required_reason(reason):
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 2000:
        raise ValidationError("دلیل معتبر لازم است.")


def integer(value, maximum=10**18):
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValidationError("مقدار باید عدد صحیح نامنفی و در محدودهٔ مجاز باشد.")
    return value


def lock_order(pk, actor=None, owner=False, buyer=False):
    if actor is not None:
        actor = locked_actor(actor)
        if owner:
            require_owner(actor)
    query = Order.objects.all()
    if buyer:
        query = query.filter(retailer__membership__user=actor)
    ref = get_object_or_404(query, pk=pk)
    list(
        Business.objects.select_for_update()
        .filter(pk__in=[ref.retailer_id, ref.manufacturer_id])
        .order_by("pk")
    )
    lock_services()
    return Order.objects.select_for_update().get(pk=ref.pk)


def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


def replay(order, kind, key, payload):
    previous = FinancialEvent.objects.filter(order=order, kind=kind, idempotency_key=key).first()
    if previous and previous.request_hash != digest(payload):
        raise Conflict("کلید فرمان با درخواست قبلی متفاوت است.")
    return previous


def initial(order):
    c = order.commercial
    try:
        amounts = {
            "goods": c["goods_total_irr"],
            "retailer_fee": c["retailer_commission_irr"],
            "manufacturer_fee": c["manufacturer_commission_irr"],
            "shipping": c["shipping_amount_irr"],
            "total": c["payable_total_irr"],
        }
        for value in amounts.values():
            integer(value)
        for party in ["retailer", "manufacturer"]:
            integer(c[f"{party}_commission_bps"], 10000)
            if amounts[f"{party}_fee"] != fee(amounts["goods"], c[f"{party}_commission_bps"]):
                raise ValueError
        lines = list(order.lines.all())
        groups = {str(g.pk): g.amount_irr for g in order.shipping_groups.all()}
        if (
            c["currency"] != "IRR"
            or amounts["manufacturer_fee"] > amounts["goods"]
            or not lines
            or not groups
            or sum(integer(line.commercial["unit_price_irr"]) * line.quantity for line in lines)
            != amounts["goods"]
            or sum(groups.values()) != amounts["shipping"]
            or amounts["total"] != amounts["goods"] + amounts["retailer_fee"] + amounts["shipping"]
        ):
            raise ValueError
    except (KeyError, TypeError, ValueError) as exc:
        raise Conflict("snapshot مالی سفارش معتبر نیست.") from exc
    return {
        **amounts,
        "retained": {str(line.pk): line.quantity for line in lines},
        "shipping_groups": groups,
    }


def balance(order):
    event = (
        FinancialEvent.objects.filter(order=order)
        .filter(kind__in=["payment", "refund", "adjustment"])
        .order_by("-created_at", "-pk")
        .first()
    )
    return event.snapshot if event else initial(order)


def record(order, kind, key, payload, reference, reason, actor, amounts, snapshot):
    event = FinancialEvent.objects.create(
        order=order,
        kind=kind,
        idempotency_key=key,
        request_hash=digest(payload),
        reference=reference,
        reason=reason,
        actor=actor,
        snapshot=snapshot,
        **{f"{k}_irr": v for k, v in amounts.items()},
    )
    audit(
        actor=actor,
        action=f"finance.{kind}",
        target=event,
        reason=reason,
        before=payload.get("before", {}),
        after=snapshot,
    )
    notify(
        recipient=order.retailer.membership.user,
        topic=f"finance.{kind}",
        payload={"order": str(order.pk), "event": str(event.pk)},
    )
    return event


def document(event, original=None):
    return Invoice.objects.create(
        event=event,
        original=original,
        number=f"{'ADJ' if original else 'INV'}-{event.pk.hex}",
        lines=[
            {"kind": "goods", "amount_irr": event.goods_irr},
            {"kind": "retailer_commission", "amount_irr": event.retailer_fee_irr},
            {"kind": "shipping", "amount_irr": event.shipping_irr},
        ],
    )


def post(event, amounts, shipping, sign=1):
    rows = [
        ("cash", -amounts["total"], None),
        ("producer_payable", amounts["goods"] - amounts["manufacturer_fee"], None),
        ("commission_reserved", amounts["retailer_fee"] + amounts["manufacturer_fee"], None),
    ]
    rows.extend(("logistics", amount, pk) for pk, amount in shipping.items())
    LedgerEntry.objects.bulk_create(
        [
            LedgerEntry(
                event=event, account=account, amount_irr=amount * sign, shipping_group_id=pk
            )
            for account, amount, pk in rows
        ]
    )


@transaction.atomic
def pay(*, actor, pk, idempotency_key):
    order = lock_order(pk, actor, buyer=True)
    if not all(can_start_trade(b) for b in [order.retailer, order.manufacturer]):
        raise PermissionDenied()
    payload = {"order": str(order.pk), "actor": str(actor.pk)}
    previous = replay(order, "payment", idempotency_key, payload)
    if previous:
        return previous
    if (
        order.payment_reference
        or order.status != "accepted"
        or not order.payment_deadline
        or timezone.now() >= order.payment_deadline
    ):
        raise Conflict("سفارش در مهلت معتبر پرداخت نیست.")
    snapshot = initial(order)
    amounts = {
        k: snapshot[k] for k in ["goods", "retailer_fee", "manufacturer_fee", "shipping", "total"]
    }
    event = record(
        order,
        "payment",
        idempotency_key,
        payload,
        str(idempotency_key),
        "تأیید و پرداخت",
        actor,
        amounts,
        snapshot,
    )
    document(event)
    post(event, amounts, snapshot["shipping_groups"])
    accept_payment(order_id=order.pk, payment_reference=event.pk)
    return event


@transaction.atomic
def register_decision(
    *,
    order_id,
    reference,
    reason,
    retained,
    refunded_groups=(),
    source="discrepancy",
    actor=None,
    goods_override_irr=None,
):
    """Trusted PRD-06 hook: caller validates its persisted final decision and owns its transaction.

    Quantities are the cumulative retained outcome; groups must be wholly cancelled,
    unused or undelivered according to that decision. No operator amount input exists.
    """
    order = lock_order(order_id, actor, owner=source == "manual")
    required_reason(reason)
    if (
        source not in ["cancellation", "discrepancy", "manual"]
        or not reference
        or len(reference) > 200
    ):
        raise ValidationError("مرجع تصمیم معتبر لازم است.")
    if source == "manual" and actor is None:
        raise PermissionDenied()
    if goods_override_irr is not None and source != "manual":
        raise PermissionDenied()
    retained = {str(k): v for k, v in retained.items()}
    groups = sorted(str(g) for g in refunded_groups)
    data = dict(
        source=source,
        reason=reason,
        retained=retained,
        refunded_groups=groups,
        goods_override_irr=goods_override_irr,
        actor_id=actor.pk if actor else None,
    )
    existing = CompensationDecision.objects.filter(order=order, reference=reference).first()
    if existing:
        if any(getattr(existing, k) != v for k, v in data.items()):
            raise Conflict("مرجع تصمیم قبلاً استفاده شده است.")
        return existing
    if (
        not FinancialEvent.objects.filter(order=order).filter(kind="payment").exists()
        or FinancialEvent.objects.filter(order=order).filter(kind="settlement").exists()
    ):
        raise Conflict("سفارش قابل تعدیل نیست.")
    old = balance(order)
    if set(retained) != set(old["retained"]):
        raise ValidationError("نتیجهٔ تمام اقلام لازم است.")
    for pk, quantity in retained.items():
        integer(quantity, old["retained"][pk])
    if len(groups) != len(set(groups)) or set(groups) - set(old["shipping_groups"]):
        raise ValidationError("گروه حمل معتبر نیست.")
    for group in order.shipping_groups.filter(pk__in=groups).prefetch_related("items"):
        if any(retained[str(item.line_id)] for item in group.items.all()):
            raise ValidationError("بازپرداخت حمل تنها برای کل گروه مجاز است.")
    if source == "cancellation" and (
        any(retained.values())
        or not CancellationRequest.objects.filter(
            order=order, status="refund_pending", pk=reference
        ).exists()
    ):
        raise Conflict("تصمیم لغو معتبر نیست.")
    if goods_override_irr is not None:
        integer(goods_override_irr, old["goods"])
    decision = CompensationDecision.objects.create(order=order, reference=reference, **data)
    audit(
        actor=actor,
        action="finance.decision_recorded",
        target=decision,
        reason=reason,
        before=old,
        after={
            "retained": retained,
            "refunded_groups": groups,
            "goods_override_irr": goods_override_irr,
        },
    )
    return decision


@transaction.atomic
def apply_decision(decision_id):
    ref = get_object_or_404(CompensationDecision, pk=decision_id)
    order = lock_order(ref.order_id)
    kind = "adjustment" if ref.goods_override_irr is not None else "refund"
    existing = (
        FinancialEvent.objects.filter(order=order).filter(kind=kind, reference=str(ref.pk)).first()
    )
    if existing:
        return existing
    if FinancialEvent.objects.filter(order=order).filter(kind="settlement").exists():
        raise Conflict("سفارش تسویه شده است.")
    old = balance(order)
    for pk, quantity in ref.retained.items():
        integer(quantity, old["retained"][pk])
    goods = sum(
        line.commercial["unit_price_irr"] * ref.retained[str(line.pk)] for line in order.lines.all()
    )
    if ref.goods_override_irr is not None:
        goods = ref.goods_override_irr
    integer(goods, old["goods"])
    groups = dict(old["shipping_groups"])
    returned = set(ref.refunded_groups)
    if goods == 0 and not any(ref.retained.values()):
        returned = set(groups)
    shipping_delta = {g: groups.pop(g) for g in returned if g in groups}
    new = {
        "goods": goods,
        "retailer_fee": fee(goods, order.commercial["retailer_commission_bps"]),
        "manufacturer_fee": fee(goods, order.commercial["manufacturer_commission_bps"]),
        "shipping": sum(groups.values()),
        "retained": ref.retained,
        "shipping_groups": groups,
    }
    integer(new["goods"] - new["manufacturer_fee"])
    new["total"] = new["goods"] + new["retailer_fee"] + new["shipping"]
    delta = {
        k: integer(old[k] - new[k])
        for k in ["goods", "retailer_fee", "manufacturer_fee", "shipping", "total"]
    }
    event = record(
        order,
        kind,
        ref.pk,
        {"decision": str(ref.pk), "before": old},
        str(ref.pk),
        ref.reason,
        ref.actor,
        delta,
        new,
    )
    document(event, FinancialEvent.objects.filter(order=order).get(kind="payment").document)
    post(event, delta, shipping_delta, -1)
    if ref.source == "cancellation":
        from marketplace.orders.cancellation import complete_refund

        complete_refund(order_id=order.pk, refund_reference=event.pk)
    return event


@transaction.atomic
def refund_cancellation(order_id):
    order = lock_order(order_id)
    request = get_object_or_404(
        CancellationRequest, order=order, status__in=["refund_pending", "completed"]
    )
    existing = CompensationDecision.objects.filter(
        order=order, source="cancellation", reference=str(request.pk)
    ).first()
    if existing:
        return apply_decision(existing.pk)
    decision = register_decision(
        order_id=order.pk,
        reference=str(request.pk),
        reason=request.reason,
        source="cancellation",
        retained={str(line.pk): 0 for line in order.lines.all()},
    )
    return apply_decision(decision.pk)


@transaction.atomic
def manual_refund(
    *, actor, pk, idempotency_key, reason, retained, refunded_groups=(), goods_override_irr=None
):
    lock_order(pk, actor, owner=True)
    decision = register_decision(
        order_id=pk,
        reference=f"manual:{idempotency_key}",
        reason=reason,
        retained=retained,
        refunded_groups=refunded_groups,
        source="manual",
        actor=actor,
        goods_override_irr=goods_override_irr,
    )
    return apply_decision(decision.pk)


@transaction.atomic
def set_hold(*, order_id, reference, kind, reason, release=False):
    """PRD-06/08 must call atomically with opening/closing their domain case."""
    order = lock_order(order_id)
    required_reason(reason)
    if kind not in ["discrepancy", "suspension", "operational"] or not reference:
        raise ValidationError("مرجع توقف معتبر نیست.")
    if FinancialEvent.objects.filter(order=order).filter(kind="settlement").exists():
        raise Conflict("سفارش تسویه شده است.")
    hold, created = FinanceHold.objects.get_or_create(
        order=order, reference=reference, defaults={"kind": kind, "reason": reason}
    )
    if release and created:
        raise Conflict("توقف ثبت‌شده برای رفع لازم است.")
    if not release and hold.released_at is not None:
        raise Conflict("توقف بسته شده است؛ پروندهٔ تازه مرجع تازه می‌خواهد.")
    if hold.kind != kind:
        raise Conflict("مرجع توقف متفاوت است.")
    if release and hold.released_at is None:
        hold.released_at = timezone.now()
        hold.save(update_fields=["released_at", "updated_at"])
        audit(actor=None, action="finance.hold_released", target=hold, reason=reason)
    elif created:
        audit(actor=None, action="finance.hold_opened", target=hold, reason=reason)
    return hold


def hold_reasons(order):
    reasons = list(
        order.finance_holds.filter(released_at__isnull=True).values_list("reason", flat=True)
    )
    case = getattr(order, "discrepancy", None)
    if case and not case.closed_at:
        reasons.append("پروندهٔ مغایرت هنوز بسته نشده است")
    from marketplace.operations.suspensions import permitted_to_continue

    if any(
        b.status == "suspended" or not b.membership.user.is_active or b.membership.user.is_suspended
        for b in [order.retailer, order.manufacturer]
    ) and not permitted_to_continue(order):
        reasons.append("تعلیق مؤثر طرف سفارش")
    if (
        order.shipping_groups.exclude(request__status__in=["completed", "cancelled"])
        .filter(
            Q(request__status__in=["attention", "spec_review"])
            | (Q(request__isnull=False) & ~Q(request__hold_reason=""))
        )
        .exists()
    ):
        reasons.append("پروندهٔ عملیاتی حمل باز است")
    if CancellationRequest.objects.filter(
        order=order, status__in=["pending", "referred", "refund_pending"]
    ).exists():
        reasons.append("درخواست لغو باز است")
    if (
        CompensationDecision.objects.filter(order=order)
        .exclude(
            pk__in=FinancialEvent.objects.filter(order=order)
            .filter(kind__in=["refund", "adjustment"])
            .values("idempotency_key")
        )
        .exists()
    ):
        reasons.append("جبران مالی پردازش نشده است")
    return reasons


def retained_delivered(order, snapshot):
    from marketplace.logistics.models import ShipmentItem

    delivered = dict(
        ShipmentItem.objects.filter(
            group_item__group__order=order, shipment__status="delivered", shipment__purpose="order"
        )
        .values("group_item__line_id")
        .annotate(quantity=Sum("quantity"))
        .values_list("group_item__line_id", "quantity")
    )
    return all(
        delivered.get(UUID(pk), 0) >= quantity for pk, quantity in snapshot["retained"].items()
    )


@transaction.atomic
def settle(*, order_id, actor=None, reason="تسویهٔ نهایی سفارش"):
    order = lock_order(order_id, actor, owner=actor is not None)
    required_reason(reason)
    previous = FinancialEvent.objects.filter(order=order).filter(kind="settlement").first()
    if previous:
        return previous
    if (
        not FinancialEvent.objects.filter(order=order).filter(kind="payment").exists()
        or order.status != "active"
    ):
        raise Conflict("سفارش پرداخت‌شدهٔ فعال لازم است.")
    cases_closed = (
        order.finance_holds.filter(kind="discrepancy").exists()
        and not order.finance_holds.filter(kind="discrepancy", released_at__isnull=True).exists()
    )
    snapshot = balance(order)
    delivered_in_full = bool(order.delivered_at and order.discrepancy_deadline)
    deadline_closed = delivered_in_full and timezone.now() >= order.discrepancy_deadline
    compensation_closed = cases_closed and (
        delivered_in_full or retained_delivered(order, snapshot)
    )
    if not (deadline_closed or compensation_closed) or hold_reasons(order):
        raise Conflict("شرایط تسویه کامل نیست.")
    amounts = {k: snapshot[k] for k in ["goods", "retailer_fee", "manufacturer_fee"]}
    amounts.update(shipping=0, total=snapshot["goods"] - snapshot["manufacturer_fee"])
    event = record(
        order,
        "settlement",
        uuid5(NAMESPACE_URL, f"settlement:{order.pk}"),
        {"before": snapshot},
        str(order.pk),
        reason,
        actor,
        amounts,
        snapshot,
    )
    from marketplace.orders.services import complete_financial_cycle

    complete_financial_cycle(order_id=order.pk, settlement_reference=event.pk)
    revenue = snapshot["retailer_fee"] + snapshot["manufacturer_fee"]
    LedgerEntry.objects.bulk_create(
        [
            LedgerEntry(event=event, account=a, amount_irr=v)
            for a, v in [
                ("cash", amounts["total"]),
                ("producer_payable", -amounts["total"]),
                ("commission_reserved", -revenue),
                ("commission_revenue", revenue),
            ]
        ]
    )
    return event


def amount_data(snapshot):
    return {
        **{
            f"{key}_irr": snapshot[key]
            for key in ["goods", "retailer_fee", "manufacturer_fee", "shipping", "total"]
        },
        "manufacturer_payable_irr": snapshot["goods"] - snapshot["manufacturer_fee"],
        "retained": snapshot["retained"],
        "shipping_groups": [
            {"group": pk, "amount_irr": amount}
            for pk, amount in snapshot["shipping_groups"].items()
        ],
    }


@transaction.atomic
def read_finance(*, actor, pk):
    actor = locked_actor(actor)
    query = Order.objects.all()
    if not has_role(actor, "operator", "owner"):
        query = query.filter(
            Q(retailer__membership__user=actor, retailer__status__in=["verified", "suspended"])
            | Q(
                manufacturer__membership__user=actor,
                manufacturer__status__in=["verified", "suspended"],
            )
        )
    order = get_object_or_404(query, pk=pk)
    if has_role(actor, "operator") and not has_role(actor, "owner"):
        from marketplace.operations.work import assigned_order

        if not assigned_order(actor, order):
            raise PermissionDenied("اطلاعات مالی فقط در پروندهٔ واگذارشده قابل مشاهده است.")
    events = []
    for event in FinancialEvent.objects.filter(order=order).order_by("created_at", "pk"):
        doc = getattr(event, "document", None)
        events.append(
            {
                "id": str(event.pk),
                "kind": event.kind,
                "amount_irr": event.total_irr,
                "reason": event.reason,
                "created_at": event.created_at,
                "document": {
                    "number": doc.number,
                    "original": doc.original.number if doc.original else None,
                    "lines": doc.lines,
                }
                if doc
                else None,
            }
        )
    return {
        "order": str(order.pk),
        "currency": "IRR",
        "original": amount_data(initial(order)),
        "net": amount_data(balance(order)),
        "retailer_commission_bps": order.commercial["retailer_commission_bps"],
        "manufacturer_commission_bps": order.commercial["manufacturer_commission_bps"],
        "events": events,
        "holds": hold_reasons(order),
        "commission_status": "final"
        if FinancialEvent.objects.filter(order=order).filter(kind="settlement").exists()
        else "reserved"
        if events
        else "pending",
    }
