# ردیابی نیازمندی‌های بک‌اند

وضعیت: پیش‌نویس فنی

این سند مشخص می‌کند هر بخش بک‌اند از کدام سند محصول آمده، در کدام ماژول قرار می‌گیرد و در چه فازی طراحی یا پیاده‌سازی می‌شود. هدف، جلوگیری از ساخت قابلیت بر اساس برداشت حافظه‌ای یا گزارش جلسهٔ قدیمی است.

## ترتیب اعتبار منابع

اگر دو متن با یکدیگر ناسازگار باشند، ترتیب زیر مبناست:

1. سند اختصاصی نیازمندی با وضعیت «تأییدشده»
2. بخش «تصمیم‌های قطعی» در `product.md` و `discovery-summary.md`
3. تعریف‌های تثبیت‌شده در `CONTEXT.md`
4. گزارش تاریخی جلسات کشف و متن‌های پیشنهادی قدیمی‌تر

هیچ تعارضی بی‌صدا در کد حل نمی‌شود؛ رفع نهایی آن باید در سند مبدأ و در صورت معماری‌بودن در ADR ثبت شود.

## گیت آمادگی محصول

۲۲ دروازهٔ کشف و همهٔ تیکت‌های ۰۱ تا ۱۰ بسته‌اند. هر هشت PRD پذیرفته شده‌اند و Checkpoint P بسته است. ADRهای ۰۰۰۳ و ۰۰۰۴ پذیرفته‌شده‌اند؛ مدل‌ها براساس طراحی `database/` و معیار پذیرش همان برش ساخته می‌شوند.

تصمیم تازهٔ 2026-09-07: بازیابی رمز با ایمیل قبلاً تأییدشده؛ مرجع `business-onboarding.md` و AC-ACC-25..27.

## ردیابی executable برش هویت/اعتماد

مسیر تست‌ها نسبت به `apps/backend/tests/` است. نتیجهٔ اجرای تست در برنامهٔ اجرا ثبت می‌شود؛ این جدول نگاشت است، نه ادعای پذیرش کل قابلیت.

| معیار | Entity / command | تست |
|---|---|---|
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

## ماتریس ردیابی

| حوزه | منابع اصلی | ماژول‌های پیشنهادی | خروجی طراحی | فاز اجرا |
|---|---|---|---|---|
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
|---|---|
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
