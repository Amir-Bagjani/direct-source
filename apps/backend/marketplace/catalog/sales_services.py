from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from marketplace.common.exceptions import Conflict
from marketplace.logistics.services import coverage, lock_services
from marketplace.operations.services import audit

from .models import (
    FixedPack,
    PackItem,
    PriceTier,
    Product,
    SalesPlan,
    Variant,
    VariantPrice,
    VariantSupply,
)
from .services import locked_actor, producer, snapshot


def locked_product(actor, product_id):
    actor = locked_actor(actor)
    reference = get_object_or_404(Product, pk=product_id, business__membership__user=actor)
    producer(actor, reference.business_id)
    lock_services()
    product = Product.objects.select_for_update().get(pk=product_id)
    if product.status not in ["draft", "changes_requested", "published", "inactive"]:
        raise Conflict("این فرمان فعلاً فقط برای پیش‌نویس مجاز است.")
    return actor, product


def check_published_supply(actor, product):
    if product.status == "published" and not coverage(product):
        from .publication import set_status

        set_status(
            product, actor, "inactive", "supply_unavailable", "عرضه یا حمل انتخاب معتبر ندارد."
        )


def unique_variants(items, variants):
    ids = [row["variant"] for row in items]
    if len(ids) != len(set(ids)) or set(ids) - variants.keys():
        raise ValidationError("تنوع تکراری یا متعلق به محصول دیگر مجاز نیست.")


def plan_data(plan, variants):
    tiers = list(plan.tiers.prefetch_related("overrides"))
    result = []
    for index, tier in enumerate(tiers):
        overrides = {row.variant_id: row.unit_price_irr for row in tier.overrides.all()}
        result.append(
            {
                "min_quantity": tier.min_quantity,
                "max_quantity": tiers[index + 1].min_quantity - 1
                if index + 1 < len(tiers)
                else None,
                "unit_price_irr": tier.unit_price_irr,
                "overrides": [
                    {"variant": str(pk), "unit_price_irr": price}
                    for pk, price in overrides.items()
                    if pk in variants
                ],
                "effective_prices": [
                    {"variant": str(pk), "unit_price_irr": overrides.get(pk, tier.unit_price_irr)}
                    for pk in variants
                ],
            }
        )
    return {
        "currency": "IRR",
        "free_mix_min": plan.free_mix_min,
        "packs": [
            {
                "code": pack.code,
                "name": pack.name,
                "items": [
                    {"variant": str(item.variant_id), "quantity": item.quantity}
                    for item in pack.items.all()
                ],
            }
            for pack in plan.packs.prefetch_related("items")
            if all(item.variant_id in variants for item in pack.items.all())
        ],
        "tiers": result,
    }


@transaction.atomic
def read_plan(*, actor, product_id):
    _, product = locked_product(actor, product_id)
    plan = get_object_or_404(SalesPlan, product=product)
    return plan_data(plan, dict(product.variants.filter(is_active=True).values_list("id", "sku")))


def validate_plan(variants, data):
    if not variants:
        raise ValidationError("ابتدا حداقل یک تنوع بسازید.")
    minima = [data["free_mix_min"]] if data["free_mix_min"] else []
    codes = [pack["code"] for pack in data["packs"]]
    if len(codes) != len(set(codes)):
        raise ValidationError({"packs": "کد بسته تکراری است."})
    for pack in data["packs"]:
        unique_variants(pack["items"], variants)
        total = sum(item["quantity"] for item in pack["items"])
        if total > 1_000_000_000:
            raise ValidationError({"packs": "تعداد واحدهای بسته بیش از حد مجاز است."})
        minima.append(total)
    if not minima:
        raise ValidationError("حداقل یک روش فروش لازم است.")
    tiers = data["tiers"]
    starts = [tier["min_quantity"] for tier in tiers]
    if starts[0] != min(minima) or starts != sorted(set(starts)):
        raise ValidationError(
            {"tiers": "شروع پله‌ها باید صعودی، یکتا و از کمترین تعداد قابل سفارش باشد."}
        )
    previous_default = None
    previous: dict = {}
    for tier in tiers:
        unique_variants(tier["overrides"], variants)
        default = tier["unit_price_irr"]
        overrides = {row["variant"]: row["unit_price_irr"] for row in tier["overrides"]}
        effective = {pk: overrides.get(pk, default) for pk in variants}
        if (previous_default is not None and default > previous_default) or any(
            price > previous[pk] for pk, price in effective.items() if pk in previous
        ):
            raise ValidationError(
                {"tiers": "قیمت پیش‌فرض و قیمت نهایی هر تنوع نباید با تعداد افزایش یابد."}
            )
        previous_default, previous = default, effective


