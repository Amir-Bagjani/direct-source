from django.core.files.storage import default_storage
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.accounts.permissions import can_view_wholesale, has_role, require_operator
from marketplace.logistics.api import ShippingInput
from marketplace.logistics.services import shipping_data

from . import browsing
from .api import ProductSerializer, VariantSerializer
from .models import Product
from .publication import transition
from .sales_api import PackInput, PlanOutput, SupplyInput
from .sales_services import plan_data


class PublicationOutput(ProductSerializer):
    class Meta(ProductSerializer.Meta):
        fields = ProductSerializer.Meta.fields + [
            "assigned_to",
            "submitted_at",
            "published_at",
            "decision_code",
            "decision_reason",
        ]
        read_only_fields = fields


class ReviewInput(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["published", "changes_requested", "rejected"])
    code = serializers.SlugField(max_length=60)
    reason = serializers.CharField(max_length=2000)


class ReasonInput(serializers.Serializer):
    reason = serializers.CharField(max_length=2000)


class SubmitView(APIView):
    @extend_schema(request=None, responses=PublicationOutput)
    def post(self, request, pk):
        return Response(
            PublicationOutput(transition(actor=request.user, pk=pk, action="submit")).data
        )


class ClaimView(APIView):
    @extend_schema(request=None, responses=PublicationOutput)
    def post(self, request, pk):
        return Response(
            PublicationOutput(transition(actor=request.user, pk=pk, action="claim")).data
        )


class ReviewView(APIView):
    @extend_schema(request=ReviewInput, responses=PublicationOutput)
    def post(self, request, pk):
        return Response(
            PublicationOutput(
                transition(
                    actor=request.user, pk=pk, action="review", **validated(ReviewInput, request)
                )
            ).data
        )


class ReopenView(APIView):
    @extend_schema(request=ReasonInput, responses=PublicationOutput)
    def post(self, request, pk):
        return Response(
            PublicationOutput(
                transition(
                    actor=request.user, pk=pk, action="reopen", **validated(ReasonInput, request)
                )
            ).data
        )


class DeactivateView(APIView):
    @extend_schema(request=ReasonInput, responses=PublicationOutput)
    def post(self, request, pk):
        return Response(
            PublicationOutput(
                transition(
                    actor=request.user,
                    pk=pk,
                    action="deactivate",
                    **validated(ReasonInput, request),
                )
            ).data
        )


class ActivateView(APIView):
    @extend_schema(request=ReasonInput, responses=PublicationOutput)
    def post(self, request, pk):
        return Response(
            PublicationOutput(
                transition(
                    actor=request.user, pk=pk, action="activate", **validated(ReasonInput, request)
                )
            ).data
        )


class ProductQueueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "name", "business", "status", "assigned_to", "submitted_at"]


class QueueView(generics.ListAPIView):
    serializer_class = ProductQueueSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Product.objects.none()
        require_operator(self.request.user)
        return Product.objects.filter(status="pending").order_by("submitted_at", "id")


class SupplyDetail(SupplyInput):
    variant = serializers.UUIDField()


class ReviewDetailOutput(serializers.Serializer):
    product = PublicationOutput()
    variants = VariantSerializer(many=True)
    sales_plan = PlanOutput(allow_null=True)
    shipping = ShippingInput(allow_null=True)
    supplies = SupplyDetail(many=True)


class ReviewDetailView(APIView):
    @extend_schema(responses=ReviewDetailOutput)
    def get(self, request, pk):
        require_operator(request.user)
        qs = Product.objects.all()
        if not has_role(request.user, "owner"):
            qs = qs.filter(assigned_to_id=request.user.pk)
        product = get_object_or_404(qs, pk=pk)
        variants = list(product.variants.select_related("product", "supply"))
        plan = getattr(product, "sales_plan", None)
        return Response(
            {
                "product": PublicationOutput(product).data,
                "variants": VariantSerializer(variants, many=True).data,
                "sales_plan": plan_data(plan, {v.pk: v.sku for v in variants}) if plan else None,
                "shipping": shipping_data(product) if hasattr(product, "shipping") else None,
                "supplies": [
                    {
                        "variant": str(v.pk),
                        **{
                            key: getattr(v.supply, key)
                            for key in ["mode", "ready_stock", "production_cap", "lead_time_days"]
                        },
                    }
                    for v in variants
                    if hasattr(v, "supply")
                ],
            }
        )


