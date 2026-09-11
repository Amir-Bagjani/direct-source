from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError, close_old_connections, connections, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from marketplace.common.exceptions import Conflict
from marketplace.disputes import services as disputes
from marketplace.disputes.models import DiscrepancyCase, DiscrepancyLine, DisputeDecision, Remedy
from marketplace.disputes.tasks import process_cases
from marketplace.finance import services as finance
from marketplace.finance.models import FinancialEvent
from marketplace.logistics import delivery, fulfillment
from marketplace.logistics.models import Carrier, DeliveryChallenge
from marketplace.operations.files import download_document
from marketplace.operations.models import StoredFile
from marketplace.support import services as support
from marketplace.support.models import AttachmentScope, Ticket, TicketMessage
from tests.test_cart import cart_world as shared_cart_world
from tests.test_finance import paid
from tests.test_fulfillment import packages
from tests.test_logistics_publication import ready_product  # noqa: F401

pytestmark = pytest.mark.django_db
cart_world = shared_cart_world
SUPPORT = "/api/v1/support/"
DSP = "/api/v1/disputes/"


def evidence(actor, business, order=None, ticket=None):
    file = StoredFile.objects.create(
        owner=actor,
        business=business,
        purpose="discrepancy" if order else "support",
        object_key=str(uuid4()),
        content_type="application/pdf",
        size=50,
        sha256="a" * 64,
        scan_status="clean",
    )
    AttachmentScope.objects.create(file=file, business=business, order=order, ticket=ticket)
    return file


@pytest.fixture
def delivered(client, cart_world, user_factory):
    order, _ = paid(client, cart_world)
    producer = order.manufacturer.membership.user
    operator = user_factory(role="operator")
    group = order.shipping_groups.get()
    request = group.request
    line = order.lines.get()
    fulfillment.progress(
        actor=producer,
        request_id=request.pk,
        line_id=line.pk,
        prepared_quantity=line.quantity,
        note="آماده",
    )
    fulfillment.ready(actor=producer, request_id=request.pk, packages=packages(group.weight_g))
    carrier = Carrier.objects.create(name="حمل‌کننده", kind="company", phone="02111111111")
    carrier.services.add(cart_world[4])
    fulfillment.assign(
        actor=operator,
        request_id=request.pk,
        carrier_id=carrier.pk,
        pickup_start=timezone.now() + timedelta(hours=1),
        pickup_end=timezone.now() + timedelta(hours=2),
        reason="تخصیص",
    )
    shipment = fulfillment.save_shipment(
        actor=producer,
        request_id=request.pk,
        packages=packages(group.weight_g),
        items=[{"group_item": line.shipping_item.pk, "quantity": line.quantity}],
    )
    fulfillment.hand_over(actor=producer, shipment_id=shipment.pk)
    token = delivery.issue_link(actor=operator, shipment_id=shipment.pk, reason="تحویل")["token"]
    delivery.request_code(token=token)
    delivery.verify_code(
        token=token, code=delivery.challenge_code(DeliveryChallenge.objects.get(shipment=shipment))
    )
    order.refresh_from_db()
    file = evidence(cart_world[0], order.retailer, order)
    return order, shipment, file, operator


def claim(world, quantity=2, **extra):
    order, shipment, file, _ = world
    data = dict(
        actor=order.retailer.membership.user,
        order_id=order.pk,
        line_id=order.lines.get().pk,
        quantity=quantity,
        kind="damaged",
        description="آسیب در بسته",
        evidence=[file.pk],
        idempotency_key=uuid4(),
        shipment_id=shipment.pk,
    )
    data.update(extra)
    return disputes.add_claim(**data), data


def refer_to_operator(world, quantity=2):
    data, _ = claim(world, quantity)
    row = DiscrepancyLine.objects.get(pk=data["lines"][0]["id"])
    disputes.decide(
        actor=world[0].manufacturer.membership.user,
        claim_id=row.pk,
        accepted=0,
        rejected=quantity,
        reason="نیازمند بررسی",
        idempotency_key=uuid4(),
    )
    ticket = Ticket.objects.get(case=row.case)
    support.assign(actor=world[3], pk=ticket.pk)
    return row


