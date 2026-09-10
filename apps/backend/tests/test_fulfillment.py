import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError, close_old_connections, connection, transaction
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, Throttled, ValidationError

from marketplace.accounts.business_services import create_business
from marketplace.catalog.models import Variant, VariantSupply
from marketplace.common.exceptions import Conflict
from marketplace.logistics import delivery, fulfillment
from marketplace.logistics.grouping import freeze_shipping
from marketplace.logistics.models import (
    Carrier,
    CarrierAssignment,
    DeliveryChallenge,
    DeliveryLink,
    FulfillmentEvent,
    Shipment,
    ShipmentItem,
    ShippingGroup,
    ShippingRequest,
    Tariff,
    VariantPackage,
)
from marketplace.operations.models import AuditEvent, InboxNotification, OutboxEvent, StoredFile
from marketplace.operations.tasks import deliver_outbox
from marketplace.orders.models import Order, OrderLine
from marketplace.orders.services import accept_payment, cancel_fulfillment
from tests.test_logistics_publication import ready_product  # noqa: F401

pytestmark = pytest.mark.django_db
BASE = "/api/v1/logistics/"


def packages(weight=5000):
    return [{"count": 1, "weight_g": weight, "length_mm": 100, "width_mm": 100, "height_mm": 100}]


@pytest.fixture
def world(ready_product, user_factory, business_data):  # noqa: F811
    producer, owner, product, variant, service, tariff = ready_product
    product.status = "published"
    product.save()
    product.business.controlled_access = True
    product.business.save()
    buyer = user_factory()
    retailer = create_business(actor=buyer, **{**business_data, "kind": "retailer"})
    retailer.status, retailer.controlled_access = "verified", True
    retailer.save()
    second = Variant.objects.create(
        product=product, business=product.business, sku="second", combination="b" * 64
    )
    VariantSupply.objects.create(
        variant=second, mode="hybrid", ready_stock=1, production_cap=10, lead_time_days=3
    )
    VariantPackage.objects.create(
        variant=second, weight_g=500, length_mm=100, width_mm=100, height_mm=100
    )
    order = Order.objects.create(
        manufacturer=product.business,
        retailer=retailer,
        destination={"province": "فارس", "city": "شیراز", "address": "نشانی خصوصی"},
    )
    one = OrderLine.objects.create(order=order, variant=variant, sku=variant.sku, quantity=4)
    two = OrderLine.objects.create(
        order=order,
        variant=second,
        sku=second.sku,
        quantity=6,
        production_quantity=5,
        lead_time_days=3,
    )
    group = freeze_shipping(
        order_id=order.pk, choices={str(variant.pk): service.pk, str(second.pk): service.pk}
    )[0]
    carrier = Carrier.objects.create(name="حمل‌کننده", kind="company", phone="02111111111")
    carrier.services.add(service)
    return SimpleNamespace(
        producer=producer,
        owner=owner,
        operator=user_factory(role="operator"),
        buyer=buyer,
        retailer=retailer,
        product=product,
        variant=variant,
        second=second,
        service=service,
        tariff=tariff,
        order=order,
        one=one,
        two=two,
        group=group,
        carrier=carrier,
    )


def paid(w):
    accept_payment(order_id=w.order.pk, payment_reference=uuid.uuid4())
    w.request = ShippingRequest.objects.get(group=w.group)
    return w.request


def prepared(w, weight=5000):
    paid(w)
    for line in [w.one, w.two]:
        fulfillment.progress(
            actor=w.producer,
            request_id=w.request.pk,
            line_id=line.pk,
            prepared_quantity=line.quantity,
            note="آماده شد",
        )
    fulfillment.ready(actor=w.producer, request_id=w.request.pk, packages=packages(weight))
    return w.request


def assigned(w):
    prepared(w)
    fulfillment.assign(
        actor=w.operator,
        request_id=w.request.pk,
        carrier_id=w.carrier.pk,
        pickup_start=timezone.now() + timedelta(hours=1),
        pickup_end=timezone.now() + timedelta(hours=2),
        reason="تخصیص اولیه",
    )


def split_shipments(w):
    assigned(w)
    one, two = w.one.shipping_item, w.two.shipping_item
    first = fulfillment.save_shipment(
        actor=w.producer,
        request_id=w.request.pk,
        packages=packages(2500),
        items=[{"group_item": one.pk, "quantity": 4}, {"group_item": two.pk, "quantity": 1}],
    )
    last = fulfillment.save_shipment(
        actor=w.producer,
        request_id=w.request.pk,
        packages=packages(2500),
        items=[{"group_item": two.pk, "quantity": 5}],
    )
    return first, last


def hand_all(w):
    first, last = split_shipments(w)
    for shipment in [first, last]:
        fulfillment.hand_over(actor=w.producer, shipment_id=shipment.pk)
    return first, last


