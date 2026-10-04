from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """The notifications page. Filter with ?is_read=false and ?kind=EVENT."""

    serializer_class = NotificationSerializer
    filterset_fields = ["is_read", "kind", "target_type"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).select_related("actor")

    @extend_schema(responses={200: {"type": "object", "properties": {"unread": {"type": "integer"}}}})
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"unread": self.get_queryset().filter(is_read=False).count()})

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        updated = self.get_queryset().filter(pk=pk).update(is_read=True)
        return Response({"updated": updated})

    @action(detail=False, methods=["post"], url_path="read-all")
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"updated": updated, "at": timezone.now()})
