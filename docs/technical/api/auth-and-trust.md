# قرارداد هویت و اعتماد

مرجع ماشین‌خوان: [openapi.yaml](openapi.yaml). فقط مسیرهای پیاده‌شده در schema آمده‌اند؛ پیش‌نویس کاتالوگ در [قرارداد کاتالوگ](catalog-drafts.md) آمده؛ سفارش، مالی، حمل و انتشار هنوز endpoint ندارند.

## نشست و مرز BFF

`register` فقط User می‌سازد؛ `login` access پنج‌دقیقه‌ای و refresh با حداکثر عمر هفت‌روز از آغاز نشست می‌دهد. `sid` به AuthSession پایدار اشاره می‌کند؛ نقش و Business در JWT تثبیت نمی‌شوند. refresh با lock User سپس Session چرخانده می‌شود؛ refresh قدیمی خانواده را revoke می‌کند. BFF باید refresh هر نشست را single-flight کند؛ دو refresh هم‌زمان عمداً reuse محسوب می‌شوند. `logout` نشست جاری و `all_sessions=true` همه را باطل می‌کند. پس از reset همهٔ نشست‌ها بسته‌اند.

Django فقط Bearer را برای API می‌پذیرد؛ session cookie Django مجوز API نیست. NextAuth/BFF باید توکن را فقط سمت سرور نگه دارد، CSRF/origin درخواست‌های cookie-based را کنترل و secret لینک ایمیل را از log/referrer دور نگه دارد. Django به شبکهٔ خصوصی و ingress مورداعتماد محدود شود. پیاده‌سازی BFF و تست مرورگر جزو کد فعلی backend نیست و گیت استقرار باقی است.

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


## BFF ثبت‌نام وب — 2026-09-24

`POST /api/bff/auth/register` در Next.js فقط به `POST /api/v1/auth/register/` متصل است.
body همان RegisterRequest است؛ خروجی موفق وب `201 {"created": true}` است، نه User یا
TokenPair. ثبت‌نام ورود خودکار ندارد. ورود/نشست/refresh/logout وب طبق
[قرارداد نشست وب](../frontend/web-sessions.md) پیاده شده‌اند.

- `NEXTAUTH_URL` origin معتبر وب و `DJANGO_API_URL` origin ثابت بک‌اند است؛ در production
  هر دو الزامی‌اند. Host و forwarded headers ورودی مرجع اعتماد نیستند.
- origin نامعتبر/غایب و cross-site با 403 رد می‌شوند؛ فقط JSON و حداکثر 8 KiB پذیرفته می‌شود.
- cookie، Authorization و X-Forwarded-For مرورگر به Django منتقل نمی‌شوند.
- درخواست و پاسخ no-store هستند؛ redirect و retry غیرفعال‌اند و timeout ده ثانیه است.
- کدهای وب: `invalid_input`، `origin_rejected`، `unsupported_media_type`، `payload_too_large`،
  `registration_rejected`، `registration_throttled` و `registration_unavailable`. متن خام
  و fields بک‌اند منتشر نمی‌شوند؛ پیام مرورگر از کاتالوگ همان زبان می‌آید.
- شکست شبکه ممکن است بعد از ثبت موفق رخ دهد؛ UI نتیجه را نامشخص اعلام می‌کند.

نرخ‌محدودسازی فعلی Django برای IP سرور BFF مشترک است (`NUM_PROXIES=0`، register پنج بار
در دقیقه). پیش از انتشار عمومی باید محدودیت کاربر در ingress قابل‌اعتماد و قرارداد IP
سرورهای مجاز تعیین شود؛ forwarded header دلخواه مرورگر راه‌حل آن نیست.

صفحه‌های `/{locale}/terms` و `/{locale}/privacy` محتوای پذیرش ثبت‌نام را نمایش می‌دهند.
متن اولیه بر اساس قواعد موجود MVP نوشته و با نسخه‌های جاری TERMS_VERSION/PRIVACY_VERSION
برابر `2026-09-07` متناظر شده است؛ این شناسه، زمان نوشتن صفحه نیست. تغییر بعدی معنای
این سیاست‌ها باید همراه نسخهٔ تازه در Django و متن/آزمون فرانت باشد؛ قبول از client به
معنی امکان تعیین نسخهٔ سیاست نیست.


