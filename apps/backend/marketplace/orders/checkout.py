import hashlib
import json
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from marketplace.accounts.models import Business
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.logistics.grouping import freeze_shipping
from marketplace.operations.policy import value as policy_value
from marketplace.operations.services import audit, notify

from . import cart
from .models import Cart, Order, OrderGroup, OrderLine, Reservation


def group_data(group):
    return {
        "id": str(group.pk),
        "cart": str(group.cart_id),
        "orders": [order_data(order) for order in group.orders.order_by("manufacturer_id")],
    }


def order_data(order):
    cancellation = getattr(order, "cancellation", None)
    return {
        "cancellation": {
            "status": cancellation.status,
            "reason": cancellation.reason,
            "decision_reason": cancellation.decision_reason,
            "deadline": cancellation.deadline,
        }
        if cancellation
        else None,
        "id": str(order.pk),
        "group": str(order.group_id) if order.group_id else None,
        "manufacturer": str(order.manufacturer_id),
        "retailer": str(order.retailer_id),
        "status": order.status,
        "completed_at": order.completed_at,
        "destination": order.destination,
        "commercial": order.commercial,
        "response_deadline": order.response_deadline,
        "payment_deadline": order.payment_deadline,
        "decision_reason": order.decision_reason,
        "lines": [
            {
                "id": str(line.pk),
                "variant": str(line.variant_id),
                "sku": line.sku,
                "quantity": line.quantity,
                "production_quantity": line.production_quantity,
                "lead_time_days": line.lead_time_days,
                "commercial": line.commercial,
            }
            for line in order.lines.order_by("pk")
        ],
    }


@transaction.atomic
def submit(*, actor, cart_id, idempotency_key, quote_fingerprint):
    actor = locked_actor(actor)
    retailer = get_object_or_404(Business.objects.all(), membership__user=actor, kind="retailer")
    request_hash = hashlib.sha256(
        json.dumps([str(cart_id), quote_fingerprint]).encode()
    ).hexdigest()
    previous = OrderGroup.objects.filter(retailer=retailer, idempotency_key=idempotency_key).first()
    if previous:
        if previous.request_hash != request_hash:
            raise Conflict("این کلید ثبت قبلاً برای درخواست دیگری استفاده شده است.")
        return group_data(previous)
    basket = get_object_or_404(Cart, pk=cart_id, retailer=retailer, is_active=True)
    # Same sorted party order as fulfillment; locking retailer first can deadlock
    # against a shipment command that acquired the manufacturer first.
    parties = {retailer.pk, *basket.selections.values_list("product__business_id", flat=True)}
    list(Business.objects.select_for_update().filter(pk__in=parties).order_by("pk"))
    estimate = cart.preview(actor=actor)
    if not estimate["valid"]:
        raise Conflict({"message": "سبد نیاز به اصلاح دارد.", "preview": estimate})
    if estimate["quote_fingerprint"] != quote_fingerprint:
        raise Conflict(
            {
                "message": "برآورد تغییر کرده است؛ مبلغ تازه را بررسی و تأیید کنید.",
                "preview": estimate,
            }
        )
    group = OrderGroup.objects.create(
        cart=basket, retailer=retailer, idempotency_key=idempotency_key, request_hash=request_hash
    )
    choices = {str(row.product_id): row.service_id for row in basket.selections.all()}
    for manufacturer in estimate["manufacturers"]:
        rate = manufacturer["manufacturer_commission_bps"]
        commercial = {
            **manufacturer,
            "currency": "IRR",
            "manufacturer_commission_bps": rate,
            "manufacturer_commission_irr": (
                (manufacturer["goods_total_irr"] * rate + 50_000) // 100_000
            )
            * 10,
        }
        order = Order.objects.create(
            group=group,
            manufacturer_id=manufacturer["manufacturer"],
            retailer=retailer,
            status="pending",
            destination=basket.destination,
            commercial=commercial,
            response_deadline=timezone.now() + timedelta(hours=policy_value("order_hours")),
        )
        services = {}
        for product in manufacturer["products"]:
            for item in product["quote"]["lines"]:
                line = OrderLine.objects.create(
                    order=order,
                    variant_id=item["variant"],
                    sku=item["sku"],
                    quantity=item["quantity"],
                    production_quantity=item["from_production"],
                    lead_time_days=item["lead_time_days"],
                    commercial={
                        **item,
                        "product": product["product"],
                        "selection": product["selection"],
                        "tier_min_quantity": product["quote"]["tier_min_quantity"],
                    },
                )
                Reservation.objects.create(
                    line=line,
                    variant_id=line.variant_id,
                    ready_quantity=item["from_ready"],
                    production_quantity=item["from_production"],
                )
                services[item["variant"]] = choices[product["product"]]
        freeze_shipping(order_id=order.pk, choices=services)
        audit(actor=actor, action="order.submitted", target=order, after={"group": str(group.pk)})
        notify(
            recipient=order.manufacturer.membership.user,
            topic="order.submitted",
            payload={"order": str(order.pk)},
        )
    basket.is_active = False
    basket.save(update_fields=["is_active", "updated_at"])
    return group_data(group)
