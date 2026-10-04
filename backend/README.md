# IIITR Campus Portal — Backend

Django REST API for the campus issue tracker, the COSA page, clubs, events,
committees and notifications. Uses Neon Postgres for the database, S3 for
uploads and JWT (access + refresh tokens) for auth.

## Stack

| Piece | Choice |
| --- | --- |
| Framework | Django 5.1 + Django REST Framework |
| Auth | Google sign-in (college domains only) → JWT access (15 min) + refresh (7 days), refresh rotation + blacklist |
| Database | Neon Postgres through the **pooled** connection (PgBouncer). SQLite if `DATABASE_URL` is empty. |
| Files | S3 via django-storages (private bucket, signed URLs) |
| API docs | drf-spectacular → `/api/docs/` (Swagger UI) |
| Serving | gunicorn (multiple workers × threads), WhiteNoise for static files, Docker |

## How it scales

- **Stateless API.** JWTs mean no server sessions, so you can run any number of containers behind a load balancer.
- **Neon pooler.** Connections go through PgBouncer. Server-side cursors are disabled, as transaction pooling requires, and connections are reused with health checks.
- **No N+1 queries.** Lists use `select_related`/`prefetch_related`. The issue list runs a fixed 4 queries whatever the page size, and a test checks this.
- **Role checks are cached.** The ~11 role emails are cached, so permission checks don't query the database on every row. They're invalidated on change.
- **Indexes** on every hot filter: status, category, creator, escalation, notification inbox, event dates.
- **Row locks.** Status, assignment, escalation and reopen use `select_for_update`, so two people can't race the same change.
- **Deferred notifications.** They're bulk-inserted after the transaction commits.
- **Throttling.** Per user, per anonymous client, and stricter on login. Rates are shared across workers when `REDIS_URL` is set.
- **Pagination everywhere**, at most 100 per page. The board returns 25 cards per column plus full counts.

## Run it locally (Windows PowerShell)

```powershell
cd "D:\Developement\College Project\backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python manage.py migrate          # creates all tables in Neon
python manage.py seed_portal      # 9 categories + 11 COSA role emails
python manage.py createsuperuser  # your admin login for /admin
python manage.py runserver
```

Then open:

- http://127.0.0.1:8000/api/docs/ for the interactive API
- http://127.0.0.1:8000/admin/ for the back office

If `migrate` fails on the pooler, run it once with the **direct** host. Remove `-pooler` from the host in `DATABASE_URL`, migrate, then put it back.

### Logging in during development

`ALLOW_DEV_LOGIN=true` (only works with `DJANGO_DEBUG=true`) enables a login that needs no Google account:

```http
POST /api/auth/dev-login/
{"email": "gensec_1@students.iiitr.ac.in"}
```

It returns `access`, `refresh` and `user`. Send `Authorization: Bearer <access>` on every request. In Swagger, use the **Authorize** button.

### Google login (real)

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID** (Web), and add your frontend origin.
2. Put the client ID in `GOOGLE_CLIENT_IDS`.
3. The frontend uses Google Identity Services to get an `id_token`, then calls `POST /api/auth/google/ {"id_token": "..."}`.

Login rules:

- `@students.iiitr.ac.in` becomes a student.
- A COSA role email becomes COSA.
- Any other `@iiitr.ac.in` email must already exist as **Faculty**. Add faculty in `/admin`.

### Token flow for the frontend

| Step | Call |
| --- | --- |
| Login | `POST /api/auth/google/` → `{access, refresh, user}` |
| Every request | `Authorization: Bearer <access>` |
| Access expired (401) | `POST /api/auth/token/refresh/ {refresh}` → new `access` **and** new `refresh`. Store both; the old refresh token stops working. |
| Logout | `POST /api/auth/logout/ {refresh}` |

## API overview

All endpoints need a token except login, refresh, `/health/` and the docs.

**Auth and people**