### مسیرهای وب PRD-01 — 2026-09-25

این‌ها قرارداد BFF فرانت‌اند هستند و API عمومی Django را تغییر نمی‌دهند:

- NextAuth: `GET /api/auth/csrf`، `GET /api/auth/providers` و `POST /api/auth/callback/credentials`
  برای ورود؛ POST علاوه بر CSRF خود NextAuth به Origin معتبر نیاز دارد و بدنه حداکثر 8 KiB است.
- `GET /api/auth/session` هیچ token/شناسهٔ vault/مجوزی برنمی‌گرداند؛ مرجع UI نیست.
- `GET /api/bff/auth/session`: User پس از بررسی زندهٔ `/me/`؛ نبود اعتبار 401 و اختلال 503.
- `POST /api/bff/auth/logout`: Origin معتبر، ابطال Django، حذف vault و cookie، سپس 204؛
  در شکست نامطمئن 503 و بسته‌شدن دسترسی محلی، با امکان تلاش مجدد. مسیر signout عمومی
  NextAuth بسته است تا revocation دور زده نشود.
- همهٔ پاسخ‌های هویتی `no-store` هستند. cookie وب فقط شناسهٔ تصادفی رمز‌شدهٔ vault است؛
  دسترسی Bearer ارسالی مرورگر در BFF پذیرفته نمی‌شود. قراردادهای JWT Django ثابت‌اند.


## قرارداد وب تأیید ایمیل و بازیابی — 2026-09-26

Worker لینک را به شکل `ACCOUNT_LINK_BASE_URL#purpose=verify|reset&token=…` می‌سازد؛
secret در query نیست و با GET اولیه یا Referer ارسال نمی‌شود. مسیر عمومی
`/{locale}/account/confirm` فقط بعد از ارسال صریح فرم، توکن را در body به BFF می‌فرستد.
fragment هنگام ارسال از نوار آدرس پاک می‌شود؛ تا آن زمان reload لینک را مصرف نمی‌کند.
توکن فقط در حافظهٔ صفحه است؛ cookie دوم، storage یا Query cache برای آن وجود ندارد.
لینک قدیمی با query پذیرفته نمی‌شود؛ کاربر باید لینک تازه درخواست کند. پس از استقرار این
تغییر، worker نیز باید با کد جدید راه‌اندازی شود. قرارداد JSON endpointهای Django تغییر نکرد.

BFF ثابت `/api/bff/auth/recovery/{action}` برای `email` از PUT و برای
`request-verification`، `request-reset`، `confirm` و `reset` از POST استفاده می‌کند؛ GET رد
می‌شود. Origin، JSON، سقف 8 KiB و schema کنترل می‌شوند؛ پاسخ‌ها no-store هستند. تغییر ایمیل
و ارسال تأیید، نشست معتبر می‌خواهند. خطای upstream به پیام عمومی محلی تبدیل می‌شود.
درخواست‌های نوشتن حتی پس از خطای 401 تکرار نمی‌شوند؛ refresh لازم پیش از نوشتن انجام می‌شود.
بازیابی موفق cookie جاری و cache خصوصی را پاک می‌کند و تب‌های دیگر را از تغییر نشست باخبر
می‌سازد؛ ابطال همهٔ نشست‌ها همچنان مسئولیت Django است.


## BFF پروفایل اولیهٔ کسب‌وکار — 2026-09-26

- `GET /api/bff/accounts/business`: نشست opaque وب به endpoint ثابت Django
  `GET /api/v1/businesses/` متصل می‌شود؛ خروجی فقط Business مالک یا null است. شناسهٔ کسب‌وکار،
  owner یا URL صفحهٔ بعد از مرورگر پذیرفته نمی‌شود و لینک pagination backend منتشر نمی‌شود.