def test_claim_immutable_scoped_idempotent_and_deadlines(delivered, client, user_factory):
    order, shipment, file, operator = delivered
    data, payload = claim(delivered, 1)
    row = DiscrepancyLine.objects.get(pk=data["lines"][0]["id"])
    assert row.response_deadline - row.created_at <= timedelta(hours=48)
    assert finance.hold_reasons(order)
    assert disputes.add_claim(**payload)["id"] == data["id"]
    with pytest.raises(Conflict):
        disputes.add_claim(**{**payload, "quantity": 2})
    later = order.delivered_at + timedelta(hours=71)
    with patch("django.utils.timezone.now", return_value=later):
        second, _ = claim(delivered, 1)
    assert second["id"] == data["id"] and DiscrepancyCase.objects.count() == 1
    last = DiscrepancyLine.objects.latest("created_at")
    assert last.response_deadline > order.discrepancy_deadline
    with pytest.raises(Conflict):
        claim(delivered, 1)
    with pytest.raises(DatabaseError), transaction.atomic():
        DiscrepancyLine.objects.filter(pk=row.pk).update(quantity=2)
    with pytest.raises(DatabaseError), transaction.atomic():
        row.evidence.clear()
    client.force_authenticate(user_factory())
    assert client.get(DSP + f"{row.case_id}/").status_code == 404
    assert client.get(DSP).data["count"] == 0
    with patch("django.utils.timezone.now", return_value=order.discrepancy_deadline):
        with pytest.raises(Conflict):
            claim(delivered, 1)
        disputes.add_note(
            actor=order.retailer.membership.user,
            pk=row.case_id,
            text="توضیح تکمیلی",
            evidence=[file.pk],
        )
    assert row.case.notes.count() == 1


@pytest.mark.parametrize(
    "fault", ["no_file", "pending", "foreign", "too_many", "bad_quantity", "no_text"]
)
def test_invalid_claim_rolls_back_without_hold(delivered, client, user_factory, fault):
    order, shipment, file, operator = delivered
    data = dict(
        idempotency_key=str(uuid4()),
        line_id=str(order.lines.get().pk),
        quantity=1,
        kind="wrong_item",
        description="شرح",
        evidence=[str(file.pk)],
    )
    if fault == "no_file":
        data["evidence"] = []
    elif fault == "pending":
        file.scan_status = "pending"
        file.save()
    elif fault == "foreign":
        data["evidence"] = [str(evidence(user_factory(), order.retailer, order).pk)]
    elif fault == "too_many":
        data["evidence"] = [str(file.pk)] * 11
    elif fault == "bad_quantity":
        data["quantity"] = 1.5
    else:
        data["description"] = " "
    response = client.post(DSP + f"orders/{order.pk}/claims/", data, format="json")
    assert response.status_code in [400, 404], response.data
    assert not DiscrepancyCase.objects.exists()
    assert not order.finance_holds.exists()


def test_manufacturer_partial_response_atomic_refund_and_single_referral(delivered):
    order, shipment, file, operator = delivered
    data, _ = claim(delivered)
    row = DiscrepancyLine.objects.get(pk=data["lines"][0]["id"])
    command = dict(
        actor=order.manufacturer.membership.user,
        claim_id=row.pk,
        accepted=1,
        rejected=1,
        reason="پذیرش بخشی",
        idempotency_key=uuid4(),
    )
    with patch("marketplace.finance.services.apply_decision", side_effect=Conflict("rollback")):
        with pytest.raises(Conflict):
            disputes.decide(**command)
    assert not DisputeDecision.objects.exists() and not Remedy.objects.exists()
    result = disputes.decide(**command)
    assert result["compensation"]["completed_at"]
    assert FinancialEvent.objects.get(kind="refund").total_irr == 1020
    assert disputes.decide(**command)["id"] == result["id"]
    assert Ticket.objects.count() == 1
    with pytest.raises(Conflict):
        disputes.decide(**{**command, "idempotency_key": uuid4()})
    with pytest.raises(ValidationError):
        disputes.decide(**{**command, "remedy": "replacement"})
    row.refresh_from_db()
    assert disputes.unresolved(row) == 1 and row.referred_at
    with patch(
        "django.utils.timezone.now", return_value=row.response_deadline + timedelta(seconds=1)
    ):
        process_cases()
        process_cases()
    assert Ticket.objects.count() == 1


