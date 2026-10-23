from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.db import DatabaseError, close_old_connections, connections, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from marketplace.common.exceptions import Conflict
from marketplace.finance import services as finance
from marketplace.operations.models import AuditEvent, StoredFile
from marketplace.reviews import services
from marketplace.reviews.models import (
    Entitlement,
    ModerationAction,
    Reply,
    Report,
    Review,
    ReviewImage,
)
from marketplace.reviews.tasks import process_reviews
from tests.test_cart import cart_world as shared_cart_world
from tests.test_disputes_support import delivered as delivery_world  # noqa: F401
from tests.test_finance import delivered, paid
from tests.test_logistics_publication import ready_product  # noqa: F401

pytestmark = pytest.mark.django_db
cart_world = shared_cart_world
ROOT = "/api/v1/reviews/"


@pytest.fixture
def completed(client, cart_world):
    order, _ = paid(client, cart_world)
    delivered(order)
    finance.settle(order_id=order.pk)
    order.refresh_from_db()
    return order


def right(order, topic):
    return Entitlement.objects.get(order=order, topic=topic)


def submit(order, topic, **kwargs):
    item = right(order, topic)
    actor = item.author.membership.user
    return services.save_review(
        actor=actor,
        pk=item.pk,
        scores={key: 4 for key in services.CRITERIA[topic]},
        text="تجربه خرید",
        submit=True,
        **kwargs,
    )


def test_catalog_ratings_use_public_visibility_and_correlated_topic_aggregates(
    client, completed, cart_world, monkeypatch
):
    from marketplace.catalog import browsing
    from marketplace.catalog.models import Product
    from marketplace.catalog.publication_api import PublicManufacturerDetail, PublicProductDetail

    monkeypatch.setattr(browsing.default_storage, "url", lambda key: "http://test/image")
    product = cart_world[2]
    result = submit(completed, "product")
    submit(completed, "manufacturer")
    submit(completed, "retailer")
    client.force_authenticate(None)
    detail = f"/api/v1/catalog/public/products/{product.pk}/"
    manufacturer = f"/api/v1/catalog/public/manufacturers/{product.business_id}/"
    listing = "/api/v1/catalog/public/products/"
    # Finance only creates simulated settlements today; these must remain private.
    assert client.get(detail).data["rating"] == {"average": None, "count": 0}
    assert client.get(manufacturer).data["rating"] == {"average": None, "count": 0}
    assert client.get(listing, {"rating_min": 0}).data["count"] == 0

    # Exercise aggregation with actual persisted reviews without forging a live settlement.
    monkeypatch.setattr(
        browsing, "visible_reviews", lambda: services.visible_reviews(cart_world[0], internal=True)
    )
    monkeypatch.setattr(PublicProductDetail, "queryset", browsing.public_queryset())
    monkeypatch.setattr(
        PublicManufacturerDetail, "queryset", browsing.public_manufacturer_queryset()
    )
    unrated = Product.objects.create(
        business=product.business,
        category=product.category,
        name="بدون امتیاز",
        status="published",
        published_at=timezone.now(),
    )
    assert client.get(detail).data["rating"] == {"average": 4.0, "count": 1}
    assert client.get(manufacturer).data["rating"] == {"average": 4.0, "count": 1}
    rows = client.get(listing, {"sort": "rating"}).data["results"]
    assert [row["id"] for row in rows] == [str(product.pk), str(unrated.pk)]
    assert client.get(listing, {"rating_min": 4}).data["count"] == 1
    assert client.get(listing, {"rating_min": 4.5}).data["count"] == 0
    Review.objects.filter(pk=result["review"]["id"]).update(content_hidden=True)
    assert client.get(detail).data["rating"] == {"average": 4.0, "count": 1}
    Review.objects.filter(pk=result["review"]["id"]).update(invalidated=True)
    assert client.get(detail).data["rating"] == {"average": None, "count": 0}
    assert client.get(manufacturer).data["rating"] == {"average": 4.0, "count": 1}


