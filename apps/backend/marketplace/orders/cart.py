"""Persistent business cart. Estimates do not reserve stock or create orders."""

import hashlib
import json
from collections import defaultdict
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from marketplace.accounts.models import Business
from marketplace.accounts.permissions import can_start_trade
from marketplace.catalog.models import FixedPack, Product
from marketplace.catalog.sales_services import quote_product
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.logistics.grouping import calculate_groups
from marketplace.logistics.services import lock_services

from .models import Cart, CartSelection, DeliveryAddress


def owned_cart(actor):
    actor = locked_actor(actor)
    business = get_object_or_404(
        Business.objects.select_for_update(), membership__user=actor, kind="retailer"
    )
    if not can_start_trade(business):
        raise PermissionDenied()
    cart, _ = Cart.objects.get_or_create(retailer=business, is_active=True)
    return cart


def changed(cart):
    cart.version += 1
    cart.save(update_fields=["version", "destination", "updated_at"])


def decode(selection):
    data = dict(selection)
    if "items" in data:
        data["items"] = [{**item, "variant": UUID(item["variant"])} for item in data["items"]]
    return data


def composition(product, data):
    if data["method"] != "fixed_pack":
        return {}
    pack = get_object_or_404(FixedPack, plan__product=product, code=data.get("pack_code"))
    return {str(item.variant_id): item.quantity for item in pack.items.all()}


def available(product):
    if product.status != "published" or not can_start_trade(product.business):
        raise Conflict("محصول یا تولیدکننده برای سفارش در دسترس نیست.")


@transaction.atomic
def select_product(*, actor, product_id, data, add):
    cart = owned_cart(actor)
    lock_services()
    product = get_object_or_404(Product.objects.select_for_update(), pk=product_id)
    available(product)
    data = dict(data)
    confirm = data.pop("confirm_method_change", False)
    data = json.loads(json.dumps(data, default=str))
    if data["method"] == "free_mix":
        if not data.get("items") or "pack_code" in data or "pack_count" in data:
            raise ValidationError("اقلام ترکیب آزاد لازم است؛ اطلاعات بسته نفرستید.")
    elif "items" in data or not data.get("pack_code") or not data.get("pack_count"):
        raise ValidationError("کد و تعداد بسته لازم است؛ اقلام آزاد نفرستید.")
    row = CartSelection.objects.filter(cart=cart, product=product).first()
    current_composition = composition(product, data)
    if row:
        previous = row.selection
        replacing = previous["method"] != data["method"] or (
            data["method"] == "fixed_pack" and previous.get("pack_code") != data.get("pack_code")
        )
        if replacing and not confirm:
            raise Conflict("تغییر روش یا بسته نیازمند تأیید صریح است.")
        if add and not replacing:
            if data["method"] == "free_mix":
                quantities = {item["variant"]: item["quantity"] for item in previous["items"]}
                incoming = data.get("items", [])
                if len({item["variant"] for item in incoming}) != len(incoming):
                    raise ValidationError("تنوع تکراری است.")
                for item in incoming:
                    quantities[item["variant"]] = (
                        quantities.get(item["variant"], 0) + item["quantity"]
                    )
                data["items"] = [
                    {"variant": pk, "quantity": count} for pk, count in quantities.items()
                ]
            else:
                if row.pack_composition != current_composition:
                    raise Conflict("ترکیب بسته تغییر کرده است؛ انتخاب را دوباره ثبت کنید.")
                data["pack_count"] = previous["pack_count"] + data.get("pack_count", 0)
    estimate = quote_product(product=product, data=decode(data))
    if len(estimate["lines"]) > 100 or any(line["quantity"] > 10**6 for line in estimate["lines"]):
        raise ValidationError("حداکثر ۱۰۰ تنوع و یک میلیون واحد از هر تنوع مجاز است.")
    row = row or CartSelection(cart=cart, product=product)
    row.selection = data
    row.pack_composition = current_composition
    row.save()
    changed(cart)
    return render(cart)


@transaction.atomic
def remove_product(*, actor, product_id):
    cart = owned_cart(actor)
    get_object_or_404(CartSelection, cart=cart, product_id=product_id).delete()
    changed(cart)
    return render(cart)


