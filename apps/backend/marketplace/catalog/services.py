import hashlib
import json
from decimal import Decimal, DecimalException, InvalidOperation

from django.db import transaction
from django.forms.models import model_to_dict
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.accounts.models import Business, User
from marketplace.accounts.permissions import active_user, require_operator
from marketplace.common.exceptions import Conflict
from marketplace.operations.models import StoredFile
from marketplace.operations.services import audit

from .models import Attribute, Category, Product, Variant


def snapshot(obj):
    return json.loads(json.dumps(model_to_dict(obj), default=str))


def locked_actor(actor):
    # Serialize actor commands without blocking FK references (for example an
    # incoming order notification while this actor waits on a business lock).
    actor = User.objects.select_for_update(no_key=True).get(pk=actor.pk)
    if not active_user(actor):
        raise PermissionDenied()
    return actor


def producer(actor, business_id):
    business = get_object_or_404(
        Business.objects.select_for_update(), pk=business_id, membership__user=actor
    )
    if business.kind != "manufacturer" or business.status == "suspended":
        raise PermissionDenied("فقط تولیدکنندهٔ غیرمعلق مجاز است.")
    return business


def active_category(category):
    current = category
    while current:
        if not current.is_active:
            raise ValidationError({"category": "دسته یا والد آن غیرفعال است."})
        current = current.parent
    if category.children.exists():
        raise ValidationError({"category": "دسته باید نهایی باشد."})


@transaction.atomic
def save_taxonomy(*, actor, model, data, pk=None):
    actor = locked_actor(actor)
    require_operator(actor)
    reason = data.pop("reason", "").strip()
    # ponytail: lock the small taxonomy for structural edits; split by tree if contention grows.
    list(Category.objects.select_for_update().order_by("id"))
    obj = get_object_or_404(model.objects.select_for_update(), pk=pk) if pk else model()
    before = snapshot(obj) if pk else {}
    if pk and "is_active" in data and data["is_active"] != obj.is_active and not reason:
        raise ValidationError({"reason": "دلیل تغییر وضعیت الزامی است."})
    if model is Category:
        parent = data.get("parent", obj.parent)
        cursor = parent
        while cursor:
            if cursor.pk == obj.pk:
                raise ValidationError({"parent": "حلقه در درخت مجاز نیست."})
            cursor = cursor.parent
        if parent and Product.objects.filter(category=parent).exists():
            raise Conflict("دستهٔ استفاده‌شده باید نهایی بماند.")
        if pk and obj.products.exists() and parent != obj.parent:
            raise Conflict("والد دستهٔ استفاده‌شده تغییر نمی‌کند.")
    elif model is Attribute:
        if pk and Product.objects.filter(category=obj.category).exists():
            for field in ["category", "code", "kind", "scope", "unit", "required", "filterable"]:
                if field in data and data[field] != getattr(obj, field):
                    raise Conflict("برای تغییر ساختاری ویژگی، ویژگی جدید بسازید.")
        kind, unit = data.get("kind", obj.kind), data.get("unit", obj.unit)
        if (kind == "number") != bool(unit):
            raise ValidationError({"unit": "واحد فقط برای ویژگی عددی الزامی است."})
    else:
        attribute = data.get("attribute", obj.attribute if pk else None)
        if attribute.kind != "choice":
            raise ValidationError({"attribute": "مقدار استاندارد فقط برای ویژگی فهرستی است."})
        if pk and any(
            field in data and data[field] != getattr(obj, field) for field in ["attribute", "code"]
        ):
            raise Conflict("شناسه و ویژگی مقدار استاندارد تغییر نمی‌کنند.")
    for key, value in data.items():
        setattr(obj, key, value)
    obj.full_clean()
    obj.save()
    audit(
        actor=actor,
        action="catalog.taxonomy_updated" if pk else "catalog.taxonomy_created",
        target=obj,
        reason=reason,
        before=before,
        after=snapshot(obj),
    )
    return obj


def values_for(category, scope, values, previous=None):
    if not isinstance(values, dict) or len(values) > 100:
        raise ValidationError({"attributes": "یک شیء با حداکثر ۱۰۰ ویژگی ارسال کنید."})
    definitions = {
        a.code: a for a in category.attributes.filter(scope=scope).prefetch_related("options")
    }
    if values.keys() - definitions.keys():
        raise ValidationError({"attributes": "ویژگی ناشناخته یا متعلق به بخش دیگری است."})
    result = {}
    for code, definition in definitions.items():
        if code not in values:
            if definition.is_active and definition.required:
                raise ValidationError({"attributes": f"ویژگی {code} الزامی است."})
            continue
        value = values[code]
        unchanged = previous is not None and previous.get(code) == value
        if not definition.is_active and not unchanged:
            raise ValidationError({"attributes": f"ویژگی {code} غیرفعال است."})
        if definition.kind == "choice":
            option = next((o for o in definition.options.all() if o.code == value), None)
            if option is None or (not option.is_active and not unchanged):
                raise ValidationError({"attributes": f"مقدار {code} مجاز نیست."})
        elif definition.kind == "number":
            try:
                if len(str(value)) > 120:
                    raise InvalidOperation
                number = Decimal(str(value))
                if (
                    not number.is_finite()
                    or abs(number) > Decimal("1e18")
                    or isinstance(number.as_tuple().exponent, int)
                    and int(number.as_tuple().exponent) < -6
                ):
                    raise InvalidOperation
                value = format(number.normalize(), "f")
            except (DecimalException, ValueError, TypeError):
                raise ValidationError(
                    {"attributes": f"مقدار {code} باید عدد محدود با حداکثر شش رقم اعشار باشد."}
                ) from None
        elif not isinstance(value, str) or not value.strip() or len(value) > 120:
            raise ValidationError({"attributes": f"مقدار {code} باید متن ۱ تا ۱۲۰ نویسه باشد."})
        else:
            value = value.strip()
        result[code] = value
    return result


