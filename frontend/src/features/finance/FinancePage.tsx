import { useState } from 'react'
import { CreditCardsTab } from './CreditCardsTab'
import { EmisTab } from './EmisTab'
import { LendingTab } from './LendingTab'
import { OverviewTab } from './OverviewTab'
import { SipsTab } from './SipsTab'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'cards', label: 'Credit Cards' },
  { key: 'emis', label: 'EMIs' },
  { key: 'sips', label: 'SIPs' },
  { key: 'lending', label: 'Lending' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function FinancePage() {
  const [tab, setTab] = useState<TabKey>('overview')

  return (
    <div>
      <h1 className="mb-4 text-2xl">Finance</h1>

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

      {tab === 'overview' && <OverviewTab onOpenCreditCards={() => setTab('cards')} />}
      {tab === 'cards' && <CreditCardsTab />}
      {tab === 'emis' && <EmisTab />}
      {tab === 'sips' && <SipsTab />}
      {tab === 'lending' && <LendingTab />}
    </div>
  )
}
