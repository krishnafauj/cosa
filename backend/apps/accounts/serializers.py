from django.utils import timezone
from rest_framework import serializers

from .models import RoleMailbox, User

MAX_PHOTO_MB = 2


def picture_url(user, request=None) -> str:
    """Uploaded profile photo if any, otherwise the Google picture."""
    if user.photo:
        url = user.photo.url
        if request is not None and url.startswith("/"):
            return request.build_absolute_uri(url)
        return url
    return user.avatar_url or ""


class UserBriefSerializer(serializers.ModelSerializer):
    """Public view of a user. Email is shown only to COSA and to the user themself."""

    role_name = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "full_name", "email", "user_type", "role_name", "avatar_url", "branch", "year_of_study"]

    def get_avatar_url(self, obj) -> str:
        return picture_url(obj, self.context.get("request"))

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
    """The logged-in user. PATCH (JSON or multipart) updates the profile."""

    cosa_level = serializers.CharField(read_only=True)
    role_name = serializers.SerializerMethodField()
    owned_category = serializers.SerializerMethodField()
    is_cosa = serializers.BooleanField(read_only=True)
    can_manage_issues = serializers.BooleanField(read_only=True)
    can_raise_issues = serializers.SerializerMethodField()
    profile_complete = serializers.BooleanField(read_only=True)
    year_of_study = serializers.IntegerField(read_only=True)
    branch_label = serializers.CharField(source="get_branch_display", read_only=True)
    avatar_url = serializers.SerializerMethodField()
    has_photo = serializers.SerializerMethodField()
    photo = serializers.ImageField(write_only=True, required=False)
    semester = serializers.IntegerField(min_value=1, max_value=8, required=False, allow_null=True)
    batch_year = serializers.IntegerField(min_value=2015, max_value=2100, required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "avatar_url",
            "has_photo",
            "photo",
            "roll_number",
            "branch",
            "branch_label",
            "batch_year",
            "semester",
            "year_of_study",
            "about",
            "user_type",
            "is_cosa",
            "cosa_level",
            "role_name",
            "owned_category",
            "can_manage_issues",
            "can_raise_issues",
            "profile_complete",
        ]
        read_only_fields = ["id", "email", "user_type"]

    def get_role_name(self, obj) -> str | None:
        return obj.mailbox.role_name if obj.mailbox else None

    def get_owned_category(self, obj) -> dict | None:
        mb = obj.mailbox
        if mb and mb.category_id:
            return {"id": mb.category_id, "name": mb.category.name}
        return None

    def get_can_raise_issues(self, obj) -> bool:
        return obj.is_student  # the form itself asks incomplete profiles to finish first

    def get_avatar_url(self, obj) -> str:
        return picture_url(obj, self.context.get("request"))

    def get_has_photo(self, obj) -> bool:
        return bool(obj.photo)

    def validate_photo(self, value):
        if value.size > MAX_PHOTO_MB * 1024 * 1024:
            raise serializers.ValidationError(f"Photo must be under {MAX_PHOTO_MB} MB.")
        return value

    def validate_full_name(self, value):
        value = value.strip()
        if self.instance and self.instance.user_type == User.UserType.STUDENT and not value:
            raise serializers.ValidationError("Name is required.")
        return value

    def validate_roll_number(self, value):
        value = value.strip().upper()
        # Roll numbers taken from the email can't be changed.
        if self.instance and self.instance.roll_number and value != self.instance.roll_number:
            from .services import roll_match

            if roll_match(self.instance.email):
                raise serializers.ValidationError("Roll number comes from your college email.")
        return value

    def update(self, instance, validated_data):
        user = super().update(instance, validated_data)
        if user.user_type == User.UserType.STUDENT and user.profile_complete and not user.profile_completed_at:
            user.profile_completed_at = timezone.now()
            user.save(update_fields=["profile_completed_at"])
        return user


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



class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
