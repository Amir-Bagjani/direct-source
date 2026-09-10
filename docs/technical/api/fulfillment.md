# قرارداد اجرایی لجستیک و تحویل — PRD-03

بک‌اند آماده‌سازی، تخصیص، مرسوله، رهگیری و تحویل همراه هستهٔ موردنیاز Order پیاده شده است. دامنهٔ سفارش کامل، سبد، رزرو، پرداخت، تصمیم لغو و عملیات مالی متعلق به PRD-04/05 هستند. ایجاد سفارش پرداخت‌شده یا تغییر مبلغ از API لجستیک ممکن نیست. سناریوهای این برش از قرارداد داخلی پرداخت شروع می‌شوند؛ UI و اتصال checkout در این تحویل قرار ندارند.

مراجع محصول: [PRD-03](../../product/prd/03-logistics-shipping-delivery.md)، [جریان ارسال](../../product/requirements/shipping-flow.md)، [پلتفرم لجستیک](../../product/requirements/logistics-platform.md). قرارداد خدمت/تعرفه و بستهٔ کاتالوگ در [logistics-publication.md](logistics-publication.md) باقی است.

## قرارداد اتصال سفارش و مالی

مدل `orders.Order` در این برش فقط طرفین سفارش، مقصد تثبیت‌شده، accepted/active/cancelled، مرجع و زمان پرداخت، شروع آماده‌سازی و deadline تحویل را دارد. `OrderLine` تنوع، SKU، تعداد، سهم تولید و زمان آماده‌سازی پذیرفته‌شده را نگه می‌دارد. این مدل‌ها در PRD-04 با Cart/OrderGroup/Reservation، قیمت، پذیرش/رد و مهلت‌ها تکمیل خواهند شد؛ هیچ endpoint ساخت Order در این برش وجود ندارد.

| فراخوانی داخلی | مسئولیت caller | اثر لجستیکی |
| --- | --- | --- |
| `logistics.grouping.freeze_shipping(order_id, choices)` | در تراکنش checkout پس از اعتبارسنجی کامل اقلام/قیمت/عرضه و قفل کاتالوگ؛ choices نگاشت UUID تنوع به خدمت منتخب است | گروه‌بندی تولیدکننده+مبدأ+خدمت، محاسبهٔ وزن گروه، snapshot خدمت/بسته/تعرفه/مبلغ و رابطهٔ دقیق به همهٔ OrderLineها |
| `orders.services.accept_payment(order_id, payment_reference)` | در همان تراکنش پرداخت مجاز و قطعی‌کردن رزرو؛ مبلغ و اصالت پرداخت متعلق به caller است | accepted→active و ساخت یک ShippingRequest برای هر گروه؛ تکرار همان مرجع بی‌اثر و مرجع دیگر مردود |
| `orders.services.cancel_fulfillment(order_id, reason)` | پس از تصمیم معتبر لغو؛ پیش از آماده‌سازی یا پس از اخذ تصمیم لازم، همراه آزادسازی/بازپرداخت همان تراکنش | لغو مرسوله‌های آماده و درخواست‌ها؛ پس از هر تحویل به حمل‌کننده رد می‌شود |
| `logistics.fulfillment.complete_cancellation_referral(request_id, outcome_reference, reason)` | پس از نتیجهٔ معتبر سفارش/مالی/مغایرت، در تراکنش مشترک با آن نتیجه | بستن یک ارجاع به cancelled، حفظ اقلام تحویل‌شده و منع بستن مرسولهٔ هنوز در مسیر؛ تکرار همان نتیجه بی‌اثر |

این hookها مسئول احراز پرداخت، دریافت وجه، صورتحساب، رزرو یا محاسبهٔ بازپرداخت نیستند. `payment_reference` شناسهٔ داخلی رویداد آینده است. `cancellation_referred_at` و رویداد `request.cancellation_referred` ورودی قابل‌ردیابی تصمیم سفارش/مالی‌اند. مرجع نتیجه روی درخواست ذخیره می‌شود؛ مبلغ دستی پذیرفته نمی‌شود.

## APIها

پیشوند همهٔ مسیرهای جدول `/api/v1/logistics/` است. جز مسیرهای `delivery/*` همه JWT می‌خواهند. اپراتور شامل نقش فعال operator یا owner است. مالکیت کسب‌وکار و نقش پلتفرمی مستقل‌اند. فهرست‌ها pagination استاندارد ۲۵تایی دارند.

