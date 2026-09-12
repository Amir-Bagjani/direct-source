from django.conf import settings
from django.db import models
from django.db.models import Q

from marketplace.common.models import BaseModel

CATEGORIES = ["account", "catalog", "order", "shipping", "technical", "reviews", "other"]
STATUSES = ["new", "in_review", "waiting_user", "resolved", "closed"]
LINK_TYPES = ["", "business", "product", "order", "shipment", "discrepancy", "review", "reply"]


class Ticket(BaseModel):
    number = models.CharField(max_length=40, unique=True)
    business = models.ForeignKey("accounts.Business", on_delete=models.PROTECT)
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="tickets"
    )
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=12, choices=[(s, s) for s in CATEGORIES])
    status = models.CharField(max_length=12, choices=[(s, s) for s in STATUSES], default="new")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.PROTECT,
        related_name="assigned_tickets",
    )
    related_type = models.CharField(max_length=12, choices=[(s, s) for s in LINK_TYPES], blank=True)
    related_id = models.UUIDField(null=True)
    order = models.ForeignKey("orders.Order", null=True, on_delete=models.PROTECT)
    case = models.OneToOneField(
        "disputes.DiscrepancyCase", null=True, on_delete=models.PROTECT, related_name="ticket"
    )
    previous = models.ForeignKey("self", null=True, on_delete=models.PROTECT)
    last_reply_at = models.DateTimeField(null=True)
    resolved_at = models.DateTimeField(null=True)
    closed_at = models.DateTimeField(null=True)
    command_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["business", "command_key"], name="support_ticket_command_unique"
            ),
            models.CheckConstraint(
                condition=Q(
                    status__in=STATUSES, category__in=CATEGORIES, related_type__in=LINK_TYPES
                ),
                name="support_ticket_valid",
            ),
            models.CheckConstraint(
                condition=Q(related_type="", related_id__isnull=True)
                | (~Q(related_type="") & Q(related_id__isnull=False)),
                name="support_link_valid",
            ),
        ]
        indexes = [models.Index(fields=["status", "created_at"])]


class TicketMessage(BaseModel):
    ticket = models.ForeignKey(Ticket, on_delete=models.PROTECT, related_name="messages")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    text = models.CharField(max_length=8000)
    files = models.ManyToManyField("operations.StoredFile", related_name="ticket_messages")
    command_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["ticket", "command_key"], name="support_message_command_unique"
            )
        ]


class AttachmentScope(BaseModel):
    file = models.OneToOneField(
        "operations.StoredFile", on_delete=models.PROTECT, related_name="support_scope"
    )
    business = models.ForeignKey("accounts.Business", on_delete=models.PROTECT)
    order = models.ForeignKey("orders.Order", null=True, on_delete=models.PROTECT)
    ticket = models.ForeignKey(Ticket, null=True, on_delete=models.PROTECT)
