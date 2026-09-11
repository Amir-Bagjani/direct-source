# بک‌اند Django
Python 3.13.14، Django 5.2.17 و تمام dependencyها در `uv.lock` قفل‌اند. PostgreSQL تنها دیتابیس است. کد فعلی هویت، کاتالوگ، لجستیک، سفارش و مالی PRD-05 را پیاده می‌کند؛ وضعیت کل MVP در [برنامهٔ اجرا](../../docs/technical/backend/implementation-plan.md) است.

## اجرای محلی با یک دستور
فقط Docker Desktop باید نصب باشد. از ریشهٔ پروژه اجرا کنید:

```sh
./run-backend.sh

```
اسکریپت در macOS در صورت نیاز Docker Desktop را باز می‌کند، `.env` را فقط اگر وجود نداشته باشد از نمونه می‌سازد، imageها را build و PostgreSQL، Redis، MinIO، ClamAV و Mailpit را اجرا می‌کند. پس از آماده‌شدن providerها، migration و ساخت bucket خصوصی انجام می‌شود و Django، worker و beat بالا می‌آیند. نیازی به نصب Python یا اجرای چند terminal نیست. اولین اجرا برای دانلود imageها و تعریف‌های آنتی‌ویروس زمان بیشتری می‌خواهد؛ آمادگی providerها تا ۱۰ دقیقه انتظار دارد.

