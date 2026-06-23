# CLAUDE.md — rivz-asn

Context map for future sessions. Read this before exploring; it captures structure, conventions, and wiring so you don't re-scan the tree.

## What this is

Full-stack personal task/productivity manager a full productivity suite. Single-user-per-account model — every domain row is scoped by `user_id`. There is **no multi-user workspace / real-time collaboration** yet (only read-only public share links). See "Feature ideas" for the planned guest-collaboration direction.

App is branded **"Fayde"** (the productivity suite) in all UI; repo/module name is still `rivz`/`rivz-asn` (code identifiers unchanged). Logo: `rivz/public/logo.png` (+ `icon-192/512.png` for the PWA manifest), source mark in `rivz/app/android-chrome-*.png`. When adding user-facing copy, use "Fayde".

## Stack

- **Backend:** Go 1.24, chi/v5 router, pgx/v5 (pgxpool), golang-migrate (embedded migrations), JWT HS256. Module: `github.com/SachPlayZ/rivz-asn/backend`.
- **Frontend:** `rivz/` — Next.js 16 (App Router, breaking changes vs older Next — see `rivz/AGENTS.md`), React 19, Tailwind v4, shadcn/ui (Radix + base-ui), TanStack Query v5, react-hook-form + zod v4, BlockNote (docs editor), dnd-kit, recharts, sonner, next-themes.
- **DB:** PostgreSQL 16.
- **Infra:** `docker-compose.yml` (db + backend + frontend). Dockerfiles in `backend/` and `rivz/`.

## Run / test

```bash
docker compose up                      # full stack → http://localhost:3000
# backend manual:
cd backend && go run ./cmd/api         # migrations auto-run on startup
cd backend && go test -race ./...      # uses testcontainers-go (needs Docker)
# frontend manual:
cd rivz && pnpm install && pnpm dev
```

Required env: `DATABASE_URL`, `JWT_SECRET`. Optional features gate on env (empty = disabled): `S3_BUCKET` (attachments → else 501), `GROQ_API_KEY` (AI routes), `VAPID_*` (web push), `RESEND_API_KEY` (email), `GOOGLE_*`/`GITHUB_*` (OAuth + calendar/github integ), `GITHUB_WEBHOOK_SECRET`. Full list: `backend/internal/config/config.go` + `.env.example`.

## Backend architecture

Each feature = self-contained package under `backend/internal/<feature>/` following **repository → service → handler** layering:
- `model.go` — structs, request/response DTOs, `validate:` tags, sentinel errors.
- `repository.go` — pgx SQL, no business logic.
- `service.go` — business logic; cross-feature deps injected via `SetXxxService()` setters on `tasks.Service` to avoid import cycles.
- `handler.go` / `handlers.go` — HTTP, decode/validate, call service, write via `httputil`.

**Wiring lives in two files — update both when adding a feature:**
- `backend/cmd/api/main.go` — constructs every repo/svc/handler, injects cross-deps, starts scheduler, passes all handlers to `server.New(...)`.
- `backend/internal/server/server.go` — `New(...)` takes every handler as a param and registers all routes. Route groups: public (no auth) · auth · `AuthenticateAny` group (JWT **or** API token) · admin group (`RequireAdmin`).

Shared infra packages: `auth` (jwt, middleware, oauth, email verify), `db` (connect + migrations), `httputil` (JSON helpers), `sse` (broker + handler for live updates), `activitylog`, `scheduler`, `email`, `groq` (AI client), `webpush`, `config`.

### Feature packages (≈40)
tasks, subtasks, tags, comments, dependencies, attachments (S3), watchers, reminders, notifications (+delivery: email/webpush/in-app), projects, sprints, goals (OKRs+key results), habits (+logs), timetracking, pomodoro, templates, customfields, savedfilters, notes (docs, backlinks, task-links), search (global), dashboard, automations (rule engine, hooked into task lifecycle), calendarsync (Google), github (per-task links + inbound webhook), inbox (email-to-task webhook), sharing (read-only public tokens), apitokens, totp (2FA), webhooks (outbound), admin (metrics/users/analytics), reminders.

### Scheduler (`scheduler.Start`, goroutine in main)
- 1-min tick: fire due custom reminders.
- 1-hr tick: daily digest emails, recurring task generation, etc.

### Conventions
- IDs are UUID strings. Task `status`: `todo|in_progress|done|failed`. `priority`: `low|medium|high`. `recurrence`: `daily|weekly|monthly`.
- Validation via struct `validate:` tags. Errors returned as `{"error":{"message":..,"fields":..}}`, status via sentinel errors.
- Migrations: `backend/internal/migrations/NNNN_name.{up,down}.sql`, embedded, auto-run. Currently through `0015_calendar_sync`. Add next sequential number.
- Tests: `*_test.go` use testcontainers (real Postgres). Run with `-race`.

## Frontend architecture (`rivz/`)

