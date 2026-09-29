# Daybook — Architecture & How Everything Works

This is the technical reference for the app: what's used, why, how a request
travels from your phone to the database and back, how tests and deployment
work, and where to look when something breaks. `DEPLOY.md` covers *how to
deploy*; this covers *how it's built*.

## 1. The 30-second version

- **Backend**: Python (FastAPI), talks to **Postgres** through an async ORM.
- **Frontend**: React (TypeScript), talks to the backend over a JSON HTTP API.
- **Auth**: short-lived login tokens + a long-lived cookie that silently
  renews them — you don't re-enter your password for a month.
- **Hosting**: AWS EC2 (backend, Docker) + RDS (database) — the permanent
  production setup — plus Cloudflare Pages (frontend, static). Render
  (backend) and Neon (database) exist as a free-tier alternative path but
  aren't what's actually live.
- **Tests**: two layers — fast in-process backend tests, and slower
  real-browser tests that click through the actual UI.
- **CI/CD**: every push to `main` runs all of that automatically on GitHub;
  Cloudflare Pages redeploys on its own, and a `deploy-ec2` job in
  `ci.yml` deploys the backend to EC2 — but only after backend/frontend/e2e
  all pass, the one deploy target that's actually gated on CI.

Everything below expands on each of these.

---

## 2. Repository layout

```
personal_routine_app/
├── backend/                   # FastAPI service
│   ├── app/
│   │   ├── main.py            # app startup: middleware, CORS, routers, /health
│   │   ├── api/
│   │   │   ├── deps.py        # shared dependencies (get_current_user, ...)
│   │   │   └── v1/            # one router file per domain
│   │   │       ├── router.py  #   mounts all of them under /api/v1
│   │   │       ├── auth.py
│   │   │       ├── dashboard.py
│   │   │       ├── routines.py
│   │   │       ├── habits.py
│   │   │       ├── finance.py
│   │   │       └── fitness.py
│   │   ├── core/               # config, JWT/password hashing, rate limiting
│   │   ├── db/                 # SQLAlchemy engine/session, declarative Base
│   │   ├── models/              # one file per domain: SQLAlchemy table classes
│   │   ├── schemas/             # one file per domain: Pydantic request/response shapes
│   │   └── services/            # one file per domain: the actual business logic
│   ├── alembic/                 # database migration history
│   ├── tests/                   # pytest suite (100 tests)
│   ├── Dockerfile               # how EC2 (and, as a fallback, Render) builds/runs the API
│   └── pyproject.toml           # dependencies (managed by `uv`)
├── frontend/                    # React SPA
│   ├── src/
│   │   ├── main.tsx             # React Query client + router + providers
│   │   ├── App.tsx              # top-level routes
│   │   ├── auth/AuthContext.tsx # who's logged in, app-wide
│   │   ├── lib/                 # axios client, token storage, small helpers
│   │   ├── components/          # generic UI pieces (Card, Icons, Layout)
│   │   ├── features/            # one folder per domain — see §5
│   │   └── types/api.ts         # TypeScript shapes mirroring the backend schemas
│   ├── e2e/                     # Playwright browser tests (17 tests)
│   ├── functions/api/[[path]].js # Cloudflare Pages Function — the API proxy
│   └── package.json
├── .github/workflows/ci.yml     # GitHub Actions: lint + test + build, on every push
├── render.yaml                  # Render's Blueprint for the backend service
└── DEPLOY.md                    # step-by-step hosting guide
```

The backend is a **modular monolith**: one FastAPI process, but internally
split by domain (finance, fitness, habits, routine) with no domain importing
another's internals. Each domain has the same four-file shape — `models` →
`schemas` → `services` → `api/v1` — described next.

---

## 3. Backend: request lifecycle

### 3.1 The four-layer pattern

Every domain (say, Finance) is built the same way, and a request flows
through the layers in this order:

```
HTTP request
   │
   ▼
api/v1/finance.py      "router" — declares the URL, reads the JWT, calls a service
   │   (FastAPI route + Depends(get_current_user_id))
   ▼
schemas/finance.py     "schema" — validates the request body (Pydantic model)
   │
   ▼
services/finance.py    "service" — the actual logic: ownership checks, math,
   │                    writing to the database, deciding what "current
   │                    balance" even means
   ▼
models/finance.py      "model" — the SQLAlchemy table definitions
   │
   ▼
Postgres
```

