from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from marketplace.accounts.models import Address
from marketplace.accounts.permissions import require_operator, require_owner
from marketplace.catalog.models import Product
from marketplace.catalog.services import locked_actor, producer, snapshot
from marketplace.common.exceptions import Conflict
from marketplace.operations.services import audit

from .models import ProductShipping, ShippingService, Tariff, VariantPackage

PROVINCES = (
    "آذربایجان شرقی",
    "آذربایجان غربی",
    "اردبیل",
    "اصفهان",
    "البرز",
    "ایلام",
    "بوشهر",
    "تهران",
    "چهارمحال و بختیاری",
    "خراسان جنوبی",
    "خراسان رضوی",
    "خراسان شمالی",
    "خوزستان",
    "زنجان",
    "سمنان",
    "سیستان و بلوچستان",
    "فارس",
    "قزوین",
    "قم",
    "کردستان",
    "کرمان",
    "کرمانشاه",
    "کهگیلویه و بویراحمد",
    "گلستان",
    "گیلان",
    "لرستان",
    "مازندران",
    "مرکزی",
    "هرمزگان",
    "همدان",
    "یزد",
)
ROUTE_FIELDS = [
    "scope",
    "origin_province",
    "destination_province",
    "origin_city",
    "destination_city",
]


def normalized(value):
    return " ".join(value.replace("ي", "ی").replace("ك", "ک").replace("\u200c", " ").split())


def province(value):
    value = normalized(value)
    if value not in PROVINCES:
        raise ValidationError("نام استان باید از فهرست استان‌های سامانه باشد.")
    return value


def lock_services():
    # ponytail: small managed service catalog; split locks by service when contention warrants it.
    return list(ShippingService.objects.select_for_update().order_by("id"))


@transaction.atomic
def save_service(*, actor, data, pk=None):
    actor = locked_actor(actor)
    require_operator(actor)
    lock_services()
    obj = get_object_or_404(ShippingService, pk=pk) if pk else ShippingService()
    before = snapshot(obj) if pk else {}
    for key, value in data.items():
        setattr(obj, key, value)
    obj.full_clean()
    obj.save()
    audit(
        actor=actor, action="shipping.service_saved", target=obj, before=before, after=snapshot(obj)
    )
    reconcile_publications(actor)
    return obj


@transaction.atomic
def save_tariff(*, actor, data, pk=None):
    actor = locked_actor(actor)
    require_operator(actor)
    lock_services()
    obj = get_object_or_404(Tariff, pk=pk) if pk else Tariff()
    if obj.activated_at:
        raise Conflict("تعرفهٔ فعال‌شده ویرایش نمی‌شود؛ پیش‌نویس تازه بسازید.")
    before = snapshot(obj) if pk else {}
    for key, value in data.items():
        setattr(obj, key, value)
    if obj.scope == "national":
        if any(getattr(obj, field) for field in ROUTE_FIELDS[1:]):
            raise ValidationError("تعرفهٔ سراسری فیلد مسیر ندارد.")
    else:
        obj.origin_province = province(obj.origin_province)
        obj.destination_province = province(obj.destination_province)
        if obj.scope == "province" and (obj.origin_city or obj.destination_city):
            raise ValidationError("تعرفهٔ استانی فیلد شهر ندارد.")
        if obj.scope == "city":
            obj.origin_city, obj.destination_city = (
                normalized(obj.origin_city),
                normalized(obj.destination_city),
            )
            if not obj.origin_city or not obj.destination_city:
                raise ValidationError("هر دو شهر الزامی‌اند.")
    obj.full_clean(exclude=["replaces"])
    obj.save()
    audit(
        actor=actor, action="shipping.tariff_saved", target=obj, before=before, after=snapshot(obj)
    )
    return obj


