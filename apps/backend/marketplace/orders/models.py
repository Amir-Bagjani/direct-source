"""Order contract needed by fulfillment; checkout/payment commands belong to PRD-04/05."""

from django.db import models
from django.db.models import F, Q

from marketplace.common.models import BaseModel


class Order(BaseModel):
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
            ("accepted", "پذیرفته‌شده"),
            ("active", "فعال"),
            ("cancelled", "لغوشده"),
        ],
    )
    destination = models.JSONField()
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_reference = models.UUIDField(null=True, blank=True, unique=True)
    preparation_started_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    discrepancy_deadline = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(manufacturer=F("retailer")), name="order_parties_distinct"
            ),
            models.CheckConstraint(
                condition=Q(status__in=["accepted", "active", "cancelled"]),
                name="order_status_valid",
            ),
            models.CheckConstraint(
                condition=Q(status__in=["accepted", "cancelled"])
                | Q(paid_at__isnull=False, payment_reference__isnull=False),
                name="order_active_paid",
            ),
            models.CheckConstraint(
                condition=Q(delivered_at__isnull=True, discrepancy_deadline__isnull=True)
                | Q(delivered_at__isnull=False, discrepancy_deadline__gt=F("delivered_at")),
                name="order_delivery_deadline",
            ),
        ]


class OrderLine(BaseModel):
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
