from unittest.mock import patch

import pytest
from django.db import DatabaseError, IntegrityError, transaction
from django.utils import timezone

from marketplace.accounts.business_services import create_business
from marketplace.catalog.models import (
    Category,
    PriceTier,
    Product,
    SalesPlan,
    Variant,
    VariantSupply,
)
from marketplace.logistics.models import ProductShipping, ShippingService, Tariff, VariantPackage
from marketplace.logistics.services import PROVINCES, activate_tariff, coverage, match_tariff
from marketplace.operations.models import OutboxEvent, StoredFile

pytestmark = pytest.mark.django_db


@pytest.fixture
def ready_product(user_factory, business_data):
    actor = user_factory()
    business = create_business(actor=actor, **business_data)
    business.status = "verified"
    business.save()
    category = Category.objects.create(name="کفش", slug="shoes")
    image = StoredFile.objects.create(
        owner=actor,
        business=business,
        purpose="product_image",
        object_key="product.png",
        content_type="image/png",
        size=100,
        sha256="a" * 64,
        scan_status="clean",
    )
    product = Product.objects.create(
        business=business,
        category=category,
        name="کفش",
        description="کفش ساده",
        images=[str(image.pk)],
    )
    variant = Variant.objects.create(
        product=product, business=business, sku="shoe", combination="a" * 64
    )
    VariantSupply.objects.create(variant=variant, mode="ready", ready_stock=10)
    plan = SalesPlan.objects.create(product=product, free_mix_min=2)
    PriceTier.objects.create(plan=plan, min_quantity=2, unit_price_irr=1000)
    service = ShippingService.objects.create(name="پست", kind="post", operational=True)
    shipping = ProductShipping.objects.create(product=product, origin=business.addresses.first())
    shipping.services.add(service)
    VariantPackage.objects.create(
        variant=variant, weight_g=500, length_mm=100, width_mm=100, height_mm=100
    )
    owner = user_factory(role="owner")
    tariff = Tariff.objects.create(
        service=service, scope="national", min_weight_g=1, max_weight_g=10000, amount_irr=50000
    )
    activate_tariff(actor=owner, pk=tariff.pk, enabled=True, reason="تعرفه اولیه")
    return actor, owner, product, variant, service, tariff


