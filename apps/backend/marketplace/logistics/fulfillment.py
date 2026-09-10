"""Audited fulfillment commands. All quantity/state changes serialize on Order."""

from collections import defaultdict
from datetime import timedelta
from uuid import UUID

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from marketplace.accounts.models import Business
from marketplace.accounts.permissions import active_user, has_role, require_operator
from marketplace.catalog.services import locked_actor, snapshot
from marketplace.common.exceptions import Conflict
from marketplace.operations.models import StoredFile
from marketplace.operations.services import audit, notify
from marketplace.orders.models import Order

from .grouping import allocated_quantities
from .models import (
    Carrier,
    CarrierAssignment,
    FulfillmentEvent,
    Shipment,
    ShipmentItem,
    ShippingRequest,
)
from .services import match_tariff, normalized, province


def required_reason(reason):
    if not isinstance(reason, str) or not reason.strip():
        raise ValidationError({"reason": "دلیل الزامی است."})


def visible_orders(actor):
    if not active_user(actor):
        return Order.objects.none()
    if has_role(actor, "owner", "operator"):
        return Order.objects.all()
    return Order.objects.filter(
        Q(manufacturer__membership__user=actor) | Q(retailer__membership__user=actor)
    )


def lock_request(actor, request_id, *, operator=False):
    actor = locked_actor(actor)
    if operator:
        require_operator(actor)
    reference = get_object_or_404(
        ShippingRequest.objects.select_related("group"),
        pk=request_id,
        group__order__in=visible_orders(actor),
    )
    order_ref = Order.objects.get(pk=reference.group.order_id)
    list(
        Business.objects.select_for_update()
        .filter(pk__in=[order_ref.manufacturer_id, order_ref.retailer_id])
        .order_by("id")
    )
    order = Order.objects.select_for_update().get(pk=order_ref.pk)
    request = (
        ShippingRequest.objects.select_for_update(of=("self",))
        .select_related("group__service")
        .get(pk=request_id)
    )
    if not operator:
        if (
            order.manufacturer.membership.user_id != actor.pk
            or order.manufacturer.status == "suspended"
        ):
            raise PermissionDenied()
    if order.status != "active" or not order.paid_at:
        raise Conflict("فقط سفارش فعال و پرداخت‌شده قابل آماده‌سازی و ارسال است.")
    if request.status in ["completed", "cancelled"]:
        raise Conflict("درخواست حمل نهایی است.")
    return actor, order, request


def record_event(
    request,
    actor,
    action,
    *,
    shipment=None,
    reason="",
    before=None,
    after=None,
    actor_kind="user",
    evidence=None,
):
    event = FulfillmentEvent.objects.create(
        request=request,
        shipment=shipment,
        actor=actor,
        actor_kind=actor_kind,
        action=action,
        reason=reason,
        before=before or {},
        after=after or {},
        evidence=evidence,
    )
    audit(
        actor=actor,
        action=f"fulfillment.{action}",
        target=shipment or request,
        reason=reason,
        before=before,
        after={**(after or {}), "event": str(event.pk), "actor_kind": actor_kind},
    )
    return event


def request_status(request, status, actor, reason=""):
    if request.status == status:
        return
    allowed = {
        "waiting": {"ready", "spec_review", "cancelled"},
        "spec_review": {"ready", "attention", "cancelled"},
        "ready": {"assigned", "attention", "cancelled"},
        "assigned": {"in_transit", "attention", "cancelled"},
        "in_transit": {"attention", "completed"},
        "attention": {"ready", "assigned", "in_transit", "completed", "cancelled"},
    }
    if status not in allowed.get(request.status, set()):
        raise Conflict("گذار وضعیت درخواست حمل مجاز نیست.")
    before = {"status": request.status}
    request.status = status
    if status == "ready":
        request.ready_at = timezone.now()
    request.save(update_fields=["status", "ready_at", "updated_at"])
    record_event(
        request,
        actor,
        "request.status",
        reason=reason,
        before=before,
        after={"status": status},
        actor_kind="user" if actor else "system",
    )


