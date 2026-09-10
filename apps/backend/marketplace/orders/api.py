from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.catalog.sales_api import QuoteInput

from . import cancellation, cart, checkout, lifecycle


class CartSelectionInput(QuoteInput):
    confirm_method_change = serializers.BooleanField(default=False)


class DestinationInput(serializers.Serializer):
    province = serializers.CharField(max_length=100)
    city = serializers.CharField(max_length=100)
    address = serializers.CharField(max_length=1000)
    postal_code = serializers.RegexField(r"^[0-9]{10}$")
    recipient_name = serializers.CharField(max_length=200)
    recipient_mobile = serializers.RegexField(r"^09[0-9]{9}$")


class CartShippingInput(serializers.Serializer):
    service = serializers.UUIDField()


class CartOutput(serializers.Serializer):
    id = serializers.UUIDField()
    version = serializers.IntegerField()
    destination = serializers.JSONField()
    products = serializers.ListField(child=serializers.DictField())


class CartPreviewOutput(CartOutput):
    currency = serializers.CharField()
    valid = serializers.BooleanField()
    issues = serializers.ListField(child=serializers.DictField())
    manufacturers = serializers.ListField(child=serializers.DictField())
    shipping_groups = serializers.ListField(child=serializers.DictField())
    goods_total_irr = serializers.IntegerField(allow_null=True)
    shipping_amount_irr = serializers.IntegerField(allow_null=True)
    retailer_commission_irr = serializers.IntegerField(allow_null=True)
    payable_total_irr = serializers.IntegerField(allow_null=True)
    quote_fingerprint = serializers.CharField()


class CartView(APIView):
    @extend_schema(responses=CartOutput)
    def get(self, request):
        return Response(cart.read_cart(actor=request.user))


class CartProductView(APIView):
    @extend_schema(request=CartSelectionInput, responses=CartOutput)
    def post(self, request, product_id):
        return Response(
            cart.select_product(
                actor=request.user,
                product_id=product_id,
                data=validated(CartSelectionInput, request),
                add=True,
            )
        )

    @extend_schema(request=CartSelectionInput, responses=CartOutput)
    def put(self, request, product_id):
        return Response(
            cart.select_product(
                actor=request.user,
                product_id=product_id,
                data=validated(CartSelectionInput, request),
                add=False,
            )
        )

    @extend_schema(responses=CartOutput)
    def delete(self, request, product_id):
        return Response(cart.remove_product(actor=request.user, product_id=product_id))


class CartDestinationView(APIView):
    @extend_schema(request=DestinationInput, responses=CartOutput)
    def put(self, request):
        return Response(
            cart.set_destination(actor=request.user, data=validated(DestinationInput, request))
        )


class CartShippingView(APIView):
    @extend_schema(request=CartShippingInput, responses=CartOutput)
    def put(self, request, product_id):
        return Response(
            cart.set_shipping(
                actor=request.user,
                product_id=product_id,
                service_id=validated(CartShippingInput, request)["service"],
            )
        )


class CartPreviewView(APIView):
    @extend_schema(responses=CartPreviewOutput)
    def get(self, request):
        return Response(cart.preview(actor=request.user))


class StrictCommand(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict) and set(data) - self.fields.keys():
            raise serializers.ValidationError({"non_field_errors": ["فیلد ناشناخته مجاز نیست."]})
        return super().to_internal_value(data)


class CheckoutInput(StrictCommand):
    cart = serializers.UUIDField()
    idempotency_key = serializers.UUIDField()
    quote_fingerprint = serializers.RegexField(r"^[a-f0-9]{64}$")


class OrderDecisionInput(StrictCommand):
    decision = serializers.ChoiceField(choices=["accept", "reject"])
    reason = serializers.CharField(max_length=2000, required=False, default="", allow_blank=True)


class OrderCancelInput(StrictCommand):
    reason = serializers.CharField(max_length=2000)


class OrderOutput(serializers.Serializer):
    cancellation = serializers.JSONField(allow_null=True)
    id = serializers.UUIDField()
    group = serializers.UUIDField(allow_null=True)
    manufacturer = serializers.UUIDField()
    retailer = serializers.UUIDField()
    status = serializers.CharField()
    destination = DestinationInput()
    commercial = serializers.JSONField()
    response_deadline = serializers.DateTimeField(allow_null=True)
    payment_deadline = serializers.DateTimeField(allow_null=True)
    decision_reason = serializers.CharField()
    lines = serializers.ListField(child=serializers.DictField())


class OrderGroupOutput(serializers.Serializer):
    id = serializers.UUIDField()
    cart = serializers.UUIDField()
    orders = OrderOutput(many=True)


