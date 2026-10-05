from django.conf import settings
from django.db import migrations, models


def copy_tags(apps, schema_editor):
    Issue = apps.get_model("issues", "Issue")
    for issue in Issue.objects.exclude(tagged_member=None).only("id", "tagged_member_id"):
        issue.tagged_members.add(issue.tagged_member_id)


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("issues", "0002_private_support"),
    ]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="tagged_members",
            field=models.ManyToManyField(blank=True, related_name="tagged_issues_m2m", to=settings.AUTH_USER_MODEL),
        ),
        migrations.RunPython(copy_tags, migrations.RunPython.noop),
        migrations.RemoveField(model_name="issue", name="tagged_member"),
        migrations.AlterField(
            model_name="issue",
            name="tagged_members",
            field=models.ManyToManyField(blank=True, related_name="tagged_issues", to=settings.AUTH_USER_MODEL),
        ),
    ]
