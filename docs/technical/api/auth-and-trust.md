# قرارداد هویت و اعتماد

مرجع ماشین‌خوان: [openapi.yaml](openapi.yaml). فقط مسیرهای پیاده‌شده در schema آمده‌اند؛ پیش‌نویس کاتالوگ در [قرارداد کاتالوگ](catalog-drafts.md) آمده؛ سفارش، مالی، حمل و انتشار هنوز endpoint ندارند.

## نشست و مرز BFF

`register` فقط User می‌سازد؛ `login` access پنج‌دقیقه‌ای و refresh با حداکثر عمر هفت‌روز از آغاز نشست می‌دهد. `sid` به AuthSession پایدار اشاره می‌کند؛ نقش و Business در JWT تثبیت نمی‌شوند. refresh با lock User سپس Session چرخانده می‌شود؛ refresh قدیمی خانواده را revoke می‌کند. BFF باید refresh هر نشست را single-flight کند؛ دو refresh هم‌زمان عمداً reuse محسوب می‌شوند. `logout` نشست جاری و `all_sessions=true` همه را باطل می‌کند. پس از reset همهٔ نشست‌ها بسته‌اند.

Django فقط Bearer را برای API می‌پذیرد؛ session cookie Django مجوز API نیست. NextAuth/BFF باید توکن را فقط سمت سرور نگه دارد، CSRF/origin درخواست‌های cookie-based را کنترل و query لینک ایمیل را از log/referrer حذف کند. Django به شبکهٔ خصوصی و ingress مورداعتماد محدود شود. پیاده‌سازی BFF و تست مرورگر جزو کد فعلی backend نیست و گیت استقرار باقی است.

## ایمیل

`PUT auth/email/` ثبت یا تغییر ایمیل را فقط با رمز فعلی می‌پذیرد؛ تأیید قبلی و لینک‌های قدیمی باطل و برای ایمیل جدید intent تأیید ساخته می‌شود. ایمیل خالی امکان حذف مسیر بازیابی را می‌دهد. تغییر ایمیل تأیید Business یا موبایل را تغییر نمی‌دهد.

`email/request` authenticated است؛ تأیید با `email/confirm` و token در body انجام می‌شود. `password/request` همیشه 202 می‌دهد؛ فقط حساب فعال با ایمیل verified job دریافت می‌کند. `password/reset` token و password را در body می‌گیرد. GET لینک به‌تنهایی secret را مصرف نمی‌کند؛ صفحهٔ BFF باید POST را انجام دهد.

توکن ۲۵۶بیتی با عمر ۳۰ دقیقه، فقط SHA-256 در PostgreSQL؛ purpose و email مقصد bind شده‌اند. صدور تازه توکن قبلی همان purpose را باطل می‌کند. Outbox فقط intent بی‌secret دارد؛ worker هنگام ارسال secret می‌سازد. ارسال SMTP بیرون transaction است. بعد از failure/crash، حداکثر پنج تلاش با فاصلهٔ پنج دقیقه؛ احتمال ایمیل تکراری در failure مبهم SMTP پذیرفته است و تنها آخرین لینک معتبر می‌ماند. retry کار مرده باید پس از بررسی عملیاتی انجام شود. پیام حساب کاربری در InternalInbox نمایش داده نمی‌شود.

SMTP واقعی با TLS و `ACCOUNT_LINK_BASE_URL` صریح HTTPS در production الزامی است. Mailpit محلی پیام را نگه می‌دارد و ارسال بیرونی نمی‌کند. ایمیل اختیاری است؛ کاربر بدون ایمیل verified هنوز مسیر بازیابی ندارد.

## کسب‌وکار و بررسی

CreateBusiness اطلاعات تجاری و نشانی می‌گیرد؛ مالکیت، وضعیت و مجوز از input گرفته نمی‌شوند. business list فقط مالکیت شخص را برمی‌گرداند. UUID متعلق به Business دیگر برای شخص عادی 404 است. اپراتور از صف حداقلی پرونده را claim می‌کند و بعد دادهٔ خصوصی آن را می‌بیند؛ مسئول دیگر حق تصمیم ندارد. owner می‌تواند reassign یا controlled access را با reason تغییر دهد.

آپلود فعلی هر بار یک فایل multipart می‌گیرد؛ بخش فعالیت حداکثر ۱۰ فایل ارجاع می‌دهد. پسوند/MIME/signature/size بررسی، object خصوصی و metadata pending ثبت و ClamAV باید clean بدهد. unavailable برابر 503 و فایل pending غیرقابل‌دریافت است؛ upload retry فایل تازه می‌سازد و فایل قبلی خودکار حذف نمی‌شود. ملی/تاریخ تولد در بخش خصوصی‌اند و audit فقط تغییر بخش را ثبت می‌کند. هر دو بخش با یک submit وارد صف می‌شوند؛ approved در اصلاح بخش دیگر ثابت می‌ماند.

URL دسترسی ۶۰ثانیه‌ای فقط پس از authorization و audit صادر می‌شود. در فاصلهٔ اعتبار URL، ابطال لحظه‌ای مستقل از S3 ممکن نیست. حذف دستی، legal hold ناشی از پرونده و بازاعمال tombstone پس از restore هنوز تسک باز هستند؛ فیلدهای metadata جای اجرای این جریان نیستند.

## قرارداد خطا و اجرا

بازنگری پس از تأیید: `POST businesses/{id}/revisions/` یک یا چند بخش کامل `profile`، `identity` و `activity` می‌گیرد. بخش تغییرنکرده از نسخهٔ مصوب کپی می‌شود. Business همچنان verified و اطلاعات جاری ثابت است. صف `operations/business-revision-queue/` بدون payload خصوصی است؛ اپراتور مسئول پس از claim می‌تواند نسخه‌ها را مقایسه و هر بخش pending را review کند. `PUT business-revisions/{id}/` فقط بخش برگشتی را اصلاح و ارسال مجدد می‌کند. آخرین approval به‌صورت اتمیک پروفایل، نشانی و دادهٔ مدارک را جایگزین می‌کند؛ before/proposed در نسخهٔ نهایی قابل‌ویرایش نیستند.

خطای DRF: `{code,message,fields,request_id}` و header `X-Request-ID`؛ پاسخ‌ها `Cache-Control: no-store`. collectionها pagination با اندازهٔ ۲۵ و سقف ۱۰۰. throttling برنامه با Redis انجام می‌شود؛ rate limit شبکه/ingress لازم است زیرا شمارش DRF زیر رقابت تضمین سخت ندارد.

Audit PostgreSQL trigger تغییر/حذف ردیف را رد می‌کند؛ مالک DB همچنان می‌تواند trigger را تغییر دهد، بنابراین نقش migration و runtime در staging باید جدا باشد. logger فقط allowlist و بدون body/token/مدرک است.

منابع فنی بازبینی‌شده: [Django row locks](https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update)، [SimpleJWT blacklist](https://django-rest-framework-simplejwt.readthedocs.io/en/stable/blacklist_app.html). اعتبارسنجی رفتار واقعی با تست PostgreSQL پروژه انجام می‌شود.
