# هستهٔ کاتالوگ — پیش‌نویس

پیاده‌شده در 2026-09-08. این برش محصول عمومی یا قابل‌سفارش منتشر نمی‌کند. همهٔ مسیرها Bearer می‌خواهند؛ session ادمین مجوز API نیست.

تمام مسیرها پیشوند `/api/v1/catalog/` دارند. فهرست‌ها صفحه‌بندی استاندارد دارند؛ POST ساخت، GET خواندن و PATCH ویرایش جزئی است.

| مسیر مجموعه / جزئیات | اختیار نوشتن | محتوا |
|---|---|---|
| categories/ و categories/{id}/ | owner/operator فعال | name، slug یکتا، parent، description، position، is_active |
| attributes/ و attributes/{id}/ | owner/operator فعال | category، code، name، description، kind، scope، unit، required، filterable، position، is_active |
| attribute-options/ و attribute-options/{id}/ | owner/operator فعال | attribute، code، label، position، is_active |
| products/ و products/{id}/ | مالک تولیدکنندهٔ غیرمعلق | business، category، name، description، brand، manufacturer_model، attributes، images |
| products/{id}/variants/ و products/{id}/variants/{id}/ | مالک همان محصول | sku، attributes، images؛ DELETE تنوع پیش‌نویس نیز مجاز است |

ساختار کاتالوگ برای کاربران واردشده قابل‌خواندن است؛ محصول فقط برای مالک آن. فیلتر `?category=UUID` برای ویژگی‌ها و `?attribute=UUID` برای مقدارها پشتیبانی می‌شود. ساختار کاتالوگ حذف API ندارد؛ از PATCH با `is_active` استفاده کنید و برای هر تغییر وضعیت `reason` بفرستید. جابه‌جایی دستهٔ استفاده‌شده و تبدیل آن به دستهٔ غیرنهایی ممنوع است. ویژگی‌ها صریحاً متعلق به دسته‌اند و ارث‌بری ندارند.

## جریان نمونه

اپراتور دستهٔ نهایی، سپس ویژگی و مقدار استاندارد آن را می‌سازد:

```json
{"category":"CATEGORY_UUID","code":"color","name":"رنگ","kind":"choice","scope":"variant","required":true}
```

```json
{"attribute":"ATTRIBUTE_UUID","code":"black","label":"مشکی"}
```

kind برابر choice، number یا text و scope برابر product یا variant است؛ unit فقط برای عدد الزامی است. تولیدکننده حتی پیش از تأیید Business محصول خصوصی می‌سازد:

```json
{"business":"BUSINESS_UUID","category":"CATEGORY_UUID","name":"کفش روزمره","description":"توضیحات محصول","attributes":{},"images":[]}
```

پیش‌نویس اولیه می‌تواند بدون تصویر و تنوع باشد؛ ویژگی‌های مشترک الزامی باید کامل باشند. وضعیت فقط draft است. سپس تنوع می‌سازد:

```json
{"sku":"SHOE-BLACK-01","attributes":{"color":"black"},"images":[]}
```

کلید attributes کد ویژگی و مقدار فهرستی کد مقدار استاندارد است. عدد به رشتهٔ اعشاری canonical تبدیل می‌شود؛ 1 و 1.00 یک ترکیب هستند. عدد متناهی با قدرمطلق حداکثر 10^18 و حداکثر شش رقم اعشار؛ متن ۱ تا ۱۲۰ نویسه. SKU با حذف فاصلهٔ ابتدا/انتها، حساس به حروف و یکتا در Business است. ترکیب ویژگی در Product یکتا است.

## تصاویر

از POST `/api/v1/businesses/{id}/files/` با multipart شامل file، purpose=product_image و consent_version جاری استفاده کنید. فقط تولیدکنندهٔ غیرمعلق؛ JPG/PNG/WebP حداکثر ۵MB و حداقل ۸۰۰×۸۰۰؛ ClamAV باید clean بدهد. شناسهٔ فایل clean را در images قرار دهید. فایل هویتی، کسب‌وکار دیگر، حذف‌شده یا pending مجاز نیست.

images آرایهٔ مرتب UUID است؛ نخستین تصویر محصول تصویر اصلی است. محصول حداکثر ۸ و تنوع حداکثر ۳ تصویر دارد. پس از افزودن تصویر، گالری نمی‌تواند خالی شود. effective_images خروجی تنوع بدون تصویر، شناسهٔ تصویر اصلی محصول است. تصاویر خصوصی‌اند و از endpoint فعلی download لینک کوتاه‌عمر می‌گیرند. provider در تست‌های این برش mock است.

## اجرا و مرز تحویل

با اجرای مجدد `./run-backend.sh`، image و migration جدید اعمال می‌شوند. دادهٔ شروع کیف/کفش با حساب پلتفرمی موجود؛ اجرای مجدد دادهٔ قبلی را تغییر نمی‌دهد:

```sh
docker compose -f apps/backend/compose.yaml --profile app exec web python manage.py seed_catalog +989xxxxxxxxx
```

ویژگی‌ها از API مدیریت می‌شوند. پیشنهاد taxonomy و حذف کامل پیش‌نویس اکنون در [قرارداد تکمیلی](catalog-browsing-lifecycle.md) پیاده شده‌اند. حمل، انتشار و بازنگری نیز در قراردادهای مرتبط پایین آمده‌اند؛ CAP-CAT-01..03 کامل‌اند.

روش فروش، برنامهٔ قیمت و عرضه اکنون در [قرارداد فروش](catalog-sales.md) پیاده شده‌اند.

به‌روزرسانی 2026-09-09: حمل و انتشار در [قرارداد حمل/انتشار](logistics-publication.md)، بازنگری و قیمت خرده‌فروش در [قرارداد بازنگری](catalog-revisions.md)، و مرور/چرخهٔ تکمیلی در [قرارداد نهایی PRD-02](catalog-browsing-lifecycle.md) پیاده شده‌اند.
