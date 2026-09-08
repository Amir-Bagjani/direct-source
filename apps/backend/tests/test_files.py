import io
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.exceptions import NotFound, ValidationError

from marketplace.accounts import business_services, verification_services
from marketplace.operations.files import (
    ScanUnavailable,
    download_document,
    upload_document,
    validate_file,
)
from marketplace.operations.models import StoredFile


def picture():
    stream = io.BytesIO()
    Image.new("RGB", (8, 8), "blue").save(stream, format="PNG")
    return SimpleUploadedFile("image.png", stream.getvalue(), "image/png")


def test_file_signature_and_size():
    assert validate_file(picture())[1] == ".png"
    with pytest.raises(ValidationError):
        validate_file(SimpleUploadedFile("image.png", b"not a picture", "image/png"))
    with pytest.raises(ValidationError):
        validate_file(
            SimpleUploadedFile("file.pdf", b"x" * (10 * 1024 * 1024 + 1), "application/pdf")
        )
    with pytest.raises(ValidationError):
        validate_file(SimpleUploadedFile("image.svg", b"<svg/>", "image/svg+xml"))


@pytest.mark.django_db
def test_upload_scan_failure_remains_private(user_factory, business_data):
    user = user_factory()
    business = business_services.create_business(actor=user, **business_data)
    with (
        patch("marketplace.operations.files.default_storage.save", return_value="private/key"),
        patch("marketplace.operations.files.scan", side_effect=ScanUnavailable),
    ):
        with pytest.raises(ScanUnavailable):
            upload_document(
                actor=user,
                business=business,
                purpose="identity",
                consent="2026-09-07",
                upload=picture(),
            )
    file = StoredFile.objects.get()
    assert file.scan_status == "pending"
    with pytest.raises(NotFound):
        download_document(actor=user, file=file)


@pytest.mark.django_db
def test_upload_and_cross_tenant_document_denial(user_factory, business_data):
    user, other = user_factory(), user_factory()
    business = business_services.create_business(actor=user, **business_data)
    with (
        patch("marketplace.operations.files.default_storage.save", return_value="private/key"),
        patch("marketplace.operations.files.scan", return_value=True),
    ):
        file = upload_document(
            actor=user,
            business=business,
            purpose="identity",
            consent="2026-09-07",
            upload=picture(),
        )
    with pytest.raises(NotFound):
        download_document(actor=other, file=file)
    with patch(
        "marketplace.operations.files.default_storage.url",
        return_value="https://storage.test/signed",
    ):
        assert download_document(actor=user, file=file) == "https://storage.test/signed"
    other_business = business_services.create_business(actor=other, **business_data)
    with pytest.raises(ValidationError):
        verification_services.check_files(other, other_business, "identity", [file.pk])


@pytest.mark.django_db
def test_unscanned_document_cannot_be_submitted(user_factory, business_data):
    user = user_factory()
    business = business_services.create_business(actor=user, **business_data)
    file = StoredFile.objects.create(
        owner=user,
        business=business,
        purpose="identity",
        object_key="pending",
        size=1,
        sha256="0" * 64,
        content_type="image/png",
        consent_version="2026-09-07",
    )
    with pytest.raises(ValidationError):
        verification_services.check_files(user, business, "identity", [file.pk])
