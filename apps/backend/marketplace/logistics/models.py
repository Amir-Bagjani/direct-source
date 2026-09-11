from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import BigIntegerRangeField
from django.db import models
from django.db.models import Q

from marketplace.common.models import BaseModel


class ShippingService(BaseModel):
    name = models.CharField(max_length=120)
    kind = models.SlugField(max_length=60)
    is_active = models.BooleanField(default=True)
    operational = models.BooleanField(default=False)
    delivery_days_min = models.PositiveIntegerField(default=1)
    delivery_days_max = models.PositiveIntegerField(default=7)
    max_weight_g = models.PositiveBigIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(delivery_days_max__gte=models.F("delivery_days_min")),
                name="service_delivery_range",
            ),
            models.CheckConstraint(
                condition=Q(max_weight_g__isnull=True) | Q(max_weight_g__gt=0),
                name="service_max_weight_positive",
            ),
        ]


class Tariff(BaseModel):
    service = models.ForeignKey(ShippingService, on_delete=models.PROTECT, related_name="tariffs")
    scope = models.CharField(
        max_length=10, choices=[("city", "شهر"), ("province", "استان"), ("national", "سراسری")]
    )
    origin_province = models.CharField(max_length=40, blank=True)
    destination_province = models.CharField(max_length=40, blank=True)
    origin_city = models.CharField(max_length=100, blank=True)
    destination_city = models.CharField(max_length=100, blank=True)
    min_weight_g = models.PositiveBigIntegerField(default=1)
    max_weight_g = models.PositiveBigIntegerField()
    amount_irr = models.PositiveBigIntegerField()
    is_active = models.BooleanField(default=False, editable=False)
    activated_at = models.DateTimeField(null=True, blank=True, editable=False)
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, editable=False
    )
    replaces = models.ManyToManyField("self", symmetrical=False, blank=True)
    source = models.CharField(max_length=24, default="manual_trial", editable=False)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            ExclusionConstraint(
                name="logistics_active_weight_excl",
                condition=Q(is_active=True),
                expressions=[
                    ("service", "="),
                    ("scope", "="),
                    ("origin_province", "="),
                    ("destination_province", "="),
                    ("origin_city", "="),
                    ("destination_city", "="),
                    (
                        models.Func(
                            models.F("min_weight_g"),
                            models.F("max_weight_g") + 1,
                            function="int8range",
                            output_field=BigIntegerRangeField(),
                        ),
                        "&&",
                    ),
                ],
            ),
            models.CheckConstraint(
                condition=Q(min_weight_g__gt=0, max_weight_g__gte=models.F("min_weight_g")),
                name="logistics_weight_valid",
            ),
            models.CheckConstraint(condition=Q(amount_irr__gt=0), name="logistics_amount_positive"),
            models.CheckConstraint(
                condition=Q(scope__in=["city", "province", "national"]),
                name="logistics_scope_valid",
            ),
            models.CheckConstraint(
                condition=Q(is_active=False)
                | Q(activated_at__isnull=False, activated_by__isnull=False),
                name="logistics_active_stamp",
            ),
        ]


class ProductShipping(BaseModel):
    product = models.OneToOneField(
        "catalog.Product", on_delete=models.CASCADE, related_name="shipping"
    )
    origin = models.ForeignKey("accounts.Address", on_delete=models.PROTECT)
    services = models.ManyToManyField(ShippingService)


class VariantPackage(BaseModel):
    variant = models.OneToOneField(
        "catalog.Variant", on_delete=models.CASCADE, related_name="package"
    )
    weight_g = models.PositiveIntegerField()
    length_mm = models.PositiveIntegerField()
    width_mm = models.PositiveIntegerField()
    height_mm = models.PositiveIntegerField()
    package_count = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(
                    weight_g__gt=0,
                    length_mm__gt=0,
                    width_mm__gt=0,
                    height_mm__gt=0,
                    package_count__gt=0,
                ),
                name="logistics_package_positive",
            )
        ]


