"""Create notifications in bulk after the surrounding transaction commits."""
from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Notification

BATCH = 1000


def notify(recipients, *, kind, title, message="", actor=None, target_type="", target_id=None):
    """Notify a set of users (User objects or ids). The actor is never notified."""
    ids = {getattr(r, "pk", r) for r in recipients if r is not None}
    if actor is not None:
        ids.discard(actor.pk)
    if not ids:
        return

    actor_id = actor.pk if actor else None

    def _create():
        Notification.objects.bulk_create(
            [
                Notification(
                    recipient_id=uid,
                    actor_id=actor_id,
                    kind=kind,
                    title=title[:160],
                    message=message[:300],
                    target_type=target_type,
                    target_id=target_id,
                )
                for uid in ids
            ],
            batch_size=BATCH,
        )

    transaction.on_commit(_create)


def notify_everyone(**kwargs):
    """Broadcast (events, COSA posts). ~a few thousand rows, inserted in batches."""
    User = get_user_model()
    ids = User.objects.filter(is_active=True).values_list("pk", flat=True).iterator(chunk_size=BATCH)
    notify(list(ids), **kwargs)
