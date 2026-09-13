# فرهنگ داده و طراحی PostgreSQL

## تکمیل نگهداری فایل — 2026-09-13

StoredFile در migration `operations/0010` دارای `purged_at` شد: `deleted_at` زمان تأیید حذف و قطع دسترسی است و `purged_at` پایان حذف از مخزن را ثبت می‌کند. classification از purpose مشتق می‌شود: identity/activity برابر restricted، سایر فایل‌ها private. `legal_hold` با فرمان مالک و دلیل تغییر می‌کند؛ پروندهٔ باز مانع تأیید حذف است. اصل metadata و FKها حفظ می‌شوند. رویدادهای deletion_approved، purged و tombstone_reapplied رد اجرای دستی و بازیابی را نگه می‌دارند؛ فایل‌های تاریخی با purged_at تهی نگهداری می‌شوند. [قرارداد و محدودیت‌ها](../backend/file-retention-runbook.md).

## برش اجرایی عملیات PRD-08 — 2026-09-13

| جدول | قرارداد |
| --- | --- |
| operations_workitem | نوع صف و UUID موجودیت یکتا؛ مسئول nullable؛ وضعیت دامنه در این جدول کپی نمی‌شود |
| operations_policyversion | scope مهلت/تحویل، snapshot تنظیمات، effective_at، actor و reason؛ append-only |
| operations_operationcommand | کلید UUID یکتا، hash درخواست و نتیجه؛ تکرار همسان idempotent، append-only |
| operations_suspension | دقیقاً یکی از User/Business؛ پیشنهاددهنده، مدارک، علت و وضعیت؛ حداکثر یک بررسی/تعلیق باز برای هر scope |
| operations_orderdisposition | زوج Suspension/Order یکتا؛ مرحله unpaid/paid/shipped، تصمیم، دلیل، عامل و مرجع مالی؛ تصمیم نهایی تغییرناپذیر |
| operations_auditevent | افزوده‌های actor_role، command_source و correlation_id؛ before/after و دلیل redacted |

Migrationهای `operations/0007..0009` ساختار و guardها را اعمال می‌کنند. نرخ کارمزد همچنان در `finance_commissionrate` نسخه‌دار است. [قرارداد عملیات و آمار](../api/operations-analytics.md).

## برش اجرایی مالی PRD-05 — 2026-09-11

Migrationهای `finance/0001..0002` و `orders/0006_order_completion` (status=completed، completed_at و حفاظت نهایی‌شدن سفارش):

| جدول | فیلدها و قیود |
| --- | --- |
| finance_financialevent | Order FK؛ kind payment/refund/adjustment/settlement؛ کلید UUID و request_hash؛ مرجع/دلیل/actor؛ currency=IRR و execution_mode=simulated؛ bigint اجزای کالا/دو کارمزد/حمل/جمع؛ snapshot نتیجهٔ باقی‌مانده |
| finance_invoice | event OneToOne؛ number یکتا؛ original FK برای تعدیل؛ lines؛ اصل و تعدیل append-only |
| finance_ledgerentry | event FK؛ account؛ amount_irr امضادار؛ ShippingGroup FK فقط برای logistics؛ جمع رویداد صفر و سرفصل‌ها منطبق بر اجزای رویداد |
| finance_commissionrate | نرخ صحیح basis points دو طرف، actor و reason؛ نسخهٔ جدید فعال، نسخهٔ قبلی ثابت |
| finance_compensationdecision | Order، مرجع یکتا در Order، source، actor/reason، retained تجمعی، refunded_groups، goods_override_irr فقط اصلاح دستی owner؛ append-only |
| finance_financehold | Order، مرجع یکتا، kind discrepancy/suspension/operational، reason، released_at؛ باز/رفع در service حسابرسی می‌شود |

