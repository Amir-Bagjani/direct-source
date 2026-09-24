# ممیزی آمادگی پایهٔ فرانت‌اند

تاریخ: 2026-09-24. هدف: بستن زیرساخت عمومی و مشخص‌کردن گیت‌های لازم پیش از اجرای
قابلیت‌های PRDها. آماده‌بودن base به معنی پیاده‌شدن احراز هویت یا آماده‌بودن انتشار نیست.

## تصمیم و مرز تحویل

شروع PRD-01 پس از موفقیت checkpoint فنی مجاز است. نخستین برش آن باید `CAP-ACC-01`
و `CAP-ACC-07`، یعنی session/BFF و کنترل دسترسی واقعی باشد. تا عبور از این گیت، هیچ صفحهٔ
خصوصی یا دادهٔ قیمت‌دار نباید فعال شود. guard و logout اکنون پیاده نشده‌اند؛ package
نصب‌شدهٔ NextAuth یا proxy زبان، جای آن‌ها نیست. base امنیتی صفحات خصوصی هنوز بسته نیست.

## شاهد checkpoint محلی

- نصب `pnpm install --frozen-lockfile --strict-peer-dependencies`: موفق.
- تولید OpenAPI و مقایسه با فایل موجود: بدون drift.
- ۵۹ تست Vitest در ۱۶ فایل: موفق؛ تست hook حفظ partial staging: موفق.
- typecheck و بررسی deprecation، lint و تست قوانین معماری، format:check: موفق.
- build تولیدی: موفق. پس از جابه‌جایی route، typeهای قدیمی تولیدشدهٔ dev پاک و build مجدد شد.
- ۲۲ تست Playwright روی standalone تولیدی با Chrome محلی، موبایل/دسکتاپ و fa/en: موفق؛
  شامل تم، فونت، RTL، modal history/focus، SEO و HTTP 404.
- اجرای remote CI، کانتینر و مرورگرهای Safari/Firefox در این ممیزی انجام نشده است.
  آزمون واقعی auth/logout هم هنوز وجود ندارد و با تست‌های عمومی جایگزین نشده است.

## موجودی قابل‌اتکا

| حوزه | وضعیت و شاهد | هنگام اجرای PRD |
| --- | --- | --- |
| کتابخانه‌ها | نسخه‌های مستقیم pin، lockfile و نصب strict-peer بررسی شدند؛ Next.js، React، Query، next-intl، RHF، Zod، NextAuth و shadcn موجودند | نصب کتابخانه به معنی آماده‌بودن integration نیست؛ dependency تازه فقط برای نیاز واقعی |
| معماری | route نازک، feature ownership، import مستقیم، محدودیت لایه‌ها و no-barrel با Oxlint | هر PRD در feature خودش؛ shared تجاری پس از مصرف مستقل دوم |
| UI kit | shadcn Base UI/Nova/neutral، Button/Input/Dialog/ToggleGroup/Alert/Spinner و DirectionProvider | کنترل موردنیاز با CLI رسمی؛ همهٔ کتابخانه از قبل نصب نمی‌شود |
| پوستهٔ مشترک | SiteHeader در layout زبان، LanguageSwitcher و ThemeSwitcher مشترک؛ نیازی به تکرار header در کاتالوگ نیست | navigation حساب و پنل‌ها پس از قرارداد نقش‌ها؛ footer/sidebar فرضی ساخته نمی‌شود |
| فونت و زبان | Inter/Vazirmatn با next/font و self-host؛ fa/RTL و en/LTR، catalog دو زبان و تست مرورگر | فرمت تاریخ/پول طبق ADR-0011/0012 همراه اولین مصرف واقعی؛ اکنون helper مالی/تقویم نداریم |
| تم | لایت پیش‌فرض، انتخاب صریح دارک در cookie، SSR و reload/تغییر زبان تست دارند | بدون provider یا token system موازی |
| React Query | client مستقل سرور، client پایدار مرورگر، retry محدود، بدون retry mutation؛ hydration/invalidation تست دارند | API adapter، queryOptions و keys کنار feature؛ scope کاربر/کسب‌وکار در کلید خصوصی |
| HTTP مرورگر | bffRequest + Zod + خطای ساخت‌یافته، signal، same-origin و no-store؛ مسیر escape و redirect ممنوع | allowlist مقصد و authorization سرور باید در BFF واقعی ساخته شوند |
| loading/error | loading گروه `(public)` از shared Loading؛ retry خطا ابتدا QueryErrorResetBoundary را reset و سپس Next retry را فراخوانی می‌کند | بخش‌های مستقل slow از Suspense محلی استفاده می‌کنند |
| SEO | canonical/hreflang هر مسیر، robots/sitemap و noindex پیش‌فرض؛ JSON-LD بدون دادهٔ خصوصی | محصول و فهرست عمومی همراه PRD-02؛ صفحهٔ خصوصی همیشه noindex |
| ابزار کیفیت | TypeScript strict، Oxfmt، Oxlint، Vitest، Playwright و hook حفظ partial staging | هر تغییر قرارداد همراه تست؛ CI مرورگر روی build تولیدی اجرا می‌شود |
| اجرا | standalone، Docker/Compose و CI موجود؛ logging بدون URL/body/token | اجرای remote CI، کانتینر، ingress، secrets و observability محیط واقعی گیت انتشارند |

