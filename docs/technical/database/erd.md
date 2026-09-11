# ERD منطقی
برش اجرایی PRD-05 (`finance/0001..0002`):

```mermaid
erDiagram
    Order ||--o{ FinancialEvent : finance
    FinancialEvent ||--o| Invoice : document
    Invoice o|--o{ Invoice : adjustments
    FinancialEvent ||--|{ LedgerEntry : journal
    ShippingGroup o|--o{ LedgerEntry : logistics
    Order ||--o{ CompensationDecision : valid_outcomes
    Order ||--o{ FinanceHold : holds
    User ||--o{ CommissionRate : activates
```

FinancialEvent به‌جای مدل‌های تکراری Payment/Refund/Settlement، نوع رویداد را صریح و payment/settlement را هرکدام برای Order یکتا نگه می‌دارد. Invoice برای پرداخت و هر جبران مستقل است؛ settlement صورتحساب تازه نمی‌سازد. نرخ‌ها و تصمیم‌ها مانند رویدادها append-only هستند. طرح‌های کلان قدیمی پایین این سند نام‌های پیشنهادی دارند؛ این بخش نام‌های اجرایی فعلی است.

ادامهٔ اجرایی PRD-04 (`orders/0003..0005`):

```mermaid
erDiagram
    Business ||--o{ DeliveryAddress : retailer
    Cart ||--o| OrderGroup : checkout
    OrderGroup ||--|{ Order : manufacturers
    Order ||--|{ OrderLine : snapshot
    OrderLine ||--o| Reservation : allocation
    Variant ||--o{ Reservation : capacity
    Order ||--o| CancellationRequest : cancellation
```

روابط اختیاری OrderGroup/Reservation با سفارش‌های قرارداد قدیمی PRD-03 سازگارند؛ تمام سفارش‌های checkout جدید گروه و رزرو دارند.
برش اجرایی آغاز PRD-04 (`orders/0002`):

```mermaid
erDiagram
    Business ||--o{ Cart : retailer
    Cart ||--o{ CartSelection : selections
    Product ||--o{ CartSelection : product
    ShippingService o|--o{ CartSelection : selected_service
```

قید شرطی، تنها یک Cart فعال برای هر retailer نگه می‌دارد؛ CartSelection برای cart/product یکتا است. نشانی کامل تحویل متعلق به Cart است.

UUID کلید اصلی مدل‌های دامنه است؛ ارتباط‌های این نمودار ownership را نشان می‌دهند. نمودار نخست طرح کلان است؛ بخش‌های اجرایی و migrationهای تحویل‌شده در ادامه مشخص شده‌اند.

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

ویژگی‌ها JSON معتبرشده با code هستند؛ images آرایهٔ مرتب UUID فایل خصوصی‌اند و FK ندارند. سیاست اعتبارسنجی و محدودیت‌ها در data-dictionary و قرارداد catalog-drafts آمده‌اند. مدل‌های قیمت، عرضه و ProductRevision در بخش‌های بعد اضافه شده‌اند.

## ERD اجرایی فروش و عرضه — 2026-09-08

```mermaid
erDiagram
    Product ||--o| SalesPlan : configures
    SalesPlan ||--o{ FixedPack : offers
    FixedPack ||--|{ PackItem : contains
    Variant ||--o{ PackItem : included
    SalesPlan ||--|{ PriceTier : prices
    PriceTier ||--o{ VariantPrice : overrides
    Variant ||--o{ VariantPrice : priced
    Variant ||--o| VariantSupply : supplies
```

وجود حداقل روش فروش/پله و تعلق ارجاع‌ها به همان محصول در تراکنش service کنترل می‌شود. ProductRevision و سفارش هنوز مدل اجرایی ندارند.

## ERD اجرایی حمل و انتشار اولیه — 2026-09-09

```mermaid
erDiagram
    ShippingService ||--o{ Tariff : prices
    Tariff }o--o{ Tariff : replaces
    Product ||--o| ProductShipping : ships
    Address ||--o{ ProductShipping : origin
    ProductShipping }o--o{ ShippingService : permits
    Variant ||--o| VariantPackage : packages
    User ||--o{ Product : reviews
```

در تحویل اولیهٔ این بخش، ProductRevision و Shipment وجود نداشتند؛ هر دو اکنون مدل اجرایی دارند. دادهٔ وضعیت و آخرین تصمیم انتشار روی Product و تاریخچهٔ تصمیم‌ها در AuditEvent نگهداری می‌شود.

## بازنگری اجرایی محصول — 2026-09-09

```mermaid
erDiagram
    Product ||--o{ ProductRevision : versions
    User ||--o{ ProductRevision : reviews
```

ProductRevision اکنون migration اجرایی دارد؛ proposed به تنوع‌های موجود یا شناسهٔ پیش‌اختصاص‌یافتهٔ تنوع تازه اشاره می‌کند. ردیف تنوع تازه فقط هنگام پذیرش ساخته می‌شود. Variant بایگانی‌شده با is_active=false حفظ می‌شود.

## پیشنهاد taxonomy و عملیات تکمیلی کاتالوگ — 2026-09-10

```mermaid
erDiagram
    Business ||--o{ TaxonomyProposal : proposes
    Category ||--o{ TaxonomyProposal : scopes_attribute_or_child
    Attribute ||--o{ TaxonomyProposal : scopes_option
    User ||--o{ TaxonomyProposal : reviews
    Product ||--o{ Variant : controls_status
    User ||--o{ Product : assigned_review
    User ||--o{ ProductRevision : assigned_revision
```

TaxonomyProposal برای خروجی مصوب `result_id` polymorphic نگه می‌دارد و kind نوع Category/Attribute/AttributeOption را تعیین می‌کند. پیشنهاد pending مشابه قید یکتای شرطی دارد. منشأ و دلیل وضعیت مستقل روی Variant ثبت می‌شوند؛ تاریخچهٔ کامل transition و بازتخصیص در AuditEvent است.

## مدل‌های اجرایی PRD-03 — 2026-09-10

```mermaid
erDiagram
    Order ||--|{ OrderLine : contains
    Order ||--|{ ShippingGroup : freezes
    OrderLine ||--|| ShippingGroupItem : covered_by
    ShippingGroup ||--|{ ShippingGroupItem : includes
    ShippingService ||--o{ ShippingGroup : selected
    Carrier }o--o{ ShippingService : supports
    ShippingGroup ||--o| ShippingRequest : requests_after_payment
    ShippingRequest ||--o{ CarrierAssignment : assigns
    Carrier ||--o{ CarrierAssignment : snapshots
    ShippingRequest ||--o{ Shipment : executes
    CarrierAssignment ||--o{ Shipment : coordinates
    Shipment ||--|{ ShipmentItem : allocates
    ShippingGroupItem ||--o{ ShipmentItem : distributed
    Shipment ||--o| Shipment : replaces
    ShippingRequest ||--o{ FulfillmentEvent : records
    Shipment ||--o{ FulfillmentEvent : tracks
    StoredFile ||--o{ FulfillmentEvent : evidences
    Shipment ||--o| DeliveryLink : authorizes_agent
    Shipment ||--o{ DeliveryChallenge : proves_delivery
    User ||--o{ DeliveryChallenge : receives
```

Order/OrderLine در این برش فقط هستهٔ موردنیاز حمل‌اند؛ Cart، checkout، Reservation و Payment هنوز مدل اجرایی ندارند. نام اجرایی TransportRequest در طرح کلان ShippingRequest است. [قرارداد اتصال و API](../api/fulfillment.md).