payment و settlement هرکدام در Order یکتا هستند؛ `(order,kind,key)` و `(order,kind,reference)` نیز یکتا است. PostgreSQL تغییر/حذف event، invoice، ledger، نرخ و تصمیم را رد می‌کند. triggerهای deferred، پرداخت منطبق با snapshot و payment_reference سفارش، سند لازم، توازن دفتر، تعلق گروه حمل، سقف تجمعی بازپرداخت و کارمزدها، سقف ماندهٔ هر گروه و مبلغ نهایی تسویه را کنترل می‌کنند. تعدیل فقط به صورتحساب پرداخت همان Order ارجاع می‌دهد. مبلغ مالی و واحد API پسوند `_irr` دارد.

قفل مالی: User عامل → Businessهای دو طرف مرتب → ShippingService → Order. معیارهای eligibility/مجوز و اعتبار تصمیم در service اجرا می‌شوند؛ دسترسی مستقیم نوشتن به جداول مجاز نیست. [قرارداد اجرایی](../api/finance.md).


## برش سبد PRD-04

ادامهٔ اجرایی `orders/0003..0005`: `DeliveryAddress(retailer, details)`، `OrderGroup(cart OneToOne, retailer, idempotency_key, request_hash)` با کلید یکتای Business/key؛ `Order.group/commercial/response_deadline/payment_deadline/decision_reason`، `OrderLine.commercial`؛ `Reservation(line OneToOne, variant, ready_quantity, production_quantity, status)` و `CancellationRequest(order OneToOne, status, reason, decision_reason, deadline, refund_reference unique)`.

Triggerهای PostgreSQL مجموع رزرو/تخصیص را به عرضه محدود، تغییر مقدار رزرو و snapshot و سبد بسته را منع و گذارهای سفارش/لغو را کنترل می‌کنند. نرخ و مبلغ هر دو کارمزد در commercial ثابت است. عرضهٔ ذخیره‌شده مقدار کل شامل تعهدهاست؛ نمای قابل سفارش مقدار رزرو/تخصیص را کسر می‌کند. وضعیت لغو مستقل از وضعیت پرداخت است؛ refund_pending بازپرداخت انجام‌شده نیست.

| جدول | فیلدهای مهم | constraint / حریم |
| --- | --- | --- |
| orders_cart | retailer FK، is_active، destination JSONB، version | حداکثر یک سبد فعال برای هر retailer؛ نشانی و مشخصات گیرنده فقط برای مالک سبد |
| orders_cartselection | cart FK، product FK، selection JSONB، pack_composition JSONB، service FK nullable | یکتایی cart/product؛ انتخاب حداقلی روش و تعداد با ترکیب بسته برای تشخیص تغییر؛ FK محافظت‌شدهٔ محصول و خدمت |

Migration: `orders/0002`. selection ورودی تایپ‌شدهٔ API است و در هر mutation و preview با کاتالوگ جاری اعتبارسنجی می‌شود؛ منبع موجودی، قیمت یا رزرو نیست.

## قرارداد عمومی
مدل‌های دامنه: `id uuid PK`، `created_at/updated_at timestamptz`. تاریخ تولد `date` میلادی. مبلغ `bigint` با CHECK غیرمنفی و `_rial`؛ تعداد integer مثبت. JSONB فقط snapshot نسخه‌دار یا payload حداقلی، نه جایگزین relation جستجوشونده. تمام FKهای Django index دارند؛ uniqueها index دوم نمی‌خواهند.

## اولین برش: هویت و اعتماد
| جدول | فیلدهای مهم | constraint / index / حریم |
| --- | --- | --- |
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
| --- | --- |
| catalog_category | parent با PROTECT؛ slug یکتا؛ ترتیب/فعال‌بودن؛ چرخه و نهایی‌بودن در service |
| catalog_attribute | Category؛ UNIQUE(category, code)؛ CHECK نوع و scope؛ واحد فقط برای عدد |
| catalog_attributeoption | Attribute؛ UNIQUE(attribute, code)؛ حذف API ندارد |
| catalog_product | Business تولیدکننده و Category نهایی؛ CHECK چرخهٔ draft/pending/changes_requested/published/rejected/inactive؛ مسئول، زمان‌ها و آخرین دلیل تصمیم؛ attributes و images از نوع JSON |
| catalog_variant | Product و Business؛ UNIQUE(business, sku)، UNIQUE شرطی ترکیب فعال؛ is_active، disabled_code و status_reason؛ ترکیب SHA-256 از JSON canonical |