| مسیر / متد | دسترسی و رفتار |
| --- | --- |
| `carriers/` GET/POST، `carriers/{id}/` GET/PUT/PATCH | فقط اپراتور؛ نام، نوع person/company، تماس، خدمات قابل‌ارائه و فعال‌بودن؛ تغییر با reason، بدون حذف |
| `group-quote/` POST | خرده‌فروش مجاز معامله؛ destination_id متعلق به خودش، selections شامل variant/quantity/service؛ یک خدمت برای هر محصول؛ هزینه از وزن مجموع گروه، جدا از کالا و کارمزد؛ نشانی خیابان مبدأ نمایش داده نمی‌شود |
| `requests/` GET | طرفین فقط سفارش خود، اپراتور همه؛ فیلتر `?status=ready` صف تخصیص و `?status=attention` رسیدگی |
| `requests/{id}/` GET | snapshot، اقلام/آمادگی، وضعیت، مشخصات واقعی، تاریخچهٔ تخصیص و مرسوله‌ها |
| `requests/{id}/events/` GET | تاریخچهٔ مجاز با actor/time و before/after؛ بدون کد یا توکن |
| `requests/{id}/progress/` POST | تولیدکننده؛ line_id، prepared_quantity و note؛ فقط پرداخت‌شده/فعال و پیش از اعلام آمادگی، پیشرفت صعودی و حداکثر تعداد سفارش |
| `requests/{id}/ready/` POST | تولیدکننده؛ تمام اقلام آماده، packages شامل count/weight_g/length_mm/width_mm/height_mm؛ weight_g وزن **هر بسته** در آن ردیف است |
| `requests/{id}/specification-review/` POST | اپراتور؛ decision=continue/cancel_refund و reason؛ ادامه فقط با خدمت معتبر و مبلغ برابر snapshot |
| `requests/{id}/assignment/` POST | اپراتور؛ carrier_id فعال و سازگار، pickup_start/end آینده، reason و agent اختیاری شامل name/mobile/plate؛ snapshot مستقل در هر تخصیص |
| `requests/{id}/exception/` POST | اپراتور؛ hold/resume/cancel_refund و reason؛ مدیریت دستی نبود حمل‌کننده، بدون تغییر مبلغ یا خدمت |
| `requests/{id}/shipments/` POST | تولیدکننده؛ packages و items شامل group_item/quantity؛ تخصیص جزئی در هنگام ساخت مجاز است، اضافه یا قلم گروه دیگر رد می‌شود |
| `shipments/{id}/` PUT | تولیدکننده؛ جایگزینی manifest پیش از تحویل به حمل‌کننده |
| `shipments/{id}/correction/` POST | اپراتور؛ manifest و reason، حفظ before/after و منع تغییر مرسولهٔ نهایی |
| `requests/{id}/manifest-correction/` POST | اپراتور؛ reason و corrections شامل shipment_id/packages/items؛ اصلاح اتمیک تقسیم چند مرسوله با حفظ مجموع مقدار و وزن |
| `shipments/{id}/hand-over/` POST | تولیدکننده؛ فقط پوشش دقیق تمام اقلام گروه و وزن واقعی تأییدشده؛ بسته/اقلام برای تولیدکننده قفل می‌شوند |
| `shipments/{id}/cancel/` POST | تولیدکننده؛ reason، فقط پیش از تحویل به حمل‌کننده؛ تخصیص حذف‌شده باید پیش از ارسال باقی گروه جبران شود |
| `shipments/{id}/tracking/` POST | اپراتور؛ reason و بارنامه، receipt، زمان تقریبی، گیرنده یا note؛ سابقهٔ مقدار قبل/بعد |
| `shipments/{id}/status/` POST | اپراتور؛ status و reason؛ تصمیم unconfirmed به delivered/failed نیازمند evidence_id اسکن‌شدهٔ همین سفارش است |
| `shipments/{id}/resolution/` POST | اپراتور؛ resend/cancel_refund و reason؛ ارسال مجدد یک مرسولهٔ تازه با replaces می‌سازد و نیازمند تخصیص و بازهٔ جمع‌آوری تازه است |
| `unconfirmed-deliveries/` GET | صف تحویل تأییدنشده، فقط اپراتور |
| `orders/{id}/fulfillment/` GET | وضعیت مشتق‌شدهٔ ارسال، شروع آماده‌سازی، delivered_at و discrepancy_deadline؛ هیچ setter عمومی ندارد |
| `requests/{id}/documents/` POST multipart | طرفین سفارش و اپراتور؛ یک file و consent_version؛ فایل خصوصی JPG/PNG/WebP/PDF تا ۱۰MB، اعتبارسنجی محتوا و scan gate |

