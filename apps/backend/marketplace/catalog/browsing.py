"""Public catalogue projection. Never project private business fields or wholesale by default."""

from decimal import Decimal, DecimalException
from uuid import UUID

from django.core.files.storage import default_storage
from django.db.models import Avg, Count, FloatField, OuterRef, Prefetch, Q, Subquery, Sum
from django.db.models.functions import Cast, Coalesce
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination

from marketplace.accounts.models import Business
from marketplace.accounts.permissions import can_view_wholesale
from marketplace.operations.models import StoredFile
from marketplace.reviews.services import visible_reviews

from .models import Attribute, Category, Product, Variant
from .proposals import normalize
from .sales_services import plan_data


class CatalogPagination(PageNumberPagination):
    page_size = 24


class BrowseInput(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=True, max_length=200)
    category = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=30)
    manufacturer = serializers.ListField(
        child=serializers.UUIDField(), required=False, max_length=30
    )
    supply = serializers.ListField(
        child=serializers.ChoiceField(choices=["ready", "production", "hybrid"]), required=False
    )
    method = serializers.ListField(
        child=serializers.ChoiceField(choices=["free_mix", "fixed_pack"]), required=False
    )
    orderable = serializers.BooleanField(required=False)
    lead_min = serializers.IntegerField(required=False, min_value=0, max_value=3650)
    lead_max = serializers.IntegerField(required=False, min_value=0, max_value=3650)
    price_min = serializers.IntegerField(required=False, min_value=0, max_value=10**15)
    price_max = serializers.IntegerField(required=False, min_value=0, max_value=10**15)
    rating_min = serializers.DecimalField(
        required=False, min_value=0, max_value=5, max_digits=3, decimal_places=2
    )
    sort = serializers.ChoiceField(
        required=False,
        choices=["relevance", "newest", "price_asc", "price_desc", "lead_time", "rating"],
    )
    page = serializers.IntegerField(required=False, min_value=1)


def rating_annotations(topic, subject):
    reviews = (
        visible_reviews()
        .filter(entitlement__topic=topic, **{subject: OuterRef("pk")})
        .order_by()
        .values(subject)
        .annotate(average=Avg(Cast("scores__overall", FloatField())), count=Count("pk"))
    )
    return {
        "rating_average": Subquery(reviews.values("average")),
        "rating_count": Coalesce(Subquery(reviews.values("count")), 0),
    }


def public_queryset():
    return catalog_projection_queryset().filter(
        status="published",
        business__status="verified",
        business__membership__user__is_active=True,
        business__membership__user__is_suspended=False,
    )


def catalog_projection_queryset():
    # Callers must apply public eligibility or explicit private owner/assignee access.
    return (
        Product.objects.all()
        .annotate(**rating_annotations("product", "entitlement__product_id"))
        .select_related(
            "business__logo", "business__membership", "category", "sales_plan", "shipping__origin"
        )
        .prefetch_related(
            Prefetch(
                "variants",
                queryset=Variant.objects.filter(is_active=True)
                .select_related("supply", "package")
                .annotate(
                    committed_ready=Sum(
                        "reservation__ready_quantity",
                        filter=Q(reservation__status__in=["reserved", "allocated"]),
                        default=0,
                    ),
                    committed_production=Sum(
                        "reservation__production_quantity",
                        filter=Q(reservation__status__in=["reserved", "allocated"]),
                        default=0,
                    ),
                ),
                to_attr="public_variants",
            ),
            "sales_plan__tiers__overrides",
            "sales_plan__packs__items",
            "shipping__services",
            "category__attributes__options",
        )
        .order_by("-published_at", "id")
    )


def public_manufacturer_queryset():
    return (
        Business.objects.filter(
            kind="manufacturer",
            status="verified",
            membership__user__is_active=True,
            membership__user__is_suspended=False,
        )
        .annotate(**rating_annotations("manufacturer", "entitlement__recipient_id"))
        .select_related("logo", "membership")
        .prefetch_related("addresses")
    )


def business_logo_url(business, storage=default_storage):
    logo = business.logo
    return (
        storage.url(logo.object_key)
        if logo
        and logo.business_id == business.pk
        and logo.owner_id == business.membership.user_id
        and logo.purpose == "business_logo"
        and logo.scan_status == "clean"
        and logo.deleted_at is None
        else None
    )


def manufacturer_data(business):
    products = list(business.products.filter(status="published").select_related("category"))
    categories = {
        product.category_id: {
            "id": str(product.category_id),
            "name": product.category.name,
            "slug": product.category.slug,
        }
        for product in products
    }
    address = next(iter(business.addresses.all()), None)
    return {
        "id": str(business.pk),
        "name": business.name,
        "description": business.description,
        "verified": True,
        "province": address.province if address else None,
        "city": address.city if address else None,
        "joined_at": business.first_verified_at,
        "logo_url": business_logo_url(business),
        "rating": {"average": business.rating_average, "count": business.rating_count},
        "product_count": len(products),
        "categories": sorted(categories.values(), key=lambda row: row["name"]),
    }


