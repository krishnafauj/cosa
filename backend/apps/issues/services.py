"""All state changes to issues go through these functions.

Each one: checks permissions, locks the row (select_for_update) so two people
can't race the same transition, writes the change, records history, and queues
notifications for after the commit.
"""
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import RoleMailbox
from apps.notifications.models import Notification
from apps.notifications.services import notify

from . import permissions as perms
from .models import Attachment, Issue, IssueAssignee, IssueEvent, IssueUpdate, IssueUpvote, Remark

User = get_user_model()
RULES = settings.PORTAL_RULES
Kind = Notification.Kind

ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _lock(issue: Issue) -> Issue:
    locked = Issue.objects.select_for_update().get(pk=issue.pk)
    # Re-fetch assignees for permission checks on the fresh row.
    return Issue.objects.prefetch_related("assignees").get(pk=locked.pk)


def _role(user) -> str:
    return user.mailbox.role_name if user.mailbox else user.get_user_type_display()


def _event(issue, actor, action, field="", old="", new=""):
    IssueEvent.objects.create(
        issue=issue,
        actor=actor,
        actor_role=_role(actor) if actor else "System",
        action=action,
        field=field,
        old_value="" if old is None else str(old),
        new_value="" if new is None else str(new),
    )


def _users_for_roles(**filters):
    emails = RoleMailbox.objects.filter(is_active=True, **filters).values_list("email", flat=True)
    return list(User.objects.filter(email__in=list(emails), is_active=True))


def gen_secs():
    return _users_for_roles(level=RoleMailbox.Level.GEN_SEC)


def president():
    return _users_for_roles(level=RoleMailbox.Level.PRESIDENT)


def _watchers(issue):
    """People who care about progress: raiser, assignees, faculty."""
    people = set(issue.assignees.all())
    people.add(issue.created_by)
    if issue.faculty_id:
        people.add(issue.faculty)
    return people


def _ensure(condition: bool, message: str):
    if not condition:
        raise PermissionDenied(message)


def _save_attachments(issue, user, files, *, update=None, remark=None):
    files = list(files or [])
    if not files:
        return []
    if len(files) > RULES["MAX_ATTACHMENTS"]:
        raise ValidationError({"attachments": f"At most {RULES['MAX_ATTACHMENTS']} files."})
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    saved = []
    for f in files:
        ctype = getattr(f, "content_type", "") or ""
        if ctype not in ALLOWED_UPLOAD_TYPES:
            raise ValidationError({"attachments": f"{f.name}: only images and PDFs are allowed."})
        if f.size > max_bytes:
            raise ValidationError({"attachments": f"{f.name}: max {settings.MAX_UPLOAD_MB} MB."})
        saved.append(
            Attachment.objects.create(
                issue=issue,
                update=update,
                remark=remark,
                file=f,
                original_name=f.name[:255],
                content_type=ctype,
                size=f.size,
                uploaded_by=user,
            )
        )
    return saved


# ---------------------------------------------------------------------------
# create / edit
# ---------------------------------------------------------------------------
@transaction.atomic
def create_issue(user, *, title, description, category, priority, tagged_member=None, files=None):
    _ensure(user.is_student, "Only students can raise issues.")
    _ensure(user.profile_complete, "Complete your profile before raising an issue.")
    if not category.is_active:
        raise ValidationError({"category": "This category is not accepting issues."})
    if tagged_member is not None and not tagged_member.is_cosa:
        raise ValidationError({"tagged_member": "You can only tag a COSA member."})

    issue = Issue.objects.create(
        title=title,
        description=description,
        category=category,
        priority=priority,
        created_by=user,
        tagged_member=tagged_member,
    )
    _event(issue, user, "created", new=issue.title)

    # Auto-route to the category's secretaries.
    owners = _users_for_roles(category=category)
    for owner in owners:
        IssueAssignee.objects.create(issue=issue, user=owner, assigned_by=None)
        _event(issue, None, "auto_assigned", "assignees", new=owner.email)

    _save_attachments(issue, user, files)

    title_txt = f"New {category.name} issue: {issue.title}"
    notify(owners + gen_secs(), kind=Kind.ISSUE_CREATED, title=title_txt, actor=user,
           target_type="issue", target_id=issue.pk)
    if tagged_member:
        notify([tagged_member], kind=Kind.ISSUE_TAGGED, title=f"You were tagged: {issue.title}",
               actor=user, target_type="issue", target_id=issue.pk)
    return issue


