import hashlib
import secrets
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from marketplace.operations.services import audit, notify

from .models import AuthSession, EmailChallenge, User


def change_email(*, actor, email, current_password):
    try:
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=actor.pk)
            if not user.is_active or user.is_suspended or not user.check_password(current_password):
                raise ValidationError({"current_password": "رمز فعلی معتبر نیست."})
            normalized = email.strip().lower()
            if normalized == user.email:
                return
            user.email = normalized
            user.email_verified_at = None
            user.save(update_fields=["email", "email_verified_at", "updated_at"])
            EmailChallenge.objects.filter(user=user, consumed_at__isnull=True).update(
                consumed_at=timezone.now()
            )
            audit(actor=user, action="email.changed", target=user)
            if normalized:
                notify(recipient=user, topic="email.verify", payload={})
    except IntegrityError as exc:
        raise ValidationError({"email": "امکان استفاده از این ایمیل وجود ندارد."}) from exc


def digest(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


@transaction.atomic
def request_email(*, actor=None, email=None, purpose):
    users = User.objects.filter(is_active=True, is_suspended=False).exclude(email="")
    if purpose == "verify":
        user = users.filter(pk=actor.pk, email_verified_at__isnull=True).first()
    else:
        user = users.filter(email__iexact=email, email_verified_at__isnull=False).first()
    if user:
        notify(recipient=user, topic=f"email.{purpose}", payload={})
    # Same response for missing, unverified and suspended accounts.


def send_challenge(event):
    purpose = event.topic.split(".")[1]
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=event.recipient_id)
        if not user.is_active or user.is_suspended or not user.email:
            return
        if (purpose == "reset") != bool(user.email_verified_at):
            return
        now = timezone.now()
        EmailChallenge.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).update(
            consumed_at=now
        )
        raw = secrets.token_urlsafe(32)
        EmailChallenge.objects.create(
            user=user,
            purpose=purpose,
            email=user.email,
            token_digest=digest(raw),
            expires_at=now + timedelta(minutes=30),
        )
        address = user.email
    # SMTP is outside the database transaction. Retry rotates the secret.
    link = settings.ACCOUNT_LINK_BASE_URL + "?" + urlencode({"purpose": purpose, "token": raw})
    send_mail(
        "تأیید ایمیل" if purpose == "verify" else "بازیابی رمز عبور",
        f"این لینک تا ۳۰ دقیقه معتبر است:\n{link}",
        settings.DEFAULT_FROM_EMAIL,
        [address],
        fail_silently=False,
    )


@transaction.atomic
def consume_challenge(*, raw, purpose, password=None):
    candidate = EmailChallenge.objects.filter(token_digest=digest(raw), purpose=purpose).first()
    if not candidate:
        raise ValidationError("لینک معتبر نیست یا منقضی شده است.")
    user = User.objects.select_for_update().get(pk=candidate.user_id)
    challenge = EmailChallenge.objects.select_for_update().get(pk=candidate.pk)
    if (
        challenge.consumed_at
        or challenge.expires_at <= timezone.now()
        or challenge.email != user.email
        or not user.is_active
        or user.is_suspended
        or (purpose == "reset" and not user.email_verified_at)
    ):
        raise ValidationError("لینک معتبر نیست یا منقضی شده است.")
    if purpose == "verify":
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at", "updated_at"])
    else:
        validate_password(password, user)
        user.set_password(password)
        user.save(update_fields=["password", "updated_at"])
        AuthSession.objects.filter(user=user, revoked_at__isnull=True).update(
            revoked_at=timezone.now()
        )
    EmailChallenge.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )
    audit(actor=user, action=f"email.{purpose}.consumed", target=user)
