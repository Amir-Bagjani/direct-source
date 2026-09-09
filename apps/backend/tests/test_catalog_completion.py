import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from django.db import IntegrityError, close_old_connections, transaction
from django.utils import timezone

from marketplace.accounts.business_services import create_business
from marketplace.accounts.role_services import set_operator
from marketplace.catalog.models import (
    Attribute,
    AttributeOption,
    FixedPack,
    PackItem,
    Product,
    ProductRevision,
    TaxonomyProposal,
    Variant,
    VariantPrice,
    VariantSupply,
)
from marketplace.catalog.proposals import propose
from marketplace.common.exceptions import Conflict
from marketplace.logistics.models import VariantPackage
from marketplace.operations.models import AuditEvent, StoredFile
from tests.test_logistics_publication import ready_product as _ready_product

ready_product = _ready_product
pytestmark = pytest.mark.django_db
BASE = "/api/v1/catalog/"


def publish(product):
    product.status, product.published_at = "published", timezone.now()
    product.save()


def get_public(client, params):
    with patch(
        "marketplace.catalog.publication_api.default_storage.url", return_value="http://test/image"
    ):
        return client.get(BASE + "public/products/", params)


def test_delete_draft_confirmation_scope_and_cascade(client, ready_product, user_factory):
    actor, owner, product, variant, *_ = ready_product
    pack = FixedPack.objects.create(plan=product.sales_plan, code="pack", name="بسته")
    PackItem.objects.create(pack=pack, variant=variant, quantity=2)
    VariantPrice.objects.create(
        tier=product.sales_plan.tiers.first(), variant=variant, unit_price_irr=500
    )
    url = f"{BASE}products/{product.pk}/delete/"
    client.force_authenticate(user_factory())
    assert client.post(url, {"confirm": True}, format="json").status_code == 404
    client.force_authenticate(actor)
    assert client.post(url, {"confirm": False}, format="json").status_code == 400
    assert Product.objects.filter(pk=product.pk).exists()
    response = client.post(url, {"confirm": True}, format="json")
    assert response.status_code == 204, response.data
    assert not Product.objects.filter(pk=product.pk).exists()
    assert not Variant.objects.filter(pk=variant.pk).exists()
    assert StoredFile.objects.filter(pk=product.images[0]).exists()
    assert AuditEvent.objects.filter(
        aggregate_id=product.pk, action="catalog.product_deleted"
    ).exists()


@pytest.mark.parametrize(
    "state", ["pending", "changes_requested", "rejected", "published", "inactive", "draft"]
)
def test_ever_submitted_product_cannot_be_deleted(client, ready_product, state):
    actor, _, product, *_ = ready_product
    product.status, product.submitted_at = state, timezone.now()
    product.save()
    client.force_authenticate(actor)
    assert (
        client.post(
            f"{BASE}products/{product.pk}/delete/", {"confirm": True}, format="json"
        ).status_code
        == 409
    )


def test_variant_operator_disable_cannot_be_bypassed_and_last_disables_product(
    client, ready_product
):
    actor, owner, product, variant, *_ = ready_product
    publish(product)
    url = f"{BASE}products/{product.pk}/variants/{variant.pk}/activation/"
    client.force_authenticate(owner)
    assert client.post(url, {"enabled": False, "reason": "توقف"}, format="json").status_code == 200
    product.refresh_from_db()
    assert product.status == "inactive"
    client.force_authenticate(actor)
    assert (
        client.post(url, {"enabled": True, "reason": "رفع مشکل"}, format="json").status_code == 403
    )
    client.force_authenticate(owner)
    response = client.post(url, {"enabled": True, "reason": "رفع مشکل"}, format="json")
    assert response.status_code == 200, response.data
    assert (
        AuditEvent.objects.filter(
            aggregate_id=variant.pk, action="catalog.variant_status_changed"
        ).count()
        == 2
    )
    # Reactivating a variant does not bypass the separate product activation command.
    product.refresh_from_db()
    assert product.status == "inactive"


def test_variant_reactivation_validates_supply_and_archived_content(
    client, ready_product, user_factory
):
    actor, _, product, variant, *_ = ready_product
    publish(product)
    url = f"{BASE}products/{product.pk}/variants/{variant.pk}/activation/"
    client.force_authenticate(user_factory())
    assert client.post(url, {"enabled": False, "reason": "توقف"}, format="json").status_code == 404
    client.force_authenticate(actor)
    assert client.post(url, {"enabled": False}, format="json").status_code == 400
    assert client.post(url, {"enabled": False, "reason": "توقف"}, format="json").status_code == 200
    VariantSupply.objects.filter(variant=variant).update(ready_stock=0)
    assert client.post(url, {"enabled": True, "reason": "بازگشت"}, format="json").status_code == 400
    variant.refresh_from_db()
    assert not variant.is_active
    Variant.objects.filter(pk=variant.pk).update(disabled_code="revision_removed")
    assert client.post(url, {"enabled": True, "reason": "بازگشت"}, format="json").status_code == 409


