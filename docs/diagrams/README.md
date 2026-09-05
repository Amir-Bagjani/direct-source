# نمودارهای پروژه

۲۰ نمودار HTML مستقل و راست‌به‌چپ که گردش‌های مستندشدهٔ MVP بازارگاه تأمین مستقیم را به‌صورت بصری نشان می‌دهند. برای مشاهده، فایل [`index.html`](index.html) را در مرورگر باز کنید؛ همهٔ نمودارها بدون سرور یا ابزار اجرا می‌شوند.

این نمودارها نمای مفهومی مستندات هستند، نه جایگزین آن‌ها؛ منبع حقیقت قواعد و واژگان، اسناد مرجع جدول زیر و واژه‌نامهٔ [`CONTEXT.md`](../../CONTEXT.md) هستند.

## قواعد مشترک

- استایل یکسان minimal light با فونت تعبیه‌شدهٔ Vazirmatn؛ هر فایل خودکفاست.
- اشکال: بیضی = شروع/پایان، مستطیل = اقدام، لوزی = تصمیم (در نمودار معماری: مستطیل = سرویس، خط = جریان داده).
- زبان نمودارها با واژگان رسمی `CONTEXT.md` و قاعدهٔ زبان رابط (`../product/requirements/ui-language.md`) هم‌راستاست؛ ماهیت شبیه‌سازی‌شدهٔ عملیات مالی در نمودارها با زبان عادی محصول نمایش داده می‌شود.
- نوار پایین هر نمودار، اسناد مرجع آن را با نام فایل مشخص می‌کند.

## فهرست نمودارها

