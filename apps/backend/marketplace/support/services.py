from uuid import uuid4

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from marketplace.accounts.models import Business, User
from marketplace.accounts.permissions import active_user, has_role, require_operator
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.common.pagination import StandardPagination
from marketplace.finance.services import digest, lock_order
from marketplace.logistics.fulfillment import visible_orders
from marketplace.operations.files import upload_document
from marketplace.operations.models import AuditEvent, StoredFile
from marketplace.operations.services import audit, notify

from .models import AttachmentScope, Ticket, TicketMessage


def visible_tickets(actor):
    if not active_user(actor):
        return Ticket.objects.none()
    if has_role(actor, "operator", "owner"):
        return Ticket.objects.all()
    return Ticket.objects.filter(
        Q(business__membership__user=actor) | Q(order__in=visible_orders(actor))
    )


def lock_ticket(actor, pk):
    if actor is not None:
        actor = locked_actor(actor)
    ref = get_object_or_404(visible_tickets(actor) if actor else Ticket.objects.all(), pk=pk)
    if ref.order_id:
        lock_order(ref.order_id)
    else:
        Business.objects.select_for_update().get(pk=ref.business_id)
    return Ticket.objects.select_for_update().get(pk=pk)


def responsible(actor, ticket):
    require_operator(actor)
    if not has_role(actor, "owner") and ticket.assigned_to_id != actor.pk:
        raise PermissionDenied("ابتدا مسئولیت تیکت را بپذیرید.")


def require_text(text):
    if not isinstance(text, str) or not text.strip():
        raise ValidationError("متن یا دلیل لازم است.")


def related(actor, kind, pk, business):
    from marketplace.catalog.models import Product
    from marketplace.disputes.models import DiscrepancyCase
    from marketplace.logistics.models import Shipment

    if not kind and pk is None:
        return None
    if kind == "business":
        get_object_or_404(Business, pk=pk, membership__user=actor)
        return None
    if kind == "product":
        get_object_or_404(Product, pk=pk, business=business)
        return None
    if kind in ["review", "reply"]:
        from marketplace.reviews.models import Reply, Review
        from marketplace.reviews.services import own_rights, visible_to_actor

        own = Review.objects.filter(entitlement__in=own_rights(actor))
        accessible = Review.objects.filter(
            Q(pk__in=own.values("pk")) | Q(pk__in=visible_to_actor(actor).values("pk"))
        )
        if kind == "reply":
            reply = get_object_or_404(Reply, pk=pk, review__in=accessible)
            if reply.submitted_at is None and reply.actor_id != actor.pk:
                raise NotFound()
            review = reply.review
        else:
            review = get_object_or_404(accessible, pk=pk)
        # Public readers may raise a content ticket, but receive no access to its Order.
        return visible_orders(actor).filter(pk=review.entitlement.order_id).first()
    if kind == "order":
        return get_object_or_404(visible_orders(actor), pk=pk)
    if kind == "shipment":
        row = get_object_or_404(Shipment, pk=pk, request__group__order__in=visible_orders(actor))
        return row.request.group.order
    if kind == "discrepancy":
        return get_object_or_404(DiscrepancyCase, pk=pk, order__in=visible_orders(actor)).order
    raise ValidationError("پیوند معتبر لازم است.")


def attachments(*, actor, ids, business, order=None, ticket=None, minimum=0):
    keys = [str(pk) for pk in ids]
    if not minimum <= len(keys) <= 10 or len(keys) != len(set(keys)):
        raise ValidationError("تعداد مدارک مجاز نیست؛ حداکثر ۱۰ فایل غیرتکراری ارسال کنید.")
    files = list(
        StoredFile.objects.filter(
            pk__in=keys,
            owner=actor,
            scan_status="clean",
            deleted_at__isnull=True,
            purpose__in=["support", "discrepancy"],
            size__lte=10485760,
            content_type__in=["image/jpeg", "image/png", "image/webp", "application/pdf"],
        ).select_related("support_scope")
    )
    if len(files) != len(keys):
        raise NotFound("مدرک مجاز یافت نشد.")
    for file in files:
        scope = getattr(file, "support_scope", None)
        if not scope or scope.order_id != (order.pk if order else None):
            raise NotFound()
        if scope.ticket_id and (ticket is None or scope.ticket_id != ticket.pk):
            raise NotFound()
        if scope.order_id is None and scope.business_id != business.pk:
            raise NotFound()
        if file.ticket_messages.exists() and (
            not ticket or file.ticket_messages.exclude(ticket=ticket).exists()
        ):
            raise NotFound()
    return files


