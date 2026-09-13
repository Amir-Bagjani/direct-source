from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import pytest
from django.db import DatabaseError, close_old_connections, connections, transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from marketplace.accounts import business_services, role_services
from marketplace.accounts.models import Business
from marketplace.common.exceptions import Conflict
from marketplace.finance import services as finance
from marketplace.operations import analytics, commands, policy, suspensions, work
from marketplace.operations.models import OrderDisposition, PolicyVersion, WorkItem
from marketplace.operations.services import audit
from tests.test_cart import cart_world as shared_cart_world
from tests.test_disputes_support import delivered as shared_delivered_world
from tests.test_finance import accepted, paid
from tests.test_logistics_publication import ready_product  # noqa: F401

pytestmark = pytest.mark.django_db
cart_world = shared_cart_world
delivered_world = shared_delivered_world


def test_shipped_suspension_preserves_delivery_and_blocks_refund(delivered_world, user_factory):
    order, shipment, _, _ = delivered_world
    owner = user_factory(role="owner")
    delivered_at = order.delivered_at
    proposal = suspensions.propose(
        actor=owner, business_id=order.manufacturer_id, reason="بررسی پس از ارسال"
    )
    suspensions.transition(actor=owner, pk=proposal["id"], action="activate", reason="تأیید")
    row = OrderDisposition.objects.get(order=order)
    assert row.stage == "shipped" and row.decision == "pending"
    with pytest.raises(Conflict):
        suspensions.decide(actor=owner, pk=row.pk, decision="cancel_refund", reason="درخواست لغو")
    order.refresh_from_db()
    shipment.refresh_from_db()
    assert order.status == "active" and order.delivered_at == delivered_at
    assert shipment.status == "delivered" and finance.hold_reasons(order)
    suspensions.decide(actor=owner, pk=row.pk, decision="continue", reason="ادامهٔ همین سفارش")
    assert suspensions.permitted_to_continue(order)


def test_queue_claim_reassign_and_disable(user_factory, business_data):
    owner, first, second = [user_factory(role=r) for r in ["owner", "operator", "operator"]]
    business = business_services.create_business(actor=user_factory(), **business_data)
    Business.objects.filter(pk=business.pk).update(status="pending")
    pk = business.verification.pk
    work.claim(actor=first, kind="business", pk=pk)
    with pytest.raises(Conflict):
        work.claim(actor=second, kind="business", pk=pk)
    with pytest.raises(PermissionDenied):
        work.enforce(second, "business", pk)
    work.claim(actor=owner, kind="business", pk=pk, user_id=second.pk, reason="واگذاری")
    business.verification.refresh_from_db()
    assert business.verification.assigned_to_id == second.pk
    role_services.set_operator(actor=owner, user_id=second.pk, enabled=False, reason="پایان همکاری")
    assert WorkItem.objects.get(kind="business", target_id=pk).assigned_to_id is None
    business.verification.refresh_from_db()
    assert business.verification.assigned_to_id is None


def test_policy_future_effect_and_immutable_history(user_factory):
    owner = user_factory(role="owner")
    original = policy.value("payment_hours")
    result = policy.configure(
        actor=owner,
        reason="برنامهٔ جدید",
        values={"payment_hours": 12},
        effective_at=timezone.now() + timedelta(days=1),
    )
    assert policy.value("payment_hours") == original
    with pytest.raises(DatabaseError), transaction.atomic():
        PolicyVersion.objects.filter(pk=result["id"]).update(values={})
    with pytest.raises(PermissionDenied):
        policy.configure(
            actor=user_factory(role="operator"), values={"payment_hours": 10}, reason="تغییر"
        )


def test_audit_redaction_preserves_trace(user_factory):
    owner = user_factory(role="owner")
    event = audit(
        actor=owner,
        target=owner,
        action="test",
        before={"password": "private", "nested": [{"access_token": "private"}]},
        after={"url": "https://example.test/file?X-Amz-Signature=private"},
    )
    assert "private" not in str(event.before) + str(event.after)
    assert event.actor_role == "owner" and event.correlation_id


def test_suspension_unpaid_cancel_restore_keeps_cancelled(client, cart_world, user_factory):
    order = accepted(client, cart_world)
    owner = user_factory(role="owner")
    proposal = suspensions.propose(actor=owner, business_id=order.manufacturer_id, reason="بررسی")
    key = uuid4()
    args = dict(
        actor=owner,
        kind="suspension",
        pk=proposal["id"],
        command="suspension_activate",
        reason="تأیید بررسی",
        idempotency_key=key,
    )
    result = commands.execute(**args)
    assert commands.execute(**args) == result
    order.refresh_from_db()
    assert order.status == "cancelled"
    assert OrderDisposition.objects.get(order=order).decision == "cancelled"
    suspensions.transition(actor=owner, pk=proposal["id"], action="restore", reason="رفع مشکل")
    order.refresh_from_db()
    assert order.status == "cancelled"


