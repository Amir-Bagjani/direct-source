from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated

from . import sales_services


class StrictInteger(serializers.IntegerField):
    def to_internal_value(self, data):
        if type(data) is not int:
            self.fail("invalid")
        return super().to_internal_value(data)


class SelectionItem(serializers.Serializer):
    variant = serializers.UUIDField()
    quantity = StrictInteger(min_value=1, max_value=1_000_000_000)


class PackInput(serializers.Serializer):
    code = serializers.SlugField(max_length=60)
    name = serializers.CharField(max_length=120)
    items: serializers.Field = serializers.ListSerializer(
        child=SelectionItem(), allow_empty=False, max_length=100
    )


class OverrideInput(serializers.Serializer):
    variant = serializers.UUIDField()
    unit_price_irr = StrictInteger(min_value=1, max_value=10**15)


class TierInput(serializers.Serializer):
    min_quantity = StrictInteger(min_value=1, max_value=1_000_000_000)
    unit_price_irr = StrictInteger(min_value=1, max_value=10**15)
    overrides: serializers.Field = serializers.ListSerializer(
        child=OverrideInput(), required=False, default=list, max_length=100
    )


class SalesPlanInput(serializers.Serializer):
    free_mix_min = StrictInteger(min_value=1, max_value=1_000_000_000, allow_null=True)
    packs: serializers.Field = serializers.ListSerializer(child=PackInput(), max_length=100)
    tiers: serializers.Field = serializers.ListSerializer(
        child=TierInput(), allow_empty=False, max_length=100
    )


class SupplyInput(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["ready", "production", "hybrid"])
    ready_stock = StrictInteger(min_value=0, max_value=1_000_000_000)
    production_cap = StrictInteger(min_value=0, max_value=1_000_000_000)
    lead_time_days = StrictInteger(min_value=0, max_value=3650)


class QuoteInput(serializers.Serializer):
    method = serializers.ChoiceField(choices=["free_mix", "fixed_pack"])
    items: serializers.Field = serializers.ListSerializer(
        child=SelectionItem(), required=False, max_length=100
    )
    pack_code = serializers.SlugField(max_length=60, required=False)
    pack_count = StrictInteger(min_value=1, max_value=1_000_000_000, required=False)


class PriceCell(serializers.Serializer):
    variant = serializers.UUIDField()
    unit_price_irr = serializers.IntegerField()


class TierOutput(TierInput):
    max_quantity = serializers.IntegerField(allow_null=True)
    effective_prices = PriceCell(many=True)


class PlanOutput(SalesPlanInput):
    tiers = TierOutput(many=True)
    currency = serializers.CharField()


class QuoteLine(serializers.Serializer):
    variant = serializers.UUIDField()
    sku = serializers.CharField()
    quantity = serializers.IntegerField()
    unit_price_irr = serializers.IntegerField()
    total_irr = serializers.IntegerField()
    from_ready = serializers.IntegerField()
    from_production = serializers.IntegerField()
    lead_time_days = serializers.IntegerField()


class QuoteOutput(serializers.Serializer):
    currency = serializers.CharField()
    quantity = serializers.IntegerField()
    tier_min_quantity = serializers.IntegerField()
    goods_total_irr = serializers.IntegerField()
    lead_time_days = serializers.IntegerField()
    lines = QuoteLine(many=True)


class RetailerQuoteView(APIView):
    @extend_schema(request=QuoteInput, responses=QuoteOutput)
    def post(self, request, pk):
        return Response(
            sales_services.retailer_quote(
                actor=request.user, product_id=pk, data=validated(QuoteInput, request)
            ),
            headers={"Cache-Control": "private, no-store"},
        )


class SalesPlanView(APIView):
    @extend_schema(responses=PlanOutput)
    def get(self, request, product_id):
        return Response(sales_services.read_plan(actor=request.user, product_id=product_id))

    @extend_schema(request=SalesPlanInput, responses=PlanOutput)
    def put(self, request, product_id):
        return Response(
            sales_services.save_plan(
                actor=request.user, product_id=product_id, data=validated(SalesPlanInput, request)
            )
        )


class SupplyView(APIView):
    @extend_schema(responses=SupplyInput)
    def get(self, request, product_id, pk):
        return Response(
            sales_services.read_supply(actor=request.user, product_id=product_id, pk=pk)
        )

    @extend_schema(request=SupplyInput, responses=SupplyInput)
    def put(self, request, product_id, pk):
        return Response(
            sales_services.save_supply(
                actor=request.user,
                product_id=product_id,
                pk=pk,
                data=validated(SupplyInput, request),
            )
        )


class QuoteView(APIView):
    @extend_schema(request=QuoteInput, responses=QuoteOutput)
    def post(self, request, product_id):
        return Response(
            sales_services.quote(
                actor=request.user, product_id=product_id, data=validated(QuoteInput, request)
            )
        )