def test_entitlement_completion_retry_and_snapshot(completed, cart_world, settings):
    rights = list(completed.entitlements.all())
    assert len(rights) == 3
    assert {r.execution_mode for r in rights} == {"simulated"}
    assert {r.deadline for r in rights} == {completed.completed_at + timedelta(days=14)}
    product = right(completed, "product")
    assert product.variants == [str(cart_world[3].pk)]
    settings.REVIEW_WINDOW_DAYS = 7
    assert {r.pk for r in services.create_entitlements(order_id=completed.pk)} == {
        r.pk for r in rights
    }
    assert AuditEvent.objects.filter(action="reviews.entitled").count() == 3
    assert process_reviews()["entitle"] == 0


def test_no_entitlement_without_completion(client, cart_world):
    order, _ = paid(client, cart_world)
    assert services.create_entitlements(order_id=order.pk) == []
    delivered(order)
    assert services.create_entitlements(order_id=order.pk) == []
    assert not Entitlement.objects.exists()


def test_product_draft_final_and_anonymous_projection(client, completed, cart_world):
    item = right(completed, "product")
    url = ROOT + f"entitlements/{item.pk}/"
    assert (
        client.put(url, {"scores": {"quality": 2}, "text": "پیش‌نویس"}, format="json").status_code
        == 200
    )
    assert client.get(ROOT + "internal/").data["count"] == 0
    scores = {"quality": 5, "conformity": 3, "overall": 4}
    response = client.put(
        url, {"scores": scores, "text": "نظر نهایی", "submit": True}, format="json"
    )
    assert response.status_code == 200, response.data
    row = Review.objects.get(entitlement=item)
    assert row.published_at == row.submitted_at
    for actor in [cart_world[0], completed.manufacturer.membership.user]:
        client.force_authenticate(actor)
        output = client.get(ROOT + f"internal/{row.pk}/").data
        assert output["author_label"] == "خریدار تأییدشده"
        assert output["scores"] == scores
        assert output["variants"] == item.variants
        for secret in [
            str(item.author_id),
            str(cart_world[0].pk),
            cart_world[0].mobile,
            str(completed.pk),
        ]:
            assert secret not in str(output)
    client.force_authenticate(cart_world[0])
    assert client.put(url, {"scores": scores}, format="json").status_code == 409
    assert client.delete(url).status_code == 405


@pytest.mark.parametrize(
    "scores",
    [
        {},
        {"quality": 0},
        {"quality": 6},
        {"quality": True},
        {"quality": 1.5},
        {"quality": "4"},
        {"quality": None},
        {"payment": 4},
        [],
    ],
)
def test_invalid_scores_atomic(completed, scores):
    item = right(completed, "product")
    with pytest.raises(ValidationError):
        services.save_review(
            actor=item.author.membership.user, pk=item.pk, scores=scores, submit=True
        )
    assert not Review.objects.exists()


def test_blind_until_both_submit_including_existence(client, completed, cart_world):
    first = submit(completed, "manufacturer")
    row = Review.objects.get(pk=first["review"]["id"])
    assert row.published_at is None
    producer = completed.manufacturer.membership.user
    client.force_authenticate(producer)
    assert client.get(ROOT + "internal/").data["count"] == 0
    assert client.get(ROOT + f"internal/{row.pk}/").status_code == 404
    assert client.get(ROOT + f"entitlements/{row.entitlement_id}/").status_code == 404
    assert client.get(ROOT + "entitlements/").data["count"] == 1
    assert client.get(ROOT + "internal/aggregate/").data["manufacturer"]["count"] == 0
    assert (
        client.put(ROOT + f"{row.pk}/reply/", {"text": "reply"}, format="json").status_code == 404
    )
    assert (
        client.post(ROOT + f"{row.pk}/reports/", {"reason": "reason"}, format="json").status_code
        == 404
    )
    second = submit(completed, "retailer")
    row.refresh_from_db()
    other = Review.objects.get(pk=second["review"]["id"])
    assert row.published_at == other.published_at
    output = client.get(ROOT + f"internal/{row.pk}/").data
    assert output["author_label"] == cart_world[1].name
    assert str(cart_world[0].pk) not in str(output) and cart_world[0].mobile not in str(output)
    assert client.get(ROOT + "internal/").data["count"] == 2


