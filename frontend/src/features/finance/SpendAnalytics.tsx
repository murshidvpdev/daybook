import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Card } from '../../components/Card'
import { api } from '../../lib/api'
import type { AccountBreakdownItem, CategoryBreakdownItem, SpendTrendPoint } from '../../types/api'

// A fixed teal, not the --accent token — Recharts writes this straight into an
// SVG fill attribute, and custom-property resolution there is inconsistent
// enough across engines that a literal is the safer bet for a data color.
const BAR_COLOR = '#3f8f88'

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
      <p className="text-[var(--ink-soft)]">{label ? format(parseISO(label), 'MMM d') : ''}</p>
      <p className="tabular-nums font-semibold">₹{payload[0].value.toLocaleString('en-IN')}</p>
    </div>
  )
}

function RankedBreakdown({ rows }: { rows: { label: string; total: number }[] }) {
  const max = rows.length ? Math.max(...rows.map((r) => r.total)) : 0
  return (
    <div className="flex flex-col gap-2.5">
      {rows.slice(0, 6).map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-medium">{row.label}</span>
            <span className="tabular-nums text-[var(--ink-soft)]">₹{row.total.toLocaleString('en-IN')}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${max ? (row.total / max) * 100 : 0}%`, backgroundColor: BAR_COLOR }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SpendAnalytics() {
  const { data: trend, isLoading: loadingTrend } = useQuery({
    queryKey: ['finance', 'analytics', 'spend-trend'],
    queryFn: async () => (await api.get<SpendTrendPoint[]>('/finance/analytics/spend-trend?days=30')).data,
  })
  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ['finance', 'analytics', 'category-breakdown'],
    queryFn: async () => (await api.get<CategoryBreakdownItem[]>('/finance/analytics/category-breakdown?days=30')).data,
  })
  const { data: byAccount, isLoading: loadingAccounts } = useQuery({
    queryKey: ['finance', 'analytics', 'account-breakdown'],
    queryFn: async () => (await api.get<AccountBreakdownItem[]>('/finance/analytics/account-breakdown?days=30')).data,
  })

  const hasSpend = trend?.some((p) => Number(p.total) > 0)

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
          Spend, last 30 days
        </h2>
        {loadingTrend && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
        {!loadingTrend && !hasSpend && (
          <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No spending logged yet.</p>
        )}
        {!loadingTrend && hasSpend && (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => format(parseISO(d), 'd MMM')}
                interval={6}
                tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="total" fill={BAR_COLOR} radius={[3, 3, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
          By category, last 30 days
        </h2>
        {loadingCategories && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
        {!loadingCategories && categories?.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No spending logged yet.</p>
        )}
        {!loadingCategories && categories && categories.length > 0 && (
          <RankedBreakdown rows={categories.map((c) => ({ label: c.category_name, total: Number(c.total) }))} />
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
          By account, last 30 days
        </h2>
        {loadingAccounts && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
        {!loadingAccounts && byAccount?.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No spending logged yet.</p>
        )}
        {!loadingAccounts && byAccount && byAccount.length > 0 && (
          <RankedBreakdown rows={byAccount.map((a) => ({ label: a.account_name, total: Number(a.total) }))} />
        )}
      </Card>
    </div>
  )
}