class PublicVariantSummary(serializers.Serializer):
    id = serializers.UUIDField()
    sku = serializers.CharField()
    attributes = serializers.DictField()
    image_urls = serializers.ListField(child=serializers.URLField())
    orderable = serializers.BooleanField()
    supply = SupplyInput(allow_null=True)


class CategoryPathOutput(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()


class ManufacturerOutput(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    description = serializers.CharField()
    verified = serializers.BooleanField()
    province = serializers.CharField(allow_null=True)
    city = serializers.CharField(allow_null=True)
    joined_at = serializers.DateTimeField(allow_null=True)


class RatingOutput(serializers.Serializer):
    average = serializers.FloatField(allow_null=True)
    count = serializers.IntegerField()


class PublicManufacturerSerializer(ManufacturerOutput):
    logo_url = serializers.URLField(allow_null=True)
    rating = RatingOutput()
    product_count = serializers.IntegerField()
    categories = CategoryPathOutput(many=True)


class PublicShippingOutput(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    kind = serializers.CharField()


class PublicProductSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    business = serializers.UUIDField()
    category = serializers.UUIDField()
    name = serializers.CharField()
    description = serializers.CharField()
    brand = serializers.CharField()
    manufacturer_model = serializers.CharField()
    attributes = serializers.DictField()
    image_urls = serializers.ListField(child=serializers.URLField())
    wholesale = PlanOutput(required=False)
    representative_price_irr = serializers.IntegerField(required=False, allow_null=True)
    price_access_message = serializers.CharField(required=False)
    variants = PublicVariantSummary(many=True)
    published_at = serializers.DateTimeField()
    category_path = CategoryPathOutput(many=True)
    manufacturer = ManufacturerOutput()
    rating = RatingOutput()
    shipping_services = PublicShippingOutput(many=True)
    orderable = serializers.BooleanField()
    lead_time_days = serializers.IntegerField(allow_null=True)
    supply_modes = serializers.ListField(child=serializers.CharField())
    sale_methods = serializers.ListField(child=serializers.CharField())
    minimum_order = serializers.IntegerField(allow_null=True)
    free_mix_min = serializers.IntegerField(allow_null=True)
    packs = PackInput(many=True)

    def to_representation(self, instance):
        wholesale = False
        if isinstance(instance, Product):
            request = self.context.get("request")
            wholesale = bool(request and can_view_wholesale(request.user))
            categories = self.context.get("categories")
            if categories is None:
                categories, _ = browsing.taxonomy()
            if not hasattr(instance, "public_variants"):
                instance = browsing.public_queryset().get(pk=instance.pk)
            instance = browsing.public_data(
                instance,
                wholesale,
                categories,
                default_storage,
            )
        representation = super().to_representation(instance)
        if not wholesale:
            representation.pop("wholesale", None)
            representation.pop("representative_price_irr", None)
        return representation


class PublicProductList(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicProductSerializer
    pagination_class = browsing.CatalogPagination

    @extend_schema(parameters=[browsing.BrowseInput])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Product.objects.none()
        products, self.categories = browsing.browse(self.request)
        return products

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "categories": self.categories}


class PublicProductDetail(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicProductSerializer
    queryset = browsing.public_queryset()


class PublicManufacturerDetail(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicManufacturerSerializer
    queryset = browsing.public_manufacturer_queryset()

    def get_object(self):
        return browsing.manufacturer_data(super().get_object())
