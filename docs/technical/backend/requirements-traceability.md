# ردیابی نیازمندی‌های بک‌اند
وضعیت: پیش‌نویس فنی

## برش بک‌اند PRD-08 — 2026-09-13

مرجع: [قرارداد عملیات و آمار](../api/operations-analytics.md). فرانت‌اند عملیات و داشبوردها طبق محدودهٔ فعلی به Next.js در مرحلهٔ بعد موکول است.

| قابلیت | پیاده‌سازی و آزمون بک‌اند |
| --- | --- |
| CAP-OPS-01 | work.py، claim/reassign و آزادسازی؛ test_queue_claim_reassign_and_disable، test_concurrent_claim_has_one_winner، test_queue_includes_old_open_work |
| CAP-OPS-02..03 | commands.py، allowlist نقش/فرمان و idempotency؛ آزمون‌های operations، operations_analytics و permissionهای دامنه |
| CAP-OPS-04..05 | PolicyVersion، CommissionRate، snapshot تحویل و audit append-only؛ test_policy_future_effect_and_immutable_history، test_audit_redaction_preserves_trace و آزمون‌های مالی/تحویل موجود |
| CAP-OPS-06 | suspensions.py و OrderDisposition؛ آزمون‌های لغو unpaid، continue/refund برای paid، حفظ تحویل shipped و تعلیق مستقل User |
| CAP-ANA-01..03 | analytics.py و dashboard/drill-down؛ test_paid_goods_are_not_completed_sales، test_operator_dashboard_cannot_read_money_or_other_tenant، test_operator_finance_requires_related_assignment |

اجرای کامل: ۲۶۸ تست موفق، پوشش ۹۱٫۸۷٪. پس از اصلاحات نهایی، ۲۱ تست operations/analytics/contract و سپس هر ۱۳ تست پذیرش operations_analytics شامل سناریوی ارسال‌شده گذشتند. Ruff، mypy، Django check، نبود migration معوقِ مدل و قرارداد OpenAPI تأیید شدند. Migrationهای operations/0007..0009 روی PostgreSQL محلی اعمال شدند. Load test ظرفیت و frontend جزو این تأیید نیستند.

## تحویل آغاز PRD-04 — سبد و پیش‌نمایش

CAP-ORD-01 و CAP-ORD-02 در بخش سبد پایدار، انتخاب/ادغام fixed pack و free mix، تأیید تغییر روش، قیمت و عرضهٔ جاری و حفظ انتخاب نامعتبر پیاده شدند. CAP-ORD-03 در بخش آدرس کامل داخل سبد، خدمت هر محصول و برآورد حمل گروهی پیاده شد. مرجع اجرا `orders/cart.py`، قرارداد [cart.md](../api/cart.md) و تست `tests/test_cart.py` است. قید یکتایی سبد فعال و رقابت افزایش تعداد روی PostgreSQL آزموده شده‌اند.

ادامهٔ PRD-04: دفترچهٔ آدرس و حمل گروهی (CAP-ORD-03)، checkout اتمیک و snapshot و رزرو و idempotency (CAP-ORD-04)، پاسخ تولیدکننده و مهلت‌ها (CAP-ORD-05/06)، لغو پرداخت‌نشده و تصمیم لغو پرداخت‌شده همراه قرارداد بازپرداخت (CAP-ORD-07)، نمای مستقل سفارش/گروه (CAP-ORD-08) و افزودن دوبارهٔ صریح سفارش رد/منقضی پیاده شدند. مرجع: [orders.md](../api/orders.md)، `orders/checkout.py`، `lifecycle.py`، `cancellation.py`، `tasks.py` و `tests/test_checkout.py`. تست‌های رقابت دو خریدار، retry هم‌زمان و استقلال سفارش‌های دو تولیدکننده وجود دارند.

مرز باقی‌مانده: UI و نمایش هشدار/تأیید مبلغ و سناریوی مرورگر. PRD-05 اکنون پرداخت/صورتحساب/دفتر، بازپرداخت callback و تسویه/تکمیل را پیاده می‌کند؛ جبران مغایرت و hold پرونده از قرارداد داخلی به PRD-06/08 متصل می‌شوند. آزمون backend از checkout تا OTP تحویل و settlement در test_finance.py وجود دارد؛ فایل own.md گزارش تاریخی کاربر است.


