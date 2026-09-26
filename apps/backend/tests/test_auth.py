from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from urllib.parse import parse_qs, urlparse

import pytest
from django.core import mail
from django.db import close_old_connections
from rest_framework.exceptions import AuthenticationFailed, ValidationError

from marketplace.accounts import auth_services, email_services
from marketplace.accounts.models import AuthSession, Business, EmailChallenge, User
from marketplace.operations.models import AuditEvent, InboxNotification
from marketplace.operations.tasks import deliver_email_outbox, deliver_outbox

pytestmark = pytest.mark.django_db


def test_registration_normalizes_mobile_without_business(client):
    data = {
        "mobile": "۰۹۱۲۱۲۳۴۵۶۷",
        "password": "A-long-secret-947!",
        "first_name": "آرش",
        "last_name": "نام",
        "accept_terms": True,
    }
    response = client.post("/api/v1/auth/register/", data, format="json")
    assert response.status_code == 201
    assert response.data["mobile"] == "+989121234567"
    assert "password" not in response.data
    assert not Business.objects.exists()
    user = User.objects.get()
    assert user.check_password(data["password"])
    assert user.consented_at and user.terms_version
    assert AuditEvent.objects.filter(action="user.registered").count() == 1
    data["mobile"] = "+989121234567"
    assert client.post("/api/v1/auth/register/", data, format="json").status_code == 400
    assert User.objects.count() == 1


@pytest.mark.parametrize(
    "changes", [{"accept_terms": False}, {"password": "1234"}, {"mobile": "bad"}]
)
def test_registration_validation(client, changes):
    data = {
        "mobile": "09121234567",
        "password": "A-long-secret-947!",
        "first_name": "آرش",
        "last_name": "نام",
        "accept_terms": True,
        **changes,
    }
    response = client.post("/api/v1/auth/register/", data, format="json")
    assert response.status_code == 400
    assert set(response.data) == {"code", "message", "fields", "request_id"}
    assert response.data["request_id"] == response["X-Request-ID"]
    assert not User.objects.exists()


def test_refresh_reuse_revokes_access_but_other_device_survives(client, user_factory):
    user = user_factory()
    first = auth_services.login(mobile=user.mobile, password="A-long-secret-947!")
    other = auth_services.login(mobile=user.mobile, password="A-long-secret-947!")
    rotated = auth_services.refresh(raw=first["refresh"])
    with pytest.raises(AuthenticationFailed):
        auth_services.refresh(raw=first["refresh"])
    client.credentials(HTTP_AUTHORIZATION="Bearer " + rotated["access"])
    assert client.get("/api/v1/auth/me/").status_code == 401
    client.credentials(HTTP_AUTHORIZATION="Bearer " + other["access"])
    assert client.get("/api/v1/auth/me/").status_code == 200
    assert AuthSession.objects.filter(revoked_at__isnull=False).count() == 1


def test_logout_all_and_suspension_are_immediate(client, user_factory):
    user = user_factory()
    pair = auth_services.login(mobile=user.mobile, password="A-long-secret-947!")
    client.credentials(HTTP_AUTHORIZATION="Bearer " + pair["access"])
    User.objects.filter(pk=user.pk).update(is_suspended=True)
    assert client.get("/api/v1/auth/me/").status_code == 401
    with pytest.raises(AuthenticationFailed):
        auth_services.login(mobile=user.mobile, password="A-long-secret-947!")
    User.objects.filter(pk=user.pk).update(is_suspended=False)
    assert (
        client.post("/api/v1/auth/logout/", {"all_sessions": True}, format="json").status_code
        == 204
    )
    assert client.get("/api/v1/auth/me/").status_code == 401
    with pytest.raises(AuthenticationFailed):
        auth_services.refresh(raw=pair["refresh"])


def email_token():
    link = urlparse(mail.outbox[-1].body.splitlines()[-1])
    assert not link.query
    challenge = parse_qs(link.fragment)
    assert challenge["purpose"][0] in {"verify", "reset"}
    return challenge["token"][0]