def test_deadline_publishes_once_expires_drafts_and_rejects_late(completed):
    submit(completed, "manufacturer")
    item = right(completed, "retailer")
    services.save_review(actor=item.author.membership.user, pk=item.pk, scores={})
    with patch("marketplace.reviews.services.timezone.now", return_value=item.deadline):
        with pytest.raises(Conflict):
            submit(completed, "retailer")
        assert process_reviews()["deadline"] == 1
        assert process_reviews()["deadline"] == 0
    item.refresh_from_db()
    assert item.expired_at == item.deadline
    assert Review.objects.get(entitlement__topic="manufacturer").published_at == item.deadline
    assert Review.objects.get(entitlement=item).submitted_at is None
    assert AuditEvent.objects.filter(action="reviews.published").count() == 1


def test_outsider_suspension_and_mode_separation(client, completed, cart_world, user_factory):
    output = submit(completed, "product")
    row_id = output["review"]["id"]
    assert client.get(ROOT + "public/").data["count"] == 0
    assert (
        client.get(ROOT + "public/aggregate/").data["product"]["criteria"]["overall"]["mean"]
        is None
    )
    assert client.get(ROOT + f"public/{row_id}/").status_code == 404
    client.force_authenticate(user_factory())
    assert client.get(ROOT + "entitlements/").data["count"] == 0
    assert client.get(ROOT + "internal/").data["count"] == 0
    assert client.get(ROOT + f"{row_id}/audit/").status_code == 403
    client.force_authenticate(None)
    assert client.get(ROOT + "public/").status_code == 200
    assert client.get(ROOT + "internal/").status_code == 401
    client.force_authenticate(cart_world[0])
    cart_world[1].controlled_access = False
    cart_world[1].save()
    assert client.get(ROOT + "internal/").data["count"] == 0
    assert client.get(ROOT + "entitlements/").data["count"] == 0


def test_reply_draft_lock_recipient_and_public_projection(client, completed, cart_world):
    result = submit(completed, "product")
    pk = result["review"]["id"]
    url = ROOT + f"{pk}/reply/"
    assert client.put(url, {"text": "reply"}, format="json").status_code == 403
    client.force_authenticate(completed.manufacturer.membership.user)
    assert client.put(url, {"text": "پیش نویس"}, format="json").status_code == 200
    assert client.get(url).data["text"] == "پیش نویس"
    assert client.get(ROOT + f"internal/{pk}/").data["reply"] is None
    assert client.put(url, {"text": "پاسخ نهایی", "submit": True}, format="json").status_code == 200
    assert client.get(ROOT + f"internal/{pk}/").data["reply"]["text"] == "پاسخ نهایی"
    assert client.put(url, {"text": "بازنویسی"}, format="json").status_code == 409
    assert client.delete(url).status_code == 405
    assert Reply.objects.count() == 1


def test_moderation_restoration_aggregate_audit_and_no_financial_effect(
    client, completed, cart_world, user_factory
):
    result = submit(completed, "product")
    pk = result["review"]["id"]
    before = list(completed.financial_events.values())
    report = services.report(actor=cart_world[0], pk=pk, reason="اطلاعات شخصی")
    assert services.report(actor=cart_world[0], pk=pk, reason="تکراری")["id"] == report["id"]
    assert Report.objects.count() == 1
    operator = user_factory(role="operator")
    client.force_authenticate(operator)
    assert client.get(ROOT + "reports/").data["count"] == 1
    for action, count, hidden in [
        ("hide_content", 1, True),
        ("unhide_content", 1, False),
        ("invalidate", 0, False),
        ("revalidate", 1, False),
        ("dismiss", 1, False),
    ]:
        key = uuid4()
        result = services.moderate(
            actor=operator,
            pk=report["id"],
            action=action,
            reason="بررسی مستند",
            idempotency_key=key,
        )
        assert (
            services.moderate(
                actor=operator,
                pk=report["id"],
                action=action,
                reason="بررسی مستند",
                idempotency_key=key,
            )
            == result
        )
        aggregate = client.get(ROOT + "internal/aggregate/").data["product"]
        assert aggregate["count"] == count
        assert aggregate["criteria"]["overall"] == {"mean": 4.0 if count else None, "count": count}
        if count:
            output = client.get(ROOT + f"internal/{pk}/").data
            assert output["text"] == ("" if hidden else "تجربه خرید")
            assert output["content_hidden"] == hidden
        else:
            assert client.get(ROOT + f"internal/{pk}/").status_code == 404
    assert ModerationAction.objects.count() == 5
    assert Review.objects.get(pk=pk).text == "تجربه خرید"
    assert client.get(ROOT + "reports/").data["count"] == 0
    audit = client.get(ROOT + f"{pk}/audit/").data
    assert audit["actor"] == str(cart_world[0].pk)
    assert len(audit["history"]) >= 6
    assert list(completed.financial_events.values()) == before
    completed.refresh_from_db()
    assert completed.status == "completed"


