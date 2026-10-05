from django.contrib import admin

from .models import Attachment, Category, Issue, IssueAssignee, IssueEvent, IssueUpdate, Remark


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "is_active", "sort_order"]
    list_editable = ["is_active", "sort_order"]
    prepopulated_fields = {"slug": ["name"]}


class AssigneeInline(admin.TabularInline):
    model = IssueAssignee
    fk_name = "issue"
    extra = 0
    raw_id_fields = ["user", "assigned_by"]


class ReadOnlyInline(admin.TabularInline):
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class UpdateInline(ReadOnlyInline):
    model = IssueUpdate
    fields = ["author", "body", "status_to", "created_at"]
    readonly_fields = fields


class RemarkInline(ReadOnlyInline):
    model = Remark
    fields = ["author", "type", "body", "created_at"]
    readonly_fields = fields


class EventInline(ReadOnlyInline):
    model = IssueEvent
    fields = ["actor", "action", "field", "old_value", "new_value", "created_at"]
    readonly_fields = fields


@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
    list_display = ["id", "title", "category", "priority", "status", "is_escalated", "created_by", "created_at"]
    list_filter = ["status", "priority", "category", "is_escalated"]
    search_fields = ["title", "description", "created_by__email"]
    raw_id_fields = ["created_by", "faculty"]
    filter_horizontal = ["tagged_members"]
    readonly_fields = ["created_at", "updated_at", "upvote_count", "reopened_count"]
    inlines = [AssigneeInline, UpdateInline, RemarkInline, EventInline]
    date_hierarchy = "created_at"

    def has_delete_permission(self, request, obj=None):
        return False  # issues are never deleted


admin.site.register(Attachment)
