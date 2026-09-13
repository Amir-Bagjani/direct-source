from datetime import timedelta
from unittest.mock import Mock, patch

import pytest
from django.core.management import call_command
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from marketplace.accounts import business_services
from marketplace.accounts.models import Business
from marketplace.accounts.permissions import can_start_trade, can_view_wholesale, has_role
from marketplace.common.exceptions import Conflict
from marketplace.operations.files import download_document
from marketplace.operations.models import AuditEvent, InboxNotification, OutboxEvent, StoredFile
from marketplace.operations.retention import PurgeUnavailable, delete_file, erase_object, set_hold
from marketplace.operations.services import notify
from marketplace.operations.tasks import deliver_email_outbox, deliver_outbox

pytestmark = pytest.mark.django_db


def test_outbox_failure_rolls_back_and_retry_delivers_once(user_factory):
    user = user_factory()
    with transaction.atomic():
        event = notify(recipient=user, topic="test", payload={"id": "one"})
    from marketplace.operations.tasks import InternalInbox

    deliver = InternalInbox.deliver

    def fail_after_insert(self, event):
        deliver(self, event)
        raise RuntimeError("provider unavailable")

    with patch.object(InternalInbox, "deliver", fail_after_insert), pytest.raises(RuntimeError):
        deliver_outbox.run.__wrapped__()
    event.refresh_from_db()
    assert event.delivered_at is None and event.attempts == 0
    assert not InboxNotification.objects.exists()
    assert deliver_outbox() == 1
    assert deliver_outbox() == 0
    assert InboxNotification.objects.filter(event=event).count() == 1


def test_outbox_cannot_escape_rolled_back_domain_command(user_factory):
    with pytest.raises(RuntimeError), transaction.atomic():
        notify(recipient=user_factory(), topic="test", payload={})
        raise RuntimeError("domain failed")
    assert not OutboxEvent.objects.exists()


def test_email_retry_is_bounded_and_excludes_future_leases(user_factory):
    event = OutboxEvent.objects.create(recipient=user_factory(), topic="email.verify", payload={})
    with patch(
        "marketplace.accounts.email_services.send_challenge",
        side_effect=OSError("provider unavailable"),
    ) as send:
        for attempt in range(1, 6):
            assert deliver_email_outbox() == 0
            event.refresh_from_db()
            assert event.attempts == attempt and event.delivered_at is None
            assert deliver_email_outbox() == 0
            assert send.call_count == attempt
            OutboxEvent.objects.filter(pk=event.pk).update(
                available_at=timezone.now() - timedelta(seconds=1)
            )
        assert deliver_email_outbox() == 0
        assert send.call_count == 5


@pytest.fixture
def file_world(user_factory, business_data):
    user = user_factory()
    business = business_services.create_business(actor=user, **business_data)
    file = StoredFile.objects.create(
        owner=user,
        business=business,
        purpose="identity",
        object_key="private/test-key",
        content_type="image/png",
        size=10,
        sha256="a" * 64,
        scan_status="clean",
        consent_version="2026-09-07",
    )
    return user, business, file


def test_owner_hold_open_case_and_deletion_retry(file_world, user_factory):
    user, business, file = file_world
    owner = user_factory(role="owner")
    with pytest.raises(PermissionDenied):
        delete_file(actor=user, pk=file.pk, reason="درخواست")
    set_hold(actor=owner, pk=file.pk, enabled=True, reason="حفظ مدرک")
    with pytest.raises(Conflict):
        delete_file(actor=owner, pk=file.pk, reason="حذف")
    set_hold(actor=owner, pk=file.pk, enabled=False, reason="رفع منع")
    Business.objects.filter(pk=business.pk).update(status="pending")
    with pytest.raises(Conflict):
        delete_file(actor=owner, pk=file.pk, reason="حذف")
    Business.objects.filter(pk=business.pk).update(status="draft")
    with patch(
        "marketplace.operations.retention.erase_object",
        side_effect=OSError("secret provider message"),
    ):
        with pytest.raises(PurgeUnavailable) as error:
            delete_file(actor=owner, pk=file.pk, reason="درخواست معتبر صاحب داده")
    assert "secret" not in str(error.value)
    file.refresh_from_db()
    assert file.deleted_at and file.purged_at is None
    with pytest.raises(NotFound):
        download_document(actor=user, file=file)
    with patch("marketplace.operations.retention.erase_object") as erase:
        result = delete_file(actor=owner, pk=file.pk, reason="تلاش دوباره")
        assert result["purged_at"]
        assert delete_file(actor=owner, pk=file.pk, reason="تکرار") == result
        erase.assert_called_once()
    assert (
        AuditEvent.objects.filter(aggregate_id=file.pk, action="file.deletion_approved").count()
        == 1
    )
    assert AuditEvent.objects.filter(aggregate_id=file.pk, action="file.purged").count() == 1
    assert StoredFile.objects.filter(pk=file.pk).exists()


