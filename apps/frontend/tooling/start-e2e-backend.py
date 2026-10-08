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
from wsgiref.simple_server import WSGIRequestHandler, make_server

backend = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(backend))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.test"
if os.environ.get("E2E_POSTGRES_URL"):
    os.environ["DATABASE_URL"] = os.environ["E2E_POSTGRES_URL"]

if os.environ.get("E2E_CAPTURE_MAIL"):
    os.environ["ACCOUNT_LINK_BASE_URL"] = "http://localhost:3100/account/confirm"

import django  # noqa: E402

django.setup()
logging.getLogger("marketplace.common.middleware").setLevel(logging.WARNING)

from django.core.wsgi import get_wsgi_application  # noqa: E402
from django.db import connection  # noqa: E402


class QuietHandler(WSGIRequestHandler):
    def log_message(self, *_args):
        pass


def stop(*_args):
    raise KeyboardInterrupt


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
        Category,
        PriceTier,
        Product,
        SalesPlan,
        Variant,
        VariantSupply,
    )
    from marketplace.logistics.models import ProductShipping, ShippingService, VariantPackage

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
    product = Product.objects.create(
        business=business,
        category=category,
        name="کفش چرمی آفتاب",
        description="کفش چرمی مناسب فروشگاه‌های خرده‌فروشی",
        brand="آفتاب",
        manufacturer_model="AF-101",
        attributes={"جنس": "چرم طبیعی"},
        status="published",
        published_at=timezone.now(),
    )
    variant = Variant.objects.create(
        product=product,
        business=business,
        sku="AF-101-BLK-42",
        attributes={"رنگ": "مشکی", "سایز": 42},
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
    service = ShippingService.objects.create(name="ارسال سراسری", kind="road", operational=True)
    shipping = ProductShipping.objects.create(product=product, origin=business.addresses.first())
    shipping.services.add(service)
    VariantPackage.objects.create(
        variant=variant,
        weight_g=900,
        length_mm=330,
        width_mm=210,
        height_mm=130,
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


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
try:
    with connection.cursor() as cursor:
        cursor.execute((Path(__file__).parent / "session-schema.sql").read_text())
    with make_server("127.0.0.1", 8001, test_application, handler_class=QuietHandler) as server:
        print("Isolated Django registration test server ready on port 8001", flush=True)
        server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    connection.creation.destroy_test_db(original_name, verbosity=0)
    if documents_dir:
        documents_dir.cleanup()
    if os.environ.get("E2E_CAPTURE_MAIL"):
        shutil.rmtree(mail_dir)