def validate_packages(packages):
    fields = {"count", "weight_g", "length_mm", "width_mm", "height_mm"}
    if not isinstance(packages, list) or not 1 <= len(packages) <= 1000:
        raise ValidationError("مشخصات بسته‌ها لازم است.")
    for package in packages:
        if (
            not isinstance(package, dict)
            or set(package) != fields
            or any(type(value) is not int or not 1 <= value <= 10**9 for value in package.values())
        ):
            raise ValidationError("تعداد، وزن و ابعاد هر بسته باید مثبت باشند.")
    return sum(package["count"] * package["weight_g"] for package in packages)


@transaction.atomic
def save_carrier(*, actor, data, pk=None):
    actor = locked_actor(actor)
    require_operator(actor)
    data = dict(data)
    reason = data.pop("reason", "")
    selected = data.pop("services", None)
    obj = get_object_or_404(Carrier.objects.select_for_update(), pk=pk) if pk else Carrier()
    before = snapshot(obj) if pk else {}
    if pk:
        required_reason(reason)
    for field, value in data.items():
        setattr(obj, field, value)
    obj.full_clean(exclude=["services"])
    obj.save()
    if selected is not None:
        if not selected or len(selected) != len(set(service.pk for service in selected)):
            raise ValidationError("خدمات غیرتکراری حمل‌کننده لازم است.")
        obj.services.set(selected)
    audit(
        actor=actor,
        action="shipping.carrier_saved",
        target=obj,
        reason=reason,
        before=before,
        after=snapshot(obj),
    )
    return obj


@transaction.atomic
def progress(*, actor, request_id, line_id, prepared_quantity, note):
    actor, order, request = lock_request(actor, request_id)
    if request.status != "waiting":
        raise Conflict("آمادگی این گروه قبلاً تأیید شده است.")
    line = get_object_or_404(order.lines, pk=line_id, shipping_item__group=request.group)
    if (
        type(prepared_quantity) is not int
        or not line.prepared_quantity <= prepared_quantity <= line.quantity
    ):
        raise ValidationError("پیشرفت باید صعودی و حداکثر برابر تعداد سفارش باشد.")
    required_reason(note)
    if order.preparation_started_at is None:
        order.preparation_started_at = timezone.now()
        order.save(update_fields=["preparation_started_at", "updated_at"])
    before = {
        "line": str(line.pk),
        "prepared_quantity": line.prepared_quantity,
        "note": line.preparation_note,
    }
    line.prepared_quantity, line.preparation_note = prepared_quantity, note
    line.save(update_fields=["prepared_quantity", "preparation_note", "updated_at"])
    record_event(
        request,
        actor,
        "preparation.progress",
        before=before,
        after={
            "line": str(line.pk),
            "prepared_quantity": prepared_quantity,
            "note": note,
            "promised_ready_at": (order.paid_at + timedelta(days=line.lead_time_days)).isoformat(),
        },
    )
    return request


@transaction.atomic
def ready(*, actor, request_id, packages):
    actor, order, request = lock_request(actor, request_id)
    weight = validate_packages(packages)
    if request.status != "waiting":
        if request.status in ["ready", "spec_review"] and request.actual_packages == packages:
            return request
        raise Conflict("گروه قبلاً آماده اعلام شده است.")
    if any(
        item.line.prepared_quantity != item.quantity
        for item in request.group.items.select_related("line")
    ):
        raise Conflict("همهٔ اقلام گروه باید آماده باشند.")
    request.actual_packages, request.actual_weight_g = packages, weight
    request.save(update_fields=["actual_packages", "actual_weight_g", "updated_at"])
    record_event(
        request,
        actor,
        "request.packages_confirmed",
        before={"weight_g": request.group.weight_g},
        after={"packages": packages, "weight_g": weight},
    )
    request_status(request, "ready" if weight == request.group.weight_g else "spec_review", actor)
    return request


