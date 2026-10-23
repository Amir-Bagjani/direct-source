"""Real Django HTTP server with a disposable PostgreSQL database, never the user's data.

Used by the real-backend Playwright configurations. Requires the backend's locked venv
and PostgreSQL. config.settings.test uses a locmem cache/email and a fast password hasher;
business/catalog validation and API handlers are unchanged. No fabricated endpoints.
"""

import json
import logging
import os
import shutil
import signal
import sys
import tempfile
import uuid
from pathlib import Path
from threading import Thread
from wsgiref.simple_server import WSGIRequestHandler, make_server

backend = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(backend))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.test"
if os.environ.get("E2E_POSTGRES_URL"):
    os.environ["DATABASE_URL"] = os.environ["E2E_POSTGRES_URL"]

if os.environ.get("E2E_CAPTURE_MAIL"):
    os.environ["ACCOUNT_LINK_BASE_URL"] = "http://localhost:3100/account/confirm"

if os.environ.get("E2E_CATALOG_MEDIA") == "1":
    os.environ.update(
        {
            "S3_BUCKET": f"test-catalog-{uuid.uuid4().hex}",
            "S3_ENDPOINT_URL": "http://127.0.0.1:9002",
            "S3_PUBLIC_ENDPOINT_URL": "http://127.0.0.1:9002",
            "S3_ACCESS_KEY": "local-marketplace",
            "S3_SECRET_KEY": "local-marketplace-password",
        }
    )

import django  # noqa: E402

django.setup()
logging.getLogger("marketplace.common.middleware").setLevel(logging.WARNING)

from django.core.wsgi import get_wsgi_application  # noqa: E402
from django.db import connection  # noqa: E402


class QuietHandler(WSGIRequestHandler):
    def log_message(self, *_args):
        pass


server = None


def stop(*_args):
    if server is None:
        raise KeyboardInterrupt
    # Finish the current WSGI request before cleaning its disposable database and bucket.
    Thread(target=server.shutdown, daemon=True).start()


# Never reuse/drop an existing test database or change the running application's DB.
original_name = connection.settings_dict["NAME"]
test_name = os.environ.get("E2E_DATABASE_NAME", f"test_frontend_{uuid.uuid4().hex}")
if not test_name.startswith("test_frontend_") or not test_name.replace("_", "").isalnum():
    raise RuntimeError("Unsafe test database name")
connection.settings_dict["TEST"]["NAME"] = test_name
connection.creation.create_test_db(verbosity=0, autoclobber=False)


