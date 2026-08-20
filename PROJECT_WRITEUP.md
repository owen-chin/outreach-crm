# Longlist — Project Writeup

## The story
Longlist started as a personal tool for running sponsorship/partnership outreach for an event — the kind of work that normally splits across a spreadsheet (tracking who's been contacted) and Gmail (the actual conversations), with the two constantly drifting out of sync. The core idea: put status tracking and real email correspondence on one "desk" so you never have to cross-reference a spreadsheet against your inbox. It's a solo project, built end-to-end (backend, frontend, infra, design system) over about 3 weeks, June 26 – July 14, 2026, across 18 commits, and is live in production today.

**Live app:** outreach-crm-lovat.vercel.app · **Live API:** outreach-crm-api-m6a3.onrender.com

## What it does
- **Project → Category → Organization → People/Threads** hierarchy for organizing outreach (e.g. Project = an event, Category = a sponsor tier, Organization = a company being pitched).
- **Real Gmail integration**, not a bolted-on SMTP tool — sends, replies, and thread-linking all go through the Gmail API using the user's own OAuth token, with threads auto-labeled in Gmail as `{project}/{category}`.
- **Gmail import**: search an existing Gmail thread and it back-fills the Organization/Person/Thread records automatically.
- **AI drafting assistant** (Gemini-backed) built as a multi-turn chat, not a one-shot "generate" button — for replies it reads the full Gmail thread history for context.
- **Scheduled sends**: draft now, send later — implemented as an external cron hitting an internal endpoint rather than an in-process scheduler (see architecture notes below).
- **Rich text email templates** (Tiptap editor) with variable rendering, and a dashboard/kanban view of pipeline status (not_contacted → contacted → responded → negotiating → confirmed/declined) across every project.

## Tech stack
**Backend** (`backend/`, ~2,275 lines of Python)
- FastAPI + SQLAlchemy + Alembic migrations, PostgreSQL
- Google OAuth (`google-auth-oauthlib`) for login *and* Gmail API access — no separate SMTP credential system
- `google-genai` (Gemini) for AI drafting
- `gspread` for Google Sheets import/export

**Frontend** (`frontend/`, ~2,640 lines of JS/JSX)
- React 19 + Vite, React Router, TanStack Query, Axios
- Tiptap rich text editor for composing
- Hand-rolled CSS design system (no component library) — deliberately "crisp and dense," not generic SaaS chrome

**Infrastructure — a genuine $0/month production deployment**
- Vercel (frontend) + Render (backend, native Python buildpack from `render.yaml`, runs `alembic upgrade head` on every deploy) + Neon Postgres + GitHub Actions cron
- No Docker, no paid tier anywhere, no credit card required at this usage level

## Engineering decisions worth calling out
A few choices that show real tradeoff reasoning rather than default scaffolding:

1. **Scheduler as external cron, not in-process.** Render's free tier sleeps when idle, so an in-process scheduler would silently stop firing. Instead, a GitHub Actions workflow pings `POST /internal/send-due-drafts` every 10 minutes with a shared secret — trading timing precision (sends can slip 5–15 min) for reliability at zero cost.
2. **Per-user data isolation done as a systemic pattern, not ad hoc checks.** Every router runs through `app/services/ownership.py`, which joins nested resources (categories/organizations/people/threads/drafts) back up to `Project.user_id`, so a request for someone else's data 404s instead of leaking. This was actually a security gap that got fixed mid-project — nearly every router was missing per-user scoping until a dedicated pass added it (2026-07-12).
3. **Multi-tenant Gmail credentials done correctly.** OAuth tokens are stored per `(service, user_id)`, and every credential lookup is explicitly keyed by `user_id` — a deliberate fix after an earlier bug where one user's login could overwrite the Gmail account the whole app sent through.
4. **Scheduled sends run outside a request context** (no logged-in user when the cron fires), so the scheduler resolves the owning user per-draft by walking organization → category → project, rather than reusing a single global credential lookup.
5. **AI model selection tuned against real quota constraints**, not just picking the "latest" model: `gemini-flash-latest` turned out to have only 20 req/day free (unusable for a chat UI), `gemini-2.0-flash` has no free tier on new projects, so the default is `gemini-flash-lite-latest` (500 req/day, 15 RPM free) — documented as a gotcha in the README so it doesn't get "fixed" back to something worse.
6. **Provider-agnostic data layer** — any plain Postgres `DATABASE_URL` works (Neon in prod, Supabase/local Postgres for dev); no provider-specific SDK dependency.

## Design
There's a full design system (`DESIGN.md`) governing the UI: a fixed "Working Indigo" accent (a user-facing accent-picker was built and then deliberately removed in favor of one consistent brand color), a five-color semantic status ramp, a two-voice typography system (Space Grotesk for orientation moments, system sans for everything functional), and explicit rules like "glow only on accent-colored functional elements, never on neutral surfaces" — refined through direct iteration (e.g., an arrival-screen background bloom was toned down after an initial pass made plain white cards look like they were "popping out").

## What this demonstrates
Full-stack ownership (API design, DB modeling/migrations, OAuth integration, AI integration, frontend architecture, and a from-scratch design system) plus infrastructure judgment under a real constraint ($0 budget) rather than defaulting to paid managed services. The commit history and README's "gotchas" section also show a habit of documenting non-obvious failure modes (CORS origin mismatches, credential-overwrite bugs, AI quota traps) for future maintainers — useful signal for how this person works, not just what they built.
