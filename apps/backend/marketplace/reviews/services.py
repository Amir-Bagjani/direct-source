"""Review commands serialize on Order; public projections never expose private authorship."""

from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Avg, Count, FloatField, Q
from django.db.models.functions import Cast
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from marketplace.accounts.permissions import active_user, has_role, require_operator
from marketplace.catalog.services import locked_actor
from marketplace.common.exceptions import Conflict
from marketplace.finance.services import digest, lock_order, required_reason
from marketplace.operations.files import upload_document
from marketplace.operations.models import AuditEvent, StoredFile
from marketplace.operations.services import audit
from marketplace.orders.models import Order

from .models import (
    ACTIONS,
    CRITERIA,
    Entitlement,
    ModerationAction,
    Reply,
    Report,
    Review,
    ReviewImage,
)


@transaction.atomic
def create_entitlements(*, order_id):
    # Entitlement inserts reference both businesses: retain Finance's lock order
    # so a backfill cannot deadlock against a concurrent settlement retry.
    order = lock_order(order_id)
    settlement = order.financial_events.filter(kind="settlement").first()
    case = getattr(order, "discrepancy", None)
    now = timezone.now()
    if (
        order.status != "completed"
        or not order.completed_at
        or not settlement
        or not order.delivered_at
        or not order.discrepancy_deadline
        or (case and case.closed_at is None)
        or (not case and now < order.discrepancy_deadline)
    ):
        return []
    deadline = order.completed_at + timedelta(days=settings.REVIEW_WINDOW_DAYS)
    subjects: list[tuple[str, UUID, UUID, UUID | None, list[str]]] = [
        ("manufacturer", order.retailer_id, order.manufacturer_id, None, []),
        ("retailer", order.manufacturer_id, order.retailer_id, None, []),
    ]
    products: dict[UUID, list[str]] = {}
    for line in order.lines.select_related("variant").order_by("variant_id"):
        products.setdefault(line.variant.product_id, []).append(str(line.variant_id))
    subjects.extend(
        ("product", order.retailer_id, order.manufacturer_id, pk, variants)
        for pk, variants in products.items()
    )
    rows = []
    for topic, author, recipient, product, variants in subjects:
        row, created = Entitlement.objects.get_or_create(
            order=order,
            author_id=author,
            recipient_id=recipient,
            topic=topic,
            product_id=product,
            defaults={
                "deadline": deadline,
                "variants": variants,
                "execution_mode": settlement.execution_mode,
            },
        )
        if created:
            audit(
                actor=None,
                action="reviews.entitled",
                target=row,
                after={"order": str(order.pk), "topic": topic, "deadline": deadline.isoformat()},
            )
        rows.append(row)
    return rows


def own_rights(actor):
    if not active_user(actor):
        return Entitlement.objects.none()
    return Entitlement.objects.filter(
        author__membership__user=actor, author__status="verified"
    ).filter(Q(execution_mode="live") | Q(author__controlled_access=True))


def lock_right(actor, pk):
    locked_actor(actor)
    ref = get_object_or_404(own_rights(actor), pk=pk)
    Order.objects.select_for_update().get(pk=ref.order_id)
    return Entitlement.objects.select_related("author", "recipient").get(pk=pk)


def editable(right):
    if right.expired_at or timezone.now() >= right.deadline:
        raise Conflict("مهلت ثبت نظر پایان یافته است.")
    if Review.objects.filter(entitlement=right, submitted_at__isnull=False).exists():
        raise Conflict("نظر ارسال‌شده قابل تغییر نیست.")


def publish(order_id, now):
    """Caller holds the Order lock. Publish both directions with one UPDATE timestamp."""
    rights = Entitlement.objects.filter(order_id=order_id)
    collaboration = Review.objects.filter(
        entitlement__in=rights.exclude(topic="product"), submitted_at__isnull=False
    )
    deadline = rights.values_list("deadline", flat=True).first()
    if deadline and (now >= deadline or collaboration.count() == 2):
        for row in collaboration.filter(published_at__isnull=True):
            audit(
                actor=None,
                action="reviews.published",
                target=row,
                after={"published_at": now.isoformat()},
            )
        collaboration.filter(published_at__isnull=True).update(published_at=now)
    if deadline and now >= deadline:
        rights.filter(expired_at__isnull=True).exclude(review__submitted_at__isnull=False).update(
            expired_at=now
        )


