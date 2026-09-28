from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from marketplace.accounts.models import AuthSession, Business, User
from marketplace.accounts.permissions import require_operator, require_owner
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.finance import services as finance
from marketplace.logistics.models import Shipment
from marketplace.logistics.services import lock_services
from marketplace.orders.lifecycle import finish_unpaid
from marketplace.orders.models import CancellationRequest, Order

from .models import OrderDisposition, StoredFile, Suspension
from .services import audit


def data(row):
    return {
        "id": str(row.pk),
        "status": row.status,
        "business": str(row.business_id) if row.business_id else None,
        "user": str(row.user_id) if row.user_id else None,
        "reason": row.reason,
        "activated_at": row.activated_at,
        "restored_at": row.restored_at,
    }


@transaction.atomic
def propose(*, actor, reason, business_id=None, user_id=None, evidence=()):
    if user_id:
        list(
            User.objects.select_for_update(no_key=True)
            .filter(pk__in=[actor.pk, user_id])
            .order_by("pk")
        )
    else:
        locked_actor(actor)
    require_operator(actor)
    finance.required_reason(reason)
    if bool(business_id) == bool(user_id):
        raise ValidationError("فقط یک کاربر یا کسب‌وکار را انتخاب کنید.")
    target = get_object_or_404(
        (Business if business_id else User).objects.select_for_update(), pk=business_id or user_id
    )
    evidence_business = (
        target if business_id else getattr(getattr(target, "membership", None), "business", None)
    )
    files = (
        []
        if evidence_business is None
        else list(
            StoredFile.objects.filter(
                pk__in=evidence,
                owner=actor,
                scan_status="clean",
                deleted_at__isnull=True,
                purpose__in=["support", "discrepancy", "suspension"],
                business_id=evidence_business.pk,
            )
        )
    )
    if len(files) != len(set(evidence)) or len(files) > 10:
        raise ValidationError("مدارک مجاز لازم است.")
    if Suspension.objects.filter(
        business_id=business_id, user_id=user_id, status__in=["proposed", "active"]
    ).exists():
        raise Conflict("بررسی یا تعلیق باز وجود دارد.")
    row = Suspension.objects.create(
        business_id=business_id, user_id=user_id, proposed_by=actor, reason=reason
    )
    row.evidence.set(files)
    audit(
        actor=actor,
        action="suspension.proposed",
        target=row,
        reason=reason,
        after={"scope": target._meta.label_lower, "target": str(target.pk)},
    )
    return data(row)


def lock_scope(actor, pk):
    ref = get_object_or_404(Suspension, pk=pk)
    user_ids = [actor.pk] + ([ref.user_id] if ref.user_id else [])
    users = {
        u.pk: u
        for u in User.objects.select_for_update(no_key=True).filter(pk__in=user_ids).order_by("pk")
    }
    require_owner(users[actor.pk])
    assert ref.user_id or ref.business_id
    business = (
        ref.business
        if ref.business_id
        else getattr(getattr(users[ref.user_id], "membership", None), "business", None)  # type: ignore[index]
    )
    orders = (
        Order.objects.filter(Q(retailer=business) | Q(manufacturer=business)).filter(
            status__in=["pending", "accepted", "active"]
        )
        if business
        else Order.objects.none()
    )
    ids = {pk for pair in orders.values_list("retailer_id", "manufacturer_id") for pk in pair}
    if business:
        ids.add(business.pk)
    list(Business.objects.select_for_update().filter(pk__in=ids).order_by("pk"))
    lock_services()
    return Suspension.objects.select_for_update().get(pk=pk), business, orders, users


