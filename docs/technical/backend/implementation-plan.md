# برنامهٔ مرحله‌ای توسعهٔ بک‌اند

## بازبینی checkboxهای قدیمی — 2026-09-13

این بازبینی هر مورد را با فایل اجرایی یا تست مرتبط تطبیق می‌دهد. `[x]` برای CI به معنی وجود job و تأیید پیکربندی است؛ مشاهدهٔ اجرای سبز GitHub نیاز به شاهد remote جدا دارد. تست‌های API از PostgreSQL واقعی و در مسیر فایل/ایمیل از adapter کنترل‌شده استفاده می‌کنند؛ جای تمرین provider واقعی در staging نیستند. checkboxهای Definition of Done در انتهای سند قالب تکرارشونده‌اند، نه backlog مستقل.

| محدوده | شاهد |
| --- | --- |
| CI، schema و migration | `.github/workflows/backend.yml`، `tests/test_contract.py` |
| Celery/Redis/beat، storage و اعلان | `config/settings/base.py`، `compose.yaml`، `common/storage.py`، `operations/tasks.py` |
| هویت و تأیید دو نوع Business | `tests/test_auth.py`، `tests/test_onboarding_api.py`، `tests/test_business.py` |
| ماتریس محورهای دسترسی | `tests/test_backend_completion.py::test_independent_access_axes` و تست‌های مجوز هر دامنه |
| شکست اعلان و retry محدود | `test_outbox_failure_rolls_back_and_retry_delivers_once`، `test_outbox_cannot_escape_rolled_back_domain_command`، `test_email_retry_is_bounded_and_excludes_future_leases` |
| کمبود تکمیل‌شدهٔ نگهداری فایل | `operations/retention.py`، API hold/delete، migration `0010`، تست حذف نسخه‌ها/hold/پروندهٔ باز/retry و `file-retention-runbook.md` |

NextAuth/CSRF مرورگر، تأیید remote CI، سناریوی runtime با providerهای واقعی، دادهٔ نماینده، load test، انتخاب provider و تمرین staging همچنان در checkpointهای مربوط باز هستند. نیازمندی جدیدی برای frontend در این بازبینی پیاده نشده است.

راستی‌آزمایی این بازبینی: **۲۸۱ تست PostgreSQL موفق، پوشش ۹۱٫۹۸٪**؛ شامل ۱۲ حالت تازه در test_backend_completion.py. Ruff، format، mypy (۱۱۸ فایل)، Django check، migration drift و OpenAPI validate/fail-on-warn موفق بودند. migration `operations/0010` روی دیتابیس محلی اعمال شد. هیچ فایل واقعی مخزن حذف نشد؛ رفتار حذف و نسخه‌های S3 با adapter شبیه‌سازی‌شده آزموده شد.

وضعیت: در حال اجرا — backend PRD-05 به checkout و لجستیک متصل است؛ پرداخت، بازپرداخت، تسویه و تکمیل سفارش پیاده شده‌اند. backend PRD-06 شامل پرونده، داوری، تیکت و جبران داخلی متصل شده است؛ backend PRD-07 شامل entitlement، نظر محصول، همکاری کور، پاسخ و moderation متصل شده است. APIهای عملیات، تعلیق و داشبورد PRD-08 اضافه شده‌اند. طبق تعیین محدودهٔ 2026-09-13، رابط عملیات و تمام frontend بعداً با Next.js پیاده می‌شوند.

## برش بک‌اند PRD-08 — 2026-09-13

صف جاری و claim/reassign اتمیک، آزادسازی مسئولیت اپراتور، فرمان‌های محدود دامنه و idempotency، تنظیمات نسخه‌دار، audit با correlation و redaction، تعلیق مستقل User/Business و تصمیم هر Order، داشبورد محدود به نقش/Business و drill-down اضافه شدند. جزئیات مالی اپراتور به پروندهٔ مرتبط واگذارشده محدود است. قرارداد در [operations-analytics.md](../api/operations-analytics.md) و آزمون‌ها در `tests/test_operations_analytics.py` قرار دارند. قالب‌ها و مسیرهای HTML جزو این تحویل نیستند؛ ساخت UI عملیات و داشبوردها در Next.js باز می‌ماند.

## تحویل اجرایی 2026-09-07
اسکیل‌های architecture، domain-modeling، database-architect، backend-architect، architecture-decision-records، django-pro و postgres-best-practices در این برش استفاده شدند. طرح دامنه و ERD کلان ایجاد و دیتابیس اولین برش به migration تبدیل شد؛ طراحی فیزیکی همهٔ ماژول‌های تجاری هنوز تکمیل نیست.

