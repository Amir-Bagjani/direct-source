# فرهنگ داده و طراحی PostgreSQL

## قرارداد عمومی

مدل‌های دامنه: `id uuid PK`، `created_at/updated_at timestamptz`. تاریخ تولد `date` میلادی. مبلغ `bigint` با CHECK غیرمنفی و `_rial`؛ تعداد integer مثبت. JSONB فقط snapshot نسخه‌دار یا payload حداقلی، نه جایگزین relation جستجوشونده. تمام FKهای Django index دارند؛ uniqueها index دوم نمی‌خواهند.

## اولین برش: هویت و اعتماد

| جدول | فیلدهای مهم | constraint / index / حریم |
|---|---|---|
| accounts_user | mobile، password hash، first_name، last_name، email، email_verified_at، is_active، is_suspended، terms_version، privacy_version، consented_at | mobile canonical `+989xxxxxxxxx` یکتا؛ email غیرخالی به‌شکل lowercase یکتا؛ نام/تماس خصوصی |
| accounts_platformrole | user FK، role، is_active | unique(user,role)؛ role فقط owner/operator؛ is_staff مجوز دامنه نیست |
| accounts_authsession | user FK، current_jti، expires_at، revoked_at | jti یکتا؛ JWT شامل sid؛ authorization نشست فعال را در DB می‌خواند |
| accounts_emailchallenge | user FK، purpose، token_digest، email، expires_at، consumed_at | digest یکتا؛ purpose verify/reset؛ raw فقط هنگام ارسال؛ TTL سی دقیقه؛ replay ممنوع |
| accounts_business | name، kind، status، phone، description، controlled_access، first_verified_at | kind manufacturer/retailer؛ status enum؛ index(status,created_at)؛ controlled_access مستقل |
| accounts_membership | user OneToOne، business OneToOne، role | دو unique برای مالکیت ۱:۱؛ role فقط owner در MVP؛ ساخت هم‌زمان transaction |
| accounts_address | business FK، province، city، address | خصوصی؛ شهر/استان فعلاً متن اجباری، taxonomy جغرافیایی قبل از تعرفه طراحی می‌شود |
| accounts_verificationapplication | business OneToOne، assigned_to FK nullable، submitted_at | یک پروندهٔ جاری با تاریخچهٔ audit؛ claim با lock پرونده |
| accounts_verificationsection | application FK، kind، status، data JSONB، reason | unique(application,kind)؛ identity/activity؛ اطلاعات هویت خصوصی؛ نسخه‌های مدرک حفظ می‌شوند |
| accounts_businessrevision | business FK، assigned_to، status، identity_status/activity_status و reason، before/proposed JSONB | unique شرطی برای یک بازنگری باز؛ index(status,created_at)؛ snapshotهای خصوصی؛ trigger منع تغییر/حذف نسخهٔ نهایی |
| operations_auditevent | actor FK nullable، action، aggregate_type، aggregate_id، reason، before، after، request_id | append-only با trigger PostgreSQL؛ index(aggregate_type,aggregate_id,created_at)؛ بدون رمز/token/تصویر/کدملی در payload |
| operations_outboxevent | recipient FK، topic، payload، delivered_at، attempts، available_at | index شرطی pending روی available_at؛ intent همراه commit دامنه؛ payload بدون secret |
| operations_inboxnotification | event OneToOne، recipient FK، topic، payload | unique event برای تحویل یک‌بار؛ index(recipient,created_at) |

`operations_storedfile` مالک، Business، purpose، object_key یکتا، content_type، size با CHECK یک بایت تا ۱۰MiB، sha256، scan_status با CHECK، consent_version، legal_hold و deleted_at دارد. مدارک فعلی با UUIDهای اعتبارسنجی‌شده در دادهٔ بخش ارجاع می‌شوند؛ جدول عمومی Evidence برای دامنه‌های بعدی هنوز ساخته نشده است. حذف API فعال نیست. ظرفیت audit/outbox با pagination و batch محدود مهار می‌شود، نه حذف خودکار.

## قیود لازم ماژول‌های بعدی

