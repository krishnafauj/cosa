from rest_framework import serializers

from .models import RoleMailbox, User


class UserBriefSerializer(serializers.ModelSerializer):
    """Public view of a user. Email is shown only to COSA and to the user themself."""

    role_name = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "full_name", "email", "user_type", "role_name", "avatar_url"]

    def get_role_name(self, obj):
        return obj.mailbox.role_name if obj.mailbox else None

    def get_email(self, obj):
        request = self.context.get("request")
        viewer = getattr(request, "user", None)
        if viewer and viewer.is_authenticated and (viewer.is_cosa or viewer.pk == obj.pk):
            return obj.email
        # Role emails are public anyway (official contact addresses).
        return obj.email if obj.is_cosa or obj.is_faculty else None


class MeSerializer(serializers.ModelSerializer):
    cosa_level = serializers.CharField(read_only=True)
    role_name = serializers.SerializerMethodField()
    owned_category = serializers.SerializerMethodField()
    is_cosa = serializers.BooleanField(read_only=True)
    can_manage_issues = serializers.BooleanField(read_only=True)
    can_raise_issues = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "avatar_url",
            "roll_number",
            "user_type",
            "is_cosa",
            "cosa_level",
            "role_name",
            "owned_category",
            "can_manage_issues",
            "can_raise_issues",
        ]
        read_only_fields = ["id", "email", "avatar_url", "user_type"]

    def get_role_name(self, obj):
        return obj.mailbox.role_name if obj.mailbox else None

    def get_owned_category(self, obj):
        mb = obj.mailbox
        if mb and mb.category_id:
            return {"id": mb.category_id, "name": mb.category.name}
        return None

    def get_can_raise_issues(self, obj):
        return obj.is_student


class RoleMailboxSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", default=None, read_only=True)
    user_id = serializers.SerializerMethodField()

    class Meta:
        model = RoleMailbox
        fields = [
            "id",
            "email",
            "role_name",
            "level",
            "category",
            "category_name",
            "held_by_name",
            "academic_year",
            "user_id",
        ]

    def get_user_id(self, obj):
        users = self.context.get("users_by_email", {})
        return users.get(obj.email)


class GoogleLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField()


class DevLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(required=False, allow_blank=True)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
