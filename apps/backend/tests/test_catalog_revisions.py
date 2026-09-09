from unittest.mock import patch

import pytest
from django.db import DatabaseError, transaction
from django.utils import timezone

from marketplace.accounts.business_services import create_business
from marketplace.catalog.models import ProductRevision, Variant
from tests.test_logistics_publication import ready_product as _ready_product

ready_product = _ready_product

pytestmark = pytest.mark.django_db


def published(ready_product, client):
    actor, owner, product, variant, service, tariff = ready_product
    product.status, product.published_at = "published", timezone.now()
    product.save()
    client.force_authenticate(actor)
    return actor, product, variant


def propose(client, product, changes):
    response = client.post(
        f"/api/v1/catalog/products/{product.pk}/revisions/", changes, format="json"
    )
    assert response.status_code == 201, response.data
    return f"/api/v1/catalog/revisions/{response.data['id']}/", response.data


def submit_claim(client, url, operator):
    assert client.post(url + "submit/").status_code == 200
    client.force_authenticate(operator)
    assert client.post(url + "claim/").status_code == 200


def test_approval_keeps_current_price_supply_and_public_content_until_decision(
    client, ready_product, user_factory
):
    actor, product, variant = published(ready_product, client)
    old = product.name
    url, revision = propose(client, product, {"profile": {"name": "نام تازه"}})
    product.refresh_from_db()
    assert product.name == old
    assert (
        client.post(
            f"/api/v1/catalog/products/{product.pk}/revisions/",
            {"profile": {"name": "دوم"}},
            format="json",
        ).status_code
        == 409
    )
    assert client.post(url + "submit/").status_code == 200
    assert client.put(url, {"profile": {"name": "تغییر قفل"}}, format="json").status_code == 409
    sales = f"/api/v1/catalog/products/{product.pk}/sales-plan/"
    assert (
        client.put(
            sales,
            {"free_mix_min": 2, "packs": [], "tiers": [{"min_quantity": 2, "unit_price_irr": 900}]},
            format="json",
        ).status_code
        == 200
    )
    client.force_authenticate(user_factory(role="operator"))
    assert client.post(url + "claim/").status_code == 200
    response = client.post(
        url + "review/", {"decision": "approved", "code": "ok", "reason": "تأیید"}, format="json"
    )
    assert response.status_code == 200, response.data
    product.refresh_from_db()
    assert product.name == "نام تازه"
    assert product.sales_plan.tiers.get().unit_price_irr == 900
    assert variant.supply.ready_stock == 10
    assert response.data["before"]["profile"]["name"] == old
    with pytest.raises(DatabaseError), transaction.atomic():
        ProductRevision.objects.filter(pk=revision["id"]).update(reason="changed")


def test_new_and_retired_variants_only_change_on_approval(client, ready_product, user_factory):
    actor, product, variant = published(ready_product, client)
    variants = [
        {
            "sku": "fresh",
            "attributes": {},
            "images": [],
            "supply": {
                "mode": "ready",
                "ready_stock": 20,
                "production_cap": 0,
                "lead_time_days": 0,
            },
            "package": {
                "weight_g": 500,
                "length_mm": 100,
                "width_mm": 100,
                "height_mm": 100,
                "package_count": 1,
            },
        }
    ]
    url, revision = propose(client, product, {"variants": variants})
    assert product.variants.count() == 1
    new_id = revision["proposed"]["variants"][0]["id"]
    assert not Variant.objects.filter(pk=new_id).exists()
    submit_claim(client, url, user_factory(role="operator"))
    response = client.post(
        url + "review/", {"decision": "approved", "code": "ok", "reason": "تأیید"}, format="json"
    )
    assert response.status_code == 200, response.data
    variant.refresh_from_db()
    assert not variant.is_active
    assert Variant.objects.get(pk=new_id).is_active
    assert product.variants.count() == 2


def test_cancel_and_private_revision(client, ready_product, user_factory):
    actor, product, _ = published(ready_product, client)
    url, revision = propose(client, product, {"profile": {"description": "تغییر"}})
    client.force_authenticate(user_factory())
    assert client.get(url).status_code == 404
    client.force_authenticate(actor)
    assert client.post(url + "submit/").status_code == 200
    assert client.post(url + "cancel/", {"reason": "انصراف"}, format="json").status_code == 200
    product.refresh_from_db()
    assert product.description != "تغییر"
    propose(client, product, {"profile": {"description": "تازه"}})


