# برنامهٔ مرحله‌ای توسعهٔ بک‌اند

وضعیت: در حال اجرا — طراحی کلان و برش هویت/اعتماد؛ سایر قابلیت‌های MVP هنوز بازند


## تحویل اجرایی 2026-09-07

اسکیل‌های architecture، domain-modeling، database-architect، backend-architect، architecture-decision-records، django-pro و postgres-best-practices در این برش استفاده شدند. طرح دامنه و ERD کلان ایجاد و دیتابیس اولین برش به migration تبدیل شد؛ طراحی فیزیکی همهٔ ماژول‌های تجاری هنوز تکمیل نیست.

| task کوچک | اندازه | خروجی و فایل‌های اصلی | معیار و verification | وضعیت |
|---|---|---|---|---|
| 1.1.a مرز دامنه | S | database/domain-model.md | ownership، invariant و وابستگی هر context | done |
| 1.2.a مدل وضعیت | M | database/state-machines.md | چرخهٔ دقیق اعتماد و خلاصهٔ چرخه‌های تجاری؛ تفصیل هر ماژول پیش از ساخت آن | done برای برش جاری |
| 1.3.a schema اعتماد | M | database/erd.md، data-dictionary.md، accounts/models.py | قیود PostgreSQL، رابطه و snapshot؛ migration از صفر | done |
| 2.1.a پیکربندی | M | pyproject/lock، settings، Dockerfile، compose | Python 3.13.14 / Django 5.2.17؛ DB واقعی؛ build container جدا در انتظار اجرا | done برای runtime محلی |
| 2.2.a قرارداد مشترک | S | common، config/urls.py، OpenAPI | schema drift، خطا، pagination، health و deny-by-default | done |
| 2.3.a کیفیت | S | pyproject، workflow، tests/test_contract.py | Ruff، mypy، pytest، coverage؛ CI تعریف‌شده ولی اجرای remote هنوز مشاهده نشده | done برای بررسی محلی |
| 2.4.a audit و outbox | M | operations/models.py، services.py، tasks.py، migrations | trigger الحاقی، commit مشترک و inbox idempotent | done |
| 2.4.b مدارک خصوصی | M | operations/files.py، common/storage.py، API و test_files | signature/size/consent/scan gate و دسترسی؛ تست واقعی provider و حذف کنترل‌شده باز | in-progress |
| 3.1.a هویت و نشست | M | auth_services.py، authentication.py، serializers/api، test_auth | ثبت‌نام، موبایل canonical، rotation/reuse/logout و تعلیق؛ رقابت PostgreSQL | done برای Django |
| 3.1.b بازیابی ایمیل | M | email_services.py، tasks، API، test_auth، ADR-0013 | ایمیل verified، لینک منقضی/مصرف‌شده، رمز فعلی برای تغییر ایمیل، revoke همهٔ نشست‌ها | done برای Django؛ SMTP/BFF محیط مقصد باز |
| 3.2.a مالکیت | S | business_services.py، permissions.py، test_business | یک مالک/یک Business و tenant isolation | done |
| 3.3.a بررسی اولیه | M | verification_services.py، API، test_onboarding_api | دو بخش مستقل، اصلاح، claim، رد/بازگشایی و مجوز MVP؛ هر دو نوع Business | done با mock provider فایل |
| 3.4.a عملیات نقش | S | role_services.py، management، operations/api، test_operations | bootstrap اولیه، تغییر نقش فقط owner، آزادسازی claim و نقش هم‌زمان | done برای صف‌های فعلی |
| 3.5.a بازنگری اعتماد | M | revision_services.py، revision_api.py، models/migrations، test_revisions، ADR-0014 | حفظ نسخهٔ مصوب تا پذیرش، نسخهٔ نهایی immutable و اصلاح مستقل بخش | done |

### اجرای یک‌دستوری محیط توسعه

از ریشهٔ repository، `./run-backend.sh` همهٔ سرویس‌های Compose، آماده‌سازی bucket خصوصی، migration، web، worker و beat را اجرا می‌کند. `Ctrl+C` و خطای startup، `compose down` بدون حذف volume را اجرا می‌کنند. فرمان `prepare_local` فقط با settings محلی مجاز است و پیش از migration منتظر PostgreSQL، broker، SMTP، ClamAV و S3 می‌ماند.

تست launcher: پنج تست مستقل از provider پاس شدند (cleanup هنگام خطا و SIGINT، محدودیت settings، timeout و ترتیب initialization). Ruff و mypy پاس شدند. توقف واقعی حین Docker build نیز بررسی شد؛ دانلود اولیه برای این بررسی متوقف شد و راه‌اندازی سرتاسری تمام containerها هنوز تأیید نشده است.

### راستی‌آزمایی محلی

