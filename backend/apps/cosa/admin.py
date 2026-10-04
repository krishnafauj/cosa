from django.contrib import admin

from .models import Club, ClubMembership, Committee, CommitteeApplication, CommitteeMember, CosaPost, Event


class ClubMembershipInline(admin.TabularInline):
    model = ClubMembership
    extra = 0
    raw_id_fields = ["user"]


@admin.register(Club)
class ClubAdmin(admin.ModelAdmin):
    list_display = ["name", "kind", "secretary_role", "is_active"]
    list_filter = ["kind", "is_active"]
    search_fields = ["name"]
    prepopulated_fields = {"slug": ["name"]}
    inlines = [ClubMembershipInline]


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["title", "club", "organising_body", "starts_at", "venue", "status"]
    list_filter = ["status", "club"]
    search_fields = ["title", "venue"]
    date_hierarchy = "starts_at"
    raw_id_fields = ["created_by"]


class CommitteeMemberInline(admin.TabularInline):
    model = CommitteeMember
    extra = 0
    raw_id_fields = ["user", "added_by"]


@admin.register(Committee)
class CommitteeAdmin(admin.ModelAdmin):
    list_display = ["name", "event", "issue", "formed_on", "applications_open_until", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name"]
    raw_id_fields = ["event", "issue", "created_by"]
    inlines = [CommitteeMemberInline]


@admin.register(CommitteeApplication)
class CommitteeApplicationAdmin(admin.ModelAdmin):
    list_display = ["committee", "applicant", "status", "created_at"]
    list_filter = ["status"]
    raw_id_fields = ["applicant", "reviewed_by"]


@admin.register(CosaPost)
class CosaPostAdmin(admin.ModelAdmin):
    list_display = ["title", "author_role", "is_pinned", "is_archived", "created_at"]
    list_filter = ["is_pinned", "is_archived", "category"]
    search_fields = ["title", "body"]
    raw_id_fields = ["author"]
    filter_horizontal = ["linked_issues"]