@pytest.mark.parametrize("decision", ["continue", "cancel_refund"])
def test_paid_suspension_requires_per_order_decision(client, cart_world, user_factory, decision):
    order, _ = paid(client, cart_world)
    owner = user_factory(role="owner")
    proposal = suspensions.propose(actor=owner, business_id=order.manufacturer_id, reason="بررسی")
    suspensions.transition(actor=owner, pk=proposal["id"], action="activate", reason="تأیید")
    assert not suspensions.permitted_to_continue(order)
    disposition = OrderDisposition.objects.get(order=order)
    assert finance.hold_reasons(order)
    suspensions.decide(actor=owner, pk=disposition.pk, decision=decision, reason="تصمیم سفارش")
    order.refresh_from_db()
    if decision == "continue":
        assert suspensions.permitted_to_continue(order)
    else:
        assert order.status == "cancelled"
        assert order.financial_events.filter(kind="refund").count() == 1


def test_operator_dashboard_cannot_read_money_or_other_tenant(client, user_factory, cart_world):
    operator = user_factory(role="operator")
    client.force_authenticate(operator)
    response = client.get("/api/v1/operations/dashboard/")
    assert response.status_code == 200, response.data
    assert not ({c["metric"] for c in response.data["data"]["cards"]} & analytics.MACRO)
    assert client.get("/api/v1/operations/dashboard/gmv_paid/").status_code == 403
    assert (
        client.get("/api/v1/operations/dashboard/", {"business_id": cart_world[1].pk}).status_code
        == 403
    )


def test_paid_goods_are_not_completed_sales(client, cart_world):
    order, _ = paid(client, cart_world)
    start, end = analytics.bounds()
    actor = order.manufacturer.membership.user
    card, rows = analytics.records(actor=actor, metric="sales", start=start, end=end)
    assert card["value"] == 0 and rows == []
    card, rows = analytics.records(actor=actor, metric="delivery_time", start=start, end=end)
    assert card["value"] is None and card["count"] == 0


def test_operator_finance_requires_related_assignment(client, cart_world, user_factory):
    order, _ = paid(client, cart_world)
    operator = user_factory(role="operator")
    client.force_authenticate(operator)
    url = f"/api/v1/finance/orders/{order.pk}/"
    assert client.get(url).status_code == 403
    work.claim(actor=operator, kind="order", pk=order.pk)
    assert client.get(url).status_code == 200


@pytest.mark.django_db(transaction=True)
def test_concurrent_claim_has_one_winner(user_factory, business_data):
    first, second = user_factory(role="operator"), user_factory(role="operator")
    business = business_services.create_business(actor=user_factory(), **business_data)
    Business.objects.filter(pk=business.pk).update(status="pending")
    pk = business.verification.pk

    def run(actor):
        close_old_connections()
        try:
            work.claim(actor=actor, kind="business", pk=pk)
            return "claimed"
        except Conflict:
            return "conflict"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(run, [first, second])) == ["claimed", "conflict"]
    assert WorkItem.objects.filter(kind="business", target_id=pk).count() == 1


def test_queue_includes_old_open_work(client, user_factory, business_data):
    business = business_services.create_business(actor=user_factory(), **business_data)
    Business.objects.filter(pk=business.pk).update(status="pending")
    type(business.verification).objects.filter(pk=business.verification.pk).update(
        created_at=timezone.now() - timedelta(days=90)
    )
    client.force_authenticate(user_factory(role="operator"))
    response = client.get("/api/v1/operations/work/", {"kind": "business"})
    assert response.status_code == 200
    assert response.data["results"][0]["target"] == str(business.verification.pk)


def test_user_suspension_preserves_business_status_and_revokes_access(
    client, cart_world, user_factory
):
    order, _ = paid(client, cart_world)
    owner = user_factory(role="owner")
    maker = order.manufacturer.membership.user
    proposal = suspensions.propose(actor=owner, user_id=maker.pk, reason="بررسی حساب")
    suspensions.transition(actor=owner, pk=proposal["id"], action="activate", reason="تأیید")
    maker.refresh_from_db()
    order.manufacturer.refresh_from_db()
    assert maker.is_suspended
    assert order.manufacturer.status == "verified"
    client.force_authenticate(maker)
    assert client.get("/api/v1/operations/dashboard/").status_code == 403
    assert OrderDisposition.objects.get(order=order).decision == "pending"