- ۴۱ تست روی PostgreSQL 16.10 پاس؛ coverage برابر ۹۰٫۵۴٪ (حداقل لازم ۸۰٪).
- Ruff، formatter، mypy روی ۴۶ فایل و Django system check پاس.
- migration از صفر و migration بازنگری روی دیتابیس local اعمال؛ `makemigrations --check` بدون drift.
- OpenAPI با `--validate --fail-on-warn` و مقایسهٔ snapshot پاس.
- readiness واقعی PostgreSQL/Redis برابر 200 و ping یک worker موقت Celery روی Redis موفق؛ worker تست پس از بررسی بسته شد.
- `pip-audit` پس از ارتقای DRF به 3.17.2 هیچ آسیب‌پذیری شناخته‌شده‌ای گزارش نکرد. دو مورد DRF 3.16.1 با حداقل نسخهٔ اصلاح‌شده رفع شدند؛ [release notes رسمی](https://www.django-rest-framework.org/community/release-notes/#3172).
- Docker image وب، providerهای MinIO/ClamAV/SMTP واقعی، secret scan و اجرای remote CI در این نوبت راستی‌آزمایی نشده‌اند؛ نتیجهٔ محلی جای آن‌ها نیست.

### مرز باقی‌ماندهٔ این تحویل

- BFF/NextAuth، CSRF و مصرف امن لینک در مرورگر پیاده نشده‌اند.
- اتصال واقعی MinIO/ClamAV/SMTP، health object storage، گردش حذف/hold/tombstone و restore drill باید آزموده و تکمیل شوند.
- ویرایش عمومی پروفایل شخص/اطلاعات اولیهٔ Business، لوگو و جزئیات بازتخصیص صف بازنگری هنوز task تکمیلی‌اند؛ endpointهای موجود فقط محدودهٔ schema را پوشش می‌دهند.
- فازهای کاتالوگ، تعرفه، سبد/سفارش، مالی، حمل، مغایرت، پشتیبانی، آثار تعلیق، نظر و داشبورد هنوز پیاده نشده‌اند. دامنه و schema پیشنهادی آن‌ها به معنی تحویل نیست.
- هیچ checkpoint کل MVP یا آمادگی پایلوت بسته نشده است.

## هدف

تبدیل خروجی کشف محصول به یک بک‌اند Django قابل‌آزمون، قابل‌ردیابی و آمادهٔ اجرای MVP کنترل‌شده. ترتیب فازها بر اساس وابستگی داده و سپس برش‌های عمودی قابل‌استفاده تنظیم شده است.

اولویت و مرحلهٔ پذیرش capabilityها در `capability-implementation-order.md` مرجع است؛ فازهای این سند بسته‌های اجرایی لازم برای رسیدن به همان دروازه‌ها هستند.

موارد این سند **بستهٔ کاری roadmap** هستند، نه issue قابل‌واگذاری مستقیم. پیش از شروع هر فاز، بسته‌های همان فاز با `task-template.md` به taskهای S/M شکسته می‌شوند؛ هر task باید در یک session متمرکز قابل‌پیاده‌سازی و راستی‌آزمایی باشد.

## قواعد اجرا

- قبل از کدنویسی هر فاز، مدل، state machine و قرارداد API همان فاز مرور شوند.
- راهبرد تحویل، ساخت زیرساخت پایه و سپس یک مسیر عمودی ساده اما کامل از ثبت‌نام تا تحویل است؛ قابلیت‌های مغایرت، پشتیبانی، امتیازدهی و داشبورد پس از قابل‌اجراشدن این مسیر تکمیل می‌شوند.
- کنترل دسترسی و ثبت حسابرسی از نخستین برش عمودی فعال باشند؛ هر فاز حداقل ابزار مدیریتی لازم خود را تحویل دهد.
- هیچ بستهٔ roadmap مستقیم وارد اجرا نمی‌شود؛ task بزرگ‌تر از حدود ۵ فایل یا یک session به بخش‌های کوچک‌تر شکسته شود.
- هر تغییر وضعیت فقط از service/command دامنه عبور کند و تست invariant داشته باشد.
- migration، API schema، تست و سند مرتبط بخشی از همان task هستند.
- وضعیت `[x]` فقط وقتی ثبت شود که معیار پذیرش و verification هر دو پاس شده باشند.

## نمای وابستگی فازها

```text
P. بستن نقشهٔ محصول و نوشتن PRDها
            ↓
۰. رفع ابهام فنی و پذیرش تصمیم‌ها
            ↓
۱. مدل دامنه، state machine و ERD
            ↓
۲. scaffold و زیرساخت مشترک
            ↓
۳. هویت/کسب‌وکار/تأیید
            ↓
۴. کاتالوگ/قیمت/موجودی
            ↓
۵. سبد/سفارش/پرداخت شبیه‌سازی‌شده
            ↓
۶. آماده‌سازی/ارسال/تحویل
            ↓
۷. مغایرت/پشتیبانی/تسویه
            ↓
۸. امتیاز/تعلیق/عملیات مدیریت
            ↓
۹. داشبورد، سخت‌سازی و آمادگی پایلوت
```

## برش اجرایی اول

اولین مسیر قابل‌اجرای سرتاسری شامل یک تولیدکننده و خرده‌فروش تأییدشده، یک محصول موجود و منتشرشده، سبد و سفارش، پذیرش، پرداخت شبیه‌سازی‌شده، حمل دستی، یک مرسوله و تأیید تحویل است. مدل دامنه باید از ابتدا با محدودهٔ کامل MVP سازگار باشد، اما حالت‌های چندتولیدکننده‌ای، تولید سفارشی و استثناها در برش‌های بعدی فعال و آزموده می‌شوند.

## موج دوم: تکمیل هستهٔ تجاری

پس از برش اول، تنوع و SKU، قواعد بسته و قیمت پلکانی، سبد چندتولیدکننده‌ای، عرضهٔ آماده/سفارشی/ترکیبی، رزرو و مهلت‌ها و چند گروه حمل و مرسوله تکمیل می‌شوند. پایان این موج یعنی مسیر اصلی تجارت در محدودهٔ کامل MVP قابل‌اجرا و آزمون است.

## موج سوم: ایمن‌سازی و بستن چرخه

پیش از پایلوت کنترل‌شده، لغو و بازپرداخت، مغایرت و جبران، پشتیبانی، تسویهٔ نهایی، رسیدگی اپراتور به وضعیت‌های گیرکرده و تعیین تکلیف سفارش‌های فعال هنگام تعلیق تکمیل و آزموده می‌شوند.

## موج چهارم: تکمیل MVP و آمادگی پایلوت

پس از کامل‌شدن چرخهٔ امن سفارش، امتیاز و نظر، انتشار و نظارت بر نظرها، داشبوردهای تولیدکننده/خرده‌فروش/مدیر، سخت‌سازی نهایی و کنترل آمادگی پایلوت انجام می‌شوند.

## فاز P — آمادگی محصول برای development

**هدف:** تبدیل تصمیم‌های کشف کلان و پنج ناحیهٔ ناقص اولیه به PRDهای بدون تصمیم باز. این فاز در `.scratch/mvp-plan/` پیگیری می‌شود و از محدودهٔ طراحی فنی جداست.

### بستهٔ P.1 — قابلیت‌ها و جریان‌های ناقص

- [x] تیکت ۰۱: تعریف/فهرست قابلیت‌ها بسته و واژهٔ جدید در `CONTEXT.md` تثبیت شود.
- [x] تیکت ۰۲: جریان ثبت‌نام و تأیید کسب‌وکار با مصاحبهٔ تک‌سؤالی بسته و در سند نیازمندی ماندگار شود.
- [x] تیکت ۰۳: جریان ایجاد، بررسی و انتشار محصول بسته و در سند نیازمندی ماندگار شود.
- [x] تیکت ۰۴: مرور، جستجو، فیلتر و صفحهٔ محصول با مصاحبهٔ تک‌سؤالی بسته و در سند نیازمندی ماندگار شود.
- [x] تیکت ۱۰: لجستیک مدیریت‌شده، کاتالوگ خدمات و تعرفهٔ دستی MVP بسته و در سند نیازمندی ماندگار شد؛ اتصال واقعی و استثناهای پیشرفته به پس از MVP موکول شدند.
- [x] تیکت ۰۵: سبد خرید و ثبت سفارش با مصاحبهٔ تک‌سؤالی بسته و در سند نیازمندی ماندگار شد.
- [ ] تصمیم‌های دامنه‌ای همان لحظه با `domain-modeling` در واژه‌نامه و اسناد مبدأ ثبت شوند.

### بستهٔ P.2 — وابستگی، اولویت و ریسک

- [x] تیکت ۰۶ گراف وابستگی capabilityها را نهایی کرد.
- [x] تیکت ۰۷ ترتیب پیاده‌سازی محصولی را نهایی کرد.
- [x] تیکت ۰۸ بدون ابهام حل‌نشدهٔ مؤثر بر schema/API بسته شد؛ ریسک‌های پذیرفته‌شده در `risk-register.md` پیگیری می‌شوند.

### بستهٔ P.3 — PRDها

- [x] تیکت ۰۹ فهرست و مرز PRDها را تعیین کرد و نقشهٔ تصمیم‌گیری محصول بسته شد.
- [x] تقسیم‌بندی ۸ PRD و مالکیت دقیق هر ۶۹ قابلیت در `docs/product/prd-plan.md` پذیرفته شد.
- [x] اسناد نیازمندی موجود به‌عنوان مرجع تفصیلی حفظ شدند و PRDها به‌عنوان اسناد بالادستی محدوده به آن‌ها ارجاع می‌دهند.
- [x] قالب ۹بخشی مشترک PRD و شرط پذیرش بدون سؤال باز مسدودکننده در `docs/product/prd/template.md` تعیین شد.
- [x] هر هشت PRD از تصمیم‌های بسته‌شده و قالب مشترک ساخته و در `docs/product/prd/` ماندگار شدند.
- [x] PRD-01 بدون سؤال باز نوشته و در وضعیت Accepted برای پیاده‌سازی تأیید شد.
- [x] PRD-02 با ۱۳ قابلیت و بدون سؤال باز در وضعیت Accepted برای پیاده‌سازی تأیید شد.
- [x] PRD-03 با ۱۱ قابلیت و بدون سؤال باز در وضعیت Accepted برای پیاده‌سازی تأیید شد.
- [x] PRD-04 با ۸ قابلیت و بدون سؤال باز در وضعیت Accepted برای پیاده‌سازی تأیید شد.
- [x] PRD-05 با ۵ قابلیت و بدون سؤال باز در وضعیت Accepted برای پیاده‌سازی تأیید شد.
- [x] PRD-06 با ۸ قابلیت و بدون سؤال باز در وضعیت Accepted برای پیاده‌سازی تأیید شد.
- [x] PRD-07 با ۶ قابلیت و بدون سؤال باز در وضعیت Accepted برای پیاده‌سازی تأیید شد.
- [x] PRD-08 با ۹ قابلیت عملیات و داشبورد، کش آماری پنج‌دقیقه‌ای و claim اتمیک صف بدون سؤال باز در وضعیت Accepted تأیید شد.
- [x] تصمیم‌های نقشه در `docs/product/prd-plan.md` و اسناد مرجع ماندگار شدند و scratch فقط tracker باقی ماند.

**Verification:** همهٔ تیکت‌های ۰۱ تا ۱۰ بسته، بخش `Decisions so far` در map کامل و PRDهای مصوب دارای actor، flow، edge case، acceptance criteria و out-of-scope باشند.

### Checkpoint P

- [x] هیچ تصمیم محصولی باز که مدل داده، permission، API یا ترتیب development را عوض کند باقی نمانده است.

## فاز ۰ — بستن دروازه‌های فنی

**وابستگی:** Checkpoint P

**هدف:** جلوگیری از تثبیت تصمیم‌های گران بر پایهٔ فرض پنهان.

### Task 0.1 — حل تعارض و سؤال‌های باز

- [x] تعارض زبان شبیه‌سازی در `made-to-order-flow.md` طبق `ui-language.md` و `payment-simulation.md` اصلاح شد.
- [x] واحد پول: عدد صحیح ریال در داده/API و تومان در رابط تعیین شد.
- [x] زمان و تقویم: UTC/میلادی/ISO 8601 در داده و API و تهران/شمسی در رابط تعیین شد.
- [x] نگهداری فایل حساس: object storage خصوصی، بدون حذف خودکار و با حذف دستی کنترل‌شده طبق ADR-0006 تعیین شد.
- [x] topology کانتینری و provider-neutral طبق ADR-0007 تعیین شد؛ انتخاب نام provider پیش از staging انجام می‌شود.
- [x] برآورد اولیهٔ load و رشد ثبت شد: ۱۰هزار حساب، ۲هزار کسب‌وکار، ۱۰۰هزار SKU، ۱۰۰۰ سفارش روزانه، ۲۰۰ کاربر هم‌زمان و رشد پنج‌برابری.
- [x] محدودیت upload در `file-upload-policy.md` تعیین شد: تصویر محصول ۵MB، سایر فایل‌ها ۱۰MB و حداکثر ۱۰ فایل در هر ارسال.
- [x] ظرفیت برنامه‌ریزی objectهای اصلی سال اول ۱TB و هشدارهای مصرف ۷۰٪ و ۹۰٪ ثبت شد؛ backup جدا برآورد می‌شود و این عدد سقف محصول نیست.

**Verification:** جدول سؤال‌های باز در `requirements-traceability.md` پاسخ و لینک تصمیم داشته باشد.

### Task 0.2 — پذیرش ADRهای پایه

- [x] ADR مونولیت ماژولار (ADR-0003) مرور و پذیرفته شد.
- [x] ADR PostgreSQL (ADR-0004) مرور و پذیرفته شد.
- [x] ADR احراز هویت و ADR file storage/retention نوشته و پذیرفته شدند.
- [x] ADR topology استقرار provider-neutral نوشته و پذیرفته شد.
- [x] ADRهای پول و deadline در ADR-0011 و ADR-0012 نوشته و پذیرفته شدند.

**Verification:** هیچ تصمیم کلیدی موردنیاز فاز ۱ با وضعیت مبهم باقی نماند.

### Checkpoint 0

- [ ] محصول، backend و frontend روی واژه‌ها، مرز MVP و تصمیم‌های پایه توافق دارند.

## فاز ۱ — دامنه و معماری داده

**وابستگی:** فاز ۰

### Task 1.1 — نقشهٔ دامنه و aggregateها

- [ ] bounded contextها، aggregate rootها، value objectها و ownership داده مشخص شوند.
- [ ] commandها، eventهای داخلی و invariantهای هر aggregate فهرست شوند.
- [ ] dependencyهای بین contextها و موارد ممنوع مشخص شوند.

**خروجی:** `docs/technical/database/domain-model.md`

### Task 1.2 — state machineها

- [ ] چرخه‌های Business Verification، Product Publication، Order، Fulfillment، Finance، Shipment، Discrepancy، Ticket، Suspension و Review رسم شوند.
- [ ] actor، precondition، side effect، deadline و terminal state هر transition تعریف شود.
- [ ] transitionهای اپراتوری و دلیل اجباری آن‌ها جدا شوند.

**خروجی:** `docs/technical/database/state-machines.md`

### Task 1.3 — ERD و فرهنگ داده

- [ ] entityها، رابطه‌ها، cardinality و ownership ترسیم شوند.
- [ ] unique/check constraint، index اولیه، snapshot و audit fields تعیین شوند.
- [ ] فیلدهای PII/حساس، retention و سطح دسترسی علامت‌گذاری شوند.

**خروجی:** `docs/technical/database/erd.md` و `data-dictionary.md`

### Task 1.4 — سناریو و invariant قابل‌آزمون

- [ ] برای هر نیازمندی، Given/When/Then مسیر خوشحال و لبه‌های مالی/دسترسی نوشته شود.
- [ ] ردیابی requirement → entity/transition/test تکمیل شود.

**Verification فاز:** design review، اجرای ذهنی حداقل شش گردش اصلی و نبود رابطه یا وضعیت بی‌مالک.

### Checkpoint 1

- [ ] بازبینی تفصیلی مدل دامنه، ERD و state machine همهٔ ماژول‌ها تکمیل شده است. برش اعتماد طراحی و ساخته شده؛ این checkbox پذیرش کل مدل MVP است.

## فاز ۲ — پایهٔ پروژه Django

**وابستگی:** فاز ۱

### Task 2.1 — scaffold و تنظیمات

- [x] `pyproject.toml`، lockfile، Django project و settings محیطی با آخرین patch از Python 3.13 و Django 5.2 LTS ساخته شوند.
- [x] PostgreSQL تنها backend تست integration و production باشد.
- [x] custom User model پیش از اولین migration ایجاد شود.

### Task 2.2 — استانداردهای API و خطا

- [x] DRF، REST JSON، `/api/v1/`، OpenAPI 3، pagination و error envelope طبق ADR-0008 پایه شوند.
- [ ] اعتبارسنجی schema و contract test برای جلوگیری از اختلاف OpenAPI و endpointها در CI اجرا شوند.
- [x] request ID، health endpoint و logging ساخت‌یافته اضافه شوند.
- [x] policy پیش‌فرض API برابر authenticated/deny-by-default باشد و استثناهای عمومی صریح شوند.

### Task 2.3 — کیفیت و CI

- [x] formatter/linter/type check/test runner و coverage threshold تنظیم شوند.
- [ ] test database واقعی PostgreSQL و migration check در CI اجرا شوند.
- [ ] secret scan و dependency/security scan پایه شوند.

### Task 2.4 — worker و فایل

- [ ] Celery، scheduler و Redis طبق ADR-0009 با task آزمایشی idempotent، retry محدود و timeout راه‌اندازی شوند.
- [ ] storage abstraction و محیط local/S3-compatible خصوصی طبق ADR-0006 تعریف شود.
- [ ] metadata فایل، purpose، classification، owner، hash، hold، tombstone و audit دسترسی/حذف پیاده و آزموده شوند.
- [ ] URL امضاشدهٔ کوتاه‌عمر، allowlist نوع، سقف حجم/تعداد، بررسی signature و اسکن بدافزار طبق `file-upload-policy.md` پیاده شوند.
- [ ] transactional outbox یا الگوی تضمین‌شدهٔ هم‌ارز برای dispatch پس از commit پیاده و تست شود.
- [ ] interface اعلان و provider داخلی `InternalInbox` با dispatch idempotent ساخته شود؛ provider مالک منطق یا secret کد تحویل نباشد.

**Verification فاز:** build پاک، migration از صفر، test/quality checks، health web/worker و تولید OpenAPI.

### Checkpoint 2

- [ ] محیط local و CI یکسان و scaffold آمادهٔ اولین برش عمودی است.

## فاز ۳ — هویت، کسب‌وکار و تأیید

**وابستگی:** فاز ۲

### Task 3.1 — ثبت‌نام و احراز هویت JWT/NextAuth

- [x] ثبت‌نام، ورود، خروج، refresh، بازیابی دسترسی و rate limit پیاده شود.
- [ ] Django مرجع هویت و صادرکنندهٔ access/refresh JWT و NextAuth لایهٔ session/BFF باشد؛ JWT خام به JavaScript مرورگر نرسد.
- [ ] rotation/blacklist، CSRF، token replay، refresh reuse و تعلیق فوری تست شوند.
- [x] custom User و وضعیت تعلیق شخص تست شود.

### Task 3.2 — کسب‌وکار و مالکیت

- [x] Business، نوع کسب‌وکار، Membership مالک و آدرس‌ها پیاده شوند.
- [x] قید «یک مالک در MVP» و tenant isolation در DB/API آزموده شود.

### Task 3.3 — احراز و تأیید دستی

- [ ] مدارک هویت/فعالیت، submission، review و reason ثبت شوند.
- [ ] صف اپراتور و transitionهای تأیید/رد با audit trail ساخته شوند.

### Task 3.4 — ماتریس دسترسی

- [ ] platform role، business type، membership role و business status جدا اعمال شوند.
- [ ] جدول دسترسی به permission testهای data-driven تبدیل شود.

**Verification فاز:** کاربر عمومی ثبت‌نام می‌کند؛ کسب‌وکار تا تأیید فعالیت تجاری ندارد؛ دادهٔ کسب‌وکار دیگر قابل‌مشاهده نیست.

### Checkpoint 3

- [ ] یک تولیدکننده و خرده‌فروش از ثبت‌نام تا تأیید کامل طی می‌شوند.

## فاز ۴ — کاتالوگ، قیمت و عرضه

### تحویل پیش‌نویس — 2026-09-08

ماژول catalog شامل دسته، ویژگی، مقدار استاندارد، محصول خصوصی و تنوع است. SKU در Business و ترکیب canonical در Product قید یکتا دارند. تصاویر از storage/ClamAV موجود استفاده می‌کنند؛ محدودیت ۵MB و ۸۰۰×۸۰۰، گالری مرتب و fallback تصویر اصلی اعمال می‌شوند. migration، seed اختیاری کیف/کفش و [قرارداد API](../api/catalog-drafts.md) اضافه شدند. اسکیل ponytail برای استفادهٔ مجدد از زیرساخت و پرهیز از dependency جدید اعمال شد.

راستی‌آزمایی: ۵۴ تست روی PostgreSQL پاس؛ پوشش ۹۰٫۸۲٪. Ruff، formatter، mypy (۵۵ فایل)، Django check و قرارداد OpenAPI پاس؛ migrationهای catalog و purpose تصویر روی دیتابیس توسعه اعمال و drift بررسی شد.

پیشنهاد taxonomy و حذف کامل محصول هنوز بازند؛ CAP-CAT-01..03 کامل اعلام نمی‌شوند. قیمت، عرضه، بررسی/انتشار و مرور عمومی مراحل بعدی‌اند.


**وابستگی:** فاز ۳

### Task 4.1 — taxonomy و محصول

- [x] دسته، تعریف ویژگی، محصول پایه، تنوع، SKU و تصاویر پیاده شوند.
- [x] fallback تصویر تنوع به تصویر اصلی محصول آزموده شود.

### Task 4.2 — انتشار و خدمات حمل مجاز

- [ ] draft/review/published/rejected و دلیل اپراتور ساخته شوند.
- [ ] امکان ارسال محصول به تمام استان‌ها با یک یا چند خدمت فعال، دارای تعرفه و قابل‌اجرا شرط انتشار باشد.
- [ ] اتصال محصول به خدمات مجاز پلتفرم و داده‌های لازم بسته برای محاسبه و اعتبارسنجی پوشش ساخته شوند.
- [ ] تطبیق تعرفهٔ مسیر به‌ترتیب شهر‌به‌شهر، استان‌به‌استان و پیش‌فرض سراسری انجام شود و نبود تطبیق، خدمت را ناموجود کند.
- [ ] وزن بسته‌بندی‌شدهٔ تنوع‌ها جمع و با بازهٔ بدون هم‌پوشانی تعرفه تطبیق داده شود؛ ابعاد، حجم و تعداد بسته در MVP فقط ثبت شوند.

### Task 4.3 — قیمت عمده

- [ ] پله‌های بدون هم‌پوشانی/فاصله، قیمت پیش‌فرض و override تنوع ساخته شوند.
- [ ] محاسبهٔ بستهٔ ثابت و ترکیب آزاد با تست جدول‌محور پوشش داده شود.

### Task 4.4 — موجودی و تولید سفارشی

- [ ] ready stock، production cap، lead time و حالت ترکیبی مدل شوند.
- [ ] availability breakdown و دیرترین lead time از API برگردد.

**Verification فاز:** کاتالوگ عمومی دیده می‌شود؛ قیمت فقط برای خرده‌فروش تأییدشده است؛ محصول ناقص منتشر نمی‌شود.

### Checkpoint 4

- [ ] حداقل یک محصول کیف و یک محصول کفش با تنوع، قیمت، عرضه و حمل کامل قابل سفارش‌اند.

## فاز ۵ — سبد، سفارش و پرداخت شبیه‌سازی‌شده

**وابستگی:** فاز ۴

### Task 5.1 — سبد و اعتبارسنجی قیمت/تعداد

- [ ] cart چندتولیدکننده‌ای و انتخاب fixed pack/free mix ساخته شود.
- [ ] قیمت و availability در preview و checkout دوباره محاسبه شوند.
- [ ] تغییر قیمت با هشدار و تأیید دوباره و نامعتبرشدن قلم بدون حذف یا تغییر خودکار مدیریت شود.
- [ ] اقلام براساس تولیدکننده، مبدأ و خدمت انتخابی به گروه حمل تقسیم و هزینهٔ هر گروه مستقل محاسبه شود.

### Task 5.2 — checkout و snapshot

- [ ] یک OrderGroup و Order مستقل برای هر تولیدکننده اتمیک ساخته شود.
- [ ] قیمت، آدرس، SKU و گروه‌های حمل همراه خدمت، اقلام، وزن، جزئیات تعرفه، مبلغ هزینهٔ حمل و کارمزد snapshot شوند.
- [ ] موجودی و ظرفیت هم‌زمان با ثبت رزرو، در رد/لغو/انقضا آزاد و با پرداخت به تخصیص قطعی تبدیل شوند.
- [ ] idempotency جلوی ساخت checkout تکراری را بگیرد.

### Task 5.3 — پذیرش، رد و deadline

- [ ] پذیرش/رد بدون تغییر یک‌طرفه، دلیل رد و انقضای ۲۴ساعته پیاده شود.
- [ ] reservationها با رقابت هم‌زمان امن و آزادسازی idempotent باشند.

### Task 5.4 — پرداخت و صورتحساب

- [ ] payment event با execution mode شبیه‌سازی‌شده و تفکیک مبلغ کالا، کارمزد و هزینهٔ حمل ثبت شود.
- [ ] invoice یکتا و commission reserved جدا برای هر Order ساخته شود.
- [ ] هیچ ادعای بانکی یا واژهٔ ممنوع در API presentation تولید نشود.

**Verification فاز:** سناریوی چندتولیدکننده، رد یکی، پرداخت دیگری و عدم اثر متقابل end-to-end پاس شود.

### Checkpoint 5

- [ ] گردش ثبت سفارش تا پرداخت‌شده برای حساب کنترل‌شده کامل است.

## فاز ۶ — آماده‌سازی، ارسال و تحویل

**وابستگی:** فاز ۵

### Task 6.1 — آماده‌سازی/تولید

- [ ] شروع، پیشرفت و آماده‌ارسال‌شدن با مجوز و transition معتبر ثبت شوند.
- [ ] قواعد لغو قبل/بعد از شروع آماده‌سازی پوشش داده شوند.

### Task 6.2 — مرسوله و اقلام

- [ ] پرداخت هر گروه حمل یک درخواست حمل idempotent بسازد و تا اعلام آمادگی کامل، تخصیص را مسدود کند.
- [ ] صف آمادهٔ تخصیص، ثبت حمل‌کننده و بازهٔ جمع‌آوری همراه تاریخچهٔ عامل/زمان پیاده شود.
- [ ] استثناهای تخصیص در MVP با اقدام دستی اپراتور و ثبت دلیل قابل‌مدیریت باشند؛ گردش خودکار پیشنهاد جایگزین خارج از MVP است.
- [ ] چند مرسوله، ShipmentItem quantity، بارنامه و tracking history ساخته شوند.
- [ ] مجموع مقدار ارسال‌شده از مقدار قلم سفارش بیشتر نشود.

### Task 6.3 — کد تحویل

- [ ] token لینک امن، OTP کوتاه‌عمر، سقف تلاش، ابطال کد قبلی و مصرف یک‌باره پیاده شوند.
- [ ] کد و token خام در log یا DB غیرایمن ذخیره نشوند.
- [ ] اعلان کد از `InternalInbox` و interface مشترک عبور کند تا adapter واقعی آینده بدون تغییر دامنه اضافه شود.

### Task 6.4 — تحویل تأییدنشده

- [ ] فقط اپراتور با دلیل و مدرک بتواند وضعیت را تعیین تکلیف کند.
- [ ] تحویل آخرین مرسوله، deadline مغایرت را دقیقاً یک بار آغاز کند.

**Verification فاز:** ارسال جزئی/کامل، تحویل با کد، تلاش نامعتبر و مسیر اپراتوری تست end-to-end دارند.

### Checkpoint 6

- [ ] سفارش پرداخت‌شده تا تحویل فیزیکی قابل‌طی‌کردن است.

## فاز ۷ — مغایرت، پشتیبانی و تسویه

**وابستگی:** فاز ۶

### Task 7.1 — ثبت مغایرت

- [ ] پرونده و ردیف در سطح قلم/تعداد/مرسوله با تصویر و deadline ساخته شوند.
- [ ] پرونده فقط تسویهٔ همان Order را hold کند.

### Task 7.2 — پاسخ و داوری

- [ ] پاسخ جزئی تولیدکننده و deadline ۴۸ساعته پیاده شود.
- [ ] بخش رد/بی‌پاسخ تیکت مرتبط بسازد و تصمیم اپراتور reason/evidence داشته باشد.

### Task 7.3 — جبران و تعدیل مالی

- [ ] partial refund، replacement و return workflow داخلی ساخته شوند.
- [ ] کارمزد از snapshot اقلام نگه‌داشته‌شده دوباره محاسبه شود.
- [ ] تعدیل ناشی از نتیجهٔ معتبر به‌صورت سیستمی اجرا شود؛ اپراتور اجازهٔ ورود مبلغ دستی نداشته باشد.
- [ ] endpoint بازپرداخت/تسویه/اصلاح مالی دستی فقط برای مالک سامانه، با reason و audit مقدار قبلی/جدید باشد.

### Task 7.4 — پایان مهلت و تسویه

- [ ] پایان ۷۲ ساعت بدون پرونده، Order را complete و settlement شبیه‌سازی‌شده ایجاد کند.
- [ ] task تکراری یا retry هیچ settlement دوگانه‌ای نسازد.
- [ ] تسویهٔ عادی خودکار باشد و برای هر سفارش تأیید دستی مالک نخواهد.

**Verification فاز:** no-dispute، partial dispute، operator decision و full refund invariant مالی پاس کنند.

### Checkpoint 7

- [ ] یک سفارش از checkout تا settlement یا refund بدون اصلاح مستقیم DB طی می‌شود.

## فاز ۸ — امتیاز، تعلیق و عملیات مدیریت

**وابستگی:** فاز ۷

### Task 8.1 — review entitlement و انتشار

- [ ] entitlement فقط پس از تکمیل و بسته‌شدن مغایرت ایجاد شود.
- [ ] امتیاز محصول و همکاری جدا و انتشار دوطرفه/۱۴روزه پیاده شود.
- [ ] دادهٔ MVP از aggregate عمومی آینده جدا بماند.

### Task 8.2 — moderation نظر

- [ ] report، hide/unhide، دلیل، actor و پاسخ عمومی ساخته شوند.

### Task 8.3 — تعلیق شخص/کسب‌وکار

- [ ] دو نوع تعلیق مستقل و دسترسی محدود پس از تعلیق اعمال شوند.
- [ ] برای هر سفارش فعال disposition جدا ثبت شود؛ هیچ رکوردی حذف نشود.

### Task 8.4 — پنل عملیات و audit

- [ ] صف‌های ضروری اپراتور در پنل سفارشی و مرز مجوز مالک سامانه طبق ADR-0010 ساخته شوند.
- [ ] اپراتور به Django Admin دسترسی نداشته باشد و admin مالک/کاربر فنی با allowlist مدل و فیلد محدود شود.
- [ ] مدل‌های حساس در Django Admin ثبت نشوند یا read-only باشند؛ اصلاح دستی فقط از commandهای audit‌شده با reason و before/after انجام شود.

**Verification فاز:** permission regression suite و سناریوهای تعلیق در سه مرحلهٔ سفارش پاس شوند.

### Checkpoint 8

- [ ] عملیات روزانه بدون دسترسی مستقیم اپراتور به DB قابل‌انجام است.

## فاز ۹ — داشبورد و آمادگی MVP

**وابستگی:** فاز ۸

### Task 9.1 — تعریف و پیاده‌سازی metricها

- [ ] هر metric فرمول، timezone، فیلتر و drill-down مشخص داشته باشد.
- [ ] queryهای تولیدکننده، خرده‌فروش و مدیر tenant-safe و paginationدار باشند.

### Task 9.2 — performance و resilience

- [ ] query plan/index برای مسیرهای اصلی بازبینی شود.
- [ ] load test ظرفیت هدف ۲۰۰ کاربر هم‌زمان و ۱۰۰۰ سفارش روزانه را پوشش دهد و رشد پنج‌برابری داده در query planهای کلیدی بررسی شود.
- [ ] retry/failure test برای worker اجرا شود.
- [ ] backup/restore و object lifecycle در staging تمرین شوند.

### Task 9.3 — امنیت و release

- [ ] access-control audit، upload security، rate limits و secret handling بازبینی شوند.
- [ ] provider با ماتریس هزینه، دسترسی از ایران، پایداری، PostgreSQL/S3، backup و observability انتخاب شود.
- [ ] deployment کانتینری، شبکهٔ خصوصی، migration، rollback، monitoring و runbook طبق ADR-0007 آماده شوند.

### Task 9.4 — seed و سناریوهای شش‌هفته‌ای

- [ ] دادهٔ کنترل‌شده برای ۱۰ تولیدکننده، ۳۰ خرده‌فروش و ۵۰ محصول قابل‌ساخت باشد.
- [ ] شش گردش اصلی و معیار ۸۰٪ بدون اصلاح دستی پیش‌بینی‌نشده قابل‌اندازه‌گیری باشند.

**Verification فاز:** rehearsal کامل در staging و امضای checklist آمادگی MVP.

### Checkpoint 9

- [ ] backend برای اتصال کامل Next.js و اجرای دورهٔ سنجش کنترل‌شده آماده است.

## Definition of Done مشترک هر تسک

- [ ] نیازمندی و acceptance criteria لینک شده‌اند.
- [ ] migration و rollback/forward strategy بازبینی شده‌اند.
- [ ] unit/integration/API test مرتبط پاس است.
- [ ] permission و tenant isolation بررسی شده‌اند.
- [ ] OpenAPI، ERD/state machine یا ADR مرتبط به‌روز است.
- [ ] log/metric لازم وجود دارد و دادهٔ حساس log نمی‌شود.
- [ ] lint، type check، test و migration check در CI سبز هستند.
- [ ] task از نظر scope مستقل است و سیستم را در حالت قابل‌اجرا باقی می‌گذارد.

## فرصت‌های کار موازی پس از تثبیت قراردادها

- بعد از فاز ۲: زیرساخت CI/observability و طراحی API هویت می‌توانند موازی پیش بروند.
- بعد از تأیید ERD کاتالوگ: API خواندن کاتالوگ و admin ورود داده مستقل‌اند.
- بعد از تثبیت Order contract: frontend سفارش و backend workflow می‌توانند روی OpenAPI مشترک موازی شوند.
- تست‌های contract/E2E و مستندات هر برش می‌توانند هم‌زمان با پیاده‌سازی همان برش نوشته شوند.
- migrationهای مشترک، تغییر state machine و تغییر قرارداد عمومی باید ترتیبی و با مالک مشخص انجام شوند.
