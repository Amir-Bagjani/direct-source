from django.urls import path

from . import api

urlpatterns = [
    path("tickets/", api.TicketListView.as_view()),
    path("tickets/<uuid:pk>/", api.TicketView.as_view()),
    path("tickets/<uuid:pk>/messages/", api.MessageView.as_view()),
    path("tickets/<uuid:pk>/assign/", api.AssignmentView.as_view()),
    path("tickets/<uuid:pk>/status/", api.TicketStatusView.as_view()),
    path("files/", api.AttachmentView.as_view()),
]