| task کوچک | اندازه | خروجی و فایل‌های اصلی | معیار و verification | وضعیت |
| --- | --- | --- | --- | --- |
| 1.1.a مرز دامنه | S | database/domain-model.md | ownership، invariant و وابستگی هر context | done |
| 1.2.a مدل وضعیت | M | database/state-machines.md | چرخهٔ دقیق اعتماد و خلاصهٔ چرخه‌های تجاری؛ تفصیل هر ماژول پیش از ساخت آن | done برای برش جاری |
| 1.3.a schema اعتماد | M | database/erd.md، data-dictionary.md، accounts/models.py | قیود PostgreSQL، رابطه و snapshot؛ migration از صفر | done |
| 2.1.a پیکربندی | M | pyproject/lock، settings، Dockerfile، compose | Python 3.13.14 / Django 5.2.17؛ DB واقعی؛ build container جدا در انتظار اجرا | done برای runtime محلی |
| 2.2.a قرارداد مشترک | S | common، config/urls.py، OpenAPI | schema drift، خطا، pagination، health و deny-by-default | done |
| 2.3.a کیفیت | S | pyproject، workflow، tests/test_contract.py | Ruff، mypy، pytest، coverage؛ CI تعریف‌شده ولی اجرای remote هنوز مشاهده نشده | done برای بررسی محلی |
| 2.4.a audit و outbox | M | operations/models.py، services.py، tasks.py، migrations | trigger الحاقی، commit مشترک و inbox idempotent | done |
| 2.4.b مدارک خصوصی | M | operations/files.py، retention.py، common/storage.py، API و تست‌ها | signature/size/consent/scan gate، دسترسی، legal hold، tombstone و حذف کنترل‌شده؛ provider واقعی در staging باز | done برای بک‌اند با mock provider |
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
- [x] bounded contextها، aggregate rootها، value objectها و ownership داده در domain-model.md مشخص شده‌اند.

- [x] commandها، eventهای داخلی و invariantهای aggregateها در domain-model.md و قراردادهای API فهرست شده‌اند.

- [x] dependencyها و مرز نوشتن داده در domain-model.md و capability-dependencies.md مشخص شده‌اند.

**خروجی:** `docs/technical/database/domain-model.md`

### Task 1.2 — state machineها
- [x] چرخه‌های دامنه در جدول‌های گذار و نمودارهای state-machines.md ثبت‌اند؛ نمودار اجرایی تعلیق/تصمیم سفارش و نگهداری فایل نیز اضافه شد.

- [x] actor، guard، اثر، deadline و حالت نهایی در state-machines.md و قرارداد API هر دامنه تعریف شده‌اند؛ تفاوت نام‌های مفهومی/اجرایی مشخص است.

- [x] transitionهای مسئول پرونده و مالک سامانه و reason اجباری در جدول وضعیت و allowlist فرمان عملیات مشخص‌اند.

**خروجی:** `docs/technical/database/state-machines.md`

### Task 1.3 — ERD و فرهنگ داده
- [x] entityها، رابطه‌ها، cardinality و ownership در ERD و فرهنگ داده ثبت شده‌اند.

- [x] unique/check constraint، indexهای اولیه، snapshot و audit fields در مدل، migration و فرهنگ داده ثبت شده‌اند.

- [x] فیلدهای حساس و دسترسی در فرهنگ داده و ADR-0006 ثبت‌اند؛ classification و گردش نگهداری/حذف فایل در file-retention-runbook.md مستند و آزموده شدند.

**خروجی:** `docs/technical/database/erd.md` و `data-dictionary.md`

### Task 1.4 — سناریو و invariant قابل‌آزمون
- [x] معیارهای Given/When/Then در بخش پذیرش هشت PRD و سناریوهای مرزی domain-model.md نوشته شده‌اند.

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

- [x] workflow موجود backend.yml، اعتبارسنجی OpenAPI و test_schema_matches_committed_contract را در CI اجرا می‌کند؛ پیکربندی و اجرای محلی بررسی شدند، سبز بودن اجرای remote جدا تأیید می‌شود.

- [x] request ID، health endpoint و logging ساخت‌یافته اضافه شوند.

- [x] policy پیش‌فرض API برابر authenticated/deny-by-default باشد و استثناهای عمومی صریح شوند.

### Task 2.3 — کیفیت و CI
- [x] formatter/linter/type check/test runner و coverage threshold تنظیم شوند.

- [x] PostgreSQL 16 در CI و migration از صفر، makemigrations --check و pytest در backend.yml تنظیم شده‌اند.

- [x] Gitleaks با خروجی redacted و pip-audit در workflow CI از قبل پایه شده‌اند.

### Task 2.4 — worker و فایل
- [x] Celery/beat و Redis در Compose و settings تعریف شده‌اند؛ timeout عمومی و retry محدود برقرار است و idempotency/failure با تست backend_completion بررسی می‌شود. آزمون قطع broker واقعی جزو تمرین staging است.

- [x] PrivateS3Storage و MinIO خصوصی محلی با init_local_storage تعریف شده‌اند.

- [x] metadata، classification مشتق از purpose، legal hold، tombstone و audit دسترسی/حذف پیاده و آزموده شدند؛ حذف نسخه‌های دقیق object و retry در retention.py است.

- [x] URL امضاشدهٔ ۶۰ثانیه‌ای، allowlist، محدودیت حجم/تعداد، signature و ClamAV پیاده‌اند؛ تست فایل/دامنه تأیید می‌کند و provider در تست‌ها mock است.

- [x] intent اعلان در تراکنش دامنه ثبت می‌شود؛ rollback دامنه و rollback تحویل ناموفق، پیام ناقص باقی نمی‌گذارند؛ retry دقیقاً یک inbox می‌سازد.

- [x] InternalInbox با event یکتا ساخته شده است؛ email در inbox وارد نمی‌شود و کد تحویل فقط در projection گیرنده محاسبه می‌شود.

**Verification فاز:** build پاک، migration از صفر، test/quality checks، health web/worker و تولید OpenAPI.

### Checkpoint 2
- [x] scaffold، نسخه‌های Python/dependency قفل‌شده، PostgreSQL و تنظیمات مشترک local/CI آماده‌اند و برش عمودی onboarding تست دارد.
- [ ] اجرای سبز remote CI و health واقعی web/worker در محیط مقصد ثبت شود.

