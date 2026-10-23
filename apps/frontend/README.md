# فرانت‌اند

PRD-01 شروع شده است: ثبت‌نام عمومی در `/fa/register` و `/en/register` از BFF به Django
متصل است. ورود در `/fa/login` و `/en/login`، حساب محافظت‌شده در `/fa/account` و
`/en/account` و خروج واقعی اضافه شده‌اند؛ این تحویل تکمیل همهٔ PRD-01 نیست.
خانهٔ فارسی/انگلیسی و مودال «دربارهٔ بازارگاه» نیز در دسترس‌اند.

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
برای صفحهٔ خانه نیازی به Django یا secret نیست. ثبت‌نام به Django روی پورت 8000 نیاز دارد.
در `.env.local` مقدار `DJANGO_API_URL` را آدرس سرور بک‌اند و `NEXTAUTH_URL` را origin دقیق
مرورگر قرار دهید (پیش‌فرض توسعه `http://localhost:3000`). localhost و 127.0.0.1 دو origin
متفاوت‌اند. در production هر دو متغیر الزامی‌اند؛ secret هنوز توسط ثبت‌نام مصرف نمی‌شود.
ورود علاوه بر Django به PostgreSQL مخصوص فرانت‌اند نیاز دارد. یک دیتابیس مستقل مانند
`marketplace_web` بسازید، `FRONTEND_DATABASE_URL` را تنظیم کنید و `pnpm session:migrate`
را اجرا کنید. `NEXTAUTH_SECRET` و `SESSION_VAULT_KEY` را جداگانه با `openssl rand -hex 32`
بسازید و فقط در `.env.local` قرار دهید؛ مقدار نمونه معتبر نیست. پس از تغییر env سرور را
دوباره راه‌اندازی کنید. راهنمای [نشست وب](../../docs/technical/frontend/web-sessions.md)
قرارداد نگهداری، refresh، شکست شبکه و استقرار چند replica را شرح می‌دهد.

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
- `NEXTAUTH_SECRET`، `SESSION_VAULT_KEY` و `FRONTEND_DATABASE_URL` فقط runtime هستند؛
  هرگز secret را با build arg نفرستید. آدرس دیتابیس داخل کانتینر باید قابل‌دسترسی باشد
  (برای دیتابیس میزبان `host.docker.internal` به‌جای localhost). schema را قبل از اجرا آماده کنید.
- `FRONTEND_PORT` پورت میزبان را تغییر می‌دهد؛ URLهای سایت و NextAuth را نیز هماهنگ کنید.
- `DJANGO_API_URL` آدرس server-to-server است. داخل کانتینر، `127.0.0.1` خود فرانت‌اند است.
  پیش‌فرض Compose، `host.docker.internal:8000` است؛ روی Linux بک‌اند باید از gateway میزبان
  قابل‌دسترسی باشد، نه فقط loopback. برای بک‌اند کانتینری، شبکهٔ مشترک و نام سرویس واقعی
  را تنظیم کنید. این Compose عمداً بک‌اند را اجرا نمی‌کند؛ فعلاً فقط BFF ثبت‌نام فعال است.

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

آزمون ثبت‌نام واقعی با Django و PostgreSQL جدا:

```sh
uv sync --directory ../backend --locked --python 3.13.14
pnpm build
PLAYWRIGHT_SERVER_MODE=production pnpm test:e2e:registration
PLAYWRIGHT_SERVER_MODE=production pnpm test:e2e:accounts
```

PostgreSQL بک‌اند روی 55432 باید در دسترس باشد. تست یک دیتابیس تصادفی با پیشوند
`test_frontend_` می‌سازد و پس از پایان حذف می‌کند؛ به داده‌های سرور پورت 8000 دست نمی‌زند.
پورت‌های 8001، 3100 و 3101 باید آزاد باشند. تست‌های عادی مرورگر بدون بک‌اند اجرا می‌شوند؛ این
فرمان جدا ثبت واقعی، ورود API با حساب ساخته‌شده، نداشتن Business و رد ثبت تکراری را بررسی
می‌کند. trace/video/screenshot برای آن خاموش‌اند. خاموش‌کردن اجباری فرایند با SIGKILL ممکن
است دیتابیس موقت را باقی بگذارد. مجموعهٔ `test:e2e:accounts` با دیتابیس مستقل، ورود/خروج
واقعی، دو تب، تاریخچه، پاسخ دیررس، تغییر هویت، انقضا/تعلیق و refresh میان دو پردازش را
می‌آزماید. اجرای جداگانهٔ دو مجموعه محدودیت ثبت‌نام Django را حفظ می‌کند.
برای مرورگر دیگر پس از نصب `pnpm exec playwright install webkit firefox` از
`ACCOUNTS_BROWSER=webkit` یا `ACCOUNTS_BROWSER=firefox` استفاده کنید؛ موبایل Chrome با
`ACCOUNTS_MOBILE=true` اجرا می‌شود. هر اجرا دیتابیس موقت خودش را دارد.

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

