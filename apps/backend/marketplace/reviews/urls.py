from django.urls import path

from . import api

urlpatterns = [
    path("entitlements/", api.EntitlementList.as_view()),
    path("entitlements/<uuid:pk>/", api.EntitlementView.as_view()),
    path("entitlements/<uuid:pk>/images/", api.ImageUpload.as_view()),
    path("public/", api.PublicList.as_view()),
    path("public/aggregate/", api.PublicAggregate.as_view()),
    path("public/<uuid:pk>/", api.PublicDetail.as_view()),
    path("public/<uuid:pk>/images/<uuid:file_id>/", api.PublicImage.as_view()),
    path("internal/", api.InternalList.as_view()),
    path("internal/aggregate/", api.InternalAggregate.as_view()),
    path("internal/<uuid:pk>/", api.InternalDetail.as_view()),
    path("internal/<uuid:pk>/images/<uuid:file_id>/", api.InternalImage.as_view()),
    path("<uuid:pk>/reply/", api.ReplyView.as_view()),
    path("<uuid:pk>/reports/", api.ReportView.as_view()),
    path("reports/", api.ReportQueue.as_view()),
    path("reports/<uuid:pk>/moderation/", api.ModerationView.as_view()),
    path("<uuid:pk>/audit/", api.AuditView.as_view()),
]