این سند مشخص می‌کند هر بخش بک‌اند از کدام سند محصول آمده، در کدام ماژول قرار می‌گیرد و در چه فازی طراحی یا پیاده‌سازی می‌شود. هدف، جلوگیری از ساخت قابلیت بر اساس برداشت حافظه‌ای یا گزارش جلسهٔ قدیمی است.

## ترتیب اعتبار منابع
اگر دو متن با یکدیگر ناسازگار باشند، ترتیب زیر مبناست:

- سند اختصاصی نیازمندی با وضعیت «تأییدشده»

- بخش «تصمیم‌های قطعی» در `product.md` و `discovery-summary.md`

- تعریف‌های تثبیت‌شده در `CONTEXT.md`

- گزارش تاریخی جلسات کشف و متن‌های پیشنهادی قدیمی‌تر

هیچ تعارضی بی‌صدا در کد حل نمی‌شود؛ رفع نهایی آن باید در سند مبدأ و در صورت معماری‌بودن در ADR ثبت شود.

## گیت آمادگی محصول
۲۲ دروازهٔ کشف و همهٔ تیکت‌های ۰۱ تا ۱۰ بسته‌اند. هر هشت PRD پذیرفته شده‌اند و Checkpoint P بسته است. ADRهای ۰۰۰۳ و ۰۰۰۴ پذیرفته‌شده‌اند؛ مدل‌ها براساس طراحی `database/` و معیار پذیرش همان برش ساخته می‌شوند.

تصمیم تازهٔ 2026-09-07: بازیابی رمز با ایمیل قبلاً تأییدشده؛ مرجع `business-onboarding.md` و AC-ACC-25..27.

## ردیابی executable برش هویت/اعتماد
مسیر تست‌ها نسبت به `apps/backend/tests/` است. نتیجهٔ اجرای تست در برنامهٔ اجرا ثبت می‌شود؛ این جدول نگاشت است، نه ادعای پذیرش کل قابلیت.

| معیار | Entity / command | تست |
| --- | --- | --- |
| AC-ACC-01..02 | User / Register | test_auth.py::test_registration_normalizes_mobile_without_business، test_registration_validation |
| ADR-0005 / CAP-ACC-01 | AuthSession / Rotate، Logout | test_refresh_reuse_revokes_access_but_other_device_survives، test_concurrent_refresh_only_one_success، test_logout_all_and_suspension_are_immediate |
| AC-ACC-04..05 | Business، Membership / CreateBusiness | test_business.py::test_business_creation_and_tenant_isolation، test_membership_database_constraint |
| AC-ACC-08..11 | VerificationSection / Submit، Review، Reopen | test_two_sections_correction_preserves_approved_identity، test_rejected_application_reopens_with_reason |
| AC-ACC-12، بخشی از 13..14 | controlled_access، permission | test_two_sections_correction_preserves_approved_identity، test_wholesale_permission_axes؛ تست Order در فاز سفارش اضافه می‌شود |
| AC-ACC-15..16 | tenant و نقش هم‌زمان | test_business_creation_and_tenant_isolation، test_operations.py::test_dual_role_can_read_own_business |
| AC-ACC-25..27 | EmailChallenge / Verify، Reset | test_verified_email_reset_invalidates_tokens_and_sessions، test_reset_request_does_not_disclose_account |
| AC-ACC-28..30 | BusinessRevision / Propose، Review، Resubmit | test_revisions.py؛ نسخهٔ قبلی تا approval، حفظ نخستین تاریخ، رد مستقل و اصلاح بخش برگشتی |
| AC-ACC-06..08 | فایل و بخش‌های اجباری | test_onboarding_api.py برای هر دو نوع Business؛ یک شاهد جایگزین رد می‌شود |
| PRD-08 claim / audit | VerificationApplication، AuditEvent | test_concurrent_claim_has_one_winner، test_audit_is_immutable_in_database |
| ADR-0006 / upload policy | StoredFile / Scan، AuthorizeDownload | test_files.py؛ adapterهای S3/ClamAV در این تست‌ها mock هستند و تست واقعی provider جدا لازم است |
| ADR-0008 | OpenAPI، health، default permission | test_contract.py |

محدودسازی آثار سفارش AC-ACC-17..24 تا ساخت Order/fulfillment قابل‌تکمیل نیست. ردیابی باقی PRDها در فاز مربوط با نام تست اجرایی گسترش می‌یابد.

## ردیابی executable کاتالوگ PRD-02

