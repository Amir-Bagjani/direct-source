from django.urls import path

from . import api

urlpatterns = [
    path("rates/", api.RateView.as_view()),
    path("orders/<uuid:pk>/", api.FinanceView.as_view()),
    path("orders/<uuid:pk>/pay/", api.PaymentView.as_view()),
    path("orders/<uuid:pk>/refund/", api.RefundView.as_view()),
    path("orders/<uuid:pk>/settle/", api.SettlementView.as_view()),
]
