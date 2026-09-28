import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '../../components/Card'
import { api } from '../../lib/api'
import type { AccountBreakdownItem, CategoryBreakdownItem, SpendTrendPoint } from '../../types/api'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// A fixed teal, not the --accent token — Recharts writes this straight into an
// SVG fill attribute, and custom-property resolution there is inconsistent
// enough across engines that a literal is the safer bet for a data color.
const TREND_COLOR = '#3f8f88'

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

/** Beyond 7 explicit bars, the rest fold into "Other" — matches the palette's
 * safe slot count and keeps the chart from growing a bar per tiny category. */
function foldToTopSeven(rows: { label: string; total: number }[]): { label: string; total: number }[] {
  if (rows.length <= 7) return rows
  const top = rows.slice(0, 7)
  const otherTotal = rows.slice(7).reduce((sum, r) => sum + r.total, 0)
  return [...top, { label: 'Other', total: otherTotal }]
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
      <p className="text-[var(--ink-soft)]">{label ? format(parseISO(label), 'MMM d') : ''}</p>
      <p className="tabular-nums font-semibold">₹{payload[0].value.toLocaleString('en-IN')}</p>
    </div>
  )
}

function RankedBarChart({ rows }: { rows: { label: string; total: number }[] }) {
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
            const row = payload[0].payload as { label: string; total: number }
            return (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
                <p className="font-medium">{row.label}</p>
                <p className="tabular-nums font-semibold">₹{row.total.toLocaleString('en-IN')}</p>
              </div>
            )
          }}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {folded.map((row) => (
            <Cell key={row.label} fill={colorForLabel(row.label)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Finance's own analytics — spend trend, category, and account breakdowns
 * for a month you pick (defaults to the current one), not a fixed rolling
 * window, so this actually answers "how was my September" not just "lately." */
export function FinanceAnalytics() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

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
  }

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

  const hasSpend = trend?.some((p) => Number(p.total) > 0)

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
        <Card>
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
                <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="total" fill={TREND_COLOR} radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">By category</h2>
          {loadingCategories && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
          {!loadingCategories && categories?.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No spending logged this month.</p>
          )}
          {!loadingCategories && categories && categories.length > 0 && (
            <RankedBarChart rows={categories.map((c) => ({ label: c.category_name, total: Number(c.total) }))} />
          )}
        </Card>

        <Card className="md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">By account</h2>
          {loadingAccounts && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
          {!loadingAccounts && byAccount?.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No spending logged this month.</p>
          )}
          {!loadingAccounts && byAccount && byAccount.length > 0 && (
            <RankedBarChart rows={byAccount.map((a) => ({ label: a.account_name, total: Number(a.total) }))} />
          )}
        </Card>
      </div>
    </div>
  )
}
