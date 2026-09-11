FROM python:3.12-slim AS base
WORKDIR /app
RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev

EXPOSE 8000
# Render (and most PaaS hosts) assign the listen port via $PORT at runtime rather
# than honoring EXPOSE — falls back to 8000 for local `docker run`.
CMD ["sh", "-c", "uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