@transaction.atomic
def review_specifications(*, actor, request_id, decision, reason):
    actor, order, request = lock_request(actor, request_id, operator=True)
    required_reason(reason)
    if request.status != "spec_review":
        raise Conflict("درخواست در انتظار بررسی مشخصات نیست.")
    if decision == "continue":
        data = request.group.snapshot
        origin, destination = data["origin_address"], data["destination"]
        tariff = match_tariff(
            request.group.service,
            province(origin["province"]),
            normalized(origin["city"]),
            province(destination["province"]),
            normalized(destination["city"]),
            request.actual_weight_g,
        )
        if tariff is None or tariff.amount_irr != request.group.amount_irr:
            raise Conflict(
                "ادامه فقط با همان خدمت معتبر و همان مبلغ مجاز است؛ به لغو/بازپرداخت ارجاع دهید."
            )
        record_event(
            request,
            actor,
            "request.weight_reviewed",
            reason=reason,
            after={
                "actual_weight_g": request.actual_weight_g,
                "tariff": str(tariff.pk),
                "amount_irr": tariff.amount_irr,
            },
        )
        request_status(request, "ready", actor, reason)
    elif decision == "cancel_refund":
        refer_cancellation(request, order, actor, reason)
    else:
        raise ValidationError("تصمیم نامعتبر است.")
    return request


def refer_cancellation(request, order, actor, reason):
    if request.cancellation_referred_at:
        return
    request.cancellation_referred_at = timezone.now()
    request.save(update_fields=["cancellation_referred_at", "updated_at"])
    request_status(request, "attention", actor, reason)
    record_event(
        request,
        actor,
        "request.cancellation_referred",
        reason=reason,
        after={"order": str(order.pk), "group": str(request.group_id)},
    )
    notify(
        recipient=order.retailer.membership.user,
        topic="shipping.cancellation_referred",
        payload={"order": str(order.pk), "group": str(request.group_id)},
    )


@transaction.atomic
def operational_exception(*, actor, request_id, decision, reason):
    actor, order, request = lock_request(actor, request_id, operator=True)
    required_reason(reason)
    if decision == "hold":
        if request.status not in ["ready", "assigned"]:
            raise Conflict("توقف تخصیص فقط برای گروه آماده یا تخصیص‌یافته مجاز است.")
        request.hold_reason = reason
        request.save(update_fields=["hold_reason", "updated_at"])
        request_status(request, "attention", actor, reason)
    elif decision == "resume":
        if not request.hold_reason or request.cancellation_referred_at:
            raise Conflict("توقف قابل ادامه‌ای وجود ندارد.")
        request.hold_reason = ""
        request.save(update_fields=["hold_reason", "updated_at"])
        request_status(
            request,
            "ready" if request.needs_assignment or not request.assignments.exists() else "assigned",
            actor,
            reason,
        )
    elif decision == "cancel_refund":
        if request.status not in ["ready", "assigned", "attention"]:
            raise Conflict("ارجاع در وضعیت جاری مجاز نیست.")
        refer_cancellation(request, order, actor, reason)
    else:
        raise ValidationError("تصمیم نامعتبر است.")
    record_event(
        request, actor, "request.operational_exception", reason=reason, after={"decision": decision}
    )
    return request


@transaction.atomic
def complete_cancellation_referral(*, request_id, outcome_reference, reason):
    """Trusted PRD-04/05/06 hook after the cancellation/refund outcome commits.

    No financial amount is accepted here. Delivered quantities are never removed
    and an order with refunded undelivered quantities never becomes fully delivered.
    The caller must use the same database transaction as the financial outcome.
    """
    required_reason(reason)
    try:
        outcome_reference = UUID(str(outcome_reference))
    except (TypeError, ValueError) as exc:
        raise ValidationError("شناسهٔ نتیجهٔ معتبر لازم است.") from exc
    reference = ShippingRequest.objects.select_related("group").get(pk=request_id)
    Order.objects.select_for_update().get(pk=reference.group.order_id)
    request = ShippingRequest.objects.get(pk=request_id)
    if request.cancellation_reference:
        if str(request.cancellation_reference) != str(outcome_reference):
            raise Conflict("نتیجهٔ دیگری قبلاً ثبت شده است.")
        return request
    if request.status != "attention" or not request.cancellation_referred_at:
        raise Conflict("ارجاع لغو باز وجود ندارد.")
    if request.shipments.filter(status__in=["handed_over", "in_transit", "unconfirmed"]).exists():
        raise Conflict("ابتدا نتیجهٔ مرسوله‌های در مسیر تعیین شود.")
    for shipment in request.shipments.filter(status="ready"):
        transition(shipment, "cancelled", actor=None, reason=reason, actor_kind="system")
    request.cancellation_reference = outcome_reference
    request.save(update_fields=["cancellation_reference", "updated_at"])
    request_status(request, "cancelled", None, reason)
    record_event(
        request,
        None,
        "request.cancellation_completed",
        reason=reason,
        actor_kind="system",
        after={"outcome_reference": str(outcome_reference)},
    )
    return request