Concretely, editing a transaction's amount:

1. `PATCH /api/v1/finance/transactions/{id}` arrives with a JSON body.
2. FastAPI validates that body against `TransactionUpdate` (a Pydantic
   model in `schemas/finance.py`) — wrong types or missing required
   fields are rejected here, before any of your code runs.
3. `get_current_user_id` (a FastAPI *dependency*, in `api/deps.py`) reads
   the `Authorization: Bearer <token>` header, decodes the JWT, and hands
   the router the caller's user ID — every route requires this, so there's
   no route that can accidentally skip authentication.
4. The router calls `service.update_transaction(db, user_id, id, payload)`.
5. The service loads the transaction *scoped to that user's ID* (never
   just by transaction ID alone — this is what stops user A from editing
   user B's data even if they guess the UUID), applies only the fields
   that were actually sent (`exclude_unset=True`, so a partial `PATCH`
   never blanks out fields the client didn't mention), and commits.
6. The updated row is serialized back through an `Out` schema and returned
   as JSON.

### 3.2 Why a "service layer" at all

FastAPI would happily let you put database queries directly in the route
function. They're kept separate here because:
- **Testability**: `backend/tests/` calls service functions and API routes
  interchangeably, but the *business rules* (e.g. "you can't delete an
  account that backs a credit card, delete the card instead") live in one
  place — the service — not copy-pasted across every route that touches it.
- **The router's only job is HTTP**: decide the status code, catch the
  service's exceptions (`FinanceNotFound` → 404, `FinanceValidationError`
  → 400) and translate them. It never contains a database query itself.

### 3.3 Authentication, end to end

```
                     ┌─────────────────────────────────────────┐
  Browser            │              Backend                    │
  ───────            │              ───────                    │
  in-memory           access token (JWT, 15 min)                access token
  access token  ◄─────────────────────────────────────────────  signed with
                     │  every request:                          JWT_SECRET
  refresh token       Authorization: Bearer <token>             │
  (httpOnly cookie,  │                                          │
   30 days,           on 401 → POST /auth/refresh                lookup by
   invisible to JS)  ─────────────────────────────────────────► SHA-256 hash
                     │  (cookie sent automatically by browser)  of the refresh
                     │                                          token in
                     │  ◄─── new access token + rotated cookie  user_sessions
                     └─────────────────────────────────────────┘
```

- **Access token**: a JWT (`app/core/security.py`), valid 15 minutes,
  held only in a JavaScript variable (`lib/tokenStore.ts`) — deliberately
  *not* `localStorage`, so an XSS bug can't just read it out of storage.
  This means a hard page refresh loses it, which is exactly what the
  refresh flow below is for.
- **Refresh token**: a random 48-byte string, sent as an `httpOnly` cookie
  (so JavaScript can never read it at all), valid 30 days. The database
  never stores the raw value — only its SHA-256 hash, in `user_sessions` —
  so a leaked database dump alone can't be used to log in as anyone.
- **The axios interceptor** (`lib/api.ts`) is what makes this invisible to
  the rest of the app: any request that comes back `401` automatically
  calls `/auth/refresh` once, retries the original request with the new
  token, and only actually logs the user out if the *refresh itself*
  fails (meaning the 30-day cookie is gone or revoked).
- **Passwords** are hashed with **Argon2id** (`argon2-cffi`), the current
  recommended algorithm for this — deliberately slow and memory-hard so
  that even a stolen `hashed_password` column is expensive to brute-force.
- **Rate limiting** (`slowapi`, per-IP): register/login/refresh have tight
  limits in production (5, 10, 30 per minute) specifically because those
  are the endpoints a credential-stuffing attempt would hit; everything
  else defaults to 120/minute. These limits are *configurable per
  environment* — the test suite forces the strict production numbers
  regardless of what your local `.env` relaxes them to (see §6.1), so
  tests always verify real production behavior.

### 3.4 The database

- **Postgres**, accessed through **SQLAlchemy 2.0's async ORM** (not raw
  SQL) — `asyncpg` is the actual wire driver underneath.