- `GET/PATCH /api/auth/me/`: current user, role, owned category, `can_raise_issues`
- `GET /api/auth/users/?search=`: people to tag or assign. Students see COSA only.
- `GET /api/auth/directory/`: COSA office bearers

**Issues**

- `GET /api/categories/`
- `GET /api/issues/`: filters `status`, `category`, `priority`, `is_escalated`, `assignee=me`, `mine`, `my_category`, `unassigned`, `overdue`, `search`, `ordering`
- `GET /api/issues/board/`: kanban columns (accepts the same filters)
- `GET /api/issues/mine/`: "Issues by you", with `can_escalate` and `can_reopen`
- `POST /api/issues/`: students only (JSON or multipart with `attachments`)
- `GET/PATCH /api/issues/{id}/`: no DELETE, by design
- `POST /api/issues/{id}/status/ {status, update, resolution}`: Blocked and Completed need an update
- `POST /api/issues/{id}/assign/ {assignees:[ids]}`: Gen Secs and President
- `POST /api/issues/{id}/faculty/ {faculty}`: Gen Secs and President
- `POST /api/issues/{id}/escalate/ {reason}`: the raising student, after 5 days
- `POST /api/issues/{id}/reopen/ {reason}`
- `POST /api/issues/{id}/upvote/`: toggles "I'm facing this too"
- `GET/POST /api/issues/{id}/updates/`: official updates (COSA, assignees, faculty)
- `GET/POST /api/issues/{id}/remarks/`: raising student only, 3 per day
- `GET /api/issues/{id}/timeline/`, `GET /api/issues/{id}/history/`
- `PATCH /api/updates/{id}/` (15 min), `PATCH /api/remarks/{id}/` (10 min)
- `GET /api/cosa/dashboard/`: COSA tile counts

**COSA, clubs, events, committees**

- `GET/POST /api/cosa/clubs/`, `GET/PATCH /api/cosa/clubs/{slug}/`, `POST .../members/`, `POST .../members/{user_id}/remove/`
- `GET/POST /api/cosa/events/?when=upcoming|past|today&club={slug}`, `PATCH /api/cosa/events/{id}/`, `POST .../cancel/`. Club heads and coordinators can post events for their club.
- `GET/POST /api/cosa/committees/`, `POST .../members/`, `POST .../apply/`, `GET .../applications/`, `POST .../applications/{id}/decide/`
- `GET/POST /api/cosa/posts/`, `POST .../pin|unpin|archive|unarchive/`

**Notifications page**

- `GET /api/notifications/?is_read=false&kind=EVENT`
- `GET /api/notifications/unread-count/`
- `POST /api/notifications/{id}/read/`, `POST /api/notifications/read-all/`

## Jobs

Run `python manage.py send_overdue_reminders` once a day with cron or your host's scheduler. It notifies assignees and the Gen Secs about open issues older than 5 days.

## Tests

```powershell
$env:SECURE_SSL_REDIRECT="false"; $env:DJANGO_SECRET_KEY="test"; $env:DATABASE_URL=""
python manage.py test apps
```

There are 19 end-to-end tests covering auth, every issue rule, clubs, events, committees, posts and notifications.

## Deploying

Neon hosts the **database** only. `neon deploy` applies Neon config such as Postgres, Auth and JS/TS Functions; it can't run Django. Deploy this folder's `Dockerfile` to Render, Railway, Fly.io or AWS:

- Set the variables from `.env.example` as secrets. Use `DJANGO_DEBUG=false` and a real `DJANGO_SECRET_KEY` and `JWT_SIGNING_KEY`.
- Set `RUN_MIGRATIONS=1` on one service so each deploy migrates and seeds.
- Add a daily cron job for `python manage.py send_overdue_reminders`.

## Security notes

- `.env` is git-ignored. **Rotate the AWS key pair and the Neon password** that were shared in chat, then update `.env`.
- Make the S3 bucket private. Files are served through signed URLs that expire after 1 hour.
