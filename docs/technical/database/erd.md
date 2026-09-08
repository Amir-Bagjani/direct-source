# ERD منطقی

UUID کلید اصلی مدل‌های دامنه است؛ ارتباط‌های این نمودار ownership را نشان می‌دهند. جدول‌های ماژول‌های تجاری هنوز migration ندارند.

```mermaid
erDiagram
    User ||--o| Membership : owns
    Business ||--|| Membership : has_owner
    User ||--o{ PlatformRole : has
    User ||--o{ AuthSession : opens
    User ||--o{ EmailChallenge : requests
    Business ||--o{ Address : has
    Business ||--o| VerificationApplication : submits
    Business ||--o{ BusinessRevision : revises
    VerificationApplication ||--|{ VerificationSection : contains
    VerificationSection ||--o{ Evidence : contains
    StoredFile ||--o{ Evidence : documents
    User ||--o{ StoredFile : uploads
    Business ||--o{ Product : produces
    Category ||--o{ Product : classifies
    Product ||--|{ ProductRevision : versions
    Product ||--|{ Variant : has
    Product ||--o{ PriceTier : prices
    Variant ||--|| Supply : offers
    Supply ||--o{ Reservation : reserves
    Business ||--o| Cart : shops
    Cart ||--o{ CartProductSelection : selects
    Business ||--o{ OrderGroup : places
    OrderGroup ||--|{ Order : groups
    Order ||--|{ OrderLine : snapshots
    OrderLine ||--o{ Reservation : allocates
    Order ||--o| Payment : pays
    Payment ||--|| Invoice : issues
    Invoice ||--o{ Adjustment : adjusts
    Order ||--o{ Refund : refunds
    Order ||--o| Settlement : settles
    Order ||--o{ SettlementHold : blocks
    ShippingService ||--o{ TariffVersion : rates
    TariffVersion ||--|{ TariffRow : contains
    Order ||--|{ ShippingGroup : ships
    ShippingGroup ||--o| TransportRequest : requests
    Carrier ||--o{ TransportRequest : assigned
    ShippingGroup ||--o{ Shipment : executes
    Shipment ||--|{ ShipmentItem : allocates
    OrderLine ||--o{ ShipmentItem : includes
    Shipment ||--o{ DeliveryChallenge : proves
    Order ||--o{ DiscrepancyCase : disputes
    DiscrepancyCase ||--|{ DiscrepancyLine : claims
    DiscrepancyLine ||--o{ Resolution : resolves
    Resolution ||--o{ Compensation : executes
    User ||--o{ Ticket : creates
    Ticket ||--o{ Message : contains
    Order ||--o{ Entitlement : grants
    Entitlement ||--o| Review : uses
    Review ||--o| Reply : answers
    Review ||--o{ ModerationAction : moderates
    User ||--o{ AuditEvent : acts
    User ||--o{ WorkItem : claims
    OutboxEvent ||--o| InboxNotification : delivers
```

FKها پیش‌فرض `PROTECT` برای سابقهٔ دامنه‌اند. حذف User/Business از API وجود ندارد. حذف session/OTP صرفاً طبق سیاست retention جداگانه و بدون حذف audit انجام می‌شود. مرجع عمومی audit/outbox از نوع `(aggregate_type, aggregate_id)` است و جای FK برای دادهٔ مالی را نمی‌گیرد.

Constraintهای دقیق و indexهای اولین migration در [فرهنگ داده](data-dictionary.md) تعریف شده‌اند. برای ماژول‌های بعدی، constraintهای جمع چند ردیف با lock aggregate و تست رقابت اعمال می‌شوند؛ `CHECK` عادی نمی‌تواند مجموع جدول دیگر را enforce کند.

## ERD اجرایی هستهٔ پیش‌نویس کاتالوگ — 2026-09-08

نمودار کلان بالاتر شامل ماژول‌های آینده است؛ روابط واقعاً ایجادشدهٔ این برش:

```mermaid
erDiagram
    Category ||--o{ Category : parent
    Category ||--o{ Attribute : defines
    Attribute ||--o{ AttributeOption : permits
    Category ||--o{ Product : classifies
    Business ||--o{ Product : owns
    Product ||--o{ Variant : contains
    Business ||--o{ Variant : scopes_sku
```

ویژگی‌ها JSON معتبرشده با code هستند؛ images آرایهٔ مرتب UUID فایل خصوصی‌اند و FK ندارند. سیاست اعتبارسنجی و محدودیت‌ها در data-dictionary و قرارداد catalog-drafts آمده‌اند. ProductRevision، قیمت و عرضه هنوز migration اجرایی ندارند.
