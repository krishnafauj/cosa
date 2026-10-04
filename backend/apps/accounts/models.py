import os
import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.cache import cache
from django.db import models
from django.utils import timezone
from django.utils.functional import cached_property


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("user_type", User.UserType.ADMIN)
        return self._create_user(email, password, **extra)


def profile_photo_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()[:10]
    return f"profiles/{uuid.uuid4().hex}{ext}"


class User(AbstractBaseUser, PermissionsMixin):
    """A portal user. Identity is the college email; login is via Google."""

    class UserType(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        COSA = "COSA", "COSA member"
        FACULTY = "FACULTY", "Faculty"
        ADMIN = "ADMIN", "Administrator"

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150, blank=True)
    avatar_url = models.URLField(blank=True)
    user_type = models.CharField(max_length=10, choices=UserType.choices, default=UserType.STUDENT)
    roll_number = models.CharField(max_length=30, blank=True)

    # ----- student profile (filled on first login) ------------------------
    class Branch(models.TextChoices):
        CSE = "CSE", "Computer Science and Engineering"
        MNC = "MNC", "Mathematics and Computing"
        AIDS = "AIDS", "Artificial Intelligence and Data Science"

    photo = models.ImageField(upload_to=profile_photo_path, null=True, blank=True)
    branch = models.CharField(max_length=4, choices=Branch.choices, blank=True)
    batch_year = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Year of joining, e.g. 2023")
    semester = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Current semester, 1-8")
    about = models.TextField(max_length=500, blank=True)
    profile_completed_at = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        indexes = [models.Index(fields=["user_type"])]
        ordering = ["full_name", "email"]

    def __str__(self):
        return self.full_name or self.email

    # ----- profile helpers ------------------------------------------------
    STUDENT_PROFILE_FIELDS = ("full_name", "roll_number", "branch", "batch_year", "semester")

    @property
    def profile_complete(self) -> bool:
        """Students must fill their profile once; others don't need to."""
        if self.user_type != self.UserType.STUDENT:
            return True
        return all(getattr(self, f) for f in self.STUDENT_PROFILE_FIELDS) and bool(self.photo)

    @property
    def year_of_study(self):
        return (self.semester + 1) // 2 if self.semester else None

    # ----- role helpers ---------------------------------------------------
    @cached_property
    def mailbox(self):
        """The active RoleMailbox for this email, if it is a COSA role email."""
        return RoleMailbox.active_map().get(self.email.lower())

    @property
    def cosa_level(self):
        return self.mailbox.level if self.mailbox else None

    @property
    def is_cosa(self) -> bool:
        return self.mailbox is not None

    @property
    def is_student(self) -> bool:
        return self.user_type == self.UserType.STUDENT and not self.is_cosa

    @property
    def is_faculty(self) -> bool:
        return self.user_type == self.UserType.FACULTY

    @property
    def can_manage_issues(self) -> bool:
        """Gen Secs and the President: assign, reassign, faculty, admin."""
        return self.cosa_level in (RoleMailbox.Level.GEN_SEC, RoleMailbox.Level.PRESIDENT)


class RoleMailbox(models.Model):
    """Official COSA role email. Power follows the email, not the person."""

    class Level(models.TextChoices):
        GEN_SEC = "GEN_SEC", "General Secretary"
        PRESIDENT = "PRESIDENT", "President"
        SECRETARY = "SECRETARY", "Secretary"

    email = models.EmailField(unique=True)
    role_name = models.CharField(max_length=80)
    level = models.CharField(max_length=10, choices=Level.choices)
    category = models.ForeignKey(
        "issues.Category",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="role_mailboxes",
        help_text="Issues in this category are auto-assigned to this role.",
    )
    held_by_name = models.CharField(max_length=150, blank=True)
    academic_year = models.CharField(max_length=9, blank=True, help_text="e.g. 2026-27")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=100)

    class Meta:
        ordering = ["sort_order", "role_name"]

    CACHE_KEY = "role_mailbox_map:v1"

    def save(self, *args, **kwargs):
        self.email = self.email.lower()
        super().save(*args, **kwargs)
        cache.delete(self.CACHE_KEY)

    def delete(self, *args, **kwargs):
        result = super().delete(*args, **kwargs)
        cache.delete(self.CACHE_KEY)
        return result

    @classmethod
    def active_map(cls) -> dict:
        """email -> RoleMailbox for active roles. ~11 rows, cached for 5 minutes
        so permission checks on list endpoints don't hit the database per user."""
        data = cache.get(cls.CACHE_KEY)
        if data is None:
            data = {
                mb.email: mb
                for mb in cls.objects.select_related("category").filter(is_active=True)
            }
            cache.set(cls.CACHE_KEY, data, 300)
        return data

    def __str__(self):
        return f"{self.role_name} <{self.email}>"


def _clear_role_cache(**_kwargs):
    cache.delete(RoleMailbox.CACHE_KEY)


models.signals.post_delete.connect(_clear_role_cache, sender=RoleMailbox)
