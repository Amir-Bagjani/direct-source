from typing import cast

from django.utils import timezone
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from .models import AuthSession, User


class SessionJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = cast(User, super().get_user(validated_token))
        if (
            user.is_suspended
            or not AuthSession.objects.filter(
                pk=validated_token.get("sid"),
                user=user,
                revoked_at__isnull=True,
                expires_at__gt=timezone.now(),
            ).exists()
        ):
            raise AuthenticationFailed("نشست معتبر نیست.", code="session_revoked")
        return user


class SessionJWTScheme(OpenApiAuthenticationExtension):
    target_class = "marketplace.accounts.authentication.SessionJWTAuthentication"
    name = "bearerAuth"

    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
