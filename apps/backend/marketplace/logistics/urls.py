from django.urls import path
from rest_framework.routers import SimpleRouter

from .api import (
    ActivationView,
    ProductShippingView,
    ProvinceView,
    ServiceViewSet,
    ShippingQuoteView,
    TariffViewSet,
)

router = SimpleRouter()
router.register("services", ServiceViewSet)
router.register("tariffs", TariffViewSet)
urlpatterns = router.urls + [
    path("provinces/", ProvinceView.as_view()),
    path("tariffs/<uuid:pk>/activation/", ActivationView.as_view()),
    path("products/<uuid:product_id>/shipping/", ProductShippingView.as_view()),
    path("products/<uuid:product_id>/quote/", ShippingQuoteView.as_view()),
]