def seed_catalog():
    from django.utils import timezone

    from marketplace.accounts.business_services import create_business
    from marketplace.accounts.models import PlatformRole, User
    from marketplace.catalog.models import (
        Attribute,
        AttributeOption,
        Category,
        FixedPack,
        PackItem,
        PriceTier,
        Product,
        SalesPlan,
        Variant,
        VariantSupply,
    )
    from marketplace.logistics.models import (
        ProductShipping,
        ShippingService,
        Tariff,
        VariantPackage,
    )
    from marketplace.logistics.services import activate_tariff

    owner = User.objects.create_user(
        mobile="+989120000002",
        first_name="Catalog",
        last_name="Owner",
        password="Catalog-e2e-password-2026!",
    )
    retailer_owner = User.objects.create_user(
        mobile="+989120000003",
        first_name="Verified",
        last_name="Retailer",
        password="Retailer-e2e-password-2026!",
    )
    operator = User.objects.create_user(
        mobile="+989120000004",
        first_name="Catalog",
        last_name="Operator",
        password="Operator-e2e-password-2026!",
    )
    PlatformRole.objects.create(user=operator, role="operator", is_active=True)
    business = create_business(
        actor=owner,
        name="چرم آفتاب",
        kind="manufacturer",
        phone="02112345678",
        description="تولیدکنندهٔ کیف و کفش چرمی",
        address={"province": "تهران", "city": "تهران", "address": "نشانی خصوصی تست"},
    )
    business.status = "verified"
    business.first_verified_at = timezone.now()
    business.save(update_fields=["status", "first_verified_at", "updated_at"])
    retailer = create_business(
        actor=retailer_owner,
        name="فروشگاه آزمون",
        kind="retailer",
        phone="02187654321",
        description="خرده‌فروش تأییدشدهٔ آزمون کاتالوگ",
        address={"province": "تهران", "city": "تهران", "address": "نشانی خصوصی خرده‌فروش"},
    )
    retailer.status = "verified"
    retailer.first_verified_at = timezone.now()
    retailer.save(update_fields=["status", "first_verified_at", "updated_at"])
    root = Category.objects.create(name="کفش", slug="shoes")
    category = Category.objects.create(name="کفش روزمره", slug="casual-shoes", parent=root)
    color = Attribute.objects.create(
        category=category, code="color", name="رنگ", kind="choice", scope="variant", filterable=True
    )
    AttributeOption.objects.create(attribute=color, code="black", label="مشکی")
    AttributeOption.objects.create(attribute=color, code="brown", label="قهوه‌ای")
    Attribute.objects.create(
        category=category,
        code="size",
        name="سایز",
        kind="number",
        scope="variant",
        unit="EU",
        filterable=True,
    )
    material = Attribute.objects.create(
        category=category,
        code="material",
        name="جنس",
        kind="choice",
        scope="product",
        filterable=True,
    )
    AttributeOption.objects.create(attribute=material, code="leather", label="چرم طبیعی")
    product = Product.objects.create(
        business=business,
        category=category,
        name="کفش چرمی آفتاب",
        description="کفش چرمی مناسب فروشگاه‌های خرده‌فروشی",
        brand="آفتاب",
        manufacturer_model="AF-101",
        attributes={"material": "leather"},
        status="published",
        published_at=timezone.now(),
    )
    variant = Variant.objects.create(
        product=product,
        business=business,
        sku="AF-101-BLK-42",
        attributes={"color": "black", "size": "42"},
        combination="a" * 64,
    )
    VariantSupply.objects.create(
        variant=variant,
        mode="hybrid",
        ready_stock=12,
        production_cap=40,
        lead_time_days=7,
    )
    plan = SalesPlan.objects.create(product=product, free_mix_min=2)
    PriceTier.objects.create(plan=plan, min_quantity=2, unit_price_irr=1_250_000)
    PriceTier.objects.create(plan=plan, min_quantity=12, unit_price_irr=1_100_000)
    pack = FixedPack.objects.create(plan=plan, code="pair", name="بستهٔ دو عددی")
    PackItem.objects.create(pack=pack, variant=variant, quantity=2)
    unavailable = Variant.objects.create(
        product=product,
        business=business,
        sku="AF-101-BLK-43",
        attributes={"color": "black", "size": "43"},
        combination="b" * 64,
    )
    VariantSupply.objects.create(variant=unavailable, mode="ready", ready_stock=0)
    service = ShippingService.objects.create(name="ارسال سراسری", kind="road", operational=True)
    shipping = ProductShipping.objects.create(product=product, origin=business.addresses.first())
    shipping.services.add(service)
    platform_owner = User.objects.create_user(
        mobile="+989120000005",
        first_name="Tariff",
        last_name="Owner",
        password="Tariff-owner-e2e-password-2026!",
    )
    PlatformRole.objects.create(user=platform_owner, role="owner", is_active=True)
    tariff = Tariff.objects.create(
        service=service,
        scope="national",
        min_weight_g=1,
        max_weight_g=100000,
        amount_irr=50000,
    )
    VariantPackage.objects.create(
        variant=variant,
        weight_g=900,
        length_mm=330,
        width_mm=210,
        height_mm=130,
    )
    VariantPackage.objects.create(
        variant=unavailable,
        weight_g=900,
        length_mm=330,
        width_mm=210,
        height_mm=130,
    )
    activate_tariff(
        actor=platform_owner, pk=tariff.pk, enabled=True, reason="E2E nationwide coverage"
    )
    Product.objects.create(
        business=business,
        category=category,
        name="محصول در انتظار بررسی",
        description="پیش‌نویس ارسالی برای آزمون بررسی اپراتور",
        brand="آفتاب",
        manufacturer_model="PENDING-1",
        status="pending",
        submitted_at=timezone.now(),
    )


def seed_catalog_media():
    import io

    from django.conf import settings
    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image, ImageDraw

    from marketplace.catalog.models import Product
    from marketplace.operations.files import upload_document

    product = Product.objects.get(name="کفش چرمی آفتاب")
    actor = product.business.membership.user
    files = []
    for label, color in [("FRONT", "white"), ("SIDE", "lightgray")]:
        # Diagnostic fixtures, not product photography; validation and ClamAV are real.
        picture = Image.new("RGB", (800, 800), color)
        drawing = ImageDraw.Draw(picture)
        drawing.rectangle((100, 250, 700, 550), outline="black", width=8)
        drawing.text((360, 390), f"CATALOG TEST {label}", fill="black")
        content = io.BytesIO()
        picture.save(content, format="PNG")
        file = upload_document(
            actor=actor,
            business=product.business,
            purpose="product_image",
            consent=settings.DOCUMENT_CONSENT_VERSION,
            upload=SimpleUploadedFile(f"{label}.png", content.getvalue(), content_type="image/png"),
        )
        if file.scan_status != "clean":
            raise RuntimeError("Catalogue fixture did not pass the real scanner")
        files.append(str(file.pk))
    product.images = files
    product.save(update_fields=["images"])
    variant = product.variants.get(sku="AF-101-BLK-42")
    variant.images = list(reversed(files))
    variant.save(update_fields=["images"])


