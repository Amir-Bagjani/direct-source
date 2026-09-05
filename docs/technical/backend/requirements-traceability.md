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

۲۲ دروازهٔ کشف کلان و تیکت‌های ۰۱ تا ۰۷ و ۱۰ نقشهٔ `.scratch/mvp-plan/` بسته شده‌اند. شکاف‌های اصلی جریان محصول، وابستگی‌ها و ترتیب توسعه بسته شده‌اند؛ تیکت‌های ۰۸ و ۰۹ هنوز باید ریسک‌ها و مرز PRDها را نهایی کنند.

ترتیب پیش‌نیاز فنی: بستن تیکت‌های ۰۱ تا ۰۸ و تیکت ۱۰ نقشه با `grilling` و `domain-modeling`، تعیین محدودهٔ PRDها در تیکت ۰۹، نوشتن PRDها با `to-spec` و انتقال تصمیم‌های نهایی از scratch به `docs/product/requirements/`. تا آن زمان ADRهای ۰۰۰۳ و ۰۰۰۴ پیشنهادند و شروع Django model مجاز نیست.

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
