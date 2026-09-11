from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.db import DatabaseError, close_old_connections, connections, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.common.exceptions import Conflict
from marketplace.finance import services as finance
from marketplace.finance.models import CompensationDecision, FinancialEvent, Invoice, LedgerEntry
from marketplace.finance.tasks import process_orders
from marketplace.operations.models import AuditEvent
from marketplace.orders import lifecycle
from marketplace.orders.models import Order, Reservation
from tests.test_cart import cart_world as shared_cart_world
from tests.test_checkout import submit
from tests.test_logistics_publication import ready_product  # noqa: F401

pytestmark = pytest.mark.django_db
cart_world = shared_cart_world
ROOT = "/api/v1/finance/"


def accepted(client, world):
    group, _ = submit(client, world)
    order = Order.objects.get(pk=group["orders"][0]["id"])
    lifecycle.respond(actor=world[2].business.membership.user, pk=order.pk, decision="accept")
    order.refresh_from_db()
    return order


def paid(client, world):
    order = accepted(client, world)
    payment = finance.pay(actor=world[0], pk=order.pk, idempotency_key=uuid4())
    order.refresh_from_db()
    return order, payment


def delivered(order, ago=73):
    order.delivered_at = timezone.now() - timedelta(hours=ago)
    order.discrepancy_deadline = order.delivered_at + timedelta(hours=72)
    order.save(update_fields=["delivered_at", "discrepancy_deadline", "updated_at"])


