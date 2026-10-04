import os
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

User = settings.AUTH_USER_MODEL


class Category(models.Model):
    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=60, unique=True)
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=100)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Issue(models.Model):
    class Status(models.TextChoices):
        NOT_STARTED = "NOT_STARTED", "Not Started"
        IN_PROGRESS = "IN_PROGRESS", "Under Process"
        BLOCKED = "BLOCKED", "Blocked"
        COMPLETED = "COMPLETED", "Completed"

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        URGENT = "URGENT", "Urgent"

    class Resolution(models.TextChoices):
        RESOLVED = "RESOLVED", "Resolved"
        DUPLICATE = "DUPLICATE", "Duplicate"
        INVALID = "INVALID", "Invalid"
        WONT_FIX = "WONT_FIX", "Won't fix"

    title = models.CharField(max_length=120)
    description = models.TextField(max_length=2000)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="issues")
    priority = models.CharField(max_length=6, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=11, choices=Status.choices, default=Status.NOT_STARTED)

    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="raised_issues")
    tagged_member = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.PROTECT, related_name="tagged_issues"
    )
    faculty = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.PROTECT, related_name="faculty_issues"
    )
    assignees = models.ManyToManyField(
        User,
        through="IssueAssignee",
        through_fields=("issue", "user"),
        related_name="assigned_issues",
        blank=True,
    )

    is_escalated = models.BooleanField(default=False)
    escalated_at = models.DateTimeField(null=True, blank=True)
    resolution = models.CharField(max_length=9, choices=Resolution.choices, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    reopened_count = models.PositiveSmallIntegerField(default=0)
    last_reopened_at = models.DateTimeField(null=True, blank=True)
    upvote_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["category", "status"]),
            models.Index(fields=["created_by", "-created_at"]),
            models.Index(fields=["is_escalated", "status"]),
        ]

    def __str__(self):
        return f"#{self.pk} {self.title}"

    @property
    def cycle_started_at(self):
        """Start of the current open cycle: raised, or last reopened."""
        return self.last_reopened_at or self.created_at


class IssueAssignee(models.Model):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="assignments")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="issue_assignments")
    assigned_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    assigned_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["issue", "user"], name="uniq_issue_assignee")
        ]


class IssueUpdate(models.Model):
    """Official progress note by COSA / assignees / faculty."""

    issue = models.ForeignKey(Issue, on_delete=models.PROTECT, related_name="updates")
    author = models.ForeignKey(User, on_delete=models.PROTECT, related_name="issue_updates")
    body = models.TextField(max_length=1000)
    status_to = models.CharField(max_length=11, choices=Issue.Status.choices, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["issue", "created_at"])]


class Remark(models.Model):
    """Reply by the student who raised the issue."""

    class Type(models.TextChoices):
        REMARK = "REMARK", "Remark"
        REOPEN = "REOPEN", "Reopen reason"
        ESCALATION = "ESCALATION", "Escalation reason"

    issue = models.ForeignKey(Issue, on_delete=models.PROTECT, related_name="remarks")
    author = models.ForeignKey(User, on_delete=models.PROTECT, related_name="issue_remarks")
    type = models.CharField(max_length=10, choices=Type.choices, default=Type.REMARK)
    body = models.TextField(max_length=500)
    created_at = models.DateTimeField(default=timezone.now)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["issue", "author", "created_at"])]


class IssueUpvote(models.Model):
    """A student supporting an issue ('I'm facing this too').

    Private supports count toward the number on the card, but the student's
    name is hidden from other students (COSA still sees it).
    """

    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="upvotes")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    is_private = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["issue", "user"], name="uniq_issue_upvote")]


class IssueEvent(models.Model):
    """Append-only history of every change."""

    issue = models.ForeignKey(Issue, on_delete=models.PROTECT, related_name="events")
    actor = models.ForeignKey(User, null=True, on_delete=models.PROTECT, related_name="+")
    actor_role = models.CharField(max_length=80, blank=True)
    action = models.CharField(max_length=30)
    field = models.CharField(max_length=40, blank=True)
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["issue", "created_at"])]


def attachment_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()[:10]
    return f"issues/{instance.issue_id}/{uuid.uuid4().hex}{ext}"


class Attachment(models.Model):
    issue = models.ForeignKey(Issue, on_delete=models.PROTECT, related_name="attachments")
    update = models.ForeignKey(
        IssueUpdate, null=True, blank=True, on_delete=models.PROTECT, related_name="attachments"
    )
    remark = models.ForeignKey(
        Remark, null=True, blank=True, on_delete=models.PROTECT, related_name="attachments"
    )
    file = models.FileField(upload_to=attachment_path)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    uploaded_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)
