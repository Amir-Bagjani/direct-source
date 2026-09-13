"""Live domain queues with durable assignments; no editable copy of domain state."""

from typing import Any

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.accounts.models import Business, User, VerificationApplication
from marketplace.accounts.permissions import has_role, require_operator, require_owner
from marketplace.catalog.models import Product
from marketplace.common.exceptions import Conflict
from marketplace.disputes.models import DiscrepancyCase
from marketplace.finance.services import lock_order, required_reason
from marketplace.logistics.models import Shipment, ShippingRequest
from marketplace.logistics.models import Tariff as ShippingTariff
from marketplace.orders.models import Order
from marketplace.reviews.models import Report
from marketplace.support.models import Ticket

from .models import OrderDisposition, Suspension, WorkItem
from .services import audit

LABELS = {
    "business": "بررسی کسب‌وکار",
    "product": "بررسی محصول",
    "tariff": "فعال‌سازی تعرفه",
    "order": "رسیدگی سفارش",
    "shipping": "رسیدگی حمل",
    "delivery": "تحویل تأییدنشده",
    "dispute": "رسیدگی مغایرت",
    "ticket": "پاسخ پشتیبانی",
    "review": "گزارش نظر",
    "suspension": "بررسی تعلیق",
    "disposition": "تصمیم سفارش تعلیق‌شده",
}
MODELS: dict[str, Any] = {
    "business": VerificationApplication,
    "product": Product,
    "tariff": ShippingTariff,
    "order": Order,
    "shipping": ShippingRequest,
    "delivery": Shipment,
    "dispute": DiscrepancyCase,
    "ticket": Ticket,
    "review": Report,
    "suspension": Suspension,
    "disposition": OrderDisposition,
}
COMMANDS = {
    "business": ["business_review", "business_reopen"],
    "product": ["product_review"],
    "tariff": ["tariff_activate"],
    "order": ["retry_order", "cancellation_decide", "settle"],
    "shipping": ["shipping_assign", "shipping_exception", "shipping_specification"],
    "delivery": ["delivery_decide"],
    "dispute": ["dispute_decide", "dispute_close"],
    "ticket": ["ticket_reply", "ticket_status"],
    "review": ["review_moderate"],
    "suspension": ["suspension_activate", "suspension_reject", "suspension_restore"],
    "disposition": ["disposition_decide"],
}
OWNER_COMMANDS = {
    "tariff_activate",
    "settle",
    "suspension_activate",
    "suspension_reject",
    "suspension_restore",
    "disposition_decide",
}


def sources():
    return {
        "business": VerificationApplication.objects.filter(
            business__status__in=["pending", "rejected", "changes_requested"]
        ),
        "product": Product.objects.filter(status="pending"),
        "tariff": ShippingTariff.objects.filter(is_active=False),
        "order": Order.objects.filter(
            Q(status="active")
            | Q(status="pending", response_deadline__lte=timezone.now())
            | Q(status="accepted", payment_deadline__lte=timezone.now())
        ),
        "shipping": ShippingRequest.objects.filter(
            status__in=["ready", "spec_review", "attention"]
        ),
        "delivery": Shipment.objects.filter(status="unconfirmed"),
        "dispute": DiscrepancyCase.objects.filter(closed_at__isnull=True),
        "ticket": Ticket.objects.exclude(status="closed"),
        "review": Report.objects.filter(resolved_at__isnull=True),
        "suspension": Suspension.objects.filter(status__in=["proposed", "active"]),
        "disposition": OrderDisposition.objects.filter(decision="pending"),
    }


def native_assignee(kind, target):
    if kind in ["business", "product", "ticket"]:
        return target.assigned_to_id
    if kind == "dispute":
        ticket = getattr(target, "ticket", None)
        return ticket.assigned_to_id if ticket else None
    return None


def assigned_order(actor, order):
    """Financial detail access follows an operational assignment, never a platform-wide role."""
    items = WorkItem.objects.filter(assigned_to=actor)
    if items.filter(kind="order", target_id=order.pk).exists():
        return True
    related = {
        "shipping": ShippingRequest.objects.filter(group__order=order),
        "delivery": Shipment.objects.filter(request__group__order=order),
        "dispute": DiscrepancyCase.objects.filter(order=order),
        "ticket": Ticket.objects.filter(order=order),
        "disposition": OrderDisposition.objects.filter(order=order),
    }
    return Ticket.objects.filter(order=order, assigned_to=actor).exists() or any(
        items.filter(kind=kind, target_id__in=query.values("pk")).exists()
        for kind, query in related.items()
    )


def domain_lock(kind, pk):
    if kind not in MODELS:
        raise ValidationError("نوع صف معتبر نیست.")
    ref = get_object_or_404(MODELS[kind], pk=pk)
    order_id = None
    if kind in ["business", "product"]:
        Business.objects.select_for_update().get(pk=ref.business_id)
    if kind == "product":
        from marketplace.catalog.models import Category
        from marketplace.logistics.services import lock_services

        Category.objects.select_for_update().get(pk=ref.category_id)
        lock_services()
    if kind in ["order", "shipping", "delivery", "dispute", "ticket", "review", "disposition"]:
        order_id = (
            ref.pk
            if kind == "order"
            else ref.group.order_id
            if kind == "shipping"
            else ref.request.group.order_id
            if kind == "delivery"
            else ref.review.entitlement.order_id
            if kind == "review"
            else ref.order_id
        )
        if order_id:
            lock_order(order_id)
    return MODELS[kind].objects.select_for_update().get(pk=pk)


