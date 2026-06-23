<p align="center">
  <img src="rivz/public/logo.png" alt="Fayde" width="100" />
</p>

<h1 align="center">Fayde</h1>

<p align="center">A personal productivity suite — tasks, goals, habits, notes, time tracking, and more.</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.24-00ADD8?style=flat-square&logo=go&logoColor=white" alt="Go 1.24" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/Docker-compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
</p>

---

Fayde is a self-hosted, single-user productivity app with a Go REST API backend and a Next.js 16 App Router frontend. Every feature is designed for personal use — structured around your own data, with optional integrations that layer on when you need them.

## Features

**Task management**
- Full CRUD with status (`todo` / `in_progress` / `done` / `failed`), priority, due dates, and recurrence
- Subtasks, tags, dependencies, watchers, comments, and file attachments (S3)
- Multiple views: list, kanban, calendar, Gantt, weekly planner
- Bulk operations, reordering, CSV export, iCal feed
- Saved filters, custom fields, and task templates
- Shareable read-only public links

**Planning & goal tracking**
- Projects and sprints for grouping tasks
- Goals / OKRs with key results and linked tasks
- Habits with daily toggle and streak logs
- Daily review flow and AI-powered day planning

**Time & focus**
- Per-task time tracking (start/stop entries)
- Pomodoro timer with history

**Docs**
- Block-based notes editor (BlockNote) with backlinks and task links

**Notifications & integrations**
- In-app, email (Resend), and web push (VAPID) notifications with snooze
- Google Calendar two-way sync
- GitHub per-task links and inbound webhook
- Email-to-task inbox webhook
- Outbound webhooks and automation rule engine
- Custom reminders

**AI (Groq)**
- Natural-language task parsing, tag suggestions, priority inference, time estimates
- Description expansion, task breakdown, weekly digest, load alert

**Auth & security**
- Email/password with email verification, Google OAuth, GitHub OAuth
- JWT HS256 bearer tokens + API token alternative auth
- TOTP 2FA
- Admin dashboard (metrics, users, analytics)

**Developer**
- PWA (service worker, installable)
- Real-time updates via SSE
- Command palette, global search
- Configurable automations

## Quick Start (Docker)

> [!IMPORTANT]
> Docker and Docker Compose are required. All services start automatically.

```bash
cp .env.example .env
# Set a strong JWT_SECRET in .env
docker compose up
```

App → [http://localhost:3000](http://localhost:3000) · API → [http://localhost:8080](http://localhost:8080)

Migrations run automatically on backend startup. No manual DB setup needed.

## Manual Setup

**Prerequisites:** Go 1.24+, Node.js 20+, pnpm, PostgreSQL 16

### Backend

```bash
cd backend
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/rivz?sslmode=disable
export JWT_SECRET=your-long-random-secret
export PORT=8080
export CORS_ORIGIN=http://localhost:3000
go run ./cmd/api
```

### Frontend

```bash
cd rivz
cp ../.env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8080
pnpm install
pnpm dev
```

## Environment Variables

### Required

| Variable | Service | Description |
|---|---|---|
| `DATABASE_URL` | Backend | PostgreSQL connection string |
| `JWT_SECRET` | Backend | HS256 signing secret (≥ 32 chars) |
| `PORT` | Backend | HTTP listen port (default: `8080`) |
| `CORS_ORIGIN` | Backend | Allowed frontend origin |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend base URL |

### Optional — feature flags

Leave these empty to disable the corresponding feature. The API returns `501` for disabled endpoints.

| Variable | Feature |
|---|---|
| `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | File attachments |
| `GROQ_API_KEY` | AI routes |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push notifications |
| `RESEND_API_KEY` | Transactional email |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth + Calendar sync |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET` | GitHub OAuth + webhook |
| `FRONTEND_URL` | Email links, OAuth redirects |

See [`.env.example`](.env.example) for a complete template.

## Running Tests

```bash
cd backend
go test -race ./...
```

> [!NOTE]
> Tests use [testcontainers-go](https://golang.testcontainers.org/) and spin up a real PostgreSQL instance. Docker must be running.

## Architecture

```
rivz-asn/
├── backend/          # Go 1.24 REST API
│   ├── cmd/api/      # Entry point — wires all packages, runs migrations, starts scheduler
│   └── internal/
│       ├── server/   # chi router, all route registrations
│       ├── auth/     # JWT, OAuth, email verify, TOTP, middleware
│       ├── db/       # pgxpool connect + golang-migrate (embedded)
│       ├── tasks/    # Core domain — repo → service → handler pattern
│       └── ...       # ~40 feature packages, each self-contained
└── rivz/             # Next.js 16 App Router frontend
    ├── app/
    │   ├── (auth)/   # Login, signup, verify-email
    │   ├── (app)/    # Authenticated shell — tasks, projects, goals, habits, docs, settings
    │   ├── (admin)/  # Admin metrics dashboard
    │   └── share/    # Public read-only task view
    ├── lib/          # API client, TanStack Query hooks per domain, auth context, SSE hook
    └── components/   # shadcn/ui primitives + app-level components
```

**Backend conventions:**
- Each feature = `model.go` + `repository.go` + `service.go` + `handler.go`
- New features → new package → register in `main.go` + `server.go` + add migration
- IDs: UUID strings. Migrations: sequential `NNNN_name.{up,down}.sql`, auto-applied.

**Frontend conventions:**
- Data layer: `lib/api.ts` fetch wrapper + per-domain `lib/<feature>-hooks.ts` (TanStack Query v5)
- JWT stored in `localStorage["token"]`, sent as `Authorization: Bearer`

## Deploy

### Railway (backend + database)

1. Create a Railway project, add a PostgreSQL service, copy `DATABASE_URL`
2. Add a service → connect your GitHub repo → set root directory to `backend/`
3. Set env vars: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` (your Vercel URL)
4. Deploy and copy the Railway service URL

### Vercel (frontend)

1. Import the GitHub repo, set root directory to `rivz/`
2. Set `NEXT_PUBLIC_API_URL` to the Railway backend URL
3. Deploy

## Design Notes

- **JWT in localStorage** — frontend and backend live on different domains in production, making `httpOnly` cookies impractical (SameSite / CORS-credentials friction). XSS risk is accepted; no sensitive data beyond the token is stored client-side.
- **Embedded migrations** — `golang-migrate` with an `iofs` source runs on startup; no external CLI required.
- **Optimistic UI** — TanStack Query `onMutate` for mutations; UI updates instantly and rolls back on error.
- **SQL sort safety** — sort column is validated against a whitelist before interpolation; no raw user input reaches SQL.
- **Feature gating via env** — optional integrations (S3, Groq, VAPID, Resend, OAuth) activate only when their env vars are set; missing vars return `501` at the endpoint level, not a boot failure.
