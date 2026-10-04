from datetime import timedelta

import django_filters
from django.conf import settings
from django.db.models import Count, Q
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from . import permissions as perms
from . import services
from .models import Category, Issue, IssueUpdate, Remark
from .serializers import (
    AssignSerializer,
    CategorySerializer,
    FacultySerializer,
    IssueCreateSerializer,
    IssueDetailSerializer,
    IssueEditSerializer,
    IssueEventSerializer,
    IssueListSerializer,
    IssueUpdateSerializer,
    MyIssueSerializer,
    ReasonSerializer,
    RemarkSerializer,
    StatusChangeSerializer,
)

ESCALATION_DAYS = settings.PORTAL_RULES["ESCALATION_AFTER_DAYS"]
BOARD_COLUMN_SIZE = 25


def base_issue_queryset():
    return Issue.objects.select_related("category", "created_by", "faculty", "tagged_member").prefetch_related(
        "assignees"
    )


def overdue_q():
    cutoff = timezone.now() - timedelta(days=ESCALATION_DAYS)
    return Q(cycle_start__lte=cutoff) & ~Q(status=Issue.Status.COMPLETED)


class IssueFilter(django_filters.FilterSet):
    status = django_filters.MultipleChoiceFilter(choices=Issue.Status.choices)
    priority = django_filters.MultipleChoiceFilter(choices=Issue.Priority.choices)
    category = django_filters.ModelMultipleChoiceFilter(queryset=Category.objects.all())
    is_escalated = django_filters.BooleanFilter()
    assignee = django_filters.CharFilter(method="filter_assignee", help_text="user id or 'me'")
    mine = django_filters.BooleanFilter(method="filter_mine", help_text="issues I raised")
    my_category = django_filters.BooleanFilter(method="filter_my_category")
    unassigned = django_filters.BooleanFilter(method="filter_unassigned")
    overdue = django_filters.BooleanFilter(method="filter_overdue")
    created_after = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model = Issue
        fields = ["status", "priority", "category", "is_escalated"]

    def filter_assignee(self, qs, name, value):
        user_id = self.request.user.pk if value == "me" else value
        if not str(user_id).isdigit():
            return qs.none()
        return qs.filter(assignees__id=user_id)

    def filter_mine(self, qs, name, value):
        return qs.filter(created_by=self.request.user) if value else qs

    def filter_my_category(self, qs, name, value):
        mb = self.request.user.mailbox
        if not value:
            return qs
        return qs.filter(category_id=mb.category_id) if mb and mb.category_id else qs.none()

    def filter_unassigned(self, qs, name, value):
        return qs.filter(assignees__isnull=value).distinct() if value is not None else qs

    def filter_overdue(self, qs, name, value):
        qs = qs.annotate(cycle_start=Coalesce("last_reopened_at", "created_at"))
        return qs.filter(overdue_q()) if value else qs.exclude(overdue_q())


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CategorySerializer
    pagination_class = None
    queryset = Category.objects.filter(is_active=True)


class IssueViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Issues. There is deliberately no DELETE."""

    filterset_class = IssueFilter
    search_fields = ["title", "description"]
    ordering_fields = ["created_at", "updated_at", "priority", "upvote_count"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = base_issue_queryset()
        if self.action == "retrieve":
            qs = qs.prefetch_related("attachments")
        return qs

    def get_serializer_class(self):
        return {
            "list": IssueListSerializer,
            "retrieve": IssueDetailSerializer,
            "create": IssueCreateSerializer,
            "partial_update": IssueEditSerializer,
            "update": IssueEditSerializer,
            "mine": MyIssueSerializer,
        }.get(self.action, IssueDetailSerializer)

    def _detail(self, issue, code=status.HTTP_200_OK):
        issue = self.get_queryset().prefetch_related("attachments").get(pk=issue.pk)
        return Response(IssueDetailSerializer(issue, context=self.get_serializer_context()).data, status=code)

    # ----- CRUD ---------------------------------------------------------
    @extend_schema(request=IssueCreateSerializer, responses=IssueDetailSerializer)
    def create(self, request, *args, **kwargs):
        s = IssueCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        issue = services.create_issue(
            request.user,
            title=data["title"],
            description=data["description"],
            category=data["category"],
            priority=data["priority"],
            tagged_member=data.get("tagged_member"),
            files=request.FILES.getlist("attachments"),
        )
        return self._detail(issue, status.HTTP_201_CREATED)

    @extend_schema(request=IssueEditSerializer, responses=IssueDetailSerializer)
    def partial_update(self, request, *args, **kwargs):
        issue = self.get_object()
        s = IssueEditSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        services.edit_issue(request.user, issue, s.validated_data)
        return self._detail(issue)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    # ----- board & personal lists ---------------------------------------
    @extend_schema(responses={200: dict})
    @action(detail=False, methods=["get"])
    def board(self, request):
        """Kanban: first 25 cards per status column + full counts.
        Accepts the same filters as the list. Use ?status=X&page=N on the list
        endpoint to load more of one column."""
        qs = self.filter_queryset(self.get_queryset())
        counts = dict(qs.order_by().values_list("status").annotate(n=Count("id", distinct=True)))
        columns = []
        for value, label in Issue.Status.choices:
            items = qs.filter(status=value).order_by("-created_at")[:BOARD_COLUMN_SIZE]
            columns.append(
                {
                    "status": value,
                    "label": label,
                    "count": counts.get(value, 0),
                    "issues": IssueListSerializer(items, many=True, context=self.get_serializer_context()).data,
                }
            )
        return Response({"columns": columns})

    @action(detail=False, methods=["get"])
    def mine(self, request):
        """'Issues by you' with escalate / reopen availability."""
        qs = self.filter_queryset(self.get_queryset()).filter(created_by=request.user)
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(MyIssueSerializer(page, many=True, context=self.get_serializer_context()).data)

    # ----- workflow actions ---------------------------------------------
    @extend_schema(request=StatusChangeSerializer, responses=IssueDetailSerializer)
    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        issue = self.get_object()
        s = StatusChangeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.change_status(
            request.user,
            issue,
            s.validated_data["status"],
            update_body=s.validated_data.get("update", ""),
            resolution=s.validated_data.get("resolution", ""),
            files=request.FILES.getlist("attachments"),
        )
        return self._detail(issue)

    @extend_schema(request=AssignSerializer, responses=IssueDetailSerializer)
    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        issue = self.get_object()
        s = AssignSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.set_assignees(request.user, issue, s.validated_data["assignees"])
        return self._detail(issue)

    @extend_schema(request=FacultySerializer, responses=IssueDetailSerializer)
    @action(detail=True, methods=["post"])
    def faculty(self, request, pk=None):
        issue = self.get_object()
        s = FacultySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.set_faculty(request.user, issue, s.validated_data["faculty"])
        return self._detail(issue)

    @extend_schema(request=ReasonSerializer, responses=IssueDetailSerializer)
    @action(detail=True, methods=["post"])
    def escalate(self, request, pk=None):
        issue = self.get_object()
        s = ReasonSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.escalate(request.user, issue, s.validated_data["reason"])
        return self._detail(issue)

    @extend_schema(request=ReasonSerializer, responses=IssueDetailSerializer)
    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        issue = self.get_object()
        s = ReasonSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.reopen(request.user, issue, s.validated_data["reason"])
        return self._detail(issue)

    @extend_schema(request=None, responses={200: dict})
    @action(detail=True, methods=["post"])
    def upvote(self, request, pk=None):
        issue = self.get_object()
        upvoted, count = services.toggle_upvote(request.user, issue)
        return Response({"upvoted": upvoted, "upvote_count": count})

    # ----- threads ------------------------------------------------------
    @extend_schema(methods=["post"], request=IssueUpdateSerializer, responses=IssueUpdateSerializer)
    @action(detail=True, methods=["get", "post"], serializer_class=IssueUpdateSerializer)
    def updates(self, request, pk=None):
        issue = self.get_object()
        if request.method == "POST":
            s = IssueUpdateSerializer(data=request.data)
            s.is_valid(raise_exception=True)
            upd = services.post_update(request.user, issue, s.validated_data["body"], request.FILES.getlist("files"))
            return Response(IssueUpdateSerializer(upd, context=self.get_serializer_context()).data, status=201)
        qs = issue.updates.select_related("author").prefetch_related("attachments")
        return Response(IssueUpdateSerializer(qs, many=True, context=self.get_serializer_context()).data)

    @extend_schema(methods=["post"], request=RemarkSerializer, responses=RemarkSerializer)
    @action(detail=True, methods=["get", "post"], serializer_class=RemarkSerializer)
    def remarks(self, request, pk=None):
        issue = self.get_object()
        if request.method == "POST":
            s = RemarkSerializer(data=request.data)
            s.is_valid(raise_exception=True)
            remark = services.post_remark(request.user, issue, s.validated_data["body"], request.FILES.getlist("files"))
            return Response(RemarkSerializer(remark, context=self.get_serializer_context()).data, status=201)
        qs = issue.remarks.select_related("author").prefetch_related("attachments")
        data = RemarkSerializer(qs, many=True, context=self.get_serializer_context()).data
        left = services.remarks_left_today(request.user, issue) if perms.can_remark(request.user, issue) else 0
        return Response({"results": data, "remarks_left_today": left})

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        issue = self.get_object()
        qs = issue.events.select_related("actor")
        return Response(IssueEventSerializer(qs, many=True, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"])
    def timeline(self, request, pk=None):
        """Updates + remarks merged in time order, for the issue page."""
        issue = self.get_object()
        ctx = self.get_serializer_context()
        items = [
            {"kind": "update", "created_at": u.created_at, "data": IssueUpdateSerializer(u, context=ctx).data}
            for u in issue.updates.select_related("author").prefetch_related("attachments")
        ] + [
            {"kind": "remark", "created_at": r.created_at, "data": RemarkSerializer(r, context=ctx).data}
            for r in issue.remarks.select_related("author").prefetch_related("attachments")
        ]
        items.sort(key=lambda i: i["created_at"])
        return Response(items)


class UpdateEditView(generics.UpdateAPIView):
    serializer_class = IssueUpdateSerializer
    http_method_names = ["patch"]
    queryset = IssueUpdate.objects.select_related("issue", "author")

    def update(self, request, *args, **kwargs):
        upd = self.get_object()
        body = request.data.get("body", "")
        if not body or len(body) > 1000:
            return Response({"body": "1 to 1000 characters."}, status=400)
        services.edit_update(request.user, upd, body)
        return Response(IssueUpdateSerializer(upd, context=self.get_serializer_context()).data)


class RemarkEditView(generics.UpdateAPIView):
    serializer_class = RemarkSerializer
    http_method_names = ["patch"]
    queryset = Remark.objects.select_related("issue", "author")

    def update(self, request, *args, **kwargs):
        remark = self.get_object()
        body = request.data.get("body", "")
        if not body or len(body) > 500:
            return Response({"body": "1 to 500 characters."}, status=400)
        services.edit_remark(request.user, remark, body)
        return Response(RemarkSerializer(remark, context=self.get_serializer_context()).data)


class CosaDashboardView(APIView):
    """Counts for the COSA dashboard tiles."""

    @extend_schema(responses={200: dict})
    def get(self, request):
        user = request.user
        if not user.is_cosa:
            raise PermissionDenied("COSA only.")
        open_qs = Issue.objects.exclude(status=Issue.Status.COMPLETED).annotate(
            cycle_start=Coalesce("last_reopened_at", "created_at")
        )
        mb = user.mailbox
        data = {
            "open_total": open_qs.count(),
            "by_status": dict(Issue.objects.order_by().values_list("status").annotate(n=Count("id"))),
            "unassigned": open_qs.filter(assignees__isnull=True).count(),
            "assigned_to_me": open_qs.filter(assignees=user).count(),
            "my_category": open_qs.filter(category_id=mb.category_id).count() if mb.category_id else None,
            "escalated": open_qs.filter(is_escalated=True).count(),
            "overdue": open_qs.filter(overdue_q()).count(),
            "by_category": list(
                open_qs.order_by().values("category__name").annotate(n=Count("id")).order_by("-n")
            ),
        }
        return Response(data)
