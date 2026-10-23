from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from marketplace.accounts.permissions import require_operator

from . import services
from .models import Attribute, AttributeOption, Category, Product, Variant


class CategorySerializer(serializers.ModelSerializer):
    reason = serializers.CharField(required=False, write_only=True, max_length=2000)

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "slug",
            "parent",
            "description",
            "position",
            "is_active",
            "reason",
        ]


class OptionSerializer(serializers.ModelSerializer):
    reason = serializers.CharField(required=False, write_only=True, max_length=2000)

    class Meta:
        model = AttributeOption
        fields = ["id", "attribute", "code", "label", "position", "is_active", "reason"]


class AttributeSerializer(serializers.ModelSerializer):
    options = OptionSerializer(many=True, read_only=True)
    reason = serializers.CharField(required=False, write_only=True, max_length=2000)

    class Meta:
        model = Attribute
        fields = [
            "id",
            "category",
            "code",
            "name",
            "description",
            "kind",
            "scope",
            "unit",
            "required",
            "filterable",
            "position",
            "is_active",
            "options",
            "reason",
        ]


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "id",
            "business",
            "category",
            "name",
            "description",
            "brand",
            "manufacturer_model",
            "attributes",
            "images",
            "status",
            "created_at",
            "updated_at",
            "assigned_to",
            "submitted_at",
            "published_at",
            "decision_code",
            "decision_reason",
        ]
        read_only_fields = [
            "status",
            "created_at",
            "updated_at",
            "assigned_to",
            "submitted_at",
            "published_at",
            "decision_code",
            "decision_reason",
        ]


class VariantSerializer(serializers.ModelSerializer):
    effective_images = serializers.SerializerMethodField()

    def get_effective_images(self, obj) -> list[str]:
        return obj.images or obj.product.images[:1]

    class Meta:
        model = Variant
        fields = [
            "id",
            "product",
            "sku",
            "attributes",
            "images",
            "effective_images",
            "is_active",
            "disabled_code",
            "status_reason",
        ]
        read_only_fields = ["product", "is_active", "disabled_code", "status_reason"]
        validators: list = []  # The service validates the business-scoped SKU and canonical combination.


class EditableViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]


class TaxonomyViewSet(EditableViewSet):
    def get_queryset(self):
        qs = super().get_queryset()
        for field in ["category", "attribute"]:
            if field in self.request.query_params and hasattr(qs.model, field):
                value = serializers.UUIDField().run_validation(self.request.query_params[field])
                qs = qs.filter(**{field: value})
        return qs

    def create(self, request, *args, **kwargs):
        require_operator(request.user)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        require_operator(request.user)
        return super().update(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.instance = services.save_taxonomy(
            actor=self.request.user, model=self.get_queryset().model, data=serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.save_taxonomy(
            actor=self.request.user,
            model=self.get_queryset().model,
            pk=serializer.instance.pk,
            data=serializer.validated_data,
        )


class CategoryViewSet(TaxonomyViewSet):
    queryset = Category.objects.select_related("parent").all()
    serializer_class = CategorySerializer


class AttributeViewSet(TaxonomyViewSet):
    queryset = Attribute.objects.prefetch_related("options").all()
    serializer_class = AttributeSerializer


class OptionViewSet(TaxonomyViewSet):
    queryset = AttributeOption.objects.all()
    serializer_class = OptionSerializer


class ProductViewSet(EditableViewSet):
    serializer_class = ProductSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Product.objects.none()
        return Product.objects.filter(business__membership__user_id=str(self.request.user.pk))

    def perform_create(self, serializer):
        serializer.instance = services.save_product(
            actor=self.request.user, data=serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.save_product(
            actor=self.request.user, pk=serializer.instance.pk, data=serializer.validated_data
        )


class VariantViewSet(EditableViewSet):
    serializer_class = VariantSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Variant.objects.none()
        product = get_object_or_404(
            Product,
            pk=self.kwargs["product_id"],
            business__membership__user_id=str(self.request.user.pk),
        )
        return Variant.objects.filter(product=product).select_related("product")

    def perform_create(self, serializer):
        serializer.instance = services.save_variant(
            actor=self.request.user,
            product_id=self.kwargs["product_id"],
            data=serializer.validated_data,
        )

    def perform_update(self, serializer):
        serializer.instance = services.save_variant(
            actor=self.request.user,
            product_id=self.kwargs["product_id"],
            pk=serializer.instance.pk,
            data=serializer.validated_data,
        )

    def destroy(self, request, product_id, pk):
        services.delete_variant(actor=request.user, product_id=product_id, pk=pk)
        return Response(status=204)
