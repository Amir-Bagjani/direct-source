from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from . import revision_services
from .api import validated
from .models import Business, BusinessRevision
from .permissions import has_role, require_operator
from .serializers import (
    ActivitySerializer,
    AddressInputSerializer,
    IdentitySerializer,
    ReviewSerializer,
)


class ProfileSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    phone = serializers.RegexField(r"^\+?[0-9]{7,15}$")
    description = serializers.CharField(max_length=2000)
    address = AddressInputSerializer()
    logo = serializers.UUIDField(required=False, allow_null=True)


class RevisionInputSerializer(serializers.Serializer):
    profile = ProfileSerializer(required=False)
    identity = IdentitySerializer(required=False)
    activity = ActivitySerializer(required=False)


class RevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessRevision
        fields = [
            "id",
            "business_id",
            "assigned_to_id",
            "status",
            "identity_status",
            "activity_status",
            "identity_reason",
            "activity_reason",
            "before",
            "proposed",
            "created_at",
        ]
        read_only_fields = fields


def visible(actor):
    qs = BusinessRevision.objects.all()
    if has_role(actor, "owner"):
        return qs
    if has_role(actor, "operator"):
        return qs.filter(Q(assigned_to=actor) | Q(business__membership__user=actor))
    return qs.filter(business__membership__user=actor)


class RevisionListView(generics.ListCreateAPIView):
    serializer_class = RevisionSerializer

    def get_queryset(self):
        return (
            visible(self.request.user)
            .filter(business_id=self.kwargs["pk"])
            .order_by("-created_at", "id")
        )

    @extend_schema(request=RevisionInputSerializer, responses={201: RevisionSerializer})
    def post(self, request, pk):
        get_object_or_404(Business, pk=pk, membership__user=request.user)
        revision = revision_services.propose(
            actor=request.user, business_id=pk, changes=validated(RevisionInputSerializer, request)
        )
        return Response(RevisionSerializer(revision).data, status=201)


class RevisionDetailView(APIView):
    @extend_schema(responses=RevisionSerializer)
    def get(self, request, pk):
        return Response(RevisionSerializer(get_object_or_404(visible(request.user), pk=pk)).data)

    @extend_schema(request=RevisionInputSerializer, responses=RevisionSerializer)
    def put(self, request, pk):
        get_object_or_404(visible(request.user), pk=pk)
        revision = revision_services.resubmit(
            actor=request.user, revision_id=pk, changes=validated(RevisionInputSerializer, request)
        )
        return Response(RevisionSerializer(revision).data)


class RevisionClaimView(APIView):
    @extend_schema(request=None, responses=RevisionSerializer)
    def post(self, request, pk):
        require_operator(request.user)
        get_object_or_404(BusinessRevision, pk=pk)
        return Response(
            RevisionSerializer(revision_services.claim(actor=request.user, revision_id=pk)).data
        )


class RevisionReviewView(APIView):
    @extend_schema(request=ReviewSerializer, responses=RevisionSerializer)
    def post(self, request, pk):
        get_object_or_404(visible(request.user), pk=pk)
        revision = revision_services.review(
            actor=request.user, revision_id=pk, **validated(ReviewSerializer, request)
        )
        return Response(RevisionSerializer(revision).data)


class RevisionQueueSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessRevision
        fields = ["id", "business_id", "assigned_to_id", "created_at"]


class RevisionQueueView(generics.ListAPIView):
    serializer_class = RevisionQueueSerializer

    def get_queryset(self):
        require_operator(self.request.user)
        return BusinessRevision.objects.filter(status="pending").order_by("created_at", "id")
