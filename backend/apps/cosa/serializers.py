from django.contrib.auth import get_user_model
from django.utils.text import slugify
from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer
from apps.issues.models import Issue

from .models import (
    Club,
    ClubMembership,
    Committee,
    CommitteeApplication,
    CommitteeMember,
    CosaPost,
    Event,
)

User = get_user_model()


class ClubMembershipSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(source="user", queryset=User.objects.filter(is_active=True), write_only=True)

    class Meta:
        model = ClubMembership
        fields = ["id", "user", "user_id", "position", "joined_at"]
        read_only_fields = ["id", "joined_at"]


class ClubSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)
    upcoming_event_count = serializers.IntegerField(read_only=True)
    secretary_role_name = serializers.CharField(source="secretary_role.role_name", default=None, read_only=True)

    class Meta:
        model = Club
        fields = [
            "id",
            "name",
            "slug",
            "kind",
            "description",
            "logo",
            "contact_email",
            "secretary_role",
            "secretary_role_name",
            "is_active",
            "member_count",
            "upcoming_event_count",
        ]
        read_only_fields = ["slug"]

    def create(self, validated_data):
        validated_data["slug"] = slugify(validated_data["name"])[:100]
        return super().create(validated_data)


class ClubDetailSerializer(ClubSerializer):
    memberships = ClubMembershipSerializer(many=True, read_only=True)

    class Meta(ClubSerializer.Meta):
        fields = ClubSerializer.Meta.fields + ["memberships"]


class EventSerializer(serializers.ModelSerializer):
    club_name = serializers.CharField(source="club.name", default=None, read_only=True)
    phase = serializers.CharField(read_only=True)
    created_by = UserBriefSerializer(read_only=True)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id",
            "title",
            "club",
            "club_name",
            "organising_body",
            "description",
            "venue",
            "starts_at",
            "ends_at",
            "poster",
            "registration_url",
            "status",
            "phase",
            "created_by",
            "can_edit",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["status", "created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        starts = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends < starts:
            raise serializers.ValidationError({"ends_at": "End must be after start."})
        if not attrs.get("club", getattr(self.instance, "club", None)) and not attrs.get(
            "organising_body", getattr(self.instance, "organising_body", "")
        ):
            raise serializers.ValidationError({"organising_body": "Pick a club or name the organising body."})
        return attrs

    def get_can_edit(self, obj):
        from .permissions import can_edit_event

        return can_edit_event(self.context["request"].user, obj)


class CommitteeMemberSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(source="user", queryset=User.objects.filter(is_active=True), write_only=True)

    class Meta:
        model = CommitteeMember
        fields = ["id", "user", "user_id", "position", "added_at"]
        read_only_fields = ["id", "added_at"]


class CommitteeSerializer(serializers.ModelSerializer):
    members = CommitteeMemberSerializer(many=True, read_only=True)
    event_title = serializers.CharField(source="event.title", default=None, read_only=True)
    issue_title = serializers.CharField(source="issue.title", default=None, read_only=True)
    applications_open = serializers.BooleanField(read_only=True)
    created_by = UserBriefSerializer(read_only=True)
    my_application_status = serializers.SerializerMethodField()

    class Meta:
        model = Committee
        fields = [
            "id",
            "name",
            "purpose",
            "event",
            "event_title",
            "issue",
            "issue_title",
            "formed_on",
            "applications_open_until",
            "applications_open",
            "is_active",
            "members",
            "created_by",
            "my_application_status",
            "created_at",
        ]
        read_only_fields = ["created_by", "created_at"]

    def get_my_application_status(self, obj):
        mine = self.context.get("my_applications", {})
        return mine.get(obj.pk)


class CommitteeApplicationSerializer(serializers.ModelSerializer):
    applicant = UserBriefSerializer(read_only=True)
    committee_name = serializers.CharField(source="committee.name", read_only=True)

    class Meta:
        model = CommitteeApplication
        fields = ["id", "committee", "committee_name", "applicant", "statement", "status", "reviewed_at", "created_at"]
        read_only_fields = ["committee", "applicant", "status", "reviewed_at", "created_at"]


class ApplicationDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["ACCEPTED", "REJECTED"])
    position = serializers.ChoiceField(choices=CommitteeMember.Position.choices, default=CommitteeMember.Position.MEMBER)


class CosaPostSerializer(serializers.ModelSerializer):
    author = UserBriefSerializer(read_only=True)
    category_name = serializers.CharField(source="category.name", default=None, read_only=True)
    linked_issues = serializers.PrimaryKeyRelatedField(queryset=Issue.objects.all(), many=True, required=False)

    class Meta:
        model = CosaPost
        fields = [
            "id",
            "title",
            "body",
            "category",
            "category_name",
            "attachment",
            "linked_issues",
            "author",
            "author_role",
            "is_pinned",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["author", "author_role", "is_pinned", "is_archived", "created_at", "updated_at"]