## فاز ۳ — هویت، کسب‌وکار و تأیید
**وابستگی:** فاز ۲

### Task 3.1 — ثبت‌نام و احراز هویت JWT/NextAuth
- [x] ثبت‌نام، ورود، خروج، refresh، بازیابی دسترسی و rate limit پیاده شود.

- [x] Django مرجع هویت و صادرکنندهٔ access/refresh JWT است؛ نشست‌ها در دیتابیس قابل ابطال‌اند.
- [ ] NextAuth/BFF و نگهداری JWT خارج از JavaScript مرورگر در Next.js پیاده شوند.

- [x] rotation، refresh reuse/replay، رقابت refresh و تعلیق فوری در test_auth.py آزموده شده‌اند.
- [ ] CSRF/cookie و نشست BFF پس از پیاده‌سازی Next.js آزموده شوند.

- [x] custom User و وضعیت تعلیق شخص تست شود.

### Task 3.2 — کسب‌وکار و مالکیت
- [x] Business، نوع کسب‌وکار، Membership مالک و آدرس‌ها پیاده شوند.

- [x] قید «یک مالک در MVP» و tenant isolation در DB/API آزموده شود.

### Task 3.3 — احراز و تأیید دستی
- [x] مدارک هویت/فعالیت، submission، review و reason در verification_services و آزمون onboarding هر دو نوع کسب‌وکار پوشش دارند.

- [x] صف، claim و transitionهای تأیید/رد با audit در API و تست‌های business/operations موجودند.

### Task 3.4 — ماتریس دسترسی
- [x] نقش پلتفرمی، نوع کسب‌وکار، مالکیت و وضعیت مستقل در permissions.py اعمال می‌شوند.

- [x] ترکیب نقش/نوع/وضعیت/controlled_access/تعلیق به تست جدول‌محور test_independent_access_axes تبدیل شد؛ tenant isolation و endpointها در تست‌های دامنه پوشش دارند.

**Verification فاز:** کاربر عمومی ثبت‌نام می‌کند؛ کسب‌وکار تا تأیید فعالیت تجاری ندارد؛ دادهٔ کسب‌وکار دیگر قابل‌مشاهده نیست.

### Checkpoint 3
- [x] test_register_to_verified_business_api برای manufacturer و retailer، مسیر API از ثبت‌نام تا تأیید و controlled access را طی می‌کند؛ storage/scan در تست mock هستند.

## فاز ۴ — کاتالوگ، قیمت و عرضه
### تحویل پیش‌نویس — 2026-09-08
ماژول catalog شامل دسته، ویژگی، مقدار استاندارد، محصول خصوصی و تنوع است. SKU در Business و ترکیب canonical در Product قید یکتا دارند. تصاویر از storage/ClamAV موجود استفاده می‌کنند؛ محدودیت ۵MB و ۸۰۰×۸۰۰، گالری مرتب و fallback تصویر اصلی اعمال می‌شوند. migration، seed اختیاری کیف/کفش و [قرارداد API](../api/catalog-drafts.md) اضافه شدند. اسکیل ponytail برای استفادهٔ مجدد از زیرساخت و پرهیز از dependency جدید اعمال شد.

راستی‌آزمایی: ۵۴ تست روی PostgreSQL پاس؛ پوشش ۹۰٫۸۲٪. Ruff، formatter، mypy (۵۵ فایل)، Django check و قرارداد OpenAPI پاس؛ migrationهای catalog و purpose تصویر روی دیتابیس توسعه اعمال و drift بررسی شد.

پیشنهاد taxonomy و حذف کامل محصول هنوز بازند؛ CAP-CAT-01..03 کامل اعلام نمی‌شوند. قیمت، عرضه، بررسی/انتشار و مرور عمومی مراحل بعدی‌اند.

**وابستگی:** فاز ۳

### Task 4.1 — taxonomy و محصول
- [x] دسته، تعریف ویژگی، محصول پایه، تنوع، SKU و تصاویر پیاده شوند.

- [x] fallback تصویر تنوع به تصویر اصلی محصول آزموده شود.

### تحویل حمل و انتشار اولیه — 2026-09-09
خدمات، تعرفهٔ دستی نسخه‌دار، فعال‌سازی فقط owner، منع هم‌پوشانی PostgreSQL، trigger تغییرناپذیری، مشخصات بسته و quote حمل پیاده شدند. صف بررسی محصول، claim، اصلاح/رد/بازگشایی، انتشار اولیه، توقف/بازگشت و فهرست عمومی بدون قیمت اضافه شدند. تغییرات عملیاتی قیمت/عرضه/حمل محصول منتشرشده مجاز و از دست‌رفتن پوشش/عرضه باعث inactive می‌شود. [قرارداد و محدودیت‌ها](../api/logistics-publication.md).

راستی‌آزمایی: ۹۱ تست روی PostgreSQL پاس؛ پوشش ۹۱٫۱۵٪. رقابت فعال‌سازی تعرفه، constraint هم‌پوشانی، trigger تغییرناپذیری، قفل pending و عدم افشای قیمت در نمای عمومی آزموده شدند. Ruff، formatter، mypy روی ۶۴ فایل، Django check و قرارداد OpenAPI پاس شدند. migrationهای catalog/logistics در کانتینر روشن اعمال‌شده و بررسی drift بدون تغییر بود.

