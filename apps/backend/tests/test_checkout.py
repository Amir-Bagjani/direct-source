from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.db import DatabaseError, close_old_connections, connections, transaction
from django.utils import timezone

from marketplace.accounts.business_services import create_business
from marketplace.catalog.models import PriceTier, Product, SalesPlan, Variant, VariantSupply
from marketplace.common.exceptions import Conflict
from marketplace.logistics.fulfillment import progress
from marketplace.logistics.models import ProductShipping, VariantPackage
from marketplace.orders import cancellation, cart, checkout, lifecycle
from marketplace.orders.models import CancellationRequest, Cart, Order, OrderGroup, Reservation
from marketplace.orders.services import accept_payment
from marketplace.orders.tasks import expire_orders
from tests.test_cart import DESTINATION, ROOT, prepared, selection
from tests.test_cart import cart_world as shared_cart_world
from tests.test_logistics_publication import ready_product  # noqa: F401

pytestmark = pytest.mark.django_db
cart_world = shared_cart_world
BASE = "/api/v1/orders/"


def submit(client, world):
    prepared(client, world)
    preview = client.get(ROOT + "preview/").data
    payload = {
        "cart": preview["id"],
        "quote_fingerprint": preview["quote_fingerprint"],
        "idempotency_key": str(uuid4()),
    }
    response = client.post(BASE + "checkout/", payload, format="json")
    assert response.status_code == 200, response.data
    return response.data, payload


def test_checkout_snapshot_retry_and_new_cart(client, cart_world):
    group, payload = submit(client, cart_world)
    order = Order.objects.get(pk=group["orders"][0]["id"])
    assert order.status == "pending"
    assert order.commercial["payable_total_irr"] == 52040
    assert order.commercial["manufacturer_commission_irr"] == 40
    assert order.lines.get().reservation.ready_quantity == 2
    assert order.shipping_groups.get().amount_irr == 50000
    assert not order.group.cart.is_active
    assert client.post(BASE + "checkout/", payload, format="json").data["id"] == group["id"]
    assert OrderGroup.objects.count() == Reservation.objects.count() == 1
    assert (
        client.post(
            BASE + "checkout/", {**payload, "quote_fingerprint": "a" * 64}, format="json"
        ).status_code
        == 409
    )
    assert client.get(ROOT).data["products"] == []
    for model, pk, change in [
        (Order, order.pk, {"commercial": {}}),
        (Cart, order.group.cart_id, {"is_active": True}),
        (Reservation, order.lines.get().reservation.pk, {"ready_quantity": 3}),
    ]:
        with pytest.raises(DatabaseError), transaction.atomic():
            model.objects.filter(pk=pk).update(**change)


def test_checkout_requires_new_price_confirmation_and_rolls_back(client, cart_world):
    prepared(client, cart_world)
    _, _, product, _, _ = cart_world
    preview = client.get(ROOT + "preview/").data
    payload = {
        "cart": preview["id"],
        "quote_fingerprint": preview["quote_fingerprint"],
        "idempotency_key": str(uuid4()),
    }
    product.sales_plan.tiers.update(unit_price_irr=2000)
    assert client.post(BASE + "checkout/", payload, format="json").status_code == 409
    assert not OrderGroup.objects.exists()
    refreshed = client.get(ROOT + "preview/").data
    with patch("marketplace.orders.checkout.freeze_shipping", side_effect=Conflict("test")):
        assert (
            client.post(
                BASE + "checkout/",
                {**payload, "quote_fingerprint": refreshed["quote_fingerprint"]},
                format="json",
            ).status_code
            == 409
        )
    assert not Reservation.objects.exists()
    assert Cart.objects.get(pk=preview["id"]).is_active


