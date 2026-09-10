from concurrent.futures import ThreadPoolExecutor

import pytest
from django.db import IntegrityError, close_old_connections, connections, transaction

from marketplace.accounts.business_services import create_business
from marketplace.catalog.models import (
    FixedPack,
    PackItem,
    PriceTier,
    Product,
    SalesPlan,
    Variant,
    VariantSupply,
)
from marketplace.logistics.models import ProductShipping, VariantPackage
from marketplace.orders import cart
from marketplace.orders.models import Cart
from tests.test_logistics_publication import ready_product  # noqa: F401

pytestmark = pytest.mark.django_db
ROOT = "/api/v1/orders/cart/"
DESTINATION = {
    "province": "تهران",
    "city": "تهران",
    "address": "خیابان نمونه",
    "postal_code": "1234567890",
    "recipient_name": "گیرنده",
    "recipient_mobile": "09123456789",
}


@pytest.fixture
def cart_world(request, client, user_factory, business_data):
    actor, owner, product, variant, service, tariff = request.getfixturevalue("ready_product")
    product.business.controlled_access = True
    product.business.save()
    product.status = "published"
    product.save()
    buyer = user_factory()
    retailer = create_business(actor=buyer, **{**business_data, "kind": "retailer"})
    retailer.status = "verified"
    retailer.controlled_access = True
    retailer.save()
    client.force_authenticate(buyer)
    return buyer, retailer, product, variant, service


def selection(variant, quantity=2):
    return {"method": "free_mix", "items": [{"variant": str(variant.pk), "quantity": quantity}]}


def prepared(client, world):
    _, _, product, variant, service = world
    url = ROOT + f"products/{product.pk}/"
    assert client.post(url, selection(variant), format="json").status_code == 200
    assert client.put(ROOT + "destination/", DESTINATION, format="json").status_code == 200
    assert (
        client.put(url + "shipping/", {"service": str(service.pk)}, format="json").status_code
        == 200
    )
    return url


def test_cart_persistent_merge_replace_and_remove(client, cart_world):
    buyer, retailer, product, variant, _ = cart_world
    url = ROOT + f"products/{product.pk}/"
    first = client.post(url, selection(variant), format="json")
    assert first.status_code == 200, first.data
    second = client.post(url, selection(variant, 3), format="json")
    assert second.data["id"] == first.data["id"]
    assert second.data["products"][0]["selection"]["items"][0]["quantity"] == 5
    client.force_authenticate(buyer)
    assert client.get(ROOT).data == second.data
    updated = client.put(url, selection(variant, 4), format="json")
    assert updated.data["products"][0]["selection"]["items"][0]["quantity"] == 4
    assert client.delete(url).data["products"] == []
    with pytest.raises(IntegrityError), transaction.atomic():
        Cart.objects.create(retailer=retailer)


def test_cart_preview_current_price_supply_shipping_and_fingerprint(client, cart_world):
    prepared(client, cart_world)
    _, _, product, variant, _ = cart_world
    PriceTier.objects.create(plan=product.sales_plan, min_quantity=5, unit_price_irr=800)
    response = client.get(ROOT + "preview/")
    assert response.status_code == 200, response.data
    quote = response.data
    assert quote["valid"]
    assert quote["goods_total_irr"] == 2000
    assert quote["retailer_commission_irr"] == 40
    assert quote["shipping_amount_irr"] == 50000
    assert quote["payable_total_irr"] == 52040
    item = quote["manufacturers"][0]["products"][0]["quote"]
    assert item["next_tier_quantity_gap"] == 3
    assert item["lines"][0]["from_ready"] == 2
    assert "address" not in quote["shipping_groups"][0]["origin_address"]
    assert client.get(ROOT + "preview/").data["quote_fingerprint"] == quote["quote_fingerprint"]
    product.sales_plan.tiers.filter(min_quantity=2).update(unit_price_irr=1100)
    refreshed = client.get(ROOT + "preview/").data
    assert refreshed["goods_total_irr"] == 2200
    assert refreshed["quote_fingerprint"] != quote["quote_fingerprint"]
    VariantSupply.objects.filter(variant=variant).update(ready_stock=1)
    invalid = client.get(ROOT + "preview/").data
    assert not invalid["valid"]
    assert invalid["payable_total_irr"] is None
    assert invalid["manufacturers"][0]["products"][0]["errors"]
    assert invalid["products"] == quote["products"]


