# قرارداد مالی PRD-05

مسیر پایه `/api/v1/finance/`؛ تمام مبلغ‌های presentation عدد صحیح با پسوند `_irr` و واحد صریح `IRR` هستند. دادهٔ داخلی تمام FinancialEventها `execution_mode=simulated` است؛ presentation نام درگاه، رسید بانکی، فاکتور رسمی یا برچسب اجرای داخلی تولید نمی‌کند.

| مسیر | مجوز و ورودی | نتیجه |
| --- | --- | --- |
| `GET orders/{order}/` | مالک کسب‌وکار تأییدشدهٔ همان سفارش یا owner/operator فعال | مبلغ `original`، مبلغ باقی‌ماندهٔ `net`، نرخ‌های snapshot، تمام رویدادها و اسناد، علت‌های hold و وضعیت کارمزد |
| `POST orders/{order}/pay/` | مالک خرده‌فروشی؛ طرف‌های مجاز برای تجارت؛ `idempotency_key` از نوع UUID | رویداد پرداخت با `id/kind/currency/total_irr`؛ بدون ورودی مبلغ |
| `POST rates/` | فقط owner؛ `retailer_bps`, `manufacturer_bps` اعداد صحیح ۰ تا ۱۰۰۰۰ و `reason` | نرخ تازهٔ فعال؛ audit مقدار قبل/بعد |
| `POST orders/{order}/refund/` | فقط owner؛ UUID `idempotency_key`، `reason`، نگاشت `retained` از شناسهٔ تمام اقلام به تعداد باقی‌مانده؛ `refunded_groups` اختیاری | بازپرداخت و سند تعدیل؛ همان فرمان همان نتیجه |
| همان مسیر با `goods_override_irr` | فقط owner؛ مبلغ صحیح باقی‌ماندهٔ کالا بین صفر و مقدار جاری، همراه همان ورودی‌های قبلی | اصلاح کاهشی مبلغ، بازحساب کارمزدها، سند تعدیل و audit قبل/بعد |
| `POST orders/{order}/settle/` | فقط owner؛ `reason`؛ همهٔ شروط عادی تسویه همچنان لازم‌اند | تسویهٔ نهایی یکتا؛ مبلغ دستی پذیرفته نمی‌شود |

تمام فرمان‌ها فیلد ناشناخته، مبلغ/تعداد اعشاری یا رشته‌ای و دلیل خالی را رد می‌کنند. سفارش دیگران 404 و اقدام مالی حساس بدون نقش owner پاسخ 403 دارد. خطای وضعیت/deadline یا استفادهٔ متفاوت از مرجع فرمان 409 است. کلید پرداخت در دامنهٔ `(order, kind, key)` یکتا است؛ retry همان کلید و عامل، رویداد پیشین را برمی‌گرداند؛ کلید تازه برای سفارش قبلاً پرداخت‌شده رد می‌شود.

`original/net` شامل goods_irr، retailer_fee_irr، manufacturer_fee_irr، shipping_irr، total_irr، manufacturer_payable_irr، retained و shipping_groups است. گروه‌ها `group/amount_irr` دارند. رویدادهای پرداخت و جبران یک document با number، original و خطوط جداگانهٔ goods/retailer_commission/shipping دارند. اصل صورتحساب تغییر نمی‌کند. original در سند تعدیل شمارهٔ صورتحساب اصلی است. اصلاح دستی این نسخه کاهشی است؛ ایجاد بدهی تازه یا افزایش مبلغ پس از پرداخت فرمان عمومی ندارد.

## تراکنش و حسابداری

ترتیب قفل: User عامل با NO KEY UPDATE، سپس دو Business مرتب بر UUID، خدمات حمل، Order، رکوردهای مالی. worker و hookهای دامنه از همان قفل Business→Service→Order استفاده می‌کنند. فراخوانی hook از PRD-06/08 باید همین ترتیب را **پیش از قفل Order** رعایت کند. هیچ I/O خارجی داخل تراکنش مالی انجام نمی‌شود.