def test_accept_reject_permissions_deadline_and_reorder(client, cart_world, user_factory):
    group, _ = submit(client, cart_world)
    buyer, _, product, variant, _ = cart_world
    pk = group["orders"][0]["id"]
    url = BASE + f"{pk}/decision/"
    assert client.post(url, {"decision": "accept"}, format="json").status_code == 404
    client.force_authenticate(product.business.membership.user)
    assert client.get(BASE + f"groups/{group['id']}/").status_code == 404
    assert client.post(url, {"decision": "accept", "quantity": 1}, format="json").status_code == 400
    assert client.post(url, {"decision": "reject"}, format="json").status_code == 400
    result = client.post(url, {"decision": "reject", "reason": "ظرفیت نداریم"}, format="json")
    assert result.data["status"] == "rejected"
    assert Reservation.objects.get().status == "released"
    client.force_authenticate(buyer)
    assert client.get(ROOT).data["products"] == []
    response = client.post(BASE + f"{pk}/reorder/", {}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["products"][0]["selection"] == selection(variant)
    client.force_authenticate(user_factory())
    assert client.get(BASE + f"{pk}/").status_code == 404


@pytest.mark.parametrize("accepted", [False, True])
def test_expiration_releases_once(client, cart_world, accepted):
    group, _ = submit(client, cart_world)
    order = Order.objects.get(pk=group["orders"][0]["id"])
    if accepted:
        lifecycle.respond(actor=order.manufacturer.membership.user, pk=order.pk, decision="accept")
        order.refresh_from_db()
    deadline = order.payment_deadline if accepted else order.response_deadline
    with patch("django.utils.timezone.now", return_value=deadline):
        assert expire_orders() == 1
        assert expire_orders() == 0
    order.refresh_from_db()
    assert order.status == "expired"
    assert Reservation.objects.get().status == "released"
    with pytest.raises(Conflict):
        accept_payment(order_id=order.pk, payment_reference=uuid4())


def test_payment_allocates_and_paid_cancellation_waits_for_finance(client, cart_world):
    group, _ = submit(client, cart_world)
    buyer = cart_world[0]
    order = Order.objects.get(pk=group["orders"][0]["id"])
    lifecycle.respond(actor=order.manufacturer.membership.user, pk=order.pk, decision="accept")
    payment = uuid4()
    accept_payment(order_id=order.pk, payment_reference=payment)
    accept_payment(order_id=order.pk, payment_reference=payment)
    assert Reservation.objects.get().status == "allocated"
    result = lifecycle.cancel(actor=buyer, pk=order.pk, reason="انصراف")
    assert result["cancellation"]["status"] == "refund_pending"
    assert result["status"] == "active"
    with pytest.raises(Conflict):
        progress(
            actor=order.manufacturer.membership.user,
            request_id=order.shipping_groups.get().request.pk,
            line_id=order.lines.get().pk,
            prepared_quantity=1,
            note="",
        )
    reference = uuid4()
    cancellation.complete_refund(order_id=order.pk, refund_reference=reference)
    cancellation.complete_refund(order_id=order.pk, refund_reference=reference)
    assert Reservation.objects.get().status == "released"
    order.refresh_from_db()
    assert order.status == "cancelled"
    assert order.shipping_groups.get().request.status == "cancelled"


def test_preparation_cancellation_timeout_refers_without_refund(client, cart_world, user_factory):
    group, _ = submit(client, cart_world)
    order = Order.objects.get(pk=group["orders"][0]["id"])
    producer = order.manufacturer.membership.user
    lifecycle.respond(actor=producer, pk=order.pk, decision="accept")
    accept_payment(order_id=order.pk, payment_reference=uuid4())
    order.refresh_from_db()
    order.preparation_started_at = timezone.now()
    order.save()
    lifecycle.cancel(actor=cart_world[0], pk=order.pk, reason="انصراف")
    request = CancellationRequest.objects.get(order=order)
    with patch("django.utils.timezone.now", return_value=request.deadline + timedelta(seconds=1)):
        assert expire_orders() == 1
        assert expire_orders() == 0
    assert CancellationRequest.objects.get().status == "referred"
    assert Reservation.objects.get().status == "allocated"
    result = cancellation.decide(
        actor=user_factory(role="operator"),
        pk=order.pk,
        decision="reject",
        reason="ادامه سفارش",
        operator=True,
    )
    assert result["cancellation"]["status"] == "denied"
    assert result["status"] == "active"


def test_address_book_isolation_snapshot_and_bulk_shipping(client, cart_world, user_factory):
    buyer, _, product, variant, service = cart_world
    response = client.post(BASE + "addresses/", DESTINATION, format="json")
    pk = response.data[0]["id"]
    assert client.put(ROOT + "address/", {"address": pk}, format="json").status_code == 200
    client.put(BASE + f"addresses/{pk}/", {**DESTINATION, "address": "نشانی جدید"}, format="json")
    assert client.get(ROOT).data["destination"] == DESTINATION
    client.post(ROOT + f"products/{product.pk}/", selection(variant), format="json")
    result = client.put(
        ROOT + f"manufacturers/{product.business_id}/shipping/",
        {"service": str(service.pk)},
        format="json",
    )
    assert result.status_code == 200, result.data
    assert result.data["applied"] == [str(product.pk)]
    assert result.data["skipped"] == []
    client.force_authenticate(user_factory())
    assert client.put(ROOT + "address/", {"address": pk}, format="json").status_code == 404
    client.force_authenticate(buyer)
    assert client.delete(BASE + f"addresses/{pk}/").data == []
    assert client.get(ROOT).data["destination"] == DESTINATION


@pytest.mark.django_db(transaction=True)
def test_checkout_retry_race_only_reserves_once(client, cart_world):
    prepared(client, cart_world)
    buyer = cart_world[0]
    preview = cart.preview(actor=buyer)
    key = uuid4()

    def run(_):
        close_old_connections()
        try:
            return checkout.submit(
                actor=buyer,
                cart_id=preview["id"],
                idempotency_key=key,
                quote_fingerprint=preview["quote_fingerprint"],
            )
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(run, range(3)))
    assert len({result["id"] for result in results}) == 1
    assert Reservation.objects.get().ready_quantity == 2
    supply = VariantSupply.objects.get(variant=cart_world[3])
    with pytest.raises(DatabaseError), transaction.atomic():
        VariantSupply.objects.filter(pk=supply.pk).update(ready_stock=1)