@transaction.atomic
def set_destination(*, actor, data):
    cart = owned_cart(actor)
    # Cart-owned delivery details cannot edit the business verification address.
    cart.destination = dict(data)
    changed(cart)
    return render(cart)


@transaction.atomic
def set_shipping(*, actor, product_id, service_id):
    cart = owned_cart(actor)
    lock_services()
    row = get_object_or_404(CartSelection, cart=cart, product_id=product_id)
    product = Product.objects.select_for_update().get(pk=product_id)
    available(product)
    config = getattr(product, "shipping", None)
    if config is None:
        raise Conflict("مشخصات حمل کامل نیست.")
    row.service = get_object_or_404(config.services, pk=service_id, operational=True)
    row.save(update_fields=["service", "updated_at"])
    changed(cart)
    return render(cart)


def render(cart):
    return {
        "id": str(cart.pk),
        "version": cart.version,
        "destination": cart.destination,
        "products": [
            {
                "product": str(row.product_id),
                "manufacturer": str(row.product.business_id),
                "selection": row.selection,
                "pack_composition": row.pack_composition,
                "service": str(row.service_id) if row.service_id else None,
            }
            for row in cart.selections.select_related("product").order_by("product_id")
        ],
    }


@transaction.atomic
def read_cart(*, actor):
    return render(owned_cart(actor))


@transaction.atomic
def addresses(*, actor, data=None, pk=None, delete=False):
    basket = owned_cart(actor)
    query = DeliveryAddress.objects.filter(retailer=basket.retailer).order_by("created_at")
    if pk:
        address = get_object_or_404(query, pk=pk)
        if delete:
            address.delete()
        elif data is not None:
            address.details = dict(data)
            address.save()
    elif data is not None:
        DeliveryAddress.objects.create(retailer=basket.retailer, details=dict(data))
    return [{"id": str(address.pk), **address.details} for address in query]


@transaction.atomic
def choose_address(*, actor, pk):
    basket = owned_cart(actor)
    address = get_object_or_404(DeliveryAddress, pk=pk, retailer=basket.retailer)
    basket.destination = dict(address.details)
    changed(basket)
    return render(basket)


@transaction.atomic
def bulk_shipping(*, actor, manufacturer_id, service_id):
    basket = owned_cart(actor)
    lock_services()
    rows = list(
        basket.selections.filter(product__business_id=manufacturer_id)
        .select_related("product")
        .order_by("product_id")
    )
    if not rows or not basket.destination:
        raise ValidationError("محصول تولیدکننده و نشانی تحویل لازم است.")
    list(
        Product.objects.select_for_update()
        .filter(pk__in=[row.product_id for row in rows])
        .order_by("pk")
    )
    candidates: dict = defaultdict(list)
    skipped = []
    for row in rows:
        try:
            product = Product.objects.get(pk=row.product_id)
            available(product)
            if composition(product, row.selection) != row.pack_composition:
                raise Conflict("ترکیب بسته تغییر کرده است.")
            quote = quote_product(product=product, data=decode(row.selection))
            config = getattr(product, "shipping", None)
            if config is None:
                raise Conflict("مشخصات حمل کامل نیست.")
            get_object_or_404(config.services, pk=service_id, operational=True)
            candidates[config.origin_id].append((row, quote))
        except (APIException, Http404):
            skipped.append(str(row.product_id))
    applied = []
    for items in candidates.values():
        try:
            calculate_groups(
                destination=basket.destination,
                selections=[
                    {
                        "variant": UUID(line["variant"]),
                        "quantity": line["quantity"],
                        "service": service_id,
                    }
                    for _, quote in items
                    for line in quote["lines"]
                ],
            )
        except (APIException, Http404):
            skipped.extend(str(row.product_id) for row, _ in items)
            continue
        for row, _ in items:
            row.service_id = service_id
            row.save(update_fields=["service", "updated_at"])
            applied.append(str(row.product_id))
    if applied:
        changed(basket)
    return {**render(basket), "applied": applied, "skipped": skipped}