## اصلاح‌های این ممیزی

- بستن مسیرهای encoded traversal، backslash و fragment در درخواست BFF؛ جلوگیری از دنبال‌کردن
  redirect. مقدارهای query مانند `q=a..b` همچنان معتبرند. این بررسی جای allowlist سرور نیست.
- اتصال QueryErrorResetBoundary به provider و retry واقعی خطای مسیر؛ تست یک query شکست‌خورده
  که با اقدام کاربر دوباره درخواست می‌دهد و recover می‌شود. جزئیات خام خطا نمایش داده نمی‌شود.
- استفاده از Loading موجود در گروه `(public)` و حفظ مقصد skip-link در error/loading.
  catch-all ناشناخته خارج این گروه است تا loading باعث پاسخ streamed 200 به‌جای 404 نشود.
- حذف مقدار بلاتکلیف allowBuilds برای بسته‌ای که در lockfile وجود ندارد؛ نصب strict-peer موفق است.
- اضافه‌شدن اجرای Playwright با `PLAYWRIGHT_SERVER_MODE=production`؛ CI بعد از build خروجی standalone و static assets را با همین
  حالت اجرا می‌کند و dev server موجود را به‌اشتباه استفاده نمی‌کند.

## گیت اجباری session، guard و logout — ابتدای PRD-01

مرجع رفتار، [PRD-01](../../product/prd/01-accounts-business-trust.md)،
[ADR-0005](../architecture/adr/0005-django-jwt-nextauth-bff.md) و
[قرارداد هویت](../api/auth-and-trust.md) است. این بخش معیار اجرای فرانت است، نه API موازی.

### مرز دسترسی

| نوع مسیر | تصمیم موردنیاز |
| --- | --- |
| عمومی | home اکنون عمومی است؛ کاتالوگ عمومی پس از PRD-02 بدون قیمت عمده در دسترس مهمان است |
| نیازمند ورود | هویت معتبر از سرور؛ کاربر واردشدهٔ بدون Business برای onboarding مجاز است |
| کسب‌وکار | عضویت، مالکیت منبع، نوع و وضعیت Business جداگانه بررسی شوند؛ صرف login کافی نیست |
| عملیات | نقش پلتفرمی مستقل از نوع Business؛ تصمیم نهایی متعلق به Django است |

کنترل معتبر در لایهٔ سرور نزدیک خواندن/نوشتن داده و در هر BFF handler لازم است؛ layout یا
proxy به‌تنهایی کافی نیست، چون navigation و cache ممکن است آن‌ها را دوباره اجرا نکنند.
لایهٔ client فقط نمایش و بازیابی session را هماهنگ می‌کند. cookie موجود یا claim قدیمی،
مجوز تازهٔ کسب‌وکار/عملیات نیست. 401 با 403 و 404 مالکیت مخلوط نشود. return URL باید
same-origin، locale-aware و اعتبارسنجی‌شده باشد؛ open redirect ممنوع است.

### خروج و Back

1. با شروع logout، UI خصوصی و شروع queryهای خصوصی متوقف شوند. درخواست‌های درحال اجرا
   cancel شوند؛ نتیجهٔ دیررس query یا mutation نباید هویت قبلی را دوباره در UI وارد کند.
