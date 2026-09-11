"""Trusted in-process integration hooks; no API may claim payment or allocation here."""

from django.db import transaction
from django.utils import timezone

from marketplace.common.exceptions import Conflict
from marketplace.operations.services import audit

from .models import Order


@transaction.atomic
def accept_payment(*, order_id, payment_reference):
    """PRD-05 calls inside its payment + reservation-finalization transaction.

    The caller owns payment authorization, amount checks and allocation. This
    hook records that fact and creates requests; it never charges or reserves.
    """
    from marketplace.logistics.fulfillment import record_event
    from marketplace.logistics.models import ShippingRequest
    from marketplace.logistics.services import lock_services

    from .models import Reservation

    lock_services()
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.payment_reference:
        if str(order.payment_reference) != str(payment_reference):
            raise Conflict("پرداخت دیگری قبلاً به این سفارش متصل شده است.")
        return order
    if order.status != "accepted":
        raise Conflict("سفارش در انتظار پرداخت نیست.")
    if order.payment_deadline and timezone.now() >= order.payment_deadline:
        raise Conflict("مهلت پرداخت پایان یافته است.")
    if order.group_id:
        if order.retailer.status == "suspended" or order.manufacturer.status == "suspended":
            raise Conflict("سفارش طرف تعلیق‌شده قابل پرداخت نیست.")
        reservations = Reservation.objects.filter(line__order=order, status="reserved")
        if reservations.count() != order.lines.count():
            raise Conflict("رزرو معتبر تمام اقلام لازم است.")
        reservations.update(status="allocated")
    lines = {line.pk: line.quantity for line in order.lines.all()}
    groups = list(order.shipping_groups.prefetch_related("items"))
    grouped = {item.line_id: item.quantity for group in groups for item in group.items.all()}
    if not lines or lines != grouped:
        raise Conflict("snapshot تمام اقلام حمل لازم است.")
    order.status, order.paid_at, order.payment_reference = (
        "active",
        timezone.now(),
        payment_reference,
    )
    order.save(update_fields=["status", "paid_at", "payment_reference", "updated_at"])
    for group in groups:
        request, created = ShippingRequest.objects.get_or_create(group=group)
        if created:
            record_event(
                request,
                None,
                "request.created",
                after={"status": request.status},
                actor_kind="system",
            )
    audit(
        actor=None,
        action="order.payment_applied",
        target=order,
        after={"payment_reference": str(payment_reference)},
    )
    return order


@transaction.atomic
def cancel_fulfillment(*, order_id, reason):
    """Only after PRD-04 authorizes cancellation and coordinates the financial outcome.

    After preparation starts the caller must obtain the required producer/operator
    decision. No direct cancellation is allowed once physical shipping has begun.
    """
    from marketplace.logistics.fulfillment import record_event, required_reason

    required_reason(reason)
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status == "cancelled":
        return order
    requests = list(order.shipping_groups.values_list("request__id", flat=True))
    from marketplace.logistics.models import Shipment, ShippingRequest

    if Shipment.objects.filter(request_id__in=requests, handed_over_at__isnull=False).exists():
        raise Conflict("پس از ارسال، مسیر مغایرت/مرجوعی لازم است.")
    for request in ShippingRequest.objects.filter(pk__in=requests):
        for shipment in request.shipments.exclude(status="cancelled"):
            before = {"status": shipment.status}
            shipment.status = "cancelled"
            shipment.save(update_fields=["status", "updated_at"])
            record_event(
                request,
                None,
                "shipment.cancelled",
                shipment=shipment,
                reason=reason,
                before=before,
                after={"status": "cancelled"},
                actor_kind="system",
            )
        before = {"status": request.status}
        request.status = "cancelled"
        request.save(update_fields=["status", "updated_at"])
        record_event(
            request,
            None,
            "request.cancelled",
            reason=reason,
            before=before,
            after={"status": "cancelled"},
            actor_kind="system",
        )
    order.status = "cancelled"
    order.save(update_fields=["status", "updated_at"])
    audit(actor=None, action="order.fulfillment_cancelled", target=order, reason=reason)
    return order


@transaction.atomic
def complete_financial_cycle(*, order_id, settlement_reference):
    """Finance owns eligibility and calls with its settlement event in the same transaction."""
    from marketplace.finance.models import FinancialEvent

    order = Order.objects.select_for_update().get(pk=order_id)
    if not FinancialEvent.objects.filter(
        pk=settlement_reference, order=order, kind="settlement"
    ).exists():
        raise Conflict("رویداد تسویهٔ معتبر لازم است.")
    if order.status == "completed":
        return order
    if order.status != "active":
        raise Conflict("سفارش فعال لازم است.")
    order.status, order.completed_at = "completed", timezone.now()
    order.save(update_fields=["status", "completed_at", "updated_at"])
    audit(
        actor=None,
        action="order.completed",
        target=order,
        after={"settlement_reference": str(settlement_reference)},
    )
    return order
