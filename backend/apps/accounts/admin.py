from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import RoleMailbox, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["email"]
    list_display = ["email", "full_name", "user_type", "branch", "batch_year", "semester", "last_login"]
    list_filter = ["user_type", "branch", "batch_year", "is_active", "is_staff"]
    search_fields = ["email", "full_name", "roll_number"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("full_name", "roll_number", "avatar_url", "photo", "user_type")}),
        ("Student details", {"fields": ("branch", "batch_year", "semester", "about", "profile_completed_at")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "full_name", "user_type")}),
    )
    filter_horizontal = ["groups"]


@admin.register(RoleMailbox)
class RoleMailboxAdmin(admin.ModelAdmin):
    list_display = ["role_name", "email", "level", "category", "held_by_name", "academic_year", "is_active"]
    list_filter = ["level", "is_active"]
    list_editable = ["held_by_name", "academic_year", "is_active"]
    search_fields = ["email", "role_name", "held_by_name"]
