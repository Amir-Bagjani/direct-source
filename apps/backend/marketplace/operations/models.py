from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from marketplace.common.models import BaseModel


class AuditEvent(BaseModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    action = models.CharField(max_length=80)
    aggregate_type = models.CharField(max_length=80)
    aggregate_id = models.UUIDField()
    reason = models.CharField(max_length=2000, blank=True)
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    request_id = models.CharField(max_length=36, blank=True)

    class Meta:
        indexes = [models.Index(fields=["aggregate_type", "aggregate_id", "created_at"])]


class OutboxEvent(BaseModel):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    topic = models.CharField(max_length=80)
    payload = models.JSONField(default=dict)
    delivered_at = models.DateTimeField(null=True)
    available_at = models.DateTimeField(default=timezone.now)
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(
                fields=["available_at"],
                condition=Q(delivered_at__isnull=True),
                name="outbox_pending_idx",
            )
        ]


class InboxNotification(BaseModel):
    event = models.OneToOneField(OutboxEvent, on_delete=models.PROTECT)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    topic = models.CharField(max_length=80)
    payload = models.JSONField(default=dict)

    class Meta:
        indexes = [models.Index(fields=["recipient", "created_at"])]


class StoredFile(BaseModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    business = models.ForeignKey("accounts.Business", on_delete=models.PROTECT)
    purpose = models.CharField(
        max_length=16,
        choices=[
            ("identity", "هویت"),
            ("activity", "فعالیت"),
            ("product_image", "تصویر محصول"),
            ("shipping", "مدرک حمل"),
            ("support", "پیوست پشتیبانی"),
            ("discrepancy", "مدرک مغایرت"),
        ],
    )
    object_key = models.CharField(max_length=300, unique=True)
    content_type = models.CharField(max_length=60)
    size = models.PositiveIntegerField()
    sha256 = models.CharField(max_length=64)
    scan_status = models.CharField(
        max_length=12,
        default="pending",
        choices=[("pending", "Pending"), ("clean", "Clean"), ("rejected", "Rejected")],
    )
    consent_version = models.CharField(max_length=40)
    legal_hold = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(size__gt=0, size__lte=10485760), name="stored_file_size_valid"
            ),
            models.CheckConstraint(
                condition=Q(scan_status__in=["pending", "clean", "rejected"]),
                name="stored_file_scan_valid",
            ),
        ]