def taxonomy():
    categories = {obj.pk: obj for obj in Category.objects.all()}
    definitions = list(Attribute.objects.prefetch_related("options"))
    return categories, definitions


def discovery():
    categories = {obj.pk: obj for obj in Category.objects.all()}
    published = public_queryset()
    used = set(published.values_list("category_id", flat=True))
    included: set[UUID] = set()
    for pk, category in categories.items():
        path = category_path(pk, categories)
        if pk in used or (
            category.is_active and all(categories[UUID(row["id"])].is_active for row in path)
        ):
            included.update(UUID(row["id"]) for row in path)
    selected = [category for pk, category in categories.items() if pk in included]
    selected.sort(
        key=lambda category: tuple(
            (categories[UUID(row["id"])].position, row["slug"], row["id"])
            for row in category_path(category.pk, categories)
        )
    )
    return {
        "categories": selected,
        "attributes": Attribute.objects.filter(
            category_id__in=included, is_active=True, filterable=True
        ).prefetch_related("options"),
        "manufacturers": Business.objects.filter(
            pk__in=published.values("business_id"), kind="manufacturer"
        )
        .order_by("name", "id")
        .values("id", "name"),
    }


def category_path(category_id, categories):
    path: list[dict[str, str]] = []
    category = categories.get(category_id)
    while category:
        path.insert(0, {"id": str(category.pk), "name": category.name, "slug": category.slug})
        category = categories.get(category.parent_id)
    return path


def public_supply(variant):
    supply = getattr(variant, "supply", None)
    if supply is None:
        return None
    return {
        "mode": supply.mode,
        "lead_time_days": supply.lead_time_days,
        "ready_stock": max(0, supply.ready_stock - getattr(variant, "committed_ready", 0)),
        "production_cap": max(
            0, supply.production_cap - getattr(variant, "committed_production", 0)
        ),
    }


def metrics(product):
    variants = product.public_variants
    available = {
        v.pk: public_supply(v)["ready_stock"] + public_supply(v)["production_cap"]
        for v in variants
        if hasattr(v, "supply") and hasattr(v, "package")
    }
    available = {pk: count for pk, count in available.items() if count > 0}
    plan = getattr(product, "sales_plan", None)
    eligible: set = set()
    methods, minima, packs = [], [], []
    if plan:
        if plan.free_mix_min:
            methods.append("free_mix")
            minima.append(plan.free_mix_min)
            if sum(available.values()) >= plan.free_mix_min:
                eligible.update(available)
        active_ids = {v.pk for v in variants}
        for pack in plan.packs.all():
            items = list(pack.items.all())
            if items and all(item.variant_id in active_ids for item in items):
                packs.append(
                    {
                        "code": pack.code,
                        "name": pack.name,
                        "items": [
                            {"variant": str(i.variant_id), "quantity": i.quantity} for i in items
                        ],
                    }
                )
                minima.append(sum(i.quantity for i in items))
                if "fixed_pack" not in methods:
                    methods.append("fixed_pack")
                if all(available.get(i.variant_id, 0) >= i.quantity for i in items):
                    eligible.update(i.variant_id for i in items)
    orderable = [v for v in variants if v.pk in eligible]
    lead = min(
        (0 if public_supply(v)["ready_stock"] else v.supply.lead_time_days for v in orderable),
        default=None,
    )
    tiers = list(plan.tiers.all()) if plan else []
    prices = []
    if tiers:
        first = min(tiers, key=lambda t: t.min_quantity)
        overrides = {o.variant_id: o.unit_price_irr for o in first.overrides.all()}
        prices = [overrides.get(v.pk, first.unit_price_irr) for v in orderable]
    return {
        "orderable": bool(orderable),
        "eligible": eligible,
        "lead_time_days": lead,
        "representative_price_irr": min(prices, default=None),
        "supply_modes": sorted({v.supply.mode for v in variants if hasattr(v, "supply")}),
        "sale_methods": methods,
        "minimum_order": min(minima, default=None),
        "free_mix_min": plan.free_mix_min if plan else None,
        "packs": packs,
    }