دانلود فایل از `POST /api/v1/files/{id}/download/` انجام می‌شود. مدرک حمل با purpose=shipping و رویداد upload به سفارش متصل است؛ تعلق به همان کسب‌وکار به‌تنهایی مجوز اتصال مدرک سفارش دیگر نیست. URL موقت تنها پس از اسکن clean و احراز طرف مجاز صادر می‌شود.

## چرخه‌ها و مقدارها

درخواست: waiting→ready/spec_review→assigned→in_transit→completed. بررسی وزن یا استثنای اجرا می‌تواند attention بسازد؛ تصمیم اپراتور آن را ادامه می‌دهد یا به لغو/بازپرداخت ارجاع می‌دهد. completed و cancelled نهایی‌اند. اختلاف ابعاد/تعداد بسته ثبت می‌شود؛ اختلاف وزن توقف تخصیص می‌سازد. وزن و مبلغ snapshot هیچ‌گاه تغییر نمی‌کنند.

مرسوله: ready→handed_over→in_transit؛ handed_over/in_transit با کد به delivered، با ادعای بدون کد به unconfirmed یا با شکست حمل به failed می‌رود. unconfirmed فقط با مدرک و تصمیم اپراتور delivered/failed می‌شود؛ failed→returned مجاز است. لغو فقط از ready است. delivered/returned/cancelled نهایی‌اند و failed برای ارسال مجدد باز نمی‌شود.

مجموع تخصیص فعال هر قلم هرگز بیش از تعداد گروه نیست. مرسولهٔ cancelled و تلاش ناموفق دارای resolution=resend از جمع فعال کنار می‌روند، اما رکورد و تاریخچه حفظ می‌شوند. برای hand-over مجموع باید دقیقاً برابر گروه باشد. مرسولهٔ جایگزین به رکورد قبلی ارجاع دارد و بدون تخصیص تازه قابل hand-over نیست. اصلاح اتمیک چند manifest از کاهش/افزایش موقت مقدار میان بسته‌ها جلوگیری می‌کند.

وضعیت کلی `no_shipments/partially_shipped/fully_shipped/partially_delivered/attention/fully_delivered` بر اساس مقدار هر قلم محاسبه می‌شود. ناموفق، برگشتی یا unconfirmed حل‌نشده و ارجاع لغو/توقف اجرایی، attention می‌سازند. فقط تحویل تمام تعدادها، `delivered_at` و `discrepancy_deadline = delivered_at + 72h` را یک‌بار ثبت و اعلان `order.physically_delivered` می‌سازد. تحویل با کد تأیید سلامت یا تطابق کالا نیست. پس از بازپرداخت بخش تحویل‌نشده، «کامل تحویل‌شده» گزارش نمی‌شود.

زمان آماده‌سازی هر قلم از paid_at و lead_time_days تثبیت‌شده به دست می‌آید و در رویداد پیشرفت ثبت می‌شود. آمادگی زودتر مجاز است؛ تاریخ تعهد با پیشرفت یا تأخیر بازنویسی نمی‌شود. API به موجودی یا ظرفیت زنده دست نمی‌زند؛ قطعی‌کردن آن‌ها مسئولیت قرارداد پرداخت است.

## لینک و کد تحویل

| مسیر POST | رفتار |
| --- | --- |
| `shipments/{id}/delivery-link/` | اپراتور، reason؛ فقط پس از hand-over؛ token و لینک `/delivery#token=…` فقط یک‌بار و با no-store |
| `shipments/{id}/revoke-link/` | اپراتور، reason؛ ابطال لینک و کد جاری |
| `delivery/info/` | token در JSON؛ فقط شمارهٔ مرسوله و نام خدمت |
| `delivery/request-code/` | token؛ ارسال اعلان داخلی به گیرنده، پاسخ 204 بدون کد |
| `delivery/verify-code/` | token و code؛ مصرف یک‌باره و تحویل فیزیکی، پاسخ 204 |
| `delivery/unconfirmed/` | token و reason؛ ثبت ادعای بدون کد، ابطال لینک و ورود به صف اپراتور |

