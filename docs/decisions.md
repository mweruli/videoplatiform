# Architecture Decisions

Decisions made outside `DEVELOPMENT_PLAN.md` during implementation, so the team doesn't rediscover the same question. Append, don't rewrite history — add new entries below existing ones.

## 2026-08-28 — Sprint 1 foundations skeleton

**Sync SQLAlchemy (psycopg 3), not async.** The dev plan specifies SQLAlchemy 2.0 without committing to sync or async. Chose sync: this is a 5-person team shipping mostly CRUD-shaped endpoints in 12 weeks, and sync SQLAlchemy + Alembic is materially less error-prone than async SQLAlchemy (session lifecycle, greenlet quirks, async-aware everything) for that profile of work. FastAPI still serves requests concurrently via its threadpool. Revisit per-endpoint only if a specific route is a proven bottleneck — don't rewrite the whole data layer speculatively.

**Dependency management via requirements.txt / requirements-dev.txt, not Poetry/PDM.** Simplest thing that works, matches the Dockerfile directly, no lockfile tooling to teach. `requirements-dev.txt` adds pytest/ruff/mypy on top of the runtime set.

**Health check at both `/health` (unprefixed) and implicitly reachable via the same handler under `/api/v1`.** Unprefixed `/health` exists for load balancers, uptime monitors (see `docs/SETUP.md` re: UptimeRobot) and the frontend's placeholder connectivity check — those shouldn't need to know the API version prefix. Actual API capabilities live under `/api/v1/*` per the API-first architecture.

**Category model + migration included in the Sprint 1 skeleton**, seeded with the 18 launch categories from `PROJECT_BRIEF.md`, because the sprint plan explicitly lists "18 categories seeded" as a Sprint 1 deliverable and it's the natural way to prove the SQLAlchemy → Alembic → Postgres pipeline actually works end to end (rather than shipping migrations with zero tables). The Backend Engineer should extend this model (hierarchy, icon, sort order) as listing work in Sprint 2 needs it — treat the current shape as a placeholder, not a final schema.

**Tailwind v4 (`@tailwindcss/vite` plugin) instead of v3 + postcss config.** Less config surface for a fresh Vite project, same utility classes the Frontend Engineer and UI/UX Designer will use. `frontend/src/styles/index.css` defines a handful of starter `@theme` tokens (`--color-brand-*`, `--color-surface`, `--color-ink`) purely so the placeholder pages aren't unstyled — the UI/UX Designer owns the real design system and should replace these once Sprint 1–2 mockups are approved, not treat them as final.

**React pinned to 18.3.x**, not the 19.x that `npm create vite@latest` scaffolds by default today, to match the stack choice in `DEVELOPMENT_PLAN.md` exactly (React 18). If the team wants to move to 19 later, that's a deliberate upgrade decision, not a default from re-scaffolding.

**oxlint kept as the frontend linter** (what the Vite scaffold ships with today) rather than swapping to ESLint. It's fast and already wired to `npm run lint`, which is all CI needs; nothing in the dev plan mandates ESLint specifically. Revisit if a rule ESLint has and oxlint doesn't becomes a real blocker.

**Local dev docker-compose self-hosts Meilisearch** (official image, no external account) so `docker compose up` works with zero external signups. `docs/SETUP.md` flags the production decision (self-host vs. Meilisearch Cloud) as something the PM decides before Sprint 4, not something already settled.

**docker-compose maps Postgres to host port 5433, not 5432.** Verifying the stack on the tech lead's dev machine surfaced a real gotcha: a native Postgres service already listening on 5432 (unrelated to this project — common on a shared dev box) silently intercepts connections meant for the Dockerized one, causing confusing auth failures that look like a docker-compose bug but aren't. Container-to-container traffic (backend service to `postgres:5432`) is unaffected — only the host-exposed port moved. If you hit `password authentication failed` against `localhost:5432` on your own machine, this is almost certainly why; check `netstat`/`lsof` for another Postgres already bound there.

**Meilisearch compose healthcheck uses `127.0.0.1`, not `localhost`.** The official image's `wget` resolved `localhost` to the IPv6 loopback (`::1`) while Meilisearch itself only binds the IPv4 `0.0.0.0:7700` listener, so the healthcheck reported "unhealthy" (connection refused) even though the server was up and serving requests fine on IPv4. Same class of bug to watch for in any other container healthcheck that uses `localhost`.

**Local dev OTP provider defaults to `console`** (prints codes to backend logs) rather than requiring a real SMS/email provider account to run the skeleton. `AFRICASTALKING_*` config exists for when the Backend Engineer wires up real OTP delivery in Sprint 1's auth work — Africa's Talking is the default suggested provider given the Kenya market, but this isn't a locked-in vendor decision.
