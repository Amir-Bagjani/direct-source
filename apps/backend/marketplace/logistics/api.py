from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.accounts.permissions import require_operator
from marketplace.catalog.api import EditableViewSet
from marketplace.catalog.models import Product
from marketplace.catalog.sales_api import SelectionItem, StrictInteger

from . import services
from .models import ShippingService, Tariff


class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShippingService
        fields = ["id", "name", "kind", "is_active", "operational"]


class TariffSerializer(serializers.ModelSerializer):
    min_weight_g = StrictInteger(min_value=1, max_value=10**12)
    max_weight_g = StrictInteger(min_value=1, max_value=10**12)
    amount_irr = StrictInteger(min_value=1, max_value=10**15)

    class Meta:
        model = Tariff
        fields = [
            "id",
            "service",
            "scope",
            "origin_province",
            "destination_province",
            "origin_city",
            "destination_city",
            "min_weight_g",
            "max_weight_g",
            "amount_irr",
            "is_active",
            "activated_at",
            "activated_by",
            "replaces",
            "source",
        ]
        read_only_fields = ["is_active", "activated_at", "activated_by", "replaces", "source"]


class ServiceViewSet(EditableViewSet):
    queryset = ShippingService.objects.all()
    serializer_class = ServiceSerializer

    def perform_create(self, serializer):
        serializer.instance = services.save_service(
            actor=self.request.user, data=serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.save_service(
            actor=self.request.user, pk=serializer.instance.pk, data=serializer.validated_data
        )


class TariffViewSet(EditableViewSet):
    queryset = Tariff.objects.prefetch_related("replaces").all()
    serializer_class = TariffSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        require_operator(request.user)

    def perform_create(self, serializer):
        serializer.instance = services.save_tariff(
            actor=self.request.user, data=serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.save_tariff(
            actor=self.request.user, pk=serializer.instance.pk, data=serializer.validated_data
        )


class ActivationInput(serializers.Serializer):
    enabled = serializers.BooleanField()
    reason = serializers.CharField(max_length=2000)


class ActivationView(APIView):
    @extend_schema(request=ActivationInput, responses=TariffSerializer)
    def post(self, request, pk):
        obj = services.activate_tariff(
            actor=request.user, pk=pk, **validated(ActivationInput, request)
        )
        return Response(TariffSerializer(obj).data)


class PackageInput(serializers.Serializer):
    variant = serializers.UUIDField()
    weight_g = StrictInteger(min_value=1, max_value=10**9)
    length_mm = StrictInteger(min_value=1, max_value=10**6)
    width_mm = StrictInteger(min_value=1, max_value=10**6)
    height_mm = StrictInteger(min_value=1, max_value=10**6)
    package_count = StrictInteger(min_value=1, max_value=10**6)


class ShippingInput(serializers.Serializer):
    origin = serializers.UUIDField()
    services = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=100
    )
    packages: serializers.Field = serializers.ListSerializer(
        child=PackageInput(), allow_empty=False, max_length=1000
    )


class ProductShippingView(APIView):
    @extend_schema(responses=ShippingInput)
    def get(self, request, product_id):
        product = get_object_or_404(Product, pk=product_id, business__membership__user=request.user)
        return Response(services.shipping_data(product))

    @extend_schema(request=ShippingInput, responses=ShippingInput)
    def put(self, request, product_id):
        return Response(
            services.save_product_shipping(
                actor=request.user, product_id=product_id, data=validated(ShippingInput, request)
            )
        )


class ShippingQuoteInput(serializers.Serializer):
    service = serializers.UUIDField()
    destination_province = serializers.CharField(max_length=40)
    destination_city = serializers.CharField(max_length=100)
    items: serializers.Field = serializers.ListSerializer(
        child=SelectionItem(), allow_empty=False, max_length=1000
    )


class ShippingQuoteOutput(serializers.Serializer):
    service = serializers.UUIDField()
    service_name = serializers.CharField()
    tariff = serializers.UUIDField()
    origin_province = serializers.CharField()
    origin_city = serializers.CharField()
    destination_province = serializers.CharField()
    destination_city = serializers.CharField()
    weight_g = serializers.IntegerField()
    min_weight_g = serializers.IntegerField()
    max_weight_g = serializers.IntegerField()
    shipping_amount_irr = serializers.IntegerField()


class ShippingQuoteView(APIView):
    @extend_schema(request=ShippingQuoteInput, responses=ShippingQuoteOutput)
    def post(self, request, product_id):
        return Response(
            services.shipping_quote(
                actor=request.user,
                product_id=product_id,
                data=validated(ShippingQuoteInput, request),
            )
        )


class ProvinceOutput(serializers.Serializer):
    provinces = serializers.ListField(child=serializers.CharField())


class ProvinceView(APIView):
    @extend_schema(responses=ProvinceOutput)
    def get(self, request):
        return Response({"provinces": services.PROVINCES})