def test_versioned_storage_deletes_only_exact_key_versions(file_world):
    from storages.backends.s3 import S3Storage

    file = file_world[2]
    storage = Mock(spec=S3Storage)
    storage.bucket_name = "private-test"
    storage._normalize_name.return_value = file.object_key
    client = storage.connection.meta.client
    client.get_bucket_versioning.return_value = {"Status": "Enabled"}
    client.get_paginator.return_value.paginate.return_value = [
        {
            "Versions": [
                {"Key": file.object_key, "VersionId": "v1"},
                {"Key": file.object_key + "-other", "VersionId": "other"},
            ],
            "DeleteMarkers": [{"Key": file.object_key, "VersionId": "v2"}],
        }
    ]
    with patch("marketplace.operations.retention.default_storage", storage):
        erase_object(file)
    assert client.delete_object.call_count == 2
    assert {c.kwargs["VersionId"] for c in client.delete_object.call_args_list} == {"v1", "v2"}
    storage.delete.assert_not_called()


def test_file_commands_api_and_restore_reapply(client, file_world, user_factory):
    file = file_world[2]
    owner = user_factory(role="owner")
    root = f"/api/v1/operations/files/{file.pk}"
    client.force_authenticate(user_factory(role="operator"))
    assert client.post(root + "/delete/", {"reason": "درخواست"}, format="json").status_code == 403
    client.force_authenticate(owner)
    assert (
        client.post(
            root + "/hold/", {"enabled": True, "reason": "بررسی"}, format="json"
        ).status_code
        == 200
    )
    assert client.post(root + "/delete/", {"reason": "درخواست"}, format="json").status_code == 409
    assert (
        client.post(
            root + "/hold/", {"enabled": False, "reason": "رفع منع"}, format="json"
        ).status_code
        == 200
    )
    with patch("marketplace.operations.retention.erase_object"):
        assert (
            client.post(root + "/delete/", {"reason": "درخواست معتبر"}, format="json").status_code
            == 200
        )
    with patch(
        "marketplace.operations.management.commands.reapply_file_tombstones.erase_object"
    ) as erase:
        call_command("reapply_file_tombstones", actor=str(owner.pk), reason="پس از بازیابی")
    assert erase.call_args.args[0].pk == file.pk
    assert (
        AuditEvent.objects.filter(action="file.tombstone_reapplied", aggregate_id=file.pk).count()
        == 1
    )


@pytest.mark.parametrize(
    "kind,status,controlled,suspended,platform,wholesale,trade",
    [
        ("retailer", "verified", False, False, None, True, False),
        ("retailer", "verified", True, False, None, True, True),
        ("retailer", "pending", True, False, "operator", False, False),
        ("retailer", "suspended", True, False, "owner", False, False),
        ("manufacturer", "verified", True, False, "operator", False, True),
        ("retailer", "verified", True, True, "owner", False, False),
    ],
)
def test_independent_access_axes(
    user_factory, business_data, kind, status, controlled, suspended, platform, wholesale, trade
):
    user = user_factory(role=platform)
    business = business_services.create_business(actor=user, **{**business_data, "kind": kind})
    Business.objects.filter(pk=business.pk).update(status=status, controlled_access=controlled)
    type(user).objects.filter(pk=user.pk).update(is_suspended=suspended)
    business.refresh_from_db()
    assert bool(can_view_wholesale(user)) is wholesale
    assert bool(can_start_trade(business)) is trade
    assert bool(has_role(user, "operator", "owner")) is bool(platform and not suspended)