| معیار | Entity / command | تست |
| --- | --- | --- |
| AC-CAT-01..06، 31..32، 37 | Category/Attribute/Product/Variant | `test_catalog.py`؛ taxonomy، فایل، SKU، ترکیب، مالکیت و محدودیت تغییر ساختاری |
| AC-CAT-07..12 | SalesPlan/PriceTier/VariantSupply / Save، Quote | `test_catalog_sales.py`؛ بسته/ترکیب آزاد، پله، قیمت مؤثر و تخصیص عرضه |
| AC-CAT-13..18 | Shipping/Tariff/Product / Validate، Submit، Claim، Review | `test_logistics_publication.py`؛ پوشش، تکمیل، قفل، تصمیم و عملیات جاری |
| AC-CAT-19، 35..36 | ProductRevision / Save، Submit، Review، Cancel | `test_catalog_revisions.py`؛ حفظ نسخهٔ عمومی و عملیات جدیدتر، تنوع تازه/بایگانی و immutable final |
| AC-CAT-20 | Variant / SetStatus | `test_catalog_completion.py::test_variant_operator_disable_cannot_be_bypassed_and_last_disables_product` و `test_variant_reactivation_validates_supply_and_archived_content` |
| AC-CAT-21..27، 34، 38 | Browse / Search، Filter، Sort، RepresentativeMetrics، ManufacturerProfile | تست‌های browsing، representative price و public manufacturer در `test_catalog_completion.py` |
| AC-CAT-28..30، 33 | PublicProjection / WholesalePermission | تست browsing بالا و `test_catalog_revisions.py::test_wholesale_permission_axes` |
| AC-CAT-02، 39 | TaxonomyProposal / Propose، Review | تست dedup/visibility/review، scoped validation و concurrent duplicate در `test_catalog_completion.py` |
| قاعدهٔ حذف پیش‌نویس `catalog-publication.md` | Product / DeleteNeverSubmittedDraft | `test_delete_draft_confirmation_scope_and_cascade` و حالت‌های ever-submitted |
| صف عملیات PRD-08 | Product/ProductRevision / Reassign، Release | `test_owner_reassignment_and_role_release` برای هر دو نوع پرونده |

مرتب‌سازی/فیلتر امتیاز تا وجود دادهٔ منتشرشده از PRD-07 نتیجهٔ بدون امتیاز را حفظ می‌کند. مجوز خرید و snapshot سبد متعلق به PRD-04 است و کامل‌بودن PRD-02 به معنی ثبت سفارش نیست.

## ماتریس ردیابی
| حوزه | منابع اصلی | ماژول‌های پیشنهادی | خروجی طراحی | فاز اجرا |
| --- | --- | --- | --- | --- |
| هویت، کسب‌وکار و دسترسی | `business-onboarding.md`، `role-matrix.md`، `account-suspension-flow.md`، `CONTEXT.md` | `accounts` | مدل User/Business/Membership/PlatformRole، جدول مجوزها | ۱ و ۳ |
| احراز و تأیید | `business-onboarding.md`، `product.md`، `admin-operations.md` | `accounts`، `operations` | چرخهٔ بررسی هویت و مدارک، صف اپراتور | ۱ و ۳ |
| کاتالوگ و انتشار | `catalog-publication.md`، `catalog-browsing.md`، `product.md`، `market-scope.md` | `catalog`، `fulfillment` | دسته، ویژگی، محصول پایه، تنوع، گالری، نمایش و قواعد انتشار | ۱ و ۴ |
| قیمت عمده | `pricing-rules.md` | `catalog`، `orders` | پله‌ها، override تنوع، الگوریتم و snapshot قیمت | ۱ و ۴ |
| موجودی و تولید سفارشی | `made-to-order-flow.md`، `product.md` | `catalog`، `orders` | موجودی آماده، ظرفیت تولیدی، رزرو و آزادسازی | ۱ و ۴ تا ۶ |
| سبد و سفارش | `cart-order-placement.md`، `order-lifecycle.md`، `product.md` | `orders` | سبد چندتولیدکننده‌ای، گروه سفارش، سفارش تک‌تولیدکننده‌ای، state machine | ۱ و ۵ |
| پرداخت و کارمزد شبیه‌سازی‌شده | `payment-simulation.md`، `pricing-rules.md`، `ui-language.md` | `finance`، `orders` | payment event، invoice، commission snapshot، هزینهٔ حمل و settlement | ۱ و ۵ و ۷ |
| لجستیک، ارسال و تحویل | `logistics-platform.md`، `shipping-flow.md`، `market-scope.md` | `fulfillment`، `operations`، `finance` | کاتالوگ خدمت، پوشش و تعرفه، هزینهٔ حمل، درخواست حمل، مرسوله، کد تحویل و تاریخچه | ۱ و ۵ تا ۷ |
| مغایرت و جبران | `discrepancy-flow.md`، `order-lifecycle.md` | `disputes`، `finance`، `fulfillment` | پرونده/ردیف مغایرت، تصمیم، replacement/return، تعدیل | ۱ و ۷ |
| پشتیبانی | `support-flow.md` | `support` | تیکت، پیام، پیوست، ارتباط نوع‌دار با موجودیت‌ها | ۱ و ۷ |
| امتیاز و نظر | `ratings-reviews-flow.md` | `reviews` | entitlement، review، انتشار هم‌زمان و moderation | ۱ و ۸ |
| تعلیق و عملیات مدیریت | `account-suspension-flow.md`، `admin-operations.md` | `accounts`، `operations` | suspension case، تصمیم هر سفارش، اقدام حساس و audit trail | ۱ و ۸ |
| داشبورد و معیار عبور | `analytics-dashboards.md`، `go-to-market.md` | `analytics` | تعریف queryها، drill-down و معیارهای پایلوت | ۱ و ۹ |