def test_reply_reporting_and_moderation(completed, cart_world, user_factory):
    pk = submit(completed, "product")["review"]["id"]
    reply = services.save_reply(
        actor=completed.manufacturer.membership.user, pk=pk, text="پاسخ", submit=True
    )
    report = services.report(actor=cart_world[0], pk=pk, reply_id=reply["id"], reason="توهین")
    operator = user_factory(role="operator")
    services.moderate(
        actor=operator,
        pk=report["id"],
        action="hide_content",
        reason="علت",
        idempotency_key=uuid4(),
    )
    row = services.visible_reviews(operator, True).get(pk=pk)
    assert services.review_data(row)["reply"]["text"] == ""
    assert services.aggregate(services.visible_reviews(operator, True))["product"]["count"] == 1
    with pytest.raises(ValidationError):
        services.moderate(
            actor=operator,
            pk=report["id"],
            action="invalidate",
            reason="علت",
            idempotency_key=uuid4(),
        )


def test_immutable_final_records_even_with_direct_database_writes(
    completed, cart_world, user_factory
):
    pk = submit(completed, "product")["review"]["id"]
    row = Review.objects.get(pk=pk)
    reply = services.save_reply(
        actor=completed.manufacturer.membership.user, pk=pk, text="پاسخ", submit=True
    )
    for change in [
        {"text": "changed"},
        {"scores": {"overall": 1}},
        {"images": [str(uuid4())]},
        {"submitted_at": None},
        {"published_at": None},
    ]:
        with pytest.raises(DatabaseError), transaction.atomic():
            Review.objects.filter(pk=pk).update(**change)
    with pytest.raises(DatabaseError), transaction.atomic():
        Reply.objects.filter(pk=reply["id"]).update(text="changed")
    for model in [Review, Reply, Entitlement]:
        with pytest.raises(DatabaseError), transaction.atomic():
            model.objects.all().delete()
    with pytest.raises(DatabaseError), transaction.atomic():
        Entitlement.objects.filter(pk=row.entitlement_id).update(execution_mode="live")
    with pytest.raises(DatabaseError), transaction.atomic():
        Entitlement.objects.filter(pk=row.entitlement_id).update(variants=[])


def test_strict_commands_and_moderation_permissions(client, completed, cart_world, user_factory):
    pk = submit(completed, "product")["review"]["id"]
    report = services.report(actor=cart_world[0], pk=pk, reason="علت")
    url = ROOT + f"reports/{report['id']}/moderation/"
    payload = {"action": "hide_content", "reason": "علت", "idempotency_key": str(uuid4())}
    assert client.post(url, payload, format="json").status_code == 403
    client.force_authenticate(user_factory(role="operator"))
    for extra in [
        {"text": "edited"},
        {"scores": {"overall": 1}},
        {"action": "edit"},
        {"reason": ""},
    ]:
        assert client.post(url, {**payload, **extra}, format="json").status_code == 400
    assert client.post(url, payload, format="json").status_code == 200
    assert (
        client.post(url, {**payload, "action": "unhide_content"}, format="json").status_code == 409
    )
    assert client.get(ROOT + "public/?execution_mode=simulated").status_code == 400


