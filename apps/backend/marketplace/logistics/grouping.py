"""Shipping quotes and immutable checkout snapshot contract for PRD-04."""

from collections import defaultdict
from uuid import UUID

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.accounts.models import Address
from marketplace.accounts.permissions import can_start_trade, require_business_owner
from marketplace.catalog.models import Variant
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.operations.services import audit
from marketplace.orders.models import Order

from .models import ShippingGroup, ShippingGroupItem
from .services import lock_services, match_tariff, normalized, province


def calculate_groups(*, destination, selections):
    """Caller holds catalog/service locks at checkout; quote is only a preview."""
    if not isinstance(destination, dict) or any(
        not isinstance(destination.get(field), str) or not destination[field].strip()
        for field in ["province", "city", "address"]
    ):
        raise ValidationError("استان، شهر و نشانی مقصد لازم است.")
    groups = {}
    seen = set()
    product_services: dict[UUID, UUID] = {}
    for selection in selections:
        variant = get_object_or_404(
            Variant.objects.select_related("product__shipping__origin", "package", "business"),
            pk=selection["variant"],
            is_active=True,
            product__status="published",
        )
        if not can_start_trade(variant.business):
            raise Conflict("تولیدکننده برای سفارش تازه در دسترس نیست.")
        quantity = selection["quantity"]
        if type(quantity) is not int or not 1 <= quantity <= 10**6 or variant.pk in seen:
            raise ValidationError("تعداد نامعتبر یا تنوع تکراری است.")
        seen.add(variant.pk)
        config = getattr(variant.product, "shipping", None)
        package = getattr(variant, "package", None)
        if config is None or package is None:
            raise Conflict("مشخصات حمل کامل نیست.")
        service = get_object_or_404(config.services, pk=selection["service"])
        if product_services.setdefault(variant.product_id, service.pk) != service.pk:
            raise ValidationError("برای هر محصول فقط یک خدمت انتخاب کنید.")
        key = (variant.business_id, config.origin_id, service.pk)
        if key not in groups:
            groups[key] = {
                "manufacturer": str(variant.business_id),
                "origin": str(config.origin_id),
                "origin_address": {
                    field: getattr(config.origin, field)
                    for field in ["province", "city", "address"]
                },
                "destination": dict(destination),
                "service": str(service.pk),
                "service_name": service.name,
                "service_kind": service.kind,
                "delivery_days_min": service.delivery_days_min,
                "delivery_days_max": service.delivery_days_max,
                "weight_g": 0,
                "items": [],
                "_service": service,
            }
        group = groups[key]
        group["weight_g"] += package.weight_g * quantity
        group["items"].append(
            {
                "variant": str(variant.pk),
                "quantity": quantity,
                "sku": variant.sku,
                "package": {
                    field: getattr(package, field)
                    for field in ["weight_g", "length_mm", "width_mm", "height_mm", "package_count"]
                },
            }
        )
    if not groups:
        raise ValidationError("حداقل یک قلم لازم است.")
    for group in groups.values():
        origin = group["origin_address"]
        service = group.pop("_service")
        tariff = match_tariff(
            service,
            province(origin["province"]),
            normalized(origin["city"]),
            province(destination["province"]),
            normalized(destination["city"]),
            group["weight_g"],
        )
        if tariff is None:
            raise Conflict("خدمت برای وزن مجموع گروه و این مسیر در دسترس نیست.")
        group.update(
            {
                "tariff": str(tariff.pk),
                "scope": tariff.scope,
                "min_weight_g": tariff.min_weight_g,
                "max_weight_g": tariff.max_weight_g,
                "shipping_amount_irr": tariff.amount_irr,
            }
        )
    return list(groups.values())


@transaction.atomic
def preview_groups(*, actor, destination_id, selections):
    actor = locked_actor(actor)
    address = get_object_or_404(
        Address.objects.select_related("business"),
        pk=destination_id,
        business__membership__user=actor,
    )
    require_business_owner(actor, address.business)
    if address.business.kind != "retailer" or not can_start_trade(address.business):
        raise PermissionDenied()
    lock_services()
    groups = calculate_groups(
        destination={field: getattr(address, field) for field in ["province", "city", "address"]},
        selections=selections,
    )
    # Pickup street addresses are private and unnecessary when choosing a service.
    for group in groups:
        group["origin_address"].pop("address", None)
    return {"groups": groups, "shipping_amount_irr": sum(g["shipping_amount_irr"] for g in groups)}


@transaction.atomic
def freeze_shipping(*, order_id, choices):
    """Internal checkout hook: choices maps variant UUID strings to selected service UUIDs.

    PRD-04 must call this in the same transaction as validated lines/reservations,
    holding its User→Business→Service→Product locks before the Order lock.
    There is deliberately no public endpoint for constructing an accepted order.
    """
    lock_services()
    order = Order.objects.select_for_update().get(pk=order_id)
    if (
        order.manufacturer.kind != "manufacturer"
        or order.retailer.kind != "retailer"
        or not can_start_trade(order.retailer)
    ):
        raise Conflict("طرف‌های سفارش باید کسب‌وکارهای مجاز تولیدکننده و خرده‌فروش باشند.")
    if order.status != "accepted" or order.paid_at or order.shipping_groups.exists():
        raise Conflict("snapshot حمل قبلاً تثبیت شده یا سفارش قابل ثبت نیست.")
    lines = list(order.lines.select_related("variant"))
    if {str(line.variant_id) for line in lines} != set(choices):
        raise ValidationError("خدمت تمام اقلام سفارش لازم است.")
    if any(line.variant.business_id != order.manufacturer_id for line in lines):
        raise ValidationError("قلم متعلق به تولیدکنندهٔ سفارش نیست.")
    groups = calculate_groups(
        destination=order.destination,
        selections=[
            {
                "variant": line.variant_id,
                "quantity": line.quantity,
                "service": choices[str(line.variant_id)],
            }
            for line in lines
        ],
    )
    by_variant = {str(line.variant_id): line for line in lines}
    for data in groups:
        group = ShippingGroup.objects.create(
            order=order,
            service_id=data["service"],
            origin_id=data["origin"],
            snapshot=data,
            weight_g=data["weight_g"],
            amount_irr=data["shipping_amount_irr"],
        )
        for item in data["items"]:
            ShippingGroupItem.objects.create(
                group=group, line=by_variant[item["variant"]], quantity=item["quantity"]
            )
        audit(actor=None, action="shipping.snapshot_frozen", target=group, after=data)
    return list(order.shipping_groups.all())


def allocated_quantities(request):
    """Resolved failed attempts and cancelled drafts do not consume a second allocation."""
    totals: defaultdict[UUID, int] = defaultdict(int)
    for shipment in request.shipments.prefetch_related("items"):
        if shipment.status == "cancelled" or shipment.resolution == "resend":
            continue
        for item in shipment.items.all():
            totals[item.group_item_id] += item.quantity
    return totals