EDITABLE_FIELDS = {"title", "description", "priority", "category"}


@transaction.atomic
def edit_issue(user, issue, changes: dict):
    issue = _lock(issue)
    _ensure(perms.can_edit(user, issue), "You can't edit this issue.")
    if "category" in changes and not perms.can_assign(user):
        raise PermissionDenied("Only the Gen Secs or President can move an issue to another category.")
    dirty = []
    for field, value in changes.items():
        if field not in EDITABLE_FIELDS:
            continue
        old = getattr(issue, field)
        if old != value:
            setattr(issue, field, value)
            dirty.append(field)
            _event(issue, user, "edited", field, old, value)
    if dirty:
        issue.save(update_fields=dirty + ["updated_at"])
    return issue


# ---------------------------------------------------------------------------
# assignment
# ---------------------------------------------------------------------------
@transaction.atomic
def set_assignees(user, issue, new_users):
    issue = _lock(issue)
    _ensure(perms.can_assign(user), "Only the Gen Secs or President can assign members.")
    if any(u.pk == issue.created_by_id for u in new_users):
        raise ValidationError({"assignees": "The student who raised the issue can't be assigned."})

    current = {u.pk: u for u in issue.assignees.all()}
    wanted = {u.pk: u for u in new_users}
    added = [u for pk, u in wanted.items() if pk not in current]
    removed = [u for pk, u in current.items() if pk not in wanted]

    IssueAssignee.objects.filter(issue=issue, user_id__in=[u.pk for u in removed]).delete()
    IssueAssignee.objects.bulk_create(
        [IssueAssignee(issue=issue, user=u, assigned_by=user) for u in added]
    )
    for u in removed:
        _event(issue, user, "unassigned", "assignees", old=u.email)
    for u in added:
        _event(issue, user, "assigned", "assignees", new=u.email)
    if added or removed:
        issue.save(update_fields=["updated_at"])

    notify(added, kind=Kind.ISSUE_ASSIGNED, title=f"Assigned to you: {issue.title}",
           actor=user, target_type="issue", target_id=issue.pk)
    return issue


@transaction.atomic
def set_faculty(user, issue, faculty):
    issue = _lock(issue)
    _ensure(perms.can_assign(user), "Only the Gen Secs or President can assign faculty.")
    if faculty is not None and not faculty.is_faculty:
        raise ValidationError({"faculty": "That user is not a faculty member."})
    old = issue.faculty
    if (old and old.pk) == (faculty and faculty.pk):
        return issue
    issue.faculty = faculty
    issue.save(update_fields=["faculty", "updated_at"])
    _event(issue, user, "faculty", "faculty", old and old.email, faculty and faculty.email)
    if faculty:
        notify([faculty], kind=Kind.ISSUE_ASSIGNED, title=f"Assigned to you: {issue.title}",
               actor=user, target_type="issue", target_id=issue.pk)
    return issue