def link_and_code(w, shipment):
    token = delivery.issue_link(actor=w.operator, shipment_id=shipment.pk, reason="لینک مأمور")[
        "token"
    ]
    delivery.request_code(token=token)
    deliver_outbox()
    notification = InboxNotification.objects.filter(
        recipient=w.buyer, topic="delivery.code"
    ).latest("created_at")
    return token, delivery.recipient_payload(notification)["code"]


def evidence(w):
    file = StoredFile.objects.create(
        owner=w.operator,
        business=w.order.manufacturer,
        purpose="shipping",
        object_key=str(uuid.uuid4()),
        content_type="application/pdf",
        size=100,
        sha256="a" * 64,
        scan_status="clean",
    )
    with transaction.atomic():
        fulfillment.record_event(w.request, w.operator, "file.uploaded", evidence=file)
    return file


def test_group_quote_combines_weight_and_freezes_snapshot(client, world):
    w = world
    client.force_authenticate(w.buyer)
    response = client.post(
        BASE + "group-quote/",
        {
            "destination_id": str(w.retailer.addresses.first().pk),
            "selections": [
                {"variant": str(w.variant.pk), "quantity": 4, "service": str(w.service.pk)},
                {"variant": str(w.second.pk), "quantity": 6, "service": str(w.service.pk)},
            ],
        },
        format="json",
    )
    assert response.status_code == 200, response.data
    assert len(response.data["groups"]) == 1
    assert response.data["groups"][0]["weight_g"] == 5000
    assert response.data["shipping_amount_irr"] == 50000
    w.service.name = "نام تازه"
    w.service.is_active = False
    w.service.save()
    w.group.refresh_from_db()
    assert w.group.snapshot["service_name"] == "پست"
    with pytest.raises(DatabaseError), transaction.atomic():
        ShippingGroup.objects.filter(pk=w.group.pk).update(amount_irr=1)
    with pytest.raises(DatabaseError), transaction.atomic():
        OrderLine.objects.filter(pk=w.one.pk).update(quantity=5)
    with pytest.raises(DatabaseError), transaction.atomic():
        Order.objects.filter(pk=w.order.pk).update(destination={})


def test_payment_idempotency_and_preparation_guards(client, world):
    w = world
    reference = uuid.uuid4()
    accept_payment(order_id=w.order.pk, payment_reference=reference)
    accept_payment(order_id=w.order.pk, payment_reference=reference)
    assert ShippingRequest.objects.filter(group=w.group).count() == 1
    assert FulfillmentEvent.objects.filter(action="request.created").count() == 1
    with pytest.raises(Conflict):
        accept_payment(order_id=w.order.pk, payment_reference=uuid.uuid4())
    w.request = ShippingRequest.objects.get(group=w.group)
    client.force_authenticate(w.producer)
    url = BASE + f"requests/{w.request.pk}/"
    assert client.post(url + "ready/", {"packages": packages()}, format="json").status_code == 409
    for line in [w.one, w.two]:
        response = client.post(
            url + "progress/",
            {"line_id": str(line.pk), "prepared_quantity": line.quantity, "note": "آماده"},
            format="json",
        )
        assert response.status_code == 200, response.data
    assert client.post(url + "ready/", {"packages": packages()}, format="json").status_code == 200
    count = FulfillmentEvent.objects.count()
    assert client.post(url + "ready/", {"packages": packages()}, format="json").status_code == 200
    assert FulfillmentEvent.objects.count() == count
    w.order.refresh_from_db()
    assert w.order.preparation_started_at
    assert w.two.lead_time_days == 3
    assert not w.order.discrepancy_deadline


def test_cancellation_contract_blocks_preparation_and_shipping(world):
    w = world
    paid(w)
    cancel_fulfillment(order_id=w.order.pk, reason="تصمیم معتبر سفارش")
    cancel_fulfillment(order_id=w.order.pk, reason="تکرار")
    w.request.refresh_from_db()
    assert w.request.status == "cancelled"
    with pytest.raises(Conflict):
        fulfillment.progress(
            actor=w.producer,
            request_id=w.request.pk,
            line_id=w.one.pk,
            prepared_quantity=1,
            note="شروع",
        )
    assert AuditEvent.objects.filter(action="order.fulfillment_cancelled").count() == 1


def test_unpaid_order_never_prepares(world):
    w = world
    request = ShippingRequest.objects.create(group=w.group)
    with pytest.raises(Conflict):
        fulfillment.progress(
            actor=w.producer,
            request_id=request.pk,
            line_id=w.one.pk,
            prepared_quantity=1,
            note="شروع",
        )
    w.one.refresh_from_db()
    assert w.one.prepared_quantity == 0


