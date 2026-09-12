from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.accounts.permissions import require_operator
from marketplace.common.pagination import StandardPagination
from marketplace.operations.api import FileSerializer
from marketplace.orders.api import StrictCommand

from . import services
from .models import ACTIONS, CRITERIA, Reply, Report


class RatingInput(StrictCommand):
    scores = serializers.JSONField()
    text = serializers.CharField(max_length=8000, allow_blank=True, default="")
    images = serializers.ListField(child=serializers.UUIDField(), max_length=10, default=list)
    submit = serializers.BooleanField(default=False)


class ReplyInput(StrictCommand):
    text = serializers.CharField(max_length=8000)
    submit = serializers.BooleanField(default=False)


class ReplyOutput(serializers.Serializer):
    id = serializers.UUIDField()
    text = serializers.CharField()
    submitted_at = serializers.DateTimeField(allow_null=True)


class PublishedReply(ReplyOutput):
    content_hidden = serializers.BooleanField()
    author_label = serializers.CharField()


class ReviewOutput(serializers.Serializer):
    id = serializers.UUIDField()
    topic = serializers.ChoiceField(choices=list(CRITERIA))
    product = serializers.UUIDField(allow_null=True)
    variants = serializers.ListField(child=serializers.UUIDField())
    author_label = serializers.CharField()
    scores = serializers.DictField(child=serializers.IntegerField(min_value=1, max_value=5))
    text = serializers.CharField()
    images = serializers.ListField(child=serializers.UUIDField())
    content_hidden = serializers.BooleanField()
    published_at = serializers.DateTimeField()
    reply = PublishedReply(allow_null=True)


class OwnReviewOutput(serializers.Serializer):
    id = serializers.UUIDField()
    scores = serializers.DictField(child=serializers.IntegerField())
    text = serializers.CharField()
    images = serializers.ListField(child=serializers.UUIDField())
    submitted_at = serializers.DateTimeField(allow_null=True)
    published_at = serializers.DateTimeField(allow_null=True)


class EntitlementOutput(serializers.Serializer):
    id = serializers.UUIDField()
    order = serializers.UUIDField()
    topic = serializers.ChoiceField(choices=list(CRITERIA))
    product = serializers.UUIDField(allow_null=True)
    recipient = serializers.UUIDField()
    variants = serializers.ListField(child=serializers.UUIDField())
    deadline = serializers.DateTimeField()
    state = serializers.ChoiceField(choices=["available", "submitted", "expired"])
    review = OwnReviewOutput(allow_null=True)


class PageOutput(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)


class ReviewPage(PageOutput):
    results = ReviewOutput(many=True)


class EntitlementPage(PageOutput):
    results = EntitlementOutput(many=True)


def page(request, query, project):
    pagination = StandardPagination()
    rows = pagination.paginate_queryset(query.order_by("created_at", "pk"), request)
    assert rows is not None
    return pagination.get_paginated_response([project(row) for row in rows])


class EntitlementList(APIView):
    @extend_schema(operation_id="reviews_entitlements_list", responses=EntitlementPage)
    def get(self, request):
        return page(
            request, services.own_rights(request.user).select_related("review"), services.own_data
        )


class EntitlementView(APIView):
    @extend_schema(responses=EntitlementOutput)
    def get(self, request, pk):
        return Response(
            services.own_data(get_object_or_404(services.own_rights(request.user), pk=pk))
        )

    @extend_schema(request=RatingInput, responses=EntitlementOutput)
    def put(self, request, pk):
        return Response(
            services.save_review(actor=request.user, pk=pk, **validated(RatingInput, request))
        )


class ReviewFilter(StrictCommand):
    product = serializers.UUIDField(required=False)
    business = serializers.UUIDField(required=False)
    topic = serializers.ChoiceField(choices=list(CRITERIA), required=False)
    page = serializers.IntegerField(min_value=1, required=False)
    page_size = serializers.IntegerField(min_value=1, required=False)


def filtered(request, internal):
    params = ReviewFilter(data=request.query_params)
    params.is_valid(raise_exception=True)
    query = services.visible_reviews(request.user, internal)
    for key, value in params.validated_data.items():
        field = {
            "product": "entitlement__product",
            "business": "entitlement__recipient",
            "topic": "entitlement__topic",
        }.get(key)
        if field:
            query = query.filter(**{field: value})
    return query


FILTERS = [
    OpenApiParameter("product", str),
    OpenApiParameter("business", str),
    OpenApiParameter("topic", str),
    OpenApiParameter("page", int),
    OpenApiParameter("page_size", int),
]


class PublicList(APIView):
    permission_classes = [AllowAny]
    internal = False

    @extend_schema(responses=ReviewPage, parameters=FILTERS, operation_id="reviews_public_list")
    def get(self, request):
        return page(request, filtered(request, self.internal), services.review_data)


class InternalList(PublicList):
    permission_classes = list(APIView.permission_classes)
    internal = True

    @extend_schema(operation_id="reviews_internal_list", responses=ReviewPage, parameters=FILTERS)
    def get(self, request):
        return super().get(request)