- `POST /api/bff/accounts/business`: Origin معتبر، JSON تا 16 KiB و BusinessInputRequest
  معتبر لازم است. فقط فیلدهای تجاری/نشانی عبور می‌کنند؛ مالک، وضعیت و مجوزهای تزریقی حذف
  می‌شوند. Django مالکیت یگانه را اتمیک اعمال می‌کند؛ موفقیت وب `201 {created:true}` است.
- دادهٔ شخصی در پاسخ mutation یا variables کش تکرار نمی‌شود؛ موفقیت، query همان کاربر را
  invalidate می‌کند تا پروفایل از پاسخ زندهٔ مجاز خوانده شود. خطای مبهم retry خودکار ندارد؛
  UI دکمهٔ بررسی پروفایل موجود را ارائه می‌کند. 409 به کد عمومی business_exists نگاشت می‌شود.
- پاسخ‌ها no-store و خطاها بدون fields/message خام upstream هستند. JWT فقط سمت سرور است.
  خواندن می‌تواند یک 401 را پس از refresh تکرار کند؛ ساخت هرگز replay نمی‌شود.

قرارداد API Django تغییر نکرد. Transport مشترک server/django-request.ts از auth استخراج
شد چون اکنون دو خانوادهٔ endpoint همان timeout/headers/error/no-store را مصرف می‌کنند؛
آداپتر feature فقط مسیر ثابت را می‌فرستد. این helper از مرورگر قابل‌استفاده نیست.


## تکمیل onboarding وب — 2026-09-26

- `PUT businesses/{id}/draft/`: نام، تلفن، توضیح، نشانی و `logo: UUID|null`؛ مالکِ فعال، قفل ردیف Business و وضعیت draft یا changes_requested با بخش activity برگشتی لازم‌اند. kind/owner/status/controlled_access ورودی نیستند. لوگو فقط StoredFile متعلق به همان مالک/کسب‌وکار با purpose=business_logo، clean و بدون deleted_at است. تغییرات پروفایل و نشانی اتمیک و audit بدون مقادیر خصوصی است.
- Business اکنون `logo` nullable دارد؛ migrationهای accounts/0004 و operations/0011 لازم‌اند. upload موجود purpose تازهٔ business_logo را می‌پذیرد؛ تصویر معتبر JPG/PNG/WebP تا ۵ MiB، رضایت جاری و ClamAV الزامی است.
- `GET files/policy/` نسخهٔ رضایت جاری را به کاربر واردشده می‌دهد. `GET files/{id}/content/` همان مجوز دانلود و audit را اجرا و bytes خصوصی را no-store برمی‌گرداند؛ HTML/SVG مجاز نیستند. endpoint قدیمی لینک امضاشده تغییری ندارد.
- صف تأیید، pendingها و پرونده‌های changes_requested/rejected مسئول فعلی را با pagination و status غیرحساس برمی‌گرداند؛ مالک سامانه همهٔ این وضعیت‌ها را می‌بیند. مدارک همچنان فقط پس از مجوزِ مسئول قابل خواندن‌اند.
- BFF `/api/bff/accounts/onboarding/{action}` فقط allowlist ثابت policy/queue/detail/sections/content برای GET، draft/identity/activity برای PUT و submit/claim/review/reopen/upload برای POST دارد. شناسه UUID و page عدد محدود است؛ URL دلخواه عبور نمی‌کند. JSON تا 16 KiB و multipart تا 11 MiB پیش از parse محدود می‌شوند، هر upload یک فایل تا 10 MiB دارد. سقف لوگو و صحت محتوا در Django نیز اعمال می‌شوند.
- تغییرات JSON فقط completed:true برمی‌گردانند؛ upload فقط metadata فایل معتبر را می‌دهد. هیچ mutation خودکار تکرار نمی‌شود. خطاهای 403/404/409 حفظ ولی متن خام و fields حذف می‌شوند. فایل‌ها از BFF هم‌مبدأ با no-store، nosniff و sandbox منتقل می‌شوند؛ JWT و URL ذخیره‌سازی به مرورگر نمی‌روند.
- اطلاعات هویت و فایل‌های انتخاب‌شده فقط در حافظهٔ فرم‌اند، نه storage یا mutation variables. Queryها به user/business محدود و با تغییر نشست پاک می‌شوند. focus مجوز حساب را بازبینی می‌کند بدون بازسازی پیش‌نویس هنگام برگشت از file picker؛ pagehide/visibility همچنان دادهٔ خصوصی را می‌بندند.


