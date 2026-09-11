from django.conf import settings
from django.db import models
from django.db.models import F, Q

from marketplace.common.models import BaseModel


class CommissionRate(BaseModel):
    retailer_bps = models.PositiveIntegerField(default=200)
    manufacturer_bps = models.PositiveIntegerField(default=200)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.CharField(max_length=2000)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(retailer_bps__lte=10000, manufacturer_bps__lte=10000),
                name="finance_rate_range",
            )
        ]


class FinancialEvent(BaseModel):
    order = models.ForeignKey(
        "orders.Order", on_delete=models.PROTECT, related_name="financial_events"
    )
    kind = models.CharField(
        max_length=12, choices=[(s, s) for s in ["payment", "refund", "adjustment", "settlement"]]
    )
    idempotency_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)
    reference = models.CharField(max_length=200)
    reason = models.CharField(max_length=2000)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    execution_mode = models.CharField(max_length=12, default="simulated")
    currency = models.CharField(max_length=3, default="IRR")
    goods_irr = models.PositiveBigIntegerField()
    retailer_fee_irr = models.PositiveBigIntegerField()
    manufacturer_fee_irr = models.PositiveBigIntegerField()
    shipping_irr = models.PositiveBigIntegerField()
    total_irr = models.PositiveBigIntegerField()
    # Remaining amounts and quantities after this event, never a mutable balance.
    snapshot = models.JSONField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["order", "kind", "idempotency_key"], name="finance_command_unique"
            ),
            models.UniqueConstraint(
                fields=["order", "kind", "reference"], name="finance_cause_unique"
            ),
            models.UniqueConstraint(
                fields=["order", "kind"],
                condition=Q(kind__in=["payment", "settlement"]),
                name="finance_once_per_order",
            ),
            models.CheckConstraint(
                condition=Q(
                    kind__in=["payment", "refund", "adjustment", "settlement"],
                    currency="IRR",
                    execution_mode="simulated",
                )
                & ~Q(reference="")
                & ~Q(reason=""),
                name="finance_event_valid",
            ),
            models.CheckConstraint(
                condition=(
                    ~Q(kind="settlement")
                    & Q(total_irr=F("goods_irr") + F("retailer_fee_irr") + F("shipping_irr"))
                )
                | Q(
                    kind="settlement",
                    total_irr=F("goods_irr") - F("manufacturer_fee_irr"),
                    shipping_irr=0,
                ),
                name="finance_total_valid",
            ),
        ]


class Invoice(BaseModel):
    event = models.OneToOneField(FinancialEvent, on_delete=models.PROTECT, related_name="document")
    original = models.ForeignKey(
        "self", null=True, on_delete=models.PROTECT, related_name="adjustments"
    )
    number = models.CharField(max_length=50, unique=True)
    lines = models.JSONField()


class LedgerEntry(BaseModel):
    event = models.ForeignKey(FinancialEvent, on_delete=models.PROTECT, related_name="entries")
    account = models.CharField(
        max_length=32,
        choices=[
            (s, s)
            for s in [
                "cash",
                "producer_payable",
                "commission_reserved",
                "commission_revenue",
                "logistics",
            ]
        ],
    )
    shipping_group = models.ForeignKey(
        "logistics.ShippingGroup", null=True, on_delete=models.PROTECT
    )
    amount_irr = models.BigIntegerField()

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(account="logistics", shipping_group__isnull=False)
                | Q(
                    account__in=[
                        "cash",
                        "producer_payable",
                        "commission_reserved",
                        "commission_revenue",
                    ],
                    shipping_group__isnull=True,
                ),
                name="finance_ledger_account_valid",
            )
        ]


class FinanceHold(BaseModel):
    order = models.ForeignKey(
        "orders.Order", on_delete=models.PROTECT, related_name="finance_holds"
    )
    reference = models.CharField(max_length=200)
    kind = models.CharField(
        max_length=20, choices=[(s, s) for s in ["discrepancy", "suspension", "operational"]]
    )
    reason = models.CharField(max_length=2000)
    released_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["order", "reference"], name="finance_hold_unique")
        ]


class CompensationDecision(BaseModel):
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT)
    reference = models.CharField(max_length=200)
    source = models.CharField(
        max_length=20, choices=[(s, s) for s in ["cancellation", "discrepancy", "manual"]]
    )
    reason = models.CharField(max_length=2000)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    retained = models.JSONField()
    refunded_groups = models.JSONField(default=list)
    goods_override_irr = models.PositiveBigIntegerField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["order", "reference"], name="finance_decision_unique")
        ]
