وضعیت کلی: از ۸ PRD، بک‌اند PRDهای ۲ تا ۶ عمدتاً پیاده شده‌اند؛ PRD-01 ناقص است، PRD-07 شروع نشده و PRD-08 فقط زیرساخت‌های پراکنده‌ای دارد. فرانت‌اند تقریباً شروع نشده و بیشتر checkpointهای runtime/CI/deployment بازند.

| PRD | وضعیت | انجام‌شده | باقی‌مانده |
|---|---|---|---|
| 01 حساب، کسب‌وکار، اعتماد | ناقص | ثبت‌نام، ورود، refresh، بازیابی دسترسی، User، Business، مالکیت، آدرس، تعلیق پایه | تکمیل JWT/NextAuth BFF، CSRF و rotation/replay، تأیید کامل کسب‌وکار، صف/تصمیم اپراتور، ماتریس مجوز data-driven |
| 02 کاتالوگ، قیمت، عرضه | بک‌اند تکمیل | taxonomy، محصول/تنوع، تصاویر، قیمت عمده، عرضه، انتشار، بازنگری، جست‌وجو/فیلتر، محرمانگی قیمت، پیشنهاد taxonomy | دادهٔ واقعی امتیاز تا PRD-07، اتصال فرانت‌اند و سناریوی runtime |
| 03 لجستیک، ارسال، تحویل | بک‌اند تکمیل | تعرفه/پوشش، آماده‌سازی، حمل‌کننده، مرسوله و اقلام، tracking، OTP تحویل، تحویل تأییدنشده، لغو و ارسال مجدد | اتصال واقعی به شرکت حمل، providerهای واقعی فایل/اسکن، UI و گردش runtime |
| 04 سبد و سفارش | بک‌اند تکمیل | سبد، آدرس، quote، گروه‌بندی، checkout، snapshot، رزرو، پاسخ/رد، deadline و لغو | UI هشدار تغییر قیمت، گردش کامل در مرورگر |
| 05 مالی شبیه‌سازی‌شده | بک‌اند تکمیل | پرداخت، invoice، ledger، کارمزد snapshot، refund، settlement، hold و completion | پرداخت/بازپرداخت واقعی خارج از محدودهٔ MVP؛ UI و dashboard |
| 06 مغایرت و پشتیبانی | بک‌اند تکمیل | پرونده، deadline، پاسخ جزئی، referral، تیکت، داوری، refund/replacement/return، فایل خصوصی و hold تسویه | UI، گردش مرورگر و اتصال واقعی حمل/پرداخت خارج از MVP |
| 07 امتیاز و نظر | شروع نشده | فقط نقاط اتصال در مدل/برنامه دیده می‌شود | entitlement پس از تکمیل سفارش، امتیاز محصول/همکاری، انتشار دوطرفه، moderation، reply |
| 08 عملیات و داشبورد | بسیار ناقص | audit پایه، برخی claim/reassignهای عملیاتی و InternalInbox | پنل اپراتور، صف‌های کامل، تعلیق، dashboard/metrics، گزارش‌گیری، observability و عملیات روزانه |

مهم‌ترین کارهای باقی‌مانده، به ترتیب پیشنهادی:

1. PRD-07: چون بعد از تکمیل سفارش و بسته‌شدن مغایرت فعال می‌شود و به PRDهای ۴ تا ۶ وابسته است.
2. PRD-08: پنل عملیات، صف‌ها، تعلیق و داشبوردها.
3. Frontend Next.js: اتصال قراردادهای فعلی API به تجربهٔ واقعی کاربر.
4. CI و استقرار: اجرای PostgreSQL/migration/OpenAPI/security scan در CI، backup/restore، monitoring، انتخاب provider و staging.
5. تست runtime: یک سناریوی کامل از ثبت‌نام تا سفارش، تحویل، مغایرت/تسویه بدون دخالت مستقیم DB.

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

1. **PRD-04**: سبد، checkout، reservation و lifecycle سفارش  
2. **PRD-05**: پرداخت، صورتحساب و عملیات مالی شبیه‌سازی‌شده  
3. اتصال کامل PRD-03 به سفارش و اجرای سناریوی checkout تا تحویل  
4. **PRD-06**: مغایرت، جبران و پشتیبانی  
5. **PRD-07**: امتیاز و نظر  
6. تکمیل **PRD-01 و PRD-08** و آماده‌سازی عملیاتی/پایلوت

وضعیت فعلی کیفیت: **۱۵۲ تست PostgreSQL پاس با پوشش ۹۲٫۰۹٪**. تغییرات PRD-03 در working tree موجودند ولی هنوز commit نشده‌اند. جزئیات دقیق در [فایل تحویل](/private/tmp/directsourcing-marketplace-handoff-2026-09-10.md)، [برنامه اجرا](/Users/amir/Desktop/DirectSourcing-Marketplace/docs/technical/backend/implementation-plan.md) و [قرارداد fulfillment](/Users/amir/Desktop/DirectSourcing-Marketplace/docs/technical/api/fulfillment.md) ثبت شده است.