@transaction.atomic
def assign(*, actor, request_id, carrier_id, pickup_start, pickup_end, reason, agent=None):
    actor, order, request = lock_request(actor, request_id, operator=True)
    required_reason(reason)
    if request.status not in ["ready", "assigned"] or request.cancellation_referred_at:
        raise Conflict("درخواست آمادهٔ تخصیص نیست.")
    if pickup_start < timezone.now() or pickup_end <= pickup_start:
        raise ValidationError("بازهٔ جمع‌آوری آینده و معتبر لازم است.")
    carrier = get_object_or_404(
        Carrier.objects.select_for_update(),
        pk=carrier_id,
        is_active=True,
        services=request.group.service,
    )
    previous = request.assignments.last()
    assignment = CarrierAssignment.objects.create(
        request=request,
        carrier=carrier,
        actor=actor,
        pickup_start=pickup_start,
        pickup_end=pickup_end,
        reason=reason,
        carrier_snapshot={
            "name": carrier.name,
            "kind": carrier.kind,
            "phone": carrier.phone,
            "agent": agent or {},
        },
    )
    request.needs_assignment = False
    request.save(update_fields=["needs_assignment", "updated_at"])
    for shipment in request.shipments.filter(status="ready"):
        before = {"assignment": str(shipment.assignment_id)}
        shipment.assignment = assignment
        shipment.save(update_fields=["assignment", "updated_at"])
        record_event(
            request,
            actor,
            "shipment.assignment_changed",
            shipment=shipment,
            reason=reason,
            before=before,
            after={"assignment": str(assignment.pk)},
        )
    record_event(
        request,
        actor,
        "request.assigned",
        reason=reason,
        before={"assignment": str(previous.pk) if previous else None},
        after={
            "assignment": str(assignment.pk),
            "carrier": assignment.carrier_snapshot,
            "pickup_start": pickup_start.isoformat(),
            "pickup_end": pickup_end.isoformat(),
        },
    )
    request_status(request, "assigned", actor, reason)
    return request


def clean_evidence(file_id, order):
    file = get_object_or_404(
        StoredFile,
        pk=file_id,
        purpose="shipping",
        scan_status="clean",
        deleted_at__isnull=True,
        business_id__in=[order.manufacturer_id, order.retailer_id],
    )
    # Prevent attaching another order's private documents from the same business.
    if not file.fulfillment_evidence.filter(
        request__group__order=order, action="file.uploaded"
    ).exists():
        raise NotFound()
    return file


def manifest(shipment):
    return {
        "packages": shipment.packages,
        "items": [
            {"group_item": str(item.group_item_id), "quantity": item.quantity}
            for item in shipment.items.order_by("group_item_id")
        ],
    }


def set_items(shipment, items):
    valid = {str(item.pk): item for item in shipment.request.group.items.all()}
    ids = [str(item["group_item"]) for item in items]
    if not items or len(ids) != len(set(ids)) or set(ids) - valid.keys():
        raise ValidationError("اقلام باید غیرتکراری و متعلق به همین گروه باشند.")
    if any(
        type(item["quantity"]) is not int
        or not 1 <= item["quantity"] <= valid[str(item["group_item"])].quantity
        for item in items
    ):
        raise ValidationError("تعداد قلم مرسوله معتبر نیست.")
    shipment.items.all().delete()
    ShipmentItem.objects.bulk_create(
        [
            ShipmentItem(
                shipment=shipment,
                group_item=valid[str(item["group_item"])],
                quantity=item["quantity"],
            )
            for item in items
        ]
    )


