from pathlib import Path
from unittest.mock import patch

import pytest
import yaml
from drf_spectacular.generators import SchemaGenerator


def test_liveness(client):
    response = client.get("/health/live/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response["X-Request-ID"]


def test_readiness_failure_is_sanitized(client):
    with patch(
        "marketplace.common.health.connection.cursor", side_effect=RuntimeError("private info")
    ):
        response = client.get("/health/ready/")
    assert response.status_code == 503
    assert b"private info" not in response.content


def test_oversized_json_is_rejected_before_parsing(client, settings):
    settings.DATA_UPLOAD_MAX_MEMORY_SIZE = 128
    response = client.post("/api/v1/auth/register/", {"first_name": "a" * 256}, format="json")
    assert response.status_code == 413
    assert response.data["code"] == "payload_too_large"


def test_schema_matches_committed_contract():
    schema_path = Path(__file__).resolve().parents[3] / "docs/technical/api/openapi.yaml"
    assert SchemaGenerator().get_schema(request=None, public=True) == yaml.safe_load(
        schema_path.read_text()
    )


@pytest.mark.django_db
def test_private_endpoints_deny_guests_and_admin_is_read_only(client, user_factory):
    assert client.get("/api/v1/businesses/").status_code == 401
    assert client.get("/api/v1/inbox/").status_code == 401
    operator = user_factory(role="operator")
    client.force_login(operator)
    assert client.get("/admin/").status_code == 302
    owner = user_factory(is_staff=True, is_superuser=True)
    client.force_login(owner)
    response = client.post(f"/admin/accounts/user/{owner.pk}/change/", {"is_suspended": True})
    assert response.status_code == 403
    owner.is_suspended = True
    owner.save()
    assert client.get("/admin/").status_code == 302
