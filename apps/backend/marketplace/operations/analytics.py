"""Bounded, live PostgreSQL projections shared by cards and drill-down."""

from datetime import timedelta
from typing import Any

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.accounts.models import Business
from marketplace.accounts.permissions import active_user, has_role
from marketplace.catalog.models import Product
from marketplace.disputes.models import DiscrepancyCase, DiscrepancyLine
from marketplace.finance.models import FinancialEvent
from marketplace.logistics.models import Shipment, ShippingRequest
from marketplace.orders.models import Order, OrderLine
from marketplace.reviews.models import Report, Review
from marketplace.support.models import Ticket

from .models import OrderDisposition, Suspension

LABELS = {
    "orders_registered": "سفارش‌های ثبت‌شده",
    "orders_accepted": "سفارش‌های پذیرفته‌شده",
    "orders_rejected": "سفارش‌های ردشده",
    "orders_paid": "سفارش‌های پرداخت‌شده",
    "orders_completed": "سفارش‌های تکمیل‌شده",
    "orders_cancelled": "سفارش‌های لغوشده",
    "sales": "مبلغ کالای فروش تکمیل‌شده",
    "purchases": "مبلغ خرید تکمیل‌شده",
    "items": "تعداد اقلام تکمیل‌شده",
    "settled": "مبلغ تسویه‌شده",
    "pending_settlement": "مبلغ در انتظار تسویه",
    "products": "محصولات",
    "products_pending": "محصولات در انتظار بررسی",
    "preparation": "سفارش‌های در حال آماده‌سازی",
    "production": "تولید سفارشی در جریان",
    "shipments": "مرسوله‌ها",
    "returns": "مرجوعی‌ها",
    "preparation_time": "میانگین زمان آماده‌سازی (ثانیه)",
    "shipping_time": "میانگین زمان ارسال (ثانیه)",
    "delivery_time": "میانگین زمان تحویل (ثانیه)",
    "disputes": "پرونده‌های مغایرت",
    "discrepancy_rate": "نرخ مغایرت",
    "discrepancy_types": "مغایرت به تفکیک نوع",
    "ratings_product": "امتیاز محصول",
    "ratings_collaboration": "امتیاز همکاری",
    "tickets": "تیکت‌ها",
    "tickets_waiting": "تیکت‌های منتظر پاسخ",
    "tickets_resolved": "تیکت‌های حل‌شده",
    "payments": "تعداد پرداخت",
    "refunds": "تعداد بازپرداخت",
    "gmv_paid": "ارزش کالای پرداخت‌شده",
    "gmv_completed": "ارزش کالای تکمیل‌شده",
    "fees_reserved": "کارمزد رزروشده",
    "fees_adjusted": "کارمزد برگشتی",
    "fees_final": "کارمزد قطعی",
    "refund_total": "مجموع بازپرداخت",
    "businesses": "کسب‌وکارها",
    "businesses_pending": "کسب‌وکارهای منتظر بررسی",
    "businesses_verified": "کسب‌وکارهای تأییدشده",
    "businesses_suspended": "کسب‌وکارهای تعلیق‌شده",
    "suspensions": "پرونده‌های تعلیق",
    "dispositions": "سفارش‌های نیازمند تصمیم",
    "reviews": "نظرهای ثبت‌شده",
    "reviews_reported": "نظرهای گزارش‌شده",
    "reviews_hidden": "نظرهای پنهان‌شده",
    "top_products": "محصولات پرتکرار",
    "top_variants": "تنوع‌های پرتکرار",
    "top_manufacturers": "تولیدکنندگان پرتکرار",
}
MACRO = {
    "gmv_paid",
    "gmv_completed",
    "fees_reserved",
    "fees_adjusted",
    "fees_final",
    "refund_total",
    "settled",
}
PLATFORM = {
    "businesses",
    "businesses_pending",
    "businesses_verified",
    "businesses_suspended",
    "suspensions",
    "dispositions",
    "reviews",
    "reviews_reported",
    "reviews_hidden",
    "payments",
    "refunds",
    "products_pending",
}
BUSINESS = {
    "top_variants",
    "sales",
    "purchases",
    "items",
    "pending_settlement",
    "top_products",
    "top_manufacturers",
    "ratings_product",
    "ratings_collaboration",
}


def scope(actor, business_id=None):
    if not active_user(actor):
        raise PermissionDenied()
    if business_id:
        business = get_object_or_404(Business, pk=business_id)
        if not has_role(actor, "owner") and business.membership.user_id != actor.pk:
            raise PermissionDenied()
        return business, business.kind
    if has_role(actor, "owner"):
        return None, "owner"
    if has_role(actor, "operator"):
        return None, "operator"
    business = get_object_or_404(Business, membership__user=actor)
    return business, business.kind