def check_allocation(request, *, exact=False):
    totals = allocated_quantities(request)
    expected = {item.pk: item.quantity for item in request.group.items.all()}
    if any(
        totals[key] > quantity or (exact and totals[key] != quantity)
        for key, quantity in expected.items()
    ):
        raise Conflict("جمع تخصیص باید بدون اضافه و هنگام ارسال دقیقاً برابر اقلام گروه باشد.")
    if exact:
        weight = sum(
            validate_packages(shipment.packages)
            for shipment in request.shipments.exclude(status="cancelled").exclude(
                resolution="resend"
            )
        )
        if weight != request.actual_weight_g:
            raise Conflict("وزن مجموع مرسوله‌ها باید با مشخصات واقعی تأییدشده برابر باشد.")


@transaction.atomic
def save_shipment(
    *, actor, request_id, packages, items, shipment_id=None, reason="", operator=False
):
    actor, order, request = lock_request(actor, request_id, operator=operator)
    if request.status not in ["assigned", "in_transit"] or request.cancellation_referred_at:
        raise Conflict("درخواست تخصیص فعال ندارد.")
    validate_packages(packages)
    shipment = (
        get_object_or_404(request.shipments, pk=shipment_id)
        if shipment_id
        else Shipment(request=request, assignment=request.assignments.last())
    )
    if shipment_id and shipment.status in ["delivered", "returned", "cancelled"]:
        raise Conflict("مرسوله نهایی است.")
    if shipment_id and shipment.status != "ready" and not operator:
        raise Conflict("اطلاعات پس از تحویل به حمل‌کننده قفل است.")
    if operator:
        required_reason(reason)
    before = manifest(shipment) if shipment_id else {}
    shipment.packages = packages
    shipment.save()
    set_items(shipment, items)
    check_allocation(request, exact=bool(shipment.handed_over_at))
    record_event(
        request,
        actor,
        "shipment.corrected" if operator else "shipment.saved",
        shipment=shipment,
        reason=reason,
        before=before,
        after=manifest(shipment),
    )
    return shipment


@transaction.atomic
def correct_manifests(*, actor, request_id, corrections, reason):
    actor, order, request = lock_request(actor, request_id, operator=True)
    required_reason(reason)
    if request.status not in ["assigned", "in_transit"] or request.cancellation_referred_at:
        raise Conflict("اصلاح بسته‌بندی در وضعیت جاری مجاز نیست.")
    ids = [row["shipment_id"] for row in corrections]
    if not ids or len(ids) != len(set(ids)):
        raise ValidationError("مرسوله‌های غیرتکراری لازم‌اند.")
    for row in corrections:
        shipment = get_object_or_404(request.shipments, pk=row["shipment_id"])
        if shipment.status in ["delivered", "returned", "cancelled"] or shipment.resolution:
            raise Conflict("مرسولهٔ نهایی یا تعیین‌تکلیف‌شده قابل بازنویسی نیست.")
        validate_packages(row["packages"])
        before = manifest(shipment)
        shipment.packages = row["packages"]
        shipment.save(update_fields=["packages", "updated_at"])
        set_items(shipment, row["items"])
        record_event(
            request,
            actor,
            "shipment.corrected",
            shipment=shipment,
            reason=reason,
            before=before,
            after=manifest(shipment),
        )
    check_allocation(request, exact=True)
    return request


def shipment_order_lock(actor, shipment_id, *, operator=False):
    reference = get_object_or_404(
        Shipment, pk=shipment_id, request__group__order__in=visible_orders(actor)
    )
    actor, order, request = lock_request(actor, reference.request_id, operator=operator)
    return actor, order, request, Shipment.objects.get(pk=shipment_id)


def invalidate_delivery(shipment):
    now = timezone.now()
    from .models import DeliveryChallenge, DeliveryLink

    DeliveryLink.objects.filter(shipment=shipment, revoked_at__isnull=True).update(revoked_at=now)
    DeliveryChallenge.objects.filter(shipment=shipment, consumed_at__isnull=True).update(
        consumed_at=now
    )


def transition(shipment, status, *, actor, reason="", evidence=None, actor_kind="user"):
    before = {"status": shipment.status}
    shipment.status = status
    now = timezone.now()
    if status == "handed_over":
        shipment.handed_over_at = now
    if status == "delivered":
        shipment.delivered_at = now
    if status in ["delivered", "unconfirmed", "failed", "returned", "cancelled"]:
        invalidate_delivery(shipment)
    shipment.save(update_fields=["status", "handed_over_at", "delivered_at", "updated_at"])
    record_event(
        shipment.request,
        actor,
        "shipment.status",
        shipment=shipment,
        reason=reason,
        before=before,
        after={"status": status},
        evidence=evidence,
        actor_kind=actor_kind,
    )