@transaction.atomic
def save_plan(*, actor, product_id, data):
    actor, product = locked_product(actor, product_id)
    variants = dict(product.variants.filter(is_active=True).values_list("id", "sku"))
    validate_plan(variants, data)
    plan = SalesPlan.objects.filter(product=product).first()
    before = plan_data(plan, variants) if plan else {}
    if plan:
        plan.packs.all().delete()
        plan.tiers.all().delete()
        plan.free_mix_min = data["free_mix_min"]
        plan.save()
    else:
        plan = SalesPlan.objects.create(product=product, free_mix_min=data["free_mix_min"])
    for pack_data in data["packs"]:
        pack = FixedPack.objects.create(plan=plan, code=pack_data["code"], name=pack_data["name"])
        PackItem.objects.bulk_create(
            [
                PackItem(pack=pack, variant_id=item["variant"], quantity=item["quantity"])
                for item in pack_data["items"]
            ]
        )
    for tier_data in data["tiers"]:
        tier = PriceTier.objects.create(
            plan=plan,
            min_quantity=tier_data["min_quantity"],
            unit_price_irr=tier_data["unit_price_irr"],
        )
        VariantPrice.objects.bulk_create(
            [
                VariantPrice(
                    tier=tier, variant_id=item["variant"], unit_price_irr=item["unit_price_irr"]
                )
                for item in tier_data["overrides"]
            ]
        )
    after = plan_data(plan, variants)
    audit(
        actor=actor, action="catalog.sales_plan_saved", target=product, before=before, after=after
    )
    check_published_supply(actor, product)
    return after


@transaction.atomic
def save_supply(*, actor, product_id, pk, data):
    actor, product = locked_product(actor, product_id)
    variant = get_object_or_404(Variant, pk=pk, product=product)
    supply = VariantSupply.objects.filter(variant=variant).first()
    before = snapshot(supply) if supply else {}
    supply = supply or VariantSupply(variant=variant)
    for key, value in data.items():
        setattr(supply, key, value)
    supply.full_clean()
    from marketplace.orders.inventory import validate_supply

    validate_supply(supply)
    supply.save()
    audit(
        actor=actor,
        action="catalog.supply_saved",
        target=variant,
        before=before,
        after=snapshot(supply),
    )
    check_published_supply(actor, product)
    return {
        key: getattr(supply, key)
        for key in ["mode", "ready_stock", "production_cap", "lead_time_days"]
    }


@transaction.atomic
def read_supply(*, actor, product_id, pk):
    _, product = locked_product(actor, product_id)
    supply = get_object_or_404(VariantSupply, variant_id=pk, variant__product=product)
    return {
        key: getattr(supply, key)
        for key in ["mode", "ready_stock", "production_cap", "lead_time_days"]
    }


@transaction.atomic
def quote(*, actor, product_id, data):
    _, product = locked_product(actor, product_id)
    return quote_product(product=product, data=data)


def quote_product(*, product, data):
    """Current commercial estimate; caller owns authorization and transaction locks."""
    plan = get_object_or_404(SalesPlan, product=product)
    variants = {
        variant.pk: variant
        for variant in product.variants.filter(is_active=True).select_related("supply")
    }
    if data["method"] == "free_mix":
        if (
            not plan.free_mix_min
            or not data.get("items")
            or "pack_code" in data
            or "pack_count" in data
        ):
            raise ValidationError("ترکیب آزاد فعال و اقلام آن لازم است؛ اطلاعات بسته نفرستید.")
        unique_variants(data["items"], variants)
        quantities = {item["variant"]: item["quantity"] for item in data["items"]}
        if sum(quantities.values()) < plan.free_mix_min:
            raise ValidationError("حداقل ترکیب آزاد رعایت نشده است.")
    else:
        if "items" in data or not data.get("pack_code") or not data.get("pack_count"):
            raise ValidationError("کد و تعداد صحیح بسته لازم است؛ اقلام آزاد نفرستید.")
        pack = get_object_or_404(FixedPack, plan=plan, code=data["pack_code"])
        quantities = {
            item.variant_id: item.quantity * data["pack_count"] for item in pack.items.all()
        }
    if set(quantities) - variants.keys():
        raise Conflict("بسته شامل تنوع غیرفعال است.")
    quantity = sum(quantities.values())
    if quantity > 1_000_000_000:
        raise ValidationError("تعداد کل بیش از حد مجاز است.")
    tier = plan.tiers.filter(min_quantity__lte=quantity).order_by("-min_quantity").first()
    if not tier:
        raise Conflict("برنامهٔ قیمت کامل نیست.")
    overrides = dict(tier.overrides.values_list("variant_id", "unit_price_irr"))
    lines = []
    for pk, count in quantities.items():
        variant = variants[pk]
        supply = getattr(variant, "supply", None)
        from marketplace.orders.inventory import available_supply

        ready_stock, production_cap = available_supply(supply) if supply else (0, 0)
        if supply is None or count > ready_stock + production_cap:
            raise Conflict("عرضهٔ یک یا چند تنوع کافی نیست.")
        ready = min(count, ready_stock)
        production = count - ready
        price = overrides.get(pk, tier.unit_price_irr)
        lines.append(
            {
                "variant": str(pk),
                "sku": variant.sku,
                "quantity": count,
                "unit_price_irr": price,
                "total_irr": price * count,
                "from_ready": ready,
                "from_production": production,
                "lead_time_days": supply.lead_time_days if production else 0,
            }
        )
    total = sum(line["total_irr"] for line in lines)
    if total > 2**63 - 1:
        raise ValidationError("مبلغ کل بیش از حد مجاز است.")
    return {
        "currency": "IRR",
        "quantity": quantity,
        "tier_min_quantity": tier.min_quantity,
        "goods_total_irr": total,
        "lead_time_days": max(line["lead_time_days"] for line in lines),
        "lines": lines,
    }
