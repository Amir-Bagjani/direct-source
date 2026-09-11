from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.catalog.sales_api import StrictInteger
from marketplace.common.pagination import StandardPagination
from marketplace.logistics.fulfillment import visible_orders
from marketplace.orders.api import StrictCommand

from . import services
from .models import DiscrepancyCase


class DiscrepancyClaimInput(StrictCommand):
    idempotency_key = serializers.UUIDField()
    line_id = serializers.UUIDField()
    shipment_id = serializers.UUIDField(required=False)
    quantity = StrictInteger(min_value=1, max_value=10**9)
    kind = serializers.ChoiceField(choices=["shortage", "wrong_item", "damaged", "defective"])
    description = serializers.CharField(max_length=4000)
    evidence = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=10)


class CaseOutput(serializers.Serializer):
    id = serializers.UUIDField()
    order = serializers.UUIDField()
    closed_at = serializers.DateTimeField(allow_null=True)
    claim_deadline = serializers.DateTimeField()
    ticket = serializers.UUIDField(allow_null=True)
    lines = serializers.ListField(child=serializers.DictField())
    notes = serializers.ListField(child=serializers.DictField())


class CasePage(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = CaseOutput(many=True)


class CaseListView(APIView):
    @extend_schema(
        operation_id="disputes_list",
        responses=CasePage,
        parameters=[OpenApiParameter("page", int), OpenApiParameter("page_size", int)],
    )
    def get(self, request):
        query = (
            DiscrepancyCase.objects.filter(order__in=visible_orders(request.user))
            .select_related("order")
            .order_by("created_at", "pk")
        )
        paginator = StandardPagination()
        page = paginator.paginate_queryset(query, request)
        assert page is not None
        return paginator.get_paginated_response([services.case_data(row) for row in page])


class ClaimView(APIView):
    @extend_schema(request=DiscrepancyClaimInput, responses=CaseOutput)
    def post(self, request, order_id):
        return Response(
            services.add_claim(
                actor=request.user, order_id=order_id, **validated(DiscrepancyClaimInput, request)
            )
        )


class CaseView(APIView):
    @extend_schema(responses=CaseOutput)
    def get(self, request, pk):
        return Response(services.read(actor=request.user, pk=pk))


class NoteInput(StrictCommand):
    text = serializers.CharField(max_length=4000)
    claim_id = serializers.UUIDField(required=False)
    evidence = serializers.ListField(child=serializers.UUIDField(), max_length=10, default=list)


class NoteView(APIView):
    @extend_schema(request=NoteInput, responses=CaseOutput)
    def post(self, request, pk):
        return Response(
            services.add_note(actor=request.user, pk=pk, **validated(NoteInput, request))
        )


class ResponseInput(StrictCommand):
    idempotency_key = serializers.UUIDField()
    accepted = StrictInteger(min_value=0, max_value=10**9)
    rejected = StrictInteger(min_value=0, max_value=10**9)
    reason = serializers.CharField(max_length=2000)
    evidence = serializers.ListField(child=serializers.UUIDField(), max_length=10, default=list)


class DisputeDecisionInput(ResponseInput):
    remedy = serializers.ChoiceField(choices=["refund", "replacement", "return"])
    evidence = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=10)


class DecisionOutput(serializers.Serializer):
    id = serializers.UUIDField()
    actor = serializers.UUIDField()
    source = serializers.CharField()  # type: ignore[assignment]
    accepted = serializers.IntegerField()
    rejected = serializers.IntegerField()
    remedy = serializers.CharField()
    reason = serializers.CharField()
    created_at = serializers.DateTimeField()
    evidence = serializers.ListField(child=serializers.UUIDField())
    compensation = serializers.JSONField(allow_null=True)


class ResponseView(APIView):
    @extend_schema(request=ResponseInput, responses=DecisionOutput)
    def post(self, request, claim_id):
        return Response(
            services.decide(
                actor=request.user, claim_id=claim_id, **validated(ResponseInput, request)
            )
        )


class DecisionView(APIView):
    @extend_schema(request=DisputeDecisionInput, responses=DecisionOutput)
    def post(self, request, claim_id):
        return Response(
            services.decide(
                actor=request.user,
                claim_id=claim_id,
                operator=True,
                **validated(DisputeDecisionInput, request),
            )
        )


class RemedyProgressInput(StrictCommand):
    status = serializers.ChoiceField(choices=["handed_over", "in_transit", "delivered"])
    tracking_code = serializers.CharField(
        max_length=100, required=False, default="", allow_blank=True
    )
    reason = serializers.CharField(max_length=2000)
    evidence = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=10)


class ProgressView(APIView):
    @extend_schema(request=RemedyProgressInput, responses=DecisionOutput)
    def post(self, request, pk):
        return Response(
            services.remedy_progress(
                actor=request.user, pk=pk, **validated(RemedyProgressInput, request)
            )
        )


class WaiveInput(StrictCommand):
    reason = serializers.CharField(max_length=2000)
    evidence = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=10)


class WaiveView(APIView):
    @extend_schema(request=WaiveInput, responses=DecisionOutput)
    def post(self, request, pk):
        return Response(services.waive(actor=request.user, pk=pk, **validated(WaiveInput, request)))


class CloseView(APIView):
    @extend_schema(request=StrictCommand, responses=CaseOutput)
    def post(self, request, pk):
        validated(StrictCommand, request)
        return Response(services.close(actor=request.user, pk=pk))