@transaction.atomic
def hand_over(*, actor, shipment_id):
    actor, order, request, shipment = shipment_order_lock(actor, shipment_id)
    if shipment.status == "handed_over":
        return shipment
    if (
        shipment.status != "ready"
        or request.status not in ["assigned", "in_transit"]
        or request.cancellation_referred_at
        or request.needs_assignment
    ):
        raise Conflict("تحویل به حمل‌کننده در این وضعیت مجاز نیست.")
    check_allocation(request, exact=True)
    transition(shipment, "handed_over", actor=actor)
    request_status(request, "in_transit", actor)
    return shipment


@transaction.atomic
def cancel_shipment(*, actor, shipment_id, reason):
    actor, order, request, shipment = shipment_order_lock(actor, shipment_id)
    required_reason(reason)
    if shipment.status != "ready":
        raise Conflict("لغو مرسوله فقط پیش از تحویل به حمل‌کننده مجاز است.")
    transition(shipment, "cancelled", actor=actor, reason=reason)
    return shipment


@transaction.atomic
def tracking(*, actor, shipment_id, data, reason):
    actor, order, request, shipment = shipment_order_lock(actor, shipment_id, operator=True)
    required_reason(reason)
    if shipment.status in ["delivered", "returned", "cancelled"]:
        raise Conflict("مرسوله نهایی است.")
    fields = {
        "tracking_number",
        "receipt",
        "estimated_delivery_at",
        "recipient_name",
        "recipient_phone",
        "note",
    }
    if set(data) - fields:
        raise ValidationError("فیلد رهگیری نامعتبر است.")
    before = {
        field: str(getattr(shipment, field + "_id" if field == "receipt" else field) or "")
        for field in fields
    }
    if data.get("receipt"):
        data = {**data, "receipt": clean_evidence(data["receipt"], order)}
    for field, value in data.items():
        setattr(shipment, field, value)
    shipment.save()
    after = {
        field: str(getattr(shipment, field + "_id" if field == "receipt" else field) or "")
        for field in fields
    }
    record_event(
        request,
        actor,
        "shipment.tracking",
        shipment=shipment,
        reason=reason,
        before=before,
        after=after,
    )
    return shipment


@transaction.atomic
def track_status(*, actor, shipment_id, status, reason, evidence_id=None):
    actor, order, request, shipment = shipment_order_lock(actor, shipment_id, operator=True)
    required_reason(reason)
    allowed = {
        "handed_over": {"in_transit", "failed", "unconfirmed"},
        "in_transit": {"failed", "unconfirmed"},
        "unconfirmed": {"delivered", "failed"},
        "failed": {"returned"},
    }
    if status not in allowed.get(shipment.status, set()):
        raise Conflict("گذار وضعیت مرسوله مجاز نیست.")
    evidence = clean_evidence(evidence_id, order) if evidence_id else None
    if shipment.status == "unconfirmed" and evidence is None:
        raise ValidationError("مدرک بررسی تحویل لازم است.")
    transition(shipment, status, actor=actor, reason=reason, evidence=evidence)
    refresh_fulfillment(order, actor)
    return shipment


@transaction.atomic
def resolve_failure(*, actor, shipment_id, decision, reason):
    actor, order, request, shipment = shipment_order_lock(actor, shipment_id, operator=True)
    required_reason(reason)
    if shipment.status not in ["failed", "returned"]:
        raise Conflict("مرسوله ناموفق یا برگشتی نیست.")
    if shipment.resolution:
        if shipment.resolution == decision:
            return shipment.replacement if decision == "resend" else shipment
        raise Conflict("تصمیم قبلاً ثبت شده است.")
    if decision == "cancel_refund":
        shipment.resolution = decision
        shipment.save(update_fields=["resolution", "updated_at"])
        refer_cancellation(request, order, actor, reason)
        result = shipment
    elif decision == "resend":
        if request.cancellation_referred_at:
            raise Conflict("درخواست به لغو ارجاع شده است.")
        shipment.resolution = decision
        shipment.save(update_fields=["resolution", "updated_at"])
        result = Shipment.objects.create(
            request=request,
            assignment=shipment.assignment,
            replaces=shipment,
            packages=shipment.packages,
            recipient_name=shipment.recipient_name,
            recipient_phone=shipment.recipient_phone,
        )
        set_items(result, manifest(shipment)["items"])
        check_allocation(request, exact=True)
        request.needs_assignment = True
        request.save(update_fields=["needs_assignment", "updated_at"])
    else:
        raise ValidationError("تصمیم نامعتبر است.")
    record_event(
        request,
        actor,
        "shipment.resolved",
        shipment=shipment,
        reason=reason,
        after={
            "decision": decision,
            "replacement": str(result.pk) if decision == "resend" else None,
        },
    )
    refresh_fulfillment(order, actor)
    return result


