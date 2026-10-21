import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { useState } from 'react'
import { api } from '../../lib/api'
import type { Account } from '../../types/api'
import { AccountsTab } from './AccountsTab'
import { CHECK_EVERY_DAYS, checkedLabel } from './balanceCheck'
import { CheckBalancesPanel } from './CheckBalancesPanel'
import { CreditCardsTab } from './CreditCardsTab'
import { EmisTab } from './EmisTab'
import { LendingTab } from './LendingTab'
import { OverviewTab } from './OverviewTab'
import { SipsTab } from './SipsTab'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'cards', label: 'Credit Cards' },
  { key: 'emis', label: 'EMIs' },
  { key: 'sips', label: 'SIPs' },
  { key: 'lending', label: 'Lending' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function FinancePage() {
  const [tab, setTab] = useState<TabKey>('overview')
  const [checking, setChecking] = useState(false)
  const { data: accounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })

  // The account checked longest ago (never-checked first) decides the nudge.
  const stalest = (accounts ?? []).reduce<Account | null>((worst, a) => {
    if (!worst) return a
    if (!a.last_checked_on) return worst.last_checked_on ? a : worst
    if (!worst.last_checked_on) return worst
    return a.last_checked_on < worst.last_checked_on ? a : worst
  }, null)
  const needsCheck =
    !!stalest &&
    (!stalest.last_checked_on ||
      differenceInCalendarDays(new Date(), parseISO(stalest.last_checked_on)) >= CHECK_EVERY_DAYS)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl">Finance</h1>
        <button
          onClick={() => setChecking((v) => !v)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
        >
          Check balances
        </button>
      </div>

      {needsCheck && !checking && stalest && (
        <button
          onClick={() => setChecking(true)}
          className="mb-4 w-full rounded-lg bg-[var(--surface-2)] px-3 py-2 text-left text-xs text-[var(--ink-soft)]"
        >
          {stalest.last_checked_on
            ? `Balances last ${checkedLabel(stalest.last_checked_on)}`
            : 'Some balances have never been checked'}{' '}
          — tap to match them with your bank and card apps.
        </button>
      )}

      {checking && <CheckBalancesPanel onDone={() => setChecking(false)} />}

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-none whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-[var(--accent)] text-[var(--accent-ink)]'
                : 'border-transparent text-[var(--ink-soft)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'accounts' && <AccountsTab onOpenCreditCards={() => setTab('cards')} />}
      {tab === 'cards' && <CreditCardsTab />}
      {tab === 'emis' && <EmisTab />}
      {tab === 'sips' && <SipsTab />}
      {tab === 'lending' && <LendingTab />}
    </div>
  )
}