def test_row_timeout_does_not_shorten_late_row_response_window(delivered):
    order, _, _, operator = delivered
    first, _ = claim(delivered, 1)
    with patch("django.utils.timezone.now", return_value=order.delivered_at + timedelta(hours=71)):
        claim(delivered, 1)
    with patch("django.utils.timezone.now", return_value=order.delivered_at + timedelta(hours=73)):
        process_cases()
        process_cases()
    rows = list(DiscrepancyLine.objects.order_by("created_at"))
    assert rows[0].referred_at and not rows[1].referred_at
    assert rows[1].response_deadline == order.delivered_at + timedelta(hours=119)
    assert Ticket.objects.count() == 1 and DiscrepancyCase.objects.get().closed_at is None


def test_operator_decision_permissions_quantities_and_close_window(delivered, client, user_factory):
    order, _, file, operator = delivered
    row = refer_to_operator(delivered)
    command = dict(
        actor=operator,
        claim_id=row.pk,
        operator=True,
        accepted=1,
        rejected=0,
        remedy="refund",
        reason="مدرک بررسی شد",
        evidence=[file.pk],
        idempotency_key=uuid4(),
    )
    with pytest.raises(PermissionDenied):
        disputes.decide(**{**command, "actor": user_factory(role="operator")})
    with pytest.raises(ValidationError):
        disputes.decide(**{**command, "evidence": []})
    first = disputes.decide(**command)
    assert disputes.decide(**command)["id"] == first["id"]
    with pytest.raises(Conflict):
        disputes.decide(**{**command, "accepted": 2, "idempotency_key": uuid4()})
    with pytest.raises(Conflict):
        disputes.close(actor=operator, pk=row.case_id)
    disputes.decide(**{**command, "accepted": 0, "rejected": 1, "idempotency_key": uuid4()})
    with pytest.raises(Conflict):
        disputes.close(actor=operator, pk=row.case_id)
    with patch(
        "django.utils.timezone.now", return_value=order.discrepancy_deadline + timedelta(seconds=1)
    ):
        assert process_cases() == 1
        settlement = finance.settle(order_id=order.pk)
    assert settlement.total_irr == 980
    assert DiscrepancyCase.objects.get().closed_at
    with pytest.raises(DatabaseError), transaction.atomic():
        DisputeDecision.objects.update(reason="تغییر")
    client.force_authenticate(operator)
    assert (
        client.post(
            DSP + f"claims/{row.pk}/decision/", {"amount_irr": 100}, format="json"
        ).status_code
        == 400
    )


