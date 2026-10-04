# IIITR COSA Portal — Frontend

Next.js 15 (App Router) + TypeScript + Tailwind CSS v4, styled after iiitr.ac.in
(navy from the IIITR logo, white pages, dark footer). It talks to the Django
backend in `../backend`.

## Run it (Windows PowerShell)

Start the backend first (`python manage.py runserver` in `backend`), then:

```powershell
cd "D:\Developement\College Project\frontend"
npm install          # first time only
npm run dev          # http://localhost:3000
```

Log in with the **Development login** box. Its quick buttons are Student,
Gen Sec 1, President and Mess Secretary. Any `@students.iiitr.ac.in` email
works and is created as a new student.

## Settings (`.env.local`)

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Backend address, default `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID. Set it to show the "Sign in with Google" button. |
| `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | `true` shows the email-only login box (backend must have `DJANGO_DEBUG=true`) |

The backend must allow this origin. `CORS_ALLOWED_ORIGINS` in `backend/.env`
needs to include `http://localhost:3000`.

## Pages

| Route | Who | What |
| --- | --- | --- |
| `/login` | everyone | Google sign-in, plus dev login |
| `/board` | everyone | Kanban of all issues. COSA can drag cards to change status. Students get **Raise an issue**. |
| `/issues/[id]` | everyone | Details, timeline of official updates + student remarks, history, actions by role |
| `/my-issues` | students | "Issues by You", with Raise to President (after 5 days) and Reopen |
| `/cosa/dashboard` | COSA | Counts: assigned to me, my category, unassigned, escalated, overdue |
| `/events` | everyone | Upcoming, today and past events from every club |
| `/clubs`, `/clubs/[slug]` | everyone | Clubs, members, upcoming events. COSA and club heads manage them. |
| `/cosa` | everyone | COSA Updates feed, Committees (apply / form / review), Directory |
| `/notifications` | everyone | Notifications page with unread / issues / events filters |

## How auth works

`src/lib/api.ts` stores the **access** and **refresh** tokens and sends
`Authorization: Bearer <access>` on every call. When the backend answers
401, it calls `/api/auth/token/refresh/` once, saves the new pair, and
retries. If refresh fails, you're logged out.

## Folder map

```
src/
├── app/
│   ├── login/page.tsx           ← sign-in screen
│   ├── (portal)/layout.tsx      ← "must be logged in" guard + header/nav/footer
│   └── (portal)/<page>/page.tsx ← one folder per route
├── components/                  ← AppShell, ui (badges, modal, tabs), issues, cosa
└── lib/                         ← api client, auth context, types, hooks, formatting
```

`(portal)` in brackets is a route **group**: it shares a layout but doesn't
appear in the URL.