def test_payment_atomic_snapshot_invoice_ledger_and_retry(client, cart_world):
    order = accepted(client, cart_world)
    key = uuid4()
    url = ROOT + f"orders/{order.pk}/pay/"
    with patch("marketplace.finance.services.accept_payment", side_effect=Conflict("rollback")):
        assert client.post(url, {"idempotency_key": str(key)}, format="json").status_code == 409
    assert not FinancialEvent.objects.exists()
    assert not Invoice.objects.exists()
    assert Reservation.objects.get().status == "reserved"
    response = client.post(url, {"idempotency_key": str(key)}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["total_irr"] == 52040
    assert client.post(url, {"idempotency_key": str(key)}, format="json").data == response.data
    assert client.post(url, {"idempotency_key": str(uuid4())}, format="json").status_code == 409
    order.refresh_from_db()
    assert order.status == "active"
    assert Reservation.objects.get().status == "allocated"
    assert order.shipping_groups.get().request.status == "waiting"
    assert FinancialEvent.objects.count() == Invoice.objects.count() == 1
    assert LedgerEntry.objects.aggregate(total=Sum("amount_irr"))["total"] == 0
    assert LedgerEntry.objects.get(account="producer_payable").amount_irr == 1960
    assert LedgerEntry.objects.get(account="commission_reserved").amount_irr == 80
    assert LedgerEntry.objects.get(account="logistics").amount_irr == 50000
    event = FinancialEvent.objects.get()
    assert event.currency == "IRR" and event.execution_mode == "simulated"
    for model, change in [
        (FinancialEvent, {"total_irr": 1}),
        (Invoice, {"lines": []}),
        (LedgerEntry, {"amount_irr": 0}),
    ]:
        with pytest.raises(DatabaseError), transaction.atomic():
            model.objects.update(**change)
        with pytest.raises(DatabaseError), transaction.atomic():
            model.objects.first().delete()


@pytest.mark.parametrize("state", ["pending", "rejected", "expired", "cancelled", "late"])
def test_payment_invalid_lifecycle(client, cart_world, state):
    if state in ["pending", "rejected"]:
        group, _ = submit(client, cart_world)
        order = Order.objects.get(pk=group["orders"][0]["id"])
    else:
        order = accepted(client, cart_world)
    if state == "late":
        # Persisted deadline cannot be edited; advance the command clock.
        with patch(
            "marketplace.finance.services.timezone.now", return_value=order.payment_deadline
        ):
            with pytest.raises(Conflict):
                finance.pay(actor=cart_world[0], pk=order.pk, idempotency_key=uuid4())
    else:
        Order.objects.filter(pk=order.pk).update(status=state)
        with pytest.raises(Conflict):
            finance.pay(actor=cart_world[0], pk=order.pk, idempotency_key=uuid4())
    assert not FinancialEvent.objects.exists()


def test_finance_permissions_and_strict_amounts(client, cart_world, user_factory):
    order = accepted(client, cart_world)
    url = ROOT + f"orders/{order.pk}/"
    assert (
        client.post(
            url + "pay/", {"idempotency_key": str(uuid4()), "amount_irr": 1}, format="json"
        ).status_code
        == 400
    )
    stranger = user_factory()
    client.force_authenticate(stranger)
    assert client.get(url).status_code == 404
    assert (
        client.post(url + "pay/", {"idempotency_key": str(uuid4())}, format="json").status_code
        == 404
    )
    for actor in [
        cart_world[0],
        cart_world[2].business.membership.user,
        user_factory(role="operator"),
    ]:
        client.force_authenticate(actor)
        assert client.get(url).status_code == 200
        assert (
            client.post(
                ROOT + "rates/",
                {"retailer_bps": 300, "manufacturer_bps": 300, "reason": "test"},
                format="json",
            ).status_code
            == 403
        )
        assert (
            client.post(
                url + "refund/",
                {"idempotency_key": str(uuid4()), "reason": "test", "retained": {}},
                format="json",
            ).status_code
            == 403
        )
        assert client.post(url + "settle/", {"reason": "test"}, format="json").status_code == 403
    owner = user_factory(role="owner")
    client.force_authenticate(owner)
    for value in [-1, 0.5, True, "200", 10001]:
        assert (
            client.post(
                ROOT + "rates/",
                {"retailer_bps": value, "manufacturer_bps": 200, "reason": "test"},
                format="json",
            ).status_code
            == 400
        )


def test_new_rates_affect_only_future_checkout(client, cart_world, user_factory):
    order = accepted(client, cart_world)
    original = dict(order.commercial)
    owner = user_factory(role="owner")
    finance.change_rates(actor=owner, retailer_bps=350, manufacturer_bps=450, reason="نرخ تازه")
    payment = finance.pay(actor=cart_world[0], pk=order.pk, idempotency_key=uuid4())
    assert payment.retailer_fee_irr == payment.manufacturer_fee_irr == 40
    order.refresh_from_db()
    assert order.commercial == original
    another = accepted(client, cart_world)
    assert another.commercial["retailer_commission_irr"] == 70
    assert another.commercial["manufacturer_commission_irr"] == 90
    audit = AuditEvent.objects.get(action="finance.rates_changed")
    assert audit.before["retailer_bps"] == 200 and audit.after["retailer_bps"] == 350
    assert finance.fee(250, 200) == 10
    assert finance.fee(249, 200) == 0


def test_cancellation_worker_full_refund_atomic_and_idempotent(client, cart_world):
    order, payment = paid(client, cart_world)
    lifecycle.cancel(actor=cart_world[0], pk=order.pk, reason="لغو خرید")
    with patch("marketplace.orders.cancellation.complete_refund", side_effect=Conflict("rollback")):
        with pytest.raises(Conflict):
            finance.refund_cancellation(order.pk)
    assert not FinancialEvent.objects.filter(kind="refund").exists()
    assert not CompensationDecision.objects.exists()
    assert process_orders()["refunded"] == 1
    refund = finance.refund_cancellation(order.pk)
    assert refund.total_irr == payment.total_irr
    assert refund.manufacturer_fee_irr == payment.manufacturer_fee_irr
    order.refresh_from_db()
    assert order.status == "cancelled" and order.cancellation.status == "completed"
    assert Reservation.objects.get().status == "released"
    assert order.shipping_groups.get().request.status == "cancelled"
    assert Invoice.objects.count() == 2
    assert refund.document.original == payment.document
    assert process_orders() == {"refunded": 0, "settled": 0}
    assert LedgerEntry.objects.aggregate(total=Sum("amount_irr"))["total"] == 0
    assert finance.balance(order)["total"] == 0


def test_partial_refund_recomputes_fees_preserves_shipping_and_caps(client, cart_world):
    order, payment = paid(client, cart_world)
    line = order.lines.get()
    decision = finance.register_decision(
        order_id=order.pk, reference="case:1", reason="مغایرت", retained={str(line.pk): 1}
    )
    refund = finance.apply_decision(decision.pk)
    assert (
        refund.goods_irr,
        refund.retailer_fee_irr,
        refund.manufacturer_fee_irr,
        refund.shipping_irr,
    ) == (1000, 20, 20, 0)
    assert finance.apply_decision(decision.pk).pk == refund.pk
    with pytest.raises(ValidationError):
        finance.register_decision(
            order_id=order.pk, reference="case:2", reason="مغایرت", retained={str(line.pk): 2}
        )
    with pytest.raises(ValidationError):
        finance.register_decision(
            order_id=order.pk,
            reference="case:2",
            reason="مغایرت",
            retained={str(line.pk): 1},
            refunded_groups=[order.shipping_groups.get().pk],
        )
    with pytest.raises(Conflict):
        finance.register_decision(
            order_id=order.pk, reference="case:1", reason="مغایرت", retained={str(line.pk): 0}
        )
    final = finance.register_decision(
        order_id=order.pk, reference="case:2", reason="مغایرت", retained={str(line.pk): 0}
    )
    remaining = finance.apply_decision(final.pk)
    assert remaining.total_irr + refund.total_irr == payment.total_irr
    assert remaining.shipping_irr == 50000


def test_owner_manual_correction_requires_reason_and_audits(client, cart_world, user_factory):
    order, _ = paid(client, cart_world)
    owner = user_factory(role="owner")
    key = uuid4()
    data = dict(
        actor=owner,
        pk=order.pk,
        idempotency_key=key,
        retained=finance.balance(order)["retained"],
        goods_override_irr=1500,
    )
    with pytest.raises(ValidationError):
        finance.manual_refund(**data, reason=" ")
    result = finance.manual_refund(**data, reason="اصلاح مبلغ")
    assert result.kind == "adjustment" and result.total_irr == 510
    assert finance.manual_refund(**data, reason="اصلاح مبلغ").pk == result.pk
    audit = AuditEvent.objects.get(action="finance.adjustment")
    assert audit.actor == owner and audit.before["goods"] == 2000 and audit.after["goods"] == 1500
    assert result.document.original is not None
    with pytest.raises(PermissionDenied):
        finance.register_decision(
            order_id=order.pk, source="manual", reference="bad", reason="test", retained={}
        )


def test_settlement_deadline_holds_and_final_net(client, cart_world):
    order, _ = paid(client, cart_world)
    with pytest.raises(Conflict):
        finance.settle(order_id=order.pk)
    delivered(order, ago=1)
    with pytest.raises(Conflict):
        finance.settle(order_id=order.pk)
    hold = dict(order_id=order.pk, reference="case:1", kind="discrepancy", reason="مغایرت")
    finance.set_hold(**hold)
    decision = finance.register_decision(
        order_id=order.pk,
        reference="case:1",
        reason="مغایرت",
        retained={str(order.lines.get().pk): 1},
    )
    finance.set_hold(**hold, release=True)
    with pytest.raises(Conflict):
        finance.settle(order_id=order.pk)
    finance.apply_decision(decision.pk)
    event = finance.settle(order_id=order.pk)
    assert event.total_irr == 980 and event.shipping_irr == 0
    order.refresh_from_db()
    assert order.status == "completed" and order.completed_at
    assert finance.settle(order_id=order.pk).pk == event.pk
    assert (
        LedgerEntry.objects.filter(account="commission_reserved").aggregate(
            total=Sum("amount_irr")
        )["total"]
        == 0
    )
    assert LedgerEntry.objects.get(account="commission_revenue").amount_irr == 40
    assert (
        LedgerEntry.objects.filter(account="logistics").aggregate(total=Sum("amount_irr"))["total"]
        == 50000
    )
    with pytest.raises(Conflict):
        finance.register_decision(
            order_id=order.pk,
            reference="late",
            reason="test",
            retained={str(order.lines.get().pk): 0},
        )


@pytest.mark.parametrize("cause", ["suspension", "operational", "discrepancy", "logistics", "user"])
def test_settlement_holds(client, cart_world, cause):
    order, _ = paid(client, cart_world)
    delivered(order)
    if cause == "suspension":
        business = order.manufacturer
        business.status = "suspended"
        business.save()
    elif cause == "user":
        user = order.manufacturer.membership.user
        user.is_suspended = True
        user.save()
    elif cause == "logistics":
        request = order.shipping_groups.get().request
        request.hold_reason = "توقف"
        request.save()
    else:
        finance.set_hold(order_id=order.pk, reference=cause, kind=cause, reason="توقف")
    assert process_orders()["settled"] == 0
    assert finance.hold_reasons(Order.objects.get(pk=order.pk))


@pytest.mark.django_db(transaction=True)
def test_concurrent_payment_exactly_once(client, cart_world):
    order = accepted(client, cart_world)
    key = uuid4()

    def run(_):
        close_old_connections()
        try:
            return finance.pay(actor=cart_world[0], pk=order.pk, idempotency_key=key).pk
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        result = list(pool.map(run, range(2)))
    assert result[0] == result[1]
    assert FinancialEvent.objects.count() == Invoice.objects.count() == 1


def add_product(client, world, maker, origin):
    from marketplace.catalog.models import PriceTier, Product, SalesPlan, Variant, VariantSupply
    from marketplace.logistics.models import ProductShipping, VariantPackage
    from tests.test_cart import ROOT as CART
    from tests.test_cart import selection

    product = Product.objects.create(
        business=maker, category=world[2].category, name="محصول دوم", status="published"
    )
    variant = Variant.objects.create(
        product=product, business=maker, sku="second", combination="c" * 64
    )
    VariantSupply.objects.create(variant=variant, mode="ready", ready_stock=10)
    plan = SalesPlan.objects.create(product=product, free_mix_min=2)
    PriceTier.objects.create(plan=plan, min_quantity=2, unit_price_irr=2000)
    shipping = ProductShipping.objects.create(product=product, origin=origin)
    shipping.services.add(world[4])
    VariantPackage.objects.create(
        variant=variant, weight_g=500, length_mm=100, width_mm=100, height_mm=100
    )
    url = CART + f"products/{product.pk}/"
    assert client.post(url, selection(variant), format="json").status_code == 200
    assert (
        client.put(url + "shipping/", {"service": str(world[4].pk)}, format="json").status_code
        == 200
    )
    return product


def test_multiple_groups_refund_whole_group_only(client, cart_world):
    from marketplace.accounts.models import Address

    maker = cart_world[2].business
    origin = Address.objects.create(
        business=maker, province="تهران", city="تهران", address="مبدأ دوم"
    )
    extra = add_product(client, cart_world, maker, origin)
    order, payment = paid(client, cart_world)
    assert order.shipping_groups.count() == 2 and payment.shipping_irr == 100000
    line = order.lines.get(variant__product=extra)
    group = line.shipping_item.group
    retained = dict(payment.snapshot["retained"])
    retained[str(line.pk)] = 0
    decision = finance.register_decision(
        order_id=order.pk,
        reference="case:group",
        reason="گروه تحویل‌نشده",
        retained=retained,
        refunded_groups=[group.pk],
    )
    refund = finance.apply_decision(decision.pk)
    assert refund.goods_irr == 4000 and refund.shipping_irr == 50000
    assert finance.balance(order)["shipping"] == 50000
    assert refund.entries.get(account="logistics").shipping_group_id == group.pk
    assert finance.apply_decision(decision.pk).pk == refund.pk
    delivered(order)
    settlement = finance.settle(order_id=order.pk)
    assert settlement.total_irr == 1960 and settlement.shipping_irr == 0


def test_payment_independent_after_other_manufacturer_rejects(
    client, cart_world, user_factory, business_data
):
    from marketplace.accounts.business_services import create_business

    maker = create_business(actor=user_factory(), **business_data)
    maker.status, maker.controlled_access = "verified", True
    maker.save()
    add_product(client, cart_world, maker, maker.addresses.first())
    group, _ = submit(client, cart_world)
    first = Order.objects.get(manufacturer=cart_world[2].business)
    second = Order.objects.get(manufacturer=maker)
    lifecycle.respond(
        actor=first.manufacturer.membership.user,
        pk=first.pk,
        decision="reject",
        reason="ظرفیت کافی نیست",
    )
    lifecycle.respond(actor=maker.membership.user, pk=second.pk, decision="accept")
    payment = finance.pay(actor=cart_world[0], pk=second.pk, idempotency_key=uuid4())
    assert payment.order_id == second.pk and Invoice.objects.count() == 1
    assert not FinancialEvent.objects.filter(order=first).exists()
    first.refresh_from_db()
    assert first.status == "rejected" and first.lines.get().reservation.status == "released"
    assert len(group["orders"]) == 2


@pytest.mark.django_db(transaction=True)
def test_checkout_to_delivery_and_concurrent_settlement(client, cart_world, user_factory):
    from marketplace.logistics import delivery, fulfillment
    from marketplace.logistics.models import Carrier, DeliveryChallenge
    from tests.test_fulfillment import packages

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
    assert order.delivered_at and order.discrepancy_deadline
    now = order.discrepancy_deadline + timedelta(seconds=1)

    def run(_):
        close_old_connections()
        try:
            return finance.settle(order_id=order.pk).pk
        finally:
            connections.close_all()

    with (
        patch("marketplace.finance.services.timezone.now", return_value=now),
        ThreadPoolExecutor(max_workers=2) as pool,
    ):
        result = list(pool.map(run, range(2)))
    assert result[0] == result[1]
    assert FinancialEvent.objects.get(kind="settlement").total_irr == 1960


@pytest.mark.django_db(transaction=True)
def test_concurrent_refund_and_database_journal_guard(client, cart_world):
    from django.db import connection

    order, payment = paid(client, cart_world)
    decision = finance.register_decision(
        order_id=order.pk,
        reference="case:race",
        reason="مغایرت",
        retained={str(order.lines.get().pk): 1},
    )

    def run(_):
        close_old_connections()
        try:
            return finance.apply_decision(decision.pk).pk
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        result = list(pool.map(run, range(2)))
    assert result[0] == result[1]
    with pytest.raises(DatabaseError), transaction.atomic():
        LedgerEntry.objects.create(event=payment, account="cash", amount_irr=1)
        with connection.cursor() as cursor:
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")


def test_financial_api_presentation_and_owner_commands(client, cart_world, user_factory):
    order, _ = paid(client, cart_world)
    owner = user_factory(role="owner")
    client.force_authenticate(owner)
    url = ROOT + f"orders/{order.pk}/"
    rate = client.post(
        ROOT + "rates/",
        {"retailer_bps": 300, "manufacturer_bps": 400, "reason": "نرخ تازه"},
        format="json",
    )
    assert rate.status_code == 200
    response = client.post(
        url + "refund/",
        {
            "idempotency_key": str(uuid4()),
            "reason": "اصلاح",
            "retained": {str(order.lines.get().pk): 1},
        },
        format="json",
    )
    assert response.status_code == 200, response.data
    data = client.get(url).data
    assert data["original"]["total_irr"] == 52040
    assert data["net"]["total_irr"] == 51020
    assert data["net"]["manufacturer_payable_irr"] == 980
    assert data["manufacturer_commission_bps"] == 200
    assert len(data["events"]) == 2
    assert "execution_mode" not in str(data) and "simulated" not in str(data)
    delivered(order)
    response = client.post(url + "settle/", {"reason": "تسویهٔ دستی"}, format="json")
    assert response.status_code == 200 and response.data["total_irr"] == 980
    assert client.get(url).data["commission_status"] == "final"


def test_worker_processes_decision_then_settles_after_deadline(client, cart_world):
    order, _ = paid(client, cart_world)
    finance.register_decision(
        order_id=order.pk,
        reference="decision:queued",
        reason="نتیجهٔ نهایی",
        retained={str(order.lines.get().pk): 1},
    )
    delivered(order)
    assert process_orders() == {"refunded": 1, "settled": 1}
    assert process_orders() == {"refunded": 0, "settled": 0}
    assert FinancialEvent.objects.get(kind="settlement").total_irr == 980


def test_closed_discrepancy_cannot_settle_undelivered_retained_goods(client, cart_world):
    order, _ = paid(client, cart_world)
    hold = dict(order_id=order.pk, reference="case:failed", kind="discrepancy", reason="عدم تحویل")
    with pytest.raises(Conflict):
        finance.set_hold(**hold, release=True)
    finance.set_hold(**hold)
    decision = finance.register_decision(
        order_id=order.pk,
        reference="case:failed",
        reason="عدم تحویل",
        retained={str(order.lines.get().pk): 1},
    )
    finance.apply_decision(decision.pk)
    finance.set_hold(**hold, release=True)
    with pytest.raises(Conflict):
        finance.settle(order_id=order.pk)
    with pytest.raises(Conflict):
        finance.set_hold(**hold)
    final = finance.register_decision(
        order_id=order.pk,
        reference="case:all",
        reason="عدم تحویل کامل",
        retained={str(order.lines.get().pk): 0},
    )
    finance.apply_decision(final.pk)
    assert finance.settle(order_id=order.pk).total_irr == 0


def test_rate_activation_invalidates_preview(client, cart_world, user_factory):
    from marketplace.orders import cart, checkout
    from tests.test_cart import prepared

    prepared(client, cart_world)
    preview = cart.preview(actor=cart_world[0])
    finance.change_rates(
        actor=user_factory(role="owner"),
        retailer_bps=200,
        manufacturer_bps=250,
        reason="کارمزد تولیدکننده",
    )
    with pytest.raises(Conflict):
        checkout.submit(
            actor=cart_world[0],
            cart_id=preview["id"],
            quote_fingerprint=preview["quote_fingerprint"],
            idempotency_key=uuid4(),
        )
    assert not Order.objects.exists()


@pytest.mark.parametrize("field", ["status", "controlled_access"])
def test_payment_requires_current_trade_access(client, cart_world, field):
    order = accepted(client, cart_world)
    business = order.retailer
    setattr(business, field, "suspended" if field == "status" else False)
    business.save()
    with pytest.raises(PermissionDenied):
        finance.pay(actor=cart_world[0], pk=order.pk, idempotency_key=uuid4())
    assert not FinancialEvent.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_finance_invariant_migration_preserves_issued_invoice(client, cart_world):
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor

    order, payment = paid(client, cart_world)
    number = payment.document.number
    latest = MigrationExecutor(connection).loader.graph.leaf_nodes()
    try:
        MigrationExecutor(connection).migrate([("finance", "0001_initial")])
    finally:
        MigrationExecutor(connection).migrate(latest)
    assert Invoice.objects.get(event=payment).number == number
    with pytest.raises(DatabaseError), transaction.atomic():
        Invoice.objects.filter(event=payment).update(lines=[])


def test_worker_continues_past_a_full_page_of_held_orders(client, cart_world, monkeypatch):
    import marketplace.finance.tasks as tasks

    one, _ = paid(client, cart_world)
    two, _ = paid(client, cart_world)
    blocked, eligible = sorted([one, two], key=lambda order: order.pk)
    delivered(blocked)
    delivered(eligible)
    finance.set_hold(order_id=blocked.pk, reference="held", kind="operational", reason="توقف")
    monkeypatch.setattr(tasks, "BATCH_SIZE", 1)
    process_orders()
    assert FinancialEvent.objects.filter(order=eligible, kind="settlement").exists()
    assert not FinancialEvent.objects.filter(order=blocked, kind="settlement").exists()


def test_rounding_cannot_make_producer_payable_negative(client, cart_world, user_factory):
    cart_world[2].sales_plan.tiers.update(unit_price_irr=3)
    finance.change_rates(
        actor=user_factory(role="owner"), retailer_bps=200, manufacturer_bps=10000, reason="نرخ"
    )
    order = accepted(client, cart_world)
    with pytest.raises(Conflict):
        finance.pay(actor=cart_world[0], pk=order.pk, idempotency_key=uuid4())
    assert not FinancialEvent.objects.exists()