def test_weight_review_preserves_price_and_blocks_assignment(world):
    w = world
    prepared(w, weight=5100)
    w.request.refresh_from_db()
    assert w.request.ready_at is None
    with pytest.raises(Conflict):
        fulfillment.assign(
            actor=w.operator,
            request_id=w.request.pk,
            carrier_id=w.carrier.pk,
            pickup_start=timezone.now() + timedelta(hours=1),
            pickup_end=timezone.now() + timedelta(hours=2),
            reason="زودهنگام",
        )
    with pytest.raises(PermissionDenied):
        fulfillment.review_specifications(
            actor=w.producer, request_id=w.request.pk, decision="continue", reason="تأیید"
        )
    fulfillment.review_specifications(
        actor=w.operator, request_id=w.request.pk, decision="continue", reason="تعرفه یکسان"
    )
    w.request.refresh_from_db()
    w.group.refresh_from_db()
    assert w.request.status == "ready" and w.request.actual_weight_g == 5100
    assert w.request.ready_at is not None
    assert w.group.weight_g == 5000 and w.group.amount_irr == 50000


def test_unserviceable_actual_weight_refers_cancellation_without_financial_mutation(world):
    w = world
    prepared(w, weight=20000)
    with pytest.raises(Conflict):
        fulfillment.review_specifications(
            actor=w.operator, request_id=w.request.pk, decision="continue", reason="نامعتبر"
        )
    fulfillment.review_specifications(
        actor=w.operator, request_id=w.request.pk, decision="cancel_refund", reason="وزن خارج پوشش"
    )
    w.order.refresh_from_db()
    w.request.refresh_from_db()
    assert w.order.status == "active" and w.group.amount_irr == 50000
    assert w.request.status == "attention" and w.request.cancellation_referred_at
    assert fulfillment.aggregate_status(w.order) == "attention"


def test_carrier_permissions_compatibility_and_assignment_snapshot(client, world):
    w = world
    prepared(w)
    client.force_authenticate(w.buyer)
    assert client.get(BASE + "carriers/").status_code == 403
    client.force_authenticate(w.operator)
    payload = {
        "carrier_id": str(w.carrier.pk),
        "pickup_start": (timezone.now() + timedelta(hours=1)).isoformat(),
        "pickup_end": (timezone.now() + timedelta(hours=2)).isoformat(),
        "reason": "تخصیص",
        "agent": {"name": "مأمور"},
    }
    w.carrier.is_active = False
    w.carrier.save()
    url = BASE + f"requests/{w.request.pk}/assignment/"
    assert client.post(url, payload, format="json").status_code == 404
    w.carrier.is_active = True
    w.carrier.save()
    assert client.post(url, payload, format="json").status_code == 200
    old = CarrierAssignment.objects.get(request=w.request)
    response = client.patch(
        BASE + f"carriers/{w.carrier.pk}/",
        {"name": "نام تازه", "reason": "اصلاح نام"},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert client.post(url, payload, format="json").status_code == 200
    old.refresh_from_db()
    assert old.carrier_snapshot["name"] == "حمل‌کننده"
    assert w.request.assignments.count() == 2
    with pytest.raises(DatabaseError), transaction.atomic():
        CarrierAssignment.objects.filter(pk=old.pk).update(reason="بازنویسی")


def test_exact_manifest_partial_shipping_and_producer_lock(client, world):
    w = world
    assigned(w)
    first = fulfillment.save_shipment(
        actor=w.producer,
        request_id=w.request.pk,
        packages=packages(2000),
        items=[{"group_item": w.one.shipping_item.pk, "quantity": 4}],
    )
    with pytest.raises(Conflict):
        fulfillment.hand_over(actor=w.producer, shipment_id=first.pk)
    with pytest.raises(Conflict):
        fulfillment.save_shipment(
            actor=w.producer,
            request_id=w.request.pk,
            packages=packages(2000),
            items=[{"group_item": w.one.shipping_item.pk, "quantity": 4}],
        )
    last = fulfillment.save_shipment(
        actor=w.producer,
        request_id=w.request.pk,
        packages=packages(3000),
        items=[{"group_item": w.two.shipping_item.pk, "quantity": 6}],
    )
    fulfillment.hand_over(actor=w.producer, shipment_id=first.pk)
    assert fulfillment.aggregate_status(w.order) == "partially_shipped"
    client.force_authenticate(w.producer)
    assert (
        client.put(
            BASE + f"shipments/{first.pk}/",
            {
                "packages": packages(2000),
                "items": [{"group_item": str(w.one.shipping_item.pk), "quantity": 4}],
            },
            format="json",
        ).status_code
        == 409
    )
    with pytest.raises(Conflict):
        fulfillment.cancel_shipment(actor=w.producer, shipment_id=first.pk, reason="لغو")
    with pytest.raises(Conflict):
        cancel_fulfillment(order_id=w.order.pk, reason="پس از ارسال")
    fulfillment.hand_over(actor=w.producer, shipment_id=last.pk)
    assert fulfillment.aggregate_status(w.order) == "fully_shipped"


def test_full_delivery_codes_only_in_recipient_inbox_and_deadline_once(client, world, user_factory):
    w = world
    first, last = hand_all(w)
    token, code = link_and_code(w, first)
    client.force_authenticate(w.operator)
    inbox = client.get("/api/v1/inbox/")
    assert b'"code"' not in inbox.content
    client.force_authenticate(w.buyer)
    inbox = client.get("/api/v1/inbox/")
    assert code in str(inbox.data)
    raw_payloads = json.dumps(
        list(OutboxEvent.objects.filter(topic="delivery.code").values_list("payload", flat=True))
    )
    raw_history = json.dumps(list(FulfillmentEvent.objects.values("before", "after")))
    assert code not in raw_payloads and token not in raw_payloads
    assert token not in raw_history and code not in raw_history
    assert DeliveryLink.objects.get(shipment=first).token_digest != token
    client.force_authenticate(None)
    info = client.post(BASE + "delivery/info/", {"token": token}, format="json")
    assert set(info.data) == {"shipment", "service_name"}
    response = client.post(
        BASE + "delivery/verify-code/", {"token": token, "code": code}, format="json"
    )
    assert response.status_code == 204, response.data
    assert response["Cache-Control"] == "no-store"
    assert fulfillment.aggregate_status(w.order) == "partially_delivered"
    w.order.refresh_from_db()
    assert w.order.discrepancy_deadline is None
    assert (
        client.post(
            BASE + "delivery/verify-code/", {"token": token, "code": code}, format="json"
        ).status_code
        == 404
    )
    last_token, last_code = link_and_code(w, last)
    assert (
        client.post(
            BASE + "delivery/verify-code/", {"token": last_token, "code": last_code}, format="json"
        ).status_code
        == 204
    )
    w.order.refresh_from_db()
    deadline = w.order.discrepancy_deadline
    assert deadline - w.order.delivered_at == timedelta(hours=72)
    assert fulfillment.aggregate_status(w.order) == "fully_delivered"
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=w.order.pk)
        fulfillment.refresh_fulfillment(order)
    w.order.refresh_from_db()
    assert w.order.discrepancy_deadline == deadline
    assert OutboxEvent.objects.filter(topic="order.physically_delivered").count() == 1
    assert AuditEvent.objects.filter(action="order.physically_delivered").count() == 1
    assert ShippingRequest.objects.get(pk=w.request.pk).status == "completed"
    with pytest.raises(DatabaseError), transaction.atomic():
        Order.objects.filter(pk=w.order.pk).update(
            discrepancy_deadline=deadline + timedelta(hours=1)
        )