@transaction.atomic
def preview(*, actor):
    cart = owned_cart(actor)
    lock_services()
    rows = list(cart.selections.select_related("product__business").order_by("product_id"))
    # All catalog edit commands take this same product lock before changing pricing/supply.
    list(
        Product.objects.select_for_update()
        .filter(pk__in=[row.product_id for row in rows])
        .order_by("pk")
    )
    manufacturers: dict = {}
    shipping: dict = defaultdict(list)
    errors = []
    if not cart.destination:
        errors.append({"code": "destination_required"})
    for row in rows:
        manufacturer = str(row.product.business_id)
        group = manufacturers.setdefault(
            manufacturer, {"manufacturer": manufacturer, "products": [], "goods_total_irr": 0}
        )
        result = {"product": str(row.product_id), "selection": row.selection, "errors": []}
        group["products"].append(result)
        try:
            # Refresh after acquiring locks: the earlier related object may be stale.
            product = Product.objects.get(pk=row.product_id)
            available(product)
            if row.pack_composition != composition(product, row.selection):
                raise Conflict("ترکیب بسته تغییر کرده است؛ انتخاب محفوظ مانده است.")
            quote = quote_product(product=product, data=decode(row.selection))
            next_tier = product.sales_plan.tiers.filter(min_quantity__gt=quote["quantity"]).first()
            result["quote"] = {
                **quote,
                "next_tier_quantity_gap": next_tier.min_quantity - quote["quantity"]
                if next_tier
                else None,
            }
            group["goods_total_irr"] += quote["goods_total_irr"]
            if row.service_id is None:
                raise Conflict("خدمت حمل انتخاب نشده است.")
            config = getattr(product, "shipping", None)
            if config is None:
                raise Conflict("مشخصات حمل کامل نیست.")
            shipping[(manufacturer, config.origin_id, row.service_id)].extend(
                {
                    "variant": UUID(line["variant"]),
                    "quantity": line["quantity"],
                    "service": row.service_id,
                }
                for line in quote["lines"]
            )
        except (APIException, Http404) as exc:
            result["errors"].append(str(getattr(exc, "detail", "انتخاب دیگر موجود نیست.")))
    shipping_groups = []
    if cart.destination:
        for (manufacturer, origin, service), selections in shipping.items():
            try:
                groups = calculate_groups(destination=cart.destination, selections=selections)
                for group in groups:
                    group["origin_address"].pop("address", None)
                shipping_groups.extend(groups)
            except (APIException, Http404) as exc:
                errors.append(
                    {
                        "code": "shipping_unavailable",
                        "manufacturer": manufacturer,
                        "origin": str(origin),
                        "service": str(service),
                        "detail": str(getattr(exc, "detail", "خدمت موجود نیست.")),
                    }
                )
    valid = (
        bool(rows)
        and not errors
        and all(
            not item["errors"] for group in manufacturers.values() for item in group["products"]
        )
    )
    rate = getattr(settings, "RETAILER_COMMISSION_BPS", 200)
    for group in manufacturers.values():
        group["retailer_commission_bps"] = rate
        group["retailer_commission_irr"] = (
            ((group["goods_total_irr"] * rate + 50_000) // 100_000) * 10 if valid else None
        )
        group["shipping_amount_irr"] = (
            sum(
                g["shipping_amount_irr"]
                for g in shipping_groups
                if g["manufacturer"] == group["manufacturer"]
            )
            if valid
            else None
        )
        group["payable_total_irr"] = (
            group["goods_total_irr"]
            + group["retailer_commission_irr"]
            + group["shipping_amount_irr"]
            if valid
            else None
        )
    result = {
        **render(cart),
        "currency": "IRR",
        "valid": valid,
        "issues": errors,
        "manufacturers": list(manufacturers.values()),
        "shipping_groups": shipping_groups,
        "goods_total_irr": sum(group["goods_total_irr"] for group in manufacturers.values())
        if valid
        else None,
        "shipping_amount_irr": sum(group["shipping_amount_irr"] for group in shipping_groups)
        if valid
        else None,
    }
    result["retailer_commission_irr"] = (
        sum(g["retailer_commission_irr"] for g in manufacturers.values()) if valid else None
    )
    result["payable_total_irr"] = (
        sum(g["payable_total_irr"] for g in manufacturers.values()) if valid else None
    )
    result["quote_fingerprint"] = hashlib.sha256(
        json.dumps(result, sort_keys=True, default=str).encode()
    ).hexdigest()
    return result
