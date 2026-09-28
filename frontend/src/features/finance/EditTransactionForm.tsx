import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { api } from '../../lib/api'
import type { Account, Transaction } from '../../types/api'
import { CategoryPicker } from './CategoryPicker'

/** Full edit for one transaction — account, kind, category, amount, date,
 * note — shared by the Recent list and any chart drill-down table, so
 * fixing a transaction (or finally giving an Uncategorized one a category)
 * works the same way everywhere it shows up. */
export function EditTransactionForm({
  transaction,
  accounts,
  onDone,
}: {
  transaction: Transaction
  accounts: Account[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [accountId, setAccountId] = useState(transaction.account_id)
  const [amount, setAmount] = useState(transaction.amount)
  const [note, setNote] = useState(transaction.note ?? '')
  const [kind, setKind] = useState<'expense' | 'income'>(transaction.kind)
  const [categoryId, setCategoryId] = useState<string | null>(transaction.category_id)
  const [occurredOn, setOccurredOn] = useState(transaction.occurred_on)
  const [categoryBusy, setCategoryBusy] = useState(false)

  const update = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/finance/transactions/${transaction.id}`, {
          account_id: accountId,
          kind,
          amount,
          note: note || null,
          category_id: categoryId,
          occurred_on: occurredOn,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
      onDone()
    },
  })

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex rounded-lg border border-[var(--border)] p-0.5">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                kind === k ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-soft)]'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <CategoryPicker kind={kind} value={categoryId} onChange={setCategoryId} onBusyChange={setCategoryBusy} />
        <select
          aria-label="Account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-2 py-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="decimal"
          data-testid="edit-txn-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <input
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <input
          placeholder="Note (optional)"
          data-testid="edit-txn-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-w-32 flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={() => update.mutate()}
          disabled={!amount || update.isPending || categoryBusy}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Save
        </button>
        <button onClick={onDone} className="rounded-lg px-3 py-2 text-sm text-[var(--ink-soft)]">
          Cancel
        </button>
      </div>
      {update.isError && (
        <p className="mt-2 text-xs text-[var(--danger)]">Couldn't save those changes — please try again.</p>
      )}
    </Card>
  )
}