def test_failed_attempts_commit_and_disable_fifth_code(client, world):
    w = world
    first, last = hand_all(w)
    token, code = link_and_code(w, first)
    bad_code = "000000" if code != "000000" else "111111"
    for _ in range(5):
        response = client.post(
            BASE + "delivery/verify-code/", {"token": token, "code": bad_code}, format="json"
        )
        assert response.status_code == 400, response.data
    challenge = DeliveryChallenge.objects.get(shipment=first)
    assert challenge.attempts == 5 and challenge.consumed_at
    assert (
        client.post(
            BASE + "delivery/verify-code/", {"token": token, "code": code}, format="json"
        ).status_code
        == 400
    )
    first.refresh_from_db()
    assert first.status == "handed_over"


def test_code_expiration_resend_limits_and_link_rotation(world):
    w = world
    first, last = hand_all(w)
    token, code = link_and_code(w, first)
    now = timezone.now()
    with pytest.raises(Throttled):
        delivery.request_code(token=token)
    with patch(
        "marketplace.logistics.delivery.timezone.now", return_value=now + timedelta(seconds=61)
    ):
        delivery.request_code(token=token)
        with pytest.raises(ValidationError):
            delivery.verify_code(token=token, code=code)
    assert DeliveryChallenge.objects.filter(shipment=first, consumed_at__isnull=True).count() == 1
    for i in range(3):
        with patch(
            "marketplace.logistics.delivery.timezone.now",
            return_value=now + timedelta(seconds=(i + 2) * 61),
        ):
            delivery.request_code(token=token)
    with patch(
        "marketplace.logistics.delivery.timezone.now", return_value=now + timedelta(minutes=6)
    ):
        with pytest.raises(Throttled):
            delivery.request_code(token=token)
    new_token = delivery.issue_link(actor=w.operator, shipment_id=first.pk, reason="بازصدور")[
        "token"
    ]
    with pytest.raises((NotFound, Http404)):
        delivery.link_info(token=token)
    assert DeliveryChallenge.objects.filter(shipment=first, consumed_at__isnull=True).count() == 0
    with patch(
        "marketplace.logistics.delivery.timezone.now", return_value=now + timedelta(hours=25)
    ):
        with pytest.raises((NotFound, Http404)):
            delivery.link_info(token=new_token)


def test_expired_code_never_delivers(world):
    w = world
    first, last = hand_all(w)
    token, code = link_and_code(w, first)
    with patch(
        "marketplace.logistics.delivery.timezone.now",
        return_value=timezone.now() + timedelta(minutes=11),
    ):
        with pytest.raises(ValidationError):
            delivery.verify_code(token=token, code=code)
    first.refresh_from_db()
    assert first.status == "handed_over"