صفحهٔ `/delivery` قرارداد frontend آینده است. token از fragment خوانده و در body ارسال می‌شود؛ در path/query قرار نمی‌گیرد. لینک تصادفی ۲۵۶بیتی، مخصوص یک مرسوله و ۲۴ساعته است. پایگاه داده تنها SHA-256 آن را دارد. بازصدور، ابطال دستی و وضعیت‌های استثنایی/نهایی، لینک قبلی و کد را باطل می‌کنند. ارسال دستی لینک خارج سامانه مسئولیت اپراتور است.

کد شش‌رقمی ۱۰ دقیقه معتبر، با پنج تلاش ناموفق باطل و دارای فاصلهٔ صدور ۶۰ ثانیه و سقف پنج صدور در ساعت برای هر مرسوله است. بازصدور لینک، شمارندهٔ صدور کد را پاک نمی‌کند. تمام محدودیت‌ها زیر قفل Order بررسی می‌شوند. تلاش اشتباه پیش از پاسخ خطا commit می‌شود؛ این مسیر نباید زیر ATOMIC_REQUESTS یا atomic بیرونی پیچیده شود.

برای جمع‌کردن شرط «فقط hash در DB» با نمایش کد در InternalInbox، UUID تصادفی challenge به‌عنوان nonce غیرمحرمانه و HMAC-SHA256 با کلید برنامه برای مشتق‌کردن کد استفاده می‌شود. verifier نیز HMAC با context جدا است. Outbox/Inbox فقط شناسهٔ challenge، مرسوله و متن راهنما را دارند؛ کد خام حتی در payload اعلان ذخیره نمی‌شود. projection صندوق احرازشدهٔ همان گیرنده، فقط تا اعتبار challenge و لینک، کد را بازسازی می‌کند. دسترسی فقط به دیتابیس برای استخراج کد کافی نیست؛ تغییر کلید برنامه کدهای جاری را نامعتبر می‌کند. هیچ کد یا توکن خام در audit، تاریخچه، لاگ یا صف Celery قرار نمی‌گیرد. تحویل اعلان از interface موجود `notify` و provider `InternalInbox` عبور می‌کند.

`delivery-policy/` GET/PUT فقط برای مالک سامانه است؛ ttl_seconds، max_attempts، cooldown_seconds، hourly_limit و reason. محدودیت تلاش و TTL روی challenge صادرشده تثبیت می‌شوند؛ مقادیر جدید برای صدور بعدی‌اند. Inbox و پاسخ‌های لینک/مأمور no-store هستند. throttling عمومی IP مکمل سقف‌های تراکنشی هر مرسوله است.

## پایگاه داده و آزمون

فرمان‌های حساب‌دار به ترتیب User→Businessهای مرتب→Order→ShippingRequest قفل می‌گیرند؛ قفل request فقط روی خود جدول است و join خدمت را قفل نمی‌کند. کد مأمور مستقیماً Order را قفل می‌کند. hook snapshot مطابق ترتیب checkout پس از قفل‌های Business/Service/Product به Order می‌رسد. I/O فایل و scan بیرون تراکنش aggregate است.

PostgreSQL علاوه بر FK/unique/CHECK، snapshot گروه/اقلام و سابقهٔ تخصیص/رویداد را immutable می‌کند، تغییر طرفین/مقصد و محتوای قلم تثبیت‌شده را می‌بندد، گذارهای نامعتبر را رد می‌کند و قیود deferred مقدار و پوشش hand-over دارد. زمان پرداخت و deadline ثبت‌شده قابل بازنویسی نیستند. مدل‌های حساس در Django Admin ثبت نشده‌اند.

Migrationهای جدید orders/0001، operations/0004 و logistics/0004..0008 افزایشی‌اند. rollback، دادهٔ لجستیکی تازه را از دست می‌دهد و برای محیط دارای سفارش فعال راهکار بازیابی داده نیست؛ در چنین محیطی forward-fix و backup لازم است. آزمون reverse→forward روی دیتابیس تست، حفظ خدمت/تعرفهٔ قبلی را بررسی می‌کند.

تست‌های `tests/test_fulfillment.py` گردش API، snapshot، آمادگی ناقص، وزن، تخصیص، مقدار، چندمرسوله، کد/انقضا/تلاش/بازصدور، مدارک، ارسال مجدد، ارجاع لغو و tenant isolation را پوشش می‌دهند. رقابت واقعی PostgreSQL برای پرداخت تکراری، اضافه‌تخصیص، مصرف هم‌زمان همان کد و تحویل هم‌زمان آخرین مرسوله‌ها وجود دارد. S3/ClamAV در آزمون فایل mock هستند؛ آزمون provider واقعی و frontend بخشی از این نتیجه نیستند.
