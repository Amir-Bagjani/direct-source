from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.accounts.permissions import has_role, require_operator
from marketplace.catalog.sales_api import StrictInteger

from . import revisions
from .api import ProductSerializer, VariantSerializer
from .models import Product, ProductRevision
from .publication_api import ReasonInput
from .sales_api import SupplyInput


class RevisionProfile(ProductSerializer):
    class Meta(ProductSerializer.Meta):
        fields = revisions.CONTENT
        extra_kwargs = {key: {"required": False} for key in revisions.CONTENT}


class NewPackage(serializers.Serializer):
    weight_g = StrictInteger(min_value=1, max_value=10**9)
    length_mm = StrictInteger(min_value=1, max_value=10**6)
    width_mm = StrictInteger(min_value=1, max_value=10**6)
    height_mm = StrictInteger(min_value=1, max_value=10**6)
    package_count = StrictInteger(min_value=1, max_value=10**6)


class RevisionVariant(VariantSerializer):
    id = serializers.UUIDField(required=False)
    supply = SupplyInput(required=False)
    package = NewPackage(required=False)

    class Meta(VariantSerializer.Meta):
        fields = ["id", "sku", "attributes", "images", "supply", "package"]
        read_only_fields = []


class ProductRevisionInput(serializers.Serializer):
    profile = RevisionProfile(required=False, partial=True)
    variants: serializers.Field = serializers.ListSerializer(
        child=RevisionVariant(), required=False, allow_empty=False, max_length=1000
    )


class RevisionOutput(serializers.ModelSerializer):
    class Meta:
        model = ProductRevision
        fields = [
            "id",
            "product",
            "status",
            "before",
            "proposed",
            "assigned_to",
            "reason",
            "code",
            "created_at",
        ]
        read_only_fields = fields


class RevisionDecision(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approved", "changes_requested", "rejected"])
    reason = serializers.CharField(max_length=2000)
    code = serializers.SlugField(max_length=60)


def visible(actor):
    qs = ProductRevision.objects.all()
    if has_role(actor, "owner"):
        return qs
    if has_role(actor, "operator"):
        return qs.filter(Q(assigned_to=actor) | Q(product__business__membership__user=actor))
    return qs.filter(product__business__membership__user=actor)


class RevisionCreate(generics.ListAPIView):
    serializer_class = RevisionOutput

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ProductRevision.objects.none()
        # Owner history is separate from the operator's assigned review detail.
        product = get_object_or_404(
            Product,
            pk=self.kwargs["product_id"],
            business__membership__user=self.request.user,
        )
        return visible(self.request.user).filter(product=product).order_by("-created_at", "-id")

    @extend_schema(request=ProductRevisionInput, responses={201: RevisionOutput})
    def post(self, request, product_id):
        obj = revisions.save_revision(
            actor=request.user,
            product_id=product_id,
            changes=validated(ProductRevisionInput, request),
        )
        return Response(RevisionOutput(obj).data, status=201)


class RevisionDetail(APIView):
    @extend_schema(responses=RevisionOutput)
    def get(self, request, pk):
        return Response(RevisionOutput(get_object_or_404(visible(request.user), pk=pk)).data)

    @extend_schema(request=ProductRevisionInput, responses=RevisionOutput)
    def put(self, request, pk):
        reference = get_object_or_404(
            ProductRevision, pk=pk, product__business__membership__user=request.user
        )
        obj = revisions.save_revision(
            actor=request.user,
            pk=pk,
            product_id=reference.product_id,
            changes=validated(ProductRevisionInput, request),
        )
        return Response(RevisionOutput(obj).data)


class RevisionSubmit(APIView):
    @extend_schema(request=None, responses=RevisionOutput)
    def post(self, request, pk):
        return Response(
            RevisionOutput(revisions.act(actor=request.user, pk=pk, action="submit")).data
        )


class RevisionClaim(APIView):
    @extend_schema(request=None, responses=RevisionOutput)
    def post(self, request, pk):
        return Response(
            RevisionOutput(revisions.act(actor=request.user, pk=pk, action="claim")).data
        )


class RevisionReview(APIView):
    @extend_schema(request=RevisionDecision, responses=RevisionOutput)
    def post(self, request, pk):
        return Response(
            RevisionOutput(
                revisions.act(
                    actor=request.user,
                    pk=pk,
                    action="review",
                    **validated(RevisionDecision, request),
                )
            ).data
        )


class RevisionCancel(APIView):
    @extend_schema(request=ReasonInput, responses=RevisionOutput)
    def post(self, request, pk):
        return Response(
            RevisionOutput(
                revisions.act(
                    actor=request.user, pk=pk, action="cancel", **validated(ReasonInput, request)
                )
            ).data
        )


class RevisionQueueOutput(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = ProductRevision
        fields = ["id", "product", "product_name", "status", "assigned_to", "created_at"]


class RevisionQueue(generics.ListAPIView):
    serializer_class = RevisionQueueOutput

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ProductRevision.objects.none()
        require_operator(self.request.user)
        return ProductRevision.objects.filter(status="pending").select_related("product")
