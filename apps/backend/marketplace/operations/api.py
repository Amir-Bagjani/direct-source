from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.accounts.models import Business, VerificationApplication
from marketplace.accounts.permissions import require_operator

from .files import download_document, upload_document
from .models import InboxNotification, StoredFile


class QueueSerializer(serializers.ModelSerializer):
    # Shared queue intentionally exposes no identity documents or contact details.
    class Meta:
        model = VerificationApplication
        fields = ["id", "business_id", "assigned_to_id", "submitted_at"]


class QueueView(generics.ListAPIView):
    serializer_class = QueueSerializer

    def get_queryset(self):
        require_operator(self.request.user)
        return VerificationApplication.objects.filter(business__status="pending").order_by(
            "submitted_at", "id"
        )


class InboxSerializer(serializers.ModelSerializer):
    class Meta:
        model = InboxNotification
        fields = ["id", "topic", "payload", "created_at"]


class InboxView(generics.ListAPIView):
    serializer_class = InboxSerializer

    def get_queryset(self):
        return InboxNotification.objects.filter(recipient_id=self.request.user.pk).order_by(
            "-created_at", "id"
        )


class UploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    purpose = serializers.ChoiceField(
        choices=[("identity", "هویت"), ("activity", "فعالیت"), ("product_image", "تصویر محصول")]
    )
    consent_version = serializers.CharField(max_length=40)


class FileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoredFile
        fields = ["id", "purpose", "size", "content_type", "scan_status"]


class DownloadSerializer(serializers.Serializer):
    url = serializers.URLField()
    expires_in = serializers.IntegerField()


class UploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "upload"

    @extend_schema(request=UploadSerializer, responses={201: FileSerializer})
    def post(self, request, pk):
        business = get_object_or_404(Business, pk=pk, membership__user=request.user)
        if len(request.FILES.getlist("file")) != 1 or len(request.FILES) != 1:
            raise serializers.ValidationError("در هر درخواست یک فایل ارسال کنید.")
        data = validated(UploadSerializer, request)
        file = upload_document(
            actor=request.user,
            business=business,
            purpose=data["purpose"],
            consent=data["consent_version"],
            upload=data["file"],
        )
        return Response(FileSerializer(file).data, status=201)


class DownloadView(APIView):
    @extend_schema(request=None, responses=DownloadSerializer)
    def post(self, request, pk):
        file = get_object_or_404(StoredFile.objects.select_related("business__verification"), pk=pk)
        return Response({"url": download_document(actor=request.user, file=file), "expires_in": 60})


class OperatorAccessSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    reason = serializers.CharField(max_length=2000)


class ReassignSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    reason = serializers.CharField(max_length=2000)


class OperatorAccessView(APIView):
    @extend_schema(request=OperatorAccessSerializer, responses={204: None})
    def post(self, request, pk):
        from marketplace.accounts.role_services import set_operator

        set_operator(actor=request.user, user_id=pk, **validated(OperatorAccessSerializer, request))
        return Response(status=204)


class ReassignView(APIView):
    @extend_schema(request=ReassignSerializer, responses={204: None})
    def post(self, request, pk):
        from marketplace.accounts.permissions import require_owner
        from marketplace.accounts.role_services import reassign

        require_owner(request.user)
        get_object_or_404(Business, pk=pk)
        reassign(actor=request.user, business_id=pk, **validated(ReassignSerializer, request))
        return Response(status=204)
