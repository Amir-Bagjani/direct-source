"""Shipment-scoped bearer links and recipient-only, hash-at-rest delivery codes."""

import hashlib
import secrets
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from rest_framework.exceptions import NotFound, Throttled, ValidationError

from marketplace.accounts.permissions import require_owner
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.operations.services import audit, notify
from marketplace.orders.models import Order

from .fulfillment import (
    invalidate_delivery,
    record_event,
    refresh_fulfillment,
    required_reason,
    shipment_order_lock,
    transition,
)
from .models import DeliveryChallenge, DeliveryLink, DeliveryPolicy

DELIVERABLE = {"handed_over", "in_transit"}


def token_digest(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def challenge_code(challenge):
    # The random UUID is a public nonce; deriving through a keyed PRF keeps raw
    # codes out of BOTH outbox and inbox. A database-only reader cannot recover
    # them. Only the authenticated recipient's presentation resolves this value.
    digest = salted_hmac(
        "fulfillment.delivery-code.v1", str(challenge.pk), algorithm="sha256"
    ).hexdigest()
    return str(int(digest, 16) % 1_000_000).zfill(6)


def code_digest(challenge, code):
    return salted_hmac(
        "fulfillment.delivery-verifier.v1", f"{challenge.pk}:{code}", algorithm="sha256"
    ).hexdigest()


@transaction.atomic
def configure_policy(*, actor, data, reason):
    actor = locked_actor(actor)
    require_owner(actor)
    required_reason(reason)
    policy, _ = DeliveryPolicy.objects.get_or_create(pk=1)
    policy = DeliveryPolicy.objects.select_for_update().get(pk=1)
    before = {field: getattr(policy, field) for field in data}
    for field, value in data.items():
        setattr(policy, field, value)
    policy.full_clean()
    policy.save()
    from marketplace.operations.models import PolicyVersion

    PolicyVersion.objects.create(
        scope="delivery",
        actor=actor,
        reason=reason,
        values={
            field: getattr(policy, field)
            for field in ["ttl_seconds", "max_attempts", "cooldown_seconds", "hourly_limit"]
        },
    )
    # AuditEvent identifies UUID aggregates; use the responsible owner for this singleton.
    audit(
        actor=actor,
        action="delivery.policy_changed",
        target=actor,
        reason=reason,
        before=before,
        after=data,
    )
    return policy


@transaction.atomic
def issue_link(*, actor, shipment_id, reason):
    actor, order, request, shipment = shipment_order_lock(actor, shipment_id, operator=True)
    required_reason(reason)
    if shipment.status not in DELIVERABLE:
        raise Conflict("لینک فقط پس از تحویل به حمل‌کننده و پیش از نتیجهٔ تحویل صادر می‌شود.")
    invalidate_delivery(shipment)
    raw = secrets.token_urlsafe(32)
    expires = timezone.now() + timedelta(hours=24)
    DeliveryLink.objects.update_or_create(
        shipment=shipment,
        defaults={
            "token_digest": token_digest(raw),
            "expires_at": expires,
            "revoked_at": None,
        },
    )
    record_event(
        request,
        actor,
        "delivery.link_issued",
        shipment=shipment,
        reason=reason,
        after={"expires_at": expires.isoformat()},
    )
    # Fragment stays out of server access logs. The agent UI submits it in JSON bodies.
    return {"token": raw, "link": f"/delivery#token={raw}", "expires_at": expires}


@transaction.atomic
def revoke_link(*, actor, shipment_id, reason):
    actor, order, request, shipment = shipment_order_lock(actor, shipment_id, operator=True)
    required_reason(reason)
    invalidate_delivery(shipment)
    record_event(request, actor, "delivery.link_revoked", shipment=shipment, reason=reason)


def lock_link(raw):
    link = get_object_or_404(
        DeliveryLink.objects.select_related("shipment__request__group"),
        token_digest=token_digest(raw),
    )
    order = Order.objects.select_for_update().get(pk=link.shipment.request.group.order_id)
    link = DeliveryLink.objects.select_related("shipment__request__group").get(pk=link.pk)
    if (
        link.shipment.purpose != "order"
        or link.revoked_at
        or link.expires_at <= timezone.now()
        or link.shipment.status not in DELIVERABLE
        or order.status != "active"
    ):
        raise NotFound("لینک معتبر نیست یا منقضی شده است.")
    return order, link.shipment


@transaction.atomic
def link_info(*, token):
    order, shipment = lock_link(token)
    return {
        "shipment": str(shipment.pk),
        "service_name": shipment.request.group.snapshot["service_name"],
    }


@transaction.atomic
def request_code(*, token):
    order, shipment = lock_link(token)
    now = timezone.now()
    policy = DeliveryPolicy.objects.filter(pk=1).first() or DeliveryPolicy()
    last = shipment.challenges.order_by("-created_at").first()
    if last and (now - last.created_at).total_seconds() < policy.cooldown_seconds:
        raise Throttled(wait=policy.cooldown_seconds - (now - last.created_at).total_seconds())
    if (
        shipment.challenges.filter(created_at__gt=now - timedelta(hours=1)).count()
        >= policy.hourly_limit
    ):
        raise Throttled(wait=3600)
    shipment.challenges.filter(consumed_at__isnull=True).update(consumed_at=now)
    challenge = DeliveryChallenge(
        shipment=shipment,
        recipient=order.retailer.membership.user,
        expires_at=now + timedelta(seconds=policy.ttl_seconds),
        max_attempts=policy.max_attempts,
    )
    challenge.code_digest = code_digest(challenge, challenge_code(challenge))
    challenge.save()
    notify(
        recipient=challenge.recipient,
        topic="delivery.code",
        payload={
            "challenge": str(challenge.pk),
            "shipment": str(shipment.pk),
            "expires_at": challenge.expires_at.isoformat(),
            "message": "کد را فقط پس از دریافت فیزیکی بسته به مأمور اعلام کنید؛ حق اعلام مغایرت محفوظ است.",
        },
    )
    record_event(
        shipment.request,
        None,
        "delivery.code_requested",
        shipment=shipment,
        actor_kind="delivery_agent",
    )


def verify_code(*, token, code):
    # Raise invalid-code errors AFTER committing the attempt counter. An atomic
    # API/ATOMIC_REQUESTS wrapper would undo brute-force protection and is forbidden.
    valid = False
    with transaction.atomic():
        order, shipment = lock_link(token)
        challenge = shipment.challenges.filter(consumed_at__isnull=True).first()
        now = timezone.now()
        if challenge and challenge.expires_at > now and challenge.attempts < challenge.max_attempts:
            valid = constant_time_compare(challenge.code_digest, code_digest(challenge, code))
            if valid:
                challenge.consumed_at = now
            else:
                challenge.attempts += 1
                if challenge.attempts >= challenge.max_attempts:
                    challenge.consumed_at = now
            challenge.save(update_fields=["attempts", "consumed_at", "updated_at"])
            record_event(
                shipment.request,
                None,
                "delivery.code_checked",
                shipment=shipment,
                actor_kind="delivery_agent",
                after={"accepted": valid},
            )
            if valid:
                transition(shipment, "delivered", actor=None, actor_kind="delivery_agent")
                refresh_fulfillment(order)
        elif challenge:
            challenge.consumed_at = now
            challenge.save(update_fields=["consumed_at", "updated_at"])
    if not valid:
        raise ValidationError("کد معتبر نیست یا منقضی شده است.")


@transaction.atomic
def unconfirmed_delivery(*, token, reason):
    order, shipment = lock_link(token)
    required_reason(reason)
    transition(shipment, "unconfirmed", actor=None, actor_kind="delivery_agent", reason=reason)
    refresh_fulfillment(order)


def recipient_payload(notification):
    """Only InboxView, scoped to request.user, may resolve notification contents."""
    data = dict(notification.payload)
    if notification.topic != "delivery.code":
        return data
    challenge = (
        DeliveryChallenge.objects.select_related("shipment")
        .filter(
            pk=data["challenge"],
            recipient_id=notification.recipient_id,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .first()
    )
    if challenge and challenge.shipment.status in DELIVERABLE:
        link = DeliveryLink.objects.filter(
            shipment=challenge.shipment, revoked_at__isnull=True, expires_at__gt=timezone.now()
        ).first()
        if link and constant_time_compare(
            challenge.code_digest, code_digest(challenge, challenge_code(challenge))
        ):
            data["code"] = challenge_code(challenge)
    return data