@pytest.mark.parametrize(
    "kind,status,controlled,visible",
    [
        ("retailer", "verified", False, True),
        ("retailer", "draft", True, False),
        ("retailer", "suspended", True, False),
        ("manufacturer", "verified", True, False),
    ],
)
def test_wholesale_access_is_independent_of_trade_permission(
    client, ready_product, user_factory, business_data, kind, status, controlled, visible
):
    _, product, _ = published(ready_product, client)
    customer = user_factory()
    data = dict(business_data, kind=kind)
    business = create_business(actor=customer, **data)
    business.status, business.controlled_access = status, controlled
    business.save()
    client.force_authenticate(customer)
    with patch(
        "marketplace.catalog.publication_api.default_storage.url", return_value="http://image"
    ):
        response = client.get(f"/api/v1/catalog/public/products/{product.pk}/")
    assert response.status_code == 200
    assert ("wholesale" in response.data) == visible
    if visible:
        assert response.data["wholesale"]["tiers"][0]["unit_price_irr"] == 1000
    else:
        assert "unit_price_irr" not in str(response.data)
    assert response["Cache-Control"] == "no-store"


def test_revision_correction_and_current_supply_revalidated(client, ready_product, user_factory):
    actor, product, variant = published(ready_product, client)
    url, _ = propose(client, product, {"profile": {"name": "جدید"}})
    operator = user_factory(role="operator")
    submit_claim(client, url, operator)
    response = client.post(
        url + "review/",
        {"decision": "changes_requested", "code": "name", "reason": "اصلاح نام"},
        format="json",
    )
    assert response.status_code == 200
    client.force_authenticate(actor)
    assert client.put(url, {"profile": {"name": "اصلاح‌شده"}}, format="json").status_code == 200
    assert client.post(url + "submit/").status_code == 200
    # A later operational change must not be undone by accepting stale content.
    supply = f"/api/v1/catalog/products/{product.pk}/variants/{variant.pk}/supply/"
    assert (
        client.put(
            supply,
            {"mode": "ready", "ready_stock": 0, "production_cap": 0, "lead_time_days": 0},
            format="json",
        ).status_code
        == 200
    )
    client.force_authenticate(operator)
    assert client.post(url + "claim/").status_code == 200
    assert (
        client.post(
            url + "review/",
            {"decision": "approved", "code": "ok", "reason": "تأیید"},
            format="json",
        ).status_code
        == 400
    )
    product.refresh_from_db()
    assert product.name != "اصلاح‌شده"
    assert product.status == "inactive"


def test_guest_and_admin_session_do_not_receive_wholesale(client, ready_product, user_factory):
    _, product, _ = published(ready_product, client)
    client.force_authenticate(None)
    with patch(
        "marketplace.catalog.publication_api.default_storage.url", return_value="http://image"
    ):
        assert "wholesale" not in client.get(f"/api/v1/catalog/public/products/{product.pk}/").data
        client.force_login(user_factory(is_staff=True, is_superuser=True))
        assert "wholesale" not in client.get(f"/api/v1/catalog/public/products/{product.pk}/").data


def test_reviewer_can_read_only_referenced_images(client, ready_product, user_factory):
    from marketplace.operations.models import StoredFile

    actor, product, _ = published(ready_product, client)
    old_image = product.images[0]
    new = StoredFile.objects.create(
        owner=actor,
        business=product.business,
        purpose="product_image",
        object_key="new.png",
        content_type="image/png",
        size=100,
        sha256="b" * 64,
        scan_status="clean",
    )
    private = StoredFile.objects.create(
        owner=actor,
        business=product.business,
        purpose="identity",
        object_key="private.png",
        content_type="image/png",
        size=100,
        sha256="c" * 64,
        scan_status="clean",
    )
    url, _ = propose(client, product, {"profile": {"images": [str(new.pk)]}})
    submit_claim(client, url, user_factory(role="operator"))
    with patch("marketplace.operations.files.default_storage.url", return_value="http://image"):
        for pk in [old_image, str(new.pk)]:
            assert client.post(f"/api/v1/files/{pk}/download/").status_code == 200
        assert client.post(f"/api/v1/files/{private.pk}/download/").status_code == 404


def test_retiring_pack_item_cannot_leave_invalid_price_minimum(client, ready_product):
    from marketplace.catalog.models import FixedPack, PackItem

    actor, product, variant = published(ready_product, client)
    plan = product.sales_plan
    tier = plan.tiers.get()
    tier.min_quantity = 1
    tier.save()
    pack = FixedPack.objects.create(plan=plan, code="single", name="تکی")
    PackItem.objects.create(pack=pack, variant=variant, quantity=1)
    changes = {
        "variants": [
            {
                "sku": "replacement",
                "supply": {
                    "mode": "ready",
                    "ready_stock": 10,
                    "production_cap": 0,
                    "lead_time_days": 0,
                },
                "package": {
                    "weight_g": 500,
                    "length_mm": 100,
                    "width_mm": 100,
                    "height_mm": 100,
                    "package_count": 1,
                },
            }
        ]
    }
    response = client.post(
        f"/api/v1/catalog/products/{product.pk}/revisions/", changes, format="json"
    )
    assert response.status_code == 400
    variant.refresh_from_db()
    assert variant.is_active
    assert product.variants.count() == 1
