from django.urls import path

from . import api

urlpatterns = [
    path("", api.CaseListView.as_view()),
    path("orders/<uuid:order_id>/claims/", api.ClaimView.as_view()),
    path("<uuid:pk>/", api.CaseView.as_view()),
    path("<uuid:pk>/notes/", api.NoteView.as_view()),
    path("<uuid:pk>/close/", api.CloseView.as_view()),
    path("claims/<uuid:claim_id>/response/", api.ResponseView.as_view()),
    path("claims/<uuid:claim_id>/decision/", api.DecisionView.as_view()),
    path("remedies/<uuid:pk>/progress/", api.ProgressView.as_view()),
    path("remedies/<uuid:pk>/waive/", api.WaiveView.as_view()),
]
