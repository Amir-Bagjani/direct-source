from django.conf import settings
from django.core.files.storage import default_storage
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.accounts.api import validated
from marketplace.accounts.models import Business, VerificationApplication
from marketplace.accounts.permissions import has_role, require_operator

from .files import download_document, upload_document
from .models import InboxNotification, StoredFile


class QueueSerializer(serializers.ModelSerializer):
    status = serializers.CharField(source="business.status", read_only=True)

    # Shared queue intentionally exposes no identity documents or contact details.
    class Meta:
        model = VerificationApplication
        fields = ["id", "business_id", "assigned_to_id", "submitted_at", "status"]


class QueueView(generics.ListAPIView):
    serializer_class = QueueSerializer

    def get_queryset(self):
        require_operator(self.request.user)
        qs = VerificationApplication.objects.select_related("business")
        open_statuses = ["pending", "changes_requested", "rejected"]
        if has_role(self.request.user, "owner"):
            qs = qs.filter(business__status__in=open_statuses)
        else:
            qs = qs.filter(
                Q(business__status="pending")
                | Q(assigned_to=self.request.user, business__status__in=open_statuses)
            )
        return qs.order_by("submitted_at", "id")


class InboxSerializer(serializers.ModelSerializer):
    payload = serializers.SerializerMethodField()

    def get_payload(self, obj) -> dict:
        from marketplace.logistics.delivery import recipient_payload

        return recipient_payload(obj)

    class Meta:
        model = InboxNotification
        fields = ["id", "topic", "payload", "created_at"]


class InboxView(generics.ListAPIView):
    serializer_class = InboxSerializer

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response

    def get_queryset(self):
        return InboxNotification.objects.filter(recipient_id=self.request.user.pk).order_by(
            "-created_at", "id"
        )


class UploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    purpose = serializers.ChoiceField(
        choices=[
            ("identity", "هویت"),
            ("activity", "فعالیت"),
            ("product_image", "تصویر محصول"),
            ("business_logo", "لوگو"),
            ("suspension", "مدرک تعلیق"),
        ]
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
        if request.data.get("purpose") == "suspension":
            from marketplace.accounts.api import visible_businesses
            require_operator(request.user)
            business = get_object_or_404(visible_businesses(request.user), pk=pk)
        else:
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


class DocumentPolicySerializer(serializers.Serializer):
    consent_version = serializers.CharField()


class DocumentPolicyView(APIView):
    @extend_schema(responses=DocumentPolicySerializer)
    def get(self, request):
        return Response({"consent_version": settings.DOCUMENT_CONSENT_VERSION})


class FileContentView(APIView):
    @extend_schema(responses={(200, "application/octet-stream"): bytes})
    def get(self, request, pk):
        file = get_object_or_404(StoredFile.objects.select_related("business__verification"), pk=pk)
        download_document(actor=request.user, file=file)
        response = FileResponse(
            default_storage.open(file.object_key, "rb"), content_type=file.content_type
        )
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        response["Content-Disposition"] = 'inline; filename="document"'
        return response
