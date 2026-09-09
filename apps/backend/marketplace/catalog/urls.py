from django.urls import path
from rest_framework.routers import SimpleRouter

from . import lifecycle_api as lifecycle
from . import publication_api as publication
from . import revision_api as revision
from .api import AttributeViewSet, CategoryViewSet, OptionViewSet, ProductViewSet, VariantViewSet
from .sales_api import QuoteView, SalesPlanView, SupplyView

router = SimpleRouter()
router.register("categories", CategoryViewSet, basename="catalog-category")
router.register("attributes", AttributeViewSet, basename="catalog-attribute")
router.register("attribute-options", OptionViewSet, basename="catalog-option")
router.register("products", ProductViewSet, basename="catalog-product")
router.register("proposals", lifecycle.ProposalViewSet, basename="catalog-proposal")
urlpatterns = router.urls + [
    path("proposals/<uuid:pk>/review/", lifecycle.ProposalReviewView.as_view()),
    path("products/<uuid:pk>/delete/", lifecycle.ProductDeleteView.as_view()),
    path("products/<uuid:pk>/reassign/", lifecycle.ProductReassignView.as_view()),
    path("revisions/<uuid:pk>/reassign/", lifecycle.RevisionReassignView.as_view()),
    path(
        "products/<uuid:product_id>/variants/<uuid:pk>/activation/",
        lifecycle.VariantStatusView.as_view(),
    ),
    path("products/<uuid:product_id>/revisions/", revision.RevisionCreate.as_view()),
    path("revisions/<uuid:pk>/", revision.RevisionDetail.as_view()),
    path("revisions/<uuid:pk>/submit/", revision.RevisionSubmit.as_view()),
    path("revisions/<uuid:pk>/claim/", revision.RevisionClaim.as_view()),
    path("revisions/<uuid:pk>/review/", revision.RevisionReview.as_view()),
    path("revisions/<uuid:pk>/cancel/", revision.RevisionCancel.as_view()),
    path("revision-queue/", revision.RevisionQueue.as_view()),
    path("products/<uuid:pk>/activate/", publication.ActivateView.as_view()),
    path("products/<uuid:pk>/deactivate/", publication.DeactivateView.as_view()),
    path("products/<uuid:pk>/submit/", publication.SubmitView.as_view()),
    path("products/<uuid:pk>/claim/", publication.ClaimView.as_view()),
    path("products/<uuid:pk>/review/", publication.ReviewView.as_view()),
    path("products/<uuid:pk>/reopen/", publication.ReopenView.as_view()),
    path("review-queue/", publication.QueueView.as_view()),
    path("review-products/<uuid:pk>/", publication.ReviewDetailView.as_view()),
    path("public/products/", publication.PublicProductList.as_view()),
    path("public/products/<uuid:pk>/", publication.PublicProductDetail.as_view()),
    path(
        "public/manufacturers/<uuid:pk>/",
        publication.PublicManufacturerDetail.as_view(),
    ),
    path("products/<uuid:product_id>/sales-plan/", SalesPlanView.as_view()),
    path("products/<uuid:product_id>/quote/", QuoteView.as_view()),
    path("products/<uuid:product_id>/variants/<uuid:pk>/supply/", SupplyView.as_view()),
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