2. endpoint خروج با POST و CSRF/origin معتبر، نشست Django را revoke و cookie وب را پاک کند.
   اگر revocation بک‌اند شکست خورد، محصول نباید ادعا کند نشست سرور قطعاً باطل شده است؛
   سیاست failure/retry باید در همان برش پیاده و تست شود.
3. cache خصوصی Query و وضعیت مشتق‌شده از هویت پاک شوند. Router Cache/RSC قدیمی نباید مبنای
   نمایش صفحهٔ خصوصی شود. انتقال با replace به home همان زبان انجام شود؛ کاتالوگ فقط وقتی
   مسیر واقعی آن پیاده شده است. hard navigation در این مرز یک گزینهٔ ساده برای کنارگذاشتن
   cache client است؛ جای guard سمت سرور نیست.
4. Back/Forward نباید session را زنده یا محتوای خصوصی را قابل‌استفاده کند. ورود مستقیم،
   reload، RSC/prefetch و API مستقیم نیز باید همان تصمیم سرور را بگیرند.
5. بازگشت از BFCache و فعال‌شدن tab دیگر باید session را دوباره اعتبارسنجی کند. تا روشن‌شدن
   اعتبار، محتوای خصوصی پنهان بماند؛ snapshot صفحه پیش از freeze نیز نباید مسیر نمایش
   دوبارهٔ محتوای هویت قبلی باشد. cookie HttpOnly یا `no-store` به‌تنهایی این UX را تضمین نمی‌کند.
6. logout/expiry/تعلیق در یک tab به tabهای دیگر اعلام و cache آن‌ها پاک شود؛ پیام بین tabها
   هیچ توکنی حمل نکند. هر tab همچنان به مرجع session سرور اعتماد کند.

تاریخچهٔ مرورگر را با popstate loop، disable Back یا pushState مصنوعی دست‌کاری نکنید.
هدف، رد دسترسی پس از خروج است؛ حذف URL از تمام history قابل‌اتکا یا لازم نیست.

### شرط عبور تست‌ها

- login واقعی → چند مسیر خصوصی → logout → home → Back/Forward؛ عدم نمایش دادهٔ هویت قبلی.
- همان آزمون برای direct URL، reload، prefetch و برگشت از BFCache؛ assertion صرف URL کافی نیست.
- یک tab روی صفحهٔ خصوصی و خروج از tab دیگر؛ همچنین انقضا، revoke و تعلیق از سرور.
- query و mutation دیررس پس از خروج؛ ورود کاربر B بعد از A بدون دادهٔ A.
- 401/403 و مالکیت نامعتبر در RSC، BFF و Django؛ عدم صدور HTML/RSC یا JSON خصوصی.
- CSRF، cookie flags، عدم نشت JWT به JavaScript/storage/HTML/log و callback URL نامعتبر.
- refresh هم‌زمان در چند tab و چند replica؛ refresh قدیمی طبق قرارداد خانواده را revoke
  می‌کند، بنابراین هماهنگی فقط in-memory قابل‌قبول نیست. مالک ذخیرهٔ session و الگوریتم
  single-flight/atomic update باید پیش از اولین handler احراز هویت تصمیم‌گیری و تست شوند.
- موبایل/دسکتاپ، هر دو زبان، و مرورگرهای هدف برای BFCache؛ اجرای Chromium به‌تنهایی شاهد
  رفتار Safari/Firefox نیست.

تست ساختگی با cookie غیرواقعی و صفحهٔ نمایشی محافظت‌شده، شاهد تکمیل این گیت نیست.

## ترتیب ادامه

1. بستن checkpoint فنی base با نصب، codegen drift، typecheck، lint، format، unit و build/E2E.
2. PRD-01 / برش امنیت مشترک: تصمیم session/refresh، NextAuth/BFF، guard و logout با آزمون‌های بالا.
3. سایر قابلیت‌های PRD-01، سپس PRD-02؛ queryهای دامنه و فرم‌ها با مصرف واقعی اضافه شوند.
4. گیت انتشار جدا: remote CI/کانتینر، secrets/ingress، staging، امنیت و مشاهده‌پذیری.

## منابع فنی

- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication): کنترل دسترسی نزدیک داده.
- [TanStack advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr): cache و hydration.
- [BFCache](https://web.dev/articles/bfcache): restore از حافظه و pageshow/pagehide.
- راهنمای نصب‌شدهٔ Next.js در `node_modules/next/dist/docs` برای API نسخهٔ واقعی، از جمله `retry`.
