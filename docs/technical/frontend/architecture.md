# معماری فرانت‌اند و مرز base

## وضعیت فعلی

base شامل Next.js App Router با React Compiler، TypeScript، next-intl، CSS منطقی،
TanStack Query provider، ابزار OpenAPI، سیاست خطای API، SEO، مودال URL‌دار و test harness است.
خانه و صفحهٔ 404 تنها صفحات فعلی هستند؛ قابلیت محصولی از ۸ PRD تکمیل‌شده محسوب نمی‌شود.

Ponytail مبناست: پوشه و abstraction برای آینده ایجاد نمی‌کنیم. NextAuth، React Hook Form
و Zod برای برش‌های بعدی نصب‌اند. فرم ورود، کاتالوگ و پنل‌های ناقص قبلی کنار گذاشته شدند.

## مرز وابستگی

routeها در `app/[locale]`، قابلیت‌ها هنگام پیاده‌سازی در `features/<domain>` و ابزارهای
مشترک در `shared` هستند. `server` سیاست‌های سرور را نگه می‌دارد. barrel ممنوع است؛ import
مستقیم فایل انجام می‌شود. Oxlint بازصادرات و چرخه‌ها و وابستگی خلاف جهت لایه‌ها را بررسی می‌کند.
ماژول‌های دارای secret حتماً `import "server-only"` دارند.

### انتخاب linter — 2026-09-16

Oxlint 1.83.0 جایگزین ESLint است. Biome 2.5.14 برای formatter/linter یکپارچه و بررسی
CSS/JSON انتخاب مناسبی است؛ در این پروژه اولویت با مهاجرت قوانین JS/TS، Next.js و React است.
Oxlint این خانوادهٔ قوانین، cycle detection و بررسی‌های React Compiler را داخلی ارائه می‌کند.
این انتخاب به معنی برابری تک‌تک قوانین ESLint/Biome/Oxlint یا بنچمارک سرعت پروژه نیست.

تنظیمات `.oxlintrc.json` و افزونهٔ کوچک محلی `tooling/architecture-plugin.mjs` مرجع‌اند.
قانون native no-barrel در Oxlint فقط export-star آستانه‌دار را پوشش می‌دهد؛ افزونهٔ محلی
تمام بازصادرات مستقیم، حتی named/type-only، را مثل تنظیم قبلی ممنوع می‌کند.
مرزها برای alias فعلی `@/` و مسیرهای relative/absolute نرمال‌شده، import معمولی، dynamic
و require بررسی می‌شوند؛ alias تازه باید هم‌زمان به قانون و تست اضافه شود.
چرخه‌ها با قانون native `import/no-cycle` بررسی می‌شوند؛ type-only cycleها مانند قبل مستثنا هستند.
API افزونهٔ JS در وضعیت alpha و بررسی‌های Compiler experimental هستند؛ pin نسخه و تست
اجرایی با نمونه‌های مجاز/غیرمجاز، شرط هر ارتقاست. Compiler خود Next.js بدون تغییر فعال می‌ماند.
قاعدهٔ `prefer-tag-over-role` خاموش است: پیام loading با `role="status"` خروجی محاسبهٔ فرم نیست.
lint فعلاً syntax-based است؛ typecheck جدا اجرا می‌شود و type-aware lint فعال نشده است.
طبق Ponytail، بستهٔ معماری جدید اضافه نشده؛ CI همان `pnpm lint` را اجرا می‌کند.
از 2026-09-17، Oxfmt 0.68.0 به درخواست کاربر فرمت‌کنندهٔ مستقل پروژه است؛ `pnpm format`
برای نوشتن و `pnpm format:check` برای بررسی محلی/CI استفاده می‌شود. خروجی‌های تولیدشده
مستثنا هستند و ترتیب importها تغییر نمی‌کند.

