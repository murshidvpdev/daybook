import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { PencilIcon, PlusIcon, TrashIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import { getLastCategory, setLastCategory } from '../../lib/lastCategory'
import type { Account, Category, CreditCard, Transaction } from '../../types/api'
import { CategoryPicker } from './CategoryPicker'
import { dueBadge } from './dueBadge'
import { FinanceSummaryPanel } from './FinanceSummaryPanel'
import { SpendAnalytics } from './SpendAnalytics'
import { useSyncFinanceBalances } from './useSyncFinanceBalances'

export function OverviewTab({ onOpenCreditCards }: { onOpenCreditCards: () => void }) {
  const queryClient = useQueryClient()
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const creditCardsQuery = useQuery({
    queryKey: ['finance', 'credit-cards'],
    queryFn: async () => (await api.get<CreditCard[]>('/finance/credit-cards')).data,
  })
  const creditCards = creditCardsQuery.data
  const transactionsQuery = useQuery({
    queryKey: ['finance', 'transactions'],
    queryFn: async () => (await api.get<Transaction[]>('/finance/transactions')).data,
  })
  const { data: transactions, isLoading: loadingTxns } = transactionsQuery
  // Both of these lists can silently post a backdated SIP transaction as a
  // side effect of the GET itself — keep the accounts/summary totals honest
  // whenever that happens instead of waiting for an unrelated mutation.
  useSyncFinanceBalances(transactionsQuery.dataUpdatedAt)
  useSyncFinanceBalances(creditCardsQuery.dataUpdatedAt)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [adjustingAccountId, setAdjustingAccountId] = useState<string | null>(null)
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null)
  const [showCategories, setShowCategories] = useState(false)

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => api.delete(`/finance/accounts/${id}`),
    // The row disappearing immediately is what makes a delete feel real —
    // the balance totals still come from the next invalidated fetch, since
    // recomputing them client-side would mean duplicating the credit-card /
    // EMI / SIP branching the backend already does correctly.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['finance', 'accounts'] })
      const prev = queryClient.getQueryData<Account[]>(['finance', 'accounts'])
      queryClient.setQueryData<Account[]>(['finance', 'accounts'], (old) => old?.filter((a) => a.id !== id))
      return { prev }
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData(['finance', 'accounts'], context.prev)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['finance'] }),
  })
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
  const nonCardAccounts = allAccounts.filter((a) => a.account_type !== 'credit_card')
  const creditCardByAccountId = new Map((creditCards ?? []).map((c) => [c.account_id, c]))

  return (
    <div>
      <FinanceSummaryPanel />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Accounts</h2>
        <button
          onClick={() => setShowAddAccount((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-[var(--accent-ink)]"
        >
          <PlusIcon width={14} height={14} /> Add account
        </button>
      </div>

      {showAddAccount && <NewAccountForm onDone={() => setShowAddAccount(false)} />}

      {!loadingAccounts && allAccounts.length === 0 && !showAddAccount && (
        <Card className="mb-4 text-center">
          <p className="mb-3 text-sm text-[var(--ink-soft)]">
            Add an account to start tracking spending — a cash wallet or a bank account. (Credit cards have their own
            "Add card" button on the Credit Cards tab, since they need a due date.)
          </p>
          <button
            onClick={() => setShowAddAccount(true)}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Add your first account
          </button>
        </Card>
      )}

      {allAccounts.length > 0 && (
        <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {allAccounts.map((a) => {
            const card = creditCardByAccountId.get(a.id)
            if (card) {
              const badge = dueBadge(card.next_due_date)
              return (
                <Card key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className={`text-xs font-medium ${badge.tone}`}>{badge.text}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-base font-semibold">
                      ₹{Number(card.outstanding_balance).toLocaleString('en-IN')}
                    </p>
                    <button
                      onClick={onOpenCreditCards}
                      className="text-xs font-medium text-[var(--accent-ink)] hover:underline"
                    >
                      View card →
                    </button>
                  </div>
                </Card>
              )
            }
            if (editingAccountId === a.id) {
              return (
                <div key={a.id} className="sm:col-span-2">
                  <EditAccountForm account={a} onDone={() => setEditingAccountId(null)} />
                </div>
              )
            }
            if (adjustingAccountId === a.id) {
              return (
                <div key={a.id} className="sm:col-span-2">
                  <AdjustBalanceForm account={a} onDone={() => setAdjustingAccountId(null)} />
                </div>
              )
            }
            return (
              <Card key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs capitalize text-[var(--ink-soft)]">{a.account_type}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAdjustingAccountId(a.id)}
                    className="tabular-nums text-base font-semibold hover:text-[var(--accent-ink)]"
                    title="Not right? Tap to set the actual balance"
                  >
                    ₹{Number(a.current_balance).toLocaleString('en-IN')}
                  </button>
                  <button
                    onClick={() => setEditingAccountId(a.id)}
                    className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                    aria-label="Edit account"
                  >
                    <PencilIcon width={15} height={15} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${a.name}"? This also removes its transactions.`)) {
                        deleteAccount.mutate(a.id)
                      }
                    }}
                    className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
                    aria-label="Delete account"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {allAccounts.length > 0 && nonCardAccounts.length === 0 && !showAddAccount && (
        <p className="mb-5 text-xs text-[var(--ink-soft)]">
          Only credit cards so far —{' '}
          <button onClick={() => setShowAddAccount(true)} className="font-medium text-[var(--accent-ink)] underline">
            add a cash or bank account
          </button>{' '}
          too when you're ready.
        </p>
      )}

      {allAccounts.length > 0 && (
        <>
          <NewTransactionForm accounts={allAccounts} />

          <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Recent</h2>
          {loadingTxns && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
          {!loadingTxns && transactions?.length === 0 && (
            <Card className="text-center text-sm text-[var(--ink-soft)]">No transactions yet.</Card>
          )}
          <div className="flex flex-col gap-2">
            {transactions?.map((t) =>
              editingTxnId === t.id ? (
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
                    <p className="text-xs text-[var(--ink-soft)]">{t.occurred_on}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`tabular-nums text-sm font-semibold ${t.kind === 'expense' ? 'text-[var(--danger)]' : 'text-[var(--accent-ink)]'}`}
                    >
                      {t.kind === 'expense' ? '−' : '+'}₹{Number(t.amount).toFixed(0)}
                    </span>
                    <button
                      onClick={() => setEditingTxnId(t.id)}
                      className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                      aria-label="Edit transaction"
                    >
                      <PencilIcon width={15} height={15} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this transaction?')) deleteTransaction.mutate(t.id)
                      }}
                      className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
                      aria-label="Delete transaction"
                    >
                      <TrashIcon width={15} height={15} />
                    </button>
                  </div>
                </Card>
              ),
            )}
          </div>

          <SpendAnalytics />
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

function AdjustBalanceForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [actualBalance, setActualBalance] = useState(account.current_balance)
  const [note, setNote] = useState('')

  const adjust = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/finance/accounts/${account.id}/adjust-balance`, {
          actual_balance: actualBalance,
          note: note || null,
        })
      ).data,
    // Optimistic: the whole point is that this should feel instant, not like
    // a page refresh — update the accounts list and the summary tiles right
    // away, then reconcile with the server's real numbers once it replies.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['finance', 'accounts'] })
      await queryClient.cancelQueries({ queryKey: ['finance', 'analytics', 'summary'] })
      const prevAccounts = queryClient.getQueryData<Account[]>(['finance', 'accounts'])
      const prevSummary = queryClient.getQueryData<{ total_balance: string; net_worth: string }>([
        'finance',
        'analytics',
        'summary',
      ])
      const delta = Number(actualBalance) - Number(account.current_balance)
      queryClient.setQueryData<Account[]>(['finance', 'accounts'], (old) =>
        old?.map((a) => (a.id === account.id ? { ...a, current_balance: actualBalance } : a)),
      )
      queryClient.setQueryData(['finance', 'analytics', 'summary'], (old: typeof prevSummary) =>
        old
          ? {
              ...old,
              total_balance: String(Number(old.total_balance) + delta),
              net_worth: String(Number(old.net_worth) + delta),
            }
          : old,
      )
      return { prevAccounts, prevSummary }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevAccounts) queryClient.setQueryData(['finance', 'accounts'], context.prevAccounts)
      if (context?.prevSummary) queryClient.setQueryData(['finance', 'analytics', 'summary'], context.prevSummary)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
    onSuccess: onDone,
  })

  return (
    <Card>
      <p className="mb-2 text-sm font-medium">What does {account.name} actually hold right now?</p>
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="number"
          inputMode="decimal"
          data-testid="adjust-balance-amount"
          value={actualBalance}
          onChange={(e) => setActualBalance(e.target.value)}
          className="w-36 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-w-32 flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={() => adjust.mutate()}
          disabled={!actualBalance || adjust.isPending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Save
        </button>
        <button onClick={onDone} className="rounded-lg px-3 py-2 text-sm text-[var(--ink-soft)]">
          Cancel
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--ink-soft)]">
        This posts a single "Balance adjustment" transaction for the difference — your history stays intact, it's
        just corrected going forward.
      </p>
      {adjust.isError && (
        <p className="mt-2 text-xs text-[var(--danger)]">Couldn't save that — please try again.</p>
      )}
    </Card>
  )
}

function EditAccountForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(account.name)
  const [accountType, setAccountType] = useState<'cash' | 'bank'>(account.account_type as 'cash' | 'bank')
  const [openingBalance, setOpeningBalance] = useState(account.opening_balance)

  const update = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/finance/accounts/${account.id}`, {
          name,
          account_type: accountType,
          opening_balance: openingBalance || 0,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      onDone()
    },
  })

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-2">
        <input
          data-testid="edit-account-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-40 flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <select
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as 'cash' | 'bank')}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
        >
          <option value="cash">Cash</option>
          <option value="bank">Bank / Debit Card</option>
        </select>
        <input
          type="number"
          inputMode="decimal"
          placeholder="Opening balance"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
          className="w-32 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={() => update.mutate()}
          disabled={!name.trim() || update.isPending}
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

function EditTransactionForm({
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
        <CategoryPicker kind={kind} value={categoryId} onChange={setCategoryId} />
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
          disabled={!amount || update.isPending}
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

function NewAccountForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState<'cash' | 'bank'>('cash')
  const [openingBalance, setOpeningBalance] = useState('')

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/finance/accounts', {
          name,
          account_type: accountType,
          opening_balance: openingBalance || 0,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'accounts'] })
      onDone()
    },
  })

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-end gap-2">
        <input
          placeholder="Account name, e.g. HDFC Bank"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-40 flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <select
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as 'cash' | 'bank')}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
        >
          <option value="cash">Cash</option>
          <option value="bank">Bank / Debit Card</option>
        </select>
        <input
          type="number"
          inputMode="decimal"
          placeholder="Current balance"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
          className="w-32 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={() => create.mutate()}
          disabled={!name.trim() || create.isPending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Save
        </button>
        <button onClick={onDone} className="rounded-lg px-3 py-2 text-sm text-[var(--ink-soft)]">
          Cancel
        </button>
      </div>
      {create.isError && (
        <p className="mt-2 text-xs text-[var(--danger)]">Couldn't save that account — please try again.</p>
      )}
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
        <CategoryPicker kind={kind} value={categoryId} onChange={setCategoryId} />
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
          disabled={!amount || create.isPending}
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