@pytest.mark.parametrize("remedy", ["replacement", "return"])
def test_independent_remedy_shipment_then_completion(delivered, remedy):
    order, original, file, operator = delivered
    row = refer_to_operator(delivered)
    result = disputes.decide(
        actor=operator,
        claim_id=row.pk,
        operator=True,
        accepted=2,
        rejected=0,
        remedy=remedy,
        reason="جبران لازم است",
        evidence=[file.pk],
        idempotency_key=uuid4(),
    )
    action = Remedy.objects.get(pk=result["compensation"]["id"])
    assert action.shipment.pk != original.pk and action.shipment.items.get().quantity == 2
    assert (
        action.shipment.purpose == remedy
        and fulfillment.aggregate_status(order) == "fully_delivered"
    )
    with pytest.raises(Conflict):
        disputes.close(actor=operator, pk=row.case_id)
    for status in ["handed_over", "in_transit", "delivered"]:
        disputes.remedy_progress(
            actor=operator,
            pk=action.pk,
            status=status,
            reason="نتیجهٔ مستند",
            evidence=[file.pk],
            tracking_code="TRACK-123",
        )
    disputes.remedy_progress(
        actor=operator,
        pk=action.pk,
        status="delivered",
        reason="retry",
        evidence=[file.pk],
        tracking_code="TRACK-123",
    )
    action.refresh_from_db()
    assert action.completed_at and fulfillment.aggregate_status(order) == "fully_delivered"
    original.refresh_from_db()
    assert original.status == "delivered"
    assert FinancialEvent.objects.filter(kind="refund").count() == (1 if remedy == "return" else 0)
    with patch(
        "django.utils.timezone.now", return_value=order.discrepancy_deadline + timedelta(seconds=1)
    ):
        assert process_cases() == 1
        settlement = finance.settle(order_id=order.pk)
    assert settlement.total_irr == (0 if remedy == "return" else 1960)


def test_waiver_needs_reason_and_preserves_history(delivered):
    order, _, file, operator = delivered
    row = refer_to_operator(delivered)
    result = disputes.decide(
        actor=operator,
        claim_id=row.pk,
        operator=True,
        accepted=2,
        rejected=0,
        remedy="replacement",
        reason="جایگزینی",
        evidence=[file.pk],
        idempotency_key=uuid4(),
    )
    pk = result["compensation"]["id"]
    with pytest.raises(ValidationError):
        disputes.waive(actor=operator, pk=pk, reason=" ", evidence=[file.pk])
    result = disputes.waive(
        actor=operator, pk=pk, reason="توافق مستند برای منتفی‌شدن", evidence=[file.pk]
    )
    assert (
        result["compensation"]["waived_at"]
        and result["compensation"]["shipment"]["status"] == "cancelled"
    )
    assert not FinancialEvent.objects.filter(kind="refund").exists()


def test_ticket_lifecycle_link_privacy_and_no_financial_effect(client, cart_world, user_factory):
    buyer, business, _, _, _ = cart_world
    file = evidence(buyer, business)
    payload = dict(
        title="پرسش حساب",
        category="account",
        text="شرح مسئله",
        files=[str(file.pk)],
        idempotency_key=str(uuid4()),
    )
    response = client.post(SUPPORT + "tickets/", payload, format="json")
    assert response.status_code == 200, response.data
    pk = response.data["id"]
    url = SUPPORT + f"tickets/{pk}/"
    assert client.post(SUPPORT + "tickets/", payload, format="json").data["id"] == pk
    client.force_authenticate(user_factory())
    assert client.get(url).status_code == 404
    assert client.post(f"/api/v1/files/{file.pk}/download/").status_code == 404
    operator = user_factory(role="operator")
    client.force_authenticate(operator)
    assert client.post(url + "assign/", {}, format="json").status_code == 200
    for status in ["waiting_user", "resolved"]:
        assert (
            client.post(
                url + "status/", {"status": status, "reason": "توضیح"}, format="json"
            ).status_code
            == 200
        )
    client.force_authenticate(buyer)
    reply = {"text": "مسئله ادامه دارد", "idempotency_key": str(uuid4())}
    assert client.post(url + "messages/", reply, format="json").status_code == 200
    assert client.get(url).data["status"] == "in_review"
    assert client.post(url + "messages/", reply, format="json").status_code == 200
    client.force_authenticate(operator)
    assert (
        client.post(
            url + "status/", {"status": "resolved", "reason": "پاسخ نهایی"}, format="json"
        ).status_code
        == 200
    )
    assert (
        client.post(
            url + "status/", {"status": "closed", "reason": "بسته شد"}, format="json"
        ).status_code
        == 200
    )
    client.force_authenticate(buyer)
    assert (
        client.post(
            url + "messages/", {**reply, "idempotency_key": str(uuid4())}, format="json"
        ).status_code
        == 409
    )
    assert (
        client.post(
            SUPPORT + "tickets/",
            {**payload, "files": [], "previous": pk, "idempotency_key": str(uuid4())},
            format="json",
        ).status_code
        == 200
    )
    with pytest.raises(DatabaseError), transaction.atomic():
        TicketMessage.objects.update(text="تغییر")
    assert not FinancialEvent.objects.exists()