مسیر همهٔ منابع بالا نسبت به ریشهٔ اسناد، `docs/product/requirements/` یا `docs/product/vision/` است.

## تعارض‌های حل‌شده
### نمایش ماهیت شبیه‌سازی
- `made-to-order-flow.md` در بخش «پرداخت در MVP» می‌گوید عبارت «پرداخت شبیه‌سازی‌شده» در صورتحساب و داشبورد نمایش داده شود.

- `payment-simulation.md` و سند اختصاصی `ui-language.md` نمایش واژه‌های آزمایشی/شبیه‌سازی‌شده را در رابط ممنوع می‌کنند و فقط نگهداری نوع اجرا در داده و اسناد داخلی را لازم می‌دانند.

- تصمیم نهایی: `ui-language.md` و `payment-simulation.md` مرجع‌اند و متن قدیمی `made-to-order-flow.md` نیز با زبان عادی رابط هماهنگ شد.

### اثبات تحویل
- گزارش جلسهٔ ۲۱ در `product.md` از دو رویداد «تحویل دادم/تحویل گرفتم» نام می‌برد.

- تصمیم بعدی و سند اختصاصی `shipping-flow.md` مدل کد یک‌بارمصرف گیرنده و مسیر «تحویل تأییدنشده» را تثبیت کرده است.

- تصمیم نهایی: مدل کد تحویل در `shipping-flow.md` مرجع است و گزارش جلسه فقط سابقهٔ تاریخی محسوب می‌شود.

## سؤال‌های باز فنی
در پایان تیکت ۰۸ هیچ سؤال باز فنی مؤثر بر schema، API یا ترتیب development باقی نمانده است. ریسک‌های پذیرفته‌شده و اقدام‌های کاهشی در `risk-register.md` نگهداری می‌شوند.

## تصمیم‌های فنی بسته‌شده در تیکت ۰۸
| موضوع | تصمیم |
| --- | --- |
| واحد پول | ذخیره و API با عدد صحیح ریال و کد `IRR`؛ ورود و نمایش رابط با تومان؛ تبدیل دقیق ۱ تومان به ۱۰ ریال و بدون گردکردن |
| تاریخ و زمان | ذخیره و API با UTC/میلادی/ISO 8601؛ نمایش رابط با ساعت تهران و تاریخ شمسی؛ deadline براساس timestamp مطلق |
| احراز هویت وب و API | Django مرجع هویت و صادرکنندهٔ access/refresh JWT؛ NextAuth لایهٔ session/BFF؛ Cookie امن HttpOnly؛ refresh چرخشی و قابل‌لغو؛ جزئیات در ADR-0005 |
| ظرفیت هدف اولیه | ۱۰هزار حساب، ۲هزار کسب‌وکار، ۱۰۰هزار SKU، ۱۰۰۰ سفارش روزانه و ۲۰۰ کاربر هم‌زمان؛ تحمل رشد پنج‌برابری بدون بازطراحی اساسی |
| فایل‌های حساس | object storage خصوصی؛ نگهداری پیش‌فرض نامحدود و بدون حذف خودکار؛ حذف دستی معتبر/قانونی با تأیید مالک، hold و audit؛ جزئیات در ADR-0006 |
| کنترل اقدامات مالی | تغییر کارمزد/فعال‌سازی تعرفه و بازپرداخت، تسویه یا اصلاح مالی دستی فقط برای مالک؛ جریان‌های عادی و جبران مبتنی بر تصمیم معتبر به‌صورت سیستمی |
| اعلان MVP | interface قابل‌تعویض با provider فعال `InternalInbox`؛ منطق کد تحویل مستقل؛ SMS/ایمیل/Push واقعی adapterهای بعدی‌اند |
| topology استقرار | کانتینری و provider-neutral؛ Next.js/BFF عمومی، Django/PostgreSQL/Redis خصوصی، staging/production جدا؛ provider نهایی پیش از staging طبق ADR-0007 |
| runtime و framework | آخرین patch پایدار Python 3.13 و Django 5.2 LTS؛ شمارهٔ دقیق هنگام scaffold در lockfile |
| API | DRF و REST JSON زیر `/api/v1/` با OpenAPI 3 و contract test طبق ADR-0008 |
| کار پس‌زمینه | Celery و scheduler با Redis به‌عنوان broker/cache؛ PostgreSQL منبع حقیقت و taskها idempotent طبق ADR-0009 |
| پنل عملیات | پنل سفارشی برای اپراتور؛ Django Admin محدود به مالک/کاربر فنی و بدون تغییر مستقیم دادهٔ حساس طبق ADR-0010 |
| آپلود و ظرفیت | تصویر محصول ۵MB، سایر فایل‌ها ۱۰MB، حداکثر ۱۰ فایل در هر ارسال؛ ظرفیت برنامه‌ریزی ۱TB با هشدار ۷۰٪ و ۹۰٪ |

