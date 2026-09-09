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

    class Meta:
        ordering = ["name", "id"]


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
