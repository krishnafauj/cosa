"""Daily job: remind assignees and Gen Secs about open issues older than the
escalation window (default 5 days). Schedule with cron / Render cron job:
    python manage.py send_overdue_reminders
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.issues.models import Issue
from apps.issues.services import gen_secs
from apps.notifications.models import Notification
from apps.notifications.services import notify


class Command(BaseCommand):
    help = "Notify about overdue open issues."

    def handle(self, *args, **options):
        days = settings.PORTAL_RULES["ESCALATION_AFTER_DAYS"]
        cutoff = timezone.now() - timedelta(days=days)
        overdue = (
            Issue.objects.exclude(status=Issue.Status.COMPLETED)
            .annotate(cycle_start=Coalesce("last_reopened_at", "created_at"))
            .filter(cycle_start__lte=cutoff)
            .prefetch_related("assignees")
            .iterator(chunk_size=200)
        )
        secs = gen_secs()
        count = 0
        for issue in overdue:
            notify(
                list(issue.assignees.all()) + secs,
                kind=Notification.Kind.ISSUE_OVERDUE,
                title=f"Overdue ({days}+ days): {issue.title}",
                target_type="issue",
                target_id=issue.pk,
            )
            count += 1
        self.stdout.write(self.style.SUCCESS(f"Reminded about {count} overdue issues."))
