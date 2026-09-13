وضعیت کلی: از ۸ PRD، بک‌اند PRDهای ۲ تا ۶ عمدتاً پیاده شده‌اند؛ PRD-01 ناقص است، PRD-07 شروع نشده و PRD-08 فقط زیرساخت‌های پراکنده‌ای دارد. فرانت‌اند تقریباً شروع نشده و بیشتر checkpointهای runtime/CI/deployment بازند.

| PRD | وضعیت | انجام‌شده | باقی‌مانده |
| --- | --- | --- | --- |
| 01 حساب، کسب‌وکار، اعتماد | ناقص | ثبت‌نام، ورود، refresh، بازیابی دسترسی، User، Business، مالکیت، آدرس، تعلیق پایه | تکمیل JWT/NextAuth BFF، CSRF و rotation/replay، تأیید کامل کسب‌وکار، صف/تصمیم اپراتور، ماتریس مجوز data-driven |
| 02 کاتالوگ، قیمت، عرضه | بک‌اند تکمیل | taxonomy، محصول/تنوع، تصاویر، قیمت عمده، عرضه، انتشار، بازنگری، جست‌وجو/فیلتر، محرمانگی قیمت، پیشنهاد taxonomy | دادهٔ واقعی امتیاز تا PRD-07، اتصال فرانت‌اند و سناریوی runtime |
| 03 لجستیک، ارسال، تحویل | بک‌اند تکمیل | تعرفه/پوشش، آماده‌سازی، حمل‌کننده، مرسوله و اقلام، tracking، OTP تحویل، تحویل تأییدنشده، لغو و ارسال مجدد | اتصال واقعی به شرکت حمل، providerهای واقعی فایل/اسکن، UI و گردش runtime |
| 04 سبد و سفارش | بک‌اند تکمیل | سبد، آدرس، quote، گروه‌بندی، checkout، snapshot، رزرو، پاسخ/رد، deadline و لغو | UI هشدار تغییر قیمت، گردش کامل در مرورگر |
| 05 مالی شبیه‌سازی‌شده | بک‌اند تکمیل | پرداخت، invoice، ledger، کارمزد snapshot، refund، settlement، hold و completion | پرداخت/بازپرداخت واقعی خارج از محدودهٔ MVP؛ UI و dashboard |
| 06 مغایرت و پشتیبانی | بک‌اند تکمیل | پرونده، deadline، پاسخ جزئی، referral، تیکت، داوری، refund/replacement/return، فایل خصوصی و hold تسویه | UI، گردش مرورگر و اتصال واقعی حمل/پرداخت خارج از MVP |
| 07 امتیاز و نظر | شروع نشده | فقط نقاط اتصال در مدل/برنامه دیده می‌شود | entitlement پس از تکمیل سفارش، امتیاز محصول/همکاری، انتشار دوطرفه، moderation، reply |
| 08 عملیات و داشبورد | بسیار ناقص | audit پایه، برخی claim/reassignهای عملیاتی و InternalInbox | پنل اپراتور، صف‌های کامل، تعلیق، dashboard/metrics، گزارش‌گیری، observability و عملیات روزانه |

مهم‌ترین کارهای باقی‌مانده، به ترتیب پیشنهادی:

- PRD-07: چون بعد از تکمیل سفارش و بسته‌شدن مغایرت فعال می‌شود و به PRDهای ۴ تا ۶ وابسته است.

- PRD-08: پنل عملیات، صف‌ها، تعلیق و داشبوردها.

- Frontend Next.js: اتصال قراردادهای فعلی API به تجربهٔ واقعی کاربر.

- CI و استقرار: اجرای PostgreSQL/migration/OpenAPI/security scan در CI، backup/restore، monitoring، انتخاب provider و staging.

- تست runtime: یک سناریوی کامل از ثبت‌نام تا سفارش، تحویل، مغایرت/تسویه بدون دخالت مستقیم DB.

آخرین وضعیت تأیید فنی بک‌اند: **۲۲۳ تست PostgreSQL موفق با پوشش ۹۲٫۴۱٪**. PRD-06 هم با ۲۲ تست اختصاصی پاس شده است.

مراجع اصلی وضعیت: [برنامهٔ اجرا](/Users/amir/Desktop/DirectSourcing-Marketplace/docs/technical/backend/implementation-plan.md)، [ردیابی نیازمندی‌ها](/Users/amir/Desktop/DirectSourcing-Marketplace/docs/technical/backend/requirements-traceability.md)، و [فهرست PRDها](/Users/amir/Desktop/DirectSourcing-Marketplace/docs/README.md).

موارد زیرساختی مشترک هم هنوز کاملاً بسته نشده‌اند:

- اتصال کامل frontend/Next.js و BFF

- CI عملیاتی شامل PostgreSQL، migration check، secret scan و dependency scan

- تست واقعی سرویس‌های SMTP، S3/MinIO و ClamAV