def can_read_file(actor, file):
    if not active_user(actor) or file.deleted_at or file.scan_status != "clean":
        return False
    if file.owner_id == actor.pk:
        return True
    if file.ticket_messages.filter(ticket__in=visible_tickets(actor)).exists():
        return True
    orders = visible_orders(actor)
    return (
        file.discrepancy_lines.filter(case__order__in=orders).exists()
        or file.case_notes.filter(case__order__in=orders).exists()
        or file.dispute_decisions.filter(claim__case__order__in=orders).exists()
    )


def upload(*, actor, uploaded, consent, order_id=None, ticket_id=None):
    # Validate scope before storage I/O and recheck it before publishing the binding.
    if not active_user(actor):
        raise PermissionDenied()
    ticket = get_object_or_404(visible_tickets(actor), pk=ticket_id) if ticket_id else None
    if ticket and ticket.status == "closed":
        raise Conflict("تیکت بسته است.")
    if ticket and order_id and str(ticket.order_id) != str(order_id):
        raise ValidationError("پیوند سفارش متفاوت است.")
    order_id = ticket.order_id if ticket else order_id
    order = get_object_or_404(visible_orders(actor), pk=order_id) if order_id else None
    platform_actor = has_role(actor, "operator", "owner")
    if ticket and platform_actor:
        business = ticket.business
    elif order and platform_actor:
        business = order.retailer
    else:
        business = get_object_or_404(Business, membership__user=actor)
    file = upload_document(
        actor=actor,
        business=business,
        purpose="discrepancy" if order and not ticket else "support",
        consent=consent,
        upload=uploaded,
    )
    with transaction.atomic():
        locked_actor(actor)
        if ticket:
            ticket = lock_ticket(actor, ticket.pk)
            if ticket.status == "closed":
                raise Conflict("تیکت بسته است.")
        elif order:
            get_object_or_404(visible_orders(actor), pk=order.pk)
        AttachmentScope.objects.create(file=file, business=business, order=order, ticket=ticket)
    return file


def message_data(row):
    return {
        "id": str(row.pk),
        "actor": str(row.actor_id) if row.actor_id else None,
        "text": row.text,
        "files": [str(pk) for pk in row.files.values_list("pk", flat=True)],
        "created_at": row.created_at,
    }


def ticket_data(ticket):
    return {
        "id": str(ticket.pk),
        "number": ticket.number,
        "title": ticket.title,
        "category": ticket.category,
        "status": ticket.status,
        "business": str(ticket.business_id),
        "assigned_to": str(ticket.assigned_to_id) if ticket.assigned_to_id else None,
        "related_type": ticket.related_type,
        "related_id": str(ticket.related_id) if ticket.related_id else None,
        "previous": str(ticket.previous_id) if ticket.previous_id else None,
        "created_at": ticket.created_at,
        "last_reply_at": ticket.last_reply_at,
        "resolved_at": ticket.resolved_at,
        "closed_at": ticket.closed_at,
    }


