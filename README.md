# Daybook

One ledger for routine, health, fitness, and money. See the [architecture blueprint](https://claude.ai/code/artifact/8cba4e4e-a519-422a-bc92-c16c252273e4) for the full product/architecture analysis this MVP implements.

Current scope (M0–M2 of the roadmap): auth, dashboard, routine, habits, finance, fitness — manual entry only, no Apple Health or AI yet.

## Stack

- **Backend** — FastAPI, SQLAlchemy 2.0 (async), PostgreSQL, Alembic. `backend/`
- **Frontend** — React 19, TypeScript, Vite, Tailwind v4, TanStack Query. `frontend/`

## Prerequisites

- Python 3.12+, [uv](https://docs.astral.sh/uv/)
- Node 20+
- A local PostgreSQL server (any recent version)

## Setup

```bash
# 1. Database — create a role and database once
psql -d postgres -c "CREATE ROLE daybook WITH LOGIN PASSWORD 'daybook';"
psql -d postgres -c "CREATE DATABASE daybook OWNER daybook;"

# 2. Backend
cd backend
cp .env.example .env   # edit JWT_SECRET before any real deployment
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev   # http://localhost:5173 — proxies /api to :8000
```

### Or: everything in Docker

`docker-compose.yml` at the repo root can run the whole stack — Postgres, backend, and frontend — with no local Python/Node/Postgres install at all:

```bash
docker compose up --build   # http://localhost:5173, proxying /api to the backend container
```

Migrations run automatically on backend startup. This is for local dev only — production still deploys as described below (Render + Cloudflare Pages + Neon), not from these Dockerfiles' compose wiring. Rebuild (`--build`) after changing backend or frontend code; neither container hot-reloads from source.

This Postgres is a separate database from whatever you run natively (a local install, or `docker compose up -d db` below) — same default credentials, different data, since the backend container talks to it over Docker's internal network rather than the host's `localhost:5432`. Don't expect data logged through one to show up via the other.

If you'd rather run backend/frontend natively but skip installing Postgres, bring up just the database instead — `docker compose up -d db`, then point `DATABASE_URL` in `backend/.env` at `localhost:5432` with the compose file's credentials.

## Tests

```bash
# Backend — unit/integration/authorization tests against a real Postgres
cd backend
psql -d postgres -c "CREATE DATABASE daybook_test OWNER daybook;"   # once
uv run pytest

# Backend lint
uv run ruff check .

# Frontend type-check + lint
cd frontend
npx tsc -b
npm run lint

# Frontend E2E (drives system Chrome — see playwright.config.ts)
npm run test:e2e
```

`./scripts/check-all.sh` from the repo root runs all of the above in one shot (backend lint + tests, frontend type-check + lint + build, e2e) — start the backend and frontend dev servers first, from Setup above, then run it. This is exactly what CI runs; green here means CI will be green too.

## Workflow: dev → prod

Production is AWS EC2 (backend) + RDS (database) + Cloudflare Pages (frontend) — see [ARCHITECTURE.md §8](ARCHITECTURE.md) for the full picture. Render + Neon (`DEPLOY.md`) is an unused free-tier fallback, not a second production target. There's no separate hosted staging environment, only your own machine as "dev":

1. **Develop locally** against your own Postgres (native setup or `docker compose up --build`), not production's RDS database.
2. **Run `./scripts/check-all.sh`** (or the individual commands under Tests) before pushing anything. This is the "is everything good" gate — don't skip it because a change looks small.
3. **Push a branch and open a PR**, rather than committing straight to `main`. [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs backend/frontend/e2e checks automatically on every PR and every push to `main`.
4. **Merge once CI is green.** Cloudflare Pages redeploys the frontend on every push to `main`, independent of CI — same caveat as before, it doesn't wait for a green run. The backend is different: a `deploy-ec2` job in `ci.yml` deploys to EC2 (rsync, rebuild, migrate, restart) automatically, but *only* after backend/frontend/e2e all pass — the one deploy path actually gated on tests.

## Deploying

See [DEPLOY.md](DEPLOY.md) — free-tier hosting on Neon (Postgres), Render (API), and Cloudflare Pages (web app), including how to move existing local data over.

## Notes

- The refresh token lives in an httpOnly cookie scoped to `/api/v1/auth`; the access token lives in memory on the frontend only (never `localStorage`) — see `AE` in the blueprint for why.
- Every domain table is scoped by `user_id` and every repository method filters on it — there is no endpoint that trusts a resource ID alone. `tests/test_routines.py::test_cannot_access_another_users_routine` is the regression test for this.
- What's deliberately not built yet, and why: `AS` and `AV` in the blueprint (Apple Health sync, AI assistant, Redis/background workers, LangGraph).
