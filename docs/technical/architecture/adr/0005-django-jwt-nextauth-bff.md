# ADR-0005: احراز هویت JWT با مرجعیت Django و لایهٔ NextAuth

## وضعیت

Accepted

## تاریخ

2026-09-03

## زمینه و مسئله

کلاینت اصلی محصول Next.js و API اصلی Django REST Framework است. محصول به احراز هویت قابل‌استفاده برای API، نگهداری امن توکن در مرورگر، کنترل دسترسی دامنه‌ای در Django و امکان لغو دسترسی هنگام خروج یا تعلیق نیاز دارد. استفادهٔ هم‌زمان از session مستقل NextAuth و JWT مستقل Django می‌تواند دو مرجع هویت ناسازگار بسازد.

## محرک‌های تصمیم

- Django باید مرجع کاربران، کسب‌وکارها، نقش‌ها، تعلیق و مجوزهای دامنه‌ای بماند.
- JWT نباید در `localStorage`، `sessionStorage` یا JavaScript مرورگر قابل‌دسترسی باشد.
- Next.js باید بتواند از NextAuth برای ورود، خروج، حفاظت مسیرها و session سمت سرور استفاده کند.
- refresh token باید قابل‌چرخش و لغو باشد.
- تغییر نقش یا وضعیت کسب‌وکار نباید تا پایان عمر یک claim قدیمی، مجوز نادرست ایجاد کند.

## گزینه‌های بررسی‌شده

### گزینهٔ ۱: Django Session و CSRF هم‌دامنه

- مزایا: ساده، ابطال فوری session و یک مرجع احراز هویت
- معایب: با تصمیم صریح استفاده از JWT و NextAuth سازگار نیست و استفادهٔ API مستقل آینده را دشوارتر می‌کند

### گزینهٔ ۲: JWT مستقل NextAuth و JWT مستقل Django

- مزایا: استقلال ظاهری دو برنامه
- معایب: دو صادرکننده و دو چرخهٔ session، پیچیدگی refresh/logout و احتمال اختلاف هویت و مجوز

### گزینهٔ ۳: JWT صادرشده توسط Django با NextAuth به‌عنوان BFF وب

- مزایا: یک مرجع هویت و مجوز، توکن دور از JavaScript مرورگر، سازگاری با SSR/Server Components و امکان API token-based
- معایب: یک hop اضافه از Next.js به Django، نیاز به پیاده‌سازی دقیق refresh و حفاظت CSRF در مرز BFF

## تصمیم

گزینهٔ ۳ انتخاب شد:

- Django مرجع اصلی هویت، اعتبارسنجی credentials، نقش‌ها، عضویت، وضعیت کسب‌وکار و authorization است.
- Django یک access JWT کوتاه‌عمر و refresh JWT بلندعمرتر صادر می‌کند.
- NextAuth با Credentials provider ورود را به Django واگذار می‌کند و لایهٔ session/BFF برنامهٔ Next.js است.
- مرورگر فقط Cookie امن NextAuth را با ویژگی‌های `HttpOnly`، `Secure` و `SameSite` نگه می‌دارد؛ JWT خام در storage یا کد client قرار نمی‌گیرد.
- درخواست‌های حفاظت‌شدهٔ مرورگر از BFF سمت سرور Next.js عبور می‌کنند؛ BFF access token را در هدر `Authorization: Bearer` به Django می‌فرستد.
- refresh token rotation و blacklist فعال است؛ خروج، reuse مشکوک یا ابطال دسترسی refresh token را نامعتبر می‌کند.
- claimها حداقلی‌اند. مجوزهای متغیر، نقش کسب‌وکار و وضعیت تعلیق در هر درخواست توسط Django از منبع حقیقت بررسی می‌شوند و صرفاً از claim قدیمی پذیرفته نمی‌شوند.
- endpointهای احراز هویت و درخواست‌های state-changing مبتنی بر Cookie باید در برابر CSRF و درخواست cross-origin محافظت شوند.
- نسخهٔ پایدار و پشتیبانی‌شدهٔ `next-auth` و کتابخانهٔ JWT هنگام شروع پیاده‌سازی pin می‌شود؛ نسخهٔ beta بدون بازبینی امنیتی وارد production نمی‌شود.

## دلیل

این انتخاب خواستهٔ استفاده از JWT و NextAuth را حفظ می‌کند، اما از ساخت دو مرجع هویت جلوگیری می‌کند. Django همچنان همهٔ قواعد دامنه‌ای را اعمال می‌کند و Next.js فقط مرز امن وب و تجربهٔ session را مدیریت می‌کند.

## پیامدها

### مثبت

- توکن‌ها برای JavaScript مرورگر قابل‌خواندن نیستند.
- authorization در همان بک‌اندی می‌ماند که داده و قواعد دامنه را مالک است.
- Server Components و route handlerهای Next.js می‌توانند session را سمت سرور مصرف کنند.
- rotation و blacklist امکان کنترل refresh tokenهای سرقت‌شده یا منقضی را فراهم می‌کنند.

### منفی و ریسک‌ها

- BFF یک hop و نقطهٔ failure اضافه می‌کند.
- Cookie امن به‌تنهایی CSRF را حذف نمی‌کند.
- access token ذاتاً تا پایان عمرش معتبر است؛ برای تعلیق فوری باید وضعیت فعال کاربر/کسب‌وکار در Django بررسی شود.
- مدیریت refresh هم‌زمان چند درخواست باید از race و reuse اشتباه جلوگیری کند.
- مستندات فعلی Auth.js شاخهٔ `next-auth@5` را beta معرفی می‌کنند؛ نسخه باید هنگام اجرا دوباره ارزیابی شود.

### اقدامات لازم

- قرارداد endpointهای login، refresh، logout و session مشخص شود.
- عمر access/refresh، الگوریتم امضا، `issuer`، `audience`، `jti` و سیاست rotation در طراحی امنیتی تعیین شوند.
- refresh tokenهای outstanding/blacklisted و خروج از همهٔ دستگاه‌ها آزموده شوند.
- تست‌های CSRF، XSS، token replay، refresh reuse، تعلیق و تغییر نقش نوشته شوند.
- secrets امضا و رمزگذاری NextAuth جدا، قابل‌چرخش و خارج از repository نگهداری شوند.

## تصمیم‌های مرتبط

- ADR-0002: جداسازی سه محور دسترسی
- ADR-0003: مونولیت ماژولار Django برای MVP

## منابع

- [Auth.js session strategies](https://authjs.dev/concepts/session-strategies)
- [Auth.js Credentials provider](https://authjs.dev/getting-started/authentication/credentials)
- [Simple JWT settings](https://django-rest-framework-simplejwt.readthedocs.io/en/stable/settings.html)
- [Simple JWT blacklist app](https://django-rest-framework-simplejwt.readthedocs.io/en/stable/blacklist_app.html)


## تکمیل تصمیم وب — 2026-09-25

Credentials پایدار NextAuth 4.24.15 با cookie حاوی شناسهٔ opaque اجرا شد؛ access/refresh
Django در vault رمز‌شدهٔ PostgreSQL می‌مانند. قفل advisory مشترک و ثبت durable حالت
`refreshing` قبل از HTTP، refresh هم‌زمان/نامطمئن را هماهنگ می‌کنند. این vault مرجع هویت
مستقل نیست؛ `/me/` و هر عملیات دامنه همچنان از Django مجوز می‌گیرند.
[قرارداد اجرایی و محدودیت‌های استقرار](../../frontend/web-sessions.md) جزئیات را ثبت می‌کند.
