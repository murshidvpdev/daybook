import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '../../components/Card'
import { api } from '../../lib/api'
import type { MonthlyCashflow } from '../../types/api'

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Same literals as FinanceAnalytics' income/expense chart, so "income" and
// "spent" read as the same two series everywhere on the page.
const INCOME_COLOR = '#1f5f5b'
const SPENT_COLOR = '#a33d2c'

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-[var(--accent-ink)]' : tone === 'bad' ? 'text-[var(--danger)]' : ''
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-[var(--surface-2)] p-3">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]">{label}</span>
      <span className={`tabular-nums text-lg font-semibold break-words ${color}`}>{value}</span>
      {sub && <span className="text-xs text-[var(--ink-soft)] break-words">{sub}</span>}
    </div>
  )
}

/** What you earned vs what you spent vs what you kept, for the picked month,
 * plus the six months up to it side by side. Lending money (borrowed, lent,
 * repaid) is pulled out into its own tile so it never pads income or spend. */
export function MonthlyCashflowCard({
  year,
  month,
  onSelectMonth,
}: {
  year: number
  month: number
  onSelectMonth: (year: number, month: number) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'analytics', 'monthly-cashflow', year, month],
    queryFn: async () =>
      (await api.get<MonthlyCashflow[]>(`/finance/analytics/monthly-cashflow?year=${year}&month=${month}&months=6`))
        .data,
  })

  const rows = (data ?? []).map((m) => ({
    year: m.year,
    month: m.month,
    label: SHORT_MONTHS[m.month - 1],
    income: Number(m.income),
    spent: Number(m.spent),
    saved: Number(m.saved),
  }))
  const current = data?.[data.length - 1]
  const income = Number(current?.income ?? 0)
  const spent = Number(current?.spent ?? 0)
  const saved = Number(current?.saved ?? 0)
  const lendingIn = Number(current?.lending_in ?? 0)
  const lendingOut = Number(current?.lending_out ?? 0)
  const hasHistory = rows.some((r) => r.income > 0 || r.spent > 0)

  return (
    <Card className="mb-4" data-testid="monthly-cashflow">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Monthly summary</h2>
      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && current && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Income" value={rupees(income)} sub="Salary & earnings" tone="good" />
            <Stat label="Spent" value={rupees(spent)} sub="Excludes money lent" tone="bad" />
            <Stat
              label={saved >= 0 ? 'Saved' : 'Overspent'}
              value={rupees(Math.abs(saved))}
              sub={
                current.savings_rate !== null
                  ? `${current.savings_rate}% of income`
                  : income === 0 && spent > 0
                    ? 'No income logged'
                    : undefined
              }
              tone={saved >= 0 ? 'good' : 'bad'}
            />
            <Stat
              label="Lending money"
              value={`+${rupees(lendingIn)}`}
              sub={`${lendingOut > 0 ? `−${rupees(lendingOut)} out · ` : ''}Not counted as income`}
            />
          </div>

          <h3 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]">
            Income vs spent — last 6 months
          </h3>
          {!hasHistory && (
            <p className="py-6 text-center text-sm text-[var(--ink-soft)]">Nothing logged in these months.</p>
          )}
          {hasHistory && (
            <>
              <div className="mb-2 flex gap-4 text-xs text-[var(--ink-soft)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />
                  Income
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SPENT_COLOR }} />
                  Spent
                </span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barGap={2}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0].payload as (typeof rows)[number]
                      return (
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
                          <p className="mb-1 font-medium">
                            {row.label} {row.year}
                          </p>
                          <p className="tabular-nums">Income {rupees(row.income)}</p>
                          <p className="tabular-nums">Spent {rupees(row.spent)}</p>
                          <p
                            className={`tabular-nums font-semibold ${row.saved >= 0 ? 'text-[var(--accent-ink)]' : 'text-[var(--danger)]'}`}
                          >
                            {row.saved >= 0 ? 'Saved' : 'Overspent'} {rupees(Math.abs(row.saved))}
                          </p>
                          <p className="text-[var(--ink-soft)]">Tap to view this month</p>
                        </div>
                      )
                    }}
                  />
                  {(['income', 'spent'] as const).map((key) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      fill={key === 'income' ? INCOME_COLOR : SPENT_COLOR}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={22}
                      cursor="pointer"
                      onClick={(bar) => {
                        const row = bar?.payload as (typeof rows)[number] | undefined
                        if (row) onSelectMonth(row.year, row.month)
                      }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </>
      )}
    </Card>
  )
}