همه UUID و زمان ایجاد/ویرایش دارند. JSON ویژگی‌ها با تعریف دسته/بخش اعتبارسنجی می‌شود. images آرایهٔ UUID فایل clean با purpose=product_image است؛ FK ندارد و حذف فایل آینده باید ارجاع‌ها را بررسی کند. Business تنوع برای قید SKU تکرار شده و فقط service آن را از Product می‌گیرد. مستقیم‌نویسی خارج از service مجاز نیست.

تغییر ساختاری ویژگی پس از وجود محصول در دسته محافظه‌کارانه محدود می‌شود. فرمان مدیریت taxonomy دسته‌ها را قفل می‌کند؛ نوشتن محصول/تنوع با قفل Business و Category هماهنگ است. مدل‌های اجرایی قیمت، عرضه، انتشار و نسخه در بخش‌های بعد آمده‌اند.

## جداول فروش و عرضهٔ پیش‌نویس (2026-09-08)
| جدول | رابطه و قید |
| --- | --- |
| catalog_salesplan | OneToOne Product؛ free_mix_min تهی یا مثبت |
| catalog_fixedpack | FK Plan؛ code در برنامه یکتا |
| catalog_packitem | FK Pack و Variant (PROTECT)؛ تنوع در بسته یکتا، quantity مثبت |
| catalog_pricetier | FK Plan؛ min_quantity مثبت و در برنامه یکتا؛ unit_price_irr bigint مثبت |
| catalog_variantprice | FK Tier و Variant (PROTECT)؛ تنوع در پله یکتا؛ unit_price_irr bigint مثبت |
| catalog_variantsupply | OneToOne Variant؛ CHECK سازگاری mode با ready_stock، production_cap و lead_time_days |

همه از BaseModel (UUID و timestamp) استفاده می‌کنند. پایان پله مشتق‌شده است و ذخیره نمی‌شود؛ ارتباط یک‌محصولی ارجاع‌ها، حداقل اولین پله و نزولی‌بودن قیمت مؤثر در service تحت قفل Product بررسی می‌شوند. بازنویسی Plan، بسته‌ها و پله‌ها را در همان تراکنش بازسازی می‌کند؛ audit قبل/بعد پایدار است. رزرو/تخصیص سفارش در این جداول وجود ندارد و در فاز سفارش افزوده می‌شود.

## حمل و انتشار اولیه — 2026-09-09
ShippingService نام، kind داده‌محور، is_active و operational دارد. Tariff متعلق به خدمت، شامل scope، مسیر، بازهٔ بستهٔ وزن گرم، مبلغ ریال، وضعیت، زمان/عامل فعال‌سازی و source=manual_trial است. replaces پیوند M2M نسخه‌های جایگزین‌شده است. exclusion constraint با btree_gist روی خدمت/مسیر و int8range وزن (شرط active) از هم‌پوشانی جلوگیری می‌کند. trigger ویرایش محتوای فعال‌شده یا حذف آن را رد می‌کند؛ فقط active و updated_at قابل تغییرند.

ProductShipping رابطهٔ یک‌به‌یک Product با Address مبدأ (PROTECT) و M2M خدمات است. VariantPackage یک‌به‌یک Variant و شامل وزن گرم، سه بُعد میلی‌متر و تعداد بسته با CHECK مثبت است. مدل Product اکنون وضعیت‌های draft/pending/changes_requested/published/rejected/inactive و مسئول بررسی، زمان ارسال/انتشار، کد/توضیح آخرین تصمیم دارد. تاریخچهٔ کامل در AuditEvent و اطلاع‌رسانی در OutboxEvent است.