def test_tariff_permissions_replacement_and_immutability(client, ready_product, user_factory):
    actor, owner, product, variant, service, old = ready_product
    client.force_authenticate(user_factory(role="operator"))
    response = client.post(
        "/api/v1/logistics/tariffs/",
        {
            "service": str(service.pk),
            "scope": "national",
            "min_weight_g": 500,
            "max_weight_g": 20000,
            "amount_irr": 60000,
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    url = f"/api/v1/logistics/tariffs/{response.data['id']}/"
    assert (
        client.post(
            url + "activation/", {"enabled": True, "reason": "جدید"}, format="json"
        ).status_code
        == 403
    )
    client.force_authenticate(owner)
    activated = client.post(url + "activation/", {"enabled": True, "reason": "جدید"}, format="json")
    assert activated.status_code == 200, activated.data
    old.refresh_from_db()
    assert not old.is_active
    assert str(old.pk) in [str(pk) for pk in activated.data["replaces"]]
    assert client.patch(url, {"amount_irr": 10}, format="json").status_code == 409
    with pytest.raises(DatabaseError), transaction.atomic():
        Tariff.objects.filter(pk=old.pk).update(amount_irr=10)


def test_route_priority_weight_gap_and_database_overlap(ready_product):
    actor, owner, product, variant, service, old = ready_product
    exact = Tariff.objects.create(
        service=service,
        scope="city",
        origin_province="تهران",
        destination_province="فارس",
        origin_city="تهران",
        destination_city="شیراز",
        min_weight_g=1,
        max_weight_g=500,
        amount_irr=30000,
    )
    activate_tariff(actor=owner, pk=exact.pk, enabled=True, reason="شهر")
    assert match_tariff(service, "تهران", "تهران", "فارس", "شیراز", 500).pk == exact.pk
    assert match_tariff(service, "تهران", "تهران", "فارس", "شیراز", 501) is None
    assert match_tariff(service, "تهران", "تهران", "فارس", "مرودشت", 501).pk == old.pk
    with pytest.raises(IntegrityError), transaction.atomic():
        Tariff.objects.create(
            service=service,
            scope="national",
            min_weight_g=500,
            max_weight_g=900,
            amount_irr=10,
            is_active=True,
            activated_at=timezone.now(),
            activated_by=owner,
        )


def test_coverage_requires_real_orderable_weight(ready_product):
    _, owner, product, _, service, tariff = ready_product
    assert len(PROVINCES) == len(set(PROVINCES)) == 31
    assert coverage(product)
    small = Tariff.objects.create(
        service=service, scope="national", min_weight_g=1, max_weight_g=999, amount_irr=10
    )
    activate_tariff(actor=owner, pk=small.pk, enabled=True, reason="بازه کوچک")
    assert not coverage(product)


def test_shipping_quote_and_foreign_product(client, ready_product, user_factory):
    actor, owner, product, variant, service, tariff = ready_product
    url = f"/api/v1/logistics/products/{product.pk}/quote/"
    data = {
        "service": str(service.pk),
        "destination_province": "فارس",
        "destination_city": "شیراز",
        "items": [{"variant": str(variant.pk), "quantity": 2}],
    }
    client.force_authenticate(actor)
    response = client.post(url, data, format="json")
    assert response.status_code == 200, response.data
    assert response.data["weight_g"] == 1000
    assert response.data["shipping_amount_irr"] == 50000
    client.force_authenticate(user_factory())
    assert client.post(url, data, format="json").status_code == 404


def test_review_publish_and_tariff_loss_hides_public_product(client, ready_product, user_factory):
    actor, owner, product, variant, service, tariff = ready_product
    url = f"/api/v1/catalog/products/{product.pk}/"
    client.force_authenticate(actor)
    assert client.post(url + "submit/").status_code == 200
    assert client.patch(url, {"name": "تغییر"}, format="json").status_code == 409
    operator = user_factory(role="operator")
    client.force_authenticate(operator)
    assert client.get(f"/api/v1/catalog/review-products/{product.pk}/").status_code == 404
    assert client.post(url + "claim/").status_code == 200
    detail = client.get(f"/api/v1/catalog/review-products/{product.pk}/")
    assert detail.status_code == 200
    assert detail.data["sales_plan"]["tiers"][0]["unit_price_irr"] == 1000
    client.force_authenticate(user_factory(role="operator"))
    assert (
        client.post(
            url + "review/",
            {"decision": "published", "code": "approved", "reason": "تأیید"},
            format="json",
        ).status_code
        == 403
    )
    client.force_authenticate(operator)
    result = client.post(
        url + "review/",
        {"decision": "published", "code": "approved", "reason": "تأیید"},
        format="json",
    )
    assert result.status_code == 200, result.data
    client.force_authenticate(None)
    with patch(
        "marketplace.catalog.publication_api.default_storage.url", return_value="http://test/image"
    ):
        public = client.get(f"/api/v1/catalog/public/products/{product.pk}/")
    assert public.status_code == 200
    assert "unit_price_irr" not in str(public.data)
    assert "origin" not in public.data
    assert OutboxEvent.objects.filter(topic="catalog.publication").count() == 2
    activate_tariff(actor=owner, pk=tariff.pk, enabled=False, reason="توقف")
    product.refresh_from_db()
    assert product.status == "inactive"
    assert client.get(f"/api/v1/catalog/public/products/{product.pk}/").status_code == 404


def test_incomplete_submission_and_changes_cycle(client, ready_product, user_factory):
    actor, owner, product, variant, service, tariff = ready_product
    url = f"/api/v1/catalog/products/{product.pk}/"
    client.force_authenticate(actor)
    product.business.status = "draft"
    product.business.save()
    assert client.post(url + "submit/").status_code == 400
    product.business.status = "verified"
    product.business.save()
    assert client.post(url + "submit/").status_code == 200
    operator = user_factory(role="operator")
    client.force_authenticate(operator)
    assert client.post(url + "claim/").status_code == 200
    assert (
        client.post(
            url + "review/",
            {"decision": "changes_requested", "code": "description", "reason": "توضیح بیشتر"},
            format="json",
        ).status_code
        == 200
    )
    client.force_authenticate(actor)
    assert client.patch(url, {"description": "توضیحات کامل"}, format="json").status_code == 200
    assert client.post(url + "submit/").status_code == 200
    product.refresh_from_db()
    assert product.assigned_to_id is None


def test_shipping_configuration_and_package_validation(client, ready_product):
    actor, _, product, variant, service, _ = ready_product
    client.force_authenticate(actor)
    url = f"/api/v1/logistics/products/{product.pk}/shipping/"
    data = {
        "origin": str(product.business.addresses.first().pk),
        "services": [str(service.pk)],
        "packages": [
            {
                "variant": str(variant.pk),
                "weight_g": 700,
                "length_mm": 100,
                "width_mm": 120,
                "height_mm": 50,
                "package_count": 1,
            }
        ],
    }
    response = client.put(url, data, format="json")
    assert response.status_code == 200, response.data
    assert client.get(url).data["packages"][0]["weight_g"] == 700
    data["packages"][0]["weight_g"] = 0
    assert client.put(url, data, format="json").status_code == 400
    assert VariantPackage.objects.get(variant=variant).weight_g == 700


def test_live_supply_deactivation_and_operator_authority(client, ready_product, user_factory):
    actor, _, product, variant, _, _ = ready_product
    product.status, product.published_at = "published", timezone.now()
    product.save()
    base = f"/api/v1/catalog/products/{product.pk}/"
    client.force_authenticate(actor)
    supply = {"mode": "ready", "ready_stock": 0, "production_cap": 0, "lead_time_days": 0}
    assert (
        client.put(base + f"variants/{variant.pk}/supply/", supply, format="json").status_code
        == 200
    )
    product.refresh_from_db()
    assert product.status == "inactive"
    assert client.post(base + "activate/", {"reason": "بازگشت"}, format="json").status_code == 400
    supply["ready_stock"] = 10
    assert (
        client.put(base + f"variants/{variant.pk}/supply/", supply, format="json").status_code
        == 200
    )
    assert client.post(base + "activate/", {"reason": "بازگشت"}, format="json").status_code == 200
    client.force_authenticate(user_factory(role="operator"))
    assert (
        client.post(base + "deactivate/", {"reason": "بررسی تخلف"}, format="json").status_code
        == 200
    )
    client.force_authenticate(actor)
    assert client.post(base + "activate/", {"reason": "بازگشت"}, format="json").status_code == 403


@pytest.mark.django_db(transaction=True)
def test_tariff_replacement_race(ready_product):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from django.db import close_old_connections

    from marketplace.accounts.models import User

    _, owner, _, _, service, _ = ready_product
    versions = [
        Tariff.objects.create(
            service=service, scope="national", min_weight_g=1, max_weight_g=10000, amount_irr=amount
        )
        for amount in [100, 200]
    ]
    barrier = Barrier(2)

    def activate(pk):
        close_old_connections()
        try:
            actor = User.objects.get(pk=owner.pk)
            barrier.wait(timeout=10)
            activate_tariff(actor=actor, pk=pk, enabled=True, reason="نسخه جدید")
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(activate, [v.pk for v in versions]))
    assert Tariff.objects.filter(service=service, is_active=True).count() == 1
    assert Tariff.objects.filter(service=service, activated_at__isnull=False).count() == 3