منابع تصمیم: [Oxlint plugins](https://oxc.rs/docs/guide/usage/linter/plugins)،
[React Compiler rules](https://oxc.rs/blog/2026-08-18-react-compiler-support)،
[JS plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins)،
[Biome](https://biomejs.dev/) و [Biome plugins](https://biomejs.dev/linter/plugins/).

## احراز هویت — دروازهٔ PRD-01، هنوز اجرا نشده

ADR-0005 مرجع است: Django صادرکنندهٔ JWT و مرجع دسترسی می‌ماند. NextAuth stable با
Credentials ورود را واگذار می‌کند. نسخهٔ beta وارد base نشده است.
JWT در session response، browser storage، HTML/RSC payload یا log قرار نمی‌گیرد.
مرورگر از BFF هم‌مبدأ استفاده می‌کند. اعتبارسنجی origin باید fail-closed باشد و مسیرهای
مجاز upstream مشخص باشند؛ پراکسی عمومی arbitrary URL ممنوع است.

قبل از فعال‌سازی login باید قرارداد refresh هم‌زمان چند tab/چند replica حل شود:
کد Django با reuse توکن قدیمی کل خانوادهٔ session را باطل می‌کند؛ قفل حافظه‌ای یک process
برای چند replica کافی نیست. cookie-only به معنی عدم دسترسی JavaScript به توکن است،
و الزام به stateless بودن coordination نیست. طراحی ذخیره/هماهنگی refresh باید در PRD-01
ثبت و با RSC، BFF، cookie write، logout و تعلیق آزموده شود.
سرور پس از 401 حداکثر یک تلاش refresh دارد؛ mutation بدون تضمین idempotency تکرار نمی‌شود.

## داده و cache

در مرورگر QueryClient پایدار است تا تعلیق اولیهٔ React آن را از بین نبرد؛ در سرور هر فراخوانی
یک نمونهٔ مستقل می‌سازد. هیچ cache خصوصی سراسری سرور یا
persist در storage نداریم. retry برای 4xx خاموش، برای خطای موقت GET یک‌بار و برای mutation خاموش است.
`staleTime=60s` و `gcTime=5m` پیش‌فرض است؛ هر feature طبق تازگی موردنیاز تنظیم می‌کند.

در PRD-01 کلید cache شامل محدودهٔ کاربر/کسب‌وکار می‌شود و با logout/تغییر session پاک می‌شود.
RSC برای هر درخواست QueryClient مستقل می‌سازد؛ prefetch/hydration فقط دادهٔ مجاز را serialize می‌کند.
OpenAPI typeها از schema موجود تولید می‌شوند؛ type تولیدشده جای runtime validation با Zod را نمی‌گیرد.

کش عمومی در PRD-02 افزوده می‌شود: taxonomy تا یک ساعت و کاتالوگ تا پنج دقیقه، با fetch بدون
credential و کلید/tag جدا. دادهٔ قیمت‌دار، سبد، سفارش و BFF `no-store` می‌مانند.
invalidation هنگام mutation کافی برای تغییرات بیرون BFF نیست؛ انتشار/حذف از بک‌اند هم باید
در قرارداد revalidation دیده شود. header سراسری Django فعلاً دست‌نخورده می‌ماند.

راهنمای اجرایی queryOptions، انتخاب transport، hydration و streaming و ممیزی پایه در
[data-fetching.md](data-fetching.md) ثبت شده است. این استاندارد قابلیت PRD تازه‌ای فعال نمی‌کند.

## زبان، SEO و انتشار

fa/rtl و en/ltr با next-intl و CSS logical properties هستند. تاریخ API همیشه UTC است؛
فارسی شمسی/تهران و انگلیسی میلادی با timezone صریح نمایش داده خواهد شد؛ تبدیل تاریخ در base
هنوز پیاده نشده است. این تغییر قبل از فرم تاریخ در ADR-0012 و ui-language ثبت می‌شود.

زبان درخواست از `next/root-params` در Next.js 16.3 خوانده می‌شود؛ APIهای قدیمی
`requestLocale` و `setRequestLocale` استفاده نمی‌شوند. locale صریحِ توابع سرور اولویت دارد
تا Route Handler/Server Action به root params وابسته نشود؛ fallback فارسی و اعتبارسنجی
locale در layout حفظ شده است. `generateStaticParams` هم حفظ می‌شود.
مرجع: [مهاجرت رسمی next-intl](https://next-intl.dev/blog/nextjs-root-params).
بررسی deprecatedها در `pnpm typecheck` با TypeScript Language Service انجام می‌شود.

canonical/hreflang هر صفحه به همان مسیر دو زبان اشاره می‌کند؛ به home ارجاع سراسری نداریم.
robots و sitemap در ریشه‌اند؛ sitemap فقط URL واقعی و منتشرشده دارد و lastModified ساختگی ندارد.
JSON-LD کاراکتر < را escape می‌کند. Product/Offer و sitemap محصولات همراه PRD-02 اضافه می‌شوند؛
قیمت عمدهٔ محافظت‌شده هرگز در structured data قرار نمی‌گیرد.
پیش‌فرض preview: noindex و sitemap خالی؛ دامنهٔ نهایی و SEO_INDEXABLE هنگام انتشار تعیین می‌شوند.