بازنگری محتوایی، وضعیت مستقل تنوع، بازتخصیص صف محصول، نمایش قیمت خرده‌فروش و جستجو هنوز بازند؛ CAP-CAT-09..13 کامل اعلام نمی‌شوند. رکورد حمل‌کننده، گروه چندمحصولی، سفارش و مرسوله نیز در این برش ساخته نشده‌اند.

### تحویل بازنگری محتوا و قیمت خرده‌فروش — 2026-09-09
ProductRevision با draft/submit/claim/review/cancel، یک نسخهٔ باز و trigger نهایی immutable اضافه شد. پذیرش محتوا، تغییر عملیاتی جدیدتر را حفظ می‌کند؛ تنوع تازه تا پذیرش خصوصی و تنوع حذف‌شده بایگانی می‌شود. فیلد wholesale و جدول تنوع فعال در API عمومی اضافه شد؛ قیمت فقط برای خرده‌فروش verified، مستقل از controlled_access است. [قرارداد و نمونه‌ها](../api/catalog-revisions.md).

راستی‌آزمایی: ۱۰۲ تست PostgreSQL پاس، پوشش ۹۱٫۴۰٪؛ حفظ قیمت جدیدتر، rollback محتوا پس از افت عرضه، تنوع تازه/بایگانی، تصاویر قبل/بعد و عدم افشای قیمت آزموده شدند. mypy روی ۶۶ فایل، Ruff، formatter، Django check، OpenAPI و migration drift پاس شدند. migrationهای 0004/0005 روی دیتابیس تست از صفر اعمال شدند؛ برای حفظ سازگاری image روشن، migration توسعه به اجرای مجدد launcher سپرده شد.

وضعیت مستقل تنوع، جستجو/فیلتر، بازتخصیص صف و سبد/سفارش همچنان بازند. برای اجرای runtime باید image و migration با launcher با هم به‌روز شوند؛ سرویس روشن در این تحویل متوقف نمی‌شود.

### تکمیل PRD-02 — 2026-09-10
پنج بخش پایانی کاتالوگ پیاده شدند: مرور و جست‌وجوی نرمال‌شدهٔ فارسی، فیلتر و مرتب‌سازی قابل‌اشتراک، قیمت/زمان نماینده، پاسخ کامل محصول و نمای عمومی تولیدکننده؛ وضعیت مستقل تنوع با منشأ تصمیم؛ پیشنهاد دسته/ویژگی/مقدار و تصمیم اپراتور؛ حذف امن پیش‌نویس هرگز ارسال‌نشده؛ و بازتخصیص اتمیک صف محصول/بازنگری توسط مالک سامانه. غیرفعال‌شدن نقش اپراتور claimهای کاتالوگ pending را آزاد می‌کند. [قرارداد API و مرزها](../api/catalog-browsing-lifecycle.md).

محرمانگی قیمت علاوه بر حذف فیلد، فیلتر و مرتب‌سازی مبلغ را برای بازیگر غیرمجاز 403 می‌کند. پیشنهاد تکراری با نرمال‌سازی و unique شرطی PostgreSQL کنترل می‌شود. پذیرش پیشنهاد، تعریف کامل اپراتور و فعال‌سازی taxonomy را در یک تراکنش انجام می‌دهد. جست‌وجوی MVP projection ساده و بدون dependency تازه است؛ مهاجرت آن به read model/index فقط پس از سنجش latency انجام می‌شود.

راستی‌آزمایی: ۱۲۲ تست PostgreSQL پاس و پوشش ۹۱٫۸۹٪ شد. ۲۰ تست تازه رقابت پیشنهاد تکراری، مجوزها، CHECKهای وضعیت، عدم افشای قیمت، قیمت نماینده، نمای تولیدکننده، حذف امن، تنوع، دلیل taxonomy و بازتخصیص را پوشش می‌دهند. Ruff، formatter، mypy روی ۷۰ فایل، Django check، migration drift، OpenAPI بدون هشدار و snapshot قرارداد پاس شدند.

با این تحویل CAP-CAT-01..13 در بک‌اند PRD-02 پوشش داده شده‌اند. داده و مرتب‌سازی واقعی امتیاز تا PRD-07، سبد و رزرو تا PRD-04 و تجربهٔ مرورگر تا اتصال frontend وابستگی بیرونی این PRD هستند. Checkpoint 4 تا ساخت دادهٔ نمایندهٔ یک کیف و یک کفش و اجرای سناریوی runtime باز می‌ماند.

### Task 4.2 — انتشار و خدمات حمل مجاز
- [x] draft/review/published/rejected و دلیل اپراتور ساخته شوند.

- [x] امکان ارسال محصول به تمام استان‌ها با یک یا چند خدمت فعال، دارای تعرفه و قابل‌اجرا شرط انتشار باشد.

- [x] اتصال محصول به خدمات مجاز پلتفرم و داده‌های لازم بسته برای محاسبه و اعتبارسنجی پوشش ساخته شوند.

- [x] تطبیق تعرفهٔ مسیر به‌ترتیب شهر‌به‌شهر، استان‌به‌استان و پیش‌فرض سراسری انجام شود و نبود تطبیق، خدمت را ناموجود کند.

- [x] وزن بسته‌بندی‌شدهٔ تنوع‌ها جمع و با بازهٔ بدون هم‌پوشانی تعرفه تطبیق داده شود؛ ابعاد، حجم و تعداد بسته در MVP فقط ثبت شوند.

