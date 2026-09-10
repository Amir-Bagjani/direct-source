from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.accounts.permissions import has_role, require_operator, require_owner
from marketplace.catalog.api import EditableViewSet
from marketplace.catalog.sales_api import StrictInteger
from marketplace.operations.api import FileSerializer
from marketplace.operations.files import upload_document
from marketplace.orders.models import Order

from . import delivery, fulfillment, grouping
from .models import (
    Carrier,
    CarrierAssignment,
    DeliveryPolicy,
    FulfillmentEvent,
    Shipment,
    ShippingRequest,
)


class FulfillmentReasonInput(serializers.Serializer):
    reason = serializers.CharField(max_length=2000)


class CarrierSerializer(serializers.ModelSerializer):
    reason = serializers.CharField(required=False, write_only=True, max_length=2000)

    class Meta:
        model = Carrier
        fields = ["id", "name", "kind", "phone", "services", "is_active", "reason"]


class CarrierViewSet(EditableViewSet):
    queryset = Carrier.objects.prefetch_related("services")
    serializer_class = CarrierSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        require_operator(request.user)

    def perform_create(self, serializer):
        serializer.instance = fulfillment.save_carrier(
            actor=self.request.user, data=serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = fulfillment.save_carrier(
            actor=self.request.user, pk=serializer.instance.pk, data=serializer.validated_data
        )


class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = CarrierAssignment
        fields = [
            "id",
            "carrier_snapshot",
            "pickup_start",
            "pickup_end",
            "actor",
            "reason",
            "created_at",
        ]


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = FulfillmentEvent
        fields = [
            "id",
            "shipment",
            "actor",
            "actor_kind",
            "action",
            "reason",
            "before",
            "after",
            "evidence",
            "created_at",
        ]


class ManifestItem(serializers.Serializer):
    group_item = serializers.UUIDField()
    quantity = StrictInteger(min_value=1, max_value=10**6)


class ActualPackageInput(serializers.Serializer):
    count = StrictInteger(min_value=1, max_value=10**6)
    weight_g = StrictInteger(min_value=1, max_value=10**9)
    length_mm = StrictInteger(min_value=1, max_value=10**6)
    width_mm = StrictInteger(min_value=1, max_value=10**6)
    height_mm = StrictInteger(min_value=1, max_value=10**6)


class PackagesInput(serializers.Serializer):
    packages: serializers.Field = serializers.ListSerializer(
        child=ActualPackageInput(), allow_empty=False, max_length=1000
    )


class ManifestInput(PackagesInput):
    items: serializers.Field = serializers.ListSerializer(
        child=ManifestItem(), allow_empty=False, max_length=1000
    )


class CorrectionInput(ManifestInput, FulfillmentReasonInput):
    pass


class ShipmentManifestInput(ManifestInput):
    shipment_id = serializers.UUIDField()


class ManifestBatchInput(FulfillmentReasonInput):
    corrections: serializers.Field = serializers.ListSerializer(
        child=ShipmentManifestInput(), allow_empty=False, max_length=1000
    )


class ShipmentSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()
    receipt = serializers.SerializerMethodField()

    def get_items(self, obj) -> list[dict]:
        return [
            {"group_item": str(item.group_item_id), "quantity": item.quantity}
            for item in obj.items.all()
        ]

    def get_receipt(self, obj) -> str | None:
        if obj.receipt_id and obj.receipt.scan_status == "clean" and not obj.receipt.deleted_at:
            return str(obj.receipt_id)
        return None

    class Meta:
        model = Shipment
        fields = [
            "id",
            "request",
            "assignment",
            "replaces",
            "status",
            "packages",
            "items",
            "tracking_number",
            "receipt",
            "estimated_delivery_at",
            "recipient_name",
            "recipient_phone",
            "note",
            "handed_over_at",
            "delivered_at",
            "resolution",
        ]


class RequestSerializer(serializers.ModelSerializer):
    order = serializers.UUIDField(source="group.order_id")
    snapshot = serializers.JSONField(source="group.snapshot")
    assignments = AssignmentSerializer(many=True, read_only=True)
    shipments = ShipmentSerializer(many=True, read_only=True)
    items = serializers.SerializerMethodField()

    def get_items(self, obj) -> list[dict]:
        return [
            {
                "id": str(item.pk),
                "line": str(item.line_id),
                "quantity": item.quantity,
                "prepared_quantity": item.line.prepared_quantity,
                "lead_time_days": item.line.lead_time_days,
                "production_quantity": item.line.production_quantity,
            }
            for item in obj.group.items.select_related("line")
        ]

    class Meta:
        model = ShippingRequest
        fields = [
            "id",
            "group",
            "order",
            "status",
            "snapshot",
            "items",
            "actual_packages",
            "actual_weight_g",
            "ready_at",
            "cancellation_referred_at",
            "needs_assignment",
            "hold_reason",
            "assignments",
            "shipments",
        ]


class ManifestBatchView(APIView):
    @extend_schema(request=ManifestBatchInput, responses=RequestSerializer)
    def post(self, request, pk):
        obj = fulfillment.correct_manifests(
            actor=request.user, request_id=pk, **validated(ManifestBatchInput, request)
        )
        return Response(RequestSerializer(obj).data)


def request_queryset(actor):
    return (
        ShippingRequest.objects.filter(group__order__in=fulfillment.visible_orders(actor))
        .select_related("group")
        .prefetch_related("assignments", "shipments__items", "shipments__receipt")
        .order_by("created_at", "id")
    )


class RequestListView(generics.ListAPIView):
    serializer_class = RequestSerializer

    def get_queryset(self):
        queryset = request_queryset(self.request.user)
        status = self.request.query_params.get("status")
        if status:
            if status not in ShippingRequest.Status.values:
                raise serializers.ValidationError("وضعیت نامعتبر است.")
            queryset = queryset.filter(status=status)
        return queryset


class RequestDetailView(generics.RetrieveAPIView):
    serializer_class = RequestSerializer

    def get_queryset(self):
        return request_queryset(self.request.user)


class EventListView(generics.ListAPIView):
    serializer_class = EventSerializer

    def get_queryset(self):
        request = get_object_or_404(request_queryset(self.request.user), pk=self.kwargs["pk"])
        return request.events.all()


class UnconfirmedQueueView(generics.ListAPIView):
    serializer_class = ShipmentSerializer

    def get_queryset(self):
        require_operator(self.request.user)
        return (
            Shipment.objects.filter(status="unconfirmed")
            .prefetch_related("items")
            .select_related("receipt")
            .order_by("updated_at", "id")
        )


class ProgressInput(serializers.Serializer):
    line_id = serializers.UUIDField()
    prepared_quantity = StrictInteger(min_value=0, max_value=10**6)
    note = serializers.CharField(max_length=2000)


class ProgressView(APIView):
    @extend_schema(request=ProgressInput, responses=RequestSerializer)
    def post(self, request, pk):
        obj = fulfillment.progress(
            actor=request.user, request_id=pk, **validated(ProgressInput, request)
        )
        return Response(RequestSerializer(obj).data)


class ReadyView(APIView):
    @extend_schema(request=PackagesInput, responses=RequestSerializer)
    def post(self, request, pk):
        obj = fulfillment.ready(
            actor=request.user, request_id=pk, **validated(PackagesInput, request)
        )
        return Response(RequestSerializer(obj).data)


class DecisionInput(FulfillmentReasonInput):
    decision = serializers.ChoiceField(choices=["continue", "cancel_refund"])


class SpecificationReviewView(APIView):
    @extend_schema(request=DecisionInput, responses=RequestSerializer)
    def post(self, request, pk):
        obj = fulfillment.review_specifications(
            actor=request.user, request_id=pk, **validated(DecisionInput, request)
        )
        return Response(RequestSerializer(obj).data)


class AgentInput(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    mobile = serializers.CharField(max_length=30, required=False, allow_blank=True)
    plate = serializers.CharField(max_length=30, required=False, allow_blank=True)


class AssignmentInput(FulfillmentReasonInput):
    carrier_id = serializers.UUIDField()
    pickup_start = serializers.DateTimeField()
    pickup_end = serializers.DateTimeField()
    agent = AgentInput(required=False)


class AssignmentView(APIView):
    @extend_schema(request=AssignmentInput, responses=RequestSerializer)
    def post(self, request, pk):
        obj = fulfillment.assign(
            actor=request.user, request_id=pk, **validated(AssignmentInput, request)
        )
        return Response(RequestSerializer(obj).data)


class OperationalExceptionInput(FulfillmentReasonInput):
    decision = serializers.ChoiceField(choices=["hold", "resume", "cancel_refund"])


class OperationalExceptionView(APIView):
    @extend_schema(request=OperationalExceptionInput, responses=RequestSerializer)
    def post(self, request, pk):
        obj = fulfillment.operational_exception(
            actor=request.user, request_id=pk, **validated(OperationalExceptionInput, request)
        )
        return Response(RequestSerializer(obj).data)


class ShipmentCreateView(APIView):
    @extend_schema(request=ManifestInput, responses={201: ShipmentSerializer})
    def post(self, request, pk):
        obj = fulfillment.save_shipment(
            actor=request.user, request_id=pk, **validated(ManifestInput, request)
        )
        return Response(ShipmentSerializer(obj).data, status=201)


class ShipmentEditView(APIView):
    @extend_schema(request=ManifestInput, responses=ShipmentSerializer)
    def put(self, request, pk):
        shipment = get_object_or_404(
            Shipment, pk=pk, request__group__order__in=fulfillment.visible_orders(request.user)
        )
        obj = fulfillment.save_shipment(
            actor=request.user,
            request_id=shipment.request_id,
            shipment_id=pk,
            **validated(ManifestInput, request),
        )
        return Response(ShipmentSerializer(obj).data)


class ShipmentCorrectionView(APIView):
    @extend_schema(request=CorrectionInput, responses=ShipmentSerializer)
    def post(self, request, pk):
        require_operator(request.user)
        shipment = get_object_or_404(Shipment, pk=pk)
        obj = fulfillment.save_shipment(
            actor=request.user,
            request_id=shipment.request_id,
            shipment_id=pk,
            operator=True,
            **validated(CorrectionInput, request),
        )
        return Response(ShipmentSerializer(obj).data)


class HandOverView(APIView):
    @extend_schema(request=None, responses=ShipmentSerializer)
    def post(self, request, pk):
        return Response(
            ShipmentSerializer(fulfillment.hand_over(actor=request.user, shipment_id=pk)).data
        )


class ShipmentCancelView(APIView):
    @extend_schema(request=FulfillmentReasonInput, responses=ShipmentSerializer)
    def post(self, request, pk):
        return Response(
            ShipmentSerializer(
                fulfillment.cancel_shipment(
                    actor=request.user, shipment_id=pk, **validated(FulfillmentReasonInput, request)
                )
            ).data
        )


class TrackingInput(FulfillmentReasonInput):
    tracking_number = serializers.CharField(max_length=150, required=False, allow_blank=True)
    receipt = serializers.UUIDField(required=False, allow_null=True)
    estimated_delivery_at = serializers.DateTimeField(required=False, allow_null=True)
    recipient_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    recipient_phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    note = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class TrackingView(APIView):
    @extend_schema(request=TrackingInput, responses=ShipmentSerializer)
    def post(self, request, pk):
        data = validated(TrackingInput, request)
        reason = data.pop("reason")
        return Response(
            ShipmentSerializer(
                fulfillment.tracking(actor=request.user, shipment_id=pk, data=data, reason=reason)
            ).data
        )


class StatusInput(FulfillmentReasonInput):
    status = serializers.ChoiceField(
        choices=["in_transit", "failed", "unconfirmed", "delivered", "returned"]
    )
    evidence_id = serializers.UUIDField(required=False)


class TrackingStatusView(APIView):
    @extend_schema(request=StatusInput, responses=ShipmentSerializer)
    def post(self, request, pk):
        return Response(
            ShipmentSerializer(
                fulfillment.track_status(
                    actor=request.user, shipment_id=pk, **validated(StatusInput, request)
                )
            ).data
        )


class ResolutionInput(FulfillmentReasonInput):
    decision = serializers.ChoiceField(choices=["resend", "cancel_refund"])


class FailureResolutionView(APIView):
    @extend_schema(request=ResolutionInput, responses=ShipmentSerializer)
    def post(self, request, pk):
        return Response(
            ShipmentSerializer(
                fulfillment.resolve_failure(
                    actor=request.user, shipment_id=pk, **validated(ResolutionInput, request)
                )
            ).data
        )


class LinkOutput(serializers.Serializer):
    token = serializers.CharField()
    link = serializers.CharField()
    expires_at = serializers.DateTimeField()


class DeliveryLinkView(APIView):
    @extend_schema(request=FulfillmentReasonInput, responses=LinkOutput)
    def post(self, request, pk):
        return Response(
            delivery.issue_link(
                actor=request.user, shipment_id=pk, **validated(FulfillmentReasonInput, request)
            ),
            headers={"Cache-Control": "no-store"},
        )


class RevokeLinkView(APIView):
    @extend_schema(request=FulfillmentReasonInput, responses={204: None})
    def post(self, request, pk):
        delivery.revoke_link(
            actor=request.user, shipment_id=pk, **validated(FulfillmentReasonInput, request)
        )
        return Response(status=204)


class TokenInput(serializers.Serializer):
    token = serializers.CharField(
        max_length=128, min_length=32, trim_whitespace=False, write_only=True
    )


class CodeInput(TokenInput):
    code = serializers.CharField(
        max_length=128, allow_blank=True, trim_whitespace=False, write_only=True
    )


class ClaimInput(TokenInput, FulfillmentReasonInput):
    pass


class LinkInfoOutput(serializers.Serializer):
    shipment = serializers.UUIDField()
    service_name = serializers.CharField()


class DeliveryAgentView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "delivery_agent"

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        response["Referrer-Policy"] = "no-referrer"
        return response


class LinkInfoView(DeliveryAgentView):
    @extend_schema(request=TokenInput, responses=LinkInfoOutput, auth=[])
    def post(self, request):
        return Response(delivery.link_info(**validated(TokenInput, request)))


class RequestCodeView(DeliveryAgentView):
    @extend_schema(request=TokenInput, responses={204: None}, auth=[])
    def post(self, request):
        delivery.request_code(**validated(TokenInput, request))
        return Response(status=204)


class VerifyCodeView(DeliveryAgentView):
    @extend_schema(request=CodeInput, responses={204: None}, auth=[])
    def post(self, request):
        delivery.verify_code(**validated(CodeInput, request))
        return Response(status=204)


class UnconfirmedDeliveryView(DeliveryAgentView):
    @extend_schema(request=ClaimInput, responses={204: None}, auth=[])
    def post(self, request):
        delivery.unconfirmed_delivery(**validated(ClaimInput, request))
        return Response(status=204)


class PolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryPolicy
        fields = ["ttl_seconds", "max_attempts", "cooldown_seconds", "hourly_limit"]


class PolicyInput(FulfillmentReasonInput):
    ttl_seconds = StrictInteger(min_value=1, max_value=3600)
    max_attempts = StrictInteger(min_value=1, max_value=10)
    cooldown_seconds = StrictInteger(min_value=1, max_value=3600)
    hourly_limit = StrictInteger(min_value=1, max_value=20)


class PolicyView(APIView):
    @extend_schema(responses=PolicySerializer)
    def get(self, request):
        require_owner(request.user)
        return Response(
            PolicySerializer(DeliveryPolicy.objects.filter(pk=1).first() or DeliveryPolicy()).data
        )

    @extend_schema(request=PolicyInput, responses=PolicySerializer)
    def put(self, request):
        data = validated(PolicyInput, request)
        reason = data.pop("reason")
        return Response(
            PolicySerializer(
                delivery.configure_policy(actor=request.user, data=data, reason=reason)
            ).data
        )


class GroupSelection(serializers.Serializer):
    variant = serializers.UUIDField()
    quantity = StrictInteger(min_value=1, max_value=10**6)
    service = serializers.UUIDField()


class GroupQuoteInput(serializers.Serializer):
    destination_id = serializers.UUIDField()
    selections: serializers.Field = serializers.ListSerializer(
        child=GroupSelection(), allow_empty=False, max_length=1000
    )


class GroupQuoteOutput(serializers.Serializer):
    groups = serializers.ListField(child=serializers.DictField())
    shipping_amount_irr = serializers.IntegerField()


class GroupQuoteView(APIView):
    @extend_schema(request=GroupQuoteInput, responses=GroupQuoteOutput)
    def post(self, request):
        return Response(
            grouping.preview_groups(actor=request.user, **validated(GroupQuoteInput, request))
        )


class OrderFulfillmentOutput(serializers.Serializer):
    order = serializers.UUIDField()
    shipping_status = serializers.CharField()
    preparation_started_at = serializers.DateTimeField(allow_null=True)
    delivered_at = serializers.DateTimeField(allow_null=True)
    discrepancy_deadline = serializers.DateTimeField(allow_null=True)


class OrderFulfillmentView(APIView):
    @extend_schema(responses=OrderFulfillmentOutput)
    def get(self, request, pk):
        # A coherent projection while another shipment may be completing concurrently.
        with transaction.atomic():
            order = get_object_or_404(
                fulfillment.visible_orders(request.user).select_for_update(of=("self",)), pk=pk
            )
            return Response(
                {
                    "order": str(order.pk),
                    "shipping_status": fulfillment.aggregate_status(order),
                    "preparation_started_at": order.preparation_started_at,
                    "delivered_at": order.delivered_at,
                    "discrepancy_deadline": order.discrepancy_deadline,
                }
            )


class DocumentInput(serializers.Serializer):
    file = serializers.FileField()
    consent_version = serializers.CharField(max_length=40)


class ShippingDocumentView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "upload"

    @extend_schema(request=DocumentInput, responses={201: FileSerializer})
    def post(self, request, pk):
        obj = get_object_or_404(
            request_queryset(request.user).select_related("group__order__manufacturer"), pk=pk
        )
        order = obj.group.order
        business = order.manufacturer
        if (
            not has_role(request.user, "owner", "operator")
            and order.retailer.membership.user_id == request.user.pk
        ):
            business = order.retailer
        if len(request.FILES.getlist("file")) != 1 or len(request.FILES) != 1:
            raise serializers.ValidationError("در هر درخواست یک فایل ارسال کنید.")
        data = validated(DocumentInput, request)
        file = upload_document(
            actor=request.user,
            business=business,
            purpose="shipping",
            consent=data["consent_version"],
            upload=data["file"],
        )
        with transaction.atomic():
            Order.objects.select_for_update().get(pk=order.pk)
            fulfillment.record_event(
                obj, request.user, "file.uploaded", evidence=file, after={"file": str(file.pk)}
            )
        return Response(FileSerializer(file).data, status=201)
