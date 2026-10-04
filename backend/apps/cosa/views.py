import django_filters
from django.db import IntegrityError, transaction
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.notifications.models import Notification
from apps.notifications.services import notify, notify_everyone

from .models import Club, ClubMembership, Committee, CommitteeApplication, CommitteeMember, CosaPost, Event
from .permissions import IsCosa, IsCosaOrReadOnly, can_edit_event, is_club_head
from .serializers import (
    ApplicationDecisionSerializer,
    ClubDetailSerializer,
    ClubMembershipSerializer,
    ClubSerializer,
    CommitteeApplicationSerializer,
    CommitteeMemberSerializer,
    CommitteeSerializer,
    CosaPostSerializer,
    EventSerializer,
)

Kind = Notification.Kind
NO_DELETE = ["get", "post", "patch", "head", "options"]


# ---------------------------------------------------------------------------
# Clubs
# ---------------------------------------------------------------------------
class ClubViewSet(viewsets.ModelViewSet):
    """All clubs. COSA creates/edits clubs; club heads manage members."""

    permission_classes = [IsCosaOrReadOnly]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_fields = ["kind", "is_active"]
    search_fields = ["name", "description"]
    lookup_field = "slug"
    http_method_names = NO_DELETE

    def get_queryset(self):
        now = timezone.now()
        qs = Club.objects.select_related("secretary_role").annotate(
            member_count=Count("memberships", distinct=True),
            upcoming_event_count=Count(
                "events",
                filter=Q(events__starts_at__gte=now, events__status=Event.Status.SCHEDULED),
                distinct=True,
            ),
        )
        if self.action == "retrieve":
            qs = qs.prefetch_related(
                Prefetch("memberships", queryset=ClubMembership.objects.select_related("user"))
            )
        if getattr(self, "swagger_fake_view", False):
            return qs
        if not self.request.user.is_cosa:
            qs = qs.filter(is_active=True)
        return qs

    def get_serializer_class(self):
        return ClubDetailSerializer if self.action == "retrieve" else ClubSerializer

    @extend_schema(request=ClubMembershipSerializer, responses=ClubMembershipSerializer)
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def members(self, request, slug=None):
        """Add or update a member (COSA or the club's head/coordinator)."""
        club = get_object_or_404(Club, slug=slug)
        if not (request.user.is_cosa or is_club_head(request.user, club.pk)):
            raise PermissionDenied("Only COSA or the club head can manage members.")
        s = ClubMembershipSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        m, _ = ClubMembership.objects.update_or_create(
            club=club, user=s.validated_data["user"], defaults={"position": s.validated_data["position"]}
        )
        return Response(ClubMembershipSerializer(m, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"], url_path="members/(?P<user_id>[0-9]+)/remove", permission_classes=[IsAuthenticated])
    def remove_member(self, request, slug=None, user_id=None):
        club = get_object_or_404(Club, slug=slug)
        if not (request.user.is_cosa or is_club_head(request.user, club.pk)):
            raise PermissionDenied("Only COSA or the club head can manage members.")
        deleted, _ = ClubMembership.objects.filter(club=club, user_id=user_id).delete()
        return Response({"removed": bool(deleted)})


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
class EventFilter(django_filters.FilterSet):
    when = django_filters.ChoiceFilter(
        choices=[("upcoming", "Upcoming"), ("past", "Past"), ("today", "Today")], method="filter_when"
    )
    club = django_filters.CharFilter(field_name="club__slug")
    from_date = django_filters.DateTimeFilter(field_name="starts_at", lookup_expr="gte")
    to_date = django_filters.DateTimeFilter(field_name="starts_at", lookup_expr="lte")

    class Meta:
        model = Event
        fields = ["status", "club"]

    def filter_when(self, qs, name, value):
        now = timezone.now()
        if value == "upcoming":
            # Not finished yet and not cancelled: includes ongoing events.
            return qs.filter(status=Event.Status.SCHEDULED).filter(
                Q(ends_at__gte=now) | Q(ends_at__isnull=True, starts_at__gte=now)
            ).order_by("starts_at")
        if value == "past":
            return qs.filter(
                Q(ends_at__lt=now) | Q(ends_at__isnull=True, starts_at__lt=now)
            ).order_by("-starts_at")
        if value == "today":
            today = timezone.localdate()
            return qs.filter(starts_at__date=today)
        return qs


class EventViewSet(viewsets.ModelViewSet):
    """All clubs' events. ?when=upcoming for the upcoming list, ?club=<slug> per club."""

    serializer_class = EventSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_class = EventFilter
    search_fields = ["title", "description", "venue", "club__name", "organising_body"]
    ordering_fields = ["starts_at", "created_at"]
    http_method_names = NO_DELETE

    def get_queryset(self):
        return Event.objects.select_related("club", "created_by")

    def perform_create(self, serializer):
        user = self.request.user
        club = serializer.validated_data.get("club")
        if not (user.is_cosa or (club and is_club_head(user, club.pk))):
            raise PermissionDenied("Only COSA or a club head/coordinator can create events.")
        event = serializer.save(created_by=user)
        when = timezone.localtime(event.starts_at).strftime("%d %b, %I:%M %p")
        notify_everyone(kind=Kind.EVENT, title=f"New event: {event.title}",
                        message=f"{event.club.name if event.club else event.organising_body} · {when} · {event.venue}",
                        actor=user, target_type="event", target_id=event.pk)

    def perform_update(self, serializer):
        if not can_edit_event(self.request.user, serializer.instance):
            raise PermissionDenied("You can't edit this event.")
        new_club = serializer.validated_data.get("club")
        if new_club and not (self.request.user.is_cosa or is_club_head(self.request.user, new_club.pk)):
            raise PermissionDenied("You can't move this event to that club.")
        serializer.save()

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        event = self.get_object()
        if not can_edit_event(request.user, event):
            raise PermissionDenied("You can't cancel this event.")
        if event.status != Event.Status.CANCELLED:
            event.status = Event.Status.CANCELLED
            event.save(update_fields=["status", "updated_at"])
            notify_everyone(kind=Kind.EVENT, title=f"Cancelled: {event.title}", actor=request.user,
                            target_type="event", target_id=event.pk)
        return Response(self.get_serializer(event).data)


# ---------------------------------------------------------------------------
# Committees
# ---------------------------------------------------------------------------
class CommitteeViewSet(viewsets.ModelViewSet):
    """Committee formation lists (for events or issues). COSA manages them."""

    serializer_class = CommitteeSerializer
    permission_classes = [IsCosaOrReadOnly]
    filterset_fields = ["event", "issue", "is_active"]
    search_fields = ["name", "purpose"]
    http_method_names = NO_DELETE

    def get_queryset(self):
        return Committee.objects.select_related("event", "issue", "created_by").prefetch_related(
            Prefetch("members", queryset=CommitteeMember.objects.select_related("user"))
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        user = self.request.user
        if user.is_authenticated:
            ctx["my_applications"] = dict(
                CommitteeApplication.objects.filter(applicant=user).values_list("committee_id", "status")
            )
        return ctx

    def perform_create(self, serializer):
        committee = serializer.save(created_by=self.request.user)
        if committee.applications_open:
            notify_everyone(kind=Kind.COMMITTEE, title=f"Applications open: {committee.name}",
                            message=committee.purpose[:300], actor=self.request.user,
                            target_type="committee", target_id=committee.pk)

    @extend_schema(request=CommitteeMemberSerializer, responses=CommitteeMemberSerializer)
    @action(detail=True, methods=["post"], url_path="members")
    def add_member(self, request, pk=None):
        committee = self.get_object()
        s = CommitteeMemberSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        member, created = CommitteeMember.objects.update_or_create(
            committee=committee, user=s.validated_data["user"],
            defaults={"position": s.validated_data["position"], "added_by": request.user},
        )
        if created:
            notify([member.user], kind=Kind.COMMITTEE, title=f"You were added to {committee.name}",
                   actor=request.user, target_type="committee", target_id=committee.pk)
        return Response(CommitteeMemberSerializer(member, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"], url_path="members/(?P<user_id>[0-9]+)/remove")
    def remove_member(self, request, pk=None, user_id=None):
        committee = self.get_object()
        deleted, _ = CommitteeMember.objects.filter(committee=committee, user_id=user_id).delete()
        return Response({"removed": bool(deleted)})

    @extend_schema(request=CommitteeApplicationSerializer, responses=CommitteeApplicationSerializer)
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def apply(self, request, pk=None):
        committee = self.get_object()
        if not committee.applications_open:
            raise ValidationError({"detail": "Applications are closed."})
        if committee.members.filter(user=request.user).exists():
            raise ValidationError({"detail": "You are already a member."})
        s = CommitteeApplicationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                app = CommitteeApplication.objects.create(
                    committee=committee, applicant=request.user, statement=s.validated_data["statement"]
                )
        except IntegrityError:
            raise ValidationError({"detail": "You have already applied."})
        return Response(CommitteeApplicationSerializer(app, context={"request": request}).data, status=201)

    @action(detail=True, methods=["get"], permission_classes=[IsCosa])
    def applications(self, request, pk=None):
        committee = self.get_object()
        qs = committee.applications.select_related("applicant", "committee")
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        page = self.paginate_queryset(qs)
        data = CommitteeApplicationSerializer(page, many=True, context={"request": request}).data
        return self.get_paginated_response(data)

    @extend_schema(request=ApplicationDecisionSerializer, responses=CommitteeApplicationSerializer)
    @action(detail=True, methods=["post"], url_path="applications/(?P<app_id>[0-9]+)/decide",
            permission_classes=[IsCosa])
    def decide(self, request, pk=None, app_id=None):
        committee = self.get_object()
        s = ApplicationDecisionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            app = get_object_or_404(
                CommitteeApplication.objects.select_for_update(), pk=app_id, committee=committee
            )
            if app.status != CommitteeApplication.Status.PENDING:
                raise ValidationError({"detail": "This application was already decided."})
            app.status = s.validated_data["decision"]
            app.reviewed_by = request.user
            app.reviewed_at = timezone.now()
            app.save(update_fields=["status", "reviewed_by", "reviewed_at"])
            if app.status == CommitteeApplication.Status.ACCEPTED:
                CommitteeMember.objects.get_or_create(
                    committee=committee, user=app.applicant,
                    defaults={"position": s.validated_data["position"], "added_by": request.user},
                )
        verdict = "accepted" if app.status == CommitteeApplication.Status.ACCEPTED else "not accepted"
        notify([app.applicant], kind=Kind.COMMITTEE, title=f"Your application to {committee.name} was {verdict}",
               actor=request.user, target_type="committee", target_id=committee.pk)
        return Response(CommitteeApplicationSerializer(app, context={"request": request}).data)


# ---------------------------------------------------------------------------
# COSA Updates feed
# ---------------------------------------------------------------------------
class CosaPostViewSet(viewsets.ModelViewSet):
    serializer_class = CosaPostSerializer
    permission_classes = [IsCosaOrReadOnly]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_fields = ["category", "is_pinned"]
    search_fields = ["title", "body"]
    http_method_names = NO_DELETE

    def get_queryset(self):
        qs = CosaPost.objects.select_related("author", "category").prefetch_related("linked_issues")
        archived = self.request.query_params.get("archived") == "true"
        if archived and self.request.user.is_cosa:
            return qs.filter(is_archived=True)
        return qs.filter(is_archived=False)

    def perform_create(self, serializer):
        user = self.request.user
        post = serializer.save(author=user, author_role=user.mailbox.role_name if user.mailbox else "")
        notify_everyone(kind=Kind.COSA_POST, title=post.title, message=post.body[:300], actor=user,
                        target_type="post", target_id=post.pk)

    def perform_update(self, serializer):
        user = self.request.user
        if not (serializer.instance.author_id == user.pk or user.can_manage_issues):
            raise PermissionDenied("Only the author or the Gen Secs/President can edit this post.")
        serializer.save()

    def _flag(self, request, field, value):
        if not request.user.can_manage_issues:
            raise PermissionDenied("Only the Gen Secs or President can do this.")
        post = get_object_or_404(CosaPost, pk=self.kwargs["pk"])
        setattr(post, field, value)
        post.save(update_fields=[field, "updated_at"])
        return Response(self.get_serializer(post).data)

    @action(detail=True, methods=["post"])
    def pin(self, request, pk=None):
        return self._flag(request, "is_pinned", True)

    @action(detail=True, methods=["post"])
    def unpin(self, request, pk=None):
        return self._flag(request, "is_pinned", False)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        return self._flag(request, "is_archived", True)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        return self._flag(request, "is_archived", False)