- Catalog: unique SKU و combination تنوع؛ unique(product,tier_min)؛ حداقل پله مثبت؛ بازه‌ها مرتب؛ نسخهٔ مصوب قابل‌ارجاع.
- Supply: `available >= reserved >= 0`؛ رزرو یکتا برای OrderLine و نوع عرضه؛ ترتیب lock بر اساس UUID ثابت.
- Order: unique شماره نمایشی؛ unique(group,manufacturer)؛ کلید checkout scoped به Business و hash درخواست؛ snapshot مستقل از جداول زنده.
- Finance: unique payment/invoice/settlement برای Order؛ unique علت refund؛ جمع مبلغ‌ها سروری؛ اسناد الحاقی؛ نرخ در integer basis points.
- Shipping: بازهٔ وزن نیمه‌باز در هر نسخه/مسیر؛ منع overlap با exclusion constraint؛ مجموع ShipmentItem زیر lock ShippingGroup؛ ارتباط قلم به همان Order.
- Dispute: شمارش تجمعی ادعا و جبران زیر lock OrderLine؛ جلوگیری از ادعای تعداد دوباره؛ hold علت‌دار یکتا.
- Review: unique entitlement موضوع سفارش؛ نمرات CHECK ۱..۵؛ publication و moderation جدا.

## تراکنش و رشد

Isolation پیش‌فرض READ COMMITTED با `select_for_update` روی aggregate. ترتیب قفل: Userهای دخیل مرتب، Business، Application، Section؛ در تجارت Businessهای مرتب، Supplyهای مرتب، Order، فرزندان. I/O شبکه داخل lock ممنوع. deadline داخل lock با ساعت UTC مجدداً بررسی می‌شود. Retry محدود فقط deadlock/serialization failure و command idempotent.

Connection عمر صفر در Django برای آمادگی PgBouncer؛ pool واقعی باید با سقف اتصال hosting تنظیم شود. baseline ۱۰هزار User، ۲هزار Business، ۱۰۰هزار SKU، ۱۰۰۰ Order/day و رشد ۵برابر است. پارتیشن/shard فعلاً لازم نیست؛ ابتدا EXPLAIN (ANALYZE, BUFFERS) روی staging با حجم نماینده، سپس index/replica. دادهٔ authorization از replica/cache خوانده نمی‌شود.

## migration و بازیابی

Migration از صفر روی PostgreSQL واقعی در CI؛ `makemigrations --check` و تولید schema بدون drift. نسخهٔ لوکال PostgreSQL ۱۶ خط مبنای تست است و انتخاب hosting را الزام نمی‌کند. روی جداول حجیم تغییر به روش expand/backfill/contract، index concurrent و NOT VALID→VALIDATE انجام شود.

پیش از staging: backup رمزگذاری‌شده + WAL/PITR در failure domain جدا، تست restore دیتابیس و bucket، بازاعمال tombstone پیش از بازکردن دسترسی، اندازه‌گیری RPO/RTO و تعیین مالک عملیات. این موارد تا اجرای drill انجام‌شده محسوب نمی‌شوند.

## جداول هستهٔ کاتالوگ (2026-09-08)

| جدول | مالکیت و قیود |
|---|---|
| catalog_category | parent با PROTECT؛ slug یکتا؛ ترتیب/فعال‌بودن؛ چرخه و نهایی‌بودن در service |
| catalog_attribute | Category؛ UNIQUE(category, code)؛ CHECK نوع و scope؛ واحد فقط برای عدد |
| catalog_attributeoption | Attribute؛ UNIQUE(attribute, code)؛ حذف API ندارد |
| catalog_product | Business تولیدکننده و Category نهایی؛ CHECK وضعیت draft؛ attributes و images از نوع JSON |
| catalog_variant | Product و Business؛ UNIQUE(business, sku)، UNIQUE(product, combination)؛ ترکیب SHA-256 از JSON canonical |

همه UUID و زمان ایجاد/ویرایش دارند. JSON ویژگی‌ها با تعریف دسته/بخش اعتبارسنجی می‌شود. images آرایهٔ UUID فایل clean با purpose=product_image است؛ FK ندارد و حذف فایل آینده باید ارجاع‌ها را بررسی کند. Business تنوع برای قید SKU تکرار شده و فقط service آن را از Product می‌گیرد. مستقیم‌نویسی خارج از service مجاز نیست.

تغییر ساختاری ویژگی پس از وجود محصول در دسته محافظه‌کارانه محدود می‌شود. فرمان مدیریت taxonomy دسته‌ها را قفل می‌کند؛ نوشتن محصول/تنوع با قفل Business و Category هماهنگ است. قیمت، عرضه و نسخهٔ منتشرشده هنوز جدول اجرایی ندارند.