### تحویل فروش و عرضهٔ پیش‌نویس — 2026-09-08
روش ترکیب آزاد/بستهٔ ثابت، برنامهٔ قیمت مشترک، پله‌های با پایان مشتق‌شده، override و جدول نهایی، عرضهٔ ready/production/hybrid و quote خصوصی تولیدکننده پیاده شدند. همهٔ مبالغ ریال صحیح‌اند. قفل User→Business→Product، ثبت audit قبل/بعد و FK حفاظتی ارجاع تنوع اعمال شدند. [قرارداد API](../api/catalog-sales.md).

راستی‌آزمایی این تحویل: ۸۲ تست پاس، پوشش ۹۱٫۶۷٪؛ تست رقابت PostgreSQL برای جایگزینی برنامه، مثال سند قیمت‌گذاری و حفظ برنامهٔ قبلی پس از ورودی نامعتبر پوشش داده شدند. Ruff، formatter، mypy روی ۵۷ فایل، Django check و OpenAPI پاس شدند.

انتشار و لجستیک اولیه در تحویل بعد اضافه شده‌اند؛ این خروجی به معنی سفارش‌پذیری عمومی یا رزرو عرضه نیست.

### Task 4.3 — قیمت عمده
- [x] پله‌های بدون هم‌پوشانی/فاصله، قیمت پیش‌فرض و override تنوع ساخته شوند.

- [x] محاسبهٔ بستهٔ ثابت و ترکیب آزاد با تست جدول‌محور پوشش داده شود.

### Task 4.4 — موجودی و تولید سفارشی
- [x] ready stock، production cap، lead time و حالت ترکیبی مدل شوند.

- [x] availability breakdown و دیرترین lead time از API پیش‌نمایش تولیدکننده برگردد.

**Verification فاز:** کاتالوگ عمومی دیده می‌شود؛ قیمت فقط برای خرده‌فروش تأییدشده است؛ محصول ناقص منتشر نمی‌شود.

### Checkpoint 4
- [ ] حداقل یک محصول کیف و یک محصول کفش با تنوع، قیمت، عرضه و حمل کامل قابل سفارش‌اند.

## فاز ۵ — سبد، سفارش و پرداخت شبیه‌سازی‌شده
**وابستگی:** فاز ۴

### Task 5.1 — سبد و اعتبارسنجی قیمت/تعداد
اعتبارسنجی ادامهٔ PRD-04 در 2026-09-10: **۱۷۲ تست پاس با پوشش ۹۲٫۴۹٪** روی PostgreSQL؛ Ruff، format، mypy، Django check، migration drift و قرارداد OpenAPI پاس شدند. تست‌ها شامل رقابت checkout/آماده‌سازی، دو خریدار برای موجودی محدود، retry هم‌زمان، استقلال سفارش‌های تولیدکنندگان، تصمیم/ارجاع لغو و reverse→forward migration هستند.

- [x] cart پایدار کسب‌وکار با انتخاب fixed pack/free mix، ادغام و تأیید تغییر روش ساخته شد؛ API و تست رقابت PostgreSQL در `orders/cart.py` و `tests/test_cart.py`.

- [x] آدرس کامل گیرنده در سبد، انتخاب خدمت هر محصول و preview جاری قیمت، عرضه، فاصلهٔ پله، حمل گروهی و کارمزد خرده‌فروش پیاده شد؛ قرارداد: [cart.md](../api/cart.md).

- [x] اعمال گروهی خدمت حمل و دفترچهٔ آدرس مستقل با مالکیت خرده‌فروش و حفظ مقصد انتخاب‌شده تکمیل شدند.

- [x] قیمت و availability در preview و checkout با احتساب رزرو/تخصیص دوباره محاسبه می‌شوند.

- [x] قرارداد 409 همراه preview تازه و تطبیق fingerprint برای تأیید تغییر مبلغ پیاده شد؛ رابط نمایش هشدار در frontend باز است. قلم نامعتبر خودکار حذف یا تغییر نمی‌کند.

- [x] اقلام براساس تولیدکننده، مبدأ و خدمت گروه‌بندی، هزینه با وزن مجموع محاسبه و در checkout snapshot می‌شوند.

### Task 5.2 — checkout و snapshot
- [x] یک OrderGroup و Order مستقل برای هر تولیدکننده اتمیک ساخته می‌شود.

- [x] قیمت، آدرس، SKU، انتخاب روش و گروه حمل همراه خدمت، اقلام، وزن، تعرفه، مبلغ حمل و کارمزد دو طرف snapshot می‌شوند؛ DB از تغییر جلوگیری می‌کند.

- [x] موجودی/ظرفیت در ثبت رزرو، در رد/لغو/انقضا یک‌بار آزاد و در hook پرداخت به تخصیص تبدیل می‌شوند؛ ثبت FinancialEvent(kind=payment) در PRD-05 انجام می‌شود.

- [x] idempotency کسب‌وکار با hash فرمان و قید یکتا جلوی checkout تکراری را می‌گیرد.

### Task 5.3 — پذیرش، رد و deadline
- [x] پذیرش/رد بدون تغییر، دلیل رد و deadlineهای ۲۴ساعتهٔ پاسخ/پرداخت با task دوره‌ای پیاده شدند.

- [x] رقابت checkout چند خریدار و retry یک درخواست، و آزادسازی idempotent روی PostgreSQL آزموده شدند.

### Task 5.4 — پرداخت و صورتحساب
- [x] payment event با execution mode شبیه‌سازی‌شده و تفکیک مبلغ کالا، کارمزد و هزینهٔ حمل ثبت شود.

