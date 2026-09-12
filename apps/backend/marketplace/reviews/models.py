from django.conf import settings
from django.db import models
from django.db.models import F, Q

from marketplace.common.models import BaseModel

CRITERIA = {
    "product": ("quality", "conformity", "overall"),
    "manufacturer": ("packaging", "timeliness", "communication", "overall"),
    "retailer": ("communication", "coordination", "overall"),
}
ACTIONS = ("hide_content", "unhide_content", "invalidate", "revalidate", "dismiss")


class Entitlement(BaseModel):
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="entitlements")
    author = models.ForeignKey(
        "accounts.Business", on_delete=models.PROTECT, related_name="review_rights"
    )
    recipient = models.ForeignKey(
        "accounts.Business", on_delete=models.PROTECT, related_name="received_review_rights"
    )
    topic = models.CharField(max_length=16, choices=[(s, s) for s in CRITERIA])
    product = models.ForeignKey("catalog.Product", null=True, on_delete=models.PROTECT)
    variants = models.JSONField(default=list)
    deadline = models.DateTimeField()
    execution_mode = models.CharField(max_length=12)
    expired_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["order", "author", "topic", "product"],
                nulls_distinct=False,
                name="review_right_unique",
            ),
            models.CheckConstraint(
                condition=Q(topic="product", product__isnull=False)
                | Q(topic__in=["manufacturer", "retailer"], product__isnull=True),
                name="review_subject_valid",
            ),
            models.CheckConstraint(
                condition=~Q(author=F("recipient")), name="review_parties_distinct"
            ),
            models.CheckConstraint(
                condition=Q(execution_mode__in=["simulated", "live"]), name="review_mode_valid"
            ),
        ]
        indexes = [
            models.Index(
                fields=["deadline"],
                condition=Q(expired_at__isnull=True),
                name="review_deadline_idx",
            )
        ]


class Review(BaseModel):
    entitlement = models.OneToOneField(Entitlement, on_delete=models.PROTECT, related_name="review")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    scores = models.JSONField(default=dict)
    text = models.CharField(max_length=8000, blank=True)
    images = models.JSONField(default=list)
    submitted_at = models.DateTimeField(null=True)
    published_at = models.DateTimeField(null=True)
    content_hidden = models.BooleanField(default=False)
    invalidated = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(published_at__isnull=True)
                | Q(submitted_at__isnull=False, published_at__gte=F("submitted_at")),
                name="review_publish_valid",
            )
        ]


class Reply(BaseModel):
    review = models.OneToOneField(Review, on_delete=models.PROTECT, related_name="reply")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    text = models.CharField(max_length=8000)
    submitted_at = models.DateTimeField(null=True)
    content_hidden = models.BooleanField(default=False)


class ReviewImage(BaseModel):
    entitlement = models.ForeignKey(Entitlement, on_delete=models.PROTECT)
    file = models.OneToOneField(
        "operations.StoredFile", on_delete=models.PROTECT, related_name="review_scope"
    )


class Report(BaseModel):
    review = models.ForeignKey(Review, on_delete=models.PROTECT, related_name="reports")
    reply = models.ForeignKey(Reply, null=True, on_delete=models.PROTECT, related_name="reports")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.CharField(max_length=2000)
    resolved_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["review", "reply", "actor"],
                nulls_distinct=False,
                name="review_report_unique",
            )
        ]
        indexes = [models.Index(fields=["resolved_at", "created_at"])]


class ModerationAction(BaseModel):
    report = models.ForeignKey(Report, on_delete=models.PROTECT, related_name="actions")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=20, choices=[(s, s) for s in ACTIONS])
    reason = models.CharField(max_length=2000)
    before = models.JSONField()
    after = models.JSONField()
    command_key = models.UUIDField(unique=True)
    request_hash = models.CharField(max_length=64)