@transaction.atomic
def create(
    *,
    actor,
    title,
    category,
    text,
    idempotency_key,
    files=(),
    related_type="",
    related_id=None,
    previous=None,
):
    actor = locked_actor(actor)
    business = get_object_or_404(Business, membership__user=actor)
    payload = dict(
        title=title,
        category=category,
        text=text,
        files=sorted(map(str, files)),
        related_type=related_type,
        related_id=str(related_id) if related_id else None,
        previous=str(previous) if previous else None,
    )
    prior = Ticket.objects.filter(business=business, command_key=idempotency_key).first()
    if prior:
        if prior.request_hash != digest(payload):
            raise Conflict("کلید ثبت با درخواست پیشین متفاوت است.")
        return ticket_data(prior)
    require_text(title)
    require_text(text)
    order = related(actor, related_type, related_id, business)
    if order:
        lock_order(order.pk)
    else:
        Business.objects.select_for_update().get(pk=business.pk)
    parent = (
        get_object_or_404(visible_tickets(actor), pk=previous, status="closed")
        if previous
        else None
    )
    evidence = attachments(actor=actor, ids=files, business=business, order=order)
    pk = uuid4()
    ticket = Ticket.objects.create(
        id=pk,
        number=f"SUP-{pk.hex}",
        business=business,
        creator=actor,
        title=title,
        category=category,
        order=order,
        related_type=related_type,
        related_id=related_id,
        previous=parent,
        command_key=idempotency_key,
        request_hash=digest(payload),
        last_reply_at=timezone.now(),
    )
    msg = TicketMessage.objects.create(
        ticket=ticket,
        actor=actor,
        text=text,
        command_key=idempotency_key,
        request_hash=digest(payload),
    )
    msg.files.set(evidence)
    audit(actor=actor, action="support.created", target=ticket, after=ticket_data_json(ticket))
    return ticket_data(ticket)


def ticket_data_json(ticket):
    return {
        "status": ticket.status,
        "assigned_to": str(ticket.assigned_to_id) if ticket.assigned_to_id else None,
    }


def announce(ticket, actor, topic):
    recipients = {ticket.creator_id, ticket.assigned_to_id}
    if ticket.order_id:
        recipients.update(
            [ticket.order.retailer.membership.user_id, ticket.order.manufacturer.membership.user_id]
        )
    for pk in recipients - {None, actor.pk if actor else None}:
        notify(recipient=User.objects.get(pk=pk), topic=topic, payload={"ticket": str(ticket.pk)})


@transaction.atomic
def reply(*, actor, pk, text, idempotency_key, files=()):
    ticket = lock_ticket(actor, pk)
    payload = {"text": text, "files": sorted(map(str, files)), "actor": str(actor.pk)}
    prior = ticket.messages.filter(command_key=idempotency_key).first()
    if prior:
        if prior.request_hash != digest(payload):
            raise Conflict("کلید پیام متفاوت است.")
        return message_data(prior)
    if ticket.status == "closed":
        raise Conflict("تیکت بسته‌شده پاسخ تازه نمی‌پذیرد.")
    require_text(text)
    participant = ticket.business.membership.user_id == actor.pk or (
        ticket.order_id is not None
        and actor.pk
        in (
            ticket.order.retailer.membership.user_id,
            ticket.order.manufacturer.membership.user_id,
        )
    )
    if not participant:
        responsible(actor, ticket)
    evidence = attachments(
        actor=actor, ids=files, business=ticket.business, order=ticket.order, ticket=ticket
    )
    msg = TicketMessage.objects.create(
        ticket=ticket,
        actor=actor,
        text=text,
        command_key=idempotency_key,
        request_hash=digest(payload),
    )
    msg.files.set(evidence)
    if participant and ticket.status in ["resolved", "waiting_user"]:
        ticket.status, ticket.resolved_at = "in_review", None
    ticket.last_reply_at = timezone.now()
    ticket.save(update_fields=["status", "resolved_at", "last_reply_at", "updated_at"])
    audit(
        actor=actor,
        action="support.message",
        target=ticket,
        after={"message": str(msg.pk), "status": ticket.status},
    )
    announce(ticket, actor, "support.message")
    return message_data(msg)


@transaction.atomic
def assign(*, actor, pk, user_id=None, reason="پذیرش مسئولیت"):
    users = {
        u.pk: u
        for u in User.objects.select_for_update(no_key=True)
        .filter(pk__in=[actor.pk, user_id or actor.pk])
        .order_by("pk")
    }
    actor = users[actor.pk]
    require_operator(actor)
    target = users.get(user_id or actor.pk)
    if target is None or not has_role(target, "operator", "owner"):
        raise ValidationError("مسئول فعال لازم است.")
    ticket = lock_ticket(actor, pk)
    require_text(reason)
    if ticket.status == "closed":
        raise Conflict("تیکت نهایی است.")
    if (
        ticket.assigned_to_id
        and has_role(ticket.assigned_to, "operator", "owner")
        and ticket.assigned_to_id != actor.pk
        and not has_role(actor, "owner")
    ):
        raise PermissionDenied()
    before = ticket_data_json(ticket)
    ticket.assigned_to = target
    if ticket.status == "new":
        ticket.status = "in_review"
    ticket.save(update_fields=["assigned_to", "status", "updated_at"])
    audit(
        actor=actor,
        action="support.assigned",
        target=ticket,
        reason=reason,
        before=before,
        after=ticket_data_json(ticket),
    )
    announce(ticket, actor, "support.assigned")
    return ticket_data(ticket)