@transaction.atomic
def activate_tariff(*, actor, pk, enabled, reason):
    actor = locked_actor(actor)
    require_owner(actor)
    lock_services()
    obj = get_object_or_404(Tariff, pk=pk)
    before = snapshot(obj)
    if enabled:
        if obj.activated_at:
            raise Conflict("برای فعال‌سازی، نسخهٔ پیش‌نویس تازه بسازید.")
        overlaps = list(
            Tariff.objects.filter(
                service=obj.service,
                is_active=True,
                min_weight_g__lte=obj.max_weight_g,
                max_weight_g__gte=obj.min_weight_g,
                **{field: getattr(obj, field) for field in ROUTE_FIELDS},
            )
        )
        for old in overlaps:
            old.is_active = False
            old.save(update_fields=["is_active", "updated_at"])
            audit(
                actor=actor,
                action="shipping.tariff_replaced",
                target=old,
                reason=reason,
                before={"is_active": True},
                after={"is_active": False, "replacement": str(obj.pk)},
            )
        obj.replaces.set(overlaps)
        obj.activated_at, obj.activated_by = timezone.now(), actor
    elif not obj.is_active:
        raise Conflict("تعرفه فعال نیست.")
    obj.is_active = enabled
    obj.save()
    audit(
        actor=actor,
        action="shipping.tariff_activation",
        target=obj,
        reason=reason,
        before=before,
        after=snapshot(obj),
    )
    reconcile_publications(actor)
    return obj


def match_rows(
    rows, origin_province, origin_city, destination_province, destination_city, weight_g
):
    for scope in ["city", "province", "national"]:
        candidates = [
            t
            for t in rows
            if t.scope == scope
            and (
                scope == "national"
                or (
                    t.origin_province == origin_province
                    and t.destination_province == destination_province
                    and (
                        scope == "province"
                        or (t.origin_city == origin_city and t.destination_city == destination_city)
                    )
                )
            )
        ]
        if candidates:
            return next(
                (t for t in candidates if t.min_weight_g <= weight_g <= t.max_weight_g), None
            )
    return None


def match_tariff(
    service, origin_province, origin_city, destination_province, destination_city, weight_g
):
    if not service.is_active or not service.operational:
        return None
    return match_rows(
        list(service.tariffs.filter(is_active=True)),
        origin_province,
        origin_city,
        destination_province,
        destination_city,
        weight_g,
    )


def orderable_weights(product):
    plan = getattr(product, "sales_plan", None)
    if plan is None:
        return set()
    available = {}
    for variant in product.variants.filter(is_active=True).select_related("supply", "package"):
        supply, package = getattr(variant, "supply", None), getattr(variant, "package", None)
        if supply and package and supply.ready_stock + supply.production_cap:
            available[variant.pk] = (supply.ready_stock + supply.production_cap, package.weight_g)
    weights = set()
    if plan.free_mix_min:
        for count, weight in available.values():
            if count >= plan.free_mix_min:
                weights.add(weight * plan.free_mix_min)
        remaining, total = plan.free_mix_min, 0
        for count, weight in available.values():
            take = min(count, remaining)
            total += take * weight
            remaining -= take
        if remaining == 0:
            weights.add(total)
    for pack in plan.packs.prefetch_related("items"):
        items = list(pack.items.all())
        if items and all(
            item.variant_id in available and available[item.variant_id][0] >= item.quantity
            for item in items
        ):
            weights.add(sum(available[item.variant_id][1] * item.quantity for item in items))
    return weights


def coverage(product):
    shipping = getattr(product, "shipping", None)
    if shipping is None:
        return False
    origin = normalized(shipping.origin.province)
    city = normalized(shipping.origin.city)
    if origin not in PROVINCES:
        return False
    weights = orderable_weights(product)
    rows = [
        list(service.tariffs.filter(is_active=True))
        for service in shipping.services.filter(is_active=True, operational=True)
    ]
    # Conservative proof using minimum legal selections, not every possible mixed basket.
    for weight in weights:
        covered = True
        for destination in PROVINCES:
            cities = {""} | {
                t.destination_city
                for group in rows
                for t in group
                if t.scope == "city"
                and t.origin_province == origin
                and t.origin_city == city
                and t.destination_province == destination
            }
            if not all(
                any(
                    match_rows(group, origin, city, destination, dest_city, weight)
                    for group in rows
                )
                for dest_city in cities
            ):
                covered = False
                break
        if covered:
            return True
    return False


def reconcile_publications(actor):
    # Imported here to keep logistics independent of publication API imports.
    from marketplace.catalog.publication import set_status

    for product in Product.objects.select_for_update().filter(status="published").order_by("id"):
        if not coverage(product):
            set_status(
                product, actor, "inactive", "shipping_unavailable", "پوشش حمل سراسری معتبر نیست."
            )


