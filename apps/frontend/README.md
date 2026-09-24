# فرانت‌اند — base پروژه

فعلاً فقط زیرساخت آماده می‌شود. صفحات و جریان‌های ۸ PRD هنوز پیاده نشده‌اند.
خانهٔ فارسی/انگلیسی و مودال «دربارهٔ بازارگاه» نمونهٔ قابل‌آزمون زیرساخت‌اند.

دیزاین سیستم و UI Kit پروژه فقط shadcn/ui است: Base UI، استایل Nova و تم neutral.
از کامپوننت‌ها و variantهای رسمی استفاده کنید؛ کنترل یا استایل جایگزین با CSS اختصاصی نسازید.
راهنمای اتصال پروژه و مستندات رسمی دانلودشده در [راهنمای shadcn](../../docs/frontend/shadcn.md)
قرار دارند. skill رسمی در `.agents/skills/shadcn/SKILL.md` نصب شده است.
پیش‌فرض لایت است؛ انتخاب صریح دارک با cookie ذخیره و از سرور اعمال می‌شود.
Modal از Dialog رسمی استفاده می‌کند و قرارداد URL/History قبلی را حفظ می‌کند.

## اجرا

Node.js 24.11.1 یا بالاتر و pnpm لازم است. از همین پوشه:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

صفحهٔ اصلی: http://localhost:3000/fa و http://localhost:3000/en.
برای base نیازی به Django یا secret نیست. تنظیمات اختیاری در `.env.example` هستند.
`NEXT_PUBLIC_SITE_URL` باید دامنهٔ واقعی سایت باشد؛ `SEO_INDEXABLE` فقط هنگام انتشار عمومی true شود.

## Docker و Compose

از ریشهٔ مخزن، با Docker و Compose v2:

```sh
docker compose -f apps/frontend/compose.yaml config --quiet
docker compose -f apps/frontend/compose.yaml up --build --wait
docker compose -f apps/frontend/compose.yaml logs -f frontend
docker compose -f apps/frontend/compose.yaml down
```

این Compose اجرای **production** است، نه dev server؛ برای hot reload همان `pnpm dev`
را اجرا کنید. فرمان `up --build` یک build صریح برای اجرای کانتینری انجام می‌دهد و نباید
به hook یا پایان هر تسک اضافه شود. آدرس‌ها همان `/fa` و `/en` روی پورت 3000 هستند.
برای base فایل env، Django یا secret الزامی نیست و پیش‌فرض SEO برابر noindex است.

Dockerfile چندمرحله‌ای از Node.js 24.21.0 و نسخهٔ pnpm ثبت‌شده در `package.json` استفاده
می‌کند. نصب با frozen lockfile و cache دانلود انجام می‌شود؛ image نهایی فقط خروجی
standalone و دارایی‌های static/public را دارد. اجرا با کاربر غیر-root، healthcheck روی
`/fa` و مهلت خاموش‌شدن ۳۰ ثانیه است. Git hook داخل image نصب نمی‌شود. فایل‌های `.env`،
node_modules و build محلی از build context کنار گذاشته می‌شوند.

برای تنظیمات سفارشی، متغیرهای shell یا یک فایل env محلیِ خارج از Git استفاده کنید:

```sh
docker compose --env-file apps/frontend/.env.local -f apps/frontend/compose.yaml up --build --wait
```

Compose فایل `.env.local` را خودکار نمی‌خواند؛ در صورت استفاده از آن، `--env-file` را در
همهٔ فرمان‌ها یکسان بدهید. فقط متغیرهای مشخص‌شده در Compose وارد کانتینر می‌شوند.
از خروجی کامل `docker compose config` در log عمومی پرهیز کنید، چون ممکن است secretها را نشان دهد.

- `NEXT_PUBLIC_SITE_URL` و `SEO_INDEXABLE` هم به build و هم runtime داده می‌شوند؛ چون
  metadata، robots و sitemap فعلی پیش‌رندر می‌شوند، تغییرشان **نیازمند rebuild image** است.
  image دارای SEO فعال را به preview منتقل نکنید؛ تغییر runtime به‌تنهایی کافی نیست.