پرداخت مبلغ کالا، هر دو کارمزد، حمل و جمع را با snapshot تغییرناپذیر Order/OrderLine/ShippingGroup تطبیق می‌دهد؛ قیمت جاری کاتالوگ خوانده نمی‌شود. یک FinancialEvent، Invoice، LedgerEntryها، audit و outbox ایجاد و `orders.services.accept_payment` در همان transaction فراخوانی می‌شود. فعال‌شدن Order، allocatedشدن رزرو و ShippingRequestها همراه سند مالی commit یا rollback می‌شوند. هر سفارش تولیدکننده مستقل است.

LedgerEntry امضادار و برای هر رویداد جمع صفر دارد: پرداخت cash منفی، producer_payable برابر goods−manufacturer_fee، commission_reserved برابر جمع دو کارمزد و logistics با FK همان ShippingGroup. بازپرداخت معکوس همین اجزاست. تسویه فقط producer_payable را به cash و commission_reserved را به commission_revenue منتقل می‌کند؛ logistics ثابت می‌ماند. این سرفصل‌ها انتقال واقعی وجه نیستند.

نرخ‌ها نسخه‌های append-only هستند. preview زیر قفل خدمات نرخ هر دو طرف را در fingerprint می‌گذارد؛ checkout همان نرخ‌ها را snapshot می‌کند. تغییر نرخ تولیدکننده نیز تأیید برآورد تازه می‌خواهد. هر سهم با `(goods*bps + 50000)//100000*10` یک‌بار در سطح سفارش محاسبه می‌شود.

## جبران، لغو و مرز PRD-06

worker `finance.process_orders` هر ۶۰ ثانیه درخواست لغو `refund_pending` دارای پرداخت مالی را پردازش می‌کند: تصمیم معتبر CancellationRequest، رویداد بازپرداخت کامل، حذف دو کارمزد، بازگشت همهٔ حمل و سند تعدیل را ثبت و سپس `orders.cancellation.complete_refund` را **در همان transaction** اجرا می‌کند. شکست hook تمام اثر مالی را rollback می‌کند؛ تا commit وضعیت لغو pending باقی می‌ماند. سفارش‌های قدیمی که فقط hook لجستیکی آزمایشی داشته‌اند به‌صورت خودکار پرداخت مالی فرض نمی‌شوند.

قرارداد داخلی برای PRD-06:

1. `set_hold(order_id, reference, kind='discrepancy', reason)` را در transaction بازکردن پرونده اجرا کند. kindهای suspension/operational برای PRD-08 نیز وجود دارند.
2. فقط پس از تصمیم نهایی معتبر و پایدار پرونده، `register_decision(order_id, reference, reason, retained, refunded_groups, source='discrepancy', actor=...)` را فراخوانی کند. reference شناسهٔ تصمیم است؛ retained نتیجهٔ تجمعی تمام اقلام است. تعیین اینکه گروه کاملاً لغو، استفاده‌نشده یا تحویل‌نشده است مسئولیت دامنهٔ تصمیم است؛ finance تعلق گروه و صفر بودن تمام تعدادهای آن را کنترل می‌کند.
3. `apply_decision(decision_id)` جبران را محاسبه می‌کند؛ بهتر است همراه نهایی‌کردن تصمیم در همان transaction اجرا شود. تصمیم ثبت‌شده ولی پردازش‌نشده مانع تسویه است و worker آن را دوباره پردازش می‌کند.
4. در صورت ارجاع لجستیکی، نتیجهٔ معتبر را همراه `logistics.fulfillment.complete_cancellation_referral` اتمیک ثبت کند. بعد از پایان همهٔ اقدامات پرونده `set_hold(..., release=True)` را اجرا کند. رفع توقف ناموجود و بازکردن مجدد همان مرجع بسته رد می‌شود؛ پروندهٔ تازه مرجع تازه دارد.