# ---------------------------------------------------------------------------
# status / updates / remarks
# ---------------------------------------------------------------------------
@transaction.atomic
def change_status(user, issue, status, *, update_body="", resolution="", files=None):
    issue = _lock(issue)
    _ensure(perms.can_edit(user, issue), "You can't change the status of this issue.")
    if status == issue.status:
        raise ValidationError({"status": "The issue already has this status."})
    if issue.status == Issue.Status.COMPLETED:
        raise ValidationError({"status": "Use reopen to move a completed issue back."})
    needs_update = status in (Issue.Status.BLOCKED, Issue.Status.COMPLETED)
    if needs_update and not update_body.strip():
        raise ValidationError({"update": "An update explaining this status is required."})

    old = issue.status
    issue.status = status
    fields = ["status", "updated_at"]
    if status == Issue.Status.COMPLETED:
        issue.completed_at = timezone.now()
        issue.resolution = resolution or Issue.Resolution.RESOLVED
        fields += ["completed_at", "resolution"]
    issue.save(update_fields=fields)
    _event(issue, user, "status", "status", old, status)

    if update_body.strip():
        upd = IssueUpdate.objects.create(issue=issue, author=user, body=update_body, status_to=status)
        _save_attachments(issue, user, files, update=upd)

    notify(_watchers(issue), kind=Kind.ISSUE_STATUS,
           title=f"{issue.title} is now {issue.get_status_display()}",
           message=update_body[:300], actor=user, target_type="issue", target_id=issue.pk)
    return issue


@transaction.atomic
def post_update(user, issue, body, files=None):
    issue = Issue.objects.prefetch_related("assignees").get(pk=issue.pk)
    _ensure(perms.can_post_update(user, issue), "Only COSA members working on this issue can post updates.")
    upd = IssueUpdate.objects.create(issue=issue, author=user, body=body)
    _save_attachments(issue, user, files, update=upd)
    Issue.objects.filter(pk=issue.pk).update(updated_at=timezone.now())
    notify(_watchers(issue), kind=Kind.ISSUE_UPDATE, title=f"Update on: {issue.title}",
           message=body[:300], actor=user, target_type="issue", target_id=issue.pk)
    return upd


def remarks_left_today(user, issue) -> int:
    start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    used = Remark.objects.filter(
        issue=issue, author=user, type=Remark.Type.REMARK, created_at__gte=start
    ).count()
    return max(0, RULES["REMARKS_PER_DAY"] - used)


@transaction.atomic
def post_remark(user, issue, body, files=None):
    issue = Issue.objects.prefetch_related("assignees").get(pk=issue.pk)
    _ensure(perms.can_remark(user, issue), "Only the student who raised this issue can add remarks.")
    if remarks_left_today(user, issue) <= 0:
        raise ValidationError({"detail": f"Limit of {RULES['REMARKS_PER_DAY']} remarks per day reached."})
    if files and len(list(files)) > 1:
        raise ValidationError({"attachments": "Remarks allow 1 image."})
    remark = Remark.objects.create(issue=issue, author=user, body=body)
    _save_attachments(issue, user, files, remark=remark)
    notify(list(issue.assignees.all()) + ([issue.faculty] if issue.faculty_id else []),
           kind=Kind.ISSUE_REMARK, title=f"Student replied on: {issue.title}",
           message=body[:300], actor=user, target_type="issue", target_id=issue.pk)
    return remark


def _within(created_at, minutes):
    return timezone.now() <= created_at + timedelta(minutes=minutes)


@transaction.atomic
def edit_update(user, update, body):
    _ensure(update.author_id == user.pk, "You can only edit your own update.")
    if not _within(update.created_at, RULES["UPDATE_EDIT_MINUTES"]):
        raise ValidationError({"detail": "Updates can only be edited for 15 minutes."})
    _event(update.issue, user, "update_edited", "update", update.body, body)
    update.body = body
    update.edited_at = timezone.now()
    update.save(update_fields=["body", "edited_at"])
    return update


@transaction.atomic
def edit_remark(user, remark, body):
    _ensure(remark.author_id == user.pk, "You can only edit your own remark.")
    if remark.type != Remark.Type.REMARK:
        raise ValidationError({"detail": "Reopen and escalation reasons can't be edited."})
    if not _within(remark.created_at, RULES["REMARK_EDIT_MINUTES"]):
        raise ValidationError({"detail": "Remarks can only be edited for 10 minutes."})
    _event(remark.issue, user, "remark_edited", "remark", remark.body, body)
    remark.body = body
    remark.edited_at = timezone.now()
    remark.save(update_fields=["body", "edited_at"])
    return remark