def aggregate_status(order):
    expected = {
        item.pk: item.quantity
        for group in order.shipping_groups.prefetch_related("items")
        for item in group.items.all()
    }
    sent: defaultdict[UUID, int] = defaultdict(int)
    delivered: defaultdict[UUID, int] = defaultdict(int)
    attention = False
    for request in ShippingRequest.objects.filter(group__order=order).prefetch_related(
        "shipments__items"
    ):
        attention |= bool(
            (request.cancellation_referred_at and not request.cancellation_reference)
            or (request.hold_reason and request.status != "cancelled")
        )
        for shipment in request.shipments.all():
            attention |= (
                shipment.status in ["failed", "returned", "unconfirmed"]
                and shipment.resolution != "resend"
                and not request.cancellation_reference
            )
            if shipment.resolution == "resend" or shipment.status == "cancelled":
                continue
            for item in shipment.items.all():
                if shipment.handed_over_at:
                    sent[item.group_item_id] += item.quantity
                if shipment.status == "delivered":
                    delivered[item.group_item_id] += item.quantity
    if attention:
        return "attention"
    if expected and all(delivered[key] == qty for key, qty in expected.items()):
        return "fully_delivered"
    if sum(delivered.values()):
        return "partially_delivered"
    if expected and all(sent[key] == qty for key, qty in expected.items()):
        return "fully_shipped"
    return "partially_shipped" if sum(sent.values()) else "no_shipments"


def refresh_fulfillment(order, actor=None):
    """Caller holds Order row lock, including anonymous code verification."""
    for request in ShippingRequest.objects.filter(group__order=order).prefetch_related(
        "shipments__items", "group__items"
    ):
        if request.status in ["completed", "cancelled"]:
            continue
        shipments = [
            s
            for s in request.shipments.all()
            if s.status != "cancelled" and s.resolution != "resend"
        ]
        delivered: defaultdict[UUID, int] = defaultdict(int)
        for shipment in shipments:
            if shipment.status == "delivered":
                for item in shipment.items.all():
                    delivered[item.group_item_id] += item.quantity
        if (
            request.cancellation_referred_at
            or request.hold_reason
            or any(s.status in ["failed", "returned", "unconfirmed"] for s in shipments)
        ):
            request_status(request, "attention", actor)
        elif request.needs_assignment:
            request_status(request, "ready", actor)
        elif shipments and all(
            delivered[item.pk] == item.quantity for item in request.group.items.all()
        ):
            request_status(request, "completed", actor)
        elif shipments and any(s.handed_over_at for s in shipments):
            request_status(request, "in_transit", actor)
        elif request.status == "attention" and shipments:
            request_status(request, "assigned", actor)
    status = aggregate_status(order)
    if status == "fully_delivered" and order.delivered_at is None:
        order.delivered_at = timezone.now()
        order.discrepancy_deadline = order.delivered_at + timedelta(hours=72)
        order.save(update_fields=["delivered_at", "discrepancy_deadline", "updated_at"])
        audit(
            actor=actor,
            action="order.physically_delivered",
            target=order,
            after={"discrepancy_deadline": order.discrepancy_deadline.isoformat()},
        )
        notify(
            recipient=order.retailer.membership.user,
            topic="order.physically_delivered",
            payload={
                "order": str(order.pk),
                "discrepancy_deadline": order.discrepancy_deadline.isoformat(),
            },
        )
    return status