def test_verified_email_reset_invalidates_tokens_and_sessions(client, user_factory):
    user = user_factory(email="owner@example.test")
    pair = auth_services.login(mobile=user.mobile, password="A-long-secret-947!")
    email_services.request_email(email=user.email, purpose="reset")
    assert deliver_email_outbox() == 0
    email_services.request_email(actor=user, purpose="verify")
    assert deliver_outbox() == 0  # secret emails never become inbox messages
    assert deliver_email_outbox() == 1
    verify_token = email_token()
    email_services.consume_challenge(raw=verify_token, purpose="verify")
    user.refresh_from_db()
    assert user.email_verified_at
    with pytest.raises(ValidationError):
        email_services.consume_challenge(raw=verify_token, purpose="verify")
    email_services.request_email(email=user.email.upper(), purpose="reset")
    deliver_email_outbox()
    reset_token = email_token()
    assert not EmailChallenge.objects.filter(token_digest=reset_token).exists()
    response = client.post(
        "/api/v1/auth/password/reset/",
        {"token": reset_token, "password": "New-long-secret-648!"},
        format="json",
    )
    assert response.status_code == 204
    user.refresh_from_db()
    assert user.check_password("New-long-secret-648!")
    assert not AuthSession.objects.filter(revoked_at__isnull=True).exists()
    assert not InboxNotification.objects.exists()
    assert (
        client.post(
            "/api/v1/auth/password/reset/",
            {"token": reset_token, "password": "Another-secret-648!"},
            format="json",
        ).status_code
        == 400
    )
    with pytest.raises(AuthenticationFailed):
        auth_services.refresh(raw=pair["refresh"])


def test_reset_request_does_not_disclose_account(client, user_factory):
    user = user_factory(email="known@example.test")
    a = client.post("/api/v1/auth/password/request/", {"email": user.email}, format="json")
    b = client.post(
        "/api/v1/auth/password/request/", {"email": "absent@example.test"}, format="json"
    )
    assert a.status_code == b.status_code == 202
    assert a.data == b.data


def test_email_change_requires_password_and_invalidates_old_link(client, user_factory):
    from django.utils import timezone

    user = user_factory(email="original@example.test", email_verified_at=timezone.now())
    email_services.request_email(email=user.email, purpose="reset")
    deliver_email_outbox()
    old_token = email_token()
    client.force_authenticate(user)
    assert (
        client.put(
            "/api/v1/auth/email/",
            {"email": "new@example.test", "current_password": "wrong"},
            format="json",
        ).status_code
        == 400
    )
    assert (
        client.put(
            "/api/v1/auth/email/",
            {"email": "new@example.test", "current_password": "A-long-secret-947!"},
            format="json",
        ).status_code
        == 204
    )
    user.refresh_from_db()
    assert user.email_verified_at is None
    with pytest.raises(ValidationError):
        email_services.consume_challenge(
            raw=old_token, purpose="reset", password="New-secret-pass-468!"
        )


def test_bad_credentials_and_expired_recovery_are_rejected(client, user_factory):
    from datetime import timedelta

    from django.utils import timezone

    user = user_factory(email="expiry@example.test", email_verified_at=timezone.now())
    response = client.post(
        "/api/v1/auth/login/", {"mobile": user.mobile, "password": "incorrect"}, format="json"
    )
    assert response.status_code == 401
    assert (
        client.post(
            "/api/v1/auth/refresh/", {"refresh": "invalid-token"}, format="json"
        ).status_code
        == 401
    )
    email_services.request_email(email=user.email, purpose="reset")
    deliver_email_outbox()
    raw = email_token()
    EmailChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    with pytest.raises(ValidationError):
        email_services.consume_challenge(raw=raw, purpose="reset", password="New-long-secret-947!")
    user.refresh_from_db()
    assert user.check_password("A-long-secret-947!")


@pytest.mark.django_db(transaction=True)
def test_concurrent_refresh_only_one_success(user_factory):
    user = user_factory()
    pair = auth_services.login(mobile=user.mobile, password="A-long-secret-947!")
    barrier = Barrier(2)

    def rotate():
        close_old_connections()
        try:
            barrier.wait(timeout=5)
            auth_services.refresh(raw=pair["refresh"])
            return "ok"
        except AuthenticationFailed:
            return "denied"
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: rotate(), range(2))) == ["denied", "ok"]
    assert AuthSession.objects.get().revoked_at is not None
