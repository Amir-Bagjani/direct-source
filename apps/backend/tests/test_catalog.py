import io
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from PIL import Image

from marketplace.accounts.business_services import create_business
from marketplace.catalog.models import Attribute, AttributeOption, Category, Product, Variant
from marketplace.operations.models import AuditEvent, StoredFile

pytestmark = pytest.mark.django_db
BASE = "/api/v1/catalog/"


@pytest.fixture
def catalog(user_factory, business_data):
    actor = user_factory()
    business = create_business(actor=actor, **business_data)
    category = Category.objects.create(name="کفش", slug="shoes")
    color = Attribute.objects.create(
        category=category, code="color", name="رنگ", kind="choice", scope="variant"
    )
    AttributeOption.objects.create(attribute=color, code="black", label="مشکی")
    AttributeOption.objects.create(attribute=color, code="white", label="سفید")
    return actor, business, category


def create_product(client, catalog, **extra):
    actor, business, category = catalog
    client.force_authenticate(actor)
    data = {
        "business": str(business.pk),
        "category": str(category.pk),
        "name": "کفش",
        "description": "کفش روزمره",
        **extra,
    }
    response = client.post(BASE + "products/", data, format="json")
    assert response.status_code == 201, response.data
    return response.data


def test_private_draft_variants_and_business_sku(client, catalog, user_factory):
    product = create_product(client, catalog)
    endpoint = BASE + f"products/{product['id']}/variants/"
    payload = {"sku": "SHOE-1", "attributes": {"color": "black"}}
    assert client.post(endpoint, payload, format="json").status_code == 201
    assert client.post(endpoint, {**payload, "sku": "SHOE-2"}, format="json").status_code == 400
    assert (
        client.post(
            endpoint, {**payload, "attributes": {"color": "white"}}, format="json"
        ).status_code
        == 400
    )
    other = create_product(client, catalog)
    assert (
        client.post(BASE + f"products/{other['id']}/variants/", payload, format="json").status_code
        == 400
    )
    client.force_authenticate(user_factory())
    assert client.get(BASE + f"products/{product['id']}/").status_code == 404
    assert client.get(endpoint).status_code == 404
    assert client.post(endpoint, payload, format="json").status_code == 404
    client.force_authenticate(None)
    assert client.get(BASE + "products/").status_code == 401
    assert AuditEvent.objects.filter(action="catalog.product_created").count() == 2


