#!/usr/bin/env bash
# Runs the same checks CI runs, locally, before you push — so a broken
# change never gets the chance to reach a PR (let alone main -> prod).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Backend: ruff"
(cd backend && uv run ruff check .)

echo "==> Backend: pytest"
(cd backend && uv run pytest -q)

echo "==> Frontend: tsc"
(cd frontend && npx tsc -b)

echo "==> Frontend: lint"
(cd frontend && npm run lint)

echo "==> Frontend: build"
(cd frontend && npm run build)

echo "==> Frontend: e2e (needs backend on :8000 and frontend on :5173 already running)"
if curl -sf http://localhost:8000/health >/dev/null 2>&1 && curl -sf http://localhost:5173 >/dev/null 2>&1; then
  (cd frontend && npx playwright test)
else
  echo "    skipped — start both dev servers first, then run: cd frontend && npx playwright test"
fi

echo
echo "All checks passed."