def test_unconfirmed_only_operator_with_scanned_order_evidence(client, world):
    w = world
    first, last = hand_all(w)
    token, code = link_and_code(w, first)
    delivery.unconfirmed_delivery(token=token, reason="گیرنده به کد دسترسی ندارد")
    with pytest.raises((NotFound, Http404)):
        delivery.verify_code(token=token, code=code)
    assert fulfillment.aggregate_status(w.order) == "attention"
    client.force_authenticate(w.operator)
    queue = client.get(BASE + "unconfirmed-deliveries/")
    assert queue.status_code == 200 and queue.data["count"] == 1
    with pytest.raises(ValidationError):
        fulfillment.track_status(
            actor=w.operator, shipment_id=first.pk, status="delivered", reason="بررسی"
        )
    file = evidence(w)
    with pytest.raises(PermissionDenied):
        fulfillment.track_status(
            actor=w.producer,
            shipment_id=first.pk,
            status="delivered",
            reason="خودتأییدی",
            evidence_id=file.pk,
        )
    file.scan_status = "pending"
    file.save()
    with pytest.raises((NotFound, Http404)):
        fulfillment.track_status(
            actor=w.operator,
            shipment_id=first.pk,
            status="delivered",
            reason="بررسی",
            evidence_id=file.pk,
        )
    file.scan_status = "clean"
    file.save()
    fulfillment.track_status(
        actor=w.operator,
        shipment_id=first.pk,
        status="delivered",
        reason="رسید بررسی شد",
        evidence_id=file.pk,
    )
    assert fulfillment.aggregate_status(w.order) == "partially_delivered"
    token, code = link_and_code(w, last)
    delivery.verify_code(token=token, code=code)
    w.order.refresh_from_db()
    assert w.order.discrepancy_deadline


def test_failure_resend_new_shipment_preserves_delivered_items(world):
    w = world
    first, last = hand_all(w)
    token, code = link_and_code(w, first)
    delivery.verify_code(token=token, code=code)
    fulfillment.track_status(
        actor=w.operator, shipment_id=last.pk, status="failed", reason="عدم دسترسی"
    )
    assert fulfillment.aggregate_status(w.order) == "attention"
    with pytest.raises(Conflict):
        fulfillment.track_status(
            actor=w.operator, shipment_id=last.pk, status="in_transit", reason="بازگشایی ممنوع"
        )
    fulfillment.track_status(
        actor=w.operator, shipment_id=last.pk, status="returned", reason="بازگشت فیزیکی"
    )
    replacement = fulfillment.resolve_failure(
        actor=w.operator, shipment_id=last.pk, decision="resend", reason="هماهنگی مجدد"
    )
    assert replacement.pk != last.pk and replacement.replaces_id == last.pk
    assert (
        fulfillment.resolve_failure(
            actor=w.operator, shipment_id=last.pk, decision="resend", reason="تکرار"
        ).pk
        == replacement.pk
    )
    last.refresh_from_db()
    first.refresh_from_db()
    assert last.status == "returned" and first.status == "delivered"
    assert fulfillment.aggregate_status(w.order) == "partially_delivered"
    with pytest.raises(Conflict):
        fulfillment.hand_over(actor=w.producer, shipment_id=replacement.pk)
    fulfillment.assign(
        actor=w.operator,
        request_id=w.request.pk,
        carrier_id=w.carrier.pk,
        pickup_start=timezone.now() + timedelta(hours=2),
        pickup_end=timezone.now() + timedelta(hours=3),
        reason="جمع‌آوری مجدد",
    )
    fulfillment.hand_over(actor=w.producer, shipment_id=replacement.pk)
    token, code = link_and_code(w, replacement)
    delivery.verify_code(token=token, code=code)
    assert fulfillment.aggregate_status(w.order) == "fully_delivered"


def test_tracking_correction_reason_and_history(world):
    w = world
    first, last = hand_all(w)
    with pytest.raises(ValidationError):
        fulfillment.tracking(
            actor=w.operator, shipment_id=first.pk, data={"tracking_number": "123"}, reason=""
        )
    fulfillment.tracking(
        actor=w.operator, shipment_id=first.pk, data={"tracking_number": "123"}, reason="بارنامه"
    )
    fulfillment.tracking(
        actor=w.operator,
        shipment_id=first.pk,
        data={"tracking_number": "456"},
        reason="اصلاح اشتباه",
    )
    event = first.events.filter(action="shipment.tracking").latest("created_at")
    assert event.before["tracking_number"] == "123" and event.after["tracking_number"] == "456"
    with pytest.raises(DatabaseError), transaction.atomic():
        FulfillmentEvent.objects.filter(pk=event.pk).update(reason="حذف سابقه")


