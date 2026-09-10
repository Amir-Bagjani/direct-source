"""Supply is total capacity; reservations and allocations consume it until released."""

from django.db.models import Sum

from marketplace.common.exceptions import Conflict

from .models import Reservation


def committed(variant_id):
    amounts = Reservation.objects.filter(
        variant_id=variant_id, status__in=["reserved", "allocated"]
    ).aggregate(ready=Sum("ready_quantity"), production=Sum("production_quantity"))
    return amounts["ready"] or 0, amounts["production"] or 0


def available_supply(supply):
    ready, production = committed(supply.variant_id)
    return max(0, supply.ready_stock - ready), max(0, supply.production_cap - production)


def validate_supply(supply):
    ready, production = committed(supply.variant_id)
    if supply.ready_stock < ready or supply.production_cap < production:
        raise Conflict("عرضه نمی‌تواند کمتر از موجودی و ظرفیت متعهدشده باشد.")


def release(order):
    # Caller holds the same service lock used by quote, supply edits and checkout.
    Reservation.objects.filter(line__order=order, status="reserved").update(status="released")
