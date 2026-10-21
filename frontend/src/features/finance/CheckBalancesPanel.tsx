import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { api } from '../../lib/api'
import type { Account, CreditCard, Emi } from '../../types/api'
import { checkedLabel } from './balanceCheck'

function rupees(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

type Row = { actual: string; mode: 'owed' | 'available'; limit: string }

const inputClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]'

export function CheckBalancesPanel({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const { data: accounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const { data: cards } = useQuery({
    queryKey: ['finance', 'credit-cards'],
    queryFn: async () => (await api.get<CreditCard[]>('/finance/credit-cards')).data,
  })
  const { data: emis } = useQuery({
    queryKey: ['finance', 'emis'],
    queryFn: async () => (await api.get<Emi[]>('/finance/emis')).data,
  })
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [result, setResult] = useState<{ adjusted: number; checked: number } | null>(null)

  const plainAccounts = (accounts ?? []).filter((a) => a.account_type !== 'credit_card')
  const cardList = cards ?? []

  function row(id: string, limit: string | null = null): Row {
    return rows[id] ?? { actual: '', mode: 'owed', limit: limit === null ? '' : String(Number(limit)) }
  }
  function update(id: string, patch: Partial<Row>, limit: string | null = null) {
    setRows((prev) => ({ ...prev, [id]: { ...row(id, limit), ...patch } }))
  }

  // A bank's available limit also holds back every EMI installment still to
  // come, which Daybook keeps on the EMI rather than in the card's balance.
  function emiBlocked(card: CreditCard) {
    return (emis ?? [])
      .filter((e) => e.account_id === card.account_id && !e.is_completed)
      .reduce((sum, e) => sum + (e.total_installments - e.installments_paid) * Number(e.monthly_amount), 0)
  }

  // What each entered row means as "owed / balance right now", or null if left blank.
  function cardOwed(card: CreditCard): number | null {
    const r = row(card.account_id, card.credit_limit)
    if (r.actual === '') return null
    return r.mode === 'available'
      ? Number(r.limit || 0) - Number(r.actual) - emiBlocked(card)
      : Number(r.actual)
  }
  function limitChanged(card: CreditCard) {
    const r = row(card.account_id, card.credit_limit)
    return r.limit !== '' && Number(r.limit) !== Number(card.credit_limit ?? NaN)
  }

  const entries = [
    ...plainAccounts
      .filter((a) => row(a.id).actual !== '')
      .map((a) => ({ account_id: a.id, actual: row(a.id).actual })),
    ...cardList
      .filter((c) => cardOwed(c) !== null || limitChanged(c))
      .map((c) => ({
        account_id: c.account_id,
        actual: String(cardOwed(c) ?? Number(c.outstanding_balance)),
        credit_limit: limitChanged(c) ? row(c.account_id, c.credit_limit).limit : null,
      })),
  ]

  const save = useMutation({
    mutationFn: async () =>
      (await api.post<{ adjusted: number }>('/finance/accounts/check-balances', { entries })).data,
    onSuccess: (data) => {
      setResult({ adjusted: data.adjusted, checked: entries.length })
      setRows({})
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })

  return (
    <Card className="mb-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Check balances</p>
          <p className="text-xs text-[var(--ink-soft)]">
            Open your bank and card apps and type what they show today. Anything you missed logging becomes one
            "Balance check" entry per account, and from here on Daybook tracks from these numbers. Leave a box empty to
            skip that account.
          </p>
        </div>
        <button onClick={onDone} className="text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]">
          Close
        </button>
      </div>

      {result && (
        <p className="mb-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs font-medium">
          Done — {result.checked} checked
          {result.adjusted > 0 ? `, ${result.adjusted} corrected` : ', all already matched'}.
        </p>
      )}

      {plainAccounts.length > 0 && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Bank & cash</p>
      )}
      <div className="flex flex-col gap-2">
        {plainAccounts.map((a) => {
          const current = Number(a.current_balance)
          const r = row(a.id)
          const diff = r.actual === '' ? 0 : Number(r.actual) - current
          return (
            <div key={a.id} className="rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{a.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">
                  Daybook {rupees(current)} · {checkedLabel(a.last_checked_on)}
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={`${a.name} real balance`}
                  placeholder="Real balance"
                  value={r.actual}
                  onChange={(e) => update(a.id, { actual: e.target.value })}
                  className={inputClass}
                />
                <SameButton onClick={() => update(a.id, { actual: String(current) })} />
              </div>
              <DiffNote diff={diff} up="more money than logged — added as income" down="spent but not logged" />
            </div>
          )
        })}
      </div>

      {cardList.length > 0 && (
        <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Credit cards</p>
      )}
      <div className="flex flex-col gap-2">
        {cardList.map((c) => {
          const current = Number(c.outstanding_balance)
          const r = row(c.account_id, c.credit_limit)
          const owed = cardOwed(c)
          const diff = owed === null ? 0 : owed - current
          return (
            <div key={c.id} className="rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">
                  Daybook owes {rupees(current)} · {checkedLabel(c.last_checked_on)}
                </p>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface-2)] p-1 text-xs font-medium">
                {(
                  [
                    ['owed', 'Total owed'],
                    ['available', 'Available limit'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => update(c.account_id, { mode }, c.credit_limit)}
                    className={`rounded-md px-2 py-1.5 ${
                      r.mode === mode ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-soft)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={`${c.name} ${r.mode === 'owed' ? 'total owed' : 'available limit'}`}
                  placeholder={r.mode === 'owed' ? 'Total owed (outstanding)' : 'Available limit'}
                  value={r.actual}
                  onChange={(e) => update(c.account_id, { actual: e.target.value }, c.credit_limit)}
                  className={inputClass}
                />
                {r.mode === 'owed' && (
                  <SameButton onClick={() => update(c.account_id, { actual: String(current) }, c.credit_limit)} />
                )}
              </div>
              <label className="mt-2 block text-xs font-medium text-[var(--ink-soft)]">
                Credit limit
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={`${c.name} credit limit`}
                  placeholder="Credit limit"
                  value={r.limit}
                  onChange={(e) => update(c.account_id, { limit: e.target.value }, c.credit_limit)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              {r.mode === 'available' && owed !== null && (
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  {r.limit ? `So you owe ${rupees(owed)}.` : 'Enter the credit limit to work out what you owe.'}
                </p>
              )}
              {r.mode === 'available' && emiBlocked(c) > 0 && (
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  Leaves out {rupees(emiBlocked(c))} of EMIs still to come, which your bank also blocks. That's an
                  estimate — "Total owed" from your statement is exact.
                </p>
              )}
              <DiffNote diff={diff} up="charges not logged (spends, interest, fees)" down="payments or refunds not logged" />
            </div>
          )
        })}
      </div>

      {plainAccounts.length === 0 && cardList.length === 0 && (
        <p className="text-sm text-[var(--ink-soft)]">Add an account or card first.</p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => save.mutate()}
          disabled={entries.length === 0 || save.isPending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {entries.length > 0 ? `Save ${entries.length} ${entries.length === 1 ? 'account' : 'accounts'}` : 'Save'}
        </button>
        {save.isError && <p className="text-xs text-[var(--danger)]">Couldn't save — please check the numbers.</p>}
      </div>
    </Card>
  )
}

function SameButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-none rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-2)]"
      title="The real app shows the same — just mark it checked"
    >
      ✓ Same
    </button>
  )
}

function DiffNote({ diff, up, down }: { diff: number; up: string; down: string }) {
  if (diff === 0) return null
  return (
    <p className="mt-1 text-xs text-[var(--ink-soft)]">
      {diff > 0 ? '+' : '−'}
      {rupees(Math.abs(diff))} — {diff > 0 ? up : down}
    </p>
  )
}