def test_lifecycle_states_are_database_constrained(ready_product):
    _, _, _, variant, *_ = ready_product
    with pytest.raises(IntegrityError), transaction.atomic():
        Variant.objects.filter(pk=variant.pk).update(is_active=False, disabled_code="")
    with pytest.raises(IntegrityError), transaction.atomic():
        TaxonomyProposal.objects.create(
            business=variant.business,
            kind="category",
            name="نامعتبر",
            normalized_name="نامعتبر",
            description="توضیح",
            example="مثال",
            status="approved",
        )


@pytest.mark.parametrize("revision", [False, True])
def test_owner_reassignment_and_role_release(client, ready_product, user_factory, revision):
    actor, owner, product, *_ = ready_product
    old, new = user_factory(role="operator"), user_factory(role="operator")
    product.status, product.assigned_to = "pending", old
    product.save()
    obj = (
        ProductRevision.objects.create(
            product=product, status="pending", before={}, proposed={}, assigned_to=old
        )
        if revision
        else product
    )
    url = f"{BASE}{'revisions' if revision else 'products'}/{obj.pk}/reassign/"
    payload = {"user_id": str(new.pk), "reason": "تقسیم کار"}
    client.force_authenticate(old)
    assert client.post(url, payload, format="json").status_code == 403
    client.force_authenticate(owner)
    response = client.post(url, payload, format="json")
    assert response.status_code == 200, response.data
    client.force_authenticate(old)
    assert client.post(url.replace("reassign/", "claim/")).status_code == 409
    set_operator(actor=owner, user_id=new.pk, enabled=False, reason="پایان همکاری")
    obj.refresh_from_db()
    assert obj.assigned_to_id is None
    client.force_authenticate(owner)
    assert client.post(url, payload, format="json").status_code == 400


def proposal_data(product, **changes):
    return {
        "business": str(product.business_id),
        "kind": "category",
        "name": "کیف دستی",
        "description": "دسته تازه",
        "example": "کیف روزمره",
        **changes,
    }


def test_proposal_dedup_visibility_review_and_explicit_activation(
    client, ready_product, user_factory
):
    actor, owner, product, *_ = ready_product
    client.force_authenticate(actor)
    response = client.post(BASE + "proposals/", proposal_data(product), format="json")
    assert response.status_code == 201, response.data
    pid = response.data["id"]
    duplicate = client.post(
        BASE + "proposals/", proposal_data(product, name="كيف\u200cدستي"), format="json"
    )
    assert duplicate.status_code == 409, duplicate.data
    assert TaxonomyProposal.objects.count() == 1
    url = f"{BASE}proposals/{pid}/"
    client.force_authenticate(user_factory())
    assert client.get(url).status_code == 404
    client.force_authenticate(actor)
    assert (
        client.post(
            url + "review/", {"decision": "rejected", "reason": "رد"}, format="json"
        ).status_code
        == 403
    )
    client.force_authenticate(owner)
    assert (
        client.post(
            url + "review/", {"decision": "approved", "reason": "قبول"}, format="json"
        ).status_code
        == 400
    )
    result = client.post(
        url + "review/",
        {
            "decision": "approved",
            "reason": "قبول",
            "definition": {"name": "کیف دستی", "slug": "handbags", "is_active": True},
        },
        format="json",
    )
    assert result.status_code == 200, result.data
    from marketplace.catalog.models import Category

    category = Category.objects.get(pk=result.data["result_id"])
    assert category.is_active
    assert (
        client.post(
            url + "review/", {"decision": "rejected", "reason": "دوباره"}, format="json"
        ).status_code
        == 409
    )
    client.force_authenticate(actor)
    assert client.get(url).data["status"] == "approved"


def test_taxonomy_deactivation_requires_reason_and_keeps_published_product(client, ready_product):
    _, owner, product, *_ = ready_product
    publish(product)
    url = f"{BASE}categories/{product.category_id}/"
    client.force_authenticate(owner)
    assert client.patch(url, {"is_active": False}, format="json").status_code == 400
    response = client.patch(
        url, {"is_active": False, "reason": "ادغام دسته‌های تکراری"}, format="json"
    )
    assert response.status_code == 200, response.data
    product.refresh_from_db()
    assert product.status == "published"
    event = AuditEvent.objects.get(
        aggregate_id=product.category_id, action="catalog.taxonomy_updated"
    )
    assert event.reason == "ادغام دسته‌های تکراری"


@pytest.mark.parametrize("kind", ["attribute", "option"])
def test_scoped_proposal_validation_and_rejection(client, ready_product, kind):
    actor, owner, product, *_ = ready_product
    attribute = Attribute.objects.create(
        category=product.category, code="color", name="رنگ", kind="choice", scope="variant"
    )
    scope = (
        {"category": str(product.category_id)}
        if kind == "attribute"
        else {"attribute": str(attribute.pk)}
    )
    client.force_authenticate(actor)
    assert (
        client.post(
            BASE + "proposals/", proposal_data(product, kind=kind), format="json"
        ).status_code
        == 400
    )
    response = client.post(
        BASE + "proposals/", proposal_data(product, kind=kind, **scope), format="json"
    )
    assert response.status_code == 201, response.data
    client.force_authenticate(owner)
    assert (
        client.post(
            f"{BASE}proposals/{response.data['id']}/review/",
            {"decision": "rejected", "reason": "موجود است"},
            format="json",
        ).status_code
        == 200
    )