گام بعدی PRD-01، تأیید ایمیل و بازیابی حساب و سپس onboarding کسب‌وکار است.
مجوز کسب‌وکار/عملیات با login شخصی یکی نیست و همراه قابلیت مربوط ساخته و تست می‌شود.

### Email verification and recovery

`pnpm test:e2e:recovery` uses the real Django endpoints and outbox worker with disposable
PostgreSQL and locmem mail (no external email). Run after the checkpoint build with
`PLAYWRIGHT_SERVER_MODE=production`; locally add `PLAYWRIGHT_CHANNEL=chrome` if needed.
Run a separate invocation with `RECOVERY_LOCALE=en ACCOUNTS_MOBILE=true` for English/mobile.
Each invocation gets its own database; production email throttles remain enabled.
Set backend `ACCOUNT_LINK_BASE_URL` to the frontend HTTPS `/account/confirm` URL in production.
Deploy/restart the email worker with the fragment-link change; previously issued query links
require requesting a fresh link. No extra browser cookie or dependency is used for challenges.

### Feature architecture

Before frontend changes, follow AGENTS.md and the canonical
[feature-module-design skill](.agents/skills/feature-module-design/SKILL.md).
[Ponytail](.agent/skills/ponytail/SKILL.md) is mandatory and available through the existing
`.agents` discovery symlink. See the [refactor report](../../docs/technical/frontend/feature-architecture-refactor.md)
for file ownership, consolidation decisions and verification.

`PLAYWRIGHT_SERVER_MODE=production pnpm test:e2e:business` checks both business kinds/locales,
ownership isolation, duplicate rejection and recovery from a committed write with a lost
response against isolated Django/PostgreSQL. Repeat with `ACCOUNTS_MOBILE=true` for mobile.
The initial form lives on `/fa/account` and `/en/account`; logo and draft-edit APIs are pending.

Onboarding verification: `PLAYWRIGHT_SERVER_MODE=production pnpm test:e2e:onboarding`.
Use `ONBOARDING_LOCALE=en ACCOUNTS_MOBILE=true` for English mobile. The fixture uses
isolated PostgreSQL, temporary filesystem storage and **real ClamAV** on localhost:3310;
Django validation/permissions/scanning are not mocked. Storage is removed after the run.
Backend migrations accounts/0004 and operations/0011 must be applied before serving this UI.
The existing signed download endpoint remains; the web UI streams private file bytes through
its authenticated same-origin BFF. No private files are served through Next's image optimizer.

PRD-02 verification: `pnpm test:e2e:prd02` starts isolated Django/PostgreSQL and Next.js.
First run `docker compose up -d postgres clamav catalog-media` from `apps/backend`.
The `catalog-media` profile service uses port 9002 and disposable tmpfs storage, separate
from the application's MinIO volume. Its static fixture-only KMS key enables the existing
AES256 server-side encryption; [MinIO's documented single-key setup](https://github.com/minio/minio/blob/master/docs/kms/IAM.md)
is sufficient for these diagnostic images. This does not certify a production KMS deployment.
The fixture uploads two diagnostic PNGs through real validation and ClamAV into a fresh
random bucket, refuses existing buckets and removes its bucket and database on shutdown.
The gallery journey verifies successful signed downloads and rejection of a tampered signature.
Stop the services with `docker compose stop postgres clamav catalog-media` after local checks;
do not delete the PostgreSQL or ClamAV volumes. For a phase checkpoint, build with a dedicated
`NEXT_DIST_DIR` and run the suite with the same directory and `PLAYWRIGHT_SERVER_MODE=production`.

Run `pnpm exec playwright test --config playwright.pagination.config.ts` for the isolated
26-product pagination fixture, or `--config playwright.error-recovery.config.ts` for real
public timeout/Retry recovery. Use the same production environment variables above.
The recovery config pauses only its disposable Django child and resumes it in `finally`;
do not run these configs concurrently because they use the same local ports.
