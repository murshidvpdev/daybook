import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { PencilIcon, TrashIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import { getLastCategory, setLastCategory } from '../../lib/lastCategory'
import type { Account, Category, Transaction } from '../../types/api'
import { CategoryPicker } from './CategoryPicker'
import { EditTransactionForm } from './EditTransactionForm'
import { FinanceAnalytics } from './FinanceAnalytics'
import { FinanceSummaryPanel } from './FinanceSummaryPanel'
import { useSyncFinanceBalances } from './useSyncFinanceBalances'

export function OverviewTab() {
  const queryClient = useQueryClient()
  const { data: accounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const transactionsQuery = useQuery({
    queryKey: ['finance', 'transactions'],
    queryFn: async () => (await api.get<Transaction[]>('/finance/transactions')).data,
  })
  const { data: transactions, isLoading: loadingTxns } = transactionsQuery
  // Fetching transactions can silently post a backdated SIP transaction as a
  // side effect of the GET itself — keep the accounts/summary totals honest
  // whenever that happens instead of waiting for an unrelated mutation.
  useSyncFinanceBalances(transactionsQuery.dataUpdatedAt)
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null)
  const [showCategories, setShowCategories] = useState(false)

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => api.delete(`/finance/transactions/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['finance', 'transactions'] })
      const prev = queryClient.getQueryData<Transaction[]>(['finance', 'transactions'])
      queryClient.setQueryData<Transaction[]>(['finance', 'transactions'], (old) =>
        old?.filter((t) => t.id !== id),
      )
      return { prev }
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData(['finance', 'transactions'], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })

  const allAccounts = accounts ?? []

  return (
    <div>
      <FinanceSummaryPanel />

      {/* Quick-add up top, since logging a transaction is the thing you'll do
          most often here — everything else on this tab is review/analysis. */}
      {allAccounts.length > 0 ? (
        <NewTransactionForm accounts={allAccounts} />
      ) : (
        <Card className="text-center text-sm text-[var(--ink-soft)]">
          Add an account on the Accounts tab first, then come back here to start logging.
        </Card>
      )}

      {allAccounts.length > 0 && (
        <>
          {/* Charts first — they're the "how am I doing" read; the raw list
              below is for finding/editing one specific transaction. */}
          <FinanceAnalytics />

          <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Recent</h2>
          {loadingTxns && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
          {!loadingTxns && transactions?.length === 0 && (
            <Card className="text-center text-sm text-[var(--ink-soft)]">No transactions yet.</Card>
          )}
          <div className="flex flex-col gap-2">
            {transactions?.map((t) => {
              // A just-added transaction renders under a temp "optimistic-*"
              // id until the real one arrives via invalidation — at which
              // point its row remounts under the real id (different React
              // key). Editing/deleting before that swap would PATCH/DELETE
              // an id that doesn't exist server-side, and — worse — could
              // unmount an edit form mid-keystroke the instant the real data
              // lands. Both go away by simply not offering those actions yet.
              const isSaving = t.id.startsWith('optimistic-')
              return editingTxnId === t.id ? (
                <EditTransactionForm
                  key={t.id}
                  transaction={t}
                  accounts={allAccounts}
                  onDone={() => setEditingTxnId(null)}
                />
              ) : (
                <Card key={t.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{t.note || (t.kind === 'expense' ? 'Expense' : 'Income')}</p>
                    <p className="text-xs text-[var(--ink-soft)]">{isSaving ? 'Saving…' : t.occurred_on}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`tabular-nums text-sm font-semibold ${t.kind === 'expense' ? 'text-[var(--danger)]' : 'text-[var(--accent-ink)]'}`}
                    >
                      {t.kind === 'expense' ? '−' : '+'}₹{Number(t.amount).toFixed(0)}
                    </span>
                    <button
                      onClick={() => setEditingTxnId(t.id)}
                      disabled={isSaving}
                      className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)] disabled:opacity-30"
                      aria-label="Edit transaction"
                    >
                      <PencilIcon width={15} height={15} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this transaction?')) deleteTransaction.mutate(t.id)
                      }}
                      disabled={isSaving}
                      className="text-[var(--ink-soft)] hover:text-[var(--danger)] disabled:opacity-30"
                      aria-label="Delete transaction"
                    >
                      <TrashIcon width={15} height={15} />
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <div className="mt-6">
        <button
          onClick={() => setShowCategories((v) => !v)}
          className="text-xs font-medium text-[var(--accent-ink)]"
        >
          {showCategories ? 'Hide categories' : 'Manage categories'}
        </button>
        {showCategories && <ManageCategories />}
      </div>
    </div>
  )
}

function ManageCategories() {
  const queryClient = useQueryClient()
  const { data: categories, isLoading } = useQuery({
    queryKey: ['finance', 'categories'],
    queryFn: async () => (await api.get<Category[]>('/finance/categories')).data,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const update = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      (await api.patch(`/finance/categories/${id}`, { name })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'categories'] })
      setEditingId(null)
    },
  })
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/finance/categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance', 'categories'] }),
  })

  return (
    <Card className="mt-2">
      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && categories?.length === 0 && (
        <p className="text-sm text-[var(--ink-soft)]">
          No categories yet — add one from the category picker when logging a transaction.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {categories?.map((c) =>
          editingId === c.id ? (
            <div key={c.id} className="flex items-center gap-2">
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editingName.trim()) update.mutate({ id: c.id, name: editingName })
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={() => editingName.trim() && update.mutate({ id: c.id, name: editingName })}
                disabled={!editingName.trim() || update.isPending}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                Save
              </button>
              <button onClick={() => setEditingId(null)} className="text-xs text-[var(--ink-soft)]">
                Cancel
              </button>
            </div>
          ) : (
            <div key={c.id} className="flex items-center justify-between">
              <span className="text-sm">
                {c.name} <span className="text-xs capitalize text-[var(--ink-soft)]">({c.kind})</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingId(c.id)
                    setEditingName(c.name)
                  }}
                  className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                  aria-label="Rename category"
                >
                  <PencilIcon width={14} height={14} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${c.name}"? Its transactions become Uncategorized.`)) remove.mutate(c.id)
                  }}
                  className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
                  aria-label="Delete category"
                >
                  <TrashIcon width={14} height={14} />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </Card>
  )
}

