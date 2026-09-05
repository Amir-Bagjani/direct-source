# ADR-0004: PostgreSQL به‌عنوان دیتابیس اصلی

## وضعیت

Accepted

## تاریخ

2026-09-02

## زمینه و مسئله

دادهٔ بازارگاه عمدتاً رابطه‌ای و تراکنشی است: کاربر و کسب‌وکار، محصول و تنوع، پلهٔ قیمت، سفارش و اقلام، رزرو موجودی، مرسوله، ردیف مغایرت، کارمزد و تسویه. صحت constraintها و snapshotهای سفارش از انعطاف schema مهم‌تر است.

## محرک‌های تصمیم

- ACID و کنترل رقابت برای رزرو، پرداخت و transitionها
- foreign key، check/unique constraint و indexهای ترکیبی
- پشتیبانی قوی Django ORM و migration
- queryهای گزارشی MVP و امکان JSONB محدود برای metadata
- backup، point-in-time recovery و hosting مدیریت‌شده

## گزینه‌های بررسی‌شده

### PostgreSQL

- مزایا: تراکنش و constraint قوی، indexهای متنوع، JSONB، full-text در صورت نیاز و پشتیبانی درجه‌اول Django
- معایب: نیاز به مدیریت connection، migration و query plan؛ scale نوشتن افقی ساده نیست

### MySQL/MariaDB

- مزایا: بالغ، گسترده و دارای hosting فراوان
- معایب: برای این پروژه مزیت مشخصی نسبت به PostgreSQL و تجربهٔ بومی Django/PostgreSQL اثبات نشده است

### MongoDB

- مزایا: schema منعطف برای داده‌های document-like
- معایب: روابط و تراکنش‌های این دامنه را پیچیده‌تر می‌کند و با Django ORM مسیر اصلی هم‌خوان نیست

### SQLite

- مزایا: setup محلی بسیار ساده
- معایب: رفتار concurrency و featureهای آن نمایندهٔ production نیست و برای integration test مالی مناسب نیست

## تصمیم

PostgreSQL دیتابیس اصلی همهٔ محیط‌ها به‌جز unit testهای کاملاً بدون DB خواهد بود. نسخهٔ major پس از انتخاب hosting قفل می‌شود و باید در بازهٔ پشتیبانی Django 5.2 باشد. PostgreSQL واقعی در CI برای integration test استفاده می‌شود.

## دلیل

مدل رابطه‌ای، تراکنش‌های چندرکوردی و نیاز شدید به integrity این انتخاب را طبیعی می‌کنند. یک دیتابیس واحد در MVP سازگاری و عملیات را ساده نگه می‌دارد.

## پیامدها

### مثبت

- invariantهای مهم بخشی از schema می‌شوند.
- transaction و lock برای رقابت رزرو/تسویه در دسترس‌اند.
- read modelهای اولیهٔ داشبورد بدون سامانهٔ تحلیلی جدا قابل‌ساخت‌اند.

### منفی و ریسک‌ها

- queryهای داشبورد در صورت طراحی ضعیف می‌توانند OLTP را تحت فشار قرار دهند.
- migration جدول‌های بزرگ بعداً به برنامهٔ rollout نیاز دارد.
- استفادهٔ بی‌ضابطه از JSONB می‌تواند مدل رابطه‌ای را تضعیف کند.

### اقدامات لازم

- access pattern و index در `data-dictionary.md` ثبت شود.
- query count و execution plan مسیرهای اصلی در تست performance بررسی شود.
- backup، restore و migration rollback/forward در staging تمرین شود.
- JSONB فقط برای metadata واقعاً متغیر و با schema validation استفاده شود.

## تصمیم‌های مرتبط

- ADR-0003: مونولیت ماژولار Django برای MVP
