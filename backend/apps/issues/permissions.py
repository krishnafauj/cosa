"""Issue permission rules.

Every rule from the requirements doc lives here so views, serializers and
services all agree. Functions avoid extra queries when `issue.assignees` has
been prefetched.
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import Issue

RULES = settings.PORTAL_RULES


def _assignee_ids(issue):
    return {u.pk for u in issue.assignees.all()}


def is_assignee(user, issue) -> bool:
    return user.pk in _assignee_ids(issue)


def owns_category(user, issue) -> bool:
    mb = user.mailbox
    return bool(mb and mb.category_id and mb.category_id == issue.category_id)


def can_raise(user) -> bool:
    """Only students raise issues. COSA members cannot."""
    return user.is_student


def can_assign(user) -> bool:
    """Assign/reassign members and faculty: Gen Secs + President."""
    return user.can_manage_issues


def can_edit(user, issue) -> bool:
    """Edit details, change status, post official updates."""
    if user.can_manage_issues:
        return True
    if issue.faculty_id == user.pk:
        return True
    if is_assignee(user, issue):
        return True
    return user.is_cosa and owns_category(user, issue)


can_post_update = can_edit


def can_remark(user, issue) -> bool:
    return issue.created_by_id == user.pk


def escalation_available_at(issue):
    return issue.cycle_started_at + timedelta(days=RULES["ESCALATION_AFTER_DAYS"])


def can_escalate(user, issue) -> bool:
    return (
        issue.created_by_id == user.pk
        and issue.status != Issue.Status.COMPLETED
        and not issue.is_escalated
        and timezone.now() >= escalation_available_at(issue)
    )


def can_reopen(user, issue) -> bool:
    if issue.status != Issue.Status.COMPLETED:
        return False
    if issue.reopened_count >= RULES["MAX_REOPENS"]:
        return False
    if user.can_manage_issues:
        return True
    if issue.created_by_id != user.pk:
        return False
    window = timedelta(days=RULES["REOPEN_WINDOW_DAYS"])
    return issue.completed_at is not None and timezone.now() <= issue.completed_at + window


def can_upvote(user, issue) -> bool:
    return user.is_student and issue.created_by_id != user.pk


def permission_flags(user, issue) -> dict:
    return {
        "can_edit": can_edit(user, issue),
        "can_assign": can_assign(user),
        "can_post_update": can_post_update(user, issue),
        "can_remark": can_remark(user, issue),
        "can_escalate": can_escalate(user, issue),
        "can_reopen": can_reopen(user, issue),
        "can_upvote": can_upvote(user, issue),
    }
