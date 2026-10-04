from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from . import permissions as perms
from .models import Attachment, Category, Issue, IssueEvent, IssueUpdate, Remark

User = get_user_model()


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description"]


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "url", "original_name", "content_type", "size", "created_at"]

    def get_url(self, obj):
        url = obj.file.url
        request = self.context.get("request")
        if request and url.startswith("/"):
            return request.build_absolute_uri(url)
        return url


class IssueListSerializer(serializers.ModelSerializer):
    """Compact card for the board and lists."""

    category = CategorySerializer(read_only=True)
    created_by = UserBriefSerializer(read_only=True)
    assignees = UserBriefSerializer(many=True, read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "title",
            "category",
            "priority",
            "status",
            "status_label",
            "created_by",
            "assignees",
            "is_escalated",
            "reopened_count",
            "upvote_count",
            "created_at",
            "updated_at",
        ]


class MyIssueSerializer(IssueListSerializer):
    """'Issues by you' — adds escalate/reopen availability."""

    can_escalate = serializers.SerializerMethodField()
    can_reopen = serializers.SerializerMethodField()
    escalation_available_at = serializers.SerializerMethodField()

    class Meta(IssueListSerializer.Meta):
        fields = IssueListSerializer.Meta.fields + [
            "can_escalate",
            "can_reopen",
            "escalation_available_at",
            "completed_at",
        ]

    def get_can_escalate(self, obj):
        return perms.can_escalate(self.context["request"].user, obj)

    def get_can_reopen(self, obj):
        return perms.can_reopen(self.context["request"].user, obj)

    def get_escalation_available_at(self, obj):
        return perms.escalation_available_at(obj)


class IssueDetailSerializer(IssueListSerializer):
    tagged_member = UserBriefSerializer(read_only=True)
    faculty = UserBriefSerializer(read_only=True)
    attachments = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    has_upvoted = serializers.SerializerMethodField()
    escalation_available_at = serializers.SerializerMethodField()

    class Meta(IssueListSerializer.Meta):
        fields = IssueListSerializer.Meta.fields + [
            "description",
            "tagged_member",
            "faculty",
            "escalated_at",
            "resolution",
            "completed_at",
            "last_reopened_at",
            "attachments",
            "permissions",
            "has_upvoted",
            "escalation_available_at",
        ]

    def get_attachments(self, obj):
        # Only files attached to the issue itself (not to updates/remarks).
        items = [a for a in obj.attachments.all() if a.update_id is None and a.remark_id is None]
        return AttachmentSerializer(items, many=True, context=self.context).data

    def get_permissions(self, obj):
        return perms.permission_flags(self.context["request"].user, obj)

    def get_has_upvoted(self, obj):
        user = self.context["request"].user
        return obj.upvotes.filter(user=user).exists()

    def get_escalation_available_at(self, obj):
        return perms.escalation_available_at(obj)


class IssueCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120)
    description = serializers.CharField(max_length=2000)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.filter(is_active=True))
    priority = serializers.ChoiceField(choices=Issue.Priority.choices, default=Issue.Priority.MEDIUM)
    tagged_member = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False, allow_null=True
    )
    attachments = serializers.ListField(
        child=serializers.FileField(), required=False, allow_empty=True, write_only=True
    )


class IssueEditSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120, required=False)
    description = serializers.CharField(max_length=2000, required=False)
    priority = serializers.ChoiceField(choices=Issue.Priority.choices, required=False)
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.filter(is_active=True), required=False
    )


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Issue.Status.choices)
    update = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    resolution = serializers.ChoiceField(
        choices=Issue.Resolution.choices, required=False, allow_blank=True, default=""
    )
    attachments = serializers.ListField(child=serializers.FileField(), required=False)


class AssignSerializer(serializers.Serializer):
    assignees = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), many=True
    )


class FacultySerializer(serializers.Serializer):
    faculty = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True, user_type=User.UserType.FACULTY),
        allow_null=True,
    )


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)


class IssueUpdateSerializer(serializers.ModelSerializer):
    author = UserBriefSerializer(read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    files = serializers.ListField(child=serializers.FileField(), required=False, write_only=True)

    class Meta:
        model = IssueUpdate
        fields = ["id", "author", "body", "status_to", "attachments", "files", "created_at", "edited_at"]
        read_only_fields = ["id", "author", "status_to", "attachments", "created_at", "edited_at"]


class RemarkSerializer(serializers.ModelSerializer):
    author = UserBriefSerializer(read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    files = serializers.ListField(child=serializers.FileField(), required=False, write_only=True)

    class Meta:
        model = Remark
        fields = ["id", "author", "type", "body", "attachments", "files", "created_at", "edited_at"]
        read_only_fields = ["id", "author", "type", "attachments", "created_at", "edited_at"]


class IssueEventSerializer(serializers.ModelSerializer):
    actor = UserBriefSerializer(read_only=True)

    class Meta:
        model = IssueEvent
        fields = ["id", "actor", "actor_role", "action", "field", "old_value", "new_value", "created_at"]