ترتیب قفل مشترک User→Business→Category (برای محتوا)→ShippingService→Product است؛ فرمان تعرفه Business/Category را قفل نمی‌کند. هم‌پوشانی بازه به معنی غیرفعال‌شدن کل تعرفهٔ قبلی است، نه شکستن خودکار بازه. اصل snapshot مالی سفارش هنوز پیاده نشده است.

## ProductRevision و تنوع بایگانی‌شده — 2026-09-09
ProductRevision به Product (PROTECT) و مسئول User (PROTECT) متصل است؛ before/proposed JSON، status، code و reason دارد. UNIQUE(product) فقط برای draft/pending/changes_requested و CHECK مجموعهٔ وضعیت‌ها اعمال می‌شود. trigger UPDATE/DELETE وضعیت نهایی approved/rejected/cancelled را رد می‌کند. history تصمیم‌ها در AuditEvent است.

Variant.is_active پیش‌فرض true دارد؛ UNIQUE(product, combination) به قید جزئی فعال‌ها تبدیل شد، اما UNIQUE(business, sku) شامل ردیف‌های بایگانی‌شده باقی ماند. حذف در بازنگری soft-delete است. بسته/قیمت اختصاصی هنوز FK به تنوع بایگانی‌شده دارند و در پاسخ قابل‌انتخاب فیلتر می‌شوند. هیچ ردیف سفارش بازنویسی نمی‌شود؛ سفارش هنوز پیاده نشده است.

قفل بازنگری User→Business→Category→ShippingService→Product→ProductRevision است. اعتبارسنجی پیشنهادی با اعمال داخلی و rollback savepoint از قواعد واقعی استفاده می‌کند؛ هیچ اثر خارجی داخل این savepoint وجود ندارد.

## تکمیل PRD-02 — 2026-09-10

| جدول / داده | رابطه و قید |
| --- | --- |
| catalog_taxonomyproposal | Business پیشنهاددهنده؛ kind از category/attribute/option؛ scope با Category یا Attribute؛ نام اصلی و normalized؛ وضعیت pending/approved/rejected؛ reviewer، reason و result_id؛ UNIQUE شرطی `(kind, scope_key, normalized_name)` برای پیشنهاد pending |
| catalog_variant | `disabled_code` منشأ producer/operator/revision و `status_reason` آخرین دلیل را نگه می‌دارند؛ CHECK سازگاری active/source، active combination یکتا و SKU بایگانی‌شده نیز غیرقابل استفادهٔ مجدد است |

پیشنهاد و ساخت Category/Attribute/Option مصوب در یک تراکنش و با قفل ساختار کاتالوگ انجام می‌شوند. result_id رابطهٔ polymorphic هدف است و FK ندارد؛ نوع هدف از kind مشخص می‌شود و AuditEvent سابقهٔ تصمیم را حفظ می‌کند. CHECKها ترکیب kind/scope و سازگاری pending/approved/rejected با reviewer/reason/result را کنترل می‌کنند و unique شرطی رقابت ثبت پیشنهاد مشابه را می‌بندد. migration برای تنوع‌های از قبل بایگانی‌شده disabled_code=`revision_removed` را پیش از افزودن CHECK backfill می‌کند.

حذف کامل فقط برای Product در draft بدون هرگونه زمان ارسال/انتشار و بدون ProductRevision مجاز است. ارجاع‌های داخلی برنامهٔ فروش پیش از cascade حذف می‌شوند؛ StoredFile به‌علت lifecycle مستقل حفظ می‌شود. وضعیت مستقل تنوع و بازتخصیص صف با قفل Userهای مرتب→Business→Category/Service→Product→Revision اجرا و همراه before/after حسابرسی می‌شوند.

