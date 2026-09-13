"""Owner-approved file deletion; durable tombstone precedes storage I/O."""

from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException

from marketplace.accounts.models import Business, BusinessRevision, User
from marketplace.accounts.permissions import require_owner
from marketplace.catalog.models import ProductRevision
from marketplace.common.exceptions import Conflict
from marketplace.finance.services import required_reason
from marketplace.orders.models import Order
from marketplace.support.models import Ticket

from .models import StoredFile, Suspension
from .services import audit


class PurgeUnavailable(APIException):
    status_code = 503
    default_detail = "دسترسی فایل بسته شد؛ حذف از مخزن کامل نشد. همین درخواست را دوباره اجرا کنید."
    default_code = "purge_unavailable"


def locked_file(actor, pk):
    actor = User.objects.select_for_update(no_key=True).get(pk=actor.pk)
    require_owner(actor)
    ref = get_object_or_404(StoredFile, pk=pk)
    business = Business.objects.select_for_update().get(pk=ref.business_id)
    return actor, business, StoredFile.objects.select_for_update().get(pk=pk)


def has_open_case(business):
    # Conservatively retain all evidence of a business with an unfinished workflow.
    return (
        business.status in ["pending", "changes_requested"]
        or BusinessRevision.objects.filter(
            business=business, status__in=["pending", "changes_requested"]
        ).exists()
        or business.products.filter(status="pending").exists()
        or ProductRevision.objects.filter(
            product__business=business, status__in=["draft", "pending", "changes_requested"]
        ).exists()
        or Order.objects.filter(
            Q(retailer=business) | Q(manufacturer=business),
            status__in=["pending", "accepted", "active"],
        ).exists()
        or Ticket.objects.filter(business=business).exclude(status="closed").exists()
        or Suspension.objects.filter(
            Q(business=business) | Q(user__membership__business=business),
            status__in=["proposed", "active"],
        ).exists()
    )


@transaction.atomic
def set_hold(*, actor, pk, enabled, reason):
    required_reason(reason)
    actor, _, file = locked_file(actor, pk)
    if file.deleted_at:
        raise Conflict("حذف قبلاً تأیید شده است؛ تغییر منع نگهداری مجاز نیست.")
    before = file.legal_hold
    file.legal_hold = enabled
    file.save(update_fields=["legal_hold", "updated_at"])
    audit(
        actor=actor,
        target=file,
        action="file.hold_changed",
        reason=reason,
        before={"legal_hold": before},
        after={"legal_hold": enabled},
    )
    return {"id": str(file.pk), "legal_hold": enabled}


@transaction.atomic
def approve_deletion(*, actor, pk, reason):
    required_reason(reason)
    actor, business, file = locked_file(actor, pk)
    if not file.deleted_at:
        if file.legal_hold or has_open_case(business):
            raise Conflict("فایل منع حذف یا گردش رسیدگی باز دارد.")
        file.deleted_at = timezone.now()
        file.save(update_fields=["deleted_at", "updated_at"])
        audit(
            actor=actor,
            target=file,
            action="file.deletion_approved",
            reason=reason,
            after={"deleted_at": file.deleted_at.isoformat()},
        )
    return file


def erase_object(file):
    """Delete exact-key versions too; never delete other objects sharing a prefix."""
    from storages.backends.s3 import S3Storage

    if isinstance(default_storage, S3Storage):
        client = default_storage.connection.meta.client
        key = default_storage._normalize_name(file.object_key)
        bucket = default_storage.bucket_name
        if client.get_bucket_versioning(Bucket=bucket).get("Status") in ["Enabled", "Suspended"]:
            pages = client.get_paginator("list_object_versions").paginate(Bucket=bucket, Prefix=key)
            for page in pages:
                for row in page.get("Versions", []) + page.get("DeleteMarkers", []):
                    if row["Key"] == key:
                        client.delete_object(Bucket=bucket, Key=key, VersionId=row["VersionId"])
            return
    default_storage.delete(file.object_key)


def delete_file(*, actor, pk, reason):
    file = approve_deletion(actor=actor, pk=pk, reason=reason)
    if not file.purged_at:
        try:
            erase_object(file)
        except Exception as exc:
            raise PurgeUnavailable() from exc
        with transaction.atomic():
            file = StoredFile.objects.select_for_update().get(pk=file.pk)
            if not file.purged_at:
                file.purged_at = timezone.now()
                file.save(update_fields=["purged_at", "updated_at"])
                audit(
                    actor=actor,
                    target=file,
                    action="file.purged",
                    reason=reason,
                    after={"purged_at": file.purged_at.isoformat()},
                )
    return {"id": str(file.pk), "deleted_at": file.deleted_at, "purged_at": file.purged_at}
