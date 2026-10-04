import re

from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.tokens import RefreshToken

from .models import RoleMailbox, User


def email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower()


def roll_match(email: str):
    return re.match(settings.STUDENT_EMAIL_REGEX, email.strip().lower())


def is_student_email(email: str) -> bool:
    """cs23b1036@iiitr.ac.in (roll-number email) or anything @students.iiitr.ac.in."""
    return email_domain(email) == settings.STUDENT_EMAIL_DOMAIN or roll_match(email) is not None


def roll_defaults(email: str) -> dict:
    """Pre-fill roll number, batch and branch from a roll-number email."""
    m = roll_match(email)
    if not m:
        return {}
    data = {"roll_number": email.split("@")[0].upper(), "batch_year": 2000 + int(m.group("yy"))}
    branch = settings.ROLL_BRANCH_CODES.get(m.group("code"))
    if branch:
        data["branch"] = branch
    return data


@transaction.atomic
def resolve_login(email: str, full_name: str = "", avatar_url: str = "") -> User:
    """Find or create the user for a verified college email and sync their type.

    Rules:
      * domain must be in ALLOWED_EMAIL_DOMAINS
      * a COSA role email -> user_type COSA
      * roll-number email (cs23b1036@iiitr.ac.in) or @students domain -> STUDENT
      * other college email -> must already exist (faculty are added by COSA)
    """
    email = email.strip().lower()
    if email_domain(email) not in settings.ALLOWED_EMAIL_DOMAINS:
        raise PermissionDenied("Use your IIITR college email to sign in.")

    is_role_email = RoleMailbox.objects.filter(email__iexact=email, is_active=True).exists()
    user = User.objects.select_for_update().filter(email__iexact=email).first()

    if user is None:
        if is_role_email:
            user_type = User.UserType.COSA
        elif is_student_email(email):
            user_type = User.UserType.STUDENT
        else:
            raise PermissionDenied(
                "This email is not registered. Faculty accounts are added by COSA."
            )
        extra = roll_defaults(email) if user_type == User.UserType.STUDENT else {}
        user = User.objects.create_user(email=email, full_name=full_name, user_type=user_type, **extra)
    else:
        if not user.is_active:
            raise PermissionDenied("This account is disabled.")
        changed = []
        if is_role_email and user.user_type != User.UserType.COSA:
            user.user_type = User.UserType.COSA
            changed.append("user_type")
        elif not is_role_email and user.user_type == User.UserType.COSA:
            # Role email was deactivated: fall back to the domain default.
            user.user_type = User.UserType.STUDENT if is_student_email(email) else User.UserType.FACULTY
            changed.append("user_type")
        if full_name and not user.full_name:
            user.full_name = full_name
            changed.append("full_name")
        if changed:
            user.save(update_fields=changed)

    if avatar_url and user.avatar_url != avatar_url:
        user.avatar_url = avatar_url
        user.save(update_fields=["avatar_url"])
    return user


def issue_tokens(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    refresh["user_type"] = user.user_type
    refresh["cosa_level"] = user.cosa_level
    return {"access": str(refresh.access_token), "refresh": str(refresh)}
