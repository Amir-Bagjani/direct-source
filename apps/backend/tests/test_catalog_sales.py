from copy import deepcopy

import pytest
from django.db import IntegrityError, transaction

from marketplace.accounts.business_services import create_business
from marketplace.catalog.models import Category, Product, Variant, VariantSupply
from marketplace.operations.models import AuditEvent

pytestmark = pytest.mark.django_db


@pytest.fixture
def sale(client, user_factory, business_data):
    user = user_factory()
    business = create_business(actor=user, **business_data)
    category = Category.objects.create(name="کفش", slug="shoes")
    product = Product.objects.create(
        business=business, category=category, name="کفش", description="نمونه"
    )
    variants = [
        Variant.objects.create(
            product=product, business=business, sku=str(i), combination=str(i) * 64
        )
        for i in range(2)
    ]
    client.force_authenticate(user)
    return product, variants, f"/api/v1/catalog/products/{product.pk}/"


def plan(variants):
    return {
        "free_mix_min": 1,
        "packs": [
            {
                "code": "dozen",
                "name": "جین",
                "items": [{"variant": str(v.pk), "quantity": 6} for v in variants],
            }
        ],
        "tiers": [
            {
                "min_quantity": 1,
                "unit_price_irr": 8_000_000,
                "overrides": [{"variant": str(variants[1].pk), "unit_price_irr": 8_500_000}],
            },
            {
                "min_quantity": 12,
                "unit_price_irr": 7_600_000,
                "overrides": [{"variant": str(variants[1].pk), "unit_price_irr": 8_100_000}],
            },
            {
                "min_quantity": 24,
                "unit_price_irr": 7_200_000,
                "overrides": [{"variant": str(variants[1].pk), "unit_price_irr": 7_700_000}],
            },
        ],
    }


def setup_sale(client, sale):
    product, variants, url = sale
    result = client.put(url + "sales-plan/", plan(variants), format="json")
    assert result.status_code == 200, result.data
    for v in variants:
        response = client.put(
            url + f"variants/{v.pk}/supply/",
            {"mode": "hybrid", "ready_stock": 5, "production_cap": 100, "lead_time_days": 7},
            format="json",
        )
        assert response.status_code == 200, response.data
    return result


@pytest.mark.parametrize(
    "method,count,expected",
    [
        ("free_mix", 5, 82_500_000),
        ("free_mix", 6, 94_200_000),
        ("free_mix", 12, 178_800_000),
        ("fixed_pack", 1, 94_200_000),
        ("fixed_pack", 2, 178_800_000),
    ],
)
def test_price_boundaries_and_ready_first(client, sale, method, count, expected):
    result = setup_sale(client, sale)
    product, variants, url = sale
    assert [row["max_quantity"] for row in result.data["tiers"]] == [11, 23, None]
    request = {"method": method}
    if method == "free_mix":
        request["items"] = [{"variant": str(v.pk), "quantity": count} for v in variants]
    else:
        request.update(pack_code="dozen", pack_count=count)
    quote = client.post(url + "quote/", request, format="json")
    assert quote.status_code == 200, quote.data
    assert quote.data["goods_total_irr"] == expected
    assert quote.data["currency"] == "IRR"
    assert quote.data["lead_time_days"] == (0 if method == "free_mix" and count == 5 else 7)
    assert all(row["from_ready"] == 5 for row in quote.data["lines"])
    assert VariantSupply.objects.get(variant=variants[0]).ready_stock == 5


