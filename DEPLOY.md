# Deploying Daybook

Three pieces, three free-tier hosts: **Neon** (Postgres), **Render** (API), **Cloudflare Pages** (web app). Your existing local data moves over via `pg_dump`/`pg_restore` — same schema, same rows, just relocated.

Render's free plan sleeps a backend after ~15 minutes idle; the next request takes 30–50s to wake it, then it's instant again. That's the tradeoff for $0/month.

## 1. Database — Neon

1. Sign up at [neon.tech](https://neon.tech) (no card needed).
2. Create a project (any region close to you; name it `daybook`).
3. Copy the connection string it gives you — looks like `postgresql://user:pass@ep-xxx.neon.tech/daybook?sslmode=require`.
4. Rewrite it for this app's async driver: change `postgresql://` to `postgresql+asyncpg://`, and drop `?sslmode=require` (asyncpg takes SSL differently — see step 3 below).

## 2. Move your data in

From your Mac, with your local Postgres still running:

```bash
# Dump your real local data
/opt/homebrew/opt/postgresql@14/bin/pg_dump -h localhost -U daybook -d daybook \
  --no-owner --no-privileges -f daybook_export.sql

# Restore it into Neon (use the ORIGINAL postgresql:// URL Neon gave you, not the +asyncpg one)
psql "postgresql://user:pass@ep-xxx.neon.tech/daybook?sslmode=require" -f daybook_export.sql
```

Then run this project's migrations against Neon once, to make sure the schema matches exactly what the app expects (the dump already has the schema, but this confirms Alembic's version table agrees with it):

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://user:pass@ep-xxx.neon.tech/daybook" uv run alembic upgrade head
```

Neon requires SSL; asyncpg needs it passed as a query param spelled differently. Use this exact form for `DATABASE_URL` everywhere below:

```
postgresql+asyncpg://user:pass@ep-xxx.neon.tech/daybook?ssl=require
```

## 3. Backend — Render

1. Push this repo to GitHub (see below if it isn't there yet).
2. Sign up at [render.com](https://render.com), connect your GitHub account.
3. New → Blueprint → pick this repo. Render reads `render.yaml` at the repo root and proposes a `daybook-api` web service.
4. When prompted for the env vars marked `sync: false`, set:
   - `DATABASE_URL` → the Neon connection string from step 2 (the `+asyncpg` / `ssl=require` form)
   - `JWT_SECRET` → a long random value — **do not reuse your local dev one**. Generate one with:
     ```bash
     python3 -c "import secrets; print(secrets.token_hex(32))"
     ```
   - `CORS_ORIGINS` → `["https://daybook.pages.dev"]` (or whatever your actual Cloudflare Pages URL turns out to be — you can update this after step 4)
5. Deploy. Render runs `alembic upgrade head` automatically before each deploy (that's the `preDeployCommand` in `render.yaml`).
6. Note the URL Render gives your service (e.g. `https://daybook-api.onrender.com`). If it's not exactly that, update `frontend/public/_redirects` to match before deploying the frontend.

## 4. Frontend — Cloudflare Pages

1. Sign up at [pages.cloudflare.com](https://pages.cloudflare.com), connect the same GitHub repo.
2. Build settings:
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
3. Deploy. Cloudflare gives you a URL like `https://daybook.pages.dev`.
4. Go back to Render and update `CORS_ORIGINS` to that exact URL if you set a placeholder earlier.

The `_redirects` file already in `frontend/public/` makes Cloudflare proxy `/api/*` to your Render backend at the edge, so the browser only ever talks to one origin — this is what keeps the login cookie working correctly on iOS Safari, which is fussy about cookies set across two different domains.

## 5. First login

Your existing users/accounts/cards came over with the data dump — log in with the same email and password you already use locally. Nothing needs re-entering.

## Pushing to GitHub, if this repo isn't there yet

```bash
git add -A
git commit -m "Initial commit"
gh repo create daybook --private --source=. --remote=origin
git push -u origin main
```

(Or create an empty repo at github.com/new and `git remote add origin <url>` yourself.)

## After this, redeploying is automatic

Both Render and Cloudflare Pages watch the GitHub repo — push to `main` and they redeploy on their own. No manual steps after this first setup.