# ---------------------------------------------------------------------------
# escalate / reopen / upvote
# ---------------------------------------------------------------------------
@transaction.atomic
def escalate(user, issue, reason):
    issue = _lock(issue)
    if not perms.can_escalate(user, issue):
        if issue.created_by_id != user.pk:
            raise PermissionDenied("Only the student who raised this issue can escalate it.")
        available = timezone.localtime(perms.escalation_available_at(issue))
        raise ValidationError({"detail": f"You can escalate after {available:%d %b %Y, %I:%M %p}, "
                                         "if it is not completed and not already escalated."})
    issue.is_escalated = True
    issue.escalated_at = timezone.now()
    issue.save(update_fields=["is_escalated", "escalated_at", "updated_at"])
    Remark.objects.create(issue=issue, author=user, type=Remark.Type.ESCALATION, body=reason)
    _event(issue, user, "escalated", "is_escalated", False, True)

    pres = president()
    notify(pres + gen_secs() + list(issue.assignees.all()), kind=Kind.ISSUE_ESCALATED,
           title=f"Escalated to President: {issue.title}", message=reason[:300], actor=user,
           target_type="issue", target_id=issue.pk)
    emails = [u.email for u in pres]
    if emails:
        transaction.on_commit(lambda: send_mail(
            subject=f"[COSA Portal] Escalated issue #{issue.pk}: {issue.title}",
            message=f"{user} escalated this issue.\n\nReason: {reason}\n\nIssue #{issue.pk}",
            from_email=None,
            recipient_list=emails,
            fail_silently=True,
        ))
    return issue


@transaction.atomic
def reopen(user, issue, reason):
    issue = _lock(issue)
    if not perms.can_reopen(user, issue):
        raise PermissionDenied(
            f"Only completed issues can be reopened, by the student within "
            f"{RULES['REOPEN_WINDOW_DAYS']} days, at most {RULES['MAX_REOPENS']} times."
        )
    now = timezone.now()
    issue.status = Issue.Status.IN_PROGRESS
    issue.reopened_count = F("reopened_count") + 1
    issue.last_reopened_at = now
    issue.is_escalated = False  # new open cycle -> escalation becomes possible again
    issue.completed_at = None
    issue.resolution = ""
    issue.save(update_fields=["status", "reopened_count", "last_reopened_at", "is_escalated",
                              "completed_at", "resolution", "updated_at"])
    issue.refresh_from_db()

    if issue.created_by_id == user.pk:
        Remark.objects.create(issue=issue, author=user, type=Remark.Type.REOPEN, body=reason)
    else:
        IssueUpdate.objects.create(issue=issue, author=user, body=f"Reopened: {reason}",
                                   status_to=Issue.Status.IN_PROGRESS)
    _event(issue, user, "reopened", "status", Issue.Status.COMPLETED, Issue.Status.IN_PROGRESS)
    notify(_watchers(issue), kind=Kind.ISSUE_REOPENED, title=f"Reopened: {issue.title}",
           message=reason[:300], actor=user, target_type="issue", target_id=issue.pk)
    return issue


def toggle_upvote(user, issue) -> tuple[bool, int]:
    _ensure(perms.can_upvote(user, issue), "Only other students can mark 'I'm facing this too'.")
    with transaction.atomic():
        deleted, _ = IssueUpvote.objects.filter(issue=issue, user=user).delete()
        if deleted:
            Issue.objects.filter(pk=issue.pk).update(upvote_count=F("upvote_count") - 1)
            upvoted = False
        else:
            try:
                with transaction.atomic():
                    IssueUpvote.objects.create(issue=issue, user=user)
            except IntegrityError:  # double click race
                pass
            else:
                Issue.objects.filter(pk=issue.pk).update(upvote_count=F("upvote_count") + 1)
            upvoted = True
    count = Issue.objects.values_list("upvote_count", flat=True).get(pk=issue.pk)
    return upvoted, count