- load test برای ۲۰۰ کاربر هم‌زمان و ۱۰۰۰ سفارش روزانه

- backup/restore rehearsal، monitoring و runbook استقرار

- seed نهایی برای ۱۰ تولیدکننده، ۳۰ خرده‌فروش و ۵۰ محصول

ترتیب منطقی ادامه کار این است:

- **PRD-04**: سبد، checkout، reservation و lifecycle سفارش

- **PRD-05**: پرداخت، صورتحساب و عملیات مالی شبیه‌سازی‌شده

- اتصال کامل PRD-03 به سفارش و اجرای سناریوی checkout تا تحویل

- **PRD-06**: مغایرت، جبران و پشتیبانی

- **PRD-07**: امتیاز و نظر

- تکمیل **PRD-01 و PRD-08** و آماده‌سازی عملیاتی/پایلوت

وضعیت فعلی کیفیت: **۱۵۲ تست PostgreSQL پاس با پوشش ۹۲٫۰۹٪**. تغییرات PRD-03 در working tree موجودند ولی هنوز commit نشده‌اند. جزئیات دقیق در [فایل تحویل](/private/tmp/directsourcing-marketplace-handoff-2026-09-10.md)، [برنامه اجرا](/Users/amir/Desktop/DirectSourcing-Marketplace/docs/technical/backend/implementation-plan.md) و [قرارداد fulfillment](/Users/amir/Desktop/DirectSourcing-Marketplace/docs/technical/api/fulfillment.md) ثبت شده است.

از نظر قابلیت‌های بک‌اند، PRDهای ۱ تا ۸ عمدتاً پیاده شده‌اند. مورد بازِ محصولی یا تصمیمی که schema یا API را تغییر دهد پیدا نکردم. آنچه باقی مانده بیشتر اجرای محیط واقعی، کنترل کیفیت و فرانت‌اند است.

| PRD | وضعیت بک‌اند | موارد باقی‌مانده |
| --- | --- | --- |
| PRD-01 حساب و اعتماد | پیاده شده | اتصال NextAuth/BFF، آزمون کامل CSRF و refresh-token replay/reuse، تکمیل ماتریس permission به تست data-driven |
| PRD-02 کاتالوگ | پیاده شده | ساخت دادهٔ نمایندهٔ کیف و کفش و اجرای سناریوی واقعی سفارش‌پذیری |
| PRD-03 لجستیک | پیاده شده | تمرین runtime کامل checkout تا تحویل؛ اتصال واقعی به حمل‌کننده خارج از MVP است |
| PRD-04 سبد و سفارش | پیاده شده | UI تأیید تغییر قیمت و اجرای گردش کامل با حساب‌های کنترل‌شده |
| PRD-05 مالی شبیه‌سازی‌شده | پیاده شده | سناریوی end-to-end تا settlement/refund؛ پرداخت واقعی عمداً خارج از MVP است |
| PRD-06 مغایرت و پشتیبانی | پیاده شده | اجرای سناریوی کامل سفارش تا جبران یا تسویه بدون مداخلهٔ مستقیم DB |
| PRD-07 نظر و امتیاز | بک‌اند پیاده شده | رابط مرورگر برای ثبت، مشاهده و moderation |
| PRD-08 عملیات و داشبورد | API و منطق بک‌اند پیاده شده | پنل عملیات و داشبورد با Next.js |

موارد مشترک و مهم‌تر که هنوز باید انجام شوند:

- CI واقعی: اجرای PostgreSQL، migration check، contract/OpenAPI test، secret scan و dependency/security scan.

- زیرساخت production/staging: انتخاب provider، شبکهٔ خصوصی، backup/restore، rollback migration، monitoring و runbook.

- امنیت نهایی: access-control audit، upload security، rate-limit و مدیریت secretها.

- کارایی: بررسی query plan، indexهای لازم و load test برای ۲۰۰ کاربر هم‌زمان / ۱۰۰۰ سفارش روزانه.

- workerها: تست retry/failure و اطمینان از اجرای scheduler در محیط استیجینگ.

- seed دادهٔ کنترل‌شده: ۱۰ تولیدکننده، ۳۰ خرده‌فروش و ۵۰ محصول.

- rehearsal شش گردش اصلی و سنجش معیار «۸۰٪ بدون اصلاح دستی پیش‌بینی‌نشده».

- همهٔ رابط‌های کاربری Next.js: احراز هویت BFF، کاتالوگ، سفارش، لجستیک، پشتیبانی، reviews، پنل عملیات و داشبورد.

همچنین چند checkbox قدیمی در [implementation-plan.md](/Users/amir/Desktop/DirectSourcing-Marketplace/docs/technical/backend/implementation-plan.md) هنوز تیک نخورده‌اند، با اینکه بخشی از پیاده‌سازی‌شان در کد وجود دارد؛ این‌ها نیاز به یک بازبینی مستندات دارند تا وضعیت برنامه با واقعیت کد یکسان شود.