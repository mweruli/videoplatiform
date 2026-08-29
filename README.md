# Miles Tech Video Discovery, Product Search & Advertising Platform

A video-first search, product discovery, business directory and digital advertising platform for the Kenyan market, expanding to wider Africa. Video is the primary content medium throughout — search, discover, watch, compare, connect, advertise.

See [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) for full product scope, [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) for the Phase 1 build plan, sprint sequencing and tech stack, and [`docs/TEAM.md`](docs/TEAM.md) for how the team operates.

## Stack

- **Frontend**: React 18 + Vite + TypeScript, TanStack Query, Tailwind CSS.
- **Backend**: FastAPI (Python 3.12), SQLAlchemy 2.0 + Alembic, PostgreSQL, Redis.
- **Search**: Meilisearch (self-hosted for local dev).
- **Infra**: Docker Compose (local dev), GitHub Actions CI.

## Running it locally

### Option A — Docker Compose (recommended)

Brings up Postgres, Redis, Meilisearch, the backend API and the frontend dev server together.

```bash
# 1. Create env files from the examples (one-time)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Start everything
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000 (docs at `/docs`, health at `/health`)
- Meilisearch: http://localhost:7700
- Postgres: localhost:5433 (`milestech` / `milestech`) — 5433, not 5432, to avoid colliding with a native Postgres some dev machines already run on 5432
- Redis: localhost:6379

The backend container waits for Postgres/Redis, runs Alembic migrations, seeds the 18 launch categories, then starts the API with hot reload. The frontend container runs the Vite dev server with hot reload. Both mount your local source, so edits apply immediately.

### Option B — run backend and frontend separately

Useful if you don't want Docker, or you're only working on one side.

**Backend** (needs a local or dockerised Postgres + Redis reachable at the URLs in `.env`):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements-dev.txt
copy .env.example .env        # then edit DATABASE_URL / REDIS_URL if needed
alembic upgrade head
python -m app.db.seed
uvicorn app.main:app --reload
```

**Frontend**:

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

## Running backend tests

```bash
# Against the live docker-compose stack (real end-to-end verification):
docker compose exec backend pytest

# Or from an activated backend/.venv (Option B above):
cd backend
pytest
```

Either form is safe to run at any time, including against the stack that has the PM's demo data seeded via `app/db/seed_demo.py` — **tests never touch the `milestech` database.** `backend/tests/conftest.py` automatically redirects the test run to a sibling `milestech_test` database (created and migrated on first use, in the same Postgres container/instance — no extra service) and Redis logical DB 15, before the app's DB engine is ever constructed. This happens unconditionally, regardless of how pytest is invoked; there is no env var to remember to set. See `docs/decisions.md` ("Isolated test database") for the root cause this replaced and how it was verified.

## Repo layout

```
backend/          FastAPI app (app/api, app/core, app/db, app/models, app/schemas), Alembic migrations
frontend/         React + Vite + TypeScript app (src/pages, src/components, src/lib, src/styles)
docs/             Project brief, development plan, team charter, setup checklist, architecture decisions
.github/workflows Continuous integration (lint + build/test for both apps)
docker-compose.yml Local dev stack: Postgres, Redis, Meilisearch, backend, frontend
```

## Documentation

- [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) — product scope, roles, business model.
- [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) — Phase 1 scope, sprint plan, tech stack, risks.
- [`docs/TEAM.md`](docs/TEAM.md) — how the (subagent) team is organised and how work is routed.
- [`docs/SETUP.md`](docs/SETUP.md) — external accounts/services the PM needs to set up before later sprints.
- [`docs/decisions.md`](docs/decisions.md) — architecture decisions made outside the development plan.