@transaction.atomic
def expire_order(order_id):
    Order.objects.select_for_update().get(pk=order_id)
    publish(order_id, timezone.now())


def validate_scores(topic, scores, final):
    if not isinstance(scores, dict) or set(scores) - set(CRITERIA[topic]):
        raise ValidationError("معیارهای ارزیابی مجاز نیستند.")
    if final and set(scores) != set(CRITERIA[topic]):
        raise ValidationError("همهٔ امتیازهای لازم را ثبت کنید.")
    if any(type(value) is not int or not 1 <= value <= 5 for value in scores.values()):
        raise ValidationError("امتیاز باید عدد صحیح بین ۱ تا ۵ باشد.")


def validated_images(actor, right, images):
    keys = list(map(str, images))
    if right.topic != "product" and keys:
        raise ValidationError("تصویر فقط برای نظر محصول مجاز است.")
    if len(keys) > 10 or len(set(keys)) != len(keys):
        raise ValidationError("حداکثر ۱۰ تصویر غیرتکراری مجاز است.")
    files = StoredFile.objects.filter(
        pk__in=keys,
        owner=actor,
        purpose="review_image",
        scan_status="clean",
        deleted_at__isnull=True,
        content_type__in=["image/jpeg", "image/png", "image/webp"],
        review_scope__entitlement=right,
    )
    if files.count() != len(keys):
        raise NotFound("تصویر مجاز یافت نشد.")
    return keys


@transaction.atomic
def save_review(*, actor, pk, scores, text="", images=(), submit=False):
    right = lock_right(actor, pk)
    editable(right)
    validate_scores(right.topic, scores, submit)
    if not isinstance(text, str) or len(text) > 8000:
        raise ValidationError("متن نظر معتبر نیست.")
    keys = validated_images(actor, right, images)
    row, _ = Review.objects.get_or_create(entitlement=right, defaults={"actor": actor})
    row.actor, row.scores, row.text, row.images = actor, scores, text, keys
    if submit:
        row.submitted_at = timezone.now()
        if right.topic == "product":
            row.published_at = row.submitted_at
    row.save()
    audit(actor=actor, action="reviews.submitted" if submit else "reviews.drafted", target=row)
    if submit:
        publish(right.order_id, row.submitted_at)
        row.refresh_from_db()
    return own_data(right, row)


def review_data(row):
    right = row.entitlement
    reply = getattr(row, "reply", None)
    return {
        "id": str(row.pk),
        "topic": right.topic,
        "product": str(right.product_id) if right.product_id else None,
        "variants": right.variants,
        "author_label": "خریدار تأییدشده" if right.topic == "product" else right.author.name,
        "scores": row.scores,
        "text": "" if row.content_hidden else row.text,
        "images": [] if row.content_hidden else row.images,
        "content_hidden": row.content_hidden,
        "published_at": row.published_at,
        "reply": {
            "id": str(reply.pk),
            "text": "" if reply.content_hidden else reply.text,
            "content_hidden": reply.content_hidden,
            "author_label": right.recipient.name,
            "submitted_at": reply.submitted_at,
        }
        if reply and reply.submitted_at
        else None,
    }


def own_data(right, row=None):
    row = row or getattr(right, "review", None)
    state = (
        "submitted"
        if row and row.submitted_at
        else "expired"
        if right.expired_at or timezone.now() >= right.deadline
        else "available"
    )
    return {
        "id": str(right.pk),
        "order": str(right.order_id),
        "topic": right.topic,
        "product": str(right.product_id) if right.product_id else None,
        "recipient": str(right.recipient_id),
        "variants": right.variants,
        "deadline": right.deadline,
        "state": state,
        "review": {
            "id": str(row.pk),
            "scores": row.scores,
            "text": row.text,
            "images": row.images,
            "submitted_at": row.submitted_at,
            "published_at": row.published_at,
        }
        if row
        else None,
    }


