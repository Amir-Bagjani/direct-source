from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from marketplace.accounts import api, revision_api
from marketplace.common.health import live, ready
from marketplace.operations import api as operations

urlpatterns = [
    path("api/v1/logistics/", include("marketplace.logistics.urls")),
    path("api/v1/catalog/", include("marketplace.catalog.urls")),
    path("api/v1/auth/email/", api.ChangeEmailView.as_view()),
    path("api/v1/businesses/<uuid:pk>/revisions/", revision_api.RevisionListView.as_view()),
    path("api/v1/business-revisions/<uuid:pk>/", revision_api.RevisionDetailView.as_view()),
    path("api/v1/business-revisions/<uuid:pk>/claim/", revision_api.RevisionClaimView.as_view()),
    path("api/v1/business-revisions/<uuid:pk>/review/", revision_api.RevisionReviewView.as_view()),
    path("api/v1/operations/business-revision-queue/", revision_api.RevisionQueueView.as_view()),
    path("api/v1/operations/operators/<uuid:pk>/access/", operations.OperatorAccessView.as_view()),
    path("api/v1/operations/businesses/<uuid:pk>/reassign/", operations.ReassignView.as_view()),
    path("health/live/", live),
    path("health/ready/", ready),
    path("admin/", admin.site.urls),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/auth/register/", api.RegisterView.as_view()),
    path("api/v1/auth/login/", api.LoginView.as_view()),
    path("api/v1/auth/refresh/", api.RefreshView.as_view()),
    path("api/v1/auth/logout/", api.LogoutView.as_view()),
    path("api/v1/auth/me/", api.MeView.as_view()),
    path("api/v1/auth/email/request/", api.VerifyEmailRequestView.as_view()),
    path("api/v1/auth/email/confirm/", api.VerifyEmailView.as_view()),
    path("api/v1/auth/password/request/", api.ResetRequestView.as_view()),
    path("api/v1/auth/password/reset/", api.ResetView.as_view()),
    path("api/v1/businesses/", api.BusinessListView.as_view()),
    path("api/v1/businesses/<uuid:pk>/", api.BusinessDetailView.as_view()),
    path("api/v1/businesses/<uuid:pk>/verification/", api.SectionsView.as_view()),
    path("api/v1/businesses/<uuid:pk>/verification/identity/", api.IdentityView.as_view()),
    path("api/v1/businesses/<uuid:pk>/verification/activity/", api.ActivityView.as_view()),
    path("api/v1/businesses/<uuid:pk>/verification/submit/", api.SubmitView.as_view()),
    path("api/v1/businesses/<uuid:pk>/verification/claim/", api.ClaimView.as_view()),
    path("api/v1/businesses/<uuid:pk>/verification/review/", api.ReviewView.as_view()),
    path("api/v1/businesses/<uuid:pk>/verification/reopen/", api.ReopenView.as_view()),
    path("api/v1/businesses/<uuid:pk>/controlled-access/", api.ControlledAccessView.as_view()),
    path("api/v1/businesses/<uuid:pk>/files/", operations.UploadView.as_view()),
    path("api/v1/files/<uuid:pk>/download/", operations.DownloadView.as_view()),
    path("api/v1/operations/verification-queue/", operations.QueueView.as_view()),
    path("api/v1/inbox/", operations.InboxView.as_view()),
]
