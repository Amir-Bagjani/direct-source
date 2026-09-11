"""Order contract needed by fulfillment; checkout/payment commands belong to PRD-04/05."""

from django.db import models
from django.db.models import F, Q

from marketplace.common.models import BaseModel


class Cart(BaseModel):
    retailer = models.ForeignKey("accounts.Business", on_delete=models.PROTECT)
    is_active = models.BooleanField(default=True)
    destination = models.JSONField(default=dict, blank=True)
    version = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["retailer"], condition=Q(is_active=True), name="one_active_retailer_cart"
            )
        ]


class CartSelection(BaseModel):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="selections")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    selection = models.JSONField()
    # Preserve the chosen composition even when a producer replaces its sales plan.
    pack_composition = models.JSONField(default=dict, blank=True)
    service = models.ForeignKey("logistics.ShippingService", on_delete=models.PROTECT, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["cart", "product"], name="cart_product_unique")
        ]


class DeliveryAddress(BaseModel):
    retailer = models.ForeignKey("accounts.Business", on_delete=models.PROTECT)
    details = models.JSONField()


class OrderGroup(BaseModel):
    cart = models.OneToOneField(Cart, on_delete=models.PROTECT)
    retailer = models.ForeignKey("accounts.Business", on_delete=models.PROTECT)
    idempotency_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["retailer", "idempotency_key"], name="checkout_key_unique"
            )
        ]


class Order(BaseModel):
    group = models.ForeignKey(
        OrderGroup, on_delete=models.PROTECT, related_name="orders", null=True
    )
    commercial = models.JSONField(default=dict, blank=True)
    response_deadline = models.DateTimeField(null=True)
    payment_deadline = models.DateTimeField(null=True)
    decision_reason = models.CharField(max_length=2000, blank=True)
    manufacturer = models.ForeignKey(
        "accounts.Business", on_delete=models.PROTECT, related_name="sales_orders"
    )
    retailer = models.ForeignKey(
        "accounts.Business", on_delete=models.PROTECT, related_name="purchase_orders"
    )
    status = models.CharField(
        max_length=20,
        default="accepted",
        choices=[
            ("pending", "در انتظار پاسخ"),
            ("rejected", "ردشده"),
            ("expired", "منقضی‌شده"),
            ("accepted", "پذیرفته‌شده"),
            ("active", "فعال"),
            ("completed", "تکمیل‌شده"),
            ("cancelled", "لغوشده"),
        ],
    )
    destination = models.JSONField()
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_reference = models.UUIDField(null=True, blank=True, unique=True)
    preparation_started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    discrepancy_deadline = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(manufacturer=F("retailer")), name="order_parties_distinct"
            ),
            models.CheckConstraint(
                condition=Q(
                    status__in=[
                        "pending",
                        "rejected",
                        "expired",
                        "accepted",
                        "active",
                        "completed",
                        "cancelled",
                    ]
                ),
                name="order_status_valid",
            ),
            models.CheckConstraint(
                condition=~Q(status="active")
                | Q(paid_at__isnull=False, payment_reference__isnull=False),
                name="order_active_paid",
            ),
            models.CheckConstraint(
                condition=Q(
                    status="completed",
                    completed_at__isnull=False,
                    paid_at__isnull=False,
                    payment_reference__isnull=False,
                )
                | (~Q(status="completed") & Q(completed_at__isnull=True)),
                name="order_completion_valid",
            ),
            models.UniqueConstraint(
                fields=["group", "manufacturer"], name="group_manufacturer_unique"
            ),
            models.CheckConstraint(
                condition=Q(delivered_at__isnull=True, discrepancy_deadline__isnull=True)
                | Q(delivered_at__isnull=False, discrepancy_deadline__gt=F("delivered_at")),
                name="order_delivery_deadline",
            ),
        ]


class OrderLine(BaseModel):
    commercial = models.JSONField(default=dict, blank=True)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="lines")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT)
    sku = models.CharField(max_length=100)
    quantity = models.PositiveIntegerField()
    production_quantity = models.PositiveIntegerField(default=0)
    lead_time_days = models.PositiveIntegerField(default=0)
    prepared_quantity = models.PositiveIntegerField(default=0)
    preparation_note = models.CharField(max_length=2000, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["order", "variant"], name="order_variant_unique"),
            models.CheckConstraint(
                condition=Q(
                    quantity__gt=0,
                    production_quantity__lte=F("quantity"),
                    prepared_quantity__lte=F("quantity"),
                ),
                name="order_line_quantities_valid",
            ),
            models.CheckConstraint(
                condition=Q(production_quantity=0) | Q(lead_time_days__gt=0),
                name="order_production_lead_time",
            ),
        ]


class CancellationRequest(BaseModel):
    order = models.OneToOneField(Order, on_delete=models.PROTECT, related_name="cancellation")
    status = models.CharField(
        max_length=20,
        choices=[(s, s) for s in ["pending", "referred", "refund_pending", "denied", "completed"]],
    )
    reason = models.CharField(max_length=2000)
    decision_reason = models.CharField(max_length=2000, blank=True)
    deadline = models.DateTimeField(null=True)
    refund_reference = models.UUIDField(null=True, unique=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(
                    status__in=["pending", "referred", "refund_pending", "denied", "completed"]
                ),
                name="cancellation_status_valid",
            )
        ]


class Reservation(BaseModel):
    line = models.OneToOneField(OrderLine, on_delete=models.PROTECT, related_name="reservation")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT)
    ready_quantity = models.PositiveIntegerField()
    production_quantity = models.PositiveIntegerField()
    status = models.CharField(
        max_length=12,
        default="reserved",
        choices=[("reserved", "رزرو"), ("allocated", "تخصیص"), ("released", "آزاد")],
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=["reserved", "allocated", "released"]),
                name="reservation_status_valid",
            ),
            models.CheckConstraint(
                condition=Q(ready_quantity__gt=0) | Q(production_quantity__gt=0),
                name="reservation_nonempty",
            ),
        ]