## موارد خارج از MVP که نباید وارد backlog فعلی شوند
- پرداخت، تسویه، بازپرداخت یا پیامک واقعی

- معامله یا جابه‌جایی واقعی کالا در محیط MVP

- خرید اعتباری و اقساط

- اتصال API شرکت‌های حمل

- چند عضو و نقش داخلی پیشرفته برای کسب‌وکار

- microservice، event sourcing کامل، Kafka یا search cluster مستقل بدون اثبات نیاز

- گزارش‌ساز عمومی، BI خارجی، چت زنده و کشف تقلب پیشرفته

## تحویل فروش پیش‌نویس — 2026-09-08
CAP-CAT-04..06: SalesPlan/FixedPack/PackItem، PriceTier/VariantPrice و VariantSupply همراه API خصوصی تولیدکننده و quote پیاده شدند. مرجع: `catalog/sales_services.py`، `tests/test_catalog_sales.py` و `api/catalog-sales.md`. مثال ریالی سند، مرز پله، قیمت مؤثر fallback، روش‌های عرضه، دسترسی، rollback و رقابت واقعی PostgreSQL آزموده شدند. snapshot سفارش و رزرو از PRD-04، حمل از PRD-03 و انتشار/نمای خرده‌فروش از ادامهٔ PRD-02 هنوز بازند؛ پذیرش عمومی فاز کاتالوگ بسته نشده است.

## حمل و انتشار اولیه — 2026-09-09
PRD-03 logistics-platform: ShippingService/Tariff، ProductShipping/VariantPackage و تست `test_logistics_publication.py` محاسبهٔ مسیر/وزن، مرز اختیار تعرفه و نسخه‌گذاری اتمیک را پوشش می‌دهند. PRD-02 CAP-CAT-07/08 و بخشی از 09/10: کنترل تکمیل، صف/claim، تصمیم، انتشار و فهرست عمومی بدون قیمت پیاده‌اند. CAP-CAT-09..13 هنوز کامل نیستند؛ بازنگری، وضعیت تنوع و تجربهٔ مرور/قیمت نیازمند ادامه‌اند. قرارداد اجرایی: `api/logistics-publication.md`.

## بازنگری محتوا و قیمت خرده‌فروش — 2026-09-09
PRD-02 AC-CAT-35/36: ProductRevision، بازنگری یکتا، قفل نسخهٔ ارسالی، لغو، تصمیم و حفظ عملیات جدیدتر در `catalog/revisions.py` و `test_catalog_revisions.py` پوشش داده شدند. تنوع تازه با supply/package کامل و قیمت پیش‌فرض جاری پذیرفته می‌شود؛ تنوع حذف‌شده بایگانی و از محاسبه/نمای قابل‌انتخاب خارج می‌شود. CAP-CAT-13: کل فیلد wholesale برای بازیگر غیرمجاز حذف می‌شود؛ verified خرده‌فروش کافی است و controlled_access مستقل می‌ماند. قرارداد: `api/catalog-revisions.md`. جستجو/فیلتر، فعال‌سازی مستقل تنوع و بازتخصیص صف هنوز بازند.