def test_public_browse_normalization_filters_and_confidentiality(client, ready_product):
    _, _, product, variant, *_ = ready_product
    product.name = "کیف دستی"
    publish(product)
    attribute = Attribute.objects.create(
        category=product.category,
        code="color",
        name="رنگ",
        kind="choice",
        scope="variant",
        filterable=True,
    )
    AttributeOption.objects.create(attribute=attribute, code="red", label="قرمز")
    variant.attributes = {"color": "red"}
    variant.save()
    for query in ["كيف\u200cدستي", "قرمز", variant.sku, product.business.name]:
        response = get_public(client, {"q": query})
        assert response.status_code == 200, response.data
        assert response.data["count"] == 1
        row = response.data["results"][0]
        assert "wholesale" not in row and "representative_price_irr" not in row
        assert row["variants"][0]["supply"]["ready_stock"] == 10
        assert "address" not in row["manufacturer"] and "phone" not in row["manufacturer"]
    params = {
        f"attr.{attribute.pk}": "blue,red",
        "supply": "ready,hybrid",
        "method": "free_mix",
        "category": str(product.category_id),
        "lead_max": 0,
    }
    assert get_public(client, params).data["count"] == 1
    params["method"] = "fixed_pack"
    assert get_public(client, params).data["count"] == 0
    for params in [{"price_min": 0}, {"sort": "price_desc"}, {"sort": "price_asc"}]:
        assert get_public(client, params).status_code == 403
    for params in [
        {"q": "ک"},
        {"category": "wrong"},
        {"lead_min": 10, "lead_max": 2},
        {"attr.bad": "red"},
        {f"attr.{uuid.uuid4()}": "red"},
        {"unknown": "x"},
    ]:
        assert get_public(client, params).status_code == 400
    product.status = "inactive"
    product.save()
    assert get_public(client, {"q": "کیف"}).data["count"] == 0


def test_representative_price_ignores_unavailable_variants_and_uses_first_tier(
    client, ready_product, user_factory, business_data
):
    _, _, product, variant, *_ = ready_product
    publish(product)
    other = Variant.objects.create(
        product=product, business=product.business, sku="unavailable", combination="b" * 64
    )
    VariantSupply.objects.create(variant=other, mode="ready", ready_stock=0)
    VariantPackage.objects.create(
        variant=other, weight_g=500, length_mm=100, width_mm=100, height_mm=100
    )
    first = product.sales_plan.tiers.first()
    VariantPrice.objects.create(tier=first, variant=other, unit_price_irr=100)
    product.sales_plan.tiers.create(min_quantity=20, unit_price_irr=300)
    retailer = user_factory()
    business = create_business(actor=retailer, **{**business_data, "kind": "retailer"})
    business.status = "verified"
    business.save()
    client.force_authenticate(retailer)
    response = get_public(client, {"sort": "price_asc", "price_min": 500})
    assert response.data["count"] == 1
    row = response.data["results"][0]
    assert row["representative_price_irr"] == 1000
    assert not next(v for v in row["variants"] if v["id"] == str(other.pk))["orderable"]
    assert get_public(client, {"price_max": 500}).data["count"] == 0
    business.status = "suspended"
    business.save()
    assert get_public(client, {"sort": "price_asc"}).status_code == 403


def test_public_manufacturer_profile_contains_only_public_summary(client, ready_product):
    _, _, product, *_ = ready_product
    product.business.first_verified_at = timezone.now()
    product.business.save()
    publish(product)
    url = f"{BASE}public/manufacturers/{product.business_id}/"
    response = client.get(url)
    assert response.status_code == 200, response.data
    assert response.data["product_count"] == 1
    assert response.data["categories"] == [
        {
            "id": str(product.category_id),
            "name": product.category.name,
            "slug": product.category.slug,
        }
    ]
    assert response.data["logo_url"] is None
    assert response.data["rating"] == {"average": None, "count": 0}
    assert "phone" not in response.data and "address" not in response.data
    product.business.status = "suspended"
    product.business.save()
    assert client.get(url).status_code == 404


@pytest.mark.django_db(transaction=True)
def test_concurrent_duplicate_proposals_have_one_winner(ready_product):
    actor, _, product, *_ = ready_product

    def attempt(_):
        close_old_connections()
        try:
            propose(
                actor=actor,
                data={
                    "business": product.business,
                    "kind": "category",
                    "name": "پیشنهاد",
                    "description": "توضیح",
                    "example": "نمونه",
                },
            )
            return "created"
        except Conflict:
            return "duplicate"
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, range(2))) == ["created", "duplicate"]