function NewTransactionForm({ accounts }: { accounts: Account[] }) {
  const queryClient = useQueryClient()
  const [accountId, setAccountId] = useState(accounts[0].id)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [categoryId, setCategoryId] = useState<string | null>(() => getLastCategory('expense'))
  const [categoryBusy, setCategoryBusy] = useState(false)

  function changeKind(next: 'expense' | 'income') {
    setKind(next)
    setCategoryId(getLastCategory(next))
  }

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<Transaction>('/finance/transactions', {
          account_id: accountId,
          kind,
          amount,
          note: note || null,
          category_id: categoryId,
        })
      ).data,
    // Drop it into the list immediately with a temp id — the real row (and
    // the account balance it moved) arrives a moment later via invalidation,
    // but the user isn't staring at a spinner for a form that already "worked".
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['finance', 'transactions'] })
      const prev = queryClient.getQueryData<Transaction[]>(['finance', 'transactions'])
      const optimistic: Transaction = {
        id: `optimistic-${crypto.randomUUID()}`,
        account_id: accountId,
        category_id: categoryId,
        kind,
        amount,
        note: note || null,
        occurred_on: new Date().toISOString().slice(0, 10),
        is_transfer: false,
      }
      queryClient.setQueryData<Transaction[]>(['finance', 'transactions'], (old) => [
        optimistic,
        ...(old ?? []),
      ])
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['finance', 'transactions'], context.prev)
    },
    onSuccess: () => {
      setAmount('')
      setNote('')
      setLastCategory(kind, categoryId)
    },
    onSettled: () => {
      // Broad invalidation on purpose: a new transaction can move the account
      // balance and both analytics charts, not just the transaction list.
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (amount) create.mutate()
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="flex rounded-lg border border-[var(--border)] p-0.5">
          {(['expense', 'income'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => changeKind(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                kind === k ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-soft)]'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <CategoryPicker kind={kind} value={categoryId} onChange={setCategoryId} onBusyChange={setCategoryBusy} />
        {accounts.length > 1 && (
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
        )}
        <input
          type="number"
          inputMode="decimal"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-w-32 flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={!amount || create.isPending || categoryBusy}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Add
        </button>
        {create.isError && (
          <p className="w-full text-xs text-[var(--danger)]">Couldn't save that transaction — please try again.</p>
        )}
      </form>
    </Card>
  )
}
