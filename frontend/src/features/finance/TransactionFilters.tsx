import { useState } from 'react'
import { Card } from '../../components/Card'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { Account, Category } from '../../types/api'
import { activeFilterCount, EMPTY_FILTERS, PRESETS, UNCATEGORIZED, type TxnFilters } from './txnFilters'

const chip = (on: boolean) =>
  `whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${
    on
      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
      : 'border-[var(--border)] text-[var(--ink-soft)]'
  }`

const fieldClass =
  'rounded-lg border border-[var(--border)] bg-[var(--paper)] px-2 py-2 text-sm outline-none focus:border-[var(--accent)]'

export function TransactionFilters({
  value,
  onChange,
  accounts,
  categories,
}: {
  value: TxnFilters
  onChange: (next: TxnFilters) => void
  accounts: Account[]
  categories: Category[]
}) {
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<TxnFilters>) => onChange({ ...value, ...patch })
  const count = activeFilterCount(value)

  const categoryOptions = [
    { value: '', label: 'All categories' },
    { value: UNCATEGORIZED, label: 'Uncategorized' },
    ...categories
      .filter((c) => !value.kind || c.kind === value.kind)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ value: c.id, label: c.name, hint: value.kind ? undefined : c.kind })),
  ]
  const categoryName =
    value.categoryId === UNCATEGORIZED
      ? 'Uncategorized'
      : categories.find((c) => c.id === value.categoryId)?.name
  const accountName = accounts.find((a) => a.id === value.accountId)?.name
  const presetLabel =
    value.preset === 'custom'
      ? [value.start, value.end].filter(Boolean).join(' → ') || null
      : value.preset !== 'all'
        ? PRESETS.find((p) => p.value === value.preset)?.label
        : null

  // Summary chips for when the panel is folded away, so it's always obvious
  // why the list is shorter than expected — each one clears just itself.
  const activeChips = [
    presetLabel && { label: presetLabel, clear: () => set({ preset: 'all', start: '', end: '' }) },
    value.kind && { label: value.kind === 'expense' ? 'Expenses' : 'Income', clear: () => set({ kind: '' }) },
    categoryName && { label: categoryName, clear: () => set({ categoryId: '' }) },
    accountName && { label: accountName, clear: () => set({ accountId: '' }) },
  ].filter(Boolean) as { label: string; clear: () => void }[]

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-soft)]"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            aria-label="Search transactions"
            placeholder="Note, category or amount"
            value={value.search}
            onChange={(e) => set({ search: e.target.value })}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-8 pr-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
            open || count
              ? 'border-[var(--accent)] text-[var(--accent-ink)]'
              : 'border-[var(--border)] text-[var(--ink-soft)]'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          Filters
          {count > 0 && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold leading-4 text-white">
              {count}
            </span>
          )}
        </button>
      </div>

      {!open && activeChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeChips.map((c) => (
            <button key={c.label} type="button" onClick={c.clear} className={chip(true)} aria-label={`Remove filter ${c.label}`}>
              {c.label} ×
            </button>
          ))}
        </div>
      )}

      {open && (
        <Card className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--ink-soft)]">Date</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => set({ preset: p.value })}
                  className={chip(value.preset === p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {value.preset === 'custom' && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  aria-label="From date"
                  value={value.start}
                  max={value.end || undefined}
                  onChange={(e) => set({ start: e.target.value })}
                  className={`${fieldClass} min-w-0 flex-1`}
                />
                <span className="text-xs text-[var(--ink-soft)]">to</span>
                <input
                  type="date"
                  aria-label="To date"
                  value={value.end}
                  min={value.start || undefined}
                  onChange={(e) => set({ end: e.target.value })}
                  className={`${fieldClass} min-w-0 flex-1`}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--ink-soft)]">Type</p>
              <div className="flex rounded-lg border border-[var(--border)] p-0.5">
                {(['', 'expense', 'income'] as const).map((k) => (
                  <button
                    key={k || 'all'}
                    type="button"
                    onClick={() => {
                      // Drop a category that can't match the new type rather
                      // than leave the list silently empty.
                      const cat = categories.find((c) => c.id === value.categoryId)
                      set({ kind: k, ...(k && cat && cat.kind !== k ? { categoryId: '' } : {}) })
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      value.kind === k ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-soft)]'
                    }`}
                  >
                    {k === '' ? 'All' : k === 'expense' ? 'Expense' : 'Income'}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-40 flex-1">
              <p className="mb-1.5 text-xs font-medium text-[var(--ink-soft)]">Category</p>
              <SearchableSelect
                ariaLabel="Filter by category"
                value={value.categoryId}
                onChange={(v) => set({ categoryId: v })}
                options={categoryOptions}
                placeholder="All categories"
                searchPlaceholder="Search categories…"
              />
            </div>
            {accounts.length > 1 && (
              <div className="min-w-32 flex-1">
                <p className="mb-1.5 text-xs font-medium text-[var(--ink-soft)]">Account</p>
                <select
                  aria-label="Filter by account"
                  value={value.accountId}
                  onChange={(e) => set({ accountId: e.target.value })}
                  className={`${fieldClass} w-full`}
                >
                  <option value="">All accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => onChange({ ...EMPTY_FILTERS, search: value.search })}
              disabled={count === 0}
              className="text-xs font-medium text-[var(--ink-soft)] disabled:opacity-40"
            >
              Clear filters
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-[var(--accent-ink)]">
              Done
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