def visible_reviews(actor=None, internal=False):
    query = Review.objects.filter(
        published_at__isnull=False, invalidated=False, entitlement__expired_at__isnull=True
    ).select_related("entitlement__author", "entitlement__recipient", "reply")
    if not internal:
        return query.filter(entitlement__execution_mode="live")
    if not active_user(actor):
        return query.none()
    if has_role(actor, "operator", "owner"):
        return query.filter(entitlement__execution_mode="simulated")
    return query.filter(entitlement__execution_mode="simulated").filter(
        Q(
            entitlement__author__membership__user=actor,
            entitlement__author__controlled_access=True,
            entitlement__author__status="verified",
        )
        | Q(
            entitlement__recipient__membership__user=actor,
            entitlement__recipient__controlled_access=True,
            entitlement__recipient__status="verified",
        )
    )


def visible_to_actor(actor):
    public = visible_reviews(actor)
    internal = visible_reviews(actor, True)
    return Review.objects.filter(
        Q(pk__in=public.values("pk")) | Q(pk__in=internal.values("pk"))
    ).select_related("entitlement__author", "entitlement__recipient", "reply")


@transaction.atomic
def save_reply(*, actor, pk, text, submit=False):
    locked_actor(actor)
    ref = get_object_or_404(visible_to_actor(actor), pk=pk)
    Order.objects.select_for_update().get(pk=ref.entitlement.order_id)
    row = get_object_or_404(visible_to_actor(actor), pk=pk)
    if (
        row.entitlement.recipient.membership.user_id != actor.pk
        or row.entitlement.recipient.status == "suspended"
    ):
        raise PermissionDenied()
    if not isinstance(text, str) or not text.strip() or len(text) > 8000:
        raise ValidationError("متن پاسخ لازم است؛ حداکثر ۸۰۰۰ نویسه.")
    reply, _ = Reply.objects.get_or_create(review=row, defaults={"actor": actor, "text": text})
    if reply.submitted_at:
        raise Conflict("پاسخ ارسال‌شده قابل تغییر نیست.")
    reply.text, reply.actor = text, actor
    if submit:
        reply.submitted_at = timezone.now()
    reply.save()
    audit(
        actor=actor,
        action="reviews.reply_submitted" if submit else "reviews.reply_drafted",
        target=reply,
    )
    return {"id": str(reply.pk), "text": reply.text, "submitted_at": reply.submitted_at}


@transaction.atomic
def report(*, actor, pk, reason, reply_id=None):
    locked_actor(actor)
    row = get_object_or_404(visible_to_actor(actor), pk=pk)
    Order.objects.select_for_update().get(pk=row.entitlement.order_id)
    row = get_object_or_404(visible_to_actor(actor), pk=pk)
    required_reason(reason)
    reply = (
        get_object_or_404(Reply, pk=reply_id, review=row, submitted_at__isnull=False)
        if reply_id
        else None
    )
    item, created = Report.objects.get_or_create(
        review=row, reply=reply, actor=actor, defaults={"reason": reason}
    )
    if created:
        audit(actor=actor, action="reviews.reported", target=item, reason=reason)
    return report_data(item)


def report_data(item):
    return {
        "id": str(item.pk),
        "review": str(item.review_id),
        "reply": str(item.reply_id) if item.reply_id else None,
        "reason": item.reason,
        "created_at": item.created_at,
        "resolved_at": item.resolved_at,
    }


