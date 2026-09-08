from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import IntegrityError, close_old_connections, transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.accounts import business_services, verification_services
from marketplace.accounts.models import Business, Membership
from marketplace.accounts.permissions import can_start_trade, can_view_wholesale
from marketplace.common.exceptions import Conflict
from marketplace.operations.models import AuditEvent, StoredFile
from marketplace.operations.tasks import deliver_outbox

pytestmark = pytest.mark.django_db


def complete_application(user, business):
    def file(kind, name):
        return StoredFile.objects.create(
            owner=user,
            business=business,
            purpose=kind,
            object_key=f"{business.pk}/{name}",
            size=10,
            content_type="image/png",
            sha256="0" * 64,
            scan_status="clean",
            consent_version="2026-09-07",
        ).pk

    verification_services.save_section(
        actor=user,
        business_id=business.pk,
        kind="identity",
        data={
            "national_id": "0123456789",
            "birth_date": "1990-01-01",
            "card_front": file("identity", "front"),
            "card_back": file("identity", "back"),
            "selfie": file("identity", "selfie"),
        },
    )
    verification_services.save_section(
        actor=user,
        business_id=business.pk,
        kind="activity",
        data={"evidence_type": "license", "files": [file("activity", "license")]},
    )
    verification_services.submit(actor=user, business_id=business.pk)


def test_business_creation_and_tenant_isolation(client, user_factory, business_data):
    user, other = user_factory(), user_factory()
    client.force_authenticate(user)
    response = client.post("/api/v1/businesses/", business_data, format="json")
    assert response.status_code == 201
    assert response.data["status"] == "draft" and not response.data["controlled_access"]
    assert client.post("/api/v1/businesses/", business_data, format="json").status_code == 409
    client.force_authenticate(other)
    assert client.get(f"/api/v1/businesses/{response.data['id']}/").status_code == 404
    assert client.get("/api/v1/businesses/").data["count"] == 0
    assert not can_view_wholesale(user)


def test_two_sections_correction_preserves_approved_identity(user_factory, business_data):
    user, operator, stranger = (
        user_factory(),
        user_factory(role="operator"),
        user_factory(role="operator"),
    )
    business = business_services.create_business(actor=user, **business_data)
    with pytest.raises(ValidationError):
        verification_services.submit(actor=user, business_id=business.pk)
    complete_application(user, business)
    verification_services.claim(actor=operator, business_id=business.pk)
    with pytest.raises(PermissionDenied):
        verification_services.review(
            actor=stranger,
            business_id=business.pk,
            kind="identity",
            decision="approved",
            reason="تطابق",
        )
    verification_services.review(
        actor=operator,
        business_id=business.pk,
        kind="identity",
        decision="approved",
        reason="تطابق",
    )
    verification_services.review(
        actor=operator,
        business_id=business.pk,
        kind="activity",
        decision="changes_requested",
        reason="تصویر ناقص",
    )
    with pytest.raises(Conflict):
        verification_services.save_section(
            actor=user, business_id=business.pk, kind="identity", data={}
        )
    section = business.verification.sections.get(kind="activity")
    verification_services.save_section(
        actor=user, business_id=business.pk, kind="activity", data=section.data
    )
    verification_services.submit(actor=user, business_id=business.pk)
    assert business.verification.sections.get(kind="identity").status == "approved"
    verification_services.review(
        actor=operator,
        business_id=business.pk,
        kind="activity",
        decision="approved",
        reason="اصلاح کامل",
    )
    business.refresh_from_db()
    assert business.status == "verified" and business.first_verified_at
    assert not can_start_trade(business)
    owner = user_factory(role="owner")
    with pytest.raises(PermissionDenied):
        business_services.set_controlled_access(
            actor=operator, business_id=business.pk, enabled=True, reason="شروع"
        )
    business = business_services.set_controlled_access(
        actor=owner, business_id=business.pk, enabled=True, reason="شروع"
    )
    assert can_start_trade(business)
    assert deliver_outbox() == 3
    assert deliver_outbox() == 0


def test_rejected_application_reopens_with_reason(user_factory, business_data):
    user, operator = user_factory(), user_factory(role="operator")
    business = business_services.create_business(actor=user, **business_data)
    complete_application(user, business)
    verification_services.claim(actor=operator, business_id=business.pk)
    verification_services.review(
        actor=operator,
        business_id=business.pk,
        kind="identity",
        decision="rejected",
        reason="عدم تطابق",
    )
    with pytest.raises(ValidationError):
        verification_services.reopen(actor=operator, business_id=business.pk, reason=" ")
    result = verification_services.reopen(
        actor=operator, business_id=business.pk, reason="مدارک جدید"
    )
    assert result.status == "changes_requested"
    assert AuditEvent.objects.filter(action="verification.reopened", reason="مدارک جدید").exists()


def test_audit_is_immutable_in_database(user_factory, business_data):
    from django.db import DatabaseError

    business_services.create_business(actor=user_factory(), **business_data)
    with pytest.raises(DatabaseError), transaction.atomic():
        AuditEvent.objects.all().update(reason="rewritten")
    with pytest.raises(DatabaseError), transaction.atomic():
        AuditEvent.objects.all().delete()


def test_membership_database_constraint(user_factory, business_data):
    user = user_factory()
    business = business_services.create_business(actor=user, **business_data)
    with pytest.raises(IntegrityError), transaction.atomic():
        Membership.objects.create(user=user_factory(), business=business)


@pytest.mark.parametrize(
    "kind,status,controlled,suspended,expected",
    [
        ("retailer", "verified", False, False, True),
        ("retailer", "verified", True, False, True),
        ("manufacturer", "verified", True, False, False),
        ("retailer", "pending", True, False, False),
        ("retailer", "suspended", True, False, False),
        ("retailer", "verified", True, True, False),
    ],
)
def test_wholesale_permission_axes(
    user_factory, business_data, kind, status, controlled, suspended, expected
):
    user = user_factory()
    business_data["kind"] = kind
    business = business_services.create_business(actor=user, **business_data)
    Business.objects.filter(pk=business.pk).update(status=status, controlled_access=controlled)
    user.is_suspended = suspended
    user.save()
    assert bool(can_view_wholesale(user)) == expected


@pytest.mark.django_db(transaction=True)
def test_concurrent_claim_has_one_winner(user_factory, business_data):
    user = user_factory()
    operators = [user_factory(role="operator"), user_factory(role="operator")]
    business = business_services.create_business(actor=user, **business_data)
    complete_application(user, business)
    barrier = Barrier(2)

    def claim(actor):
        close_old_connections()
        try:
            barrier.wait(timeout=5)
            verification_services.claim(actor=actor, business_id=business.pk)
            return "ok"
        except Conflict:
            return "conflict"
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(claim, operators)) == ["conflict", "ok"]