@pytest.mark.parametrize(
    "case",
    [
        "first",
        "order",
        "duplicate",
        "rising_default",
        "rising_effective",
        "rising_override",
        "duplicate_pack",
        "duplicate_item",
        "empty_methods",
        "float",
        "bool",
        "fractional_toman_default",
        "fractional_toman_override",
        "empty_pack",
    ],
)
def test_invalid_plan_preserves_previous_plan_and_audit(client, sale, case):
    baseline = setup_sale(client, sale).data
    _, variants, url = sale
    data = plan(variants)
    if case == "first":
        data["tiers"][0]["min_quantity"] = 2
    elif case == "order":
        data["tiers"].reverse()
    elif case == "duplicate":
        data["tiers"][1]["min_quantity"] = 1
    elif case == "rising_default":
        data["tiers"][1]["unit_price_irr"] = 9_000_000
    elif case == "rising_effective":
        data["tiers"][0]["overrides"][0]["unit_price_irr"] = 7_000_000
        data["tiers"][1]["overrides"] = []
    elif case == "rising_override":
        data["tiers"][1]["overrides"][0]["unit_price_irr"] = 9_000_000
    elif case == "duplicate_pack":
        data["packs"].append(deepcopy(data["packs"][0]))
    elif case == "duplicate_item":
        data["packs"][0]["items"].append(deepcopy(data["packs"][0]["items"][0]))
    elif case == "empty_methods":
        data.update(free_mix_min=None, packs=[])
    elif case == "float":
        data["tiers"][0]["unit_price_irr"] = 1.5
    elif case == "bool":
        data["tiers"][0]["unit_price_irr"] = True
    elif case == "fractional_toman_default":
        data["tiers"][0]["unit_price_irr"] = 8_000_001
    elif case == "fractional_toman_override":
        data["tiers"][0]["overrides"][0]["unit_price_irr"] = 8_500_001
    elif case == "empty_pack":
        data["packs"][0]["items"] = []
    response = client.put(url + "sales-plan/", data, format="json")
    assert response.status_code == 400
    paths = {
        "first": "tiers.0.min_quantity",
        "order": "tiers.0.min_quantity",
        "duplicate": "tiers.1.min_quantity",
        "rising_default": "tiers.1.unit_price_irr",
        "rising_effective": "tiers.1.unit_price_irr",
        "rising_override": f"tiers.1.overrides.{variants[1].pk}.unit_price_irr",
        "duplicate_pack": "packs.1.code",
        "fractional_toman_default": "tiers.0.unit_price_irr",
        "fractional_toman_override": f"tiers.0.overrides.{variants[1].pk}.unit_price_irr",
    }
    if case in paths:
        assert paths[case] in response.data["fields"], response.data
    assert client.get(url + "sales-plan/").data == baseline
    assert AuditEvent.objects.filter(action="catalog.sales_plan_saved").count() == 1


def test_foreign_variants_and_roles_never_get_prices(client, sale, user_factory):
    setup_sale(client, sale)
    product, variants, url = sale
    other = Product.objects.create(
        business=product.business, category=product.category, name="دیگر", description="نمونه"
    )
    foreign = Variant.objects.create(
        product=other, business=product.business, sku="other", combination="f" * 64
    )
    data = plan(variants)
    data["tiers"][0]["overrides"][0]["variant"] = str(foreign.pk)
    assert client.put(url + "sales-plan/", data, format="json").status_code == 400
    assert (
        client.put(
            url + f"variants/{foreign.pk}/supply/",
            {"mode": "ready", "ready_stock": 1, "production_cap": 0, "lead_time_days": 0},
            format="json",
        ).status_code
        == 404
    )
    for role in [None, "operator", "owner"]:
        client.force_authenticate(user_factory(role=role))
        response = client.get(url + "sales-plan/")
        assert response.status_code == 404
        assert "unit_price_irr" not in str(response.data)
    client.force_authenticate(None)
    assert client.get(url + "sales-plan/").status_code == 401