def test_private_requests_events_and_order_isolation(client, world, user_factory):
    w = world
    paid(w)
    stranger = user_factory()
    for actor in [None, stranger, w.buyer, w.producer, w.operator]:
        client.force_authenticate(actor)
        expected = 401 if actor is None else 404 if actor == stranger else 200
        assert client.get(BASE + f"requests/{w.request.pk}/").status_code == expected
        assert client.get(BASE + f"requests/{w.request.pk}/events/").status_code == expected
        assert client.get(BASE + f"orders/{w.order.pk}/fulfillment/").status_code == expected
    client.force_authenticate(w.buyer)
    assert (
        client.post(
            BASE + f"requests/{w.request.pk}/progress/",
            {"line_id": str(w.one.pk), "prepared_quantity": 1, "note": "شروع"},
            format="json",
        ).status_code
        == 403
    )
    client.force_authenticate(stranger)
    assert client.get(BASE + "requests/").data["count"] == 0


def test_delivery_policy_owner_only(client, world):
    w = world
    payload = {
        "ttl_seconds": 500,
        "max_attempts": 3,
        "cooldown_seconds": 120,
        "hourly_limit": 4,
        "reason": "سیاست مالک",
    }
    client.force_authenticate(w.operator)
    assert client.put(BASE + "delivery-policy/", payload, format="json").status_code == 403
    client.force_authenticate(w.owner)
    assert client.put(BASE + "delivery-policy/", payload, format="json").status_code == 200
    assert client.get(BASE + "delivery-policy/").data["max_attempts"] == 3


def test_shipping_file_scan_upload_and_tenant_download(client, world, user_factory, settings):
    w = world
    paid(w)
    client.force_authenticate(w.operator)
    document = SimpleUploadedFile(
        "receipt.pdf", b"%PDF-1.4\nreceipt\n%%EOF", content_type="application/pdf"
    )
    with (
        patch("marketplace.operations.files.scan", return_value=True),
        patch(
            "marketplace.operations.files.default_storage.save", return_value="private/receipt.pdf"
        ),
    ):
        response = client.post(
            BASE + f"requests/{w.request.pk}/documents/",
            {"file": document, "consent_version": settings.DOCUMENT_CONSENT_VERSION},
            format="multipart",
        )
    assert response.status_code == 201, response.data
    file_id = response.data["id"]
    with patch(
        "marketplace.operations.files.default_storage.url",
        return_value="https://storage.invalid/private",
    ):
        for actor in [w.operator, w.producer, w.buyer]:
            client.force_authenticate(actor)
            assert client.post(f"/api/v1/files/{file_id}/download/").status_code == 200
        client.force_authenticate(user_factory())
        assert client.post(f"/api/v1/files/{file_id}/download/").status_code == 404


def test_database_rejects_cross_group_and_oversend(world):
    w = world
    first, last = split_shipments(w)
    with pytest.raises(DatabaseError), transaction.atomic():
        ShipmentItem.objects.filter(shipment=first, group_item=w.one.shipping_item).update(
            quantity=5
        )
        with connection.cursor() as cursor:
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
    with pytest.raises(DatabaseError), transaction.atomic():
        Shipment.objects.filter(pk=first.pk).update(status="returned")


@pytest.mark.django_db(transaction=True)
def test_concurrent_payment_creates_one_request(world):
    w = world
    reference = uuid.uuid4()

    def pay():
        close_old_connections()
        try:
            accept_payment(order_id=w.order.pk, payment_reference=reference)
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(lambda _: pay(), range(2)))
    assert ShippingRequest.objects.filter(group=w.group).count() == 1
    assert FulfillmentEvent.objects.filter(action="request.created").count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_last_delivery_starts_deadline_once(world):
    w = world
    first, last = hand_all(w)
    pairs = [link_and_code(w, shipment) for shipment in [first, last]]

    def verify(pair):
        close_old_connections()
        try:
            delivery.verify_code(token=pair[0], code=pair[1])
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(verify, pairs))
    assert AuditEvent.objects.filter(action="order.physically_delivered").count() == 1
    assert OutboxEvent.objects.filter(topic="order.physically_delivered").count() == 1


def test_cross_order_lines_and_shipments_are_rejected(world):
    w = world
    assigned(w)
    other = Order.objects.create(
        manufacturer=w.product.business, retailer=w.retailer, destination=w.order.destination
    )
    line = OrderLine.objects.create(order=other, variant=w.variant, sku=w.variant.sku, quantity=1)
    freeze_shipping(order_id=other.pk, choices={str(w.variant.pk): w.service.pk})
    accept_payment(order_id=other.pk, payment_reference=uuid.uuid4())
    other_request = ShippingRequest.objects.get(group__order=other)
    with pytest.raises((NotFound, Http404)):
        fulfillment.progress(
            actor=w.producer,
            request_id=other_request.pk,
            line_id=w.one.pk,
            prepared_quantity=1,
            note="قلم دیگر",
        )
    with pytest.raises(ValidationError):
        fulfillment.save_shipment(
            actor=w.producer,
            request_id=w.request.pk,
            packages=packages(),
            items=[{"group_item": line.shipping_item.pk, "quantity": 1}],
        )
    shipment = fulfillment.save_shipment(
        actor=w.producer,
        request_id=w.request.pk,
        packages=packages(2000),
        items=[{"group_item": w.one.shipping_item.pk, "quantity": 4}],
    )
    with pytest.raises(DatabaseError), transaction.atomic():
        ShipmentItem.objects.create(shipment=shipment, group_item=line.shipping_item, quantity=1)
    cancel_fulfillment(order_id=other.pk, reason="لغو مستقل")
    w.order.refresh_from_db()
    assert w.order.status == "active"