- [x] invoice یکتا و commission reserved جدا برای هر Order ساخته شود.

- [x] هیچ ادعای بانکی یا واژهٔ ممنوع در API presentation تولید نشود.

**Verification فاز:** سناریوی چندتولیدکننده، رد یکی، پرداخت دیگری و عدم اثر متقابل end-to-end پاس شود.

### Checkpoint 5
- [x] گردش بک‌اند ثبت سفارش تا پرداخت برای Business با controlled_access در test_payment_atomic_snapshot_invoice_ledger_and_retry پوشش داده شده است.
- [ ] همین گردش با حساب‌ها و providerهای محیط پایلوت اجرا و ثبت شود.

## فاز ۶ — آماده‌سازی، ارسال و تحویل
**وابستگی:** فاز ۵؛ به انتخاب کاربر بک‌اند این فاز با قرارداد داخلی سفارش/پرداخت زودتر تحویل شده است. [قرارداد اتصال و API](../api/fulfillment.md).

### Task 6.1 — آماده‌سازی/تولید
- [x] شروع، پیشرفت و آماده‌ارسال‌شدن با مجوز و transition معتبر ثبت شوند.

- [x] تصمیم لغو قبل/بعد از آماده‌سازی، مهلت ۲۴ساعته، ارجاع و صف اپراتور و منع لغو پس از ارسال پیاده شدند.

- [x] ثبت مالی بازپرداخت و حذف کارمزد در PRD-05 به `orders.cancellation.complete_refund` متصل شود؛ لغو نهایی تنها پس از callback مالی است.

### Task 6.2 — مرسوله و اقلام
- [x] پرداخت هر گروه حمل یک درخواست حمل idempotent بسازد و تا اعلام آمادگی کامل، تخصیص را مسدود کند.

- [x] صف آمادهٔ تخصیص، ثبت حمل‌کننده و بازهٔ جمع‌آوری همراه تاریخچهٔ عامل/زمان پیاده شود.

- [x] استثناهای تخصیص در MVP با اقدام دستی اپراتور و ثبت دلیل قابل‌مدیریت باشند؛ گردش خودکار پیشنهاد جایگزین خارج از MVP است.

- [x] چند مرسوله، ShipmentItem quantity، بارنامه و tracking history ساخته شوند.

- [x] مجموع مقدار ارسال‌شده از مقدار قلم سفارش بیشتر نشود.

### Task 6.3 — کد تحویل
- [x] token لینک امن، OTP کوتاه‌عمر، سقف تلاش، ابطال کد قبلی و مصرف یک‌باره پیاده شوند.

- [x] کد و token خام در log یا DB غیرایمن ذخیره نشوند.

- [x] اعلان کد از `InternalInbox` و interface مشترک عبور کند تا adapter واقعی آینده بدون تغییر دامنه اضافه شود.

### Task 6.4 — تحویل تأییدنشده
- [x] فقط اپراتور با دلیل و مدرک بتواند وضعیت را تعیین تکلیف کند.

- [x] تحویل آخرین مرسوله، deadline مغایرت را دقیقاً یک بار آغاز کند.

**Verification فاز:** ارسال جزئی/کامل، تحویل با کد، تلاش نامعتبر و مسیر اپراتوری تست end-to-end دارند.

### Checkpoint 6
- [ ] گردش runtime از checkout واقعی برنامه تا تحویل، پس از اتصال PRD-04/05 اجرا شود؛ سناریوی API از hook پرداخت تا تحویل در تست PostgreSQL پوشش دارد.

## فاز ۷ — مغایرت، پشتیبانی و تسویه
**وابستگی:** فاز ۶

### Task 7.1 — ثبت مغایرت
- [x] پرونده و ردیف در سطح قلم/تعداد/مرسوله با تصویر و deadline ساخته شوند.

- [x] پرونده فقط تسویهٔ همان Order را hold کند.

### Task 7.2 — پاسخ و داوری
- [x] پاسخ جزئی تولیدکننده و deadline ۴۸ساعته پیاده شود.

- [x] بخش رد/بی‌پاسخ تیکت مرتبط بسازد و تصمیم اپراتور reason/evidence داشته باشد.

### Task 7.3 — جبران و تعدیل مالی
- [x] partial refund، replacement و return workflow داخلی ساخته شوند.

- [x] کارمزد از snapshot اقلام نگه‌داشته‌شده دوباره محاسبه شود.

- [x] تعدیل ناشی از نتیجهٔ معتبر به‌صورت سیستمی اجرا شود؛ اپراتور اجازهٔ ورود مبلغ دستی نداشته باشد.

- [x] endpoint بازپرداخت/تسویه/اصلاح مالی دستی فقط برای مالک سامانه، با reason و audit مقدار قبلی/جدید باشد.

### Task 7.4 — پایان مهلت و تسویه
- [x] پایان ۷۲ ساعت بدون پرونده، Order را complete و settlement شبیه‌سازی‌شده ایجاد کند.

- [x] task تکراری یا retry هیچ settlement دوگانه‌ای نسازد.

- [x] تسویهٔ عادی خودکار باشد و برای هر سفارش تأیید دستی مالک نخواهد.

**Verification فاز:** no-dispute، partial dispute، operator decision و full refund invariant مالی پاس کنند.

