from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from marketplace.accounts.models import Business
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.common.pagination import StandardPagination
from marketplace.logistics.services import lock_services
from marketplace.operations.policy import value as policy_value
from marketplace.operations.services import audit, notify

from .checkout import group_data, order_data
from .inventory import release
from .models import Order, OrderGroup


def owned_order(actor, pk, party):
    actor = locked_actor(actor)
    business = get_object_or_404(Business.objects.select_for_update(), membership__user=actor)
    lock_services()
    return get_object_or_404(Order.objects.select_for_update(), pk=pk, **{party: business})


def finish_unpaid(order, status, reason, actor=None):
    release(order)
    order.status = status
    order.decision_reason = reason
    order.save(update_fields=["status", "decision_reason", "updated_at"])
    audit(actor=actor, action=f"order.{status}", target=order, reason=reason)
    notify(
        recipient=order.retailer.membership.user,
        topic=f"order.{status}",
        payload={"order": str(order.pk)},
    )


def expire_locked(order):
    if (
        order.status in ["pending", "accepted"]
        and order.group_id
        and (order.retailer.status == "suspended" or order.manufacturer.status == "suspended")
    ):
        finish_unpaid(order, "cancelled", "یکی از طرف‌های سفارش تعلیق شده است.")
        return True
    deadline = (
        order.response_deadline
        if order.status == "pending"
        else order.payment_deadline
        if order.status == "accepted"
        else None
    )
    if deadline is not None and timezone.now() >= deadline:
        finish_unpaid(order, "expired", "مهلت سفارش پایان یافت.")
        return True
    return False


@transaction.atomic
def respond(*, actor, pk, decision, reason=""):
    order = owned_order(actor, pk, "manufacturer")
    target = "accepted" if decision == "accept" else "rejected"
    if order.status == target:
        return order_data(order)
    if expire_locked(order):
        return order_data(order)
    if order.status != "pending":
        raise Conflict("سفارش در انتظار پاسخ نیست.")
    if decision == "reject":
        if not reason.strip():
            raise ValidationError("دلیل رد لازم است.")
        finish_unpaid(order, "rejected", reason, actor)
    else:
        order.status = "accepted"
        order.payment_deadline = timezone.now() + timedelta(hours=policy_value("payment_hours"))
        order.save(update_fields=["status", "payment_deadline", "updated_at"])
        audit(actor=actor, action="order.accepted", target=order)
        notify(
            recipient=order.retailer.membership.user,
            topic="order.accepted",
            payload={"order": str(order.pk)},
        )
    return order_data(order)


@transaction.atomic
def cancel(*, actor, pk, reason):
    order = owned_order(actor, pk, "retailer")
    if order.status == "cancelled":
        return order_data(order)
    if order.status not in ["pending", "accepted"] or order.paid_at:
        from .cancellation import request_paid_cancellation

        request_paid_cancellation(order=order, actor=actor, reason=reason)
        return order_data(Order.objects.get(pk=order.pk))
    finish_unpaid(order, "cancelled", reason, actor)
    return order_data(order)


@transaction.atomic
def expire_order(pk):
    lock_services()
    order = Order.objects.select_for_update().get(pk=pk)
    return expire_locked(order)


@transaction.atomic
def order_list(*, actor, request=None):
    actor = locked_actor(actor)
    query = Order.objects.filter(
        Q(retailer__membership__user=actor) | Q(manufacturer__membership__user=actor)
    ).order_by("-created_at", "pk")
    if request is None:
        return [order_data(order) for order in query[:100]]
    pagination = StandardPagination()
    page = pagination.paginate_queryset(query, request)
    assert page is not None
    return pagination.get_paginated_response([order_data(order) for order in page]).data


@transaction.atomic
def read_order(*, actor, pk):
    actor = locked_actor(actor)
    order = get_object_or_404(
        Order.objects.filter(
            Q(retailer__membership__user=actor) | Q(manufacturer__membership__user=actor)
        ),
        pk=pk,
    )
    return order_data(order)


@transaction.atomic
def read_group(*, actor, pk):
    actor = locked_actor(actor)
    return group_data(get_object_or_404(OrderGroup, pk=pk, retailer__membership__user=actor))


@transaction.atomic
def reorder(*, actor, pk, confirm_method_change=False):
    from . import cart

    order = owned_order(actor, pk, "retailer")
    if order.status not in ["rejected", "expired"] or not order.commercial:
        raise Conflict("افزودن دوباره فقط برای سفارش رد یا منقضی‌شده مجاز است.")
    for product in order.commercial["products"]:
        cart.select_product(
            actor=actor,
            product_id=product["product"],
            data={**product["selection"], "confirm_method_change": confirm_method_change},
            add=True,
        )
    return cart.read_cart(actor=actor)
