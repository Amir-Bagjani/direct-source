from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from marketplace.accounts.models import Business, User
from marketplace.accounts.permissions import has_role, require_operator, require_owner
from marketplace.common.exceptions import Conflict
from marketplace.logistics.services import lock_services
from marketplace.operations.services import audit

from .models import Category, Product, ProductRevision, Variant
from .publication import validate_publication
from .sales_services import check_published_supply
from .services import locked_actor, producer, snapshot


@transaction.atomic
def variant_status(*, actor, product_id, pk, enabled, reason):
    actor = locked_actor(actor)
    if not reason.strip():
        raise ValidationError("دلیل الزامی است.")
    reference = get_object_or_404(Product, pk=product_id)
    if has_role(actor, "operator", "owner"):
        business = Business.objects.select_for_update().get(pk=reference.business_id)
    else:
        business = producer(actor, reference.business_id)
    category = Category.objects.select_for_update().get(pk=reference.category_id)
    lock_services()
    product = Product.objects.select_for_update().get(pk=product_id)
    product.business, product.category = business, category
    if product.published_at is None or product.status not in ["published", "inactive"]:
        raise Conflict("وضعیت مستقل فقط برای تنوع محصول قبلاً منتشرشده است.")
    variant = get_object_or_404(Variant.objects.select_for_update(), pk=pk, product=product)
    if variant.is_active == enabled:
        raise Conflict("تنوع از قبل در همین وضعیت است.")
    before = snapshot(variant)
    if enabled:
        if variant.disabled_code == "operator_disabled":
            require_operator(actor)
        if variant.disabled_code not in ["producer_disabled", "operator_disabled"]:
            raise Conflict("تنوع حذف‌شده از محتوا فقط با بازنگری تازه قابل جایگزینی است.")
        supply = getattr(variant, "supply", None)
        if not supply or supply.ready_stock + supply.production_cap <= 0:
            raise ValidationError("عرضهٔ مثبت لازم است.")
        variant.disabled_code = ""
    else:
        variant.disabled_code = (
            "operator_disabled" if has_role(actor, "operator", "owner") else "producer_disabled"
        )
    variant.is_active, variant.status_reason = enabled, reason
    variant.full_clean()
    variant.save()
    if enabled:
        validate_publication(product)
    else:
        check_published_supply(actor, product)
    audit(
        actor=actor,
        action="catalog.variant_status_changed",
        target=variant,
        reason=reason,
        before=before,
        after=snapshot(variant),
    )
    return variant


@transaction.atomic
def delete_product(*, actor, pk, confirm):
    actor = locked_actor(actor)
    reference = get_object_or_404(Product, pk=pk, business__membership__user=actor)
    producer(actor, reference.business_id)
    product = Product.objects.select_for_update().get(pk=pk)
    if confirm is not True:
        raise ValidationError({"confirm": "تأیید دوبارهٔ حذف لازم است."})
    if (
        product.status != "draft"
        or product.submitted_at
        or product.published_at
        or product.revisions.exists()
    ):
        raise Conflict("فقط پیش‌نویسی که هرگز ارسال نشده قابل حذف است.")
    audit(
        actor=actor,
        action="catalog.product_deleted",
        target=product,
        before=snapshot(product),
        reason="تأیید صریح تولیدکننده",
    )
    # Remove internal PROTECT references before cascading variants. Files retain their own lifecycle.
    if hasattr(product, "sales_plan"):
        product.sales_plan.delete()
    product.delete()


@transaction.atomic
def reassign(*, actor, pk, user_id, reason, revision=False):
    users = {
        u.pk: u
        for u in User.objects.select_for_update().filter(pk__in=[actor.pk, user_id]).order_by("pk")
    }
    actor = users[actor.pk]
    require_owner(actor)
    target = users.get(user_id)
    if not reason.strip() or target is None or not has_role(target, "operator", "owner"):
        raise ValidationError("دلیل و مسئول فعال دارای نقش پلتفرمی لازم است.")
    model: type[Product] | type[ProductRevision] = ProductRevision if revision else Product
    if revision:
        reference = get_object_or_404(ProductRevision, pk=pk)
        product_id, business_id = reference.product_id, reference.product.business_id
    else:
        product_ref = get_object_or_404(Product, pk=pk)
        product_id, business_id = product_ref.pk, product_ref.business_id
    Business.objects.select_for_update().get(pk=business_id)
    Product.objects.select_for_update().get(pk=product_id)
    obj = model.objects.select_for_update().get(pk=pk)
    if obj.status != "pending":
        raise Conflict("فقط پروندهٔ در انتظار بررسی قابل بازتخصیص است.")
    before = str(obj.assigned_to_id) if obj.assigned_to_id else None
    obj.assigned_to = target
    obj.save(update_fields=["assigned_to", "updated_at"])
    audit(
        actor=actor,
        action="catalog.review_reassigned",
        target=obj,
        reason=reason,
        before={"assigned_to": before},
        after={"assigned_to": str(target.pk)},
    )
    return obj


def release_reviews(*, actor, target, reason):
    """Called in the role command transaction after locking the target user."""
    business_ids = set(
        Product.objects.filter(assigned_to=target, status="pending").values_list(
            "business_id", flat=True
        )
    )
    business_ids.update(
        ProductRevision.objects.filter(assigned_to=target, status="pending").values_list(
            "product__business_id", flat=True
        )
    )
    list(Business.objects.select_for_update().filter(pk__in=business_ids).order_by("pk"))
    list(Product.objects.select_for_update().filter(business_id__in=business_ids).order_by("pk"))
    models: list[type[Product] | type[ProductRevision]] = [Product, ProductRevision]
    for model in models:
        for obj in (
            model.objects.select_for_update()
            .filter(assigned_to=target, status="pending")
            .order_by("pk")
        ):
            obj.assigned_to = None
            obj.save(update_fields=["assigned_to", "updated_at"])
            audit(
                actor=actor,
                action="catalog.review_released",
                target=obj,
                reason=reason,
                before={"assigned_to": str(target.pk)},
                after={"assigned_to": None},
            )
