from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.catalog.sales_api import StrictInteger
from marketplace.orders.api import StrictCommand

from . import services


class PaymentInput(StrictCommand):
    idempotency_key = serializers.UUIDField()


class EventOutput(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.CharField()
    currency = serializers.CharField()
    total_irr = serializers.IntegerField()


class AmountOutput(serializers.Serializer):
    goods_irr = serializers.IntegerField()
    retailer_fee_irr = serializers.IntegerField()
    manufacturer_fee_irr = serializers.IntegerField()
    shipping_irr = serializers.IntegerField()
    total_irr = serializers.IntegerField()
    manufacturer_payable_irr = serializers.IntegerField()
    retained = serializers.DictField(child=serializers.IntegerField())
    shipping_groups = serializers.ListField(child=serializers.DictField())


class FinanceOutput(serializers.Serializer):
    order = serializers.UUIDField()
    currency = serializers.CharField()
    original = AmountOutput()
    net = AmountOutput()
    retailer_commission_bps = serializers.IntegerField()
    manufacturer_commission_bps = serializers.IntegerField()
    events = serializers.ListField(child=serializers.DictField())
    holds = serializers.ListField(child=serializers.CharField())
    commission_status = serializers.CharField()


class FinanceView(APIView):
    @extend_schema(responses=FinanceOutput)
    def get(self, request, pk):
        return Response(services.read_finance(actor=request.user, pk=pk))


class PaymentView(APIView):
    @extend_schema(request=PaymentInput, responses=EventOutput)
    def post(self, request, pk):
        return Response(
            EventOutput(
                services.pay(actor=request.user, pk=pk, **validated(PaymentInput, request))
            ).data
        )


class RateInput(StrictCommand):
    retailer_bps = StrictInteger(min_value=0, max_value=10000)
    manufacturer_bps = StrictInteger(min_value=0, max_value=10000)
    reason = serializers.CharField(max_length=2000)


class RateOutput(serializers.Serializer):
    retailer_bps = serializers.IntegerField()
    manufacturer_bps = serializers.IntegerField()


class RateView(APIView):
    @extend_schema(request=RateInput, responses=RateOutput)
    def post(self, request):
        return Response(services.change_rates(actor=request.user, **validated(RateInput, request)))


class RefundInput(PaymentInput):
    reason = serializers.CharField(max_length=2000)
    retained = serializers.DictField(child=StrictInteger(min_value=0))
    refunded_groups = serializers.ListField(child=serializers.UUIDField(), default=list)
    goods_override_irr = StrictInteger(min_value=0, required=False)


class RefundView(APIView):
    @extend_schema(request=RefundInput, responses=EventOutput)
    def post(self, request, pk):
        return Response(
            EventOutput(
                services.manual_refund(actor=request.user, pk=pk, **validated(RefundInput, request))
            ).data
        )


class SettlementInput(StrictCommand):
    reason = serializers.CharField(max_length=2000)


class SettlementView(APIView):
    @extend_schema(request=SettlementInput, responses=EventOutput)
    def post(self, request, pk):
        return Response(
            EventOutput(
                services.settle(
                    actor=request.user, order_id=pk, **validated(SettlementInput, request)
                )
            ).data
        )