if os.environ.get("E2E_CATALOG"):
    seed_catalog()
mail_dir = Path(tempfile.gettempdir()) / test_name
if os.environ.get("E2E_CAPTURE_MAIL"):
    mail_dir.mkdir(mode=0o700)
documents_dir = None
if os.environ.get("E2E_DOCUMENTS"):
    from django.conf import settings

    documents_dir = tempfile.TemporaryDirectory(prefix=test_name + "_files_")
    settings.STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": documents_dir.name},
        }
    }
    # File validation, consent, permissions and the real ClamAV service remain enabled.
application = get_wsgi_application()


def test_application(environ, start_response):
    response = application(environ, start_response)
    if os.environ.get("E2E_CAPTURE_MAIL"):
        from django.core import mail

        from marketplace.operations.tasks import deliver_email_outbox

        deliver_email_outbox()
        temporary = mail_dir / "pending.json"
        temporary.write_text(
            json.dumps(
                [
                    {"body": message.body, "to": message.to}
                    for message in getattr(mail, "outbox", [])
                ]
            )
        )
        temporary.chmod(0o600)
        temporary.replace(mail_dir / "outbox.json")
    return response


def seed_catalog_pagination():
    from datetime import timedelta

    from marketplace.catalog.models import Product, SalesPlan, Variant, VariantSupply
    from marketplace.logistics.models import ProductShipping, VariantPackage

    template = Product.objects.get(status="published")
    template.name = "Pagination Shoe 00"
    template.save()
    for index in range(1, 26):
        product = Product.objects.create(
            business=template.business,
            category=template.category,
            name=f"Pagination Shoe {index:02}",
            description=template.description,
            attributes=template.attributes,
            images=template.images,
            status="published",
            published_at=template.published_at + timedelta(seconds=index),
        )
        variant = Variant.objects.create(
            product=product,
            business=product.business,
            sku=f"PAGE-{index}",
            attributes={"color": "black", "size": "42"},
            combination="a" * 64,
        )
        VariantSupply.objects.create(variant=variant, mode="ready", ready_stock=20)
        VariantPackage.objects.create(
            variant=variant, weight_g=900, length_mm=330, width_mm=210, height_mm=130
        )
        plan = SalesPlan.objects.create(product=product, free_mix_min=2)
        plan.tiers.create(min_quantity=2, unit_price_irr=1_250_000)
        shipping = ProductShipping.objects.create(product=product, origin=template.shipping.origin)
        shipping.services.set(template.shipping.services.all())


media_bucket = None
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
try:
    if os.environ.get("E2E_CATALOG_MEDIA") == "1":
        from botocore.exceptions import ClientError
        from django.core.files.storage import default_storage

        candidate = default_storage.bucket
        try:
            candidate.meta.client.head_bucket(Bucket=candidate.name)
        except ClientError as error:
            if error.response["ResponseMetadata"]["HTTPStatusCode"] != 404:
                raise
        else:
            raise RuntimeError("Refusing to reuse an existing catalogue test bucket")
        candidate.create()
        media_bucket = candidate
        seed_catalog_media()
    if os.environ.get("E2E_CATALOG_PAGINATION") == "1":
        seed_catalog_pagination()
    with connection.cursor() as cursor:
        cursor.execute((Path(__file__).parent / "session-schema.sql").read_text())
    with make_server("127.0.0.1", 8001, test_application, handler_class=QuietHandler) as server:
        if os.environ.get("E2E_RECOVERY_PID_FILE"):
            with Path(os.environ["E2E_RECOVERY_PID_FILE"]).open("x") as pid_file:
                pid_file.write(str(os.getpid()))
        print("Isolated Django registration test server ready on port 8001", flush=True)
        server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    if os.environ.get("E2E_RECOVERY_PID_FILE"):
        Path(os.environ["E2E_RECOVERY_PID_FILE"]).unlink(missing_ok=True)
    try:
        if media_bucket is not None:
            media_bucket.objects.all().delete()
            media_bucket.delete()
    finally:
        connection.creation.destroy_test_db(original_name, verbosity=0)
    if documents_dir:
        documents_dir.cleanup()
    if os.environ.get("E2E_CAPTURE_MAIL"):
        shutil.rmtree(mail_dir)