- `NEXTAUTH_SECRET` فقط runtime است؛ هرگز آن را با build arg نفرستید. احراز هویت هنوز
  در base فعال نیست و مقدار نمونهٔ secret برای استفادهٔ واقعی معتبر نیست.
- `FRONTEND_PORT` پورت میزبان را تغییر می‌دهد؛ URLهای سایت و NextAuth را نیز هماهنگ کنید.
- `DJANGO_API_URL` آدرس server-to-server است. داخل کانتینر، `127.0.0.1` خود فرانت‌اند است.
  پیش‌فرض Compose، `host.docker.internal:8000` است؛ روی Linux بک‌اند باید از gateway میزبان
  قابل‌دسترسی باشد، نه فقط loopback. برای بک‌اند کانتینری، شبکهٔ مشترک و نام سرویس واقعی
  را تنظیم کنید. این Compose عمداً بک‌اند را اجرا نمی‌کند و BFF همچنان دروازهٔ PRD-01 است.

پورت فقط روی loopback میزبان منتشر می‌شود. برای انتشار عمومی، TLS و reverse proxy با
پشتیبانی streaming را جدا تنظیم کنید؛ این فایل به‌تنهایی استقرار production را تأیید نمی‌کند.
کش Next در فایل‌سیستم همان کانتینر است و با جایگزینی آن پایدار نمی‌ماند؛ cache مشترک و
هماهنگی چند replica هنوز جزو این base نیستند.

CI اجرای image، پاسخ هر دو زبان، فایل static و پیش‌فرض noindex را smoke-test می‌کند.
بررسی سبک بدون اجرای build: `docker compose -f apps/frontend/compose.yaml config --quiet`
و `docker build --check apps/frontend` از ریشهٔ مخزن.
مرجع: [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting) و
[Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/).

## کنترل کیفیت

### پیش از commit

`pnpm install` به‌طور خودکار hook محلی Husky را نصب می‌کند؛ برای نصب مجدد `pnpm prepare`.
pre-commit با lint-staged فقط فایل‌های staged فرانت‌اند را ابتدا با Oxfmt فرمت و سپس
کد JS/TS را با Oxlint بررسی می‌کند؛ خطا یا warning مانع commit می‌شود.
اصلاحات formatter خودکار stage می‌شوند، ولی تغییرات unstaged فایل‌های partially-staged
به commit اضافه نمی‌شوند. backup/revert پیش‌فرض lint-staged فعال است؛ `git add .` در hook نداریم.
قواعد ignore ابزارها، از جمله OpenAPI تولیدشده، حفظ می‌شوند. commit صرفاً بک‌اند یا حذف فایل
نیازی به ابزار فرانت‌اند ندارد. hook هیچ build، typecheck یا تست مرورگری اجرا نمی‌کند.

