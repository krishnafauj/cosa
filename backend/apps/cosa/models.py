import os
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

User = settings.AUTH_USER_MODEL


def _unique_name(folder, filename):
    ext = os.path.splitext(filename)[1].lower()[:10]
    return f"{folder}/{uuid.uuid4().hex}{ext}"


def club_logo_path(instance, filename):
    return _unique_name("clubs", filename)


def event_poster_path(instance, filename):
    return _unique_name("events", filename)


def post_file_path(instance, filename):
    return _unique_name("posts", filename)


class Club(models.Model):
    class Kind(models.TextChoices):
        CULTURAL = "CULTURAL", "Cultural"
        TECHNICAL = "TECHNICAL", "Technical"
        SPORTS = "SPORTS", "Sports"
        LITERARY = "LITERARY", "Literary"
        SOCIAL = "SOCIAL", "Social"
        OTHER = "OTHER", "Other"

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.OTHER)
    description = models.TextField(max_length=2000, blank=True)
    logo = models.ImageField(upload_to=club_logo_path, null=True, blank=True)
    contact_email = models.EmailField(blank=True)
    secretary_role = models.ForeignKey(
        "accounts.RoleMailbox", null=True, blank=True, on_delete=models.SET_NULL, related_name="clubs",
        help_text="COSA secretary the club reports to, e.g. Cultural or SciTech.",
    )
    members = models.ManyToManyField(User, through="ClubMembership", related_name="clubs", blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ClubMembership(models.Model):
    class Position(models.TextChoices):
        HEAD = "HEAD", "Head"
        COORDINATOR = "COORDINATOR", "Coordinator"
        MEMBER = "MEMBER", "Member"

    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="club_memberships")
    position = models.CharField(max_length=11, choices=Position.choices, default=Position.MEMBER)
    joined_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["club", "user"], name="uniq_club_member")]


class Event(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        CANCELLED = "CANCELLED", "Cancelled"

    title = models.CharField(max_length=150)
    club = models.ForeignKey(Club, null=True, blank=True, on_delete=models.PROTECT, related_name="events")
    organising_body = models.CharField(max_length=120, blank=True, help_text="If not a club, e.g. 'COSA'.")
    description = models.TextField(max_length=4000, blank=True)
    venue = models.CharField(max_length=150, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    poster = models.ImageField(upload_to=event_poster_path, null=True, blank=True)
    registration_url = models.URLField(blank=True)
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.SCHEDULED)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="created_events")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["starts_at"]
        indexes = [models.Index(fields=["status", "starts_at"]), models.Index(fields=["club", "starts_at"])]

    def __str__(self):
        return self.title

    @property
    def phase(self) -> str:
        """UPCOMING / ONGOING / COMPLETED / CANCELLED, derived from time."""
        if self.status == self.Status.CANCELLED:
            return "CANCELLED"
        now = timezone.now()
        end = self.ends_at or self.starts_at
        if now < self.starts_at:
            return "UPCOMING"
        if now <= end:
            return "ONGOING"
        return "COMPLETED"


class Committee(models.Model):
    name = models.CharField(max_length=150)
    purpose = models.TextField(max_length=2000, blank=True)
    event = models.ForeignKey(Event, null=True, blank=True, on_delete=models.PROTECT, related_name="committees")
    issue = models.ForeignKey(
        "issues.Issue", null=True, blank=True, on_delete=models.PROTECT, related_name="committees"
    )
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="created_committees")
    formed_on = models.DateField(default=timezone.localdate)
    applications_open_until = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-formed_on", "name"]

    def __str__(self):
        return self.name

    @property
    def applications_open(self) -> bool:
        return bool(self.is_active and self.applications_open_until and timezone.now() <= self.applications_open_until)


class CommitteeMember(models.Model):
    class Position(models.TextChoices):
        HEAD = "HEAD", "Head"
        COORDINATOR = "COORDINATOR", "Coordinator"
        MEMBER = "MEMBER", "Member"

    committee = models.ForeignKey(Committee, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="committee_memberships")
    position = models.CharField(max_length=11, choices=Position.choices, default=Position.MEMBER)
    added_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    added_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["position", "added_at"]
        constraints = [models.UniqueConstraint(fields=["committee", "user"], name="uniq_committee_member")]


class CommitteeApplication(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"

    committee = models.ForeignKey(Committee, on_delete=models.CASCADE, related_name="applications")
    applicant = models.ForeignKey(User, on_delete=models.CASCADE, related_name="committee_applications")
    statement = models.TextField(max_length=1000)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["committee", "applicant"], name="uniq_committee_application")
        ]


class CosaPost(models.Model):
    """COSA Updates feed: announcements and notices."""

    title = models.CharField(max_length=150)
    body = models.TextField(max_length=2000)
    category = models.ForeignKey(
        "issues.Category", null=True, blank=True, on_delete=models.SET_NULL, related_name="posts"
    )
    attachment = models.FileField(upload_to=post_file_path, null=True, blank=True)
    linked_issues = models.ManyToManyField("issues.Issue", blank=True, related_name="posts")
    author = models.ForeignKey(User, on_delete=models.PROTECT, related_name="cosa_posts")
    author_role = models.CharField(max_length=80, blank=True)
    is_pinned = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_pinned", "-created_at"]
        indexes = [models.Index(fields=["is_archived", "-is_pinned", "-created_at"])]

    def __str__(self):
        return self.title