def metric_names(role):
    names = set(LABELS)
    if role in ["manufacturer", "retailer"]:
        names -= PLATFORM | (MACRO - {"settled"})
        names -= (
            {"purchases", "top_manufacturers"}
            if role == "manufacturer"
            else {
                "sales",
                "pending_settlement",
                "settled",
                "ratings_product",
                "production",
                "preparation",
            }
        )
    else:
        names -= BUSINESS
        if role == "operator":
            names -= MACRO
    return sorted(names)


def bounds(start=None, end=None):
    end = end or timezone.now() + timedelta(seconds=1)
    start = start or end - timedelta(days=30)
    if start >= end or end - start > timedelta(days=366):
        raise ValidationError("بازهٔ زمانی باید بین یک لحظه و ۳۶۶ روز باشد.")
    return start, end


def records(*, actor, metric, start, end, status=None, business_id=None):
    business, role = scope(actor, business_id)
    if metric not in metric_names(role):
        raise PermissionDenied("این شاخص در محدودهٔ دسترسی شما نیست.")
    orders = Order.objects.all()
    if business:
        orders = orders.filter(Q(manufacturer=business) | Q(retailer=business))
    if status:
        orders = orders.filter(status=status)
    events = FinancialEvent.objects.filter(order__in=orders, execution_mode="simulated")
    products = (
        Product.objects.filter(business=business)
        if business and role == "manufacturer"
        else Product.objects.filter(variants__orderline__order__in=orders).distinct()
        if business
        else Product.objects.all()
    )
    tickets = (
        Ticket.objects.filter(Q(business=business) | Q(order__in=orders)).distinct()
        if business
        else Ticket.objects.all()
    )
    query: Any = orders
    mode, value_field, group_field = "count", None, None
    if metric.startswith("orders_"):
        suffix = metric.removeprefix("orders_")
        query = (
            orders.filter(paid_at__isnull=False)
            if suffix == "paid"
            else orders
            if suffix == "registered"
            else orders.filter(status=suffix)
        )
    elif metric in [
        "sales",
        "purchases",
        "gmv_completed",
        "gmv_paid",
        "settled",
        "payments",
        "refunds",
        "refund_total",
        "fees_reserved",
        "fees_adjusted",
        "fees_final",
        "items",
        "top_products",
        "top_variants",
        "top_manufacturers",
        "pending_settlement",
    ]:
        kind = (
            "payment"
            if metric in ["gmv_paid", "payments", "fees_reserved", "pending_settlement"]
            else "refund"
            if metric in ["refunds", "refund_total", "fees_adjusted"]
            else "settlement"
        )
        query = events.filter(kind=kind)
        if metric in ["refund_total", "fees_adjusted"]:
            query = events.filter(kind__in=["refund", "adjustment"])
        if metric in ["pending_settlement", "fees_reserved"]:
            query = query.filter(order__status="active").exclude(
                order__financial_events__kind="settlement"
            )
        mode = "count" if metric in ["payments", "refunds"] else "sum"
        value_field = (
            "total_irr"
            if metric in ["settled", "refund_total"]
            else "fees"
            if metric.startswith("fees_")
            else "goods_irr"
        )
        query = query.select_related("order")
        if metric.startswith("top_"):
            group_field = "product" if metric == "top_products" else "manufacturer"
    elif metric in ["products", "products_pending"]:
        query = products.filter(status="pending") if metric.endswith("pending") else products
    elif metric in ["tickets", "tickets_waiting", "tickets_resolved"]:
        query = (
            tickets.filter(status="waiting_user")
            if metric.endswith("waiting")
            else tickets.filter(status="resolved")
            if metric.endswith("resolved")
            else tickets
        )
    elif metric in ["shipments", "returns", "shipping_time", "delivery_time"]:
        query = Shipment.objects.filter(
            request__group__order__in=orders, purpose="return" if metric == "returns" else "order"
        )
        if metric.endswith("_time"):
            mode = "mean"
            query = query.filter(handed_over_at__isnull=False).select_related(
                "request__group__order"
            )
            if metric == "delivery_time":
                query = query.filter(delivered_at__isnull=False)
    elif metric in ["preparation", "preparation_time"]:
        query = ShippingRequest.objects.filter(group__order__in=orders).select_related(
            "group__order"
        )
        if metric == "preparation_time":
            query = query.filter(ready_at__isnull=False, group__order__paid_at__isnull=False)
            mode = "mean"
        else:
            query = query.filter(status__in=["waiting", "ready", "spec_review"])
    elif metric == "production":
        query = OrderLine.objects.filter(
            order__in=orders.filter(status="active"), production_quantity__gt=0
        )
    elif metric in ["disputes", "discrepancy_rate", "discrepancy_types"]:
        query = (
            DiscrepancyLine.objects.filter(case__order__in=orders)
            if metric == "discrepancy_types"
            else DiscrepancyCase.objects.filter(order__in=orders)
        )
        group_field = "kind" if metric == "discrepancy_types" else None
        if metric == "discrepancy_rate":
            mode = "rate"
    elif metric.startswith("ratings_"):
        query = Review.objects.filter(
            entitlement__order__in=orders,
            published_at__isnull=False,
            invalidated=False,
            entitlement__execution_mode="simulated",
        )
        if business:
            query = query.filter(entitlement__recipient=business)
        query = (
            query.filter(entitlement__topic="product")
            if metric == "ratings_product"
            else query.exclude(entitlement__topic="product")
        )
        mode, value_field = "mean", "rating"
    elif metric.startswith("businesses"):
        query = (
            Business.objects.all()
            if metric == "businesses"
            else Business.objects.filter(status=metric.removeprefix("businesses_"))
        )
    elif metric == "suspensions":
        query = Suspension.objects.all()
    elif metric == "dispositions":
        query = OrderDisposition.objects.filter(decision="pending")
    elif metric.startswith("reviews"):
        query = (
            Report.objects.all()
            if metric == "reviews_reported"
            else Review.objects.filter(content_hidden=True)
            if metric == "reviews_hidden"
            else Review.objects.all()
        )
    if status and query.model in [Business, Product, Ticket, Suspension]:
        query = query.filter(status=status)
    query = query.filter(created_at__gte=start, created_at__lt=end).order_by("created_at", "pk")
    if query.count() > 5000:
        raise ValidationError("برای این شاخص بازهٔ زمانی کوتاه‌تری انتخاب کنید.")
    rows = []
    for obj in query:
        val: Any = 1
        if value_field:
            val = (
                obj.retailer_fee_irr + obj.manufacturer_fee_irr
                if value_field == "fees"
                else obj.scores["overall"]
                if value_field == "rating"
                else getattr(obj, value_field)
            )
        if metric in ["pending_settlement", "fees_reserved"]:
            from marketplace.finance.services import balance

            final = balance(obj.order)
            val = (
                final["retailer_fee"] + final["manufacturer_fee"]
                if metric == "fees_reserved"
                else final["goods"] - final["manufacturer_fee"]
            )
        if metric in ["items", "top_products", "top_variants", "top_manufacturers"]:
            retained = obj.snapshot.get("retained", {})
            lines = OrderLine.objects.filter(order=obj.order).select_related("variant")
            for line in lines:
                quantity = retained.get(str(line.pk), 0)
                if quantity:
                    rows.append(
                        {
                            "id": str(line.pk),
                            "order": str(obj.order_id),
                            "value": quantity,
                            "group": str(line.variant_id)
                            if metric == "top_variants"
                            else str(line.variant.product_id)
                            if metric == "top_products"
                            else str(obj.order.manufacturer_id),
                            "status": obj.order.status,
                            "created_at": obj.created_at,
                        }
                    )
            continue
        if metric == "preparation_time":
            val = (obj.ready_at - obj.group.order.paid_at).total_seconds()
        elif metric == "shipping_time":
            if not obj.request.group.order.paid_at:
                continue
            val = (obj.handed_over_at - obj.request.group.order.paid_at).total_seconds()
        elif metric == "delivery_time":
            val = (obj.delivered_at - obj.handed_over_at).total_seconds()
        record = {
            "id": str(obj.pk),
            "status": getattr(obj, "status", ""),
            "created_at": obj.created_at,
            "value": val,
        }
        if group_field:
            record["group"] = getattr(obj, group_field, "")
        # Operator projections intentionally expose no per-order monetary fields.
        rows.append(record)
    total = sum(row["value"] for row in rows)
    denominator = (
        orders.filter(created_at__gte=start, created_at__lt=end).count()
        if mode == "rate"
        else len(rows)
    )
    val = (
        total / denominator
        if mode in ["mean", "rate"] and denominator
        else None
        if mode in ["mean", "rate"]
        else total
    )
    groups: dict[str, Any] = {}
    if group_field:
        for row in rows:
            groups[row["group"]] = groups.get(row["group"], 0) + row["value"]
    return {
        "metric": metric,
        "label": LABELS[metric],
        "value": val,
        "count": len(rows),
        "denominator": denominator,
        "message": "داده‌ای وجود ندارد" if not rows else "",
        "groups": sorted(
            ({"id": key, "value": value} for key, value in groups.items()),
            key=lambda row: -row["value"],
        ),
    }, rows


def dashboard(*, actor, start, end, status=None, business_id=None):
    _, role = scope(actor, business_id)
    cards = [
        records(
            actor=actor, metric=name, start=start, end=end, status=status, business_id=business_id
        )[0]
        for name in metric_names(role)
    ]
    return {
        "role": role,
        "updated_at": timezone.now(),
        "start": start,
        "end": end,
        "cards": cards,
        "cached": False,
    }