@pytest.mark.parametrize(
    "mode,ready,cap,days,valid",
    [
        ("ready", 0, 0, 0, True),
        ("ready", 1, 2, 0, False),
        ("production", 0, 5, 2, True),
        ("production", 1, 5, 2, False),
        ("production", 0, 0, 2, False),
        ("hybrid", 0, 5, 2, True),
        ("hybrid", 1, 5, 0, False),
    ],
)
def test_supply_modes(client, sale, mode, ready, cap, days, valid):
    _, variants, url = sale
    data = {"mode": mode, "ready_stock": ready, "production_cap": cap, "lead_time_days": days}
    response = client.put(url + f"variants/{variants[0].pk}/supply/", data, format="json")
    assert response.status_code == (200 if valid else 400), response.data
    if valid:
        assert client.get(url + f"variants/{variants[0].pk}/supply/").data == data


def test_pack_only_minimum_shortage_and_reference_protection(client, sale):
    setup_sale(client, sale)
    _, variants, url = sale
    data = plan(variants)
    data["free_mix_min"] = None
    data["tiers"] = data["tiers"][1:]
    assert client.put(url + "sales-plan/", data, format="json").status_code == 200
    assert client.delete(url + f"variants/{variants[0].pk}/").status_code == 409
    assert (
        client.post(
            url + "quote/",
            {"method": "fixed_pack", "pack_code": "dozen", "pack_count": 100},
            format="json",
        ).status_code
        == 409
    )
    assert (
        client.post(
            url + "quote/",
            {"method": "fixed_pack", "pack_code": "dozen", "pack_count": 1.5},
            format="json",
        ).status_code
        == 400
    )
    assert (
        client.post(
            url + "quote/",
            {"method": "free_mix", "items": [{"variant": str(variants[0].pk), "quantity": 12}]},
            format="json",
        ).status_code
        == 400
    )


def test_database_supply_constraint(sale):
    variant = sale[1][0]
    with pytest.raises(IntegrityError), transaction.atomic():
        VariantSupply.objects.create(
            variant=variant, mode="production", production_cap=0, lead_time_days=0
        )


def test_quote_uses_slowest_production_and_enforces_selection(client, sale):
    setup_sale(client, sale)
    _, variants, url = sale
    endpoint = url + f"variants/{variants[1].pk}/supply/"
    assert (
        client.put(
            endpoint,
            {"mode": "production", "ready_stock": 0, "production_cap": 20, "lead_time_days": 12},
            format="json",
        ).status_code
        == 200
    )
    items = [{"variant": str(v.pk), "quantity": 6} for v in variants]
    result = client.post(url + "quote/", {"method": "free_mix", "items": items}, format="json")
    assert result.data["lead_time_days"] == 12
    assert result.data["lines"][1]["from_production"] == 6
    assert (
        client.post(
            url + "quote/", {"method": "free_mix", "items": [items[0], items[0]]}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.post(
            url + "quote/",
            {"method": "fixed_pack", "items": items, "pack_code": "dozen", "pack_count": 1},
            format="json",
        ).status_code
        == 400
    )


@pytest.mark.django_db(transaction=True)
def test_concurrent_plan_replacements_do_not_mix_versions(client, sale):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from django.db import close_old_connections

    from marketplace.accounts.models import User
    from marketplace.catalog.sales_api import SalesPlanInput
    from marketplace.catalog.sales_services import save_plan

    setup_sale(client, sale)
    product, variants, url = sale
    actor_id = product.business.membership.user_id
    barrier = Barrier(2)

    def replace(price):
        close_old_connections()
        try:
            actor = User.objects.get(pk=actor_id)
            data = {
                "free_mix_min": 1,
                "packs": [],
                "tiers": [{"min_quantity": 1, "unit_price_irr": price}],
            }
            serializer = SalesPlanInput(data=data)
            serializer.is_valid(raise_exception=True)
            barrier.wait(timeout=10)
            return save_plan(actor=actor, product_id=product.pk, data=serializer.validated_data)[
                "tiers"
            ][0]["unit_price_irr"]
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(replace, [100, 200])) == [100, 200]
    result = client.get(url + "sales-plan/")
    assert len(result.data["tiers"]) == 1
    assert result.data["tiers"][0]["unit_price_irr"] in [100, 200]
