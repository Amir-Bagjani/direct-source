from django.db import models
from django.db.models import Q

from marketplace.common.models import BaseModel


class Category(BaseModel):
    name = models.CharField(max_length=120)
    slug = models.SlugField(unique=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="children"
    )
    description = models.CharField(max_length=1000, blank=True)
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "slug"]


class Attribute(BaseModel):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="attributes")
    code = models.SlugField()
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=1000, blank=True)
    kind = models.CharField(
        max_length=8, choices=[("choice", "فهرست"), ("number", "عدد"), ("text", "متن")]
    )
    scope = models.CharField(max_length=8, choices=[("product", "محصول"), ("variant", "تنوع")])
    unit = models.CharField(max_length=40, blank=True)
    required = models.BooleanField(default=True)
    filterable = models.BooleanField(default=False)
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "code"]
        constraints = [
            models.UniqueConstraint(
                fields=["category", "code"], name="catalog_attribute_code_unique"
            ),
            models.CheckConstraint(
                condition=Q(kind__in=["choice", "number", "text"]),
                name="catalog_attribute_kind_valid",
            ),
            models.CheckConstraint(
                condition=Q(scope__in=["product", "variant"]), name="catalog_attribute_scope_valid"
            ),
        ]


class AttributeOption(BaseModel):
    attribute = models.ForeignKey(Attribute, on_delete=models.PROTECT, related_name="options")
    code = models.SlugField()
    label = models.CharField(max_length=120)
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "code"]
        constraints = [
            models.UniqueConstraint(fields=["attribute", "code"], name="catalog_option_code_unique")
        ]


class Product(BaseModel):
    business = models.ForeignKey(
        "accounts.Business", on_delete=models.PROTECT, related_name="products"
    )
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    name = models.CharField(max_length=200)
    description = models.CharField(max_length=5000)
    brand = models.CharField(max_length=120, blank=True)
    manufacturer_model = models.CharField(max_length=120, blank=True)
    attributes = models.JSONField(default=dict, blank=True)
    # Ordered file IDs: first entry is the main image. Always private in this slice.
    images = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=24, default="draft", editable=False)
    assigned_to = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="product_reviews",
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    decision_code = models.CharField(max_length=60, blank=True)
    decision_reason = models.CharField(max_length=2000, blank=True)

    class Meta:
        ordering = ["-created_at", "id"]
        indexes = [models.Index(fields=["status", "-published_at"], name="catalog_public_feed_idx")]
        constraints = [
            models.CheckConstraint(
                condition=Q(
                    status__in=[
                        "draft",
                        "pending",
                        "changes_requested",
                        "published",
                        "rejected",
                        "inactive",
                    ]
                ),
                name="catalog_product_status_valid",
            )
        ]


class Variant(BaseModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    business = models.ForeignKey("accounts.Business", on_delete=models.PROTECT)
    is_active = models.BooleanField(default=True)
    disabled_code = models.CharField(max_length=30, blank=True)
    status_reason = models.CharField(max_length=2000, blank=True)
    sku = models.CharField(max_length=100)
    attributes = models.JSONField(default=dict, blank=True)
    combination = models.CharField(max_length=64, editable=False)
    images = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["business", "sku"], name="catalog_sku_business_unique"),
            models.UniqueConstraint(
                fields=["product", "combination"],
                condition=Q(is_active=True),
                name="catalog_active_combination_unique",
            ),
            models.CheckConstraint(
                condition=(
                    Q(is_active=True, disabled_code="")
                    | Q(
                        is_active=False,
                        disabled_code__in=[
                            "producer_disabled",
                            "operator_disabled",
                            "revision_removed",
                        ],
                    )
                ),
                name="catalog_variant_disabled_source",
            ),
        ]


class SalesPlan(BaseModel):
    product = models.OneToOneField(Product, on_delete=models.CASCADE, related_name="sales_plan")
    free_mix_min = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(free_mix_min__isnull=True) | Q(free_mix_min__gt=0),
                name="sales_mix_min_positive",
            )
        ]


class FixedPack(BaseModel):
    plan = models.ForeignKey(SalesPlan, on_delete=models.CASCADE, related_name="packs")
    code = models.SlugField(max_length=60)
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(fields=["plan", "code"], name="sales_pack_code_unique")
        ]