## تکمیل رابط اعتماد حساب — 2026-09-27

- `GET /api/v1/accounts/trust-access/`: فقط نقش فعال اپراتور/مالک؛ خروجی `{owner: boolean}`. نقش از نشست مرورگر استنتاج نمی‌شود.
- `GET /api/v1/accounts/directory/?page=…`: صفحهٔ ۲۵تایی حساب‌ها با `id`, `first_name`, `last_name`, `mobile`, `is_suspended`, `operator` و `business` nullable. مالک سامانه همه را می‌بیند؛ اپراتور فقط مالک کسب‌وکارهایی را می‌بیند که تأیید یا بازنگری‌شان به او واگذار شده است. کاربر عادی 403 می‌گیرد.
- `GET /api/v1/accounts/suspensions/?page=…`: فقط سابقهٔ تعلیق خود User یا Business متعلق به او، بدون پیشنهادهای منتشرنشده و بدون مدارک داخلی اپراتور. دلایل و زمان‌های فعال‌سازی/رفع محفوظ‌اند.
- پروفایل بازنگری `logo` اختیاری و nullable دارد: حذف فیلد لوگوی قبلی را حفظ می‌کند؛ null حذف صریح است. فایل باید متعلق به مالک و همان Business، با purpose=`business_logo` و اسکن clean باشد. در تصویب نهایی نیز مدارک دوباره بررسی می‌شوند. انتشار لوگو همراه سایر بخش‌ها اتمیک است؛ `first_verified_at` تغییر نمی‌کند.
- آپلود `purpose=suspension` فقط برای اپراتور/مالک روی Business قابل‌مشاهده مجاز است. فایل رضایت جاری و اسکن clean می‌خواهد. ارجاع در پیشنهاد فقط برای همان Business یا Business کاربر هدف مجاز است. دانلود فقط بارگذار، مالک سامانه یا اپراتور مسئول همان پرونده؛ واگذاری تأیید کسب‌وکار به‌تنهایی مجوز مدرک تعلیق نیست.
- `GET /operations/work/?kind=suspension|disposition&include_closed=true` تاریخچهٔ پرونده‌های نهایی را نیز برمی‌گرداند. پارامتر برای نوع دیگر رد می‌شود. timeline همچنان فقط برای مسئول پرونده یا مالک سامانه است و برای تعلیق، شناسهٔ مدارک را نیز برمی‌گرداند.

BFF وب `/api/bff/accounts/trust/[action]` مقصد ثابت، شناسه UUID، method مشخص، JSON حداکثر 32 KiB، بررسی origin/session و `no-store` دارد. فهرست سفید شامل بازنگری، نقش اپراتور، controlled access، پیشنهاد و فرمان تعلیق، تصمیم سفارش و سوابق است. فرمان حساس و پاسخ تیکت `idempotency_key` دارند؛ retry خودکار ندارند. شناسه‌ها، توکن و پاسخ خطای خصوصی وارد پیام UI نمی‌شوند. پاسخ نوشتن فقط `{completed:true}` است.

سوابق سفارش از snapshot همان سفارش، و تیکت/پاسخ/پیوست از API موجود support خوانده می‌شوند؛ قیمت زندهٔ کاتالوگ در نمای محدود دریافت نمی‌شود. آپلود support از BFF مدارک به مسیر ثابت `/api/v1/support/files/` با `ticket_id` می‌رود، نه مسیر فایل تأیید کسب‌وکار.