def test_manufacturer_orders_are_independent(client, cart_world, user_factory, business_data):
    buyer, _, product, _, service = cart_world
    maker = create_business(actor=user_factory(), **business_data)
    maker.status, maker.controlled_access = "verified", True
    maker.save()
    second = Product.objects.create(
        business=maker, category=product.category, name="محصول دوم", status="published"
    )
    variant = Variant.objects.create(
        product=second, business=maker, sku="second", combination="c" * 64
    )
    VariantSupply.objects.create(variant=variant, mode="ready", ready_stock=10)
    plan = SalesPlan.objects.create(product=second, free_mix_min=2)
    PriceTier.objects.create(plan=plan, min_quantity=2, unit_price_irr=2000)
    shipping = ProductShipping.objects.create(product=second, origin=maker.addresses.first())
    shipping.services.add(service)
    VariantPackage.objects.create(
        variant=variant, weight_g=500, length_mm=100, width_mm=100, height_mm=100
    )
    url = ROOT + f"products/{second.pk}/"
    assert client.post(url, selection(variant), format="json").status_code == 200
    assert (
        client.put(url + "shipping/", {"service": str(service.pk)}, format="json").status_code
        == 200
    )
    group, _ = submit(client, cart_world)
    assert len(group["orders"]) == 2
    first_order = Order.objects.get(manufacturer=product.business)
    second_order = Order.objects.get(manufacturer=maker)
    lifecycle.respond(
        actor=product.business.membership.user,
        pk=first_order.pk,
        decision="reject",
        reason="عدم امکان تأمین",
    )
    lifecycle.respond(actor=maker.membership.user, pk=second_order.pk, decision="accept")
    accept_payment(order_id=second_order.pk, payment_reference=uuid4())
    data = lifecycle.read_group(actor=buyer, pk=group["id"])
    assert {o["status"] for o in data["orders"]} == {"rejected", "active"}
    assert Reservation.objects.get(line__order=first_order).status == "released"
    assert Reservation.objects.get(line__order=second_order).status == "allocated"
    assert len(lifecycle.order_list(actor=maker.membership.user)) == 1