def search_score(product, query, categories, definitions):
    def attribute_text(values, scope):
        parts = []
        for a in definitions:
            if a.category_id == product.category_id and a.scope == scope and a.code in values:
                parts += [a.name, a.code, str(values[a.code])]
                parts.extend(o.label for o in a.options.all() if o.code == values[a.code])
        return " ".join(parts)

    name = normalize(product.name)
    text = normalize(
        " ".join(
            [
                product.description,
                product.brand,
                product.manufacturer_model,
                product.business.name,
                " ".join(c["name"] for c in category_path(product.category_id, categories)),
                attribute_text(product.attributes, "product"),
                *[
                    v.sku + " " + attribute_text(v.attributes, "variant")
                    for v in product.public_variants
                ],
            ]
        )
    )
    words = query.split()
    if not all(word in name or word in text for word in words):
        return 0
    return sum(10 if word in name else 1 for word in words) + (10 if query in name else 0)


def filter_value(definition, value):
    if definition.kind != "number":
        return normalize(value)
    try:
        number = Decimal(str(value))
        if not number.is_finite() or abs(number) > Decimal("1e18"):
            return None
        exponent = number.as_tuple().exponent
        return number if isinstance(exponent, int) and exponent >= -6 else None
    except (DecimalException, ValueError, TypeError):
        return None


def browse(request):
    data = request.query_params
    allowed = set(BrowseInput().fields)
    unknown = [key for key in data if key not in allowed and not key.startswith("attr.")]
    if unknown:
        raise ValidationError({"query": "پارامتر ناشناخته: " + ", ".join(unknown)})
    raw = {key: data[key] for key in allowed if key in data}
    for key in ["category", "manufacturer", "supply", "method"]:
        if key in data:
            raw[key] = [value for entry in data.getlist(key) for value in entry.split(",")]
    serializer = BrowseInput(data=raw)
    serializer.is_valid(raise_exception=True)
    params = serializer.validated_data
    wholesale = can_view_wholesale(request.user)
    if not wholesale and (
        "price_min" in params
        or "price_max" in params
        or params.get("sort", "").startswith("price_")
    ):
        raise PermissionDenied("فیلتر و مرتب‌سازی قیمت فقط برای خرده‌فروش تأییدشده است.")
    query = normalize(params.get("q", ""))
    if query and len(query.replace(" ", "")) < 2:
        raise ValidationError({"q": "حداقل دو نویسه لازم است."})
    for field in ["price", "lead"]:
        if params.get(field + "_min", 0) > params.get(field + "_max", 10**15):
            raise ValidationError({field: "حداقل نباید بیشتر از حداکثر باشد."})
    categories, definitions = taxonomy()
    if set(params.get("category", [])) - categories.keys():
        raise ValidationError({"category": "دسته ناشناخته است."})
    attribute_filters = []
    for key in data:
        if key.startswith("attr."):
            aid = serializers.UUIDField().run_validation(key[5:])
            definition = next(
                (a for a in definitions if a.pk == aid and a.filterable and a.is_active), None
            )
            if not definition:
                raise ValidationError({key: "ویژگی قابل فیلتر نیست."})
            values = [normalize(v) for entry in data.getlist(key) for v in entry.split(",")]
            if not values or len(values) > 100 or any(not v or len(v) > 120 for v in values):
                raise ValidationError({key: "مقادیر فیلتر معتبر نیستند."})
            values = [filter_value(definition, value) for value in values]
            if None in values:
                raise ValidationError({key: "مقدار عددی فیلتر معتبر نیست."})
            attribute_filters.append((definition, values))
    qs = public_queryset()
    if params.get("manufacturer"):
        qs = qs.filter(business_id__in=params["manufacturer"])
    if params.get("category"):
        wanted = {str(pk) for pk in params["category"]}
        ids = [
            pk
            for pk in categories
            if wanted.intersection(c["id"] for c in category_path(pk, categories))
        ]
        qs = qs.filter(category_id__in=ids)
    # ponytail: prefetch and compute over the MVP catalogue; move this projection to indexed
    # PostgreSQL search/read-model when catalogue-sized scans exceed the measured latency budget.
    results = []
    for product in qs:
        product.catalog_metrics = metrics(product)
        m = product.catalog_metrics
        product.search_rank = search_score(product, query, categories, definitions) if query else 0
        if query and not product.search_rank:
            continue
        if any(
            params.get(key) and not set(params[key]).intersection(m[field])
            for key, field in [("supply", "supply_modes"), ("method", "sale_methods")]
        ):
            continue
        if "orderable" in params and params["orderable"] != m["orderable"]:
            continue
        if any(
            bound in params
            and (
                m[field] is None
                or (m[field] < params[bound] if bound.endswith("min") else m[field] > params[bound])
            )
            for bound, field in [
                ("price_min", "representative_price_irr"),
                ("price_max", "representative_price_irr"),
                ("lead_min", "lead_time_days"),
                ("lead_max", "lead_time_days"),
            ]
        ):
            continue
        if "rating_min" in params and (
            product.rating_average is None or product.rating_average < params["rating_min"]
        ):
            continue
        if any(
            a.category_id != product.category_id
            or not any(
                filter_value(a, row.get(a.code, "")) in values
                for row in (
                    [product.attributes]
                    if a.scope == "product"
                    else [v.attributes for v in product.public_variants]
                )
            )
            for a, values in attribute_filters
        ):
            continue
        results.append(product)
    sort = params.get("sort", "relevance" if query else "newest")
    if sort == "relevance":
        results.sort(key=lambda p: -p.search_rank)
    elif sort == "rating":
        results.sort(key=lambda p: (p.rating_average is None, -(p.rating_average or 0)))
    elif sort in ["price_asc", "price_desc", "lead_time"]:
        field = "lead_time_days" if sort == "lead_time" else "representative_price_irr"
        results.sort(
            key=lambda p: (
                p.catalog_metrics[field] is None,
                (-1 if sort == "price_desc" else 1) * (p.catalog_metrics[field] or 0),
            )
        )
    return results, categories