def test_images_scoped_and_hidden_download(client, completed, cart_world):
    item = right(completed, "product")
    file = StoredFile.objects.create(
        owner=cart_world[0],
        business=cart_world[1],
        purpose="review_image",
        object_key=f"private/reviews/{uuid4()}.png",
        content_type="image/png",
        size=100,
        sha256="a" * 64,
        consent_version="2026-09-07",
        scan_status="clean",
    )
    with pytest.raises(NotFound):
        submit(completed, "product", images=[file.pk])
    ReviewImage.objects.create(entitlement=item, file=file)
    result = submit(completed, "product", images=[file.pk])
    pk = result["review"]["id"]
    url = ROOT + f"internal/{pk}/images/{file.pk}/"
    with patch(
        "marketplace.reviews.services.default_storage.url",
        return_value="https://example.test/image",
    ):
        assert client.get(url).status_code == 200
        assert client.get(ROOT + f"public/{pk}/images/{file.pk}/").status_code == 404
        Review.objects.filter(pk=pk).update(content_hidden=True)
        assert client.get(url).status_code == 404


@pytest.mark.django_db(transaction=True)
def test_concurrent_blind_submission_and_entitlement_retry(client, cart_world):
    order, _ = paid(client, cart_world)
    delivered(order)
    finance.settle(order_id=order.pk)

    def send(topic):
        close_old_connections()
        try:
            return submit(order, topic)
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(send, ["manufacturer", "retailer"]))
    rows = list(Review.objects.all())
    assert len(rows) == 2 and rows[0].published_at == rows[1].published_at
    assert rows[0].published_at is not None

    def entitle(_):
        close_old_connections()
        try:
            return {r.pk for r in services.create_entitlements(order_id=order.pk)}
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(entitle, range(2)))
    assert results[0] == results[1] and Entitlement.objects.count() == 3


def test_backfill_uses_completion_deadline_and_pagination(client, cart_world, monkeypatch):
    import marketplace.reviews.tasks as tasks

    orders = [paid(client, cart_world)[0], paid(client, cart_world)[0]]
    with patch("marketplace.reviews.services.create_entitlements", return_value=[]):
        for order in orders:
            delivered(order)
            finance.settle(order_id=order.pk)
    assert Entitlement.objects.count() == 0
    monkeypatch.setattr(tasks, "BATCH_SIZE", 1)
    process_reviews()
    assert Entitlement.objects.count() == 6
    assert process_reviews()["entitle"] == 0


def test_review_support_ticket_preserves_financial_state(completed, cart_world):
    from marketplace.support import services as support

    pk = submit(completed, "product")["review"]["id"]
    ticket = support.create(
        actor=cart_world[0],
        title="بررسی نظر",
        category="reviews",
        text="بررسی محتوا",
        related_type="review",
        related_id=pk,
        idempotency_key=uuid4(),
    )
    assert ticket["related_id"] == pk
    assert not completed.finance_holds.exists()
    assert not hasattr(completed, "discrepancy")


def test_average_counts_multiple_orders_without_double_counting(client, completed, cart_world):
    submit(completed, "product")
    second, _ = paid(client, cart_world)
    delivered(second)
    finance.settle(order_id=second.pk)
    item = right(second, "product")
    services.save_review(
        actor=cart_world[0],
        pk=item.pk,
        scores={"quality": 1, "conformity": 2, "overall": 3},
        submit=True,
    )
    result = services.aggregate(services.visible_reviews(cart_world[0], True))["product"]
    assert result["count"] == 2
    assert result["criteria"]["quality"] == {"mean": 2.5, "count": 2}
    assert result["criteria"]["overall"] == {"mean": 3.5, "count": 2}
    assert services.aggregate(services.visible_reviews())["product"]["count"] == 0


def test_image_upload_scanning_type_and_download_permissions(client, completed, cart_world):
    import io

    from django.conf import settings
    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    from marketplace.operations.files import download_document

    item = right(completed, "product")
    image = io.BytesIO()
    Image.new("RGB", (10, 10)).save(image, "PNG")
    upload = SimpleUploadedFile("image.png", image.getvalue(), content_type="image/png")
    with (
        patch(
            "marketplace.operations.files.default_storage.save",
            side_effect=lambda key, content: key,
        ),
        patch("marketplace.operations.files.scan", return_value=True),
    ):
        response = client.post(
            ROOT + f"entitlements/{item.pk}/images/",
            {"file": upload, "consent_version": settings.DOCUMENT_CONSENT_VERSION},
            format="multipart",
        )
    assert response.status_code == 200, response.data
    file = StoredFile.objects.get(pk=response.data["id"])
    assert str(cart_world[1].pk) not in file.object_key
    assert file.review_scope.entitlement == item
    with patch(
        "marketplace.operations.files.default_storage.url",
        return_value="https://example.test/private",
    ):
        assert download_document(actor=cart_world[0], file=file)
        with pytest.raises(NotFound):
            download_document(actor=completed.manufacturer.membership.user, file=file)
    pdf = SimpleUploadedFile("file.pdf", b"%PDF-1.4\n%%EOF", content_type="application/pdf")
    assert (
        client.post(
            ROOT + f"entitlements/{item.pk}/images/",
            {"file": pdf, "consent_version": settings.DOCUMENT_CONSENT_VERSION},
            format="multipart",
        ).status_code
        == 400
    )


