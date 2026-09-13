from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from marketplace.accounts.permissions import require_operator
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.common.pagination import StandardPagination
from marketplace.logistics.models import Shipment
from marketplace.logistics.services import lock_services
from marketplace.operations.policy import value as policy_value
from marketplace.operations.services import audit, notify

from .checkout import order_data
from .lifecycle import owned_order
from .models import CancellationRequest, Order, Reservation
from .services import cancel_fulfillment


def unsent(order):
    if Shipment.objects.filter(request__group__order=order, handed_over_at__isnull=False).exists():
        raise Conflict("پس از ارسال، مسیر مغایرت/مرجوعی لازم است.")


def request_paid_cancellation(*, order, actor, reason):
    if order.status != "active" or not order.paid_at:
        raise Conflict("سفارش قابل لغو نیست.")
    unsent(order)
    existing = CancellationRequest.objects.filter(order=order).first()
    if existing:
        return existing
    request = CancellationRequest.objects.create(
        order=order,
        reason=reason,
        status="pending" if order.preparation_started_at else "refund_pending",
        deadline=timezone.now() + timedelta(hours=policy_value("cancellation_hours"))
        if order.preparation_started_at
        else None,
    )
    audit(
        actor=actor,
        action="order.cancellation_requested",
        target=request,
        reason=reason,
        after={"status": request.status},
    )
    notify(
        recipient=order.manufacturer.membership.user,
        topic="order.cancellation_requested",
        payload={"order": str(order.pk)},
    )
    return request


def refer_expired(request):
    if request.status == "pending" and request.deadline <= timezone.now():
        request.status = "referred"
        request.save(update_fields=["status", "updated_at"])
        audit(
            actor=None,
            action="order.cancellation_referred",
            target=request,
            reason="مهلت پاسخ پایان یافت.",
        )
        notify(
            recipient=request.order.retailer.membership.user,
            topic="order.cancellation_referred",
            payload={"order": str(request.order_id)},
        )
        return True
    return False


@transaction.atomic
def decide(*, actor, pk, decision, reason="", operator=False):
    if operator:
        actor = locked_actor(actor)
        require_operator(actor)
        lock_services()
        order = get_object_or_404(Order.objects.select_for_update(), pk=pk)
        from marketplace.operations.work import enforce

        enforce(actor, "order", pk)
    else:
        order = owned_order(actor, pk, "manufacturer")
    request = get_object_or_404(CancellationRequest, order=order)
    refer_expired(request)
    expected = "referred" if operator else "pending"
    target = "refund_pending" if decision == "accept" else "denied" if operator else "referred"
    if request.status == target:
        return order_data(order)
    if request.status != expected:
        return order_data(order) if request.status == "referred" else conflict()
    if not reason.strip() and (operator or decision == "reject"):
        raise ValidationError("دلیل تصمیم لازم است.")
    if target == "refund_pending":
        unsent(order)
    request.status, request.decision_reason = target, reason
    request.save(update_fields=["status", "decision_reason", "updated_at"])
    audit(actor=actor, action=f"order.cancellation_{target}", target=request, reason=reason)
    notify(
        recipient=order.retailer.membership.user,
        topic=f"order.cancellation_{target}",
        payload={"order": str(order.pk)},
    )
    return order_data(Order.objects.get(pk=order.pk))


def conflict():
    raise Conflict("درخواست در انتظار این تصمیم نیست.")


@transaction.atomic
def complete_refund(*, order_id, refund_reference):
    """PRD-05 calls in the SAME transaction as full refund and commission reversal."""
    lock_services()
    order = Order.objects.select_for_update().get(pk=order_id)
    request = get_object_or_404(CancellationRequest, order=order)
    if request.status == "completed":
        if str(request.refund_reference) != str(refund_reference):
            raise Conflict("مرجع بازپرداخت متفاوت است.")
        return order
    if request.status != "refund_pending":
        raise Conflict("بازپرداخت لغو مجاز نشده است.")
    unsent(order)
    order = cancel_fulfillment(order_id=order.pk, reason=request.reason)
    Reservation.objects.filter(line__order=order, status__in=["reserved", "allocated"]).update(
        status="released"
    )
    request.status, request.refund_reference = "completed", refund_reference
    request.save(update_fields=["status", "refund_reference", "updated_at"])
    audit(
        actor=None,
        action="order.cancellation_completed",
        target=request,
        after={"refund_reference": str(refund_reference)},
    )
    return order


@transaction.atomic
def expire_cancellation(order_id):
    lock_services()
    order = Order.objects.select_for_update().get(pk=order_id)
    return refer_expired(CancellationRequest.objects.get(order=order))


@transaction.atomic
def queue(*, actor, request=None):
    actor = locked_actor(actor)
    require_operator(actor)
    query = CancellationRequest.objects.filter(status="referred")
    query = query.select_related("order").order_by("created_at", "pk")
    if request is None:
        return [order_data(row.order) for row in query[:100]]
    pagination = StandardPagination()
    page = pagination.paginate_queryset(query, request)
    assert page is not None
    return pagination.get_paginated_response([order_data(row.order) for row in page]).data