def test_cart_pack_confirmation_and_composition_changes(client, cart_world):
    _, _, product, variant, _ = cart_world
    url = prepared(client, cart_world)
    pack = FixedPack.objects.create(plan=product.sales_plan, code="pair", name="جفت")
    item = PackItem.objects.create(pack=pack, variant=variant, quantity=2)
    data = {"method": "fixed_pack", "pack_code": "pair", "pack_count": 1}
    assert client.post(url, data, format="json").status_code == 409
    assert (
        client.post(url, {**data, "confirm_method_change": True}, format="json").status_code == 200
    )
    assert client.post(url, data, format="json").data["products"][0]["selection"]["pack_count"] == 2
    item.quantity = 3
    item.save()
    assert not client.get(ROOT + "preview/").data["valid"]
    assert client.post(url, data, format="json").status_code == 409
    assert client.put(url, data, format="json").status_code == 200
    assert client.get(ROOT + "preview/").data["goods_total_irr"] == 3000


def test_cart_tenant_isolation_and_access(client, cart_world, user_factory, business_data):
    _, retailer, product, _, _ = cart_world
    prepared(client, cart_world)
    outsider = user_factory()
    business = create_business(actor=outsider, **{**business_data, "kind": "retailer"})
    business.status = "verified"
    business.controlled_access = True
    business.save()
    client.force_authenticate(outsider)
    assert client.get(ROOT).data["products"] == []
    assert client.delete(ROOT + f"products/{product.pk}/").status_code == 404
    assert Cart.objects.get(retailer=retailer).selections.count() == 1
    business.controlled_access = False
    business.save()
    assert client.get(ROOT).status_code == 403
    client.force_authenticate(None)
    assert client.get(ROOT).status_code == 401


def test_cart_input_validation_and_unavailable_shipping(client, cart_world):
    _, _, product, variant, service = cart_world
    url = prepared(client, cart_world)
    assert client.post(url, selection(variant, True), format="json").status_code == 400
    duplicate = selection(variant)
    duplicate["items"] *= 2
    assert client.post(url, duplicate, format="json").status_code == 400
    assert client.post(url, {"method": "free_mix"}, format="json").status_code == 400
    assert (
        client.put(
            ROOT + "destination/", {**DESTINATION, "postal_code": "x"}, format="json"
        ).status_code
        == 400
    )
    service.operational = False
    service.save()
    preview = client.get(ROOT + "preview/").data
    assert not preview["valid"]
    assert preview["issues"][0]["code"] == "shipping_unavailable"
    assert len(preview["products"]) == 1


def test_cart_groups_shipping_and_rounds_fee_once_per_manufacturer(client, cart_world):
    _, _, product, _, service = cart_world
    prepared(client, cart_world)
    product.sales_plan.tiers.update(unit_price_irr=125)
    second = Product.objects.create(
        business=product.business, category=product.category, name="محصول دوم", status="published"
    )
    variant = Variant.objects.create(
        product=second, business=product.business, sku="second", combination="b" * 64
    )
    VariantSupply.objects.create(
        variant=variant, mode="hybrid", ready_stock=1, production_cap=2, lead_time_days=4
    )
    plan = SalesPlan.objects.create(product=second, free_mix_min=2)
    PriceTier.objects.create(plan=plan, min_quantity=2, unit_price_irr=125)
    config = ProductShipping.objects.create(product=second, origin=product.shipping.origin)
    config.services.add(service)
    VariantPackage.objects.create(
        variant=variant, weight_g=500, length_mm=100, width_mm=100, height_mm=100
    )
    url = ROOT + f"products/{second.pk}/"
    assert client.post(url, selection(variant), format="json").status_code == 200
    assert (
        client.put(url + "shipping/", {"service": str(service.pk)}, format="json").status_code
        == 200
    )
    preview = client.get(ROOT + "preview/").data
    assert preview["valid"]
    assert len(preview["manufacturers"]) == len(preview["shipping_groups"]) == 1
    assert preview["shipping_groups"][0]["weight_g"] == 2000
    assert preview["goods_total_irr"] == 500
    assert preview["retailer_commission_irr"] == 10
    assert preview["shipping_amount_irr"] == 50000
    quotes = {p["product"]: p["quote"] for p in preview["manufacturers"][0]["products"]}
    assert quotes[str(second.pk)]["lines"][0]["from_production"] == 1
    assert quotes[str(second.pk)]["lead_time_days"] == 4
    service.max_weight_g = 1500
    service.save()
    assert not client.get(ROOT + "preview/").data["valid"]


@pytest.mark.django_db(transaction=True)
def test_concurrent_cart_adds_do_not_lose_quantities(cart_world):
    buyer, retailer, product, variant, _ = cart_world

    def add(_):
        close_old_connections()
        try:
            return cart.select_product(
                actor=buyer, product_id=product.pk, data=selection(variant), add=True
            )
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(add, range(4)))
    assert len({result["id"] for result in results}) == 1
    assert Cart.objects.filter(retailer=retailer, is_active=True).count() == 1
    assert cart.read_cart(actor=buyer)["products"][0]["selection"]["items"][0]["quantity"] == 8