## تکمیل کاتالوگ — 2026-09-10
PRD-02 CAP-CAT-01..13 در بک‌اند بسته شد. `catalog/browsing.py` projection عمومی و محرمانگی قیمت، `lifecycle.py` حذف/وضعیت تنوع/واگذاری و `proposals.py` پیشنهاد taxonomy را اجرا می‌کنند. migration 0006 منشأ و دلیل وضعیت تنوع و TaxonomyProposal با unique شرطی پیشنهاد باز را اضافه می‌کند. قرارداد: `api/catalog-browsing-lifecycle.md`. وابستگی‌های دادهٔ امتیاز، سبد/رزرو و frontend در PRDهای مالک خود باقی می‌مانند.


## ردیابی executable PRD-03 — 2026-09-10

مسیر آزمون‌های زیر `apps/backend/tests/test_fulfillment.py` است. هستهٔ تعرفه/مسیر/پوشش AC-LOG-01..07 و 19 همچنان با `test_logistics_publication.py` پوشش دارد. checkout/پرداخت/رزرو و UI وابستگی بیرونی‌اند؛ [قرارداد اتصال](../api/fulfillment.md) مرز این تحویل را تعریف می‌کند.

| معیار | فرمان / خروجی | آزمون |
| --- | --- | --- |
| AC-LOG-08..10 | calculate_groups / freeze_shipping | test_group_quote_combines_weight_and_freezes_snapshot |
| AC-LOG-11 | accept_payment / ShippingRequest یکتا | test_payment_idempotency_and_preparation_guards، test_concurrent_payment_creates_one_request |
| AC-LOG-12..13؛ AC-FUL-01..03 | progress / ready، سهم تولید و موعد تثبیت‌شده | test_payment_idempotency_and_preparation_guards، test_unpaid_order_never_prepares، test_cancellation_contract_blocks_preparation_and_shipping |
| AC-LOG-14..18 | Carrier / Assign / WeightReview / OperationalException | test_carrier_permissions_compatibility_and_assignment_snapshot، test_weight_review_preserves_price_and_blocks_assignment، test_unserviceable_actual_weight_refers_cancellation_without_financial_mutation، test_manual_assignment_exception_requires_reason_and_can_resume |
| AC-FUL-04..06، 23 | ShipmentItem / manifest / hand-over | test_exact_manifest_partial_shipping_and_producer_lock، test_cross_order_lines_and_shipments_are_rejected، test_operator_batch_manifest_correction_is_atomic، test_weight_cannot_change_after_ready_by_changing_manifest، test_database_rejects_cross_group_and_oversend، test_concurrent_allocations_do_not_oversend |
| AC-FUL-07..08 | Tracking / FulfillmentEvent / StoredFile | test_tracking_correction_reason_and_history، test_shipping_file_scan_upload_and_tenant_download |
| AC-FUL-09..12، 20..22 | DeliveryLink/Challenge / InternalInbox | test_full_delivery_codes_only_in_recipient_inbox_and_deadline_once، test_failed_attempts_commit_and_disable_fifth_code، test_code_expiration_resend_limits_and_link_rotation، test_expired_code_never_delivers، test_delivery_policy_owner_only، test_concurrent_same_code_consumes_only_once |
| AC-FUL-13..15 | unconfirmed / تصمیم با مدرک | test_unconfirmed_only_operator_with_scanned_order_evidence، test_failed_delivery_refund_referral_preserves_partial_delivery |
| AC-FUL-16..19، 24 | وضعیت مشتق‌شده / resend / deadline | test_failure_resend_new_shipment_preserves_delivered_items، test_failed_delivery_refund_referral_preserves_partial_delivery، test_concurrent_last_delivery_starts_deadline_once |
| مجوز، tenant و end-to-end | APIهای نقش‌دار و لینک محدود مأمور | test_private_requests_events_and_order_isolation، test_full_happy_path_through_api |
| migration | reverse/forward و حفظ کاتالوگ قبلی | test_fulfillment_migrations_reverse_forward_preserve_existing_catalog |

نتیجهٔ این تحویل: ۳۰ تست تازه، مجموع ۱۵۲ تست PostgreSQL پاس؛ پوشش ۹۲٫۰۹٪. providerهای S3/ClamAV در تست فایل mock هستند و نتیجه شامل ادعای آزمون runtime آن‌ها نیست.


