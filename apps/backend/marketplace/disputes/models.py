from django.conf import settings
from django.db import models
from django.db.models import Q

from marketplace.common.models import BaseModel


class DiscrepancyCase(BaseModel):
    order = models.OneToOneField(
        "orders.Order", on_delete=models.PROTECT, related_name="discrepancy"
    )
    closed_at = models.DateTimeField(null=True)


class DiscrepancyLine(BaseModel):
    case = models.ForeignKey(DiscrepancyCase, on_delete=models.PROTECT, related_name="lines")
    line = models.ForeignKey("orders.OrderLine", on_delete=models.PROTECT)
    shipment = models.ForeignKey("logistics.Shipment", on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    kind = models.CharField(
        max_length=20, choices=[(s, s) for s in ["shortage", "wrong_item", "damaged", "defective"]]
    )
    description = models.CharField(max_length=4000)
    evidence = models.ManyToManyField("operations.StoredFile", related_name="discrepancy_lines")
    response_deadline = models.DateTimeField()
    command_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)
    referred_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["case", "command_key"], name="dispute_line_command_unique"
            ),
            models.CheckConstraint(
                condition=Q(
                    quantity__gt=0, kind__in=["shortage", "wrong_item", "damaged", "defective"]
                ),
                name="dispute_line_valid",
            ),
        ]


class DisputeDecision(BaseModel):
    claim = models.ForeignKey(DiscrepancyLine, on_delete=models.PROTECT, related_name="decisions")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    source = models.CharField(
        max_length=12, choices=[("manufacturer", "manufacturer"), ("operator", "operator")]
    )
    accepted = models.PositiveIntegerField()
    rejected = models.PositiveIntegerField()
    remedy = models.CharField(
        max_length=12, choices=[(s, s) for s in ["none", "refund", "replacement", "return"]]
    )
    reason = models.CharField(max_length=4000)
    evidence = models.ManyToManyField("operations.StoredFile", related_name="dispute_decisions")
    command_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["claim", "command_key"], name="dispute_decision_command_unique"
            ),
            models.UniqueConstraint(
                fields=["claim"],
                condition=Q(source="manufacturer"),
                name="dispute_one_manufacturer_response",
            ),
            models.CheckConstraint(
                condition=(Q(accepted__gt=0) | Q(rejected__gt=0))
                & Q(source__in=["manufacturer", "operator"]),
                name="dispute_decision_nonempty",
            ),
            models.CheckConstraint(
                condition=Q(accepted=0, remedy="none")
                | Q(accepted__gt=0, remedy__in=["refund", "replacement", "return"]),
                name="dispute_remedy_valid",
            ),
            models.CheckConstraint(
                condition=~Q(source="manufacturer") | Q(remedy__in=["none", "refund"]),
                name="dispute_manufacturer_refund_only",
            ),
        ]


class Remedy(BaseModel):
    decision = models.OneToOneField(
        DisputeDecision, on_delete=models.PROTECT, related_name="action"
    )
    completed_at = models.DateTimeField(null=True)
    waived_at = models.DateTimeField(null=True)
    waiver_reason = models.CharField(max_length=4000, blank=True)
    financial_event = models.OneToOneField(
        "finance.FinancialEvent", null=True, on_delete=models.PROTECT
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(completed_at__isnull=False, waived_at__isnull=False),
                name="dispute_remedy_one_outcome",
            )
        ]


class CaseNote(BaseModel):
    case = models.ForeignKey(DiscrepancyCase, on_delete=models.PROTECT, related_name="notes")
    claim = models.ForeignKey(DiscrepancyLine, null=True, on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    text = models.CharField(max_length=4000)
    evidence = models.ManyToManyField("operations.StoredFile", related_name="case_notes")