نصب hook در CI/production یا با `HUSKY=0` انجام نمی‌شود؛ CI بررسی کامل format/lint را
مستقل اجرا می‌کند، چون hook محلی قابل دورزدن است. تست hook با `pnpm test:hooks` در مخزن
موقت اجرا می‌شود، نه روی index پروژه. اگر Git در IDE فرمان Node/pnpm را پیدا نکرد،
محیط version manager را طبق [راهنمای Husky](https://typicode.github.io/husky/how-to.html#node-version-managers-and-guis)
در فایل init مخصوص Husky تنظیم کنید.

### دستورها

```sh
pnpm generate:api
pnpm typecheck
pnpm format:check
pnpm lint
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

در checkpoint پایان base، تست مرورگر را روی خروجی واقعی standalone اجرا کنید:

```sh
pnpm build
PLAYWRIGHT_SERVER_MODE=production pnpm test:e2e
```

حالت production فایل‌های static/public را در خروجی تولیدشده آماده و سرور standalone را
روی پورت 3100 اجرا می‌کند؛ سرور dev موجود را استفاده نمی‌کند. CI همین حالت را اجرا می‌کند.
در صورت نیاز محلی `PLAYWRIGHT_CHANNEL=chrome` را نیز به فرمان اضافه کنید.

`pnpm build` فقط در checkpoint یک فاز، CI یا release اجرا می‌شود؛ بعد از هر تسک لازم نیست.
`pnpm typecheck` بررسی deprecated APIها را هم اجرا می‌کند؛ اجرای جداگانه با
`pnpm check:deprecations` ممکن است. این بررسی از Language Service نصب‌شده استفاده می‌کند،
نه خاموش‌کردن هشدارهای IDE؛ فایل‌های تولیدشدهٔ Next.js و OpenAPI مستثنا هستند.
React Compiler با `reactCompiler: true` پیش‌فرض فعال است.
نسخه‌های مستقیم از latest پایدار رجیستری انتخاب و همراه lockfile تثبیت می‌شوند؛ ارتقا عمدی است.

TypeScript 7 از طریق `@typescript/native` فرمان `tsc` را ارائه می‌کند. طبق
[راهنمای رسمی Microsoft](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0)،
نام `typescript` به بستهٔ سازگاری `@typescript/typescript6` اشاره می‌کند تا Next.js و ابزارهای
دارای API کامپایلر کار کنند؛ تولید OpenAPI به نسخهٔ ۵ اختصاصی خودش متصل است.
Oxlint 1.83.0 جایگزین ESLint شده است؛ تنظیمات در `.oxlintrc.json` هستند.
`pnpm lint` علاوه بر بررسی کد، تست رگرسیون قوانین معماری، React و Next.js را اجرا می‌کند.
`pnpm lint:fix` فقط اصلاحات safe لینتر را اعمال می‌کند.
فرمت‌کنندهٔ پروژه [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) با نسخهٔ قفل‌شدهٔ
0.68.0 است؛ با `pnpm format` کد فرمت می‌شود و `pnpm format:check` بدون تغییر فایل‌ها
قالب‌بندی را بررسی می‌کند. تنظیمات در `.oxfmtrc.json` هستند؛ importها مرتب‌سازی نمی‌شوند.
فایل‌های تولیدشدهٔ OpenAPI/Next.js، خروجی build و گزارش‌های تست مستثنا هستند.
افزونهٔ محلی `tooling/architecture-plugin.mjs` مرز لایه‌ها و ممنوعیت بازصادرات را حفظ می‌کند.
JS plugin API و بررسی‌های React Compiler در Oxlint هنوز experimental هستند؛ نسخه قفل شده
و ارتقا باید با `pnpm lint:checks` تأیید شود. React Compiler اصلی Next.js تغییر نکرده است.

اگر دانلود Chromium در شبکهٔ محلی ممکن نبود و Chrome نصب است:
`PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`.

build خروجی standalone نیز می‌سازد؛ Dockerfile دارایی‌های `.next/static` و `public`
را کنار آن کپی می‌کند. تأیید استقرار واقعی و staging همچنان جزو این برش نیست.
Next.js هنگام توسعه، `AGENTS.md` محلی و `CLAUDE.md` ارجاعی می‌سازد؛ قواعد اصلی
shadcn و سیاست build در AGENTS.md ریشه باقی می‌مانند.

## ادامه

- [ممیزی آمادگی base و گیت guard/logout](../../docs/technical/frontend/base-readiness.md)
- [معماری و مرز base](../../docs/technical/frontend/architecture.md)
- [راهنمای shadcn](../../docs/frontend/shadcn.md)
- [برنامهٔ تحویل PRDها](../../docs/technical/frontend/implementation-plan.md)
- [واژه‌نامه](../../CONTEXT.md) و [دستورهای عامل](../../AGENTS.md)

NextAuth پایدار نصب است؛ ورود، session، refresh، logout و BFF محافظت‌شده در PRD-01 ساخته
و با تست هم‌زمانی/CSRF تکمیل می‌شوند. هیچ endpoint احراز هویت نیمه‌فعال در base وجود ندارد.