## ردیابی executable PRD-05 — 2026-09-11

قرارداد [finance.md](../api/finance.md)، اجرا `marketplace/finance/{models,services,api,tasks}.py`، migrationهای finance/0001..0002 و orders/0006؛ تمام نام‌های آزمون جدول در `tests/test_finance.py` هستند.

| معیار | command / شاهد آزمون |
| --- | --- |
| AC-FIN-01..05، 24 | pay، invoice و ledger اتمیک؛ test_payment_atomic_snapshot_invoice_ledger_and_retry، test_payment_invalid_lifecycle، test_concurrent_payment_exactly_once |
| AC-FIN-06..07، 11، 14 | read_finance و owner-only commands؛ test_finance_permissions_and_strict_amounts، test_financial_api_presentation_and_owner_commands، test_payment_requires_current_trade_access |
| AC-FIN-08..10، 23 | نرخ نسخه‌دار و snapshot، محاسبهٔ سطح Order؛ test_new_rates_affect_only_future_checkout، test_rate_activation_invalidates_preview |
| AC-FIN-12، 15، 22 | refund_cancellation و apply_decision؛ test_cancellation_worker_full_refund_atomic_and_idempotent، test_concurrent_refund_and_database_journal_guard، test_finance_invariant_migration_preserves_issued_invoice |
| AC-FIN-13، 21 | جبران تعداد تجمعی و گروه کامل؛ test_partial_refund_recomputes_fees_preserves_shipping_and_caps، test_multiple_groups_refund_whole_group_only |
| AC-FIN-16 | اصلاح دستی کاهشی با reason و قبل/بعد؛ test_owner_manual_correction_requires_reason_and_audits |
| AC-FIN-17..20 | settle/complete_financial_cycle، hold و worker؛ test_settlement_deadline_holds_and_final_net، test_settlement_holds، test_worker_processes_decision_then_settles_after_deadline، test_closed_discrepancy_cannot_settle_undelivered_retained_goods |
| AC-FIN-25 | سرفصل logistics مستقل؛ test_multiple_groups_refund_whole_group_only، test_checkout_to_delivery_and_concurrent_settlement |
| استقلال Order | test_payment_independent_after_other_manufacturer_rejects |

CAP-FIN-01..05 در backend پیاده‌اند. تصمیم دامنه‌ای معتبر مغایرت و تعلیق، UI/داشبورد و entitlement هنوز مالکیت PRD-06/08/07 و frontend هستند؛ تست مالیِ hook جای آزمون پروندهٔ آینده نیست. اجرای مالی دستی مجوز عبور از سقف بازپرداخت یا hold تسویه نمی‌دهد.


## PRD-06 — برش backend

پیاده‌سازی در marketplace/disputes، marketplace/support و logistics/remedies است. [قرارداد API](../api/disputes-support.md) مرز اجرا را مشخص می‌کند. پرونده و hold اکنون به PRD-05 متصل‌اند؛ اشاره‌های بخش PRD-05 به اتصال آیندهٔ PRD-06 با این برش تکمیل شده‌اند. نام‌های زیر در `tests/test_disputes_support.py` هستند.

| معیارها | شاهد آزمون |
| --- | --- |
| AC-DSP-01..04،17..18 | test_claim_immutable_scoped_idempotent_and_deadlines، test_invalid_claim_rolls_back_without_hold، test_claim_before_delivery_has_no_case_or_hold |
| AC-DSP-05..07،12..13 | test_manufacturer_partial_response_atomic_refund_and_single_referral، test_manufacturer_response_forbidden_to_stranger_and_at_deadline، test_operator_decision_permissions_quantities_and_close_window |
| AC-DSP-08..09 | test_row_timeout_does_not_shorten_late_row_response_window |
| AC-DSP-10..11،15..16 | test_operator_decision_permissions_quantities_and_close_window |
| AC-DSP-14..16 | test_independent_remedy_shipment_then_completion، test_waiver_needs_reason_and_preserves_history |
| AC-DSP-03،09،13 (هم‌زمانی) | test_concurrent_claim_and_decision_exactly_once، test_distinct_concurrent_claims_cannot_overclaim |
| AC-SUP-01..04،06..12 | test_ticket_lifecycle_link_privacy_and_no_financial_effect |
| AC-SUP-02،05..06 | test_ticket_rejects_foreign_links_and_invalid_message_atomically، test_files_scoped_scan_gate_and_operator_download، test_manufacturer_can_upload_evidence_to_shared_referral |
| AC-SUP-11 (نقش هم‌زمان) | test_business_owner_with_operator_role_can_reply_to_own_ticket |