| نمودار | فایل | چه چیزی را نشان می‌دهد | مستند مرجع | نوع |
|---|---|---|---|---|
| فلوچارت کلی بازارگاه | [overall-flowchart.html](overall-flowchart.html) | مسیر کلان از ورود بازیگران تا تسویه و امتیازدهی | `product/vision/discovery-summary.md`، `product/vision/product.md` | جریان کسب‌وکار (کلان) |
| تأیید کسب‌وکار و فعال‌سازی تجاری | [business-verification.html](business-verification.html) | ثبت‌نام، تأیید دوبخشی، مجوز حساب کنترل‌شده و ورود به گردش آزمایشی | `product/requirements/business-onboarding.md`، `product/prd/01-accounts-business-trust.md` | جریان کسب‌وکار |
| کنترل دسترسی سه‌محوره | [access-control.html](access-control.html) | ترکیب نقش پلتفرمی، نوع کسب‌وکار و عضویت در مجوز نهایی | `product/requirements/role-matrix.md`، `technical/architecture/adr/0002` | قواعد دسترسی |
| ایجاد و انتشار محصول | [catalog-publication.html](catalog-publication.html) | پیش‌نویس محصول، شرط حمل سراسری، بررسی اپراتور و انتشار | `product/requirements/catalog-publication.md`، `product/prd/02-catalog-pricing-supply.md` | جریان کسب‌وکار + چرخهٔ وضعیت |
| محاسبه و تثبیت قیمت عمده | [wholesale-pricing.html](wholesale-pricing.html) | پلهٔ مقداری، قیمت اختصاصی تنوع و تثبیت قیمت سفارش | `product/requirements/pricing-rules.md` | جریان کسب‌وکار |
| سبد خرید و ثبت سفارش | [cart-order-placement.html](cart-order-placement.html) | اعتبارسنجی سبد، نشانی و خدمت حمل، ثبت اتمیک و رزرو عرضه | `product/requirements/cart-order-placement.md` | جریان کسب‌وکار |
| سفارش چندتولیدکننده‌ای و چرخهٔ اصلی | [order-lifecycle.html](order-lifecycle.html) | تفکیک گروه سفارش، مهلت‌های ۲۴ ساعته و چرخهٔ وضعیت | `product/requirements/order-lifecycle.md`، `product/requirements/cart-order-placement.md` | جریان کسب‌وکار + چرخهٔ وضعیت |
| پرداخت، کارمزد و تسویهٔ MVP | [payment-settlement.html](payment-settlement.html) | پرداخت شبیه‌سازی‌شده، رزرو و قطعی‌شدن کارمزد ۴٪ | `product/requirements/payment-simulation.md`، `product/requirements/pricing-rules.md` | جریان کسب‌وکار |
| سفارش تولیدی و رزرو ظرفیت | [made-to-order.html](made-to-order.html) | گردش سفارش تولیدی، عرضهٔ ترکیبی و آزادسازی رزرو | `product/requirements/made-to-order-flow.md` | جریان کسب‌وکار |
| خدمات حمل و چرخهٔ درخواست حمل | [logistics-platform.html](logistics-platform.html) | درخواست حمل پس از پرداخت، استثنای وزن و تخصیص اپراتور | `product/requirements/logistics-platform.md`، `product/prd/03-logistics-shipping-delivery.md` | جریان کسب‌وکار + چرخهٔ وضعیت |
| ارسال، رهگیری و تأیید تحویل | [shipping-delivery.html](shipping-delivery.html) | تخصیص حمل‌کننده، مرسوله، کد تحویل و استثنای تحویل | `product/requirements/shipping-flow.md`، `product/prd/03-logistics-shipping-delivery.md` | جریان کسب‌وکار |
| مغایرت، جبران و مرجوعی | [discrepancy-returns.html](discrepancy-returns.html) | ثبت ردیف مغایرت، پاسخ ۴۸ساعته، داوری و راهکار جبران | `product/requirements/discrepancy-flow.md` | جریان کسب‌وکار |
| پشتیبانی و تیکتینگ | [support-ticketing.html](support-ticketing.html) | چرخهٔ تیکت و مرز آن با پروندهٔ مغایرت | `product/requirements/support-flow.md` | جریان کسب‌وکار + چرخهٔ وضعیت |
| حق امتیازدهی و انتشار نظر | [ratings-reviews.html](ratings-reviews.html) | شرایط حق امتیازدهی و انتشار هم‌زمان امتیاز دوطرفه | `product/requirements/ratings-reviews-flow.md` | جریان کسب‌وکار |
| تعلیق کاربر و کسب‌وکار | [account-suspension.html](account-suspension.html) | دو نوع تعلیق مستقل و تعیین تکلیف سفارش‌های فعال | `product/requirements/account-suspension-flow.md` | جریان کسب‌وکار |
| عملیات پنل مدیریت MVP | [admin-operations.html](admin-operations.html) | صف‌های اپراتور، اقدام حساس و مرز مالک سامانه | `product/requirements/admin-operations.md`، `technical/architecture/adr/0010` | جریان کسب‌وکار |
| داشبوردهای عملکرد نقش‌محور | [analytics-dashboards.html](analytics-dashboards.html) | سه نمای تحلیلی تولیدکننده، خرده‌فروش و مدیر | `product/requirements/analytics-dashboards.md` | جریان کسب‌وکار |
| جذب اولیه تا عبور به پایلوت واقعی | [go-to-market.html](go-to-market.html) | برنامهٔ شش‌هفته‌ای و معیارهای MVP-GATE-01..05 | `product/vision/go-to-market.md` | جریان کسب‌وکار |
| احراز هویت JWT و لایهٔ BFF | [auth-bff.html](auth-bff.html) | مرجعیت هویت Django، session وب NextAuth و بررسی مجوز هر درخواست | `technical/architecture/adr/0005`، `technical/backend/architecture-blueprint.md` | جریان فنی |
| معماری بک‌اند مونولیت ماژولار | [backend-architecture.html](backend-architecture.html) | اجزای بک‌اند MVP و جریان داده میان آن‌ها | `technical/backend/architecture-blueprint.md`، ADR-0003/0004/0006/0007/0009 | معماری فنی |

## یادداشت‌ها و موارد باز

- بایگانی `assets/pdf/` خروجی تولیدشدهٔ نسخهٔ پیش از بازآرایی اسناد و نمودارهای قدیمی است و پس از این به‌روزرسانی بازتولید نشده است؛ تا بازتولید، مرجع نباشد.
- جزئیات پیاده‌سازی (مدل داده، قراردادهای API، ERD) هنوز مستند نشده‌اند؛ نمودارهای فنی فعلی تنها معماری پذیرفته‌شدهٔ ADRها را نشان می‌دهند، نه طراحی نهایی.
