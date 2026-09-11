import { useQuery } from '@tanstack/react-query'
import { StatCard } from '../../components/Card'
import { api } from '../../lib/api'
import type { FinanceSummary } from '../../types/api'

// Rounded to whole rupees for headline tiles — paise-level precision is still
// exact in the underlying data (and shown where it matters, e.g. transactions),
// but "₹1,03,746.4" (a dropped trailing zero from toLocaleString, not a typo)
// reads as broken at a glance, and full-precision figures are simply too long
// to sit comfortably in a stat tile at any column count.
const inr = (v: string | number) => `₹${Math.round(Number(v)).toLocaleString('en-IN')}`

export function FinanceSummaryPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'analytics', 'summary'],
    queryFn: async () => (await api.get<FinanceSummary>('/finance/analytics/summary')).data,
  })

  if (isLoading || !data) {
    return (
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--surface-2)]" />
        ))}
      </div>
    )
  }

  const netWorth = Number(data.net_worth)
  const lentOut = Number(data.outstanding_lent)
  const owed = Number(data.outstanding_borrowed)
  const spentAll = Number(data.spent_this_month)
  const spentExclLending = Number(data.spent_this_month_excluding_lending)

  return (
    // Capped at 3 columns, not 4 — Indian-format rupee figures (lakhs, crores)
    // run longer than a typical 4-column tile can hold without wrapping badly.
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard label="Total balance" value={inr(data.total_balance)} sub="Cash + bank" />
      <StatCard label="Credit card debt" value={inr(data.total_credit_card_debt)} />
      <StatCard
        label="Net worth"
        value={`${netWorth < 0 ? '−' : ''}${inr(Math.abs(netWorth))}`}
        sub="Balance − debt"
      />

      <StatCard label="Spent this month" value={inr(spentAll)} />
      {spentExclLending !== spentAll && (
        <StatCard
          label="Spent, excl. lending"
          value={inr(spentExclLending)}
          sub="What you spent, not what you lent out"
        />
      )}
      {data.top_spend_account && (
        <StatCard
          label="Most spent from"
          value={data.top_spend_account.account_name}
          sub={`${inr(data.top_spend_account.total)}, last 30 days`}
        />
      )}

      {lentOut > 0 && <StatCard label="Lent out, unpaid" value={inr(lentOut)} sub="Owed to you" />}
      {owed > 0 && <StatCard label="Borrowed, unpaid" value={inr(owed)} sub="You owe this" />}
      {Number(data.income_this_month) > 0 && (
        <StatCard label="Income this month" value={inr(data.income_this_month)} />
      )}
    </div>
  )
}