@pytest.mark.django_db(transaction=True)
def test_competing_buyers_cannot_oversell(client, cart_world, user_factory, business_data):
    buyer, retailer, product, variant, service = cart_world
    other = user_factory()
    other_business = create_business(actor=other, **{**business_data, "kind": "retailer"})
    other_business.status, other_business.controlled_access = "verified", True
    other_business.save()
    requests = []
    for actor in [buyer, other]:
        client.force_authenticate(actor)
        prepared(client, (actor, retailer, product, variant, service))
        assert (
            client.put(
                ROOT + f"products/{product.pk}/", selection(variant, 6), format="json"
            ).status_code
            == 200
        )
        estimate = cart.preview(actor=actor)
        requests.append((actor, estimate))

    def run(request):
        actor, estimate = request
        close_old_connections()
        try:
            checkout.submit(
                actor=actor,
                cart_id=estimate["id"],
                idempotency_key=uuid4(),
                quote_fingerprint=estimate["quote_fingerprint"],
            )
            return "created"
        except Conflict:
            return "unavailable"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(run, requests)) == ["created", "unavailable"]
    assert OrderGroup.objects.count() == 1
    assert Reservation.objects.get().ready_quantity == 6


@pytest.mark.django_db(transaction=True)
def test_checkout_and_preparation_share_safe_party_lock_order(client, cart_world):
    group, _ = submit(client, cart_world)
    buyer = cart_world[0]
    order = Order.objects.get(pk=group["orders"][0]["id"])
    producer = order.manufacturer.membership.user
    lifecycle.respond(actor=producer, pk=order.pk, decision="accept")
    accept_payment(order_id=order.pk, payment_reference=uuid4())
    request_id = order.shipping_groups.get().request.pk
    line_id = order.lines.get().pk
    prepared(client, cart_world)
    estimate = cart.preview(actor=buyer)

    def run(operation):
        close_old_connections()
        try:
            if operation == "checkout":
                return checkout.submit(
                    actor=buyer,
                    cart_id=estimate["id"],
                    idempotency_key=uuid4(),
                    quote_fingerprint=estimate["quote_fingerprint"],
                )
            return progress(
                actor=producer,
                request_id=request_id,
                line_id=line_id,
                prepared_quantity=1,
                note="آماده‌سازی",
            )
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(run, ["checkout", "preparation"]))
    assert OrderGroup.objects.count() == 2
    assert order.lines.get().prepared_quantity == 1


def test_cancellation_api_referral_queue_and_operator_authorization(
    client, cart_world, user_factory
):
    group, _ = submit(client, cart_world)
    buyer = cart_world[0]
    order = Order.objects.get(pk=group["orders"][0]["id"])
    producer = order.manufacturer.membership.user
    url = BASE + f"{order.pk}/"
    assert client.get(BASE).data["count"] == 1
    assert client.get(BASE + "?page=2").status_code == 404
    client.force_authenticate(producer)
    assert (
        client.post(url + "decision/", {"decision": "accept"}, format="json").data["status"]
        == "accepted"
    )
    accept_payment(order_id=order.pk, payment_reference=uuid4())
    progress(
        actor=producer,
        request_id=order.shipping_groups.get().request.pk,
        line_id=order.lines.get().pk,
        prepared_quantity=1,
        note="آماده‌سازی",
    )
    client.force_authenticate(buyer)
    response = client.post(url + "cancel/", {"reason": "انصراف"}, format="json")
    assert response.data["cancellation"]["status"] == "pending"
    assert client.get(BASE + "cancellation-queue/").status_code == 403
    assert (
        client.post(
            url + "cancellation/resolve/", {"decision": "accept", "reason": "تصمیم"}, format="json"
        ).status_code
        == 403
    )
    client.force_authenticate(producer)
    response = client.post(
        url + "cancellation/decision/",
        {"decision": "reject", "reason": "شروع تولید"},
        format="json",
    )
    assert response.data["cancellation"]["status"] == "referred"
    client.force_authenticate(user_factory(role="operator"))
    assert client.get(BASE + "cancellation-queue/").data["results"][0]["id"] == str(order.pk)
    response = client.post(
        url + "cancellation/resolve/",
        {"decision": "accept", "reason": "تصمیم نهایی"},
        format="json",
    )
    assert response.data["cancellation"]["status"] == "refund_pending"
    assert client.get(BASE + "cancellation-queue/").data["count"] == 0
