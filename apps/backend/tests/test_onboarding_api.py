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