def test_manual_assignment_exception_requires_reason_and_can_resume(client, world):
    w = world
    prepared(w)
    client.force_authenticate(w.operator)
    url = BASE + f"requests/{w.request.pk}/exception/"
    assert client.post(url, {"decision": "hold", "reason": ""}, format="json").status_code == 400
    assert (
        client.post(
            url, {"decision": "hold", "reason": "حمل‌کننده در دسترس نیست"}, format="json"
        ).status_code
        == 200
    )
    assert fulfillment.aggregate_status(w.order) == "attention"
    assert client.get(BASE + "requests/?status=attention").data["count"] == 1
    assert (
        client.post(
            url, {"decision": "resume", "reason": "هماهنگی انجام شد"}, format="json"
        ).status_code
        == 200
    )
    assert client.get(BASE + "requests/?status=ready").data["count"] == 1


def test_operator_batch_manifest_correction_is_atomic(client, world):
    w = world
    first, last = hand_all(w)
    corrections = [
        {
            "shipment_id": str(first.pk),
            "packages": packages(3000),
            "items": [
                {"group_item": str(w.one.shipping_item.pk), "quantity": 4},
                {"group_item": str(w.two.shipping_item.pk), "quantity": 2},
            ],
        },
        {
            "shipment_id": str(last.pk),
            "packages": packages(2000),
            "items": [{"group_item": str(w.two.shipping_item.pk), "quantity": 4}],
        },
    ]
    client.force_authenticate(w.operator)
    url = BASE + f"requests/{w.request.pk}/manifest-correction/"
    response = client.post(
        url, {"corrections": corrections, "reason": "اصلاح تقسیم بسته‌ها"}, format="json"
    )
    assert response.status_code == 200, response.data
    assert first.items.get(group_item=w.two.shipping_item).quantity == 2
    corrections[1]["items"][0]["quantity"] = 5
    assert (
        client.post(
            url, {"corrections": corrections, "reason": "تعداد اشتباه"}, format="json"
        ).status_code
        == 409
    )
    assert last.items.get(group_item=w.two.shipping_item).quantity == 4
    assert FulfillmentEvent.objects.filter(action="shipment.corrected").count() == 2


def test_weight_cannot_change_after_ready_by_changing_manifest(world):
    w = world
    first, last = split_shipments(w)
    fulfillment.save_shipment(
        actor=w.producer,
        request_id=w.request.pk,
        shipment_id=first.pk,
        packages=packages(4000),
        items=fulfillment.manifest(first)["items"],
    )
    with pytest.raises(Conflict):
        fulfillment.hand_over(actor=w.producer, shipment_id=first.pk)


def test_failed_delivery_refund_referral_preserves_partial_delivery(world):
    w = world
    first, last = hand_all(w)
    token, code = link_and_code(w, first)
    delivery.verify_code(token=token, code=code)
    token, code = link_and_code(w, last)
    delivery.unconfirmed_delivery(token=token, reason="ادعای تحویل")
    file = evidence(w)
    fulfillment.track_status(
        actor=w.operator,
        shipment_id=last.pk,
        status="failed",
        reason="مدرک بررسی شد و کافی نبود",
        evidence_id=file.pk,
    )
    fulfillment.resolve_failure(
        actor=w.operator,
        shipment_id=last.pk,
        decision="cancel_refund",
        reason="ارجاع بخش تحویل‌نشده",
    )
    fulfillment.resolve_failure(
        actor=w.operator, shipment_id=last.pk, decision="cancel_refund", reason="تکرار"
    )
    w.order.refresh_from_db()
    first.refresh_from_db()
    assert first.status == "delivered" and w.order.status == "active"
    assert fulfillment.aggregate_status(w.order) == "attention"
    assert w.order.discrepancy_deadline is None
    assert OutboxEvent.objects.filter(topic="shipping.cancellation_referred").count() == 1
    reference = uuid.uuid4()
    fulfillment.complete_cancellation_referral(
        request_id=w.request.pk, outcome_reference=reference, reason="نتیجهٔ معتبر مالی"
    )
    fulfillment.complete_cancellation_referral(
        request_id=w.request.pk, outcome_reference=reference, reason="تکرار نتیجه"
    )
    w.request.refresh_from_db()
    assert w.request.status == "cancelled"
    assert fulfillment.aggregate_status(w.order) == "partially_delivered"
    assert first.status == "delivered" and w.order.discrepancy_deadline is None
    assert FulfillmentEvent.objects.filter(action="request.cancellation_completed").count() == 1


