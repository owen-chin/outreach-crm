# Outreach CRM

A lightweight CRM for managing sponsorship/outreach campaigns: organize target
organizations by project and category, track contacts, send and reply to emails
through your own Gmail account (with Gmail labels applied automatically), and draft
messages with an AI chat assistant.

**Live app:** https://outreach-crm-lovat.vercel.app
**Live API:** https://outreach-crm-api-m6a3.onrender.com (Render free tier — the first
request after a period of inactivity can take 30-50s to wake up)

Sign in with Google to use it — the app reads/sends through your Gmail via OAuth,
it doesn't have its own SMTP.

## Features

- **Project → Category → Organization → People/Threads** hierarchy for organizing
  outreach (e.g. Project = an event, Category = tiers of sponsors, Organization =
  a company you're pitching, People = contacts there).
- **Gmail integration**: send the first email, reply within a thread, or link an
  existing Gmail thread to an organization — all via the Gmail API using your OAuth
  token. Threads are auto-labeled in Gmail as `{project name}/{category name}`.
- **Gmail import**: pull in an existing Gmail thread by search to auto-create the
  Organization/Person/Thread records.
- **Email templates** with a rich text editor and client-side variable rendering.
- **AI drafting**: a chat-style assistant (not a one-shot generate button) that helps
  write cold intros or replies. For replies it reads the full Gmail thread history for
  context. Backed by Gemini (free tier).
- **Scheduled sends**: draft an email now, have it actually send later. Since the
  backend runs on a free tier that sleeps when idle, this is driven by an external
  GitHub Actions cron job hitting an internal endpoint every 10 minutes, rather than
  an in-process scheduler.
- Dashboard view across projects/categories, status tracking per organization
  (not contacted → contacted → responded → negotiating → confirmed/declined).

## Tech stack

**Backend** — `backend/`
- [FastAPI](https://fastapi.tiangolo.com/) + [SQLAlchemy](https://www.sqlalchemy.org/) + [Alembic](https://alembic.sqlalchemy.org/) migrations
- PostgreSQL
- Google OAuth (`google-auth-oauthlib`) for login + Gmail API access
- `google-genai` (Gemini) for AI drafting
- `gspread` (Google Sheets — used for exports/import, see `backend/app/services`)

**Frontend** — `frontend/`
- React 19 + Vite
- React Router, TanStack Query, Axios
- Tiptap (rich text editor for email composing/templates)
- Plain CSS (no component library)

**Infrastructure** (see `[hosting plan]` note below)
- Frontend hosted on **Vercel**
- Backend hosted on **Render** (deployed from `render.yaml` at the repo root —
  no Docker, native Python buildpack, runs `alembic upgrade head` on every deploy)
- Database: **Neon** Postgres in prod (any plain Postgres `DATABASE_URL` works —
  local dev can point at Supabase, a local Postgres, etc.; the app has no
  provider-specific SDK dependency)
- Scheduled sends triggered by a **GitHub Actions** cron (`.github/workflows/send-due-drafts.yml`)
  calling `POST /internal/send-due-drafts` on the Render backend

This whole stack is intentionally chosen to run at **$0/month** — every tier used is a
free tier with no credit card required at this usage level. The tradeoffs (Render cold
starts, cron timing that can slip ~5-15 min) are accepted for that reason.

## Local development

### Prerequisites
- Python 3.11+
- Node 20+
- A Postgres database (Neon/Supabase free tier, or local Postgres)
- A Google Cloud OAuth client (Client ID/Secret) with the Gmail API enabled
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/) (free, no card)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL, SECRET_KEY, OFFICER_PASSWORD, Google OAuth creds, etc.
alembic upgrade head
uvicorn app.main:app --reload
```

API runs at `http://localhost:8000`. Health check: `GET /health`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL — leave blank for local dev, defaults to localhost:8000
npm run dev
```

App runs at `http://localhost:5173`.

### Environment variables

Backend (`backend/.env`, see `backend/.env.example`):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SECRET_KEY` | JWT signing secret — `openssl rand -hex 32` |
| `OFFICER_PASSWORD` | Required by config at startup; not currently wired to any route |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | Must match the redirect URI configured in Google Cloud Console |
| `FRONTEND_URL` | Used for CORS — must exactly match the frontend's origin or the browser silently gets no `Access-Control-Allow-Origin` header (looks like "nothing happens" with no console error) |
| `GEMINI_API_KEY` | From Google AI Studio |
| `GEMINI_MODEL` | Default `gemini-flash-lite-latest`. See gotcha below before changing. |
| `INTERNAL_API_SECRET` | Shared secret the GitHub Actions cron sends as `x-internal-secret` to `/internal/send-due-drafts` |

Frontend (`frontend/.env`, see `frontend/.env.example`):

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend URL. Leave blank locally (defaults to `localhost:8000`); set to the Render URL in Vercel. |

**Gemini model gotcha**: `gemini-flash-latest` resolves to a model with only 20
requests/day free — trivially exhausted by a multi-turn chat. `gemini-2.0-flash` has
no free tier at all on new projects. `gemini-flash-lite-latest` (the default here)
gets 500 requests/day / 15 RPM free — use it unless you've confirmed a different
model's quota yourself.

## Deployment

- **Backend**: push to `main` → Render picks up `render.yaml`, runs
  `pip install -r requirements.txt && alembic upgrade head`, then starts
  `uvicorn app.main:app`. Set the env vars above in the Render dashboard (they're
  marked `sync: false` in `render.yaml`, i.e. not stored in the repo).
- **Frontend**: push to `main` → Vercel builds `frontend/` (Vite). Root directory in
  Vercel project settings should be `frontend/`. Set `VITE_API_URL` in Vercel's env
  vars to the Render backend URL.
- **Cron**: `.github/workflows/send-due-drafts.yml` needs two GitHub Actions repo
  secrets: `BACKEND_URL` (the Render URL) and `INTERNAL_API_SECRET` (must match the
  backend's env var).

There's no staging environment or branch — this is a solo project and everything
ships straight to `main`.

## Project structure

```
backend/
  app/
    main.py           FastAPI app, router registration, CORS
    config.py          Settings (env vars)
    db/                SQLAlchemy engine/session
    models/models.py   All ORM models (Project, Category, Organization, Person,
                        Thread, EmailLog, User, ...)
    schemas/           Pydantic request/response schemas
    routers/           One file per resource (projects, categories, organizations,
                        people, threads, drafts, email_templates, auth, gmail,
                        internal, dashboard)
    services/          Gmail API wrapper, AI drafting (Gemini), auth utils,
                        email sending, the send_due_drafts scheduler logic
  alembic/versions/     DB migrations
render.yaml             Render deploy blueprint

frontend/
  src/
    pages/              HomePage, LoginPage, ProjectDetailPage, SettingsPage,
                         TemplatesPage
    components/          Layout, Topbar, Modal, ProjectFormModal, RichTextEditor,
                         StatusBadge
    api/                 Axios client (single shared instance — see gotcha below)
    context/             Auth context
  vercel.json            SPA rewrite rule
```

**Data model**: `Project → Category → Organization → (People, Threads)`, with
`Thread → EmailLog`. There is no flat `contacts` table — every contact belongs to an
Organization. Gmail labels are applied automatically on send/reply/link, formatted as
`{project.name}/{category.name}`.

## Contributing notes / gotchas

- **Auth is Google OAuth only** — there's no username/password login flow for the app
  itself (despite `OFFICER_PASSWORD` existing in config, it isn't used by any route
  currently).
- **Every resource is scoped to the logged-in Google user.** Every router (except the
  cron-only `/internal` route, which uses a shared secret instead) requires
  `current_user: User = Depends(get_current_user)`, and nested resources
  (categories/organizations/people/threads/drafts) are fetched through
  `app/services/ownership.py` helpers that join back up to `Project.user_id` — so a
  request for someone else's org/category/project 404s instead of leaking data. If
  you add a new router or nested resource, follow this pattern: don't `db.get(...)`
  or filter by parent ID alone, go through (or add to) `ownership.py`.
- **Gmail credentials are per-user**, stored in `oauth_tokens` keyed by
  `(service, user_id)`. `get_credentials(db, user_id)` / `save_credentials(db,
  user_id, creds)` in `app/services/gmail.py` always take a `user_id` — never call
  them without one, or you'll be back to the old bug where one user's login could
  silently overwrite the Gmail account the whole app sends through.
- **Scheduled sends run outside a request context** (triggered by the GitHub Actions
  cron, no logged-in user), so `services/scheduler.py` resolves the owning user_id
  per-draft via `get_owning_user_id()` (walks organization → category → project)
  before fetching credentials — don't reintroduce a single global lookup there.
- **Use the shared Axios client** (`frontend/src/api/index.js`, exported as default)
  for all API calls rather than raw `axios`/`fetch` — a previous bug shipped because
  `AuthContext.jsx` had its own hardcoded `axios.get('http://localhost:8000/...')`
  call that bypassed the shared client's `VITE_API_URL` config.
- **CORS failures are silent**: if `FRONTEND_URL` on the backend doesn't exactly match
  the frontend's actual origin, requests just fail in the browser with no useful
  error — check that env var first if "nothing happens" on login.
- No test suite currently exists. Verify changes by running the app locally against
  a real Google account (OAuth can't be meaningfully mocked) and exercising the flow
  end-to-end.
- No `dev`/`main` branch split — work happens directly on `main`.