### Checkpoint 7
- [x] گردش سرویس/API از checkout تا تحویل و settlement در test_checkout_to_delivery_and_concurrent_settlement و مسیر refund در تست لغو مالی پوشش دارند؛ عبور زمان در تست کنترل می‌شود.
- [ ] rehearsal همین گردش با دادهٔ پایلوت و provider واقعی بدون اصلاح دستی DB ثبت شود.

## فاز ۸ — امتیاز، تعلیق و عملیات مدیریت
**وابستگی:** فاز ۷

### Task 8.1 — review entitlement و انتشار
- [x] entitlement فقط پس از تکمیل مالی، تحویل کامل و بسته‌شدن مغایرت ایجاد می‌شود؛ hook اتمیک و worker بازیابی PRD-07.

- [x] امتیاز محصول و همکاری جدا، پیش‌نویس/ارسال immutable و انتشار دوطرفه/۱۴روزه در backend پیاده شد.

- [x] execution mode از settlement حفظ می‌شود؛ query و aggregate عمومی فقط live و نمای کنترل‌شده فقط simulated است.

### Task 8.2 — moderation نظر
- [x] report، hide/unhide، invalidate/revalidate، دلیل، actor، تاریخچه و پاسخ عمومی immutable در backend ساخته شدند؛ پنل مرورگر باز است.

### Task 8.3 — تعلیق شخص/کسب‌وکار
- [x] دو نوع تعلیق مستقل و دسترسی محدود پس از تعلیق در بک‌اند اعمال شدند.

- [x] برای هر سفارش فعال disposition جدا ثبت می‌شود؛ سفارش‌ها و تصمیم‌ها حذف نمی‌شوند.

### Task 8.4 — پنل عملیات و audit
- [x] API صف‌های ضروری، claim/reassign، فرمان دامنه و مرز مجوز مالک ساخته شدند.
- [ ] رابط پنل سفارشی در Next.js ساخته شود؛ طبق محدودهٔ فعلی، frontend به مرحلهٔ بعد موکول است.

- [x] اپراتور به Django Admin دسترسی ندارد و admin فنی محدود است.

- [x] مدل‌های حساس در Django Admin ثبت نشده‌اند یا read-only هستند؛ اصلاح دستی از commandهای audit‌شده با reason و before/after انجام می‌شود.

**Verification فاز:** permission regression suite و سناریوهای تعلیق در سه مرحلهٔ سفارش پاس شوند.

### Checkpoint 8
- [ ] عملیات روزانه بدون دسترسی مستقیم اپراتور به DB قابل‌انجام است.

## فاز ۹ — داشبورد و آمادگی MVP
**وابستگی:** فاز ۸

### Task 9.1 — تعریف و پیاده‌سازی metricها
- [x] فرمول، timezone، فیلتر و drill-down معیارهای بک‌اند در قرارداد operations-analytics مستند شدند.

- [x] queryهای تولیدکننده، خرده‌فروش و مدیر scope اجباری و drill-down صفحه‌بندی‌شده دارند؛ شاخص مالی کلان فقط برای مالک است.

### Task 9.2 — performance و resilience
- [ ] query plan/index برای مسیرهای اصلی بازبینی شود.

- [ ] load test ظرفیت هدف ۲۰۰ کاربر هم‌زمان و ۱۰۰۰ سفارش روزانه را پوشش دهد و رشد پنج‌برابری داده در query planهای کلیدی بررسی شود.

- [x] retry/failure اعلان و محدودیت تلاش ایمیل به تست‌ها اضافه شد؛ workerهای مالی/سفارش/مغایرت/نظر نیز تست دامنه دارند.
- [ ] قطع واقعی broker و بازیابی worker/beat در staging تمرین شود.

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

## تحویل بک‌اند PRD-03 — 2026-09-10
به انتخاب کاربر، ادامهٔ لجستیک پیش از سبد/checkout با هستهٔ لازم Order/OrderLine و قرارداد داخلی اتصال پرداخت انجام شد. Carrier و تخصیص نسخه‌دار، گروه حمل و snapshot، آمادگی/اختلاف وزن، استثنای دستی، چندمرسوله و اصلاح اتمیک manifest، رهگیری و مدرک خصوصی، لینک محدود مأمور و کد امن InternalInbox، تصمیم تحویل تأییدنشده، ارسال مجدد با تخصیص تازه و وضعیت مشتق‌شده/مهلت ۷۲ساعته پیاده شدند. [قرارداد و مرزها](../api/fulfillment.md).

راستی‌آزمایی: ۱۵۲ تست PostgreSQL پاس، شامل ۳۰ تست تازه و چهار سناریوی رقابت پرداخت/تخصیص/مصرف کد/تحویل نهایی؛ پوشش ۹۲٫۰۹٪. migration از صفر و reverse→forward با حفظ کاتالوگ قبلی پوشش دارد. OpenAPI بدون هشدار و snapshot قرارداد، Ruff، formatter، mypy روی ۷۷ فایل، Django check و migration drift پاس شدند؛ migrationهای جدید روی دیتابیس توسعه نیز اعمال شدند.

گزارش تاریخی پیش از PRD-05 — ادامهٔ PRD-04: Cart/OrderGroup/Reservation، اعتبارسنجی قیمت و تأیید fingerprint، پذیرش/رد/انقضا و تصمیم‌های لغو به hookهای لجستیک متصل شدند. فاز ۵ به‌خاطر PaymentEvent/Invoice/ledger و اجرای مالی بازپرداخت PRD-05 باز است؛ Checkpoint 6 تا اتصال مرورگر و سناریوی runtime ثبت تا تحویل باز می‌ماند. قرارداد: [orders.md](../api/orders.md).

