"""Create the issue categories, COSA role emails and their user accounts.

Safe to run many times: existing rows are updated, not duplicated.
    python manage.py seed_portal
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.accounts.models import RoleMailbox, User
from apps.issues.models import Category

CATEGORIES = [
    "Hostel",
    "Academics",
    "Mess",
    "Sports",
    "Cultural",
    "Technical",
    "Infrastructure & Maintenance",
    "IT & Wi-Fi",
    "Other",
]

L = RoleMailbox.Level
ROLES = [
    # email, role name, level, owned category
    ("gensec_1@students.iiitr.ac.in", "General Secretary 1", L.GEN_SEC, None),
    ("gensec_2@students.iiitr.ac.in", "General Secretary 2", L.GEN_SEC, None),
    ("president@iiitr.ac.in", "President", L.PRESIDENT, None),
    ("academic_secretary@iiitr.ac.in", "Academic Secretary", L.SECRETARY, "Academics"),
    ("messsecretary@iiitr.ac.in", "Mess Secretary", L.SECRETARY, "Mess"),
    ("hss1@iiitr.ac.in", "HSS 1", L.SECRETARY, "Hostel"),
    ("hss2@iiitr.ac.in", "HSS 2", L.SECRETARY, "Hostel"),
    ("sports_secretary@iiitr.ac.in", "Sports Secretary", L.SECRETARY, "Sports"),
    ("cult@students.iiitr.ac.in", "Cultural Secretary", L.SECRETARY, "Cultural"),
    ("scitech.sec@students.iiitr.ac.in", "SciTech Secretary", L.SECRETARY, "Technical"),
    ("pr.council@iiitr.ac.in", "PR Council", L.SECRETARY, None),
]


class Command(BaseCommand):
    help = "Seed categories, COSA role emails and their user accounts."

    @transaction.atomic
    def handle(self, *args, **options):
        cats = {}
        for i, name in enumerate(CATEGORIES):
            cat, _ = Category.objects.update_or_create(
                slug=slugify(name), defaults={"name": name, "sort_order": i * 10, "is_active": True}
            )
            cats[name] = cat
        self.stdout.write(f"Categories: {len(cats)}")

        for i, (email, role_name, level, category) in enumerate(ROLES):
            RoleMailbox.objects.update_or_create(
                email=email,
                defaults={
                    "role_name": role_name,
                    "level": level,
                    "category": cats.get(category),
                    "sort_order": i * 10,
                    "is_active": True,
                },
            )
            user, created = User.objects.get_or_create(
                email=email, defaults={"full_name": role_name, "user_type": User.UserType.COSA}
            )
            if not created and user.user_type != User.UserType.COSA:
                user.user_type = User.UserType.COSA
                user.save(update_fields=["user_type"])
        self.stdout.write(self.style.SUCCESS(f"Role emails: {len(ROLES)}"))