def test_database_rejects_forged_subject_and_incomplete_scores(completed, cart_world):
    item = right(completed, "product")
    with pytest.raises(DatabaseError), transaction.atomic():
        Entitlement.objects.create(
            order=completed,
            author=completed.manufacturer,
            recipient=completed.retailer,
            product=item.product,
            topic="product",
            variants=item.variants,
            deadline=item.deadline,
            execution_mode="simulated",
        )
    for scores in [{"quality": 6}, {"quality": True}, {"quality": 4}]:
        with pytest.raises(DatabaseError), transaction.atomic():
            Review.objects.create(
                entitlement=item, actor=cart_world[0], scores=scores, submitted_at=timezone.now()
            )


@pytest.mark.django_db(transaction=True)
def test_database_prevents_early_nonatomic_publication(client, cart_world):
    order, _ = paid(client, cart_world)
    delivered(order)
    finance.settle(order_id=order.pk)
    result = submit(order, "manufacturer")
    with pytest.raises(DatabaseError), transaction.atomic():
        Review.objects.filter(pk=result["review"]["id"]).update(published_at=timezone.now())
    assert Review.objects.get().published_at is None


@pytest.mark.django_db(transaction=True)
def test_review_invariant_migration_roundtrip_preserves_final_content(client, cart_world):
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor

    order, _ = paid(client, cart_world)
    delivered(order)
    finance.settle(order_id=order.pk)
    pk = submit(order, "product")["review"]["id"]
    latest = MigrationExecutor(connection).loader.graph.leaf_nodes()
    try:
        MigrationExecutor(connection).migrate([("reviews", "0001_initial")])
    finally:
        MigrationExecutor(connection).migrate(latest)
    assert Review.objects.get(pk=pk).text == "تجربه خرید"
    with pytest.raises(DatabaseError), transaction.atomic():
        Review.objects.filter(pk=pk).update(text="تغییر")


@pytest.mark.django_db(transaction=True)
def test_concurrent_duplicate_submission_is_one_final_review(client, cart_world):
    order, _ = paid(client, cart_world)
    delivered(order)
    finance.settle(order_id=order.pk)

    def send(_):
        close_old_connections()
        try:
            submit(order, "product")
            return "submitted"
        except Conflict:
            return "locked"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(send, range(2))) == ["locked", "submitted"]
    assert Review.objects.count() == 1


def test_open_dispute_blocks_rights_until_real_closure(request, client, cart_world, user_factory):
    from marketplace.disputes import services as disputes
    from marketplace.disputes.tasks import process_cases
    from tests.test_disputes_support import refer_to_operator

    world = request.getfixturevalue("delivery_world")
    order, _, file, operator = world
    claim = refer_to_operator(world)
    assert services.create_entitlements(order_id=order.pk) == []
    with pytest.raises(Conflict):
        finance.settle(order_id=order.pk)
    disputes.decide(
        actor=operator,
        claim_id=claim.pk,
        operator=True,
        accepted=1,
        rejected=1,
        remedy="refund",
        reason="تصمیم نهایی",
        evidence=[file.pk],
        idempotency_key=uuid4(),
    )
    with patch(
        "django.utils.timezone.now", return_value=order.discrepancy_deadline + timedelta(seconds=1)
    ):
        assert process_cases() == 1
        assert services.create_entitlements(order_id=order.pk) == []
        finance.settle(order_id=order.pk)
    assert order.entitlements.count() == 3