def test_full_happy_path_through_api(client, world):
    w = world
    paid(w)  # Only the trusted payment contract; no public payment shortcut.
    root = BASE + f"requests/{w.request.pk}/"
    client.force_authenticate(w.producer)
    for line in [w.one, w.two]:
        response = client.post(
            root + "progress/",
            {"line_id": str(line.pk), "prepared_quantity": line.quantity, "note": "اتمام"},
            format="json",
        )
        assert response.status_code == 200, response.data
    assert client.post(root + "ready/", {"packages": packages()}, format="json").status_code == 200
    client.force_authenticate(w.operator)
    response = client.post(
        root + "assignment/",
        {
            "carrier_id": str(w.carrier.pk),
            "pickup_start": (timezone.now() + timedelta(hours=1)).isoformat(),
            "pickup_end": (timezone.now() + timedelta(hours=2)).isoformat(),
            "reason": "جمع‌آوری",
        },
        format="json",
    )
    assert response.status_code == 200, response.data
    client.force_authenticate(w.producer)
    response = client.post(
        root + "shipments/",
        {
            "packages": packages(),
            "items": [
                {"group_item": str(w.one.shipping_item.pk), "quantity": 4},
                {"group_item": str(w.two.shipping_item.pk), "quantity": 6},
            ],
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    shipment_url = BASE + f"shipments/{response.data['id']}/"
    assert client.post(shipment_url + "hand-over/").status_code == 200
    client.force_authenticate(w.operator)
    assert (
        client.post(
            shipment_url + "tracking/",
            {"tracking_number": "WAYBILL-123", "reason": "ثبت بارنامه"},
            format="json",
        ).status_code
        == 200
    )
    assert (
        client.post(
            shipment_url + "status/", {"status": "in_transit", "reason": "شروع حمل"}, format="json"
        ).status_code
        == 200
    )
    link = client.post(shipment_url + "delivery-link/", {"reason": "صدور لینک"}, format="json")
    assert link.status_code == 200 and link["Cache-Control"] == "no-store"
    token = link.data["token"]
    assert "#token=" in link.data["link"]
    client.force_authenticate(None)
    assert (
        client.post(BASE + "delivery/request-code/", {"token": token}, format="json").status_code
        == 204
    )
    deliver_outbox()
    client.force_authenticate(w.buyer)
    inbox = client.get("/api/v1/inbox/")
    assert inbox["Cache-Control"] == "no-store"
    code = next(
        row["payload"]["code"] for row in inbox.data["results"] if row["topic"] == "delivery.code"
    )
    client.force_authenticate(None)
    assert (
        client.post(
            BASE + "delivery/verify-code/", {"token": token, "code": code}, format="json"
        ).status_code
        == 204
    )
    client.force_authenticate(w.buyer)
    assert (
        client.get(BASE + f"orders/{w.order.pk}/fulfillment/").data["shipping_status"]
        == "fully_delivered"
    )


@pytest.mark.django_db(transaction=True)
def test_concurrent_same_code_consumes_only_once(world):
    w = world
    first, last = hand_all(w)
    token, code = link_and_code(w, first)

    def verify():
        close_old_connections()
        try:
            delivery.verify_code(token=token, code=code)
            return True
        except (NotFound, Http404, ValidationError):
            return False
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: verify(), range(2)))
    assert sorted(results) == [False, True]
    assert first.events.filter(action="shipment.status", after={"status": "delivered"}).count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_allocations_do_not_oversend(world):
    w = world
    assigned(w)

    def allocate():
        close_old_connections()
        try:
            fulfillment.save_shipment(
                actor=w.producer,
                request_id=w.request.pk,
                packages=packages(),
                items=[{"group_item": w.one.shipping_item.pk, "quantity": 4}],
            )
            return True
        except Conflict:
            return False
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: allocate(), range(2)))
    assert sorted(results) == [False, True]
    assert w.request.shipments.count() == 1


@pytest.mark.django_db(transaction=True)
def test_fulfillment_migrations_reverse_forward_preserve_existing_catalog(ready_product):  # noqa: F811
    from django.db.migrations.executor import MigrationExecutor

    producer, owner, product, variant, service, tariff = ready_product
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    try:
        executor.migrate(
            [("logistics", "0003_alter_tariff_activated_at_alter_tariff_activated_by")]
        )
        with connection.cursor() as cursor:
            cursor.execute("SELECT name FROM logistics_shippingservice WHERE id=%s", [service.pk])
            assert cursor.fetchone()[0] == "پست"
    finally:
        MigrationExecutor(connection).migrate(latest)
    service.refresh_from_db()
    assert service.delivery_days_min == 1 and service.delivery_days_max == 7
    assert Tariff.objects.get(pk=tariff.pk).is_active