@transaction.atomic
def transition(*, actor, pk, action, reason):
    finance.required_reason(reason)
    row, business, orders, users = lock_scope(actor, pk)
    before = data(row)
    if action == "activate" and row.status == "proposed":
        if row.user_id:
            target = users[row.user_id]
            if target.pk == actor.pk:
                raise Conflict("تعلیق خود مجاز نیست.")
            target.is_suspended = True
            target.save(update_fields=["is_suspended", "updated_at"])
            AuthSession.objects.filter(user=target, revoked_at__isnull=True).update(
                revoked_at=timezone.now()
            )
        else:
            row.previous_status = business.status
            business.status = "suspended"
            business.save(update_fields=["status", "updated_at"])
        row.status, row.activated_at = "active", timezone.now()
        row.save()
        for order in orders.select_for_update().order_by("pk"):
            sent = Shipment.objects.filter(
                request__group__order=order, purpose="order", handed_over_at__isnull=False
            ).exists()
            stage = "shipped" if sent else "paid" if order.paid_at else "unpaid"
            disposition = OrderDisposition.objects.create(
                suspension=row, order=order, stage=stage, actor=actor, reason=reason
            )
            if stage == "unpaid":
                finish_unpaid(order, "cancelled", reason, actor)
                disposition.decision, disposition.decided_at = "cancelled", timezone.now()
                disposition.save()
            else:
                finance.set_hold(
                    order_id=order.pk,
                    reference=str(disposition.pk),
                    kind="suspension",
                    reason=reason,
                )
            audit(
                actor=actor,
                action="suspension.order_disposition",
                target=disposition,
                reason=reason,
                after={"stage": stage, "decision": disposition.decision, "order": str(order.pk)},
            )
    elif action == "restore" and row.status == "active":
        if row.user_id:
            target = users[row.user_id]
            target.is_suspended = False
            target.save(update_fields=["is_suspended", "updated_at"])
        else:
            business.status = row.previous_status
            business.save(update_fields=["status", "updated_at"])
        row.status, row.restored_at = "restored", timezone.now()
        row.save()
    elif action == "reject" and row.status == "proposed":
        row.status = "rejected"
        row.save()
    else:
        raise Conflict("گذار تعلیق مجاز نیست.")
    audit(
        actor=actor,
        action="suspension." + action,
        target=row,
        reason=reason,
        before={"status": before["status"]},
        after={"status": row.status},
    )
    return data(row)


@transaction.atomic
def decide(*, actor, pk, decision, reason):
    locked_actor(actor)
    require_owner(actor)
    finance.required_reason(reason)
    ref = get_object_or_404(OrderDisposition, pk=pk)
    order = finance.lock_order(ref.order_id)
    row = OrderDisposition.objects.select_for_update().get(pk=pk)
    if row.decision != "pending":
        raise Conflict("تصمیم سفارش نهایی شده است.")
    if decision not in ["continue", "cancel_refund"]:
        raise ValidationError("تصمیم معتبر لازم است.")
    if decision == "cancel_refund":
        from marketplace.orders.cancellation import unsent

        unsent(order)
        request, _ = CancellationRequest.objects.get_or_create(
            order=order, defaults={"status": "refund_pending", "reason": reason}
        )
        if request.status == "completed":
            row.financial_reference = request.refund_reference
        else:
            request.status, request.decision_reason = "refund_pending", reason
            request.save()
            event = finance.refund_cancellation(order.pk)
            row.financial_reference = event.pk
    finance.set_hold(
        order_id=order.pk, reference=str(row.pk), kind="suspension", reason=reason, release=True
    )
    row.decision, row.actor, row.reason, row.decided_at = decision, actor, reason, timezone.now()
    row.save()
    audit(
        actor=actor,
        action="suspension.order_decided",
        target=row,
        reason=reason,
        before={"decision": "pending"},
        after={
            "decision": decision,
            "financial_reference": str(row.financial_reference)
            if row.financial_reference
            else None,
        },
    )
    return {"id": str(row.pk), "decision": row.decision, "order": str(order.pk)}


def permitted_to_continue(order):
    active = Suspension.objects.filter(status="active").filter(
        Q(business_id__in=[order.retailer_id, order.manufacturer_id])
        | Q(user__membership__business_id__in=[order.retailer_id, order.manufacturer_id])
    )
    approved = OrderDisposition.objects.filter(order=order, decision="continue").values(
        "suspension_id"
    )
    if not active.exists() or active.exclude(pk__in=approved).exists():
        return False
    # Every restriction must have its own approved decision, including legacy flags.
    for business in Business.objects.filter(
        pk__in=[order.retailer_id, order.manufacturer_id]
    ).select_related("membership__user"):
        if business.status == "suspended" and not active.filter(business=business).exists():
            return False
        user = business.membership.user
        if (not user.is_active or user.is_suspended) and not active.filter(user=user).exists():
            return False
    return True
