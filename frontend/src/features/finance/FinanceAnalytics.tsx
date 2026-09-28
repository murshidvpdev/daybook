import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '../../components/Card'
import { PencilIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import type {
  Account,
  AccountBreakdownItem,
  Category,
  CategoryBreakdownItem,
  IncomeExpense,
  SpendTrendPoint,
  Transaction,
} from '../../types/api'
import { EditTransactionForm } from './EditTransactionForm'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Fixed literals, not --accent/--danger tokens — Recharts writes these straight
// into an SVG fill attribute, and custom-property resolution there is
// inconsistent enough across engines that a literal is the safer bet.
const TREND_COLOR = '#3f8f88'
const INCOME_COLOR = '#1f5f5b'
const EXPENSE_COLOR = '#a33d2c'

// Validated categorical set (dataviz skill reference palette) — adjacent-pair
// CVD-safe across all 8 slots, so a ranked bar chart (compared to its
// immediate neighbors, not all-at-once like a pie) can safely use every slot.
// Assigned by a stable hash of the label, not by rank, so the same category
// keeps the same color from one month's chart to the next.
const CATEGORICAL_COLORS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948',
]
const OTHER_COLOR = '#9ca3af'

function colorForLabel(label: string): string {
  if (label === 'Other') return OTHER_COLOR
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return CATEGORICAL_COLORS[hash % CATEGORICAL_COLORS.length]
}

interface Row {
  id: string | null // null = the folded "Other" bucket — not individually filterable
  label: string
  total: number
}

/** Beyond 7 explicit bars, the rest fold into "Other" — matches the palette's
 * safe slot count and keeps the chart from growing a bar per tiny category. */