def bind_native(kind, target, actor):
    if kind in ["business", "product", "ticket"]:
        target.assigned_to = actor
        target.save(update_fields=["assigned_to", "updated_at"])
    elif kind == "dispute":
        ticket = getattr(target, "ticket", None)
        if ticket:
            ticket.assigned_to = actor
            ticket.save(update_fields=["assigned_to", "updated_at"])


@transaction.atomic
def claim(*, actor, kind, pk, reason="پذیرش مسئولیت", user_id=None):
    required_reason(reason)
    users = {
        u.pk: u
        for u in User.objects.select_for_update(no_key=True)
        .filter(pk__in=[actor.pk, user_id or actor.pk])
        .order_by("pk")
    }
    actor = users[actor.pk]
    require_operator(actor)
    assignee = users.get(user_id or actor.pk)
    if user_id:
        require_owner(actor)
    if not assignee or not has_role(assignee, "operator", "owner"):
        raise ValidationError("مسئول فعال لازم است.")
    target = domain_lock(kind, pk)
    if not sources()[kind].filter(pk=pk).exists():
        raise Conflict("این مورد دیگر در صف باز نیست.")
    item, _ = WorkItem.objects.get_or_create(kind=kind, target_id=pk)
    previous = native_assignee(kind, target) or item.assigned_to_id
    if previous and not user_id:
        raise Conflict("کار قبلاً پذیرفته شده است.")
    item.assigned_to = assignee
    item.save(update_fields=["assigned_to", "updated_at"])
    bind_native(kind, target, assignee)
    audit(
        actor=actor,
        action="operations.reassigned" if user_id else "operations.claimed",
        target=item,
        reason=reason,
        before={"assigned_to": str(previous) if previous else None},
        after={"assigned_to": str(assignee.pk)},
    )
    return {"kind": kind, "target": str(pk), "assigned_to": str(assignee.pk)}


def enforce(actor, kind, pk):
    """Domain callers hold their source lock. The first command may atomically claim it."""
    require_operator(actor)
    if has_role(actor, "owner"):
        return
    item, _ = WorkItem.objects.get_or_create(kind=kind, target_id=pk)
    item = WorkItem.objects.select_for_update().get(pk=item.pk)
    target = get_object_or_404(MODELS[kind], pk=pk)
    assignee = native_assignee(kind, target) or item.assigned_to_id
    if assignee and assignee != actor.pk:
        raise PermissionDenied("این کار به اپراتور دیگری واگذار شده است.")
    if not item.assigned_to_id:
        item.assigned_to = actor
        item.save(update_fields=["assigned_to", "updated_at"])
        audit(
            actor=actor,
            action="operations.claimed",
            target=item,
            reason="پذیرش همراه نخستین اقدام",
            before={"assigned_to": None},
            after={"assigned_to": str(actor.pk)},
        )


def release(*, actor, target, reason):
    for ticket in (
        Ticket.objects.select_for_update().filter(assigned_to=target).exclude(status="closed")
    ):
        ticket.assigned_to = None
        ticket.save(update_fields=["assigned_to", "updated_at"])
        audit(
            actor=actor,
            action="support.released",
            target=ticket,
            reason=reason,
            before={"assigned_to": str(target.pk)},
            after={"assigned_to": None},
        )
    # Domain rows precede assignment rows, matching claim/command lock order.
    for item in WorkItem.objects.select_for_update().filter(assigned_to=target).order_by("pk"):
        item.assigned_to = None
        item.save(update_fields=["assigned_to", "updated_at"])
        audit(
            actor=actor,
            action="operations.released",
            target=item,
            reason=reason,
            before={"assigned_to": str(target.pk)},
            after={"assigned_to": None},
        )


def listing(*, actor, filters):
    require_operator(actor)
    rows = []
    now = timezone.now()
    for kind, query in sources().items():
        if filters.get("kind") and filters["kind"] != kind:
            continue
        query = query.filter(created_at__gte=filters["start"], created_at__lt=filters["end"])
        if query.count() > 5000:
            raise ValidationError("بازهٔ زمانی یا نوع صف را محدودتر کنید.")
        assigned = dict(
            WorkItem.objects.filter(kind=kind, target_id__in=query.values("pk")).values_list(
                "target_id", "assigned_to_id"
            )
        )
        for target in query:
            status = (
                target.business.status
                if kind == "business"
                else "pending"
                if kind in ["review", "dispute"]
                else "inactive"
                if kind == "tariff"
                else getattr(target, "status", getattr(target, "decision", "pending"))
            )
            assignee = native_assignee(kind, target) or assigned.get(target.pk)
            if filters.get("status") and filters["status"] != status:
                continue
            if filters.get("assignee") and filters["assignee"] != (
                str(assignee) if assignee else "unassigned"
            ):
                continue
            commands = [
                name
                for name in COMMANDS[kind]
                if name not in OWNER_COMMANDS or has_role(actor, "owner")
            ]
            rows.append(
                {
                    "kind": kind,
                    "target": str(target.pk),
                    "label": LABELS[kind],
                    "reason": getattr(target, "reason", "")
                    or getattr(target, "hold_reason", "")
                    or LABELS[kind],
                    "status": status,
                    "assigned_to": str(assignee) if assignee else None,
                    "created_at": target.created_at,
                    "updated_at": target.updated_at,
                    "age_seconds": max(0, int((now - target.created_at).total_seconds())),
                    "commands": commands,
                }
            )
    rows.sort(key=lambda row: row["created_at"], reverse=filters.get("sort") == "newest")
    return rows
