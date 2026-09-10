from django.urls import path
from rest_framework.routers import SimpleRouter

from . import fulfillment_api as fulfillment
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
router.register("carriers", fulfillment.CarrierViewSet)
urlpatterns = router.urls + [
    path("provinces/", ProvinceView.as_view()),
    path("tariffs/<uuid:pk>/activation/", ActivationView.as_view()),
    path("products/<uuid:product_id>/shipping/", ProductShippingView.as_view()),
    path("products/<uuid:product_id>/quote/", ShippingQuoteView.as_view()),
    path("group-quote/", fulfillment.GroupQuoteView.as_view()),
    path("requests/", fulfillment.RequestListView.as_view()),
    path("requests/<uuid:pk>/", fulfillment.RequestDetailView.as_view()),
    path("requests/<uuid:pk>/events/", fulfillment.EventListView.as_view()),
    path("requests/<uuid:pk>/progress/", fulfillment.ProgressView.as_view()),
    path("requests/<uuid:pk>/ready/", fulfillment.ReadyView.as_view()),
    path("requests/<uuid:pk>/specification-review/", fulfillment.SpecificationReviewView.as_view()),
    path("requests/<uuid:pk>/assignment/", fulfillment.AssignmentView.as_view()),
    path("requests/<uuid:pk>/exception/", fulfillment.OperationalExceptionView.as_view()),
    path("requests/<uuid:pk>/shipments/", fulfillment.ShipmentCreateView.as_view()),
    path("requests/<uuid:pk>/manifest-correction/", fulfillment.ManifestBatchView.as_view()),
    path("requests/<uuid:pk>/documents/", fulfillment.ShippingDocumentView.as_view()),
    path("shipments/<uuid:pk>/", fulfillment.ShipmentEditView.as_view()),
    path("shipments/<uuid:pk>/correction/", fulfillment.ShipmentCorrectionView.as_view()),
    path("shipments/<uuid:pk>/hand-over/", fulfillment.HandOverView.as_view()),
    path("shipments/<uuid:pk>/cancel/", fulfillment.ShipmentCancelView.as_view()),
    path("shipments/<uuid:pk>/tracking/", fulfillment.TrackingView.as_view()),
    path("shipments/<uuid:pk>/status/", fulfillment.TrackingStatusView.as_view()),
    path("shipments/<uuid:pk>/resolution/", fulfillment.FailureResolutionView.as_view()),
    path("shipments/<uuid:pk>/delivery-link/", fulfillment.DeliveryLinkView.as_view()),
    path("shipments/<uuid:pk>/revoke-link/", fulfillment.RevokeLinkView.as_view()),
    path("unconfirmed-deliveries/", fulfillment.UnconfirmedQueueView.as_view()),
    path("orders/<uuid:pk>/fulfillment/", fulfillment.OrderFulfillmentView.as_view()),
    path("delivery-policy/", fulfillment.PolicyView.as_view()),
    path("delivery/info/", fulfillment.LinkInfoView.as_view()),
    path("delivery/request-code/", fulfillment.RequestCodeView.as_view()),
    path("delivery/verify-code/", fulfillment.VerifyCodeView.as_view()),
    path("delivery/unconfirmed/", fulfillment.UnconfirmedDeliveryView.as_view()),
]