def image_urls(business_id, ids, storage=default_storage):
    files = {
        str(f.pk): f
        for f in StoredFile.objects.filter(
            pk__in=ids,
            business_id=business_id,
            purpose="product_image",
            scan_status="clean",
            deleted_at=None,
        )
    }
    return [storage.url(files[pk].object_key) for pk in ids if pk in files]


def display_attributes(product, values, scope):
    definitions = {
        attribute.code: attribute
        for attribute in product.category.attributes.all()
        if attribute.scope == scope
    }
    rows = []
    for code, value in sorted(
        values.items(),
        key=lambda item: (
            definitions[item[0]].position if item[0] in definitions else 2**31,
            item[0],
        ),
    ):
        definition = definitions.get(code)
        label = value
        if definition and definition.kind == "choice":
            label = next(
                (option.label for option in definition.options.all() if option.code == value), value
            )
        rows.append(
            {
                "code": code,
                "name": definition.name if definition else code,
                "value": label,
                "unit": definition.unit if definition else "",
            }
        )
    return rows


def public_data(product, wholesale, categories, storage=default_storage):
    m = getattr(product, "catalog_metrics", None) or metrics(product)
    shipping = getattr(product, "shipping", None)
    origin = shipping.origin if shipping else None
    data = {
        key: getattr(product, key)
        for key in [
            "name",
            "description",
            "brand",
            "manufacturer_model",
            "attributes",
            "published_at",
        ]
    }
    data.update(
        id=str(product.pk),
        business=str(product.business_id),
        category=str(product.category_id),
        category_path=category_path(product.category_id, categories),
        image_urls=image_urls(product.business_id, product.images, storage),
        display_attributes=display_attributes(product, product.attributes, "product"),
        manufacturer={
            "id": str(product.business_id),
            "name": product.business.name,
            "description": product.business.description,
            "verified": True,
            "province": origin.province if origin else None,
            "city": origin.city if origin else None,
            "joined_at": product.business.first_verified_at,
            "logo_url": business_logo_url(product.business, storage),
        },
        rating={"average": product.rating_average, "count": product.rating_count},
        shipping_services=[
            {
                "id": str(s.pk),
                "name": s.name,
                "kind": s.kind,
                "delivery_days_min": s.delivery_days_min,
                "delivery_days_max": s.delivery_days_max,
            }
            for s in shipping.services.all()
            if s.is_active and s.operational
        ]
        if shipping
        else [],
    )
    data.update(
        {
            key: m[key]
            for key in [
                "orderable",
                "lead_time_days",
                "supply_modes",
                "sale_methods",
                "minimum_order",
                "free_mix_min",
                "packs",
            ]
        }
    )
    data["variants"] = []
    for v in product.public_variants:
        supply = getattr(v, "supply", None)
        data["variants"].append(
            {
                "id": str(v.pk),
                "sku": v.sku,
                "attributes": v.attributes,
                "display_attributes": display_attributes(product, v.attributes, "variant"),
                "image_urls": image_urls(
                    product.business_id, v.images or product.images[:1], storage
                ),
                "orderable": v.pk in m["eligible"],
                "supply": public_supply(v) if supply else None,
            }
        )
    if wholesale:
        data["representative_price_irr"] = m["representative_price_irr"]
        plan = getattr(product, "sales_plan", None)
        if plan:
            data["wholesale"] = plan_data(plan, {v.pk: v.sku for v in product.public_variants})
    else:
        data["price_access_message"] = "برای مشاهدهٔ قیمت عمده، کسب‌وکار خرده‌فروشی خود را تأیید کنید."
    return data