function foldToTopSeven(rows: Row[]): Row[] {
  if (rows.length <= 7) return rows
  const top = rows.slice(0, 7)
  const otherTotal = rows.slice(7).reduce((sum, r) => sum + r.total, 0)
  return [...top, { id: null, label: 'Other', total: otherTotal }]
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

/** Every ranked chart (category, account) drives the same click-through: tap
 * a bar, see exactly the transactions behind it, right there — no separate
 * page, no re-deriving the filter yourself. */
function RankedBarChart({ rows, onSelect }: { rows: Row[]; onSelect: (row: Row) => void }) {
  const folded = foldToTopSeven(rows)
  const height = Math.max(120, folded.length * 34)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={folded} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={100}
          tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as Row
            return (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
                <p className="font-medium">{row.label}</p>
                <p className="tabular-nums font-semibold">₹{row.total.toLocaleString('en-IN')}</p>
                {row.id !== null && <p className="text-[var(--ink-soft)]">Tap to see transactions</p>}
              </div>
            )
          }}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {folded.map((row) => (
            <Cell
              key={row.label}
              fill={colorForLabel(row.label)}
              cursor={row.id !== null ? 'pointer' : 'default'}
              onClick={() => row.id !== null && onSelect(row)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

type Drilldown = { label: string; params: Record<string, string> }

/** The table every chart bar opens into — same rows a click on "Groceries" or
 * "Sep 28" or "Expense" resolves to, laid out so they're actually scannable
 * (not a bare list) and editable right there, since the #1 reason to open
 * this is to give an Uncategorized row the category it's missing. */
function DrilldownPanel({ drilldown, onClose }: { drilldown: Drilldown; onClose: () => void }) {
  const query = new URLSearchParams({ ...drilldown.params, limit: '500' }).toString()
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['finance', 'transactions', 'drilldown', drilldown.params],
    queryFn: async () => (await api.get<Transaction[]>(`/finance/transactions?${query}`)).data,
  })
  const { data: accounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const { data: categories } = useQuery({
    queryKey: ['finance', 'categories'],
    queryFn: async () => (await api.get<Category[]>('/finance/categories')).data,
  })
  const [editingId, setEditingId] = useState<string | null>(null)

  const accountName = (id: string) => accounts?.find((a) => a.id === id)?.name ?? '—'
  const categoryName = (id: string | null) => (id ? categories?.find((c) => c.id === id)?.name ?? '—' : null)

  return (
    <Card className="mt-4" data-testid="drilldown-panel">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{drilldown.label}</h3>
        <button onClick={onClose} className="text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]" aria-label="Close">
          ✕
        </button>
      </div>
      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && transactions?.length === 0 && (
        <p className="text-sm text-[var(--ink-soft)]">No transactions match.</p>
      )}
      {!isLoading && transactions && transactions.length > 0 && accounts && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--ink-soft)]">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Note</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
                <th className="py-2 pl-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const catName = categoryName(t.category_id)
                return editingId === t.id ? (
                  <tr key={t.id}>
                    <td colSpan={6} className="py-2">
                      <EditTransactionForm
                        transaction={t}
                        accounts={accounts}
                        onDone={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="whitespace-nowrap py-2 pr-3 text-[var(--ink-soft)]">{t.occurred_on}</td>
                    <td className="py-2 pr-3">{t.note || (t.kind === 'expense' ? 'Expense' : 'Income')}</td>
                    <td className="py-2 pr-3">
                      {catName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: colorForLabel(catName) }}
                          />
                          {catName}
                        </span>
                      ) : (
                        <span className="italic text-[var(--ink-soft)]">Uncategorized</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-[var(--ink-soft)]">{accountName(t.account_id)}</td>
                    <td
                      className={`whitespace-nowrap py-2 pr-3 text-right tabular-nums font-semibold ${t.kind === 'expense' ? 'text-[var(--danger)]' : 'text-[var(--accent-ink)]'}`}
                    >
                      {t.kind === 'expense' ? '−' : '+'}₹{Number(t.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 pl-1 text-right">
                      <button
                        onClick={() => setEditingId(t.id)}
                        className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                        aria-label="Edit transaction"
                      >
                        <PencilIcon width={14} height={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/** Finance's own analytics — spend trend, category, and account breakdowns
 * for a month you pick (defaults to the current one), not a fixed rolling
 * window, so this actually answers "how was my September" not just "lately."
 * Every bar is clickable — it opens the exact transactions behind it. */
export function FinanceAnalytics() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null)

  function shiftMonth(delta: number) {
    let newMonth = month + delta
    let newYear = year
    if (newMonth > 12) {
      newMonth = 1
      newYear += 1
    } else if (newMonth < 1) {
      newMonth = 12
      newYear -= 1
    }
    setMonth(newMonth)
    setYear(newYear)
    setDrilldown(null)
  }

  const { start: monthStart, end: monthEnd } = monthRange(year, month)

  const { data: trend, isLoading: loadingTrend } = useQuery({
    queryKey: ['finance', 'analytics', 'spend-trend', year, month],
    queryFn: async () =>
      (await api.get<SpendTrendPoint[]>(`/finance/analytics/spend-trend?year=${year}&month=${month}`)).data,
  })
  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ['finance', 'analytics', 'category-breakdown', year, month],
    queryFn: async () =>
      (
        await api.get<CategoryBreakdownItem[]>(
          `/finance/analytics/category-breakdown?year=${year}&month=${month}`,
        )
      ).data,
  })
  const { data: byAccount, isLoading: loadingAccounts } = useQuery({
    queryKey: ['finance', 'analytics', 'account-breakdown', year, month],
    queryFn: async () =>
      (
        await api.get<AccountBreakdownItem[]>(`/finance/analytics/account-breakdown?year=${year}&month=${month}`)
      ).data,
  })
  const { data: incomeExpense, isLoading: loadingIncomeExpense } = useQuery({
    queryKey: ['finance', 'analytics', 'income-vs-expense', year, month],
    queryFn: async () =>
      (await api.get<IncomeExpense>(`/finance/analytics/income-vs-expense?year=${year}&month=${month}`)).data,
  })

  const hasSpend = trend?.some((p) => Number(p.total) > 0)
  const incomeExpenseRows = incomeExpense
    ? [
        { label: 'Income', kind: 'income' as const, total: Number(incomeExpense.income), fill: INCOME_COLOR },
        { label: 'Expense', kind: 'expense' as const, total: Number(incomeExpense.expense), fill: EXPENSE_COLOR },
      ]
    : []
  const hasIncomeOrExpense = incomeExpenseRows.some((r) => r.total > 0)

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-center gap-2">
        <button
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm hover:bg-[var(--surface-2)]"
        >
          ←
        </button>
        <span className="min-w-32 text-center text-sm font-medium">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm hover:bg-[var(--surface-2)]"
        >
          →
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="chart-daily-spend">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
            Daily spend
          </h2>
          {loadingTrend && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
          {!loadingTrend && !hasSpend && (
            <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No spending logged this month.</p>
          )}
          {!loadingTrend && hasSpend && (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => format(parseISO(d), 'd')}
                  interval={4}
                  tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
                        <p className="text-[var(--ink-soft)]">{format(parseISO(label as string), 'MMM d')}</p>
                        <p className="tabular-nums font-semibold">
                          ₹{(payload[0].value as number).toLocaleString('en-IN')}
                        </p>
                        <p className="text-[var(--ink-soft)]">Tap to see transactions</p>
                      </div>
                    )
                  }}
                />
                <Bar
                  dataKey="total"
                  fill={TREND_COLOR}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={14}
                  cursor="pointer"
                  onClick={(bar) => {
                    const point = bar?.payload as SpendTrendPoint | undefined
                    if (!point || Number(point.total) <= 0) return
                    setDrilldown({
                      label: format(parseISO(point.date), 'EEEE, MMM d'),
                      params: { start: point.date, end: point.date },
                    })
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card data-testid="chart-income-expense">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
            Income vs expense
          </h2>
          {loadingIncomeExpense && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
          {!loadingIncomeExpense && !hasIncomeOrExpense && (
            <p className="py-8 text-center text-sm text-[var(--ink-soft)]">Nothing logged this month.</p>
          )}
          {!loadingIncomeExpense && hasIncomeOrExpense && (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={incomeExpenseRows} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={60}
                  tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload as { label: string; total: number }
                    return (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
                        <p className="font-medium">{row.label}</p>
                        <p className="tabular-nums font-semibold">₹{row.total.toLocaleString('en-IN')}</p>
                        {row.total > 0 && <p className="text-[var(--ink-soft)]">Tap to see transactions</p>}
                      </div>
                    )
                  }}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {incomeExpenseRows.map((row) => (
                    <Cell
                      key={row.label}
                      fill={row.fill}
                      cursor={row.total > 0 ? 'pointer' : 'default'}
                      onClick={() =>
                        row.total > 0 &&
                        setDrilldown({
                          label: `${row.label} — ${MONTH_NAMES[month - 1]} ${year}`,
                          params: { start: monthStart, end: monthEnd, kind: row.kind },
                        })
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card data-testid="chart-by-category">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">By category</h2>
          {loadingCategories && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
          {!loadingCategories && categories?.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No spending logged this month.</p>
          )}
          {!loadingCategories && categories && categories.length > 0 && (
            <RankedBarChart
              rows={categories.map((c) => ({
                id: c.category_id ?? 'uncategorized',
                label: c.category_name,
                total: Number(c.total),
              }))}
              onSelect={(row) =>
                setDrilldown({
                  label: `${row.label} — ${MONTH_NAMES[month - 1]} ${year}`,
                  params:
                    row.id === 'uncategorized'
                      ? { start: monthStart, end: monthEnd, uncategorized: 'true' }
                      : { start: monthStart, end: monthEnd, category_id: row.id! },
                })
              }
            />
          )}
        </Card>

        <Card className="md:col-span-2" data-testid="chart-by-account">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">By account</h2>
          {loadingAccounts && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
          {!loadingAccounts && byAccount?.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No spending logged this month.</p>
          )}
          {!loadingAccounts && byAccount && byAccount.length > 0 && (
            <RankedBarChart
              rows={byAccount.map((a) => ({ id: a.account_id, label: a.account_name, total: Number(a.total) }))}
              onSelect={(row) =>
                setDrilldown({
                  label: `${row.label} — ${MONTH_NAMES[month - 1]} ${year}`,
                  params: { start: monthStart, end: monthEnd, account_id: row.id! },
                })
              }
            />
          )}
        </Card>
      </div>

      {drilldown && <DrilldownPanel drilldown={drilldown} onClose={() => setDrilldown(null)} />}
    </div>
  )
}
