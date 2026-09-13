from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from marketplace.common.models import BaseModel


class AuditEvent(BaseModel):
    actor_role = models.CharField(max_length=20, default="system")
    command_source = models.CharField(max_length=80, default="domain")
    correlation_id = models.CharField(max_length=64, blank=True)
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
            ("review_image", "تصویر نظر"),
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
    purged_at = models.DateTimeField(null=True)

    @property
    def classification(self):
        return "restricted" if self.purpose in ["identity", "activity"] else "private"

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


class WorkItem(BaseModel):
    kind = models.CharField(max_length=24)
    target_id = models.UUIDField()
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["kind", "target_id"], name="work_target_unique")
        ]


class PolicyVersion(BaseModel):
    scope = models.CharField(max_length=20, default="deadlines")
    values = models.JSONField()
    effective_at = models.DateTimeField(default=timezone.now)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.CharField(max_length=2000)

    class Meta:
        indexes = [models.Index(fields=["effective_at", "created_at"])]


class OperationCommand(BaseModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    command_key = models.UUIDField(unique=True)
    request_hash = models.CharField(max_length=64)
    result = models.JSONField()


class Suspension(BaseModel):
    business = models.ForeignKey("accounts.Business", null=True, on_delete=models.PROTECT)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="suspensions"
    )
    proposed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="proposed_suspensions"
    )
    reason = models.CharField(max_length=2000)
    evidence = models.ManyToManyField(StoredFile)
    status = models.CharField(max_length=12, default="proposed")
    previous_status = models.CharField(max_length=20, blank=True)
    activated_at = models.DateTimeField(null=True)
    restored_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(business__isnull=False, user__isnull=True)
                | Q(business__isnull=True, user__isnull=False),
                name="suspension_one_scope",
            ),
            models.CheckConstraint(
                condition=Q(status__in=["proposed", "active", "restored", "rejected"]),
                name="suspension_status_valid",
            ),
            models.UniqueConstraint(
                fields=["business"],
                condition=Q(status__in=["proposed", "active"]),
                name="one_business_suspension",
            ),
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(status__in=["proposed", "active"]),
                name="one_user_suspension",
            ),
        ]


class OrderDisposition(BaseModel):
    suspension = models.ForeignKey(
        Suspension, on_delete=models.PROTECT, related_name="dispositions"
    )
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="dispositions")
    stage = models.CharField(max_length=12)
    decision = models.CharField(max_length=20, default="pending")
    reason = models.CharField(max_length=2000)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    decided_at = models.DateTimeField(null=True)
    financial_reference = models.UUIDField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["suspension", "order"], name="suspension_order_unique")
        ]
