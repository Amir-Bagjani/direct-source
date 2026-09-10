from django.urls import path

from . import api

urlpatterns = [
    path("cancellation-queue/", api.OrderCancellationQueueView.as_view()),
    path("<uuid:pk>/cancellation/decision/", api.OrderCancellationDecisionView.as_view()),
    path("<uuid:pk>/cancellation/resolve/", api.OrderCancellationOperatorView.as_view()),
    path("<uuid:pk>/reorder/", api.ReorderView.as_view()),
    path("checkout/", api.CheckoutView.as_view()),
    path("", api.OrderListView.as_view()),
    path("<uuid:pk>/", api.OrderView.as_view()),
    path("<uuid:pk>/decision/", api.OrderDecisionView.as_view()),
    path("<uuid:pk>/cancel/", api.OrderCancelView.as_view()),
    path("groups/<uuid:pk>/", api.OrderGroupView.as_view()),
    path("addresses/", api.DeliveryAddressView.as_view()),
    path("addresses/<uuid:pk>/", api.DeliveryAddressDetailView.as_view()),
    path("cart/address/", api.CartAddressView.as_view()),
    path("cart/manufacturers/<uuid:manufacturer_id>/shipping/", api.BulkShippingView.as_view()),
    path("cart/", api.CartView.as_view()),
    path("cart/products/<uuid:product_id>/", api.CartProductView.as_view()),
    path("cart/products/<uuid:product_id>/shipping/", api.CartShippingView.as_view()),
    path("cart/destination/", api.CartDestinationView.as_view()),
    path("cart/preview/", api.CartPreviewView.as_view()),
]
