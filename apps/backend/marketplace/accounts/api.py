from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import auth_services, business_services, email_services, verification_services
from .models import Business
from .permissions import has_role, require_operator
from .serializers import (
    ActivitySerializer,
    BusinessInputSerializer,
    BusinessSerializer,
    ControlledAccessSerializer,
    EmailChangeSerializer,
    EmailRequestSerializer,
    EmailTokenSerializer,
    IdentitySerializer,
    LoginSerializer,
    LogoutSerializer,
    ReasonSerializer,
    RefreshSerializer,
    RegisterSerializer,
    ResetSerializer,
    ReviewSerializer,
    SectionSerializer,
    TokenPairSerializer,
    UserSerializer,
)


def validated(serializer_class, request):
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def visible_businesses(actor):
    qs = Business.objects.prefetch_related("addresses").select_related("verification")
    if has_role(actor, "owner"):
        return qs
    if has_role(actor, "operator"):
        return qs.filter(Q(verification__assigned_to=actor) | Q(membership__user=actor)).distinct()
    return qs.filter(membership__user=actor)


class PublicView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'


class RegisterView(PublicView):
    throttle_scope = "register"

    @extend_schema(request=RegisterSerializer, responses={201: UserSerializer})
    def post(self, request):
        user = auth_services.register(**validated(RegisterSerializer, request))
        return Response(UserSerializer(user).data, status=201)


class LoginView(PublicView):
    throttle_scope = "login"

    @extend_schema(request=LoginSerializer, responses=TokenPairSerializer)
    def post(self, request):
        return Response(auth_services.login(**validated(LoginSerializer, request)))


class RefreshView(PublicView):
    throttle_scope = "refresh"

    @extend_schema(request=RefreshSerializer, responses=TokenPairSerializer)
    def post(self, request):
        return Response(auth_services.refresh(raw=validated(RefreshSerializer, request)["refresh"]))


class LogoutView(APIView):
    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        auth_services.logout(
            actor=request.user, sid=request.auth["sid"], **validated(LogoutSerializer, request)
        )
        return Response(status=204)


class MeView(APIView):
    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class VerifyEmailRequestView(APIView):
    throttle_scope = "email"

    @extend_schema(request=None, responses={202: None})
    def post(self, request):
        email_services.request_email(actor=request.user, purpose="verify")
        return Response(status=202)


class ChangeEmailView(APIView):
    throttle_scope = "email"

    @extend_schema(request=EmailChangeSerializer, responses={204: None})
    def put(self, request):
        email_services.change_email(actor=request.user, **validated(EmailChangeSerializer, request))
        return Response(status=204)


class VerifyEmailView(PublicView):
    throttle_scope = "email"

    @extend_schema(request=EmailTokenSerializer, responses={204: None})
    def post(self, request):
        email_services.consume_challenge(
            raw=validated(EmailTokenSerializer, request)["token"], purpose="verify"
        )
        return Response(status=204)


class ResetRequestView(PublicView):
    throttle_scope = "email"

    @extend_schema(request=EmailRequestSerializer, responses={202: None})
    def post(self, request):
        email_services.request_email(**validated(EmailRequestSerializer, request), purpose="reset")
        return Response(status=202)


class ResetView(PublicView):
    throttle_scope = "email"

    @extend_schema(request=ResetSerializer, responses={204: None})
    def post(self, request):
        data = validated(ResetSerializer, request)
        email_services.consume_challenge(
            raw=data["token"], password=data["password"], purpose="reset"
        )
        return Response(status=204)


class BusinessListView(generics.ListCreateAPIView):
    serializer_class = BusinessSerializer

    def get_queryset(self):
        assert self.request.user.pk is not None  # IsAuthenticated is evaluated before the selector.
        return (
            Business.objects.filter(membership__user_id=self.request.user.pk)
            .prefetch_related("addresses")
            .order_by("created_at", "id")
        )

    @extend_schema(request=BusinessInputSerializer, responses={201: BusinessSerializer})
    def post(self, request, *args, **kwargs):
        business = business_services.create_business(
            actor=request.user, **validated(BusinessInputSerializer, request)
        )
        return Response(BusinessSerializer(business).data, status=status.HTTP_201_CREATED)


class BusinessDetailView(generics.RetrieveAPIView):
    serializer_class = BusinessSerializer

    def get_queryset(self):
        return visible_businesses(self.request.user)


class SectionsView(APIView):
    @extend_schema(responses=SectionSerializer(many=True))
    def get(self, request, pk):
        business = get_object_or_404(visible_businesses(request.user), pk=pk)
        return Response(
            SectionSerializer(business.verification.sections.all().order_by("kind"), many=True).data
        )


class IdentityView(APIView):
    @extend_schema(request=IdentitySerializer, responses=SectionSerializer)
    def put(self, request, pk):
        get_object_or_404(visible_businesses(request.user), pk=pk)
        section = verification_services.save_section(
            actor=request.user,
            business_id=pk,
            kind="identity",
            data=validated(IdentitySerializer, request),
        )
        return Response(SectionSerializer(section).data)


class ActivityView(APIView):
    @extend_schema(request=ActivitySerializer, responses=SectionSerializer)
    def put(self, request, pk):
        get_object_or_404(visible_businesses(request.user), pk=pk)
        section = verification_services.save_section(
            actor=request.user,
            business_id=pk,
            kind="activity",
            data=validated(ActivitySerializer, request),
        )
        return Response(SectionSerializer(section).data)


class SubmitView(APIView):
    @extend_schema(request=None, responses=BusinessSerializer)
    def post(self, request, pk):
        get_object_or_404(visible_businesses(request.user), pk=pk)
        return Response(
            BusinessSerializer(
                verification_services.submit(actor=request.user, business_id=pk)
            ).data
        )


class ClaimView(APIView):
    @extend_schema(request=None, responses=BusinessSerializer)
    def post(self, request, pk):
        require_operator(request.user)
        get_object_or_404(Business, pk=pk)
        return Response(
            BusinessSerializer(verification_services.claim(actor=request.user, business_id=pk)).data
        )


class ReviewView(APIView):
    @extend_schema(request=ReviewSerializer, responses=BusinessSerializer)
    def post(self, request, pk):
        get_object_or_404(visible_businesses(request.user), pk=pk)
        result = verification_services.review(
            actor=request.user, business_id=pk, **validated(ReviewSerializer, request)
        )
        return Response(BusinessSerializer(result).data)


class ReopenView(APIView):
    @extend_schema(request=ReasonSerializer, responses=BusinessSerializer)
    def post(self, request, pk):
        get_object_or_404(visible_businesses(request.user), pk=pk)
        result = verification_services.reopen(
            actor=request.user, business_id=pk, **validated(ReasonSerializer, request)
        )
        return Response(BusinessSerializer(result).data)


class ControlledAccessView(APIView):
    @extend_schema(request=ControlledAccessSerializer, responses=BusinessSerializer)
    def post(self, request, pk):
        get_object_or_404(visible_businesses(request.user), pk=pk)
        result = business_services.set_controlled_access(
            actor=request.user, business_id=pk, **validated(ControlledAccessSerializer, request)
        )
        return Response(BusinessSerializer(result).data)
