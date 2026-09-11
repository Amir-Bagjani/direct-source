from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.operations.api import FileSerializer
from marketplace.orders.api import StrictCommand

from . import services
from .models import CATEGORIES, LINK_TYPES, STATUSES


class MessageInput(StrictCommand):
    text = serializers.CharField(max_length=8000)
    files = serializers.ListField(child=serializers.UUIDField(), max_length=10, default=list)
    idempotency_key = serializers.UUIDField()


class TicketInput(MessageInput):
    title = serializers.CharField(max_length=200)
    category = serializers.ChoiceField(choices=CATEGORIES)
    related_type = serializers.ChoiceField(choices=LINK_TYPES, default="")
    related_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    previous = serializers.UUIDField(required=False, allow_null=True, default=None)


class TicketOutput(serializers.Serializer):
    id = serializers.UUIDField()
    number = serializers.CharField()
    title = serializers.CharField()
    category = serializers.CharField()
    status = serializers.CharField()
    business = serializers.UUIDField()
    assigned_to = serializers.UUIDField(allow_null=True)
    related_type = serializers.CharField()
    related_id = serializers.UUIDField(allow_null=True)
    previous = serializers.UUIDField(allow_null=True)
    created_at = serializers.DateTimeField()
    last_reply_at = serializers.DateTimeField(allow_null=True)
    resolved_at = serializers.DateTimeField(allow_null=True)
    closed_at = serializers.DateTimeField(allow_null=True)


class MessageOutput(serializers.Serializer):
    id = serializers.UUIDField()
    actor = serializers.UUIDField(allow_null=True)
    text = serializers.CharField()
    files = serializers.ListField(child=serializers.UUIDField())
    created_at = serializers.DateTimeField()


class TicketDetailOutput(TicketOutput):
    messages = MessageOutput(many=True)
    history = serializers.ListField(child=serializers.DictField())


class TicketPage(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = TicketOutput(many=True)


class TicketListView(APIView):
    @extend_schema(
        operation_id="support_tickets_list",
        responses=TicketPage,
        parameters=[
            OpenApiParameter("status", str),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
    )
    def get(self, request):
        return Response(services.listing(actor=request.user, request=request))

    @extend_schema(request=TicketInput, responses=TicketOutput)
    def post(self, request):
        return Response(services.create(actor=request.user, **validated(TicketInput, request)))


class TicketView(APIView):
    @extend_schema(responses=TicketDetailOutput)
    def get(self, request, pk):
        return Response(services.read(actor=request.user, pk=pk))


class MessageView(APIView):
    @extend_schema(request=MessageInput, responses=MessageOutput)
    def post(self, request, pk):
        return Response(
            services.reply(actor=request.user, pk=pk, **validated(MessageInput, request))
        )


class TicketAssignmentInput(StrictCommand):
    user_id = serializers.UUIDField(required=False)
    reason = serializers.CharField(max_length=2000, default="پذیرش مسئولیت")


class AssignmentView(APIView):
    @extend_schema(request=TicketAssignmentInput, responses=TicketOutput)
    def post(self, request, pk):
        return Response(
            services.assign(actor=request.user, pk=pk, **validated(TicketAssignmentInput, request))
        )


class TicketStatusInput(StrictCommand):
    status = serializers.ChoiceField(choices=STATUSES)
    reason = serializers.CharField(max_length=2000)


class TicketStatusView(APIView):
    @extend_schema(request=TicketStatusInput, responses=TicketOutput)
    def post(self, request, pk):
        return Response(
            services.transition(actor=request.user, pk=pk, **validated(TicketStatusInput, request))
        )


class AttachmentInput(StrictCommand):
    file = serializers.FileField()
    consent_version = serializers.CharField(max_length=40)
    order_id = serializers.UUIDField(required=False)
    ticket_id = serializers.UUIDField(required=False)


class AttachmentView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "upload"

    @extend_schema(request=AttachmentInput, responses=FileSerializer)
    def post(self, request):
        if len(request.FILES.getlist("file")) != 1 or len(request.FILES) != 1:
            raise serializers.ValidationError(
                "هر درخواست آپلود شامل یک فایل است؛ هر پیام حداکثر ۱۰ پیوست دارد."
            )
        data = validated(AttachmentInput, request)
        file = services.upload(
            actor=request.user,
            uploaded=data.pop("file"),
            consent=data.pop("consent_version"),
            **data,
        )
        return Response(FileSerializer(file).data)