- **Primary keys are UUIDv7**, not the more common UUIDv4. UUIDv7 embeds a
  timestamp, so new rows sort near each other in the index instead of
  scattering randomly — better B-tree locality as the tables grow.
- **Alembic** manages schema changes. Every structural change (a new
  column, a new table) is a numbered migration file under
  `backend/alembic/versions/`; `alembic upgrade head` applies whatever the
  current database is missing. Render runs this automatically before every
  deploy (`preDeployCommand` in `render.yaml`) — so pushing code that adds
  a column also migrates the live database, in the same deploy.
- **Cascades matter here**: deleting an account cascades to delete its
  transactions (`ON DELETE CASCADE`); deleting a transaction category
  instead falls its transactions back to "Uncategorized"
  (`ON DELETE SET NULL`) rather than deleting them. These rules live in
  the model definitions (`models/finance.py`), not in application code —
  the database enforces them even if a bug in the Python layer forgets to.

---

## 4. Backend domain models, briefly

| Domain | Key tables | Notable behavior |
|---|---|---|
| **Auth** | `users`, `user_sessions` | One session row per issued refresh token; logging out (or an admin revoking a session) sets `revoked_at` rather than deleting the row, so there's an audit trail. |
| **Finance** | `financial_accounts`, `transactions`, `transaction_categories`, `credit_cards`, `credit_card_bills`, `emis`, `sips`, `lendings` | See §4.1 below — this is the most involved domain. |
| **Routine** | `routines`, `routine_items`, `routine_completions` | A completion is a *row per day*, not a boolean flag — so "did I do this on Tuesday" is answerable historically, and toggling twice in a day just adds/removes that day's row. |
| **Habits** | `habits`, `habit_completions` | Same per-day-completion-row pattern; `current_streak` is computed on read (walk backward from today while consecutive days exist), never stored, so it can't drift out of sync. |
| **Fitness** | `exercises`, `workout_sessions`, `exercise_sets` | `exercises` is a per-user catalog (not a shared global list) — keeps ownership checks identical to every other table instead of carving out a "public data" exception. |

### 4.1 Finance domain — the interesting design decisions

- **A credit card *is* a `financial_account`** with `account_type =
  "credit_card"`, plus a `credit_cards` row alongside it holding the
  due-day and limit. This is why a credit card shows up in the same
  Overview account list as a bank account, and can be selected as the
  account for any transaction — they share the same underlying balance
  math (`opening_balance + income − expense`), just interpreted as debt
  instead of cash for a card.
- **Balance is never stored — it's computed** on every read, from
  `opening_balance` plus a `SUM()` over that account's transactions. This
  is deliberate: a stored `current_balance` column could always drift out
  of sync with reality; computing it fresh means it's *definitionally*
  always correct, given the transactions that exist.
- **SIPs auto-generate their transaction** the next time any finance list
  endpoint is hit (a real bank auto-debit doesn't wait for you to
  confirm it either) — see `services/recurring.py:sync_due_sips`. **EMIs
  deliberately don't** — an EMI transaction is only posted when you
  explicitly tap "Yes, paid" (`confirm_emi_payment`), because whether an
  EMI installment actually went through is exactly the kind of thing that
  shouldn't be assumed silently.
- **Lending ↔ Transaction linkage**: lending money to a friend *can*
  optionally also post a transaction against one of your accounts (so
  the money actually leaving reduces your balance, not just a receivable
  note). The `Lending.transaction_id` foreign key ties them together;
  editing a lending's amount also corrects the linked transaction's
  amount, so the two numbers can't silently diverge.
- **Balance adjustment** (added this session, §7) never rewrites
  `opening_balance` directly — it posts a single dated transaction for
  whatever the difference is. This keeps every past balance the app has
  ever shown mathematically consistent, instead of retroactively
  distorting history.

---

## 5. Frontend

### 5.1 Stack