### تحویل backend PRD-05 — 2026-09-11
CAP-FIN-01..05: FinancialEvent نوع‌دار، Invoice و تعدیل append-only، دفتر متوازن با سرفصل مستقل حمل، پرداخت اتمیک و idempotent، نرخ نسخه‌دار owner-only با snapshot، بازپرداخت کامل لغو و جزئیِ مبتنی بر تصمیم، اصلاح کاهشی دستی، hold علت‌دار و worker تسویه پیاده شدند. `orders/0006` تکمیل سفارش را همراه تسویه ثبت می‌کند. آزمون چندتولیدکننده (رد یکی، پرداخت دیگری) و مسیر checkout→تحویل OTP→تسویه از serviceهای واقعی استفاده می‌کنند.

Task 7.3 اکنون در backend شامل پرونده، داوری و گردش داخلی replacement/return است؛ قرارداد آن در [disputes-support.md](../api/disputes-support.md) ثبت شده است. Checkpointهای مرورگر و داشبورد با تست backend بسته نمی‌شوند. قرارداد و مرز تکمیل پرونده‌ها در [finance.md](../api/finance.md) و ردیابی معیارها در requirements-traceability ثبت شده‌اند.
اعتبارسنجی نهایی PRD-05: **203 passed، پوشش 92.80%** روی PostgreSQL؛ **31 آزمون اختصاصی مالی**. Ruff، format (۱۱۲ فایل)، mypy (۹۱ فایل)، Django check، نبود migration drift، OpenAPI با `--validate --fail-on-warn` و تست قرارداد committed همگی پاس شدند. فرمان بازاجرای مجموعه: `pytest -q --cov=marketplace` در apps/backend؛ آزمون‌های مالی: `pytest tests/test_finance.py -q`. migrationهای orders/0006 و finance/0001..0002 روی PostgreSQL توسعه اعمال شدند. imageهای Compose این نوبت rebuild نشدند؛ برای اجرای برنامهٔ تازه launcher را دوباره اجرا کنید. فایل handoff بنا به درخواست کاربر تغییر نکرد و وضعیت تازه در همین مستندات فنی ثبت شده است.

### تأیید برش backend PRD-06 — 2026-09-12

- مجموعهٔ کامل PostgreSQL: ۲۲۳ تست موفق، پوشش ۹۲٫۴۱٪؛ پس از اصلاح نهایی بارگذاری مدرک تولیدکننده در تیکت مشترک، هر ۲۲ تست اختصاصی PRD-06 دوباره پاس شد.
- Ruff، بررسی قالب، mypy (۱۰۳ فایل)، Django check، تطابق migrationها و اعتبارسنجی OpenAPI بدون خطا هستند. آزمون تطابق قرارداد ذخیره‌شده در مجموعهٔ کامل پاس شد.
- migrationهای operations/0005، disputes/0001..0002، support/0001 و logistics/0009..0010 روی پایگاه دادهٔ توسعه اعمال شدند.
- قرارداد API، ERD، فرهنگ داده و چرخهٔ وضعیت به‌روز شدند. فایل handoff و own.md تغییر نکردند. Checkpoint مرورگر همچنان باز است؛ این تحویل backend و اجرای داخلی جبران است.

### تحویل backend PRD-07 — 2026-09-12

CAP-REV-01..06 در `marketplace.reviews` پیاده شدند: entitlement یکتا از تکمیل مالی و تحویل کامل بدون مغایرت باز، snapshot موضوع/تنوع/deadline/mode، نظر محصول، همکاری کور دوطرفه، پیش‌نویس و ارسال تغییرناپذیر، تصاویر خصوصی اسکن‌شده، پاسخ یکتا، گزارش و moderation مستدل با بازگردانی. انتشار همکاری و انقضا task تکرارپذیر دارند؛ aggregate سادهٔ PostgreSQL براساس موضوع و execution mode جداست. پیوند تیکت PRD-06 به نظر/پاسخ اضافه شده و هیچ اثر مالی مستقیم ندارد. [قرارداد و محدودیت‌ها](../api/reviews.md).

اعتبارسنجی نهایی: **۲۵۶ تست PostgreSQL موفق، پوشش ۹۲٫۸۴٪**؛ **۳۱ تست اختصاصی PRD-07** شامل ارسال هم‌زمان، منع افشای کور، انقضا، moderation، فایل خصوصی، چرخهٔ واقعی بستن مغایرت→تسویه→حق و reverse→forward قیود با حفظ محتوای نهایی. Ruff، format (۱۳۲ فایل)، mypy (۱۰۹ فایل)، Django check، migration-drift و OpenAPI با validate/fail-on-warn پاس شدند؛ تست تطابق قرارداد ذخیره‌شده نیز در مجموعهٔ کامل موفق بود.

migrationهای `operations/0006`، `reviews/0001..0002` و `support/0002` روی PostgreSQL توسعه اعمال شدند. برای جلوگیری از بن‌بست worker بازیابی با retry تسویه، ایجاد حق از ترتیب قفل مشترک Finance استفاده می‌کند. کنترل زمانی trigger از timestamp ثبت رویداد استفاده می‌کند تا با ساعت workflow یکسان باشد. فایل‌های handoff و own.md تغییر نکردند. پنل مرورگر/داشبورد، PRD-08 و frontend بازند؛ provider فایل در تست‌ها mock است و imageهای Compose این نوبت rebuild نشده‌اند.