این شواهد backend هستند؛ نمایش خطای موضعی، گردش صفحه‌ها و آزمون مرورگر همچنان به frontend نیاز دارند. بازپرداخت و حمل جبرانی مطابق محدودهٔ MVP داخلی‌اند.

## ردیابی executable امتیاز و نظر PRD-07

مرجع: [قرارداد reviews](../api/reviews.md)، `marketplace/reviews/` و `tests/test_reviews.py`. هر ردیف زیر به آزمون backend اشاره دارد؛ رابط مرورگر و dashboard مدیریتی PRD-08 جدا هستند.

| معیار پذیرش | پیاده‌سازی و آزمون |
| --- | --- |
| AC-REV-01..03 | Entitlement / completion hook و worker؛ `test_entitlement_completion_retry_and_snapshot`، `test_no_entitlement_without_completion`، `test_open_dispute_blocks_rights_until_real_closure`، `test_backfill_uses_completion_deadline_and_pagination` |
| AC-REV-04..06 | موضوع و تنوع snapshot، معیارهای سه‌گانه و فایل scoped؛ `test_product_draft_final_and_anonymous_projection`، `test_invalid_scores_atomic`، `test_images_scoped_and_hidden_download`، `test_database_rejects_forged_subject_and_incomplete_scores` |
| AC-REV-07..11 | دو جهت همکاری و projection کور؛ `test_blind_until_both_submit_including_existence`، `test_outsider_suspension_and_mode_separation`، `test_concurrent_blind_submission_and_entitlement_retry` |
| AC-REV-12 | deadline دقیق، انقضای draft و انتشار یک‌باره؛ `test_deadline_publishes_once_expires_drafts_and_rejects_late` |
| AC-REV-13..16 | AVG/COUNT مستقل موضوع و mode، null برای نبود سابقه؛ `test_average_counts_multiple_orders_without_double_counting`، `test_moderation_restoration_aggregate_audit_and_no_financial_effect`، `test_outsider_suspension_and_mode_separation` |
| AC-REV-17..18 | Reply یک‌به‌یک، draft خصوصی و final immutable؛ `test_reply_draft_lock_recipient_and_public_projection`، `test_immutable_final_records_even_with_direct_database_writes` |
| AC-REV-19..21 | گزارش یکتا و پنهان‌سازی/بازگردانی بدون حذف امتیاز؛ `test_moderation_restoration_aggregate_audit_and_no_financial_effect` |
| AC-REV-22..23 | ورودی strict، moderation مستدل، بدون اثر مالی؛ `test_strict_commands_and_moderation_permissions`، `test_review_support_ticket_preserves_financial_state` |
| AC-REV-24..25 | نهایی‌سازی قفل‌شده و منع حذف/تغییر/بازگشت؛ `test_product_draft_final_and_anonymous_projection`، `test_immutable_final_records_even_with_direct_database_writes`، `test_concurrent_duplicate_submission_is_one_final_review` |
| AC-REV-26..27 | ناشناس‌بودن محصول و نام Business همکاری؛ `test_product_draft_final_and_anonymous_projection`، `test_blind_until_both_submit_including_existence` |
| AC-REV-28..29 | invalidate/revalidate مستقل از hide؛ نوع/دلیل/actor/before/after و retry؛ `test_moderation_restoration_aggregate_audit_and_no_financial_effect`، `test_strict_commands_and_moderation_permissions` |
| AC-REV-30 | گزارش و moderation پاسخ بدون اثر در امتیاز؛ `test_reply_reporting_and_moderation` |
| قیود PostgreSQL و مهاجرت | `test_database_prevents_early_nonatomic_publication`، `test_review_invariant_migration_roundtrip_preserves_final_content`؛ ساخت از صفر در مجموعهٔ PostgreSQL |
| مرز فایل خصوصی | `test_image_upload_scanning_type_and_download_permissions`؛ S3 و ClamAV در آزمون mock هستند، آزمون provider واقعی جداست |

مدل‌ها و serviceهای این برش از PostgreSQL یکتایی nulls-not-distinct، قفل Order، trigger محتوای نهایی و publication deferred استفاده می‌کنند. کوئیری عمومی همیشه execution_mode=live دارد و هیچ پارامتر کاربر آن را به simulated تبدیل نمی‌کند. جبران مالی که بدون تحویل کامل سفارش تسویه شود حق نمی‌گیرد.
