from rest_framework.exceptions import PermissionDenied

from .models import Membership, PlatformRole, User


def active_user(actor):
    return (
        actor
        and actor.is_authenticated
        and User.objects.filter(pk=actor.pk, is_active=True, is_suspended=False).exists()
    )


def has_role(actor, *roles):
    return (
        active_user(actor)
        and PlatformRole.objects.filter(user=actor, is_active=True, role__in=roles).exists()
    )


def require_operator(actor):
    if not has_role(actor, "owner", "operator"):
        raise PermissionDenied()


def require_owner(actor):
    if not has_role(actor, "owner"):
        raise PermissionDenied()


def require_business_owner(actor, business):
    if (
        not active_user(actor)
        or not Membership.objects.filter(user=actor, business=business, role="owner").exists()
    ):
        raise PermissionDenied()


def can_view_wholesale(actor):
    return (
        active_user(actor)
        and Membership.objects.filter(
            user=actor, role="owner", business__kind="retailer", business__status="verified"
        ).exists()
    )


def can_start_trade(business):
    return (
        business.status == "verified"
        and business.controlled_access
        and Membership.objects.filter(
            business=business, user__is_active=True, user__is_suspended=False
        ).exists()
    )
