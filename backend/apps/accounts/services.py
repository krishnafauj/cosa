from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.tokens import RefreshToken

from .models import RoleMailbox, User


def email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower()


@transaction.atomic
def resolve_login(email: str, full_name: str = "", avatar_url: str = "") -> User:
    """Find or create the user for a verified college email and sync their type.

    Rules:
      * domain must be in ALLOWED_EMAIL_DOMAINS
      * a COSA role email -> user_type COSA
      * @students domain   -> STUDENT
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
        elif email_domain(email) == settings.STUDENT_EMAIL_DOMAIN:
            user_type = User.UserType.STUDENT
        else:
            raise PermissionDenied(
                "This email is not registered. Faculty accounts are added by COSA."
            )
        user = User.objects.create_user(email=email, full_name=full_name, user_type=user_type)
    else:
        if not user.is_active:
            raise PermissionDenied("This account is disabled.")
        changed = []
        if is_role_email and user.user_type != User.UserType.COSA:
            user.user_type = User.UserType.COSA
            changed.append("user_type")
        elif not is_role_email and user.user_type == User.UserType.COSA:
            # Role email was deactivated: fall back to the domain default.
            user.user_type = (
                User.UserType.STUDENT
                if email_domain(email) == settings.STUDENT_EMAIL_DOMAIN
                else User.UserType.FACULTY
            )
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