| Piece | Choice | Why |
|---|---|---|
| Framework | React 19 + TypeScript | |
| Build tool | Vite | Fast dev server, instant HMR |
| Styling | Tailwind CSS v4 | Utility classes; theming via CSS custom properties (`var(--accent)` etc.) so light/dark mode is a CSS-level switch, not duplicated components |
| Server-state | **TanStack (React) Query v5** | Every list you see (accounts, transactions, habits...) is a `useQuery` call — it handles caching, retries, and re-fetching after a mutation. This is the single most load-bearing library in the frontend; §7 covers a real bug that came from misunderstanding its caching. |
| Forms | Plain `useState` for most CRUD forms; **React Hook Form + Zod** only in `LoginPage`/`RegisterPage` | The auth forms have real validation rules (email format, password rules) worth a schema; the many small inline edit/create forms across Finance/Routine/Habits/Fitness are simple enough that a schema library would be pure overhead — this was a deliberate choice, not an inconsistency. |
| Charts | Recharts | Spend trend / category breakdown charts on the Finance Overview tab |
| Routing | React Router v7 | `App.tsx` defines top-level routes; the app is a single page (`Layout.tsx`), no server-side rendering |
| HTTP client | axios | Wrapped once in `lib/api.ts` with the auth-refresh interceptor described in §3.3 |

### 5.2 Folder shape: `features/`

