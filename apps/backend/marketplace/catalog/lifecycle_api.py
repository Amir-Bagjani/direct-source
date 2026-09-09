from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.accounts.permissions import has_role, require_operator

from . import lifecycle, proposals
from .api import AttributeSerializer, CategorySerializer, OptionSerializer, VariantSerializer
from .models import TaxonomyProposal
from .publication_api import PublicationOutput, ReasonInput
from .revision_api import RevisionOutput


class VariantActivationInput(ReasonInput):
    enabled = serializers.BooleanField()


class VariantStatusView(APIView):
    @extend_schema(request=VariantActivationInput, responses=VariantSerializer)
    def post(self, request, product_id, pk):
        return Response(
            VariantSerializer(
                lifecycle.variant_status(
                    actor=request.user,
                    product_id=product_id,
                    pk=pk,
                    **validated(VariantActivationInput, request),
                )
            ).data
        )


class DeleteInput(serializers.Serializer):
    confirm = serializers.BooleanField()


class ProductDeleteView(APIView):
    @extend_schema(request=DeleteInput, responses={204: None})
    def post(self, request, pk):
        lifecycle.delete_product(actor=request.user, pk=pk, **validated(DeleteInput, request))
        return Response(status=204)


class ReassignInput(ReasonInput):
    user_id = serializers.UUIDField()


class ProductReassignView(APIView):
    @extend_schema(request=ReassignInput, responses=PublicationOutput)
    def post(self, request, pk):
        return Response(
            PublicationOutput(
                lifecycle.reassign(actor=request.user, pk=pk, **validated(ReassignInput, request))
            ).data
        )


class RevisionReassignView(APIView):
    @extend_schema(request=ReassignInput, responses=RevisionOutput)
    def post(self, request, pk):
        return Response(
            RevisionOutput(
                lifecycle.reassign(
                    actor=request.user, pk=pk, revision=True, **validated(ReassignInput, request)
                )
            ).data
        )


class ProposalSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxonomyProposal
        fields = [
            "id",
            "business",
            "kind",
            "category",
            "attribute",
            "name",
            "description",
            "example",
            "status",
            "reason",
            "reviewed_by",
            "result_id",
            "created_at",
        ]
        read_only_fields = ["status", "reason", "reviewed_by", "result_id", "created_at"]
        extra_kwargs = {
            key: {"required": True, "allow_blank": False}
            for key in ["name", "description", "example"]
        }


class ProposalViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ProposalSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return TaxonomyProposal.objects.none()
        qs = TaxonomyProposal.objects.all()
        if not has_role(self.request.user, "operator", "owner"):
            if self.request.user.pk is None:
                return TaxonomyProposal.objects.none()
            qs = qs.filter(business__membership__user_id=self.request.user.pk)
        if "status" in self.request.query_params:
            status = serializers.ChoiceField(
                choices=["pending", "approved", "rejected"]
            ).run_validation(self.request.query_params["status"])
            qs = qs.filter(status=status)
        return qs

    def perform_create(self, serializer):
        serializer.instance = proposals.propose(
            actor=self.request.user, data=serializer.validated_data
        )


class ProposalReviewInput(ReasonInput):
    decision = serializers.ChoiceField(choices=["approved", "rejected"])
    definition = serializers.DictField(required=False)


class ProposalReviewView(APIView):
    @extend_schema(request=ProposalReviewInput, responses=ProposalSerializer)
    def post(self, request, pk):
        require_operator(request.user)
        obj = get_object_or_404(TaxonomyProposal, pk=pk)
        data = validated(ProposalReviewInput, request)
        if "definition" in data:
            cls = {
                "category": CategorySerializer,
                "attribute": AttributeSerializer,
                "option": OptionSerializer,
            }[obj.kind]
            serializer = cls(data=data["definition"])
            serializer.is_valid(raise_exception=True)
            data["definition"] = serializer.validated_data
        return Response(
            ProposalSerializer(proposals.review_proposal(actor=request.user, pk=pk, **data)).data
        )
