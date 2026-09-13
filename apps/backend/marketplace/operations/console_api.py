from datetime import UTC, datetime

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.accounts.permissions import has_role, require_operator, require_owner
from marketplace.common.pagination import StandardPagination
from marketplace.orders.api import StrictCommand

from . import analytics, commands, policy, suspensions, work
from .models import AuditEvent, PolicyVersion, WorkItem


class Filters(StrictCommand):
    start = serializers.DateTimeField(required=False)
    end = serializers.DateTimeField(required=False)
    status = serializers.CharField(required=False, max_length=24)
    page = serializers.IntegerField(required=False, min_value=1)
    page_size = serializers.IntegerField(required=False, min_value=1, max_value=100)


class QueueFilters(Filters):
    kind = serializers.ChoiceField(choices=list(work.LABELS), required=False)
    assignee = serializers.CharField(required=False, max_length=40)
    sort = serializers.ChoiceField(choices=["oldest", "newest"], default="oldest")


class DashboardFilters(Filters):
    business_id = serializers.UUIDField(required=False)


def filters(request, cls):
    serializer = cls(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    data = {k: v for k, v in serializer.validated_data.items() if k not in ["page", "page_size"]}
    if cls is QueueFilters and not data.get("start"):
        data["start"] = datetime(1970, 1, 1, tzinfo=UTC)
        data["end"] = data.get("end") or timezone.now()
    else:
        data["start"], data["end"] = analytics.bounds(data.get("start"), data.get("end"))
    return data


def paginate(request, rows):
    pagination = StandardPagination()
    page = pagination.paginate_queryset(rows, request)
    return pagination.get_paginated_response(page)


class ObjectOutput(serializers.Serializer):
    data = serializers.JSONField()  # type: ignore[assignment]


class QueueRow(serializers.Serializer):
    kind = serializers.CharField()
    target = serializers.UUIDField()
    label = serializers.CharField()  # type: ignore[assignment]
    reason = serializers.CharField()
    status = serializers.CharField()
    assigned_to = serializers.UUIDField(allow_null=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    age_seconds = serializers.IntegerField()
    commands = serializers.ListField(child=serializers.CharField())


class QueuePage(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = QueueRow(many=True)


class QueueList(APIView):
    @extend_schema(
        operation_id="operations_work_list", parameters=[QueueFilters], responses=QueuePage
    )
    def get(self, request):
        return paginate(
            request, work.listing(actor=request.user, filters=filters(request, QueueFilters))
        )


class WorkClaimInput(StrictCommand):
    reason = serializers.CharField(max_length=2000)
    user_id = serializers.UUIDField(required=False)


class FileRetentionInput(StrictCommand):
    reason = serializers.CharField(max_length=2000)


class FileHoldInput(FileRetentionInput):
    enabled = serializers.BooleanField()


class FileHoldView(APIView):
    @extend_schema(request=FileHoldInput, responses=ObjectOutput)
    def post(self, request, pk):
        from .retention import set_hold

        return Response(
            {"data": set_hold(actor=request.user, pk=pk, **validated(FileHoldInput, request))}
        )


class FileDeleteView(APIView):
    @extend_schema(request=FileRetentionInput, responses=ObjectOutput)
    def post(self, request, pk):
        from .retention import delete_file

        return Response(
            {
                "data": delete_file(
                    actor=request.user, pk=pk, **validated(FileRetentionInput, request)
                )
            }
        )


class ClaimView(APIView):
    @extend_schema(request=WorkClaimInput, responses=ObjectOutput)
    def post(self, request, kind, pk):
        return Response(
            {
                "data": work.claim(
                    actor=request.user, kind=kind, pk=pk, **validated(WorkClaimInput, request)
                )
            }
        )


class CommandInput(StrictCommand):
    command = serializers.CharField(max_length=40)
    reason = serializers.CharField(max_length=2000)
    idempotency_key = serializers.UUIDField()
    parameters = serializers.DictField(default=dict)


class CommandView(APIView):
    @extend_schema(request=CommandInput, responses=ObjectOutput)
    def post(self, request, kind, pk):
        return Response(
            {
                "data": commands.execute(
                    actor=request.user, kind=kind, pk=pk, **validated(CommandInput, request)
                )
            }
        )


def timeline(actor, kind, pk):
    from rest_framework.exceptions import PermissionDenied

    require_operator(actor)
    if kind not in work.MODELS:
        raise serializers.ValidationError("نوع صف معتبر نیست.")
    target = get_object_or_404(work.MODELS[kind], pk=pk)
    own = (
        work.native_assignee(kind, target) == actor.pk
        or WorkItem.objects.filter(kind=kind, target_id=pk, assigned_to=actor).exists()
    )
    if not has_role(actor, "owner") and not own:
        raise PermissionDenied("ابتدا مسئولیت پرونده را بپذیرید.")
    ids = [target.pk]
    ids.extend(WorkItem.objects.filter(kind=kind, target_id=pk).values_list("pk", flat=True))
    if kind == "business":
        ids.append(target.business_id)
    if kind == "review":
        ids.append(target.review_id)
    query = AuditEvent.objects.filter(aggregate_id__in=ids).order_by("created_at", "pk")
    details = {
        field: getattr(target, field)
        for field in [
            "id",
            "order_id",
            "business_id",
            "user_id",
            "suspension_id",
            "stage",
            "financial_reference",
            "activated_at",
            "restored_at",
            "decided_at",
            "status",
            "reason",
            "text",
            "description",
            "response_deadline",
            "payment_deadline",
            "discrepancy_deadline",
            "closed_at",
            "decision",
        ]
        if hasattr(target, field)
    }
    return details, query


class TimelineView(APIView):
    @extend_schema(responses=ObjectOutput)
    def get(self, request, kind, pk):
        details, query = timeline(request.user, kind, pk)
        return Response(
            {
                "data": {
                    "details": details,
                    "history": paginate(
                        request,
                        query.values(
                            "id",
                            "actor_id",
                            "actor_role",
                            "action",
                            "reason",
                            "before",
                            "after",
                            "created_at",
                            "correlation_id",
                            "command_source",
                        ),
                    ).data,
                }
            }
        )


class OperationsPolicyInput(StrictCommand):
    values = serializers.DictField()
    reason = serializers.CharField(max_length=2000)
    effective_at = serializers.DateTimeField(required=False)


class PolicyView(APIView):
    @extend_schema(responses=ObjectOutput)
    def get(self, request):
        require_owner(request.user)
        return Response({"data": policy.current()})

    @extend_schema(request=OperationsPolicyInput, responses=ObjectOutput)
    def post(self, request):
        return Response(
            {
                "data": policy.configure(
                    actor=request.user, **validated(OperationsPolicyInput, request)
                )
            }
        )


class PolicyHistoryView(APIView):
    @extend_schema(responses=ObjectOutput)
    def get(self, request):
        require_owner(request.user)
        rows = PolicyVersion.objects.order_by("-effective_at", "-pk").values(
            "id", "scope", "values", "effective_at", "actor_id", "reason", "created_at"
        )
        return paginate(request, rows)


class SuspensionInput(StrictCommand):
    business_id = serializers.UUIDField(required=False)
    user_id = serializers.UUIDField(required=False)
    reason = serializers.CharField(max_length=2000)
    evidence = serializers.ListField(child=serializers.UUIDField(), max_length=10, default=list)


class SuspensionList(APIView):
    @extend_schema(request=SuspensionInput, responses=ObjectOutput)
    def post(self, request):
        return Response(
            {"data": suspensions.propose(actor=request.user, **validated(SuspensionInput, request))}
        )


class DashboardView(APIView):
    @extend_schema(parameters=[DashboardFilters], responses=ObjectOutput)
    def get(self, request):
        return Response(
            {"data": analytics.dashboard(actor=request.user, **filters(request, DashboardFilters))}
        )


class DrillDownView(APIView):
    @extend_schema(
        operation_id="operations_dashboard_drilldown",
        parameters=[DashboardFilters],
        responses=ObjectOutput,
    )
    def get(self, request, metric):
        card, rows = analytics.records(
            actor=request.user, metric=metric, **filters(request, DashboardFilters)
        )
        return Response({"data": {"card": card, "records": paginate(request, rows).data}})
