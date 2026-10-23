import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pytest
from django.db import IntegrityError, close_old_connections, transaction
from django.utils import timezone

from marketplace.accounts.business_services import create_business
from marketplace.accounts.role_services import set_operator
from marketplace.catalog.models import (
    Attribute,
    AttributeOption,
    Category,
    FixedPack,
    PackItem,
    PriceTier,
    Product,
    ProductRevision,
    SalesPlan,
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


@pytest.mark.parametrize(
    "section", ["business", "content", "variants", "supply", "pricing", "shipping"]
)
def test_publication_readiness_shares_submit_checks_without_side_effects(
    client, ready_product, section
):
    actor, _, product, variant, _, _ = ready_product
    client.force_authenticate(actor)
    url = BASE + f"products/{product.pk}/"
    assert client.get(url + "readiness/").data["ready"] is True
    if section == "business":
        product.business.status = "draft"
        product.business.save()
        edited = client.patch(
            url, {"description": "ویرایش مجاز پیش از تأیید کسب‌وکار"}, format="json"
        )
        assert edited.status_code == 200, edited.data
    elif section == "content":
        product.images = []
        product.save()
    elif section == "variants":
        variant.is_active = False
        variant.disabled_code = "producer_disabled"
        variant.status_reason = "test unavailable"
        variant.save()
    elif section == "supply":
        variant.package.delete()
    elif section == "pricing":
        product.sales_plan.tiers.all().delete()
    else:
        product.shipping.services.clear()
    before = AuditEvent.objects.count()
    result = client.get(url + "readiness/")
    assert result.status_code == 200, result.data
    assert result["Cache-Control"] == "no-store"
    assert result.data["ready"] is False
    assert {row["code"]: row["passed"] for row in result.data["checks"]}[section] is False
    assert AuditEvent.objects.count() == before
    product.refresh_from_db()
    assert product.status == "draft"
    assert client.post(url + "submit/").status_code == 400
    product.refresh_from_db()
    assert product.status == "draft"


def test_readiness_is_private_to_the_producer_and_review_report_is_assignee_only(
    client, ready_product, user_factory
):
    actor, owner, product, *_ = ready_product
    url = BASE + f"products/{product.pk}/readiness/"
    assert client.get(url).status_code == 401
    for other in [user_factory(), user_factory(role="operator"), owner]:
        client.force_authenticate(other)
        assert client.get(url).status_code == 404
    product.status = "pending"
    product.assigned_to = owner
    product.save()
    client.force_authenticate(owner)
    result = client.get(BASE + f"review-products/{product.pk}/")
    assert result.status_code == 200
    assert result.data["readiness"]["ready"] is True
    client.force_authenticate(user_factory(role="operator"))
    assert client.get(BASE + f"review-products/{product.pk}/").status_code == 404
    client.force_authenticate(actor)
    product.business.status = "suspended"
    product.business.save()
    assert client.get(url).status_code == 403


def test_private_preview_uses_real_catalog_projection_and_keeps_draft_out_of_public(
    client, ready_product, user_factory
):
    actor, owner, product, variant, *_ = ready_product
    private = BASE + f"products/{product.pk}/preview/"
    assert client.get(private).status_code == 401
    client.force_authenticate(actor)
    with patch(
        "marketplace.catalog.publication_api.default_storage.url", return_value="http://test/image"
    ):
        response = client.get(private)
    assert response.status_code == 200, response.data
    assert response["Cache-Control"] == "no-store"
    assert response.data["published_at"] is None
    assert response.data["manufacturer"]["verified"] is True
    assert response.data["variants"][0]["id"] == str(variant.pk)
    assert response.data["variants"][0]["orderable"] is True
    assert response.data["wholesale"]["tiers"][0]["effective_prices"][0]["unit_price_irr"] == 1000
    assert client.get(BASE + f"public/products/{product.pk}/").status_code == 404
    # Platform duties do not remove the same user's own manufacturer access.
    set_operator(actor=owner, user_id=actor.pk, enabled=True, reason="dual role preview")
    with patch(
        "marketplace.catalog.publication_api.default_storage.url", return_value="http://test/image"
    ):
        assert client.get(private).status_code == 200
    product.business.status = "suspended"
    product.business.save()
    assert client.get(private).status_code == 403
    product.business.status = "verified"
    product.business.save()
    client.force_authenticate(user_factory())
    assert client.get(private).status_code == 404
    operator = user_factory(role="operator")
    client.force_authenticate(operator)
    assert client.get(private).status_code == 404
    product.status, product.assigned_to = "pending", operator
    product.save()
    with patch(
        "marketplace.catalog.publication_api.default_storage.url", return_value="http://test/image"
    ):
        assert client.get(private).status_code == 200
        client.force_authenticate(owner)
        assert client.get(private).status_code == 200
    product.business.status = "draft"
    product.business.save()
    client.force_authenticate(actor)
    with patch(
        "marketplace.catalog.publication_api.default_storage.url", return_value="http://test/image"
    ):
        assert client.get(private).data["manufacturer"]["verified"] is False


def publish(product):
    product.status, product.published_at = "published", timezone.now()
    product.save()


def get_public(client, params):
    with patch(
        "marketplace.catalog.publication_api.default_storage.url", return_value="http://test/image"
    ):
        return client.get(BASE + "public/products/", params)


def test_browse_pagination_normalized_relevance_and_metric_ordering(
    client, ready_product, user_factory, business_data
):
    _, _, template, *_ = ready_product
    # Cross the actual 24-row boundary with distinct publication times and metric ties.
    rows = []
    published_at = timezone.now() - timedelta(days=1)
    for index in range(26):
        product = (
            template
            if index == 0
            else Product.objects.create(
                business=template.business, category=template.category, images=template.images
            )
        )
        product.name = f"محصول کفش {index:02}"
        product.description = "توضیح عمومی"
        product.status = "published"
        product.published_at = published_at + timedelta(minutes=index)
        product.save()
        if index:
            variant = Variant.objects.create(
                product=product,
                business=product.business,
                sku=f"browse-{index}",
                combination="a" * 64,
            )
            days = (index % 3) * 4
            VariantSupply.objects.create(
                variant=variant,
                mode="production" if days else "ready",
                ready_stock=0 if days else 10,
                production_cap=10 if days else 0,
                lead_time_days=days,
            )
            VariantPackage.objects.create(
                variant=variant, weight_g=500, length_mm=100, width_mm=100, height_mm=100
            )
            plan = SalesPlan.objects.create(product=product, free_mix_min=2)
            PriceTier.objects.create(
                plan=plan, min_quantity=2, unit_price_irr=(index % 3 + 1) * 1000
            )
            # A cheaper later tier must never become the representative price.
            PriceTier.objects.create(plan=plan, min_quantity=20, unit_price_irr=100)
        rows.append(
            {
                "id": str(product.pk),
                "price": (index % 3 + 1) * 1000,
                "lead": (index % 3) * 4,
                "index": index,
            }
        )

    def pages(params):
        first = get_public(client, params)
        assert first.status_code == 200, first.data
        assert first.data["count"] == 26
        assert len(first.data["results"]) == 24
        assert first.data["previous"] is None
        next_query = parse_qs(urlparse(first.data["next"]).query)
        assert next_query == {**{key: [str(value)] for key, value in params.items()}, "page": ["2"]}
        second = get_public(client, {**params, "page": 2})
        assert second.status_code == 200, second.data
        assert len(second.data["results"]) == 2
        assert second.data["next"] is None and second.data["previous"]
        return first.data["results"] + second.data["results"]

    newest = [row["id"] for row in reversed(rows)]
    assert [row["id"] for row in pages({})] == newest
    assert [row["id"] for row in pages({"q": "محصول كفش"})] == newest
    # Name relevance precedes a newer description-only match; ties remain newest first.
    template.name = "کالای دیگر"
    template.description = "محصول کفش"
    template.published_at = published_at + timedelta(days=1)
    template.save()
    assert [row["id"] for row in pages({"q": "محصول كفش"})] == newest
    template.published_at = published_at
    template.save()
    public = pages({"sort": "lead_time"})
    expected_lead = sorted(rows, key=lambda row: (row["lead"], -row["index"]))
    assert [row["id"] for row in public] == [row["id"] for row in expected_lead]
    assert all("representative_price_irr" not in row and "wholesale" not in row for row in public)
    assert get_public(client, {"page": 3}).status_code == 404

    retailer = user_factory()
    business = create_business(actor=retailer, **{**business_data, "kind": "retailer"})
    business.status = "verified"
    business.save()
    client.force_authenticate(retailer)
    for sort, direction in [("price_asc", 1), ("price_desc", -1)]:
        priced = pages({"sort": sort})
        expected = sorted(rows, key=lambda row: (direction * row["price"], -row["index"]))
        assert [row["id"] for row in priced] == [row["id"] for row in expected]
        assert [row["representative_price_irr"] for row in priced] == [
            row["price"] for row in expected
        ]
    filtered = get_public(client, {"price_min": 2000, "price_max": 2000, "sort": "price_asc"})
    assert filtered.status_code == 200
    assert [row["id"] for row in filtered.data["results"]] == [
        row["id"] for row in reversed(rows) if row["price"] == 2000
    ]


def test_discovery_is_independent_of_results_and_only_names_public_manufacturers(
    client, ready_product, user_factory, business_data
):
    _, _, product, *_ = ready_product
    parent = Category.objects.create(name="پوشاک", slug="apparel")
    product.category.parent = parent
    product.category.save()
    publish(product)
    extra = Category.objects.create(name="کیف", slug="bags")
    hidden = Category.objects.create(name="متوقف", slug="retired", is_active=False)
    attribute = Attribute.objects.create(
        category=extra, code="color", name="رنگ", kind="choice", scope="variant", filterable=True
    )
    AttributeOption.objects.create(attribute=attribute, code="red", label="قرمز")
    Attribute.objects.create(
        category=extra,
        code="internal",
        name="غیرقابل فیلتر",
        kind="text",
        scope="product",
        filterable=False,
    )
    Attribute.objects.create(
        category=extra,
        code="old",
        name="قدیمی",
        kind="text",
        scope="product",
        filterable=True,
        is_active=False,
    )
    other = create_business(actor=user_factory(), **business_data)
    other.status = "verified"
    other.save()
    response = client.get(BASE + "public/discovery/", {"q": "no results", "page": 99})
    assert response.status_code == 200, response.data
    assert response["Cache-Control"] == "no-store"
    assert {row["id"] for row in response.data["categories"]} == {
        str(product.category_id),
        str(extra.pk),
        str(parent.pk),
    }
    category_ids = [row["id"] for row in response.data["categories"]]
    assert category_ids.index(str(parent.pk)) < category_ids.index(str(product.category_id))
    assert next(
        row for row in response.data["categories"] if row["id"] == str(product.category_id)
    )["path"] == [
        {"id": str(parent.pk), "name": parent.name, "slug": parent.slug},
        {
            "id": str(product.category_id),
            "name": product.category.name,
            "slug": product.category.slug,
        },
    ]
    assert str(hidden.pk) not in {row["id"] for row in response.data["categories"]}
    assert [row["id"] for row in response.data["attributes"]] == [str(attribute.pk)]
    assert response.data["attributes"][0]["options"][0]["label"] == "قرمز"
    assert response.data["manufacturers"] == [
        {"id": str(product.business_id), "name": product.business.name}
    ]
    product.category.is_active = False
    product.category.save()
    assert str(product.category_id) in {
        row["id"] for row in client.get(BASE + "public/discovery/").data["categories"]
    }
    product.business.status = "suspended"
    product.business.save()
    assert client.get(BASE + "public/discovery/").data["manufacturers"] == []
    assert str(product.category_id) not in {
        row["id"] for row in client.get(BASE + "public/discovery/").data["categories"]
    }


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
    definitions_before = (
        Category.objects.count(),
        Attribute.objects.count(),
        AttributeOption.objects.count(),
    )
    response = client.post(BASE + "proposals/", proposal_data(product), format="json")
    assert response.status_code == 201, response.data
    assert response.data["status"] == "pending"
    assert (
        Category.objects.count(),
        Attribute.objects.count(),
        AttributeOption.objects.count(),
    ) == definitions_before
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


@pytest.mark.parametrize("kind", ["category", "attribute", "option"])
def test_retired_taxonomy_keeps_public_history_and_blocks_new_use(client, ready_product, kind):
    actor, owner, product, variant, *_ = ready_product
    draft = Product.objects.create(
        business=product.business,
        category=product.category,
        name="پیش‌نویس دیگر",
        description="توضیح",
    )
    color = Attribute.objects.create(
        category=product.category, code="color", name="رنگ", kind="choice", scope="variant"
    )
    option = AttributeOption.objects.create(attribute=color, code="black", label="مشکی")
    Attribute.objects.create(
        category=product.category,
        code="size",
        name="سایز",
        kind="number",
        unit="EU",
        scope="variant",
    )
    variant.attributes = {"color": "black", "size": "42"}
    variant.save()
    publish(product)
    target, collection = {
        "category": (product.category, "categories"),
        "attribute": (color, "attributes"),
        "option": (option, "attribute-options"),
    }[kind]
    client.force_authenticate(owner)
    url = f"{BASE}{collection}/{target.pk}/"
    assert client.patch(url, {"is_active": False}, format="json").status_code == 400
    response = client.patch(
        url, {"is_active": False, "reason": "حفظ سابقه و توقف استفاده تازه"}, format="json"
    )
    assert response.status_code == 200, response.data
    product.refresh_from_db()
    assert product.status == "published"
    public = get_public(client, {})
    assert public.status_code == 200 and public.data["count"] == 1
    assert public.data["results"][0]["variants"][0]["display_attributes"][0]["value"] == "مشکی"
    assert AuditEvent.objects.filter(
        aggregate_id=target.pk,
        action="catalog.taxonomy_updated",
        actor=owner,
        reason="حفظ سابقه و توقف استفاده تازه",
    ).exists()
    client.force_authenticate(actor)
    if kind == "category":
        denied = client.post(
            BASE + "products/",
            {
                "business": str(product.business_id),
                "category": str(product.category_id),
                "name": "محصول تازه",
                "description": "توضیح",
            },
            format="json",
        )
    else:
        denied = client.post(
            BASE + f"products/{draft.pk}/variants/",
            {"sku": "NEW", "attributes": {"color": "black", "size": "43"}},
            format="json",
        )
    assert denied.status_code == 400, denied.data
    assert product.variants.count() == 1
    assert not draft.variants.exists()


@pytest.mark.parametrize("field,value", [("kind", "text"), ("scope", "product"), ("unit", "kg")])
def test_used_attribute_structure_is_immutable(client, ready_product, field, value):
    _, owner, product, *_ = ready_product
    attribute = Attribute.objects.create(
        category=product.category,
        code="size",
        name="سایز",
        kind="number",
        unit="EU",
        scope="variant",
    )
    publish(product)
    client.force_authenticate(owner)
    before = (attribute.kind, attribute.scope, attribute.unit)
    assert (
        client.patch(
            BASE + f"attributes/{attribute.pk}/", {field: value}, format="json"
        ).status_code
        == 409
    )
    attribute.refresh_from_db()
    assert (attribute.kind, attribute.scope, attribute.unit) == before


def test_used_category_moves_only_through_product_revision(client, ready_product):
    actor, owner, product, *_ = ready_product
    publish(product)
    old_category = product.category
    client.force_authenticate(owner)
    root = client.post(
        BASE + "categories/", {"name": "ریشه جدید", "slug": "new-root"}, format="json"
    )
    assert root.status_code == 201, root.data
    assert (
        client.patch(
            BASE + f"categories/{old_category.pk}/", {"parent": root.data["id"]}, format="json"
        ).status_code
        == 409
    )
    target = client.post(
        BASE + "categories/",
        {"name": "دسته مقصد", "slug": "target-leaf", "parent": root.data["id"]},
        format="json",
    )
    assert target.status_code == 201, target.data
    client.force_authenticate(actor)
    revision = client.post(
        BASE + f"products/{product.pk}/revisions/",
        {"profile": {"category": target.data["id"]}},
        format="json",
    )
    assert revision.status_code == 201, revision.data
    product.refresh_from_db()
    assert product.category_id == old_category.pk
    url = BASE + f"revisions/{revision.data['id']}/"
    assert client.post(url + "submit/").status_code == 200
    client.force_authenticate(owner)
    assert client.post(url + "claim/").status_code == 200
    approved = client.post(
        url + "review/",
        {"decision": "approved", "code": "category_migration", "reason": "انتقال بازنگری‌شده"},
        format="json",
    )
    assert approved.status_code == 200, approved.data
    product.refresh_from_db()
    assert str(product.category_id) == str(target.data["id"])
    assert (
        client.patch(
            BASE + f"categories/{old_category.pk}/",
            {"is_active": False, "reason": "پایان انتقال"},
            format="json",
        ).status_code
        == 200
    )
    response = get_public(client, {})
    assert response.status_code == 200 and response.data["count"] == 1
    assert str(response.data["results"][0]["category"]) == str(target.data["id"])


@pytest.mark.parametrize("kind", ["attribute", "option"])
def test_scoped_proposal_validation_and_rejection(client, ready_product, kind):
    actor, owner, product, *_ = ready_product
    attribute = Attribute.objects.create(
        category=product.category,
        code="color",
        name="رنگ",
        kind="choice",
        scope="variant",
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
    attribute.is_active = False
    attribute.save()
    assert get_public(client, {f"attr.{attribute.pk}": "red"}).status_code == 400
    product.status = "inactive"
    product.save()
    assert get_public(client, {"q": "کیف"}).data["count"] == 0


def test_numeric_attribute_filters_compare_numbers_and_reject_invalid_values(client, ready_product):
    _, _, product, variant, *_ = ready_product
    publish(product)
    attribute = Attribute.objects.create(
        category=product.category,
        code="weight",
        name="وزن",
        kind="number",
        scope="variant",
        unit="g",
        filterable=True,
    )
    variant.attributes = {"weight": "42"}
    variant.save()
    for value in ["42.0", "41,42", "4.2e1"]:
        assert get_public(client, {f"attr.{attribute.pk}": value}).data["count"] == 1
    assert get_public(client, {f"attr.{attribute.pk}": "41,43"}).data["count"] == 0
    for value in ["NaN", "Infinity", "abc", "1e99999", "1.1234567"]:
        assert get_public(client, {f"attr.{attribute.pk}": value}).status_code == 400


def test_public_details_project_managed_labels_historical_values_and_delivery_range(
    client, ready_product, django_assert_num_queries
):
    from marketplace.catalog.browsing import display_attributes, public_queryset

    _, _, product, variant, service, *_ = ready_product
    material = Attribute.objects.create(
        category=product.category,
        code="material",
        name="جنس",
        kind="choice",
        scope="product",
        is_active=False,
    )
    AttributeOption.objects.create(
        attribute=material, code="leather", label="چرم طبیعی", is_active=False
    )
    color = Attribute.objects.create(
        category=product.category,
        code="color",
        name="رنگ",
        kind="choice",
        scope="variant",
        position=1,
    )
    AttributeOption.objects.create(attribute=color, code="black", label="مشکی")
    Attribute.objects.create(
        category=product.category,
        code="weight",
        name="وزن",
        kind="number",
        scope="variant",
        unit="g",
    )
    product.attributes = {"material": "leather", "color": "black", "legacy": "قدیمی"}
    publish(product)
    variant.attributes = {"color": "black", "weight": "42"}
    variant.save()
    response = get_public(client, {})
    assert response.status_code == 200, response.data
    row = response.data["results"][0]
    assert row["display_attributes"] == [
        {"code": "material", "name": "جنس", "value": "چرم طبیعی", "unit": ""},
        {"code": "color", "name": "color", "value": "black", "unit": ""},
        {"code": "legacy", "name": "legacy", "value": "قدیمی", "unit": ""},
    ]
    assert row["variants"][0]["display_attributes"] == [
        {"code": "weight", "name": "وزن", "value": "42", "unit": "g"},
        {"code": "color", "name": "رنگ", "value": "مشکی", "unit": ""},
    ]
    assert row["manufacturer"]["logo_url"] is None
    assert row["shipping_services"] == [
        {
            "id": str(service.pk),
            "name": service.name,
            "kind": service.kind,
            "delivery_days_min": 1,
            "delivery_days_max": 7,
        }
    ]
    projected = public_queryset().get(pk=product.pk)
    with django_assert_num_queries(0):
        assert (
            display_attributes(projected, variant.attributes, "variant")
            == row["variants"][0]["display_attributes"]
        )


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


@pytest.mark.parametrize(
    "state",
    [
        "valid",
        "foreign_business",
        "foreign_owner",
        "pending",
        "rejected",
        "deleted",
        "wrong_purpose",
    ],
)
def test_public_manufacturer_only_projects_approved_clean_owned_logo(
    client, ready_product, user_factory, business_data, state
):
    actor, _, product, *_ = ready_product
    other = user_factory()
    file = StoredFile.objects.create(
        owner=other if state == "foreign_owner" else actor,
        business=create_business(actor=other, **business_data)
        if state == "foreign_business"
        else product.business,
        purpose="identity" if state == "wrong_purpose" else "business_logo",
        object_key="logo.png",
        content_type="image/png",
        size=100,
        sha256="b" * 64,
        scan_status=state if state in ["pending", "rejected"] else "clean",
        deleted_at=timezone.now() if state == "deleted" else None,
    )
    product.business.logo = file
    product.business.save(update_fields=["logo"])
    with patch(
        "marketplace.catalog.browsing.default_storage.url", return_value="http://test/logo"
    ) as url:
        response = client.get(f"{BASE}public/manufacturers/{product.business_id}/")
    assert response.status_code == 200, response.data
    assert response.data["logo_url"] == ("http://test/logo" if state == "valid" else None)
    assert url.call_count == (1 if state == "valid" else 0)


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


@pytest.mark.parametrize(
    "kind,status,role,suspended,expected",
    [
        ("retailer", "verified", None, False, 200),
        ("retailer", "draft", None, False, 403),
        ("retailer", "suspended", None, False, 403),
        ("retailer", "verified", None, True, 403),
        ("manufacturer", "verified", None, False, 403),
        (None, None, "operator", False, 403),
        (None, None, "owner", False, 403),
        (None, None, None, False, 401),
    ],
)
def test_retailer_estimate_requires_price_access_not_order_permission(
    client, ready_product, user_factory, business_data, kind, status, role, suspended, expected
):
    from marketplace.orders.models import Cart, Order, Reservation

    _, _, product, variant, *_ = ready_product
    publish(product)
    actor = user_factory(role=role) if kind or role else None
    if kind:
        business = create_business(actor=actor, **{**business_data, "kind": kind})
        business.status, business.controlled_access = status, False
        business.save()
    if suspended:
        actor.is_suspended = True
        actor.save()
    client.force_authenticate(actor)
    response = client.post(
        f"{BASE}public/products/{product.pk}/quote/",
        {
            "method": "free_mix",
            "items": [{"variant": str(variant.pk), "quantity": 2}],
        },
        format="json",
    )
    assert response.status_code == expected, response.data
    if expected == 200:
        assert response.data["goods_total_irr"] == 2000
        assert response.data["lead_time_days"] == 0
        assert response["Cache-Control"] == "no-store"
    assert not Cart.objects.exists()
    assert not Order.objects.exists()
    assert not Reservation.objects.exists()


def test_retailer_estimate_uses_current_supply_packs_and_publication(
    client, ready_product, user_factory, business_data
):
    from marketplace.orders.models import Reservation

    _, _, product, variant, *_ = ready_product
    publish(product)
    actor = user_factory()
    retailer = create_business(actor=actor, **{**business_data, "kind": "retailer"})
    retailer.status = "verified"
    retailer.save()
    VariantSupply.objects.filter(variant=variant).update(
        mode="hybrid", ready_stock=3, production_cap=10, lead_time_days=7
    )
    pack = FixedPack.objects.create(plan=product.sales_plan, code="pair", name="دو عدد")
    PackItem.objects.create(pack=pack, variant=variant, quantity=2)
    client.force_authenticate(actor)
    url = f"{BASE}public/products/{product.pk}/quote/"
    result = client.post(
        url, {"method": "fixed_pack", "pack_code": "pair", "pack_count": 2}, format="json"
    )
    assert result.status_code == 200, result.data
    assert result.data["quantity"] == 4
    assert result.data["goods_total_irr"] == 4000
    assert result.data["lead_time_days"] == 7
    assert result.data["lines"][0]["from_ready"] == 3
    assert result.data["lines"][0]["from_production"] == 1
    items = [{"variant": str(variant.pk), "quantity": 14}]
    assert (
        client.post(url, {"method": "free_mix", "items": items}, format="json").status_code == 409
    )
    items[0]["quantity"] = 1
    assert (
        client.post(url, {"method": "free_mix", "items": items}, format="json").status_code == 400
    )
    items[0]["quantity"] = 2
    variant.is_active = False
    variant.disabled_code = "producer_disabled"
    variant.save()
    assert (
        client.post(
            url, {"method": "fixed_pack", "pack_code": "pair", "pack_count": 1}, format="json"
        ).status_code
        == 409
    )
    product.status = "inactive"
    product.save()
    assert (
        client.post(url, {"method": "free_mix", "items": items}, format="json").status_code == 404
    )
    assert not Reservation.objects.exists()
    variant.supply.refresh_from_db()
    assert variant.supply.ready_stock == 3