class PackItem(BaseModel):
    pack = models.ForeignKey(FixedPack, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey(Variant, on_delete=models.PROTECT, related_name="pack_items")
    quantity = models.PositiveIntegerField()

    class Meta:
        ordering = ["variant_id"]
        constraints = [
            models.UniqueConstraint(fields=["pack", "variant"], name="sales_pack_variant_unique"),
            models.CheckConstraint(condition=Q(quantity__gt=0), name="sales_pack_qty_positive"),
        ]


class PriceTier(BaseModel):
    plan = models.ForeignKey(SalesPlan, on_delete=models.CASCADE, related_name="tiers")
    # Each tier ends just before the next minimum; the last is unbounded.
    min_quantity = models.PositiveIntegerField()
    unit_price_irr = models.PositiveBigIntegerField()

    class Meta:
        ordering = ["min_quantity"]
        constraints = [
            models.UniqueConstraint(fields=["plan", "min_quantity"], name="sales_tier_min_unique"),
            models.CheckConstraint(condition=Q(min_quantity__gt=0), name="sales_tier_min_positive"),
            models.CheckConstraint(
                condition=Q(unit_price_irr__gt=0), name="sales_tier_price_positive"
            ),
        ]


class VariantPrice(BaseModel):
    tier = models.ForeignKey(PriceTier, on_delete=models.CASCADE, related_name="overrides")
    variant = models.ForeignKey(Variant, on_delete=models.PROTECT, related_name="price_overrides")
    unit_price_irr = models.PositiveBigIntegerField()

    class Meta:
        ordering = ["variant_id"]
        constraints = [
            models.UniqueConstraint(fields=["tier", "variant"], name="sales_override_unique"),
            models.CheckConstraint(
                condition=Q(unit_price_irr__gt=0), name="sales_override_price_positive"
            ),
        ]


class VariantSupply(BaseModel):
    variant = models.OneToOneField(Variant, on_delete=models.CASCADE, related_name="supply")
    mode = models.CharField(
        max_length=10, choices=[("ready", "آماده"), ("production", "تولیدی"), ("hybrid", "ترکیبی")]
    )
    ready_stock = models.PositiveIntegerField(default=0)
    production_cap = models.PositiveIntegerField(default=0)
    lead_time_days = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(mode="ready", production_cap=0, lead_time_days=0)
                    | Q(
                        mode="production", ready_stock=0, production_cap__gt=0, lead_time_days__gt=0
                    )
                    | Q(mode="hybrid", production_cap__gt=0, lead_time_days__gt=0)
                ),
                name="sales_supply_mode_consistent",
            )
        ]


class ProductRevision(BaseModel):
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="revisions")
    status = models.CharField(max_length=20, default="draft")
    before = models.JSONField()
    proposed = models.JSONField()
    assigned_to = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="catalog_revisions",
    )
    reason = models.CharField(max_length=2000, blank=True)
    code = models.CharField(max_length=60, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["product"],
                condition=Q(status__in=["draft", "pending", "changes_requested"]),
                name="catalog_one_open_revision",
            ),
            models.CheckConstraint(
                condition=Q(
                    status__in=[
                        "draft",
                        "pending",
                        "changes_requested",
                        "approved",
                        "rejected",
                        "cancelled",
                    ]
                ),
                name="catalog_revision_status_valid",
            ),
        ]


class TaxonomyProposal(BaseModel):
    business = models.ForeignKey("accounts.Business", on_delete=models.PROTECT)
    kind = models.CharField(
        max_length=10, choices=[("category", "دسته"), ("attribute", "ویژگی"), ("option", "مقدار")]
    )
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.PROTECT)
    attribute = models.ForeignKey(Attribute, null=True, blank=True, on_delete=models.PROTECT)
    scope_key = models.CharField(max_length=36, default="root")
    name = models.CharField(max_length=120)
    normalized_name = models.CharField(max_length=120)
    description = models.CharField(max_length=1000)
    example = models.CharField(max_length=1000)
    status = models.CharField(max_length=10, default="pending")
    reason = models.CharField(max_length=2000, blank=True)
    reviewed_by = models.ForeignKey("accounts.User", null=True, on_delete=models.PROTECT)
    result_id = models.UUIDField(null=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["status", "created_at"], name="catalog_proposal_queue_idx")]
        constraints = [
            models.UniqueConstraint(
                fields=["kind", "scope_key", "normalized_name"],
                condition=Q(status="pending"),
                name="catalog_open_proposal_unique",
            ),
            models.CheckConstraint(
                condition=Q(status__in=["pending", "approved", "rejected"]),
                name="catalog_proposal_status_valid",
            ),
            models.CheckConstraint(
                condition=(
                    Q(kind="category", attribute__isnull=True)
                    | Q(kind="attribute", category__isnull=False, attribute__isnull=True)
                    | Q(kind="option", category__isnull=True, attribute__isnull=False)
                ),
                name="catalog_proposal_scope_valid",
            ),
            models.CheckConstraint(
                condition=(
                    Q(
                        status="pending",
                        reason="",
                        reviewed_by__isnull=True,
                        result_id__isnull=True,
                    )
                    | Q(
                        status="approved",
                        reviewed_by__isnull=False,
                        result_id__isnull=False,
                    )
                    & ~Q(reason="")
                    | Q(
                        status="rejected",
                        reviewed_by__isnull=False,
                        result_id__isnull=True,
                    )
                    & ~Q(reason="")
                ),
                name="catalog_proposal_decision_valid",
            ),
        ]
