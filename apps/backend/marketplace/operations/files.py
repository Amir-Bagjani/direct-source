import hashlib
import io
import socket
import struct
import uuid
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Q
from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import APIException, ValidationError

from marketplace.accounts.permissions import require_business_owner

from .models import StoredFile
from .services import audit


class ScanUnavailable(APIException):
    status_code = 503
    default_detail = "بررسی امنیتی فایل در دسترس نیست. دوباره تلاش کنید."
    default_code = "scan_unavailable"


def validate_file(upload):
    if not upload.size or upload.size > 10 * 1024 * 1024:
        raise ValidationError({"file": "حجم فایل باید بین یک بایت و ۱۰ مگابایت باشد."})
    content = upload.read(10 * 1024 * 1024 + 1)
    if len(content) != upload.size:
        raise ValidationError({"file": "حجم فایل معتبر نیست."})
    extension = Path(upload.name).suffix.lower()
    allowed = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
    }
    if extension not in allowed or upload.content_type != allowed[extension]:
        raise ValidationError({"file": "نوع فایل مجاز نیست."})
    if extension == ".pdf":
        valid = content.startswith(b"%PDF-") and b"%%EOF" in content[-1024:]
    else:
        try:
            with Image.open(io.BytesIO(content)) as picture:
                valid = Image.MIME.get(picture.format or "") == allowed[extension]
                picture.verify()
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
            valid = False
    if not valid:
        raise ValidationError({"file": "محتوای فایل با نوع آن سازگار نیست."})
    return content, extension


def scan(content):
    try:
        with socket.create_connection(
            (settings.CLAMAV_HOST, settings.CLAMAV_PORT), timeout=10
        ) as client:
            client.sendall(b"zINSTREAM\0")
            for offset in range(0, len(content), 65536):
                chunk = content[offset : offset + 65536]
                client.sendall(struct.pack("!I", len(chunk)) + chunk)
            client.sendall(struct.pack("!I", 0))
            response = bytearray()
            while len(response) < 4096:
                chunk = client.recv(1024)
                if not chunk:
                    break
                response.extend(chunk)
                if b"\0" in chunk:
                    break
        return bytes(response).strip(b"\0\n ") == b"stream: OK"
    except OSError as exc:
        raise ScanUnavailable() from exc


def upload_document(*, actor, business, purpose, consent, upload):
    from marketplace.accounts.permissions import has_role

    if purpose not in ["shipping", "support", "discrepancy"] or not has_role(
        actor, "owner", "operator"
    ):
        require_business_owner(actor, business)
    if consent != settings.DOCUMENT_CONSENT_VERSION:
        raise ValidationError({"consent_version": "رضایت‌نامهٔ جاری را بپذیرید."})
    content, extension = validate_file(upload)
    if purpose == "product_image":
        if business.kind != "manufacturer" or business.status == "suspended":
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied()
        if extension == ".pdf" or len(content) > 5 * 1024 * 1024:
            raise ValidationError({"file": "تصویر JPG/PNG/WebP با حداکثر حجم ۵ مگابایت لازم است."})
        with Image.open(io.BytesIO(content)) as picture:
            if min(picture.size) < 800:
                raise ValidationError({"file": "حداقل ابعاد تصویر ۸۰۰ در ۸۰۰ پیکسل است."})
    key = f"private/{business.pk}/{uuid.uuid4()}{extension}"
    key = default_storage.save(key, ContentFile(content))
    with transaction.atomic():
        file = StoredFile.objects.create(
            owner=actor,
            business=business,
            purpose=purpose,
            object_key=key,
            content_type=upload.content_type,
            size=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
            consent_version=consent,
        )
        audit(actor=actor, action="file.uploaded", target=file, after={"purpose": purpose})
    clean = scan(content)
    with transaction.atomic():
        file.scan_status = "clean" if clean else "rejected"
        file.save(update_fields=["scan_status", "updated_at"])
        audit(
            actor=actor, action="file.scanned", target=file, after={"scan_status": file.scan_status}
        )
    if not clean:
        raise ValidationError({"file": "فایل در بررسی امنیتی پذیرفته نشد."})
    return file


def referenced_in_product_revision(actor, file):
    from marketplace.catalog.models import ProductRevision

    if file.purpose != "product_image":
        return False
    for before, proposed in ProductRevision.objects.filter(
        product__business=file.business, assigned_to=actor, status="pending"
    ).values_list("before", "proposed"):
        for version in [before, proposed]:
            images = version["profile"]["images"] + [
                image for row in version["variants"] for image in row["images"]
            ]
            if str(file.pk) in images:
                return True
    return False


def download_document(*, actor, file):
    from marketplace.accounts.permissions import has_role

    if file.purpose in ["support", "discrepancy"]:
        from rest_framework.exceptions import NotFound

        from marketplace.support.services import can_read_file

        if not can_read_file(actor, file):
            raise NotFound()
        with transaction.atomic():
            audit(actor=actor, action="file.download_authorized", target=file)
        return default_storage.url(file.object_key)

    if file.purpose == "shipping":
        from rest_framework.exceptions import NotFound

        from marketplace.logistics.fulfillment import visible_orders

        if (
            file.deleted_at
            or file.scan_status != "clean"
            or not file.fulfillment_evidence.filter(
                request__group__order__in=visible_orders(actor), action="file.uploaded"
            ).exists()
        ):
            raise NotFound()
        with transaction.atomic():
            audit(actor=actor, action="file.download_authorized", target=file)
        return default_storage.url(file.object_key)

    allowed = (
        file.owner_id == actor.pk
        or has_role(actor, "owner")
        or (
            has_role(actor, "operator")
            and (
                referenced_in_product_revision(actor, file)
                or file.business.products.filter(assigned_to=actor, status="pending")
                .filter(
                    Q(images__contains=[str(file.pk)])
                    | Q(variants__images__contains=[str(file.pk)])
                )
                .exists()
                or file.business.verification.assigned_to_id == actor.pk
                or file.business.revisions.filter(
                    assigned_to=actor, status__in=["pending", "changes_requested"]
                ).exists()
            )
        )
    )
    if not allowed or file.deleted_at or file.scan_status != "clean":
        from rest_framework.exceptions import NotFound

        raise NotFound()
    with transaction.atomic():
        audit(actor=actor, action="file.download_authorized", target=file)
    return default_storage.url(file.object_key)
