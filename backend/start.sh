#!/bin/sh
# Container entrypoint. Set RUN_MIGRATIONS=1 on ONE service to apply
# migrations + seed data on deploy.
set -e
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  python manage.py migrate --noinput
  python manage.py seed_portal
fi
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers ${WEB_CONCURRENCY:-3} --threads 4 \
  --timeout 60 --access-logfile -