@transaction.atomic
def save_product_shipping(*, actor, product_id, data):
    actor = locked_actor(actor)
    reference = get_object_or_404(Product, pk=product_id, business__membership__user=actor)
    business = producer(actor, reference.business_id)
    lock_services()
    product = Product.objects.select_for_update().get(pk=product_id)
    if product.status not in ["draft", "changes_requested", "published", "inactive"]:
        raise Conflict("تنظیمات این مرحله فقط برای پیش‌نویس/اصلاح مجاز است.")
    origin = get_object_or_404(Address, pk=data["origin"], business=business)
    province(origin.province)
    if not normalized(origin.city):
        raise ValidationError("شهر مبدأ لازم است.")
    ids = data["services"]
    if len(ids) != len(set(ids)):
        raise ValidationError("خدمت تکراری مجاز نیست.")
    selected = list(ShippingService.objects.filter(pk__in=ids, is_active=True, operational=True))
    if len(selected) != len(ids):
        raise ValidationError("خدمات باید فعال و دارای گردش عملیاتی باشند.")
    variants = {v.pk: v for v in product.variants.filter(is_active=True)}
    if {row["variant"] for row in data["packages"]} != variants.keys() or len(
        data["packages"]
    ) != len(variants):
        raise ValidationError("مشخصات بستهٔ همهٔ تنوع‌ها، هرکدام دقیقاً یک بار لازم است.")
    config, _ = ProductShipping.objects.get_or_create(product=product, defaults={"origin": origin})
    config.origin = origin
    config.save()
    config.services.set(selected)
    for package in data["packages"]:
        values = {key: value for key, value in package.items() if key != "variant"}
        VariantPackage.objects.update_or_create(variant_id=package["variant"], defaults=values)
    if product.status == "published" and not coverage(product):
        from marketplace.catalog.publication import set_status

        set_status(
            product, actor, "inactive", "shipping_unavailable", "پوشش حمل سراسری معتبر نیست."
        )
    result = shipping_data(product)
    audit(actor=actor, action="shipping.product_configured", target=product, after=result)
    return result


def shipping_data(product):
    config = get_object_or_404(ProductShipping, product=product)
    return {
        "origin": str(config.origin_id),
        "services": [str(pk) for pk in config.services.order_by("id").values_list("id", flat=True)],
        "packages": [
            {
                "variant": str(p.variant_id),
                "weight_g": p.weight_g,
                "length_mm": p.length_mm,
                "width_mm": p.width_mm,
                "height_mm": p.height_mm,
                "package_count": p.package_count,
            }
            for p in VariantPackage.objects.filter(
                variant__product=product, variant__is_active=True
            ).order_by("variant_id")
        ],
    }


@transaction.atomic
def shipping_quote(*, actor, product_id, data):
    actor = locked_actor(actor)
    reference = get_object_or_404(Product, pk=product_id, business__membership__user=actor)
    producer(actor, reference.business_id)
    lock_services()
    product = Product.objects.select_for_update().get(pk=product_id)
    config = get_object_or_404(ProductShipping, product=product)
    service = get_object_or_404(config.services, pk=data["service"])
    packages = {
        p.variant_id: p
        for p in VariantPackage.objects.filter(variant__product=product, variant__is_active=True)
    }
    ids = [item["variant"] for item in data["items"]]
    if len(ids) != len(set(ids)) or set(ids) - packages.keys():
        raise ValidationError("تنوع تکراری یا فاقد مشخصات بسته است.")
    weight = sum(packages[item["variant"]].weight_g * item["quantity"] for item in data["items"])
    destination = province(data["destination_province"])
    city = normalized(data["destination_city"])
    tariff = match_tariff(
        service,
        province(config.origin.province),
        normalized(config.origin.city),
        destination,
        city,
        weight,
    )
    if tariff is None:
        raise Conflict("خدمت برای این مسیر و وزن در دسترس نیست.")
    return {
        "service": str(service.pk),
        "service_name": service.name,
        "tariff": str(tariff.pk),
        "origin_province": config.origin.province,
        "origin_city": config.origin.city,
        "destination_province": destination,
        "destination_city": city,
        "weight_g": weight,
        "min_weight_g": tariff.min_weight_g,
        "max_weight_g": tariff.max_weight_g,
        "shipping_amount_irr": tariff.amount_irr,
    }
