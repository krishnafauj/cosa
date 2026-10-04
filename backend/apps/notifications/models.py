from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    class Kind(models.TextChoices):
        ISSUE_CREATED = "ISSUE_CREATED", "New issue"
        ISSUE_ASSIGNED = "ISSUE_ASSIGNED", "Assigned to you"
        ISSUE_TAGGED = "ISSUE_TAGGED", "Tagged on an issue"
        ISSUE_STATUS = "ISSUE_STATUS", "Status changed"
        ISSUE_UPDATE = "ISSUE_UPDATE", "New update"
        ISSUE_REMARK = "ISSUE_REMARK", "New remark"
        ISSUE_ESCALATED = "ISSUE_ESCALATED", "Escalated to President"
        ISSUE_REOPENED = "ISSUE_REOPENED", "Issue reopened"
        ISSUE_OVERDUE = "ISSUE_OVERDUE", "Issue overdue"
        COSA_POST = "COSA_POST", "COSA update"
        EVENT = "EVENT", "Event"
        COMMITTEE = "COMMITTEE", "Committee"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=160)
    message = models.CharField(max_length=300, blank=True)
    target_type = models.CharField(max_length=20, blank=True)  # issue / event / post / committee
    target_id = models.PositiveBigIntegerField(null=True, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
            models.Index(fields=["recipient", "-created_at"]),
        ]
