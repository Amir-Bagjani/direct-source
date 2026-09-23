# ادامهٔ مرحله‌ای فرانت‌اند

## قرارداد انجام کار

مرجع رفتار، ۸ PRD موجود است؛ PRD موازی و تکراری ایجاد نمی‌شود.
هر برش: خواندن PRD/requirement/API، ثبت معیار پذیرش UI، اجرا، تست مرتبط و به‌روزرسانی وضعیت.
هیچ PRD زیر با آماده‌شدن base تکمیل‌شده محسوب نمی‌شود.

## ترتیب پس از base

1. PRD-01: تصمیم و تست امنیت NextAuth/BFF/refresh هم‌زمان؛ سپس ورود و onboarding.
2. PRD-02: کاتالوگ عمومی، SEO محصول/تولیدکننده، queryOptions و hydration، پنل تولیدکننده.
3. PRD-04 و بخش خرید PRD-03: سبد، quote، تغییر قیمت، checkout idempotent، تصمیم سفارش.
4. PRD-03 و PRD-05: حمل، تحویل، پرداخت و صورتحساب، برگشت و تسویه مطابق زبان محصول.
5. PRD-06 و PRD-07: مغایرت/پشتیبانی، فایل خصوصی، امتیاز و نظر.
6. PRD-08: پنل عملیات، دسترسی‌ها و dashboard؛ سپس pilot و اندازه‌گیری performance.

## دروازه‌های هر برش

- CAP/ACهای PRD به صفحه و تست UI نگاشت شوند.
- فارسی/انگلیسی، موبایل/دسکتاپ، keyboard، حالت‌های loading/error/empty بررسی شوند.
- تغییر API مستلزم اصلاح سند، تست Django و تولید مجدد typeهای OpenAPI است.
- full build در checkpoint فاز/CI/release؛ برای تسک معمول تست و typecheck مرتبط کافی است.
- staging، observability، بار هم‌زمان، provider و پرداخت/ارسال واقعی با base تأیید نشده‌اند.

## شاهد checkpoint پایه — 2026-09-15

- نصب با lockfile ثابت و peer dependency check موفق.
- typecheck با TypeScript 7، lint و تولید typeهای OpenAPI موفق.
- ۷ تست واحد و ۱۰ تست مرورگر موبایل/دسکتاپ موفق؛ E2E با Chrome محلی اجرا شد.
- build production با Next.js 16.3.5 و React Compiler فعال موفق؛ /fa و /en از پیش رندر شدند.
- workflow فرانت‌اند اضافه شده است؛ اجرای remote CI و staging هنوز تأیید نشده‌اند.
- احراز هویت/refresh/BFF فعال و قابلیت‌های PRDها همچنان برش‌های بعدی‌اند.

## تکمیل ابزار base — 2026-09-16

- Oxlint 1.83.0 جایگزین ESLint و وابستگی‌های اختصاصی آن شد؛ دامنهٔ PRDها تغییر نکرد.
- نصب frozen-lockfile، peer check، typecheck، lint و ۷ تست واحد موفق بودند.
- تست رگرسیون linter شامل نمونهٔ مجاز و ۲۰ نمونهٔ خطادار برای مرزها، barrel، cycle،
  Hooks، React Compiler، Next.js و accessibility موفق بود؛ فایل تولیدشده نیز مستثنا ماند.
- build و تست مرورگر برای این تغییر ابزار اجرا نشدند؛ کد runtime تغییر نکرد.

## رفع deprecatedهای base — 2026-09-17

- پنج diagnostic مربوط به `requestLocale` و `setRequestLocale` با مهاجرت به
  `next/root-params` حذف شد؛ override صریح زبان، fallback فارسی و static params حفظ شدند.
- `pnpm check:deprecations` به typecheck/CI متصل شد؛ بدون dependency تازه و بدون suppress.
  روی ۳۵ فایل پروژه صفر هشدار داشت؛ با یک نمونهٔ موقت deprecated نیز خروج غیرصفر تأیید شد.
- format check، lint، typecheck، ۱۱ تست واحد و ۱۰ تست مرورگر موفق؛ build اجرا نشد.