@transaction.atomic
def transition(*, actor, pk, status, reason):
    ticket = lock_ticket(actor, pk)
    responsible(actor, ticket)
    require_text(reason)
    allowed = {
        "new": {"in_review"},
        "in_review": {"waiting_user", "resolved"},
        "waiting_user": {"in_review", "resolved"},
        "resolved": {"closed"},
    }
    if status not in allowed.get(ticket.status, set()):
        raise Conflict("گذار وضعیت مجاز نیست.")
    if status == "closed" and ticket.case_id and ticket.case.closed_at is None:
        raise Conflict("پروندهٔ مغایرت هنوز باز است.")
    before = ticket_data_json(ticket)
    ticket.status = status
    if status == "resolved":
        ticket.resolved_at = timezone.now()
    if status == "closed":
        ticket.closed_at = timezone.now()
    ticket.save(update_fields=["status", "resolved_at", "closed_at", "updated_at"])
    msg = TicketMessage.objects.create(
        ticket=ticket,
        actor=actor,
        text=reason,
        command_key=uuid4(),
        request_hash=digest({"status": status, "reason": reason}),
    )
    audit(
        actor=actor,
        action="support.status",
        target=ticket,
        reason=reason,
        before=before,
        after={**ticket_data_json(ticket), "message": str(msg.pk)},
    )
    announce(ticket, actor, "support.status")
    return ticket_data(ticket)


@transaction.atomic
def read(*, actor, pk):
    locked_actor(actor)
    ticket = get_object_or_404(visible_tickets(actor), pk=pk)
    return {
        **ticket_data(ticket),
        "messages": [
            message_data(row)
            for row in ticket.messages.prefetch_related("files").order_by("created_at", "pk")
        ],
        "history": list(
            AuditEvent.objects.filter(aggregate_type="support.ticket", aggregate_id=ticket.pk)
            .order_by("created_at", "pk")
            .values("action", "reason", "actor_id", "created_at", "before", "after")
        ),
    }


@transaction.atomic
def listing(*, actor, request):
    locked_actor(actor)
    query = visible_tickets(actor).order_by("created_at", "pk")
    status = request.query_params.get("status")
    if status:
        query = query.filter(status=status)
    pagination = StandardPagination()
    page = pagination.paginate_queryset(query, request)
    assert page is not None
    return pagination.get_paginated_response([ticket_data(row) for row in page]).data


def referral(case):
    """Called under Order lock in the same transaction as referral."""
    existing = Ticket.objects.filter(case=case).first()
    if existing:
        if existing.status == "resolved":
            before = ticket_data_json(existing)
            existing.status, existing.resolved_at = "in_review", None
            existing.save(update_fields=["status", "resolved_at", "updated_at"])
            audit(
                actor=None,
                action="support.referral_added",
                target=existing,
                before=before,
                after=ticket_data_json(existing),
            )
        return existing
    pk = uuid4()
    ticket = Ticket.objects.create(
        id=pk,
        number=f"SUP-{pk.hex}",
        business=case.order.retailer,
        creator=case.order.retailer.membership.user,
        title="رسیدگی به مغایرت سفارش",
        category="order",
        order=case.order,
        case=case,
        related_type="discrepancy",
        related_id=case.pk,
        command_key=case.pk,
        request_hash=digest(str(case.pk)),
    )
    TicketMessage.objects.create(
        ticket=ticket,
        text="بخش حل‌نشدهٔ مغایرت برای بررسی ارجاع شد.",
        command_key=case.pk,
        request_hash=digest(str(case.pk)),
    )
    audit(actor=None, action="support.referred", target=ticket, after={"case": str(case.pk)})
    announce(ticket, None, "support.referred")
    return ticket
