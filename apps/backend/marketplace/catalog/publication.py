from django.core.exceptions import ValidationError as ModelValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.accounts.models import Business
from marketplace.accounts.permissions import has_role, require_operator
from marketplace.common.exceptions import Conflict
from marketplace.logistics.services import coverage, lock_services
from marketplace.operations.services import audit, notify

from .models import Category, Product
from .services import active_category, image_ids, locked_actor, producer, values_for


def set_status(product, actor, status, code, reason):
    before = product.status
    product.status, product.decision_code, product.decision_reason = status, code, reason
    product.save()
    audit(
        actor=actor,
        action="catalog.publication_transition",
        target=product,
        reason=reason,
        before={"status": before},
        after={"status": status, "code": code},
    )
    notify(
        recipient=product.business.membership.user,
        topic="catalog.publication",
        payload={"product_id": str(product.pk), "status": status, "code": code},
    )


def publication_checks(product):
    variants = list(product.variants.filter(is_active=True).select_related("supply", "package"))

    def business():
        if product.business.status != "verified":
            raise ValidationError("کسب‌وکار تولیدکننده باید تأییدشده باشد.")

    def content():
        active_category(product.category)
        values_for(product.category, "product", product.attributes, product.attributes)
        if not product.images:
            raise ValidationError("تصویر اصلی الزامی است.")
        image_ids(product.business, product.images, 8)

    def variant_content():
        if not variants:
            raise ValidationError("حداقل یک تنوع الزامی است.")
        for variant in variants:
            values_for(product.category, "variant", variant.attributes, variant.attributes)
            image_ids(product.business, variant.images, 3)

    def supply_and_packaging():
        if not variants:
            raise ValidationError("حداقل یک تنوع الزامی است.")
        for variant in variants:
            supply, package = getattr(variant, "supply", None), getattr(variant, "package", None)
            if supply is None or package is None:
                raise ValidationError("عرضه و مشخصات بستهٔ همهٔ تنوع‌ها لازم است.")
            supply.full_clean()
            package.full_clean()

    def pricing():
        plan = getattr(product, "sales_plan", None)
        if plan is None or not plan.tiers.exists():
            raise ValidationError("برنامهٔ قیمت لازم است.")
        from .sales_api import SalesPlanInput
        from .sales_services import plan_data, validate_plan

        active_variants = {v.pk: v.sku for v in variants}
        serializer = SalesPlanInput(data=plan_data(plan, active_variants))
        serializer.is_valid(raise_exception=True)
        validate_plan(active_variants, serializer.validated_data)

    def shipping():
        if not coverage(product):
            raise ValidationError("حداقل یک انتخاب قابل سفارش با پوشش معتبر تمام استان‌ها لازم است.")

    return [
        ("business", business),
        ("content", content),
        ("variants", variant_content),
        ("supply", supply_and_packaging),
        ("pricing", pricing),
        ("shipping", shipping),
    ]


def validate_publication(product):
    for _, check in publication_checks(product):
        check()


def publication_readiness(product):
    checks = []
    for code, check in publication_checks(product):
        try:
            check()
            passed = True
        except (ValidationError, ModelValidationError):
            passed = False
        checks.append({"code": code, "passed": passed})
    return {"ready": all(row["passed"] for row in checks), "checks": checks}


@transaction.atomic
def transition(*, actor, pk, action, decision="", reason="", code=""):
    actor = locked_actor(actor)
    if action == "submit" or (
        action in ["activate", "deactivate"] and not has_role(actor, "operator", "owner")
    ):
        reference = get_object_or_404(Product, pk=pk, business__membership__user=actor)
        business = producer(actor, reference.business_id)
    else:
        require_operator(actor)
        reference = get_object_or_404(Product, pk=pk)
        business = Business.objects.select_for_update().get(pk=reference.business_id)
    category = Category.objects.select_for_update().get(pk=reference.category_id)
    lock_services()
    product = Product.objects.select_for_update().get(pk=pk)
    product.business, product.category = business, category
    if action == "submit":
        if product.status not in ["draft", "changes_requested"]:
            raise Conflict()
        validate_publication(product)
        product.submitted_at = timezone.now()
        product.assigned_to = None
        set_status(product, actor, "pending", "submitted", "ارسال تولیدکننده")
    elif action == "claim":
        if product.status != "pending" or product.assigned_to_id not in [None, actor.pk]:
            raise Conflict("پرونده در اختیار مسئول دیگری است یا در صف نیست.")
        product.assigned_to = actor
        product.save()
        audit(
            actor=actor,
            action="catalog.product_claimed",
            target=product,
            after={"assigned_to": str(actor.pk)},
        )
    elif action == "review":
        if product.status != "pending":
            raise Conflict()
        if product.assigned_to_id != actor.pk:
            raise PermissionDenied("فقط مسئول پرونده حق تصمیم دارد.")
        if (
            decision not in ["published", "changes_requested", "rejected"]
            or not reason.strip()
            or not code.strip()
        ):
            raise ValidationError("تصمیم، کد دلیل و توضیح لازم است.")
        if decision == "published":
            validate_publication(product)
            product.published_at = timezone.now()
        set_status(product, actor, decision, code, reason)
    elif action == "reopen":
        if product.status != "rejected" or not reason.strip():
            raise Conflict()
        if product.assigned_to_id != actor.pk and not has_role(actor, "owner"):
            raise PermissionDenied()
        set_status(product, actor, "changes_requested", "reopened", reason)
    elif action == "deactivate":
        if product.status != "published" or not reason.strip():
            raise Conflict()
        source = (
            "operator_disabled" if has_role(actor, "operator", "owner") else "producer_disabled"
        )
        set_status(product, actor, "inactive", source, reason)
    elif action == "activate":
        if product.status != "inactive" or product.published_at is None or not reason.strip():
            raise Conflict()
        if product.decision_code == "operator_disabled":
            require_operator(actor)
        validate_publication(product)
        set_status(product, actor, "published", "reactivated", reason)
    return product
