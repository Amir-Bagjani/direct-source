"""Small account-safety projections; domain commands remain in their existing services."""

from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.common.pagination import StandardPagination
from marketplace.operations.models import Suspension

from .models import User
from .permissions import has_role, require_operator
from .serializers import BusinessSerializer


class AccessSerializer(serializers.Serializer):
    owner = serializers.BooleanField()


class TrustAccessView(APIView):
    @extend_schema(responses=AccessSerializer)
    def get(self, request):
        require_operator(request.user)
        return Response({"owner": has_role(request.user, "owner")})


class AccountRowSerializer(serializers.ModelSerializer):
    business = serializers.SerializerMethodField()
    operator = serializers.SerializerMethodField()

    def get_operator(self, obj) -> bool:
        return has_role(obj, "operator")

    def get_business(self, obj) -> dict | None:
        membership = getattr(obj, "membership", None)
        return BusinessSerializer(membership.business).data if membership else None

    class Meta:
        model = User
        fields = ["id", "first_name", "last_name", "mobile", "is_suspended", "business", "operator"]


class AccountDirectoryPage(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = AccountRowSerializer(many=True)


class AccountDirectoryView(APIView):
    @extend_schema(responses=AccountDirectoryPage)
    def get(self, request):
        require_operator(request.user)
        rows = (
            User.objects.select_related("membership__business")
            .prefetch_related("membership__business__addresses")
            .order_by("created_at", "id")
        )
        if not has_role(request.user, "owner"):
            rows = rows.filter(
                Q(membership__business__verification__assigned_to=request.user)
                | Q(membership__business__revisions__assigned_to=request.user)
            ).distinct()
        pagination = StandardPagination()
        return pagination.get_paginated_response(
            AccountRowSerializer(pagination.paginate_queryset(rows, request), many=True).data
        )


class SuspensionRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = Suspension
        fields = [
            "id",
            "business_id",
            "user_id",
            "status",
            "reason",
            "activated_at",
            "restored_at",
            "created_at",
        ]


class SuspensionRecordPage(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = SuspensionRecordSerializer(many=True)


class OwnSuspensionsView(APIView):
    @extend_schema(responses=SuspensionRecordPage)
    def get(self, request):
        membership = getattr(request.user, "membership", None)
        scope = Q(user=request.user)
        if membership:
            scope |= Q(business=membership.business)
        rows = (
            Suspension.objects.filter(scope)
            .exclude(status="proposed")
            .order_by("-created_at", "id")
        )
        pagination = StandardPagination()
        page = pagination.paginate_queryset(rows, request)
        return pagination.get_paginated_response(SuspensionRecordSerializer(page, many=True).data)
