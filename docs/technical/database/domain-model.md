# مدل دامنهٔ بک‌اند

مبنای طراحی: هشت PRD پذیرفته‌شده، ADR-0002..0012 و واژه‌نامهٔ `CONTEXT.md`.
این سند طراحی است؛ وجود نام یک مدل در آن به معنی پیاده‌سازی قابلیت نیست. وضعیت اجرا در برنامهٔ backend ثبت می‌شود.

برش اجرایی آغاز PRD-04: `orders.Cart` به Business خرده‌فروش تعلق دارد و قید یکتای شرطی روی `retailer` برای `is_active=true` دارد. `destination` اطلاعات کامل تحویل و `version` شمارهٔ تغییرات سبد است. `CartSelection` برای هر `(cart, product)` یکتا و شامل انتخاب JSON روش/تعداد، ترکیب ثبت‌شدهٔ بسته و FK خدمت حمل است. ارجاع مستقیم به FixedPack وجود ندارد چون ویرایش برنامهٔ فروش بسته‌ها را بازسازی می‌کند. پیش‌نمایش سبد رزرو یا تعهد قیمت ایجاد نمی‌کند.

## مالکیت و مرز تراکنش

ادامهٔ PRD-04: checkout در یک transaction، OrderGroup، Orderهای pending، OrderLine، Reservation و snapshot حمل را می‌سازد و Cart را می‌بندد. Reservation مقدار موجودی/تولید را در وضعیت reserved و allocated مصرف می‌کند؛ release نهایی است. CancellationRequest تصمیم لغو پس از پرداخت را مستقل نگه می‌دارد و فقط callback مالی مجاز آن را completed می‌کند. DeliveryAddress دفترچهٔ متعلق به retailer است؛ انتخاب آن یک کپی مستقل در Cart می‌سازد. قراردادها در `api/orders.md` ثبت شده‌اند.

| Context / app | Aggregate root و اعضا | Commandهای اصلی | Event / invariant |
|---|---|---|---|
| هویت / accounts | User، AuthSession، EmailChallenge، PlatformRole | Register، Login، RotateSession، Logout، VerifyEmail، ResetPassword | موبایل canonical یکتا؛ ثبت‌نام Business نمی‌سازد؛ نقش از DB خوانده می‌شود؛ reuse نشست را باطل می‌کند |
| اعتماد / accounts | Business، Membership، VerificationApplication، VerificationSection، Evidence | CreateBusiness، SubmitVerification، ReviewSection، ReopenVerification، SetControlledAccess | هر شخص حداکثر یک Business و هر Business یک مالک؛ تأیید نیازمند پذیرش هر دو بخش؛ مجوز MVP مستقل از وضعیت |
| بازنگری اعتماد / accounts | BusinessRevision | ProposeRevision، ClaimRevision، ReviewRevision، ResubmitRevision | تا تأیید همهٔ بخش‌های تغییرکرده، دادهٔ مصوب و وضعیت Business ثابت؛ یک بازنگری باز؛ تاریخچهٔ نهایی تغییرناپذیر |
| محدودسازی / operations | Suspension، OrderDisposition | Propose، Activate، Reject، Restore، DecideOrder | وضعیت User و Business مستقل؛ فقط مالک سامانه تصمیم نهایی می‌گیرد؛ آثار هر Order جدا ثبت می‌شوند |
| کاتالوگ / catalog | Category، AttributeDefinition، Product، ProductRevision، Variant، PriceTier، FixedPack | SubmitProduct، PublishRevision، SetSupply | نسخهٔ مصوب عمومی است؛ SKU یکتا؛ قیمت برای غیرخرده‌فروش تأییدشده افشا نمی‌شود |
| عرضه / catalog و orders | catalog.VariantSupply، orders.Reservation | Reserve، Allocate، Release | catalog مالک عرضه؛ orders مالک رزرو/تخصیص؛ موجودی/ظرفیت منفی ممنوع؛ آماده قبل از تولید؛ آزادسازی دقیقاً یک‌بار |
| سفارش / orders | Cart، CartProductSelection، OrderGroup، Order، OrderLine، CancellationRequest | PreviewCheckout، Checkout، Accept، Reject، Expire، Cancel | ثبت گروه همه یا هیچ؛ پس از ثبت هر Order مستقل؛ snapshot غیرقابل‌ویرایش |
| مالی / finance | Payment، Invoice، Adjustment، Refund، Settlement، SettlementHold | Pay، RefundFromDecision، Settle | integer IRR؛ همهٔ MVP با execution_mode=simulated؛ مبلغ حمل مستقل؛ سند صادرشده الحاقی |
| لجستیک / logistics | ShippingService، Tariff، Carrier | ActivateTariff، Quote | فعال‌سازی فقط مالک؛ شهر سپس استان سپس سراسری؛ بازه‌های فعال بدون هم‌پوشانی |
| اجرای حمل / logistics | ShippingGroup، ShippingRequest، Shipment، ShipmentItem، FulfillmentEvent، DeliveryChallenge | Ready، Assign، Handover، IssueCode، ConfirmDelivery | مجموع تخصیص از اقلام بیشتر نمی‌شود؛ تحویل آخرین مرسوله آغاز مهلت؛ کد فقط hash |
| مغایرت / disputes | DiscrepancyCase، DiscrepancyLine، Resolution، Compensation | ClaimDiscrepancy، Respond، Decide، CompleteCompensation | قلم و تعداد دقیق؛ ۴۸ ساعت پاسخ؛ hold فقط همان Order؛ مبلغ جبران از snapshot |
| پشتیبانی / support | Ticket، Message، Attachment | Reply، Resolve، Close | پیام اثر مالی ندارد؛ حل‌شده با پاسخ باز می‌شود؛ بسته‌شده نهایی |
| نظر / reviews | Entitlement، Review، Reply، ModerationAction | SubmitReview، PublishPair، HideContent، Invalidate | یک حق برای موضوع سفارش؛ ۱۴ روز؛ ارسال نهایی قفل؛ دادهٔ simulated در آمار عمومی نیست |
| عملیات / operations | WorkItem، AuditEvent، OutboxEvent، InboxNotification، StoredFile | Claim، Reassign، Dispatch، AuthorizeDownload | claim اتمیک؛ تصمیم فقط مسئول/مالک؛ audit الحاقی؛ اعلان idempotent؛ فایل قرنطینه تا اسکن |
| تحلیل / operations.analytics | projection روی contextهای بالا | QueryDashboard، DrillDown | فقط خواندن از PostgreSQL؛ بدون کش در اجرای فعلی؛ scope نقش و Business اجباری |

