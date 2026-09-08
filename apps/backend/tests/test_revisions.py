import copy

import pytest
from django.db import DatabaseError, transaction
from rest_framework.exceptions import PermissionDenied

from marketplace.accounts import (
    business_services,
    revision_services,
    role_services,
    verification_services,
)
from marketplace.accounts.models import BusinessRevision
from marketplace.common.exceptions import Conflict

from .test_business import complete_application

pytestmark = pytest.mark.django_db


@pytest.fixture
def verified_business(user_factory, business_data):
    user, operator = user_factory(), user_factory(role="operator")
    business = business_services.create_business(actor=user, **business_data)
    complete_application(user, business)
    verification_services.claim(actor=operator, business_id=business.pk)
    for kind in ["identity", "activity"]:
        verification_services.review(
            actor=operator,
            business_id=business.pk,
            kind=kind,
            decision="approved",
            reason="پذیرفته",
        )
    business.refresh_from_db()
    return user, operator, business


def test_revision_keeps_live_data_until_approval(verified_business, client, user_factory):
    user, operator, business = verified_business
    before = revision_services.snapshot(business)
    profile = copy.deepcopy(before["profile"])
    profile["name"] = "نام جدید کارگاه"
    profile["address"]["city"] = "کرج"
    first_verified_at = business.first_verified_at
    client.force_authenticate(user)
    response = client.post(
        f"/api/v1/businesses/{business.pk}/revisions/", {"profile": profile}, format="json"
    )
    assert response.status_code == 201, response.data
    revision_id = response.data["id"]
    assert response.data["identity_status"] == "approved"
    assert response.data["activity_status"] == "pending"
    business.refresh_from_db()
    assert revision_services.snapshot(business) == before
    assert business.status == "verified"
    with pytest.raises(Conflict):
        revision_services.propose(actor=user, business_id=business.pk, changes={"profile": profile})
    stranger = user_factory(role="operator")
    client.force_authenticate(stranger)
    assert client.get(f"/api/v1/business-revisions/{revision_id}/").status_code == 404
    client.force_authenticate(operator)
    assert client.get("/api/v1/operations/business-revision-queue/").data["count"] == 1
    assert client.post(f"/api/v1/business-revisions/{revision_id}/claim/").status_code == 200
    response = client.post(
        f"/api/v1/business-revisions/{revision_id}/review/",
        {"kind": "activity", "decision": "approved", "reason": "نشانی و نام بررسی شد"},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["status"] == "approved"
    business.refresh_from_db()
    assert business.name == profile["name"]
    assert business.addresses.get().city == "کرج"
    assert business.first_verified_at == first_verified_at
    revision = BusinessRevision.objects.get(pk=revision_id)
    assert revision.before == before
    with pytest.raises(DatabaseError), transaction.atomic():
        BusinessRevision.objects.filter(pk=revision_id).update(before={})


def test_rejected_revision_does_not_revoke_business(verified_business):
    user, operator, business = verified_business
    before = revision_services.snapshot(business)
    identity = {**before["identity"], "national_id": "9876543210"}
    revision = revision_services.propose(
        actor=user, business_id=business.pk, changes={"identity": identity}
    )
    revision_services.claim(actor=operator, revision_id=revision.pk)
    revision_services.review(
        actor=operator,
        revision_id=revision.pk,
        kind="identity",
        decision="rejected",
        reason="مدرک مطابق نیست",
    )
    business.refresh_from_db()
    assert revision_services.snapshot(business) == before and business.status == "verified"
    revision_services.propose(actor=user, business_id=business.pk, changes={"identity": identity})


def test_revision_correction_only_returned_section(verified_business, user_factory):
    user, operator, business = verified_business
    before = revision_services.snapshot(business)
    profile = {**before["profile"], "name": "نام جدید"}
    revision = revision_services.propose(
        actor=user, business_id=business.pk, changes={"profile": profile}
    )
    with pytest.raises(PermissionDenied):
        revision_services.review(
            actor=operator,
            revision_id=revision.pk,
            kind="activity",
            decision="approved",
            reason="تأیید",
        )
    revision_services.claim(actor=operator, revision_id=revision.pk)
    revision_services.review(
        actor=operator,
        revision_id=revision.pk,
        kind="activity",
        decision="changes_requested",
        reason="اصلاح نام",
    )
    with pytest.raises(Conflict):
        revision_services.resubmit(
            actor=user, revision_id=revision.pk, changes={"identity": before["identity"]}
        )
    revision_services.resubmit(
        actor=user,
        revision_id=revision.pk,
        changes={"profile": {**profile, "name": "نام اصلاح‌شده"}},
    )
    owner = user_factory(role="owner")
    role_services.set_operator(
        actor=owner, user_id=operator.pk, enabled=False, reason="تعویض مسئول"
    )
    revision.refresh_from_db()
    assert revision.assigned_to_id is None
    next_operator = user_factory(role="operator")
    revision_services.claim(actor=next_operator, revision_id=revision.pk)
    revision_services.review(
        actor=next_operator,
        revision_id=revision.pk,
        kind="activity",
        decision="approved",
        reason="اصلاح پذیرفته",
    )
    business.refresh_from_db()
    assert business.name == "نام اصلاح‌شده"