def image_ids(business, images, limit, previous=None):
    if not isinstance(images, list) or len(images) > limit:
        raise ValidationError({"images": f"حداکثر {limit} تصویر مجاز است."})
    from uuid import UUID

    try:
        ids = [str(UUID(str(value))) for value in images]
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({"images": "شناسهٔ تصویر معتبر نیست."}) from None
    if len(set(ids)) != len(ids):
        raise ValidationError({"images": "تصویر تکراری مجاز نیست."})
    if previous and not ids and limit == 8:
        raise ValidationError({"images": "حداقل یک تصویر گالری باید باقی بماند."})
    files = StoredFile.objects.filter(
        pk__in=ids, business=business, purpose="product_image", scan_status="clean", deleted_at=None
    )
    if files.count() != len(ids):
        raise ValidationError({"images": "تصویر باید متعلق به همین کسب‌وکار و اسکن‌شده باشد."})
    return ids


@transaction.atomic
def save_product(*, actor, data, pk=None):
    actor = locked_actor(actor)
    existing = get_object_or_404(Product, pk=pk, business__membership__user=actor) if pk else None
    business = producer(actor, existing.business_id if existing else data.pop("business").pk)
    category_id = data.get("category", existing.category if existing else None).pk
    category = Category.objects.select_for_update().get(pk=category_id)
    obj = (
        Product.objects.select_for_update().get(pk=pk)
        if pk
        else Product(business=business, category=category)
    )
    before = snapshot(obj) if pk else {}
    if obj.status not in ["draft", "changes_requested"]:
        raise Conflict("فقط پیش‌نویس قابل‌ویرایش است.")
    if pk and "business" in data and data["business"] != obj.business:
        raise ValidationError({"business": "مالکیت محصول تغییر نمی‌کند."})
    if not pk or category.pk != obj.category_id:
        active_category(category)
        if pk and obj.variants.exists():
            raise Conflict("پیش از تغییر دسته، تنوع‌های پیش‌نویس را حذف کنید.")
    old_values = obj.attributes if obj.category_id == category.pk else None
    obj.attributes = values_for(
        category, "product", data.pop("attributes", obj.attributes), old_values
    )
    obj.images = image_ids(business, data.pop("images", obj.images), 8, obj.images)
    for key, value in data.items():
        setattr(obj, key, value)
    obj.full_clean()
    obj.save()
    audit(
        actor=actor,
        action="catalog.product_updated" if pk else "catalog.product_created",
        target=obj,
        before=before,
        after=snapshot(obj),
    )
    return obj


@transaction.atomic
def save_variant(*, actor, product_id, data, pk=None):
    actor = locked_actor(actor)
    reference = get_object_or_404(Product, pk=product_id, business__membership__user=actor)
    business = producer(actor, reference.business_id)
    category = Category.objects.select_for_update().get(pk=reference.category_id)
    product = Product.objects.select_for_update().get(pk=product_id)
    if product.status not in ["draft", "changes_requested"]:
        raise Conflict("فقط تنوع پیش‌نویس قابل‌ویرایش است.")
    obj = (
        get_object_or_404(Variant.objects.select_for_update(), pk=pk, product=product)
        if pk
        else Variant(product=product, business=business)
    )
    before = snapshot(obj) if pk else {}
    obj.attributes = values_for(
        category, "variant", data.pop("attributes", obj.attributes), obj.attributes if pk else None
    )
    obj.combination = hashlib.sha256(
        json.dumps(obj.attributes, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    obj.images = image_ids(business, data.pop("images", obj.images), 3)
    obj.sku = data.get("sku", obj.sku).strip()
    if not obj.sku:
        raise ValidationError({"sku": "SKU الزامی است."})
    obj.full_clean()
    obj.save()
    audit(
        actor=actor,
        action="catalog.variant_updated" if pk else "catalog.variant_created",
        target=obj,
        before=before,
        after=snapshot(obj),
    )
    return obj


@transaction.atomic
def delete_variant(*, actor, product_id, pk):
    actor = locked_actor(actor)
    reference = get_object_or_404(Product, pk=product_id, business__membership__user=actor)
    producer(actor, reference.business_id)
    product = Product.objects.select_for_update().get(pk=product_id)
    if product.status not in ["draft", "changes_requested"]:
        raise Conflict("فقط تنوع پیش‌نویس قابل حذف است.")
    obj = get_object_or_404(Variant, pk=pk, product=product)
    if obj.pack_items.exists() or obj.price_overrides.exists():
        raise Conflict("ابتدا ارجاع تنوع را از بسته‌ها و قیمت اختصاصی حذف کنید.")
    audit(actor=actor, action="catalog.variant_deleted", target=obj)
    obj.delete()