مرور عمومی در این فاز جدول read model جدا ندارد. query پایه با index وضعیت/زمان Product محدود و روابط لازم prefetch می‌شوند؛ نرمال‌سازی، relevance و metric نماینده روی مجموعهٔ منتشرشدهٔ MVP محاسبه می‌شوند. این سقف آگاهانه باید با ۱۰۰هزار SKU و `EXPLAIN (ANALYZE, BUFFERS)` سنجیده شود؛ در صورت عبور از بودجه، ستون‌های search نرمال‌شده و read model/index PostgreSQL جای این projection را می‌گیرند.


## برش اجرایی لجستیک و تحویل — 2026-09-10

| مدل | قرارداد فیزیکی |
| --- | --- |
| `orders.Order` | manufacturer/retailer، مقصد JSONB؛ مرجع پرداخت UUID یکتا، paid_at و شروع آماده‌سازی؛ delivered_at/deadline یک‌بار؛ هنوز فاقد قیمت، cart و reservation |
| `orders.OrderLine` | Order/Variant با unique، SKU/quantity و production_quantity/lead_time_days تثبیت‌شده؛ prepared_quantity بین صفر و تعداد |
| `ShippingService` | بازهٔ delivery_days_min/max و محدودیت اختیاری max_weight_g |
| `Carrier` | name/kind/phone/is_active؛ M2M خدمات؛ بدون حساب کاربری |
| `ShippingGroup` / `ShippingGroupItem` | unique(order,origin,service)؛ snapshot خدمت، بسته، مسیر، تعرفه و مبلغ؛ هر OrderLine در یک گروه با همان تعداد؛ trigger تغییرناپذیری |
| `ShippingRequest` | OneToOne گروه؛ index(status,ready_at,id)؛ بسته/وزن واقعی، hold_reason، needs_assignment و ارجاع/نتیجهٔ لغو |
| `CarrierAssignment` | درخواست، carrier، actor، reason، بازهٔ جمع‌آوری و snapshot حمل‌کننده/مأمور؛ append-only |
| `Shipment` / `ShipmentItem` | درخواست/تخصیص، replaces، بسته و گیرنده و رهگیری؛ unique(shipment,group_item)، تعداد مثبت و constraint deferred منع اضافه‌تخصیص |
| `FulfillmentEvent` | request و shipment اختیاری، actor/actor_kind، زمان، before/after، reason و evidence؛ append-only |
| `DeliveryLink` | OneToOne مرسوله، hash توکن یکتا، expires_at و revoked_at؛ بدون ذخیرهٔ مقدار خام |
| `DeliveryChallenge` | مرسوله، گیرنده، hash کد، انقضا و سقف/تعداد تلاش؛ unique شرطی یک challenge مصرف‌نشده برای هر مرسوله |
| `DeliveryPolicy` | singleton با id=1؛ TTL، سقف تلاش، فاصله و سقف صدور؛ command مالک سامانه |

ترتیب قفل fulfillment حساب‌دار User→Businessهای مرتب→Order→Request است؛ برای مأمور Order قفل می‌شود. قفل Request فقط خود جدول را شامل می‌شود و خدمت joinشده را قفل نمی‌کند. قیود deferred اقلام زیر همان Order، رقابت مرسوله‌ها و آغاز deadline را سری می‌کنند. snapshot checkout طبق ترتیب User/Business/Service/Product→Order فراخوانی می‌شود.

Migrationهای `orders/0001`، `operations/0004` و `logistics/0004..0008` اجرایی‌اند. بندهای قبلی «هنوز ساخته نشده» تاریخچهٔ تحویل‌های قبلی‌اند. [قرارداد اتصال، امنیت کد و rollback](../api/fulfillment.md).


## برش اجرایی PRD-06

