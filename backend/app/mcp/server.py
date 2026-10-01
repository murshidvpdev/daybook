"""The Daybook MCP server: tools Claude can call on the signed-in user's behalf.

Each tool calls the regular /api/v1 routes in-process (no network hop), as the
user the OAuth access token belongs to. Going through the API rather than the
service layer means every tool inherits the exact same ownership checks,
validation, and response shapes the web app gets — nothing here can reach data
the user couldn't reach from their own browser.
"""

import json
from datetime import date
from typing import Any, Literal
from uuid import UUID

from httpx import ASGITransport, AsyncClient
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import ProviderTokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from app.core.security import create_access_token
from app.mcp.oauth import ISSUER_URL, RESOURCE_URL, DaybookOAuthProvider

provider = DaybookOAuthProvider()

mcp = MCPServer(
    "daybook",
    instructions=(
        "Daybook is the user's personal log of routines, habits, money, and workouts. Amounts are in the "
        "account's currency (usually INR). Look up ids with the list_* tools before calling a tool that needs one."
    ),
    # A token verifier rather than the full provider: passing the provider
    # would mount the authorization-server routes at the site root, where
    # /register collides with the web app's own sign-up page. They're mounted
    # under /oauth instead (see app/mcp/__init__.py).
    token_verifier=ProviderTokenVerifier(provider),
    auth=AuthSettings(issuer_url=ISSUER_URL, resource_server_url=RESOURCE_URL, validate_token_resource=True),
)

READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=False)
WRITE = ToolAnnotations(readOnlyHint=False, destructiveHint=False, openWorldHint=False)


async def _api(method: str, path: str, *, params: dict[str, Any] | None = None, json_body: Any = None) -> str:
    token = get_access_token()
    if token is None or token.subject is None:
        raise ToolError("Not signed in to Daybook")
    user_id = UUID(token.subject)

    from app.main import app  # deferred: app.main imports this module

    transport = ASGITransport(
        app=app,
        # Rate limits are keyed by client address; giving each user their own
        # keeps one person's busy Claude session from throttling everyone else.
        client=(f"mcp-{user_id}", 0),
    )
    headers = {"Authorization": f"Bearer {create_access_token(user_id)}"}
    async with AsyncClient(transport=transport, base_url="http://daybook/api/v1", headers=headers) as client:
        response = await client.request(
            method,
            path,
            params={k: str(v) if isinstance(v, UUID | date) else v for k, v in (params or {}).items() if v is not None},
            json=json_body,
        )
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise ToolError(f"Daybook returned {response.status_code}: {detail}")
    return json.dumps(response.json(), indent=2) if response.content else "Done."


async def _get(path: str, **params: Any) -> str:
    return await _api("GET", path, params=params)


async def _post(path: str, json_body: Any = None, **params: Any) -> str:
    return await _api("POST", path, params=params, json_body=json_body)


# --- Overview ----------------------------------------------------------------


@mcp.tool(annotations=READ_ONLY)
async def get_today_summary() -> str:
    """Today's at-a-glance summary: routine items done, habits done, money spent today, and whether
    a workout was logged."""
    return await _get("/dashboard/today")


@mcp.tool(annotations=READ_ONLY)
async def get_day_report(report_date: date) -> str:
    """Everything logged on one day: completed routine items and habits, transactions, workouts,
    and lending activity."""
    return await _get(f"/reports/day/{report_date.isoformat()}")


@mcp.tool(annotations=READ_ONLY)
async def get_month_report(year: int, month: int) -> str:
    """A month's roll-up: routine/habit consistency, income vs expense, top spending categories, and
    workouts."""
    return await _get(f"/reports/month/{year}/{month}")


# --- Routines & habits -------------------------------------------------------


@mcp.tool(annotations=READ_ONLY)
async def list_routines() -> str:
    """All routines with their items, including each item's id and whether it's done today. Use the
    ids with toggle_routine_item."""
    return await _get("/routines")


@mcp.tool(annotations=WRITE)
async def toggle_routine_item(routine_id: UUID, item_id: UUID, on: date | None = None, at: str | None = None) -> str:
    """Mark a routine item done (or undo it if already done) for a day — today by default.
    `at` is the time it was done, as HH:MM, defaulting to now."""
    return await _post(f"/routines/{routine_id}/items/{item_id}/toggle", on=on, at=at)


@mcp.tool(annotations=READ_ONLY)
async def list_habits(include_archived: bool = False) -> str:
    """All habits with id, cadence, whether done today, and current streak."""
    return await _get("/habits", include_archived=include_archived)


@mcp.tool(annotations=WRITE)
async def toggle_habit(habit_id: UUID, on: date | None = None) -> str:
    """Mark a habit done (or undo it if already done) for a day — today by default."""
    return await _post(f"/habits/{habit_id}/toggle", on=on)