class CriterionOutput(serializers.Serializer):
    mean = serializers.FloatField(allow_null=True)
    count = serializers.IntegerField()


class TopicAggregate(serializers.Serializer):
    count = serializers.IntegerField()
    message = serializers.CharField()
    criteria = serializers.DictField(child=CriterionOutput())


class AggregateOutput(serializers.Serializer):
    product = TopicAggregate()
    manufacturer = TopicAggregate()
    retailer = TopicAggregate()


class PublicAggregate(PublicList):
    @extend_schema(responses=AggregateOutput, parameters=FILTERS)
    def get(self, request):
        return Response(services.aggregate(filtered(request, self.internal)))


class InternalAggregate(PublicAggregate):
    permission_classes = list(APIView.permission_classes)
    internal = True


class PublicDetail(APIView):
    permission_classes = [AllowAny]
    internal = False

    @extend_schema(responses=ReviewOutput)
    def get(self, request, pk):
        return Response(
            services.review_data(
                get_object_or_404(services.visible_reviews(request.user, self.internal), pk=pk)
            )
        )


class InternalDetail(PublicDetail):
    permission_classes = list(APIView.permission_classes)
    internal = True


class ReplyView(APIView):
    @extend_schema(responses=ReplyOutput)
    def get(self, request, pk):
        row = get_object_or_404(
            services.visible_to_actor(request.user),
            pk=pk,
            entitlement__recipient__membership__user=request.user,
        )
        reply = get_object_or_404(Reply, review=row)
        return Response(ReplyOutput(reply).data)

    @extend_schema(request=ReplyInput, responses=ReplyOutput)
    def put(self, request, pk):
        return Response(
            services.save_reply(actor=request.user, pk=pk, **validated(ReplyInput, request))
        )


class ReportInput(StrictCommand):
    reason = serializers.CharField(max_length=2000)
    reply_id = serializers.UUIDField(required=False)


class ReportOutput(serializers.Serializer):
    id = serializers.UUIDField()
    review = serializers.UUIDField()
    reply = serializers.UUIDField(allow_null=True)
    reason = serializers.CharField()
    created_at = serializers.DateTimeField()
    resolved_at = serializers.DateTimeField(allow_null=True)


class ReportPage(PageOutput):
    results = ReportOutput(many=True)


class ReportView(APIView):
    @extend_schema(request=ReportInput, responses=ReportOutput)
    def post(self, request, pk):
        return Response(
            services.report(actor=request.user, pk=pk, **validated(ReportInput, request))
        )


class ReportQueue(APIView):
    @extend_schema(responses=ReportPage)
    def get(self, request):
        require_operator(request.user)
        return page(request, Report.objects.filter(resolved_at__isnull=True), services.report_data)


class ModerationInput(StrictCommand):
    action = serializers.ChoiceField(choices=ACTIONS)
    reason = serializers.CharField(max_length=2000)
    idempotency_key = serializers.UUIDField()


class ModerationOutput(serializers.Serializer):
    id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=ACTIONS)
    before = serializers.DictField()
    after = serializers.DictField()


class ModerationView(APIView):
    @extend_schema(request=ModerationInput, responses=ModerationOutput)
    def post(self, request, pk):
        return Response(
            services.moderate(actor=request.user, pk=pk, **validated(ModerationInput, request))
        )


class AuditOutput(serializers.Serializer):
    review = EntitlementOutput()
    actor = serializers.UUIDField()
    author = serializers.UUIDField()
    execution_mode = serializers.CharField()
    reply = serializers.DictField(allow_null=True)
    history = serializers.ListField(child=serializers.DictField())


class AuditView(APIView):
    @extend_schema(responses=AuditOutput)
    def get(self, request, pk):
        return Response(services.audit_detail(actor=request.user, pk=pk))


class ImageInput(StrictCommand):
    file = serializers.FileField()
    consent_version = serializers.CharField(max_length=40)


class ImageUpload(APIView):
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "upload"

    @extend_schema(request=ImageInput, responses=FileSerializer)
    def post(self, request, pk):
        if len(request.FILES.getlist("file")) != 1 or len(request.FILES) != 1:
            raise serializers.ValidationError("یک فایل تصویر ارسال کنید.")
        data = validated(ImageInput, request)
        file = services.upload_image(
            actor=request.user, pk=pk, uploaded=data["file"], consent=data["consent_version"]
        )
        return Response(FileSerializer(file).data)


class ImageLink(serializers.Serializer):
    url = serializers.URLField()


class PublicImage(APIView):
    permission_classes = [AllowAny]
    internal = False

    @extend_schema(responses=ImageLink)
    def get(self, request, pk, file_id):
        return Response(
            services.image_url(actor=request.user, pk=pk, file_id=file_id, internal=self.internal)
        )


class InternalImage(PublicImage):
    permission_classes = list(APIView.permission_classes)
    internal = True