## Value objectها

`MoneyRial` عدد صحیح غیرمنفی با واحد IRR؛ `Quantity` صحیح مثبت؛ `PhoneNumber` موبایل canonical؛ `AddressSnapshot` استان/شهر/نشانی تثبیت‌شده؛ `PriceSnapshot` پله و قیمت تنوع؛ `CommissionSnapshot` نرخ و مبلغ؛ `ShippingQuoteSnapshot` خدمت/تعرفه/وزن/مبلغ؛ `Deadline` timestamp مطلق UTC؛ `ExecutionMode` تفکیک سابقهٔ MVP از واقعی.

## قرارداد مرزها

- ماژول مالک تنها نویسندهٔ مدل خود است؛ API از service و خواندن از selector می‌گذرد.
- orchestration سفارش می‌تواند در همان transaction سرویس رزرو و مالی را فراخوانی کند. consumer رویداد نباید برای invariant مالی به eventual consistency متکی باشد.
- `operations` مالک audit/outbox، صف، تنظیمات، تعلیق و نگهداری فایل است؛ برای تغییر سفارش، مالی، کاتالوگ و لجستیک به سرویس همان دامنه رجوع می‌کند. importهای سطح ماژول نباید چرخهٔ بارگذاری بسازند؛ وابستگی‌های orchestration در محل فراخوانی import می‌شوند. FK به User با `AUTH_USER_MODEL` تعریف می‌شود.
- اعلان و email اثر پس از commit هستند؛ intent در همان transaction ذخیره می‌شود. شکست Redis نباید write دامنه را از بین ببرد.
- هیچ پیام صف یا JWT حامل نقش معتبر دائمی، مدرک هویتی، password یا کد تحویل نیست.

## سناریوهای مرزی الزام‌آور

۱. دو درخواست هم‌زمان ساخت Business: lock کاربر و unique عضویت تنها یکی را موفق می‌کند.
۲. دو اپراتور یک پرونده را claim می‌کنند: lock پرونده، تنها یک مسئول.
۳. هویت پذیرفته و فعالیت برگشتی: ارسال دوباره فقط فعالیت را تغییر می‌دهد.
۴. رد نهایی Business: بازگشایی مستدل مسئول، فقط بخش‌های نیازمند اصلاح را باز می‌کند؛ سایر terminalها مجاز نمی‌شوند.
۵. لغو controlled access: قیمت عمده و سفارش قبلی ثابت می‌مانند؛ checkout تازه بسته است.
۶. refresh قدیمی پس از rotation: تمام نشست همان خانواده باطل می‌شود؛ نشست مستقل دستگاه دیگر باقی می‌ماند.
۷. تعلیق تنها مالک: صلاحیت تأیید Business ثابت، مجوز عملیات تازه از وضعیت جاری مالک مشتق می‌شود.

بازیابی طبق تصمیم کاربر در 2026-09-07 فقط با لینک ایمیل قبلاً تأییدشده است؛ ایمیل بدون تأیید مسیر بازیابی نیست.


## تطبیق اجرایی PRD-03 — 2026-09-10

مرز لجستیک و اجرای حمل در ماژول موجود `logistics` پیاده شده است؛ ماژول موازی fulfillment ساخته نشده. نام اجرایی TransportRequest برابر ShippingRequest، تاریخچهٔ رهگیری FulfillmentEvent و نسخهٔ تعرفه همان Tariff تغییرناپذیر است. CarrierAssignment تاریخچهٔ مستقل تخصیص و snapshot حمل‌کننده را نگه می‌دارد.

هستهٔ `orders.Order/OrderLine` فقط قرارداد لازم ارسال را تأمین می‌کند. `freeze_shipping` در checkout، `accept_payment` در تراکنش پرداخت/قطعی‌کردن رزرو و hookهای لغو فقط پس از تصمیم معتبر دامنه‌های مالک فراخوانی می‌شوند. API عمومی میان‌بری برای پرداخت یا ایجاد سفارش وجود ندارد. [قرارداد کامل](../api/fulfillment.md).