class Carrier(BaseModel):
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=12, choices=[("person", "شخص"), ("company", "شرکت")])
    phone = models.CharField(max_length=30)
    services = models.ManyToManyField(ShippingService, related_name="carriers")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(kind__in=["person", "company"]), name="carrier_kind_valid"
            )
        ]


class ShippingGroup(BaseModel):
    order = models.ForeignKey(
        "orders.Order", on_delete=models.PROTECT, related_name="shipping_groups"
    )
    service = models.ForeignKey(ShippingService, on_delete=models.PROTECT)
    origin = models.ForeignKey("accounts.Address", on_delete=models.PROTECT)
    snapshot = models.JSONField()
    weight_g = models.PositiveBigIntegerField()
    amount_irr = models.PositiveBigIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["order", "service", "origin"], name="shipping_group_unique"
            ),
            models.CheckConstraint(
                condition=Q(weight_g__gt=0, amount_irr__gt=0), name="shipping_group_positive"
            ),
        ]


class ShippingGroupItem(BaseModel):
    group = models.ForeignKey(ShippingGroup, on_delete=models.PROTECT, related_name="items")
    line = models.OneToOneField(
        "orders.OrderLine", on_delete=models.PROTECT, related_name="shipping_item"
    )
    quantity = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gt=0), name="shipping_group_item_positive")
        ]


class ShippingRequest(BaseModel):
    class Status(models.TextChoices):
        WAITING = "waiting", "در انتظار آماده‌شدن"
        REVIEW = "spec_review", "نیازمند بررسی مشخصات"
        READY = "ready", "آمادهٔ تخصیص"
        ASSIGNED = "assigned", "تخصیص‌یافته"
        TRANSIT = "in_transit", "در حال حمل"
        ATTENTION = "attention", "نیازمند رسیدگی"
        COMPLETED = "completed", "تکمیل‌شده"
        CANCELLED = "cancelled", "لغوشده"

    group = models.OneToOneField(ShippingGroup, on_delete=models.PROTECT, related_name="request")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.WAITING)
    actual_packages = models.JSONField(default=list, blank=True)
    actual_weight_g = models.PositiveBigIntegerField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    cancellation_referred_at = models.DateTimeField(null=True, blank=True)
    cancellation_reference = models.UUIDField(null=True, blank=True)
    needs_assignment = models.BooleanField(default=False)
    hold_reason = models.CharField(max_length=2000, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "ready_at", "id"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(
                    status__in=[
                        "waiting",
                        "spec_review",
                        "ready",
                        "assigned",
                        "in_transit",
                        "attention",
                        "completed",
                        "cancelled",
                    ]
                ),
                name="shipping_request_status_valid",
            )
        ]


class CarrierAssignment(BaseModel):
    request = models.ForeignKey(
        ShippingRequest, on_delete=models.PROTECT, related_name="assignments"
    )
    carrier = models.ForeignKey(Carrier, on_delete=models.PROTECT)
    carrier_snapshot = models.JSONField()
    pickup_start = models.DateTimeField()
    pickup_end = models.DateTimeField()
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.CharField(max_length=2000)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(pickup_end__gt=models.F("pickup_start")), name="assignment_pickup_range"
            )
        ]


