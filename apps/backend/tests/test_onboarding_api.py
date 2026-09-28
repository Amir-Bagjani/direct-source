from unittest.mock import patch

import pytest

from .test_files import picture

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("kind", ["manufacturer", "retailer"])
def test_register_to_verified_business_api(client, user_factory, business_data, kind):
    password = "A-long-secret-947!"
    response = client.post(
        "/api/v1/auth/register/",
        {
            "mobile": "09121234567",
            "first_name": "نام",
            "last_name": "خانوادگی",
            "password": password,
            "accept_terms": True,
        },
        format="json",
    )
    assert response.status_code == 201
    login = client.post(
        "/api/v1/auth/login/", {"mobile": "09121234567", "password": password}, format="json"
    )
    assert login.status_code == 200
    client.credentials(HTTP_AUTHORIZATION="Bearer " + login.data["access"])
    business_data["kind"] = kind
    business_response = client.post("/api/v1/businesses/", business_data, format="json")
    assert business_response.status_code == 201
    business_id = business_response.data["id"]
    root = f"/api/v1/businesses/{business_id}"
    documents = []
    with (
        patch(
            "marketplace.operations.files.default_storage.save",
            side_effect=lambda name, content: name,
        ),
        patch("marketplace.operations.files.scan", return_value=True),
    ):
        for purpose in ["identity", "identity", "identity", "activity"]:
            response = client.post(
                root + "/files/",
                {"file": picture(), "purpose": purpose, "consent_version": "2026-09-07"},
                format="multipart",
            )
            assert response.status_code == 201, response.data
            documents.append(response.data["id"])
    response = client.put(
        root + "/verification/identity/",
        {
            "national_id": "0123456789",
            "birth_date": "1990-01-01",
            "card_front": documents[0],
            "card_back": documents[1],
            "selfie": documents[2],
        },
        format="json",
    )
    assert response.status_code == 200, response.data
    response = client.put(
        root + "/verification/activity/",
        {"evidence_type": "alternative", "files": [documents[3]]},
        format="json",
    )
    assert response.status_code == 400
    response = client.put(
        root + "/verification/activity/",
        {"evidence_type": "license", "files": [documents[3]]},
        format="json",
    )
    assert response.status_code == 200
    assert client.post(root + "/verification/submit/").data["status"] == "pending"
    assert client.get(root + "/verification/").status_code == 200
    operator = user_factory(role="operator")
    login = client.post(
        "/api/v1/auth/login/", {"mobile": operator.mobile, "password": password}, format="json"
    )
    client.credentials(HTTP_AUTHORIZATION="Bearer " + login.data["access"])
    queue = client.get("/api/v1/operations/verification-queue/")
    assert queue.status_code == 200 and queue.data["count"] == 1
    assert "data" not in queue.data["results"][0]
    assert client.get(root + "/verification/").status_code == 404
    assert client.post(root + "/verification/claim/").status_code == 200
    for section in ["identity", "activity"]:
        response = client.post(
            root + "/verification/review/",
            {"kind": section, "decision": "approved", "reason": "مدارک مطابق‌اند"},
            format="json",
        )
        assert response.status_code == 200, response.data
    assert response.data["status"] == "verified"
    assert response.data["first_verified_at"]
    assert (
        client.post(
            root + "/controlled-access/", {"enabled": True, "reason": "شروع"}, format="json"
        ).status_code
        == 403
    )
    owner = user_factory(role="owner")
    login = client.post(
        "/api/v1/auth/login/", {"mobile": owner.mobile, "password": password}, format="json"
    )
    client.credentials(HTTP_AUTHORIZATION="Bearer " + login.data["access"])
    response = client.post(
        root + "/controlled-access/",
        {"enabled": True, "reason": "ورود به پایلوت کنترل‌شده"},
        format="json",
    )
    assert response.status_code == 200 and response.data["controlled_access"]


def test_draft_logo_edit_and_state_gates(client, user_factory, business_data, settings, tmp_path):
    from marketplace.accounts import business_services, verification_services
    from marketplace.operations.models import AuditEvent, StoredFile

    from .test_business import complete_application

    settings.STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(tmp_path)},
        }
    }
    user, other, operator = user_factory(), user_factory(), user_factory(role="operator")
    business = business_services.create_business(actor=user, **business_data)
    root = f"/api/v1/businesses/{business.pk}"
    client.force_authenticate(user)
    assert (
        client.get("/api/v1/files/policy/").data["consent_version"]
        == settings.DOCUMENT_CONSENT_VERSION
    )
    with patch("marketplace.operations.files.scan", return_value=True):
        response = client.post(
            root + "/files/",
            {
                "file": picture(),
                "purpose": "business_logo",
                "consent_version": settings.DOCUMENT_CONSENT_VERSION,
            },
            format="multipart",
        )
    assert response.status_code == 201
    logo = response.data["id"]
    edit = {
        **business_data,
        "name": "نام تازه",
        "logo": logo,
        "kind": "retailer",
        "status": "verified",
    }
    response = client.put(root + "/draft/", edit, format="json")
    assert response.status_code == 200 and str(response.data["logo"]) == str(logo)
    assert response.data["kind"] == "manufacturer" and response.data["status"] == "draft"
    content = f"/api/v1/files/{logo}/content/"
    response = client.get(content)
    assert response.status_code == 200 and response["Cache-Control"] == "no-store"
    assert b"".join(response.streaming_content).startswith(b"\x89PNG")
    assert AuditEvent.objects.filter(action="file.download_authorized").exists()
    client.force_authenticate(other)
    assert client.get(content).status_code == 404
    assert client.put(root + "/draft/", edit, format="json").status_code == 404
    client.force_authenticate(user)
    StoredFile.objects.filter(pk=logo).update(scan_status="pending")
    assert client.put(root + "/draft/", edit, format="json").status_code == 400
    assert client.get(content).status_code == 404
    edit["logo"] = None
    assert client.put(root + "/draft/", edit, format="json").status_code == 200
    complete_application(user, business)
    assert client.put(root + "/draft/", edit, format="json").status_code == 409
    verification_services.claim(actor=operator, business_id=business.pk)
    verification_services.review(
        actor=operator,
        business_id=business.pk,
        kind="identity",
        decision="changes_requested",
        reason="اصلاح",
    )
    assert client.put(root + "/draft/", edit, format="json").status_code == 409
    verification_services.review(
        actor=operator,
        business_id=business.pk,
        kind="activity",
        decision="changes_requested",
        reason="اصلاح فعالیت",
    )
    assert client.put(root + "/draft/", edit, format="json").status_code == 200
    client.force_authenticate(operator)
    assert client.get("/api/v1/operations/verification-queue/").data["count"] == 1


def test_logo_rejects_pdf_and_wrong_consent(client, user_factory, business_data):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from marketplace.accounts import business_services

    user = user_factory()
    business = business_services.create_business(actor=user, **business_data)
    client.force_authenticate(user)
    root = f"/api/v1/businesses/{business.pk}/files/"
    response = client.post(
        root,
        {"file": picture(), "purpose": "business_logo", "consent_version": "old"},
        format="multipart",
    )
    assert response.status_code == 400
    response = client.post(
        root,
        {
            "file": SimpleUploadedFile("logo.pdf", b"%PDF-1.4\n%%EOF", "application/pdf"),
            "purpose": "business_logo",
            "consent_version": "2026-09-07",
        },
        format="multipart",
    )
    assert response.status_code == 400