def test_files_scoped_scan_gate_and_operator_download(delivered, client, user_factory):
    order, _, file, operator = delivered
    stranger = user_factory()
    with patch(
        "marketplace.operations.files.default_storage.url",
        return_value="https://private.test/signed",
    ):
        assert download_document(actor=order.retailer.membership.user, file=file)
        with pytest.raises(NotFound):
            download_document(actor=operator, file=file)
        claim(delivered, 1)
        assert download_document(actor=operator, file=file)
        assert download_document(actor=order.manufacturer.membership.user, file=file)
        with pytest.raises(NotFound):
            download_document(actor=stranger, file=file)
        file.scan_status = "rejected"
        file.save()
        with pytest.raises(NotFound):
            download_document(actor=order.retailer.membership.user, file=file)
    client.force_authenticate(order.retailer.membership.user)
    with (
        patch("marketplace.operations.files.default_storage.save", return_value="private/file.pdf"),
        patch("marketplace.operations.files.scan", return_value=True),
    ):
        response = client.post(
            SUPPORT + "files/",
            {
                "file": SimpleUploadedFile(
                    "proof.pdf", b"%PDF-1.4\nproof\n%%EOF", content_type="application/pdf"
                ),
                "consent_version": settings.DOCUMENT_CONSENT_VERSION,
                "order_id": str(order.pk),
            },
            format="multipart",
        )
    assert response.status_code == 200, response.data
    assert AttachmentScope.objects.get(file_id=response.data["id"]).order_id == order.pk


@pytest.mark.django_db(transaction=True)
def test_concurrent_claim_and_decision_exactly_once(delivered):
    order, _, file, operator = delivered
    payload = dict(
        actor=order.retailer.membership.user,
        order_id=order.pk,
        line_id=order.lines.get().pk,
        quantity=2,
        kind="shortage",
        description="کسری",
        evidence=[file.pk],
        idempotency_key=uuid4(),
    )

    def run_claim(_):
        close_old_connections()
        try:
            return disputes.add_claim(**payload)["id"]
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        result = list(pool.map(run_claim, range(2)))
    assert result[0] == result[1]
    row = DiscrepancyLine.objects.get()
    command = dict(
        actor=order.manufacturer.membership.user,
        claim_id=row.pk,
        accepted=2,
        rejected=0,
        reason="پذیرش",
        idempotency_key=uuid4(),
    )

    def run_decision(_):
        close_old_connections()
        try:
            return disputes.decide(**command)["id"]
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        result = list(pool.map(run_decision, range(2)))
    assert result[0] == result[1] and FinancialEvent.objects.filter(kind="refund").count() == 1


def test_claim_before_delivery_has_no_case_or_hold(client, cart_world):
    order, _ = paid(client, cart_world)
    file = evidence(cart_world[0], order.retailer, order)
    with pytest.raises(Conflict):
        disputes.add_claim(
            actor=cart_world[0],
            order_id=order.pk,
            line_id=order.lines.get().pk,
            quantity=1,
            kind="shortage",
            description="کسری",
            evidence=[file.pk],
            idempotency_key=uuid4(),
        )
    assert not DiscrepancyCase.objects.exists()
    assert not order.finance_holds.exists()


