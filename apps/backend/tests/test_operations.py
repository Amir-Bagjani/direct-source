import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.exceptions import PermissionDenied

from marketplace.accounts import business_services, role_services, verification_services
from marketplace.accounts.models import Business, PlatformRole
from marketplace.operations.models import AuditEvent

pytestmark = pytest.mark.django_db


def test_operator_disable_releases_open_claims(user_factory, business_data):
    owner, operator, user = (
        user_factory(role="owner"),
        user_factory(role="operator"),
        user_factory(),
    )
    business = business_services.create_business(actor=user, **business_data)
    Business.objects.filter(pk=business.pk).update(status="pending")
    verification_services.claim(actor=operator, business_id=business.pk)
    role_services.set_operator(
        actor=owner, user_id=operator.pk, enabled=False, reason="پایان همکاری"
    )
    business.verification.refresh_from_db()
    assert business.verification.assigned_to_id is None
    assert not PlatformRole.objects.get(user=operator).is_active
    assert AuditEvent.objects.filter(action="verification.released").exists()
    with pytest.raises(PermissionDenied):
        verification_services.claim(actor=operator, business_id=business.pk)


def test_reassignment_requires_platform_owner(user_factory, business_data):
    owner, operator, next_operator, user = (
        user_factory(role="owner"),
        user_factory(role="operator"),
        user_factory(role="operator"),
        user_factory(),
    )
    business = business_services.create_business(actor=user, **business_data)
    Business.objects.filter(pk=business.pk).update(status="pending")
    verification_services.claim(actor=operator, business_id=business.pk)
    with pytest.raises(PermissionDenied):
        role_services.reassign(
            actor=operator, business_id=business.pk, user_id=next_operator.pk, reason="واگذاری"
        )
    role_services.reassign(
        actor=owner, business_id=business.pk, user_id=next_operator.pk, reason="واگذاری"
    )
    business.verification.refresh_from_db()
    assert business.verification.assigned_to_id == next_operator.pk


def test_dual_role_can_read_own_business(client, user_factory, business_data):
    user = user_factory(role="operator")
    business = business_services.create_business(actor=user, **business_data)
    client.force_authenticate(user)
    assert client.get(f"/api/v1/businesses/{business.pk}/").status_code == 200


def test_bootstrap_owner_once(user_factory):
    user = user_factory()
    call_command("bootstrap_owner", user.mobile, reason="راه‌اندازی نخست")
    assert PlatformRole.objects.filter(user=user, role="owner").exists()
    with pytest.raises(CommandError):
        call_command("bootstrap_owner", user.mobile, reason="دوباره")