- بک‌اند و بررسی آمادگی: [http://localhost:8000/health/ready/](http://localhost:8000/health/ready/)

- صندوق ایمیل محلی: [http://localhost:8025](http://localhost:8025)

- کنسول MinIO: [http://localhost:9001](http://localhost:9001)

همان terminal لاگ سرویس‌ها را نشان می‌دهد. با `Ctrl+C` تمام کانتینرهای همین پروژه پایین می‌آیند؛ داده‌های PostgreSQL، فایل‌ها و تعریف‌های آنتی‌ویروس حفظ می‌شوند. خطای راه‌اندازی نیز cleanup را اجرا می‌کند. Docker Desktop و کانتینرهای پروژه‌های دیگر روشن می‌مانند. هم‌زمان فقط یک نمونه از launcher را اجرا کنید. پس از تغییر کد، آن را متوقف و دوباره اجرا کنید تا image جدید ساخته شود.

این Compose مخصوص توسعهٔ محلی است. کلیدهای نمونه برای production مناسب نیستند. اسکریپت قابلیت‌های پیاده‌شدهٔ فعلی را اجرا می‌کند؛ بخش‌های باز MVP در برنامهٔ اجرا مشخص‌اند. برای فرمان مدیریتی هنگام روشن‌بودن stack، از `docker compose --profile full --profile app exec web ...` در پوشهٔ `apps/backend` استفاده کنید.

## آغاز عملیات
ابتدا از `POST /api/v1/auth/register/` یک حساب بسازید. مالک سامانه را فقط یک بار از فرمان bootstrap تعیین کنید:

```sh
docker compose --profile full --profile app exec web python manage.py bootstrap_owner +989xxxxxxxxx --reason 'راه‌اندازی اولیه'

```
این فرمان حساب تازه یا رمز پیش‌فرض نمی‌سازد؛ به حساب موجود نقش می‌دهد و audit ثبت می‌کند. `createsuperuser` فقط کاربر فنی Django Admin می‌سازد و خودکار نقش مالک پلتفرم نمی‌دهد. Admin اجازهٔ ویرایش دادهٔ حساس ندارد.

API و payloadها در [OpenAPI](../../docs/technical/api/openapi.yaml) و [قرارداد هویت](../../docs/technical/api/auth-and-trust.md) هستند. Next.js/BFF هنوز در این برش پیاده نشده؛ JWT به JavaScript مرورگر داده نشود. ایمیل محلی در Mailpit دیده می‌شود؛ صفحهٔ مصرف لینک در BFF باید token را به endpoint POST تأیید یا بازیابی ارسال کند.

## بررسی و تست
```sh
uv run python manage.py check --settings=config.settings.test
uv run python manage.py makemigrations --check --dry-run --settings=config.settings.test
uv run ruff check .
uv run ruff format --check .
uv run mypy marketplace config
uv run python manage.py spectacular --settings=config.settings.test --file ../../docs/technical/api/openapi.yaml --validate --fail-on-warn
uv run pytest --cov --cov-report=term-missing

```
pytest دیتابیس جداگانهٔ `test_marketplace` را روی PostgreSQL محلی می‌سازد؛ به دیتابیس واقعی اشاره ندهید. تست رقابت از connectionهای جدا و transaction واقعی استفاده می‌کند. S3/ClamAV/SMTP در تست‌های واحد mock/locmem هستند؛ این تست‌ها صحت اتصال provider واقعی را اثبات نمی‌کنند. CI نیز PostgreSQL واقعی، drift migration/schema، type/lint/coverage و اسکن dependency/secret را بررسی می‌کند.

## پیش از staging
از `config.settings.production` استفاده کنید؛ secrets مستقل، SMTP TLS، لینک HTTPS، PostgreSQL با verify-full، bucket خصوصی با رمزگذاری و ingress خصوصی Django لازم‌اند. BFF/CSRF، حذف کنترل‌شدهٔ مدارک و restore drill هنوز دروازه‌های بازند. این برش آمادهٔ پایلوت کامل بازارگاه نیست.

## هستهٔ کاتالوگ
APIهای دسته، ویژگی، محصول و تنوع زیر `/api/v1/catalog/` هستند؛ [راهنمای جریان](../../docs/technical/api/catalog-drafts.md). برای اعمال migration و کد جدید، launcher را متوقف و دوباره اجرا کنید. تولیدکننده پیش‌نویس خصوصی می‌سازد و فقط نسخهٔ تأییدشده در کاتالوگ عمومی دیده می‌شود.

برنامهٔ فروش، قیمت پلکانی، عرضه و پیش‌نمایش تولیدکننده نیز آماده‌اند: [نمونهٔ درخواست‌ها](../../docs/technical/api/catalog-sales.md). پیش‌نمایش رزرو یا سفارش ایجاد نمی‌کند.
حمل و انتشار اولیه نیز اضافه شده‌اند: [ترتیب ساخت خدمت، تعرفه و ارسال محصول برای بررسی](../../docs/technical/api/logistics-publication.md). endpoint عمومی `/api/v1/catalog/public/products/` است؛ هنوز پنل فرانت‌اند ساخته نشده.

بازنگری محتوای محصول و قیمت خرده‌فروش تأییدشده: [راهنمای API](../../docs/technical/api/catalog-revisions.md). جست‌وجو، فیلتر، عملیات مستقل تنوع، پیشنهاد taxonomy، حذف پیش‌نویس و بازتخصیص صف: [تکمیل PRD-02](../../docs/technical/api/catalog-browsing-lifecycle.md). برای استفاده از این تغییر، launcher را با Ctrl+C متوقف و دوباره اجرا کنید تا image و migrationهای catalog تا 0006 با هم به‌روز شوند.


## پرداخت، بازپرداخت و تسویه

[قرارداد مالی PRD-05](../../docs/technical/api/finance.md) مسیر پرداخت سفارش پذیرفته‌شده، صورتحساب، نرخ کارمزد، جبران و تسویه را توضیح می‌دهد. worker/beat فرمان `finance.process_orders` را هر ۶۰ ثانیه اجرا می‌کنند؛ اصل سند مالی ثابت است و تعدیل سند جدا می‌سازد. تسویهٔ معتبر، سفارش را هم به completed می‌برد. برای اجرای کد تازه در Compose، imageهای web/worker/beat را با launcher بازسازی کنید.