| مدل | داده‌های اصلی | قید اجرایی |
| --- | --- | --- |
| DiscrepancyCase | order، closed_at | یک پرونده برای هر سفارش؛ بسته‌شدن مشروط به deadline و پایان رسیدگی/جبران |
| DiscrepancyLine | case، line، shipment، quantity، kind، description، evidence، response_deadline، referred_at | ادعای تغییرناپذیر؛ سقف تعداد قلم و مرسوله؛ deadline مستقل |
| DisputeDecision | claim، actor، source، accepted، rejected، remedy، reason، evidence | یک پاسخ تولیدکننده؛ تصمیم اپراتور روی باقی‌مانده؛ append-only |
| Remedy | decision، completed_at، waived_at، waiver_reason، financial_event | یک جبران برای تصمیم؛ پایان یا منتفی‌شدن؛ مرجع یکتای refund |
| CaseNote | case، claim اختیاری، actor، text، evidence | توضیح تکمیلی append-only |
| Ticket | number، business، creator، category، status، assigned_to، related_type/id، case، previous، last_reply_at | شماره یکتا؛ حداکثر یک ارجاع هر پرونده؛ closed نهایی |
| TicketMessage | ticket، actor، text، files، command_key | پیام تغییرناپذیر و ارسال idempotent |
| AttachmentScope | file، business، order، ticket | محدودهٔ خصوصی فایل؛ یک scope برای هر فایل |
| Shipment (افزوده) | purpose، compensation | order/replacement/return؛ جبران مستقل از تخصیص اصلی |

کلیدهای command_key و request_hash تکرار درخواست و تعارض محتوای آن را تشخیص می‌دهند. روابط evidence و files به StoredFile خصوصی و اسکن‌شده اشاره دارند. triggerهای PostgreSQL در disputes/0002 و logistics/0010 از تاریخچه و جمع تخصیص حفاظت می‌کنند.

## برش اجرایی PRD-07

| مدل | داده‌های اصلی و invariant |
| --- | --- |
| reviews.Entitlement | order، author/recipient Business، topic (product/manufacturer/retailer)، product اختیاری، variants JSONB، deadline مشترک، execution_mode و expired_at؛ unique(order,author,topic,product) با NULLS NOT DISTINCT؛ snapshot تغییرناپذیر |
| reviews.Review | entitlement یک‌به‌یک، actor داخلی، scores/text/images، submitted_at/published_at، content_hidden و invalidated مستقل؛ final immutable؛ نمرات صحیح ۱..۵ و موضوع‌دار با trigger |
| reviews.Reply | review یک‌به‌یک، actor، text، submitted_at، content_hidden؛ فقط دریافت‌کننده، انتشار پیش‌نیاز و final immutable |
| reviews.ReviewImage | entitlement و file یک‌به‌یک؛ scope تغییرناپذیر، StoredFile با purpose=review_image؛ انتخاب تصویر فقط از همین حق |
| reviews.Report | review، reply اختیاری، actor، reason، resolved_at؛ یکتا برای هر actor و هدف، متن گزارش تغییرناپذیر |
| reviews.ModerationAction | report، actor، action، reason، before/after، command_key یکتا و request_hash؛ append-only |

Index deadline حق‌های منقضی‌نشده و index صف گزارش موجود است. worker صفحه‌بندی keyset دارد؛ aggregate از PostgreSQL AVG/COUNT محاسبه می‌شود و جدول cache جدا ندارد. ترتیب قفل فرمان ثبت/پاسخ/نظارت User(no_key)→Order است؛ ایجاد حق از ترتیب مشترک Finance یعنی Businessهای مرتب→Service→Order استفاده می‌کند تا درج FKهای Business در worker با retry تسویه بن‌بست نسازد. worker مهلت فقط Order را قفل می‌کند. `reviews/0002_invariants` انتشار زودهنگام تک‌طرفه را با constraint trigger deferred رد می‌کند و حالت‌های اصلی/تاریخچه را نگه می‌دارد. هویت کامل actor تنها در حسابرسی مجاز دیده می‌شود.
