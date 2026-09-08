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

    class Meta:
        ordering = ["-created_at", "id"]
        constraints = [
            models.CheckConstraint(condition=Q(status="draft"), name="catalog_product_draft_only")
        ]


class Variant(BaseModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    business = models.ForeignKey("accounts.Business", on_delete=models.PROTECT)
    sku = models.CharField(max_length=100)
    attributes = models.JSONField(default=dict, blank=True)
    combination = models.CharField(max_length=64, editable=False)
    images = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["business", "sku"], name="catalog_sku_business_unique"),
            models.UniqueConstraint(
                fields=["product", "combination"], name="catalog_variant_combination_unique"
            ),
        ]
