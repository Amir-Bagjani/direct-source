from datetime import UTC, datetime

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken, UntypedToken

from marketplace.operations.services import audit

from .models import AuthSession, User, normalize_mobile


def register(*, password, accept_terms, **data):
    if not accept_terms:
        raise ValidationError({"accept_terms": "پذیرش قوانین و حریم خصوصی لازم است."})
    data["mobile"] = normalize_mobile(data["mobile"])
    data["email"] = data.get("email", "").strip().lower()
    validate_password(password, User(**data))
    try:
        with transaction.atomic():
            user = User.objects.create_user(
                password=password,
                **data,
                terms_version=settings.TERMS_VERSION,
                privacy_version=settings.PRIVACY_VERSION,
                consented_at=timezone.now(),
            )
            audit(actor=user, action="user.registered", target=user)
            return user
    except IntegrityError as exc:
        raise ValidationError("امکان ثبت‌نام با اطلاعات واردشده وجود ندارد.") from exc


def token_pair(user, session=None):
    token = RefreshToken.for_user(user)
    if session is None:
        session = AuthSession.objects.create(
            user=user,
            current_jti=token["jti"],
            expires_at=datetime.fromtimestamp(token["exp"], tz=UTC),
        )
    else:
        token["exp"] = int(session.expires_at.timestamp())
        session.current_jti = token["jti"]
        session.save(update_fields=["current_jti", "updated_at"])
    token["sid"] = str(session.pk)
    return {"access": str(token.access_token), "refresh": str(token)}


def login(*, mobile, password):
    user = authenticate(mobile=normalize_mobile(mobile), password=password)
    if user is None:
        raise AuthenticationFailed("اطلاعات ورود معتبر نیست.")
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user.pk)
        # Recheck after the lock, including a concurrent password reset.
        if not user.is_active or user.is_suspended or not user.check_password(password):
            raise AuthenticationFailed("اطلاعات ورود معتبر نیست.")
        pair = token_pair(user)
        audit(actor=user, action="session.opened", target=user)
        return pair


def refresh(*, raw):
    try:
        claims = UntypedToken(raw)  # verify signature/expiry before looking up a family
        if claims.get("token_type") != "refresh" or not claims.get("sid"):
            raise TokenError()
    except TokenError as exc:
        raise AuthenticationFailed("نشست معتبر نیست.") from exc
    invalid = False
    with transaction.atomic():
        try:
            user = User.objects.select_for_update().get(pk=claims["user_id"])
            session = AuthSession.objects.select_for_update().get(pk=claims["sid"], user=user)
        except (User.DoesNotExist, AuthSession.DoesNotExist, ValueError) as exc:
            raise AuthenticationFailed("نشست معتبر نیست.") from exc
        if (
            session.revoked_at
            or session.expires_at <= timezone.now()
            or not user.is_active
            or user.is_suspended
        ):
            invalid = True
        elif session.current_jti != claims["jti"]:
            session.revoked_at = timezone.now()
            session.save(update_fields=["revoked_at", "updated_at"])
            audit(actor=user, action="session.refresh_reuse", target=session)
            invalid = True
        else:
            try:
                old = RefreshToken(raw)
            except TokenError:
                invalid = True
            else:
                old.blacklist()
                result = token_pair(user, session)
    # Raising inside atomic would roll back the reuse revocation.
    if invalid:
        raise AuthenticationFailed("نشست معتبر نیست.")
    return result


@transaction.atomic
def logout(*, actor, sid, all_sessions=False):
    user = User.objects.select_for_update().get(pk=actor.pk)
    sessions = AuthSession.objects.filter(user=user, revoked_at__isnull=True)
    if not all_sessions:
        sessions = sessions.filter(pk=sid)
    sessions.update(revoked_at=timezone.now())
    audit(
        actor=user, action="session.logout_all" if all_sessions else "session.logout", target=user
    )
