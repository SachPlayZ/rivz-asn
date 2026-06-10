# Task Manager — Rival.io Take-Home

A full-stack task management app: Go REST API + PostgreSQL backend, Next.js 16 frontend.

## Architecture

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind v4, React Query, shadcn/ui
- **Backend:** Go 1.24, chi router, pgx/v5, golang-migrate (embedded), JWT (HS256)
- **Database:** PostgreSQL 16

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit JWT_SECRET in .env
docker compose up
```

App runs at http://localhost:3000

## Manual Setup

### Prerequisites
- Go 1.24+, Node.js 20+, pnpm, PostgreSQL 16

### Backend

```bash
cd backend
cp ../.env.example .env
# Edit DATABASE_URL and JWT_SECRET
export DATABASE_URL=postgres://...
export JWT_SECRET=your-secret
export PORT=8080
export CORS_ORIGIN=http://localhost:3000
go run ./cmd/api
```

Migrations run automatically on startup.

### Frontend

```bash
cd rivz
cp ../.env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8080
pnpm install
pnpm dev
```

## Environment Variables

| Variable | Service | Description |
|---|---|---|
| `DATABASE_URL` | Backend | PostgreSQL connection string |
| `JWT_SECRET` | Backend | HS256 signing secret (≥32 chars recommended) |
| `PORT` | Backend | HTTP port (default: 8080) |
| `CORS_ORIGIN` | Backend | Allowed frontend origin |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend base URL |

## Running Tests

```bash
cd backend
go test -race ./...
```

Tests use testcontainers-go (requires Docker).

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /auth/signup | No | Register |
| POST | /auth/login | No | Login → JWT |
| GET | /auth/me | Bearer | Current user |
| POST | /tasks | Bearer | Create task |
| GET | /tasks | Bearer | List (filter/sort/paginate) |
| GET | /tasks/:id | Bearer | Get task |
| PATCH | /tasks/:id | Bearer | Update task |
| DELETE | /tasks/:id | Bearer | Delete task |

### List Tasks Query Params

| Param | Values | Description |
|---|---|---|
| status | todo/in_progress/done | Filter by status |
| search | string | Title ILIKE search |
| sort | created_at/updated_at/due_date/priority | Sort column |
| order | asc/desc | Sort direction |
| page | integer | Page number (default 1) |
| limit | integer | Page size (default 20) |

## Deploy

### Railway (backend + db)

1. Create new Railway project
2. Add PostgreSQL service → copy DATABASE_URL
3. Add new service → connect GitHub repo → set root to `backend/`
4. Set env vars: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` (your Vercel URL)
5. Deploy → copy the Railway URL

### Vercel (frontend)

1. Import GitHub repo → set root directory to `rivz/`
2. Set env var: `NEXT_PUBLIC_API_URL` = Railway backend URL
3. Deploy

## Assumptions & Trade-offs

- **JWT in localStorage** (not httpOnly cookies): chosen because frontend and backend are on different domains in production — avoids SameSite/CORS-credentials friction. Trade-off: XSS exposure, mitigated by not storing sensitive data beyond the token.
- **Embedded migrations**: run on startup via golang-migrate iofs source — no external CLI dependency.
- **Optimistic UI**: React Query `onMutate` for toggle/delete — UI updates instantly, rolls back on error.
- **Sort injection prevention**: sort column validated against whitelist before interpolation into SQL.
- **Test strategy**: 4 integration tests against real Postgres (testcontainers-go) covering auth flow, ownership, filtering, and validation.