class Shipment(BaseModel):
    compensation = models.OneToOneField(
        "disputes.Remedy", null=True, on_delete=models.PROTECT, related_name="shipment"
    )
    purpose = models.CharField(
        max_length=12, default="order", choices=[(s, s) for s in ["order", "replacement", "return"]]
    )

    class Status(models.TextChoices):
        READY = "ready", "آمادهٔ تحویل"
        HANDED = "handed_over", "تحویل‌شده به حمل‌کننده"
        TRANSIT = "in_transit", "در مسیر"
        DELIVERED = "delivered", "تحویل‌شده"
        UNCONFIRMED = "unconfirmed", "تحویل تأییدنشده"
        FAILED = "failed", "ناموفق در تحویل"
        RETURNED = "returned", "برگشت‌خورده"
        CANCELLED = "cancelled", "لغوشده"

    request = models.ForeignKey(ShippingRequest, on_delete=models.PROTECT, related_name="shipments")
    assignment = models.ForeignKey(CarrierAssignment, on_delete=models.PROTECT)
    replaces = models.OneToOneField(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="replacement"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.READY)
    packages = models.JSONField()
    tracking_number = models.CharField(max_length=150, blank=True)
    receipt = models.ForeignKey(
        "operations.StoredFile", null=True, blank=True, on_delete=models.PROTECT
    )
    estimated_delivery_at = models.DateTimeField(null=True, blank=True)
    recipient_name = models.CharField(max_length=120, blank=True)
    recipient_phone = models.CharField(max_length=30, blank=True)
    note = models.CharField(max_length=2000, blank=True)
    handed_over_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    resolution = models.CharField(
        max_length=16,
        blank=True,
        choices=[("", ""), ("resend", "ارسال مجدد"), ("cancel_refund", "ارجاع لغو/بازپرداخت")],
    )

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["status", "created_at"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(
                    status__in=[
                        "ready",
                        "handed_over",
                        "in_transit",
                        "delivered",
                        "unconfirmed",
                        "failed",
                        "returned",
                        "cancelled",
                    ]
                ),
                name="shipment_status_valid",
            ),
            models.CheckConstraint(
                condition=~Q(status="delivered") | Q(delivered_at__isnull=False),
                name="shipment_delivery_stamp",
            ),
            models.CheckConstraint(
                condition=Q(resolution__in=["", "resend", "cancel_refund"]),
                name="shipment_resolution_valid",
            ),
        ]


class ShipmentItem(BaseModel):
    shipment = models.ForeignKey(Shipment, on_delete=models.PROTECT, related_name="items")
    group_item = models.ForeignKey(ShippingGroupItem, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["shipment", "group_item"], name="shipment_item_unique"),
            models.CheckConstraint(condition=Q(quantity__gt=0), name="shipment_item_positive"),
        ]


class FulfillmentEvent(BaseModel):
    request = models.ForeignKey(ShippingRequest, on_delete=models.PROTECT, related_name="events")
    shipment = models.ForeignKey(
        Shipment, null=True, blank=True, on_delete=models.PROTECT, related_name="events"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT
    )
    actor_kind = models.CharField(max_length=16, default="user")
    action = models.CharField(max_length=60)
    reason = models.CharField(max_length=2000, blank=True)
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    evidence = models.ForeignKey(
        "operations.StoredFile",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="fulfillment_evidence",
    )

    class Meta:
        ordering = ["created_at", "id"]


class DeliveryPolicy(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    ttl_seconds = models.PositiveIntegerField(default=600)
    max_attempts = models.PositiveIntegerField(default=5)
    cooldown_seconds = models.PositiveIntegerField(default=60)
    hourly_limit = models.PositiveIntegerField(default=5)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(
                    id=1,
                    ttl_seconds__gt=0,
                    max_attempts__gt=0,
                    cooldown_seconds__gt=0,
                    hourly_limit__gt=0,
                ),
                name="delivery_policy_valid",
            )
        ]

    def __str__(self):
        return "Delivery code policy"


class DeliveryLink(BaseModel):
    shipment = models.OneToOneField(
        Shipment, on_delete=models.PROTECT, related_name="delivery_link"
    )
    token_digest = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)


class DeliveryChallenge(BaseModel):
    shipment = models.ForeignKey(Shipment, on_delete=models.PROTECT, related_name="challenges")
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    code_digest = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["shipment", "created_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["shipment"],
                condition=Q(consumed_at__isnull=True),
                name="delivery_one_active_challenge",
            )
        ]