class CheckoutView(APIView):
    @extend_schema(request=CheckoutInput, responses=OrderGroupOutput)
    def post(self, request):
        data = validated(CheckoutInput, request)
        return Response(
            checkout.submit(
                actor=request.user,
                cart_id=data["cart"],
                idempotency_key=data["idempotency_key"],
                quote_fingerprint=data["quote_fingerprint"],
            )
        )


class OrderPageOutput(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = OrderOutput(many=True)


class OrderListView(APIView):
    @extend_schema(
        operation_id="orders_list",
        responses=OrderPageOutput,
        parameters=[OpenApiParameter("page", int), OpenApiParameter("page_size", int)],
    )
    def get(self, request):
        return Response(lifecycle.order_list(actor=request.user, request=request))


class OrderView(APIView):
    @extend_schema(responses=OrderOutput)
    def get(self, request, pk):
        return Response(lifecycle.read_order(actor=request.user, pk=pk))


class OrderGroupView(APIView):
    @extend_schema(responses=OrderGroupOutput)
    def get(self, request, pk):
        return Response(lifecycle.read_group(actor=request.user, pk=pk))


class OrderDecisionView(APIView):
    @extend_schema(request=OrderDecisionInput, responses=OrderOutput)
    def post(self, request, pk):
        return Response(
            lifecycle.respond(actor=request.user, pk=pk, **validated(OrderDecisionInput, request))
        )


class OrderCancelView(APIView):
    @extend_schema(request=OrderCancelInput, responses=OrderOutput)
    def post(self, request, pk):
        return Response(
            lifecycle.cancel(actor=request.user, pk=pk, **validated(OrderCancelInput, request))
        )


class DeliveryAddressOutput(DestinationInput):
    id = serializers.UUIDField()


class DeliveryAddressView(APIView):
    @extend_schema(responses=DeliveryAddressOutput(many=True))
    def get(self, request):
        return Response(cart.addresses(actor=request.user))

    @extend_schema(request=DestinationInput, responses=DeliveryAddressOutput(many=True))
    def post(self, request):
        return Response(
            cart.addresses(actor=request.user, data=validated(DestinationInput, request))
        )


class DeliveryAddressDetailView(APIView):
    @extend_schema(request=DestinationInput, responses=DeliveryAddressOutput(many=True))
    def put(self, request, pk):
        return Response(
            cart.addresses(actor=request.user, pk=pk, data=validated(DestinationInput, request))
        )

    @extend_schema(responses=DeliveryAddressOutput(many=True))
    def delete(self, request, pk):
        return Response(cart.addresses(actor=request.user, pk=pk, delete=True))


class CartAddressInput(StrictCommand):
    address = serializers.UUIDField()


class CartAddressView(APIView):
    @extend_schema(request=CartAddressInput, responses=CartOutput)
    def put(self, request):
        return Response(
            cart.choose_address(
                actor=request.user, pk=validated(CartAddressInput, request)["address"]
            )
        )


class BulkShippingOutput(CartOutput):
    applied = serializers.ListField(child=serializers.UUIDField())
    skipped = serializers.ListField(child=serializers.UUIDField())


class OrderCancellationDecisionView(APIView):
    @extend_schema(request=OrderDecisionInput, responses=OrderOutput)
    def post(self, request, pk):
        return Response(
            cancellation.decide(actor=request.user, pk=pk, **validated(OrderDecisionInput, request))
        )


class OrderCancellationOperatorView(APIView):
    @extend_schema(request=OrderDecisionInput, responses=OrderOutput)
    def post(self, request, pk):
        return Response(
            cancellation.decide(
                actor=request.user, pk=pk, operator=True, **validated(OrderDecisionInput, request)
            )
        )


class OrderCancellationQueueView(APIView):
    @extend_schema(
        responses=OrderPageOutput,
        parameters=[OpenApiParameter("page", int), OpenApiParameter("page_size", int)],
    )
    def get(self, request):
        return Response(cancellation.queue(actor=request.user, request=request))


class ReorderInput(StrictCommand):
    confirm_method_change = serializers.BooleanField(default=False)


class ReorderView(APIView):
    @extend_schema(request=ReorderInput, responses=CartOutput)
    def post(self, request, pk):
        return Response(
            lifecycle.reorder(actor=request.user, pk=pk, **validated(ReorderInput, request))
        )


class BulkShippingView(APIView):
    @extend_schema(request=CartShippingInput, responses=BulkShippingOutput)
    def put(self, request, manufacturer_id):
        return Response(
            cart.bulk_shipping(
                actor=request.user,
                manufacturer_id=manufacturer_id,
                service_id=validated(CartShippingInput, request)["service"],
            )
        )