Each domain gets its own folder under `src/features/`, containing one
`*Page.tsx` (or `*Tab.tsx` for Finance's sub-tabs) per screen, plus any
small components/hooks it alone needs (e.g.
`features/finance/useSyncFinanceBalances.ts`). There's no separate global
Redux-style state store — screen state is either **server state** (a React
Query cache) or **local UI state** (`useState` for "which row is being
edited right now").

### 5.3 How a page actually renders data

```tsx
const { data: accounts, isLoading } = useQuery({
  queryKey: ['finance', 'accounts'],
  queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
})
```

- `queryKey` is the cache's address — an array, matched by prefix. This
  matters a lot: `invalidateQueries({ queryKey: ['finance'] })` (used
  after almost every mutation) invalidates *every* query whose key starts
  with `'finance'` — accounts, transactions, the summary panel, SIPs,
  everything — in one call, which is why most mutation handlers only need
  one line to keep the whole Finance section in sync.
- **Mutations** (`useMutation`) are how writes happen — create/edit/delete
  all go through one, and on success call `invalidateQueries` to mark the
  relevant cached data stale, which triggers a background refetch. React
  Query keeps showing the *old* data while that refetch is in flight (no
  loading flash), which is what makes the app feel responsive even though
  it's re-fetching from the network on every write.
- **Optimistic updates** (added this session, §7) go one step further for
  a few high-frequency actions: instead of waiting for even that
  background refetch, the cache is updated by hand the instant you click
  Save, then reconciled with the server's real response moments later.

---

## 6. Testing

There are two independent test suites, testing different things:

### 6.1 Backend: `pytest` (100 tests, `backend/tests/`)

- Runs against a **real Postgres database** (`daybook_test`), not mocks —
  a lesson from experience: a mocked-database test can pass while the
  real SQL (a `JOIN`, an `ON DELETE CASCADE`, a constraint) is subtly
  wrong. Every test gets a **fresh schema** (`conftest.py` drops and
  recreates all tables before each test), so tests can't leak state into
  each other.
- Talks to the FastAPI app **in-process** via `httpx.ASGITransport` — no
  real network socket, no separate server process, which is why the whole
  suite runs in ~15–20 seconds.
- `conftest.py` force-sets strict rate-limit env vars *before importing
  the app* — so the test suite always exercises real production rate
  limits, even if a developer has relaxed them in their local `.env` for
  manual testing convenience.
- Tests are organized by what they verify, not strictly by domain file —
  e.g. `test_finance_updates.py` and
  `test_routine_habit_fitness_updates.py` specifically cover the
  PATCH/DELETE endpoints added in this session; `test_rate_limiting.py`
  and `test_config_safety.py` cover the security settings in §3.3.
- Run it: `cd backend && uv run pytest -q` (uses `uv`, the Python package
  manager this project standardizes on — `uv run` executes inside the
  project's virtualenv without you having to activate it manually).

### 6.2 Frontend: Playwright end-to-end (17 tests, `frontend/e2e/`)

- Drives an **actual Chrome browser** against the **actual running app**
  (`npm run dev` + the real backend on `:8000`) — register a real account,
  click real buttons, read real rendered text. This catches an entire
  class of bug that unit tests can't: wrong CSS selector, a button that's
  wired to the wrong mutation, a race in cache invalidation.
- Every test registers its **own fresh user** (`user+timestamp@example.com`)
  so tests never collide with each other or with your real data.
- Locally: `PLAYWRIGHT_CHANNEL=chrome npx playwright test` runs against
  your system-installed Chrome (faster to set up than downloading
  Playwright's bundled browser). CI has no system Chrome, so
  `playwright.config.ts` leaves the channel unset there and
  `npx playwright install --with-deps chromium` downloads one instead.
- A concrete example from this session: `e2e/balance-adjustment.spec.ts`
  actually clicks the balance figure, types a new amount, and asserts the
  Total Balance tile updates — the same test that would have caught the
  stale-cache bug in §7 if it had existed beforehand.

### 6.3 What ties them together: CI

`.github/workflows/ci.yml` runs on every push and every pull request, as
three parallel jobs:

```
┌─────────────┐   ┌──────────────┐   ┌────────────────────────────┐
│  backend     │   │  frontend    │   │  e2e                       │
│  ─────────   │   │  ─────────   │   │  ───                       │
│  spins up a  │   │  npx tsc -b  │   │  spins up Postgres +       │
│  Postgres    │   │  npm run lint│   │  starts the real API +     │
│  service     │   │  npm run     │   │  the real Vite dev server, │
│  container   │   │  build       │   │  then runs Playwright      │
│              │   │              │   │  against both              │
│  ruff check  │   │              │   │                            │
│  pytest      │   │              │   │                            │
└─────────────┘   └──────────────┘   └────────────────────────────┘
```

If any job fails, the PR/push is flagged red on GitHub. The `deploy-ec2`
job actually respects this (`needs: [backend, frontend, e2e]`) and simply
doesn't run if any of them fail — but Cloudflare Pages watches the repo
independently and redeploys the frontend regardless of CI's result, so a
red run still means "stop and fix this before merging," not "nothing bad
can happen." `docker-compose.yml` in the repo root can run the whole
stack locally (`docker compose up --build`) or just Postgres
(`docker compose up -d db`), for running either suite by hand without
installing Postgres natively.

---

## 7. What actually shipped in this session

Three things, in the order they were built:

1. **Edit/delete for everything.** Originally, correcting a mistake meant
   deleting a record and recreating it (and for routines/habits, deleting
   wasn't even possible from the UI). Every domain now has real
   `PATCH`/`DELETE` endpoints (backend) and matching edit/delete buttons
   (frontend) — 34 new backend tests and 5 new e2e tests cover this.
2. **A real stale-balance bug, found and fixed.** `sync_due_sips` (§4.1)
   runs as a *side effect of a `GET` request* — fetching your transaction
   list can silently create a new transaction and change an account's
   balance. React Query has no way to know a plain read did that, so the
   already-cached Total Balance figure could sit stale until something
   unrelated happened to trigger a refetch. Fixed with a small hook,
   `useSyncFinanceBalances`, that explicitly invalidates the
   accounts/summary caches whenever one of those side-effecting queries
   lands.
3. **Manual balance reconciliation + optimistic UI.** A new
   "adjust balance" action posts one auditable transaction for whatever
   the difference is between what the app thinks you have and what you
   say you actually have (never silently rewriting history) — and it,
   along with add/delete-transaction, now update the screen the instant
   you click, instead of waiting on a network round trip.

---

## 8. Deployment (see `DEPLOY.md` for the click-by-click Render/Neon version)

The permanent production setup — AWS for backend/database, Cloudflare for
the static frontend:

```
┌──────────────┐        ┌──────────────────┐        ┌─────────────────────┐
│  Cloudflare  │  /api/*│  EC2              │  SQL   │  RDS                │
│  Pages       │───────►│  (t3.micro,       │───────►│  (db.t3.micro,      │
│  (static     │◄───────│   Elastic IP,     │◄───────│   Postgres 16)      │
│   React app) │  JSON  │   Docker/uvicorn) │        │                     │
└──────────────┘        └──────────────────┘        └─────────────────────┘
     ▲
     │ you, in a browser
```

- **RDS** (`daybook-db`, `ap-south-1`) holds the real production database.
  Its security group only accepts port 5432 from the EC2 instance's own
  security group (plus one whitelisted admin IP for direct `psql` access)
  — not open to the internet, unlike EC2's own inbound rules below.
- **EC2** (`i-0ba8554a089acc824`, `t3.micro`) runs `backend/Dockerfile`
  under plain `docker run`, restarted with `--restart unless-stopped` so
  it survives a reboot. It has an **Elastic IP** (`65.1.218.176`)
  attached, so the address is stable across stop/start — the Cloudflare
  Pages Function below hardcodes its DNS hostname, which would otherwise
  silently break on any address change. Port 80 (plain HTTP, not HTTPS)
  is open to the whole internet — that's how Cloudflare's proxy fetch
  reaches it; port 22 (SSH) is also open to the internet, so this box's
  actual security depends entirely on SSH staying key-only (verified:
  `PasswordAuthentication no`, `KbdInteractiveAuthentication no`).
- **Cloudflare Pages** serves the built static frontend (`npm run
  build`'s `dist/` folder). Crucially, the browser never talks to EC2
  directly — `frontend/functions/api/[[path]].js` is a small Cloudflare
  *Pages Function* that transparently proxies every `/api/*` request to
  EC2, so from the browser's point of view there's only one origin. This
  matters specifically for the refresh-token cookie in §3.3: a
  same-origin cookie behaves predictably on iOS Safari, whereas a
  cross-site cookie (talking to EC2's domain directly) does not.
- **Deploys**: Cloudflare Pages watches the GitHub repo and redeploys the
  frontend on every push to `main`, independent of CI. EC2 deploys via
  the `deploy-ec2` job in `.github/workflows/ci.yml` instead — rsync
  `backend/`, rebuild the Docker image, run `alembic upgrade head`,
  restart the container — but *only* after backend/frontend/e2e all pass
  (`needs: [...]`), and only on `main`. This is the one deploy path that's
  actually gated on tests passing; see §6's caveat about Cloudflare Pages
  not being gated the same way.

**Render + Neon** (`render.yaml`, the Render dashboard, `DEPLOY.md`) is a
free-tier alternative deployment path that predates the AWS setup. It
still works and could be repointed to in a pinch (edit `BACKEND_ORIGIN` in
the Pages Function), but nothing currently deploys to it automatically —
it's an unused fallback, not a second production target.

The `frontend/Dockerfile` + `nginx.conf` in the repo are a *third*,
currently-unused path: containerize the frontend behind nginx yourself,
proxying `/api` to a `backend` service on the same Docker network. This is
what `docker-compose.yml`'s full-stack mode (`docker compose up --build`)
uses for local dev — it has no bearing on either Cloudflare Pages or EC2.

---

## 9. Where to look, by question

| Question | Look here |
|---|---|
| "Why is this number wrong?" | `services/finance.py` — balance math is computed, never stored; check `_account_out` and `finance_summary` |
| "How does a new field get validated?" | `schemas/<domain>.py` — Pydantic models, one `Create`/`Update`/`Out` per entity |
| "Why can't user A see user B's data?" | Every service function takes `user_id` and filters by it in the `WHERE` clause — grep for `_get_owned_` helpers |
| "How does the UI know to refresh after I save something?" | `queryClient.invalidateQueries` calls right after each `useMutation`'s success — search the relevant `features/` file |
| "Why did my schema change not show up in prod?" | Did you generate an Alembic migration (`alembic revision --autogenerate`) and commit it? `deploy-ec2` only applies migrations that exist in the repo |
| "Is this tested?" | `backend/tests/` for logic/permissions, `frontend/e2e/` for whether it actually works when clicked |
| "Did my push actually reach production?" | Check `deploy-ec2` in the Actions tab — it only runs (and only deploys) if backend/frontend/e2e all passed first. `curl http://65.1.218.176/health` confirms the box directly |