def test_owner_receives_lifecycle_reasons_but_cannot_forge_them(client, catalog):
    product = create_product(client, catalog)
    obj = Product.objects.get(pk=product["id"])
    obj.decision_code, obj.decision_reason = "content_incomplete", "اصلاح تصاویر"
    obj.save()
    url = BASE + f"products/{obj.pk}/"
    response = client.patch(
        url,
        {
            "brand": "",
            "manufacturer_model": "",
            "decision_reason": "forged",
            "decision_code": "approved",
            "status": "published",
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.data["decision_reason"] == "اصلاح تصاویر"
    assert response.data["decision_code"] == "content_incomplete"
    assert response.data["status"] == "draft"
    assert response.data["submitted_at"] is None
    assert response.data["brand"] == response.data["manufacturer_model"] == ""


def test_taxonomy_permissions_cycles_and_used_structure(client, catalog, user_factory):
    actor, business, category = catalog
    client.force_authenticate(actor)
    assert client.post(BASE + "categories/", {"name": "کیف", "slug": "bags"}).status_code == 403
    create_product(client, catalog)
    client.force_authenticate(user_factory(role="operator"))
    assert (
        client.patch(
            BASE + f"categories/{category.pk}/", {"parent": str(category.pk)}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.post(
            BASE + "categories/",
            {"name": "فرزند", "slug": "child", "parent": str(category.pk)},
            format="json",
        ).status_code
        == 409
    )
    attribute = category.attributes.get()
    assert (
        client.patch(
            BASE + f"attributes/{attribute.pk}/", {"scope": "product"}, format="json"
        ).status_code
        == 409
    )
    response = client.patch(
        BASE + f"attributes/{attribute.pk}/", {"name": "رنگ جدید"}, format="json"
    )
    assert response.status_code == 200
    assert client.delete(BASE + f"categories/{category.pk}/").status_code == 405


def test_category_and_producer_guards(client, catalog):
    actor, business, category = catalog
    client.force_authenticate(actor)
    data = {
        "business": str(business.pk),
        "category": str(category.pk),
        "name": "کفش",
        "description": "توضیح",
    }
    Category.objects.create(name="فرزند", slug="child", parent=category)
    assert client.post(BASE + "products/", data, format="json").status_code == 400
    category.children.all().delete()
    category.is_active = False
    category.save()
    assert client.post(BASE + "products/", data, format="json").status_code == 400
    category.is_active = True
    category.save()
    for kind, status in [("retailer", "draft"), ("manufacturer", "suspended")]:
        business.kind, business.status = kind, status
        business.save()
        assert client.post(BASE + "products/", data, format="json").status_code == 403


def test_canonical_numbers_and_required_attributes(client, catalog):
    category = catalog[2]
    Attribute.objects.create(
        category=category, code="length", name="طول", kind="number", unit="cm", scope="variant"
    )
    product = create_product(client, catalog)
    endpoint = BASE + f"products/{product['id']}/variants/"
    for values in [
        {},
        {"color": "unknown"},
        {"color": "black", "length": "NaN"},
        {"color": "black", "length": True},
    ]:
        assert (
            client.post(endpoint, {"sku": "1", "attributes": values}, format="json").status_code
            == 400
        )
    data = {"sku": "1", "attributes": {"color": "black", "length": "1.00"}}
    assert client.post(endpoint, data, format="json").status_code == 201
    data.update(sku="2", attributes={"color": "black", "length": 1})
    assert client.post(endpoint, data, format="json").status_code == 400


def test_image_limits_ownership_and_fallback(client, catalog, user_factory, business_data):
    actor, business, _ = catalog
    file = StoredFile.objects.create(
        owner=actor,
        business=business,
        purpose="product_image",
        object_key="test/product.png",
        size=100,
        sha256="a" * 64,
        content_type="image/png",
        scan_status="clean",
        consent_version="test",
    )
    product = create_product(client, catalog, images=[str(file.pk)])
    endpoint = BASE + f"products/{product['id']}/variants/"
    variant = client.post(endpoint, {"sku": "1", "attributes": {"color": "black"}}, format="json")
    assert variant.status_code == 201
    assert variant.data["effective_images"] == [str(file.pk)]
    detail = BASE + f"products/{product['id']}/"
    assert client.patch(detail, {"images": []}, format="json").status_code == 400
    file.purpose = "identity"
    file.save()
    assert client.patch(detail, {"images": [str(file.pk)]}, format="json").status_code == 400
    file.purpose, file.scan_status = "product_image", "pending"
    file.save()
    assert client.patch(detail, {"images": [str(file.pk)]}, format="json").status_code == 400
    assert client.delete(endpoint + f"{variant.data['id']}/").status_code == 204


def test_image_upload_validation_reuses_scanner(client, catalog, settings):
    actor, business, _ = catalog
    client.force_authenticate(actor)
    endpoint = f"/api/v1/businesses/{business.pk}/files/"

    def upload(size):
        stream = io.BytesIO()
        Image.new("RGB", size).save(stream, "PNG")
        return {
            "file": SimpleUploadedFile("image.png", stream.getvalue(), content_type="image/png"),
            "purpose": "product_image",
            "consent_version": settings.DOCUMENT_CONSENT_VERSION,
        }

    with (
        patch(
            "marketplace.operations.files.default_storage.save", return_value="private/product.png"
        ),
        patch("marketplace.operations.files.scan", return_value=True) as scanner,
    ):
        assert client.post(endpoint, upload((100, 100)), format="multipart").status_code == 400
        scanner.assert_not_called()
        assert client.post(endpoint, upload((800, 800)), format="multipart").status_code == 201
        scanner.assert_called_once()


def test_database_rejects_duplicate_sku(client, catalog):
    product = create_product(client, catalog)
    obj = Product.objects.get(pk=product["id"])
    Variant.objects.create(product=obj, business=obj.business, sku="1", combination="a" * 64)
    with pytest.raises(IntegrityError), transaction.atomic():
        Variant.objects.create(product=obj, business=obj.business, sku="1", combination="b" * 64)


def test_seed_is_idempotent_and_taxonomy_creation(client, user_factory):
    from django.core.management import call_command

    actor = user_factory(role="operator")
    call_command("seed_catalog", actor.mobile)
    call_command("seed_catalog", actor.mobile)
    assert Category.objects.count() == 2
    client.force_authenticate(actor)
    category = Category.objects.get(slug="bags")
    response = client.post(
        BASE + "attributes/",
        {
            "category": str(category.pk),
            "code": "material",
            "name": "جنس",
            "kind": "choice",
            "scope": "product",
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    option = client.post(
        BASE + "attribute-options/",
        {"attribute": response.data["id"], "code": "leather", "label": "چرم"},
        format="json",
    )
    assert option.status_code == 201, option.data
    assert client.get(BASE + "attributes/", {"category": str(category.pk)}).data["count"] == 1
    event = AuditEvent.objects.filter(
        action="catalog.taxonomy_created", aggregate_id=option.data["id"]
    ).get()
    assert event.after["code"] == "leather"
