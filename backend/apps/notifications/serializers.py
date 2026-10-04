from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", default=None, read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "kind",
            "title",
            "message",
            "actor_name",
            "target_type",
            "target_id",
            "is_read",
            "created_at",
        ]
        read_only_fields = fields
