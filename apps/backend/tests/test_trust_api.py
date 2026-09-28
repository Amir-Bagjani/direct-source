import pytest
from rest_framework.exceptions import NotFound, ValidationError

from marketplace.accounts import business_services
from marketplace.operations import files, suspensions, work
from marketplace.operations.models import StoredFile

pytestmark = pytest.mark.django_db


def test_directory_owner_only_and_suspension_history_is_scoped(client, user_factory, business_data):
    user, other = user_factory(), user_factory()
    operator, owner = user_factory(role="operator"), user_factory(role="owner")
    business = business_services.create_business(actor=user, **business_data)
    for actor in [user]:
        client.force_authenticate(actor)
        assert client.get("/api/v1/accounts/directory/").status_code == 403
    client.force_authenticate(operator)
    assert client.get("/api/v1/accounts/trust-access/").data == {"owner": False}
    assert client.get("/api/v1/accounts/directory/").data["count"] == 0
    business.verification.assigned_to = operator
    business.verification.save()
    assigned = client.get("/api/v1/accounts/directory/")
    assert assigned.data["count"] == 1
    assert assigned.data["results"][0]["id"] == str(user.pk)
    client.force_authenticate(owner)
    directory = client.get("/api/v1/accounts/directory/")
    assert directory.status_code == 200 and directory.data["count"] == 4
    row = next(row for row in directory.data["results"] if row["id"] == str(user.pk))
    assert row["business"]["id"] == str(business.pk)
    case = suspensions.propose(actor=operator, business_id=business.pk, reason="بررسی")
    client.force_authenticate(user)
    assert client.get("/api/v1/accounts/suspensions/").data["count"] == 0
    suspensions.transition(actor=owner, pk=case["id"], action="activate", reason="تأیید")
    assert client.get("/api/v1/accounts/suspensions/").data["count"] == 1
    client.force_authenticate(other)
    assert client.get("/api/v1/accounts/suspensions/").data["count"] == 0
    suspensions.transition(actor=owner, pk=case["id"], action="restore", reason="رفع")
    client.force_authenticate(user)
    assert client.get("/api/v1/accounts/suspensions/").data["results"][0]["status"] == "restored"
    client.force_authenticate(owner)
    assert client.get("/api/v1/operations/work/?kind=suspension").data["count"] == 0
    history = client.get("/api/v1/operations/work/?kind=suspension&include_closed=true")
    assert history.data["results"][0]["status"] == "restored"


def test_suspension_evidence_requires_target_scope_and_case_assignment(
    user_factory, business_data, monkeypatch
):
    actor, reviewer = user_factory(role="operator"), user_factory(role="operator")
    business = business_services.create_business(actor=user_factory(), **business_data)
    other = business_services.create_business(actor=user_factory(), **business_data)
    file = StoredFile.objects.create(
        owner=actor,
        business=business,
        purpose="suspension",
        object_key="private/evidence.png",
        content_type="image/png",
        size=10,
        sha256="0" * 64,
        scan_status="clean",
        consent_version="2026-09-07",
    )
    with pytest.raises(ValidationError):
        suspensions.propose(actor=actor, business_id=other.pk, reason="بررسی", evidence=[file.pk])
    case = suspensions.propose(
        actor=actor, business_id=business.pk, reason="بررسی", evidence=[file.pk]
    )
    with pytest.raises(NotFound):
        files.download_document(actor=reviewer, file=file)
    work.claim(actor=reviewer, kind="suspension", pk=case["id"])
    monkeypatch.setattr(files.default_storage, "url", lambda key: "/authorized-document")
    assert files.download_document(actor=reviewer, file=file) == "/authorized-document"
