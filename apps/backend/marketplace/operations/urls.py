from django.urls import path

from . import console_api as api

urlpatterns = [
    path("work/", api.QueueList.as_view()),
    path("work/<str:kind>/<uuid:pk>/claim/", api.ClaimView.as_view()),
    path("work/<str:kind>/<uuid:pk>/command/", api.CommandView.as_view()),
    path("work/<str:kind>/<uuid:pk>/timeline/", api.TimelineView.as_view()),
    path("policy/", api.PolicyView.as_view()),
    path("policy/history/", api.PolicyHistoryView.as_view()),
    path("suspensions/", api.SuspensionList.as_view()),
    path("dashboard/", api.DashboardView.as_view()),
    path("dashboard/<str:metric>/", api.DrillDownView.as_view()),
]
