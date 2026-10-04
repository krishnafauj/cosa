from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import ClubMembership


def is_club_head(user, club_id) -> bool:
    if not club_id:
        return False
    return ClubMembership.objects.filter(
        club_id=club_id,
        user=user,
        position__in=[ClubMembership.Position.HEAD, ClubMembership.Position.COORDINATOR],
    ).exists()


def can_edit_event(user, event) -> bool:
    return user.is_cosa or event.created_by_id == user.pk or is_club_head(user, event.club_id)


class IsCosaOrReadOnly(BasePermission):
    message = "Only COSA members can do this."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.method in SAFE_METHODS or request.user.is_cosa


class IsCosa(BasePermission):
    message = "Only COSA members can do this."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_cosa)