@mcp.tool(annotations=WRITE)
async def create_habit(name: str, cadence: Literal["daily", "weekly"] = "daily") -> str:
    """Start tracking a new habit."""
    return await _post("/habits", {"name": name, "cadence": cadence})


# --- Finance -----------------------------------------------------------------


@mcp.tool(annotations=READ_ONLY)
async def list_accounts() -> str:
    """Bank/cash/wallet accounts with id, type, currency, and current balance. Needed for
    add_transaction's account_id."""
    return await _get("/finance/accounts")


@mcp.tool(annotations=READ_ONLY)
async def list_categories() -> str:
    """Income and expense categories with id and kind. Needed for add_transaction's category_id."""
    return await _get("/finance/categories")


@mcp.tool(annotations=READ_ONLY)
async def list_transactions(
    start: date | None = None,
    end: date | None = None,
    kind: Literal["income", "expense"] | None = None,
    account_id: UUID | None = None,
    category_id: UUID | None = None,
    limit: int = 50,
) -> str:
    """Transactions, newest first, optionally filtered by date range, kind, account, or category.
    Returns ids only for account/category — pair with list_accounts/list_categories for names."""
    return await _get(
        "/finance/transactions",
        start=start,
        end=end,
        kind=kind,
        account_id=account_id,
        category_id=category_id,
        limit=limit,
    )


@mcp.tool(annotations=WRITE)
async def add_transaction(
    account_id: UUID,
    amount: float,
    kind: Literal["income", "expense"] = "expense",
    category_id: UUID | None = None,
    note: str | None = None,
    occurred_on: date | None = None,
) -> str:
    """Record an income or expense against an account (updates its balance). `amount` is always
    positive; `kind` sets the direction. occurred_on defaults to today."""
    return await _post(
        "/finance/transactions",
        {
            "account_id": str(account_id),
            "amount": str(amount),
            "kind": kind,
            "category_id": str(category_id) if category_id else None,
            "note": note,
            "occurred_on": occurred_on.isoformat() if occurred_on else None,
        },
    )


@mcp.tool(annotations=READ_ONLY)
async def get_finance_summary() -> str:
    """Net position: account balances, credit card dues, EMIs, SIPs, and money lent/borrowed."""
    return await _get("/finance/analytics/summary")


@mcp.tool(annotations=READ_ONLY)
async def get_spending_analytics(days: int | None = None, year: int | None = None, month: int | None = None) -> str:
    """Spending by category plus income vs expense, over either the last `days` days or a calendar
    month (`year` + `month`). Defaults to the last 30 days."""
    params = {"days": days, "year": year, "month": month}
    by_category = json.loads(await _get("/finance/analytics/category-breakdown", **params))
    income_vs_expense = json.loads(await _get("/finance/analytics/income-vs-expense", **params))
    return json.dumps({"by_category": by_category, "income_vs_expense": income_vs_expense}, indent=2)


@mcp.tool(annotations=READ_ONLY)
async def get_monthly_cashflow(year: int | None = None, month: int | None = None, months: int = 6) -> str:
    """Earned vs spent vs saved, per month, for the `months` months (1-24) ending at `year`/`month`
    (default: the current month), oldest first. Prefer this over income_vs_expense for "how much did I
    earn / save": `income` is real earnings only (borrowed money, friends' repayments, and card bill
    payments are excluded), `spent` excludes money lent out, `saved` = income - spent, and lending
    money in/out is reported separately as `lending_in` / `lending_out`."""
    return await _get("/finance/analytics/monthly-cashflow", year=year, month=month, months=months)


# --- Fitness -----------------------------------------------------------------


@mcp.tool(annotations=READ_ONLY)
async def list_exercises() -> str:
    """Exercises in the user's library with id and muscle group. Needed for log_workout's sets."""
    return await _get("/fitness/exercises")


@mcp.tool(annotations=READ_ONLY)
async def list_workouts() -> str:
    """Logged workout sessions with their sets."""
    return await _get("/fitness/sessions")


@mcp.tool(annotations=WRITE)
async def log_workout(
    name: str = "Workout",
    performed_on: date | None = None,
    duration_minutes: int | None = None,
    notes: str | None = None,
    sets: list[dict[str, Any]] | None = None,
) -> str:
    """Log a workout session. Each set is {"exercise_id": str, "reps": int, "weight_kg": number
    (optional), "set_number": int (optional)} — exercise ids come from list_exercises."""
    session = json.loads(
        await _post(
            "/fitness/sessions",
            {
                "name": name,
                "performed_on": performed_on.isoformat() if performed_on else None,
                "duration_minutes": duration_minutes,
                "notes": notes,
            },
        )
    )
    result = json.dumps(session, indent=2)
    for i, s in enumerate(sets or [], start=1):
        result = await _post(f"/fitness/sessions/{session['id']}/sets", {"set_number": i, **s})
    return result