این hookها endpoint عمومی نیستند و وجودشان به معنی پیاده‌سازی DiscrepancyCase یا SuspensionCase نیست. اپراتور endpoint تغییر مبلغ ندارد. مرجع تصمیم تکراری با محتوای متفاوت رد می‌شود. تعداد باقی‌مانده نمی‌تواند افزایش یابد؛ قیمت واحد و نرخ همیشه از سفارش می‌آیند. جبران بعد از تسویه رد می‌شود. اصلاح کاهشی دستی ممکن است جبران بعدیِ مبتنی بر تعداد را تا سازگارشدن مبلغ/تعداد رد کند؛ بازپرداخت کامل همچنان ممکن است و هیچ افزایش پنهان مبلغ انجام نمی‌شود.

در جبران جزئی، کارمزدها دوباره بر کل کالای باقی‌مانده گرد می‌شوند؛ هزینهٔ حمل نسبتی محاسبه نمی‌شود. فقط کل مبلغ گروه مشخص‌شده بازمی‌گردد. در صفرشدن تمام اقلام، همهٔ هزینه‌های حمل باقی‌مانده نیز برمی‌گردند. جمع تجمعی از پرداخت فراتر نمی‌رود.

## تسویه و اجرا

بدون پرونده: delivered_at و discrepancy_deadline معتبر و پایان ۷۲ ساعت لازم‌اند. با پرونده: تمام holdهای مغایرت باید بسته و همهٔ اقلام باقی‌مانده تحویل شده باشند؛ اقلام جبران‌شدهٔ تحویل‌نشده، تحویل فیزیکی جعلی ایجاد نمی‌کنند. hold فعال، تعلیق مؤثر Business/User، لغو باز، جبران پردازش‌نشده یا پروندهٔ لجستیکی حل‌نشده مانع تسویهٔ همان Order می‌شود. درخواست‌های حمل cancelled/completed پروندهٔ باز محسوب نمی‌شوند.

worker هر صف را در صفحه‌های ۱۰۰۰تایی بر UUID می‌خواند و با keyset continuation صفحهٔ بعد را در Celery زمان‌بندی می‌کند؛ سفارش‌های holdشدهٔ قدیمی مانع پردازش صفحه‌های بعد نمی‌شوند. شمارندهٔ پاسخ task فقط نتیجهٔ همان صفحه است. اجرای هم‌زمان/retry با قفل Order و قیود یکتا ایمن است. خطای اتصال PostgreSQL با backoff تا پنج retry دارد. تسویهٔ عادی نیازی به تأیید owner ندارد. تسویه در همان transaction از `orders.services.complete_financial_cycle` استفاده می‌کند و Order را به completed با completed_at تغییرناپذیر می‌برد. settled وضعیت مالی مشتق‌شده از رویداد یکتاست. entitlement در PRD-07 به این completion متصل خواهد شد.

آزمون‌ها: `apps/backend/tests/test_finance.py`، شامل API/مجوز، واحد پول، immutability، rollback، idempotency و رقابت PostgreSQL، چند گروه حمل، استقلال دو تولیدکننده، نیم‌به‌بالا، نرخ آینده، worker، hold، جبران و checkout→OTP delivery→settlement. قرارداد OpenAPI در `openapi.yaml` است.


اتصال PRD-06 اکنون در [disputes-support.md](disputes-support.md) پیاده شده است: پذیرش معتبر از DisputeDecision به CompensationDecision و FinancialEvent می‌رسد؛ عامل تصمیم در پرونده حفظ می‌شود و اجرای خودکار مالی actor سیستمی دارد. پروندهٔ باز مستقلاً مانع تسویه است. فقط Shipmentهای purpose=order در بررسی تحویل اقلام نگه‌داشته‌شده حساب می‌شوند؛ جبران جایگزینی/مرجوعی تحویل اصلی را دوباره نمی‌شمارد.