@transaction.atomic
def moderate(*, actor, pk, action, reason, idempotency_key):
    locked_actor(actor)
    require_operator(actor)
    required_reason(reason)
    if action not in ACTIONS:
        raise ValidationError("اقدام نظارتی معتبر نیست.")
    item = get_object_or_404(Report, pk=pk)
    Order.objects.select_for_update().get(pk=item.review.entitlement.order_id)
    item = Report.objects.select_related("review", "reply").get(pk=pk)
    payload = digest(
        {"report": str(pk), "actor": str(actor.pk), "action": action, "reason": reason}
    )
    previous = ModerationAction.objects.filter(command_key=idempotency_key).first()
    if previous:
        if previous.request_hash != payload:
            raise Conflict("کلید اقدام با درخواست پیشین متفاوت است.")
        return {
            "id": str(previous.pk),
            "action": previous.action,
            "before": previous.before,
            "after": previous.after,
        }
    target = item.reply or item.review
    if item.reply and action in ["invalidate", "revalidate"]:
        raise ValidationError("برای پاسخ فقط نظارت بر محتوا مجاز است.")
    before = {"content_hidden": target.content_hidden}
    if not item.reply:
        before["invalidated"] = item.review.invalidated
    if action in ["hide_content", "unhide_content"]:
        target.content_hidden = action == "hide_content"
    if action in ["invalidate", "revalidate"]:
        item.review.invalidated = action == "invalidate"
    after = {key: getattr(target, key) for key in before}
    target.save(update_fields=[*before, "updated_at"])
    item.resolved_at = timezone.now()
    item.save(update_fields=["resolved_at", "updated_at"])
    event = ModerationAction.objects.create(
        report=item,
        actor=actor,
        action=action,
        reason=reason,
        before=before,
        after=after,
        command_key=idempotency_key,
        request_hash=payload,
    )
    audit(
        actor=actor,
        action="reviews." + action,
        target=target,
        reason=reason,
        before=before,
        after=after,
    )
    return {"id": str(event.pk), "action": action, "before": before, "after": after}


def aggregate(query):
    # Separate topics because the two collaboration directions have different criteria.
    result = {}
    for topic, criteria in CRITERIA.items():
        values = query.filter(entitlement__topic=topic).aggregate(
            count=Count("pk"),
            **{key: Avg(Cast("scores__" + key, FloatField())) for key in criteria},
        )
        result[topic] = {
            "count": values["count"],
            "message": "هنوز امتیازی ندارد" if not values["count"] else "",
            "criteria": {key: {"mean": values[key], "count": values["count"]} for key in criteria},
        }
    return result


@transaction.atomic
def audit_detail(*, actor, pk):
    locked_actor(actor)
    require_operator(actor)
    row = get_object_or_404(Review.objects.select_related("entitlement", "reply"), pk=pk)
    audit(actor=actor, action="reviews.audit_read", target=row)
    reply = getattr(row, "reply", None)
    return {
        "review": own_data(row.entitlement, row),
        "actor": str(row.actor_id),
        "author": str(row.entitlement.author_id),
        "execution_mode": row.entitlement.execution_mode,
        "reply": {
            "actor": str(reply.actor_id),
            "text": reply.text,
            "submitted_at": reply.submitted_at,
        }
        if reply
        else None,
        "history": list(
            AuditEvent.objects.filter(
                Q(aggregate_id=row.pk) | Q(aggregate_id=reply.pk if reply else row.pk)
            )
            .order_by("created_at", "pk")
            .values("action", "reason", "actor_id", "before", "after", "created_at")
        ),
    }


def upload_image(*, actor, pk, uploaded, consent):
    with transaction.atomic():
        right = lock_right(actor, pk)
        editable(right)
        if right.topic != "product" or uploaded.content_type not in [
            "image/jpeg",
            "image/png",
            "image/webp",
        ]:
            raise ValidationError("تصویر نظر محصول لازم است.")
    file = upload_document(
        actor=actor, business=right.author, purpose="review_image", consent=consent, upload=uploaded
    )
    with transaction.atomic():
        right = lock_right(actor, pk)
        editable(right)
        ReviewImage.objects.create(entitlement=right, file=file)
    return file


def image_url(*, actor, pk, file_id, internal=False):
    row = get_object_or_404(visible_reviews(actor, internal), pk=pk, content_hidden=False)
    if str(file_id) not in row.images:
        raise NotFound()
    file = get_object_or_404(
        StoredFile,
        pk=file_id,
        scan_status="clean",
        deleted_at__isnull=True,
        review_scope__entitlement=row.entitlement,
    )
    return {"url": default_storage.url(file.object_key)}
