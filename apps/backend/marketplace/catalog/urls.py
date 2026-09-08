from django.urls import path
from rest_framework.routers import SimpleRouter

from .api import AttributeViewSet, CategoryViewSet, OptionViewSet, ProductViewSet, VariantViewSet

router = SimpleRouter()
router.register("categories", CategoryViewSet, basename="catalog-category")
router.register("attributes", AttributeViewSet, basename="catalog-attribute")
router.register("attribute-options", OptionViewSet, basename="catalog-option")
router.register("products", ProductViewSet, basename="catalog-product")
urlpatterns = router.urls + [
    path(
        "products/<uuid:product_id>/variants/",
        VariantViewSet.as_view({"get": "list", "post": "create"}),
        name="catalog-variant-list",
    ),
    path(
        "products/<uuid:product_id>/variants/<uuid:pk>/",
        VariantViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="catalog-variant-detail",
    ),
]