- **Routing (App Router):** `app/(auth)/` login·signup·verify-email · `app/(app)/` authed shell (dashboard, tasks, habits, goals, projects, sprints, docs, settings) · `app/(admin)/` admin · `app/share/[token]/` public shared task · `app/auth/oauth-callback/`.
- `app/(app)/layout.tsx` — authed chrome: header nav, NotificationsBell, CommandPalette, QuickCapture, PomodoroTimer, ActivitySidebar, PageTracker. Redirects to `/login` if no user.
- `app/providers.tsx` — QueryClientProvider + ThemeProvider + AuthProvider; opens SSE when logged in; registers `/sw.js`.
- **Data layer:** `lib/api.ts` — thin fetch wrapper, reads JWT from `localStorage["token"]`, throws `ApiError`. One hooks file per domain: `lib/<domain>-hooks.ts` (TanStack Query). `lib/auth-context.tsx`, `lib/sse-hook.ts`, `lib/schemas.ts` (zod), `lib/nldate.ts` (natural-lang dates).
- **Tasks UI:** `app/(app)/tasks/_components/` — multiple views: TaskRow (list), KanbanView, CalendarView, GanttView, WeeklyPlanner; TaskForm, ViewToggle, Pagination; `[id]/` detail; `review/` daily review.
- `components/ui/` = shadcn primitives. App-level: CommandPalette, PomodoroTimer, NotificationsBell, QuickCaptureDialog, PageTracker.
- **PWA:** `public/manifest.json` + `public/sw.js` (web push).

## Auth flow

Email/password (with email verification via Resend) **or** Google/GitHub OAuth. JWT in localStorage, sent as `Authorization: Bearer`. Optional TOTP 2FA. API tokens (`settings/api-tokens`) work as alternative bearer auth on the `AuthenticateAny` route group. Admin gated by `user.role == "admin"`.

## Where to change things (cheat sheet)

- New backend feature → new `internal/<f>/` package (4 files) + register in `main.go` + `server.go` (+ migration).
- New route on existing feature → add handler method + one line in `server.go`.
- New frontend data call → add to relevant `lib/<domain>-hooks.ts` + `lib/api.ts` already generic.
- New env var → `config.go` struct + `Load()` + `.env.example`.

## Task/notes meta

`tasks/todo.md` tracks in-flight plans (per user global workflow). `tasks/lessons.md` may hold correction patterns.

---

## Feature ideas — solo-first with optional guest contributors

Direction: stay **personal-first** (not a business/team product), but let an owner invite a few **guests** into their workspace or into specific items. Biggest gap today: data is single-user-scoped and sharing is read-only. To enable guests you need a collaboration layer.

### Foundation (prerequisite for most below)
- **Workspace + membership model:** `workspaces`, `workspace_members(workspace_id, user_id, role)` with roles `owner | guest`. Migrate existing `user_id`-scoped rows under an implicit personal workspace. Auth/repo queries scope by workspace membership instead of raw `user_id`.
- **Guest invites:** extend `sharing` from read-only tokens to **invite tokens** that, on accept, create a `guest` membership (scoped to a project, a goal, or a single task). Email invite via existing Resend client.
- **Per-resource ACL:** lightweight `resource_shares(resource_type, resource_id, user_id, permission)` so a guest sees only what they're invited to — keeps it solo-by-default, collaborative-on-demand.

### Collaboration features (build on foundation)
- **Editable shared task/project** (vs today's read-only) — guest can comment, change status, log time. Comments + watchers + notifications + SSE already exist; reuse them for guest activity.
- **@mentions in comments/notes** → notification to mentioned member (notifications + delivery already wired).
- **Assignment to guests:** `tasks.assignee_id` already exists but is unused for real multi-user — light up assignee = workspace member, with "assigned to me" filter.
- **Shared docs collaboration:** BlockNote already in `docs/`; add presence/comments. (Full real-time CRDT is a bigger lift — start with section comments + last-editor.)
- **Activity feed per shared resource** — activitylog already records events; filter to a resource for guests.

### Solo-productivity features (no collab needed, high value)
- **Recurring tasks UI polish + skip/snooze** (recurrence engine exists in scheduler).
- **Time-blocking / calendar drag-to-schedule** in WeeklyPlanner; two-way Google Calendar sync already partially built (`calendarsync`).
- **Smart daily planning** — AI `plan-day` route exists; surface as a guided morning flow.
- **Habit streak insights + goal/OKR progress rollups** on dashboard.
- **Templates marketplace / shareable templates** (templates pkg exists; add public/shared templates — natural bridge to guest sharing).
- **Saved-filter smart lists as nav pins.**
- **Offline-first PWA** (SW already registered) — queue mutations, sync on reconnect.

### Suggested sequencing
1. Workspace + membership migration (unblocks everything).
2. Guest invite tokens + per-resource ACL.
3. Editable shared task/project + assignment to guests (reuses comments/watchers/SSE/notifications).
4. @mentions, shared activity feed.
5. Solo polish items in parallel (independent of collab).