def test_ticket_rejects_foreign_links_and_invalid_message_atomically(
    client, cart_world, user_factory
):
    buyer, business, _, _, _ = cart_world
    payload = dict(title="پیگیری", category="other", text="شرح", idempotency_key=str(uuid4()))
    response = client.post(
        SUPPORT + "tickets/",
        {
            **payload,
            "related_type": "business",
            "related_id": str(uuid4()),
        },
        format="json",
    )
    assert response.status_code == 404 and not Ticket.objects.exists()
    result = client.post(SUPPORT + "tickets/", payload, format="json")
    ticket = Ticket.objects.get(pk=result.data["id"])
    file = evidence(buyer, business)
    for files in [[str(uuid4())], [str(file.pk)] * 11]:
        response = client.post(
            SUPPORT + f"tickets/{ticket.pk}/messages/",
            {
                "text": "پیوست نامعتبر",
                "files": files,
                "idempotency_key": str(uuid4()),
            },
            format="json",
        )
        assert response.status_code in [400, 404]
        assert ticket.messages.count() == 1
    client.force_authenticate(user_factory())
    assert client.get(SUPPORT + f"tickets/{ticket.pk}/").status_code == 404


def test_business_owner_with_operator_role_can_reply_to_own_ticket(cart_world, user_factory):
    from marketplace.accounts.models import PlatformRole

    buyer, _, _, _, _ = cart_world
    ticket = support.create(
        actor=buyer, title="پیگیری", category="other", text="شرح", idempotency_key=uuid4()
    )
    operator = user_factory(role="operator")
    support.assign(actor=operator, pk=ticket["id"])
    support.transition(actor=operator, pk=ticket["id"], status="resolved", reason="پاسخ")
    PlatformRole.objects.create(user=buyer, role="operator")
    support.reply(actor=buyer, pk=ticket["id"], text="هنوز مشکل دارم", idempotency_key=uuid4())
    assert Ticket.objects.get(pk=ticket["id"]).status == "in_review"


@pytest.mark.django_db(transaction=True)
def test_distinct_concurrent_claims_cannot_overclaim(delivered):
    def submit(_):
        close_old_connections()
        try:
            claim(delivered, 2)
            return "created"
        except Conflict:
            return "conflict"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(submit, range(2))) == ["conflict", "created"]
    assert DiscrepancyLine.objects.count() == 1


def test_manufacturer_can_upload_evidence_to_shared_referral(delivered, client):
    order, _, _, _ = delivered
    row = refer_to_operator(delivered)
    ticket = Ticket.objects.get(case=row.case)
    producer = order.manufacturer.membership.user
    client.force_authenticate(producer)
    with (
        patch(
            "marketplace.operations.files.default_storage.save", return_value="private/maker.pdf"
        ),
        patch("marketplace.operations.files.scan", return_value=True),
    ):
        response = client.post(
            SUPPORT + "files/",
            {
                "file": SimpleUploadedFile(
                    "proof.pdf", b"%PDF-1.4\nproof\n%%EOF", content_type="application/pdf"
                ),
                "consent_version": settings.DOCUMENT_CONSENT_VERSION,
                "ticket_id": str(ticket.pk),
            },
            format="multipart",
        )
    assert response.status_code == 200, response.data
    result = client.post(
        SUPPORT + f"tickets/{ticket.pk}/messages/",
        {
            "text": "مدرک تولیدکننده",
            "files": [response.data["id"]],
            "idempotency_key": str(uuid4()),
        },
        format="json",
    )
    assert result.status_code == 200, result.data


def test_manufacturer_response_forbidden_to_stranger_and_at_deadline(
    delivered, client, user_factory
):
    data, _ = claim(delivered, 1)
    row = DiscrepancyLine.objects.get(pk=data["lines"][0]["id"])
    command = {"accepted": 1, "rejected": 0, "reason": "پذیرش", "idempotency_key": str(uuid4())}
    client.force_authenticate(user_factory())
    assert (
        client.post(DSP + f"claims/{row.pk}/response/", command, format="json").status_code == 404
    )
    client.force_authenticate(delivered[0].manufacturer.membership.user)
    with patch("django.utils.timezone.now", return_value=row.response_deadline):
        response = client.post(DSP + f"claims/{row.pk}/response/", command, format="json")
    assert response.status_code == 409
    assert not DisputeDecision.objects.exists()
    assert not FinancialEvent.objects.filter(kind="refund").exists()
