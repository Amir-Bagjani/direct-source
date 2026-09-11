"""Dispute-authorized independent shipments; they never allocate original order stock twice."""

from marketplace.common.exceptions import Conflict

from .fulfillment import record_event, transition
from .models import Shipment, ShipmentItem


def create_shipment(action):
    decision = action.decision
    original = decision.claim.shipment
    shipment = Shipment.objects.create(
        request=original.request,
        assignment=original.assignment,
        compensation=action,
        purpose=decision.remedy,
        packages=original.packages,
    )
    ShipmentItem.objects.create(
        shipment=shipment, group_item=decision.claim.line.shipping_item, quantity=decision.accepted
    )
    record_event(
        original.request,
        decision.actor,
        "remedy.shipment_created",
        shipment=shipment,
        reason=decision.reason,
        after={
            "remedy": str(action.pk),
            "purpose": shipment.purpose,
            "quantity": decision.accepted,
        },
    )
    return shipment


def progress(action, *, actor, status, reason, files, tracking_code):
    shipment = action.shipment
    if action.waived_at:
        raise Conflict("جبران منتفی شده است.")
    if shipment.status == status:
        if tracking_code and tracking_code != shipment.tracking_number:
            raise Conflict("اطلاعات رهگیری نهایی متفاوت است.")
        return shipment
    allowed = {
        "ready": {"handed_over"},
        "handed_over": {"in_transit", "delivered"},
        "in_transit": {"delivered"},
    }
    if status not in allowed.get(shipment.status, set()):
        raise Conflict("گذار مرسولهٔ جبرانی مجاز نیست.")
    if status == "handed_over" and not tracking_code.strip():
        raise Conflict("شناسهٔ رهگیری مرسوله لازم است.")
    if tracking_code:
        shipment.tracking_number = tracking_code
        shipment.save(update_fields=["tracking_number", "updated_at"])
    transition(shipment, status, actor=actor, reason=reason, evidence=files[0])
    return shipment
