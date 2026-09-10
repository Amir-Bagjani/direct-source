در وضعیت فعلی، از نظر بک‌اند:

| PRD | وضعیت | انجام‌شده | باقی‌مانده |
|---|---|---|---|
| **PRD-01 حساب و اعتماد** | تا حد زیادی انجام‌شده | ثبت‌نام و ورود موبایلی، JWT و rotation/reuse/logout، تأیید ایمیل و بازیابی رمز، Business/Membership/Address، احراز و بررسی کسب‌وکار، نقش owner/operator، فایل خصوصی و scan gate، audit/outbox/inbox و BusinessRevision | BFF/NextAuth و CSRF مرورگر، تست واقعی SMTP/MinIO/ClamAV، حذف و tombstone و restore، لوگو و تکمیل پروفایل عمومی، تکمیل صف بازنگری و اثر تعلیق روی سفارش‌های فعال |
| **PRD-02 کاتالوگ و عرضه** | **بک‌اند کامل** | تمام `CAP-CAT-01..13`: taxonomy، محصول و تنوع، SKU و تصویر، قیمت پلکانی، fixed pack/free mix، موجودی و تولید سفارشی، انتشار و بازنگری، جستجو و فیلتر فارسی، نمایش امن قیمت، صفحه عمومی محصول/تولیدکننده، پیشنهاد taxonomy و lifecycle تنوع | UI مرورگر، اتصال سبد و رزرو PRD-04، امتیاز واقعی PRD-07 و دادهٔ seed/runtime برای Checkpoint |
| **PRD-03 لجستیک و تحویل** | **بک‌اند تقریباً کامل** | خدمت و تعرفه، پوشش و quote، Carrier، گروه حمل و snapshot، ShippingRequest، آمادگی و اختلاف وزن، تخصیص دستی، چندمرسوله، ShipmentItem، رهگیری، مدارک خصوصی، لینک امن مأمور، OTP تحویل، تحویل تأییدنشده، ارسال مجدد، ارجاع لغو/بازپرداخت و deadline مغایرت | اتصال واقعی به checkout، reservation و payment در PRD-04/05؛ تکمیل تصمیم‌های لغو قبل/بعد آماده‌سازی؛ صفحه frontend مأمور `/delivery` و تست runtime سرتاسری از checkout واقعی |
| **PRD-04 سبد و سفارش** | فقط هستهٔ اولیه ساخته شده | مدل حداقلی `Order/OrderLine`، گروه‌بندی حمل، snapshot لجستیک و hookهای اتصال پرداخت/لغو | Cart چندتولیدکننده‌ای، fixed pack/free mix در سبد، بازاعتبارسنجی قیمت/عرضه/حمل، هشدار تغییر قیمت، OrderGroup، checkout اتمیک، snapshot قیمت و کارمزد، reservation امن، پذیرش/رد، مهلت‌های ۲۴ساعته و API کامل سفارش |
| **PRD-05 مالی شبیه‌سازی‌شده** | شروع نشده | فقط قرارداد اتصال لجستیک به رویداد پرداخت آینده وجود دارد | PaymentEvent، Invoice، ledger، کارمزد خریدار/تولیدکننده، settlement، refund، adjustment، idempotency و snapshot مالی |
| **PRD-06 مغایرت و پشتیبانی** | شروع نشده | deadline مغایرت پس از تحویل کامل در PRD-03 ایجاد می‌شود | DiscrepancyCase/Line، مدارک، پاسخ ۴۸ساعتهٔ تولیدکننده، تصمیم اپراتور، hold تسویه، بازپرداخت جزئی، replacement/return و سیستم ticket/message |
| **PRD-07 امتیاز و نظر** | شروع نشده | API کاتالوگ فعلاً `average=null` و `count=0` را بدون افشای نادرست برمی‌گرداند | entitlement، امتیاز محصول و همکاری، انتشار دوطرفه یا پس از ۱۴ روز، گزارش، hide/unhide و پاسخ عمومی |
| **PRD-08 عملیات و داشبورد** | بخشی انجام‌شده | PlatformRole، owner/operator، audit تغییرناپذیر، outbox/inbox، claim اتمیک و برخی صف‌های verification/catalog/logistics | پنل کامل عملیات، صف‌های تمام حوزه‌ها، SuspensionCase و تصمیم مستقل هر سفارش، گزارش و metric، داشبورد tenant-safe، cache آماری، load/query review، backup/restore، امنیت release و checklist پایلوت |

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