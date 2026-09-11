import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { PlusIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import { getLastCategory, setLastCategory } from '../../lib/lastCategory'
import type { Account, CreditCard, Transaction } from '../../types/api'
import { CategoryPicker } from './CategoryPicker'
import { dueBadge } from './dueBadge'
import { FinanceSummaryPanel } from './FinanceSummaryPanel'
import { SpendAnalytics } from './SpendAnalytics'

export function OverviewTab({ onOpenCreditCards }: { onOpenCreditCards: () => void }) {
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const { data: creditCards } = useQuery({
    queryKey: ['finance', 'credit-cards'],
    queryFn: async () => (await api.get<CreditCard[]>('/finance/credit-cards')).data,
  })
  const { data: transactions, isLoading: loadingTxns } = useQuery({
    queryKey: ['finance', 'transactions'],
    queryFn: async () => (await api.get<Transaction[]>('/finance/transactions')).data,
  })
  const [showAddAccount, setShowAddAccount] = useState(false)

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
            return (
              <Card key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs capitalize text-[var(--ink-soft)]">{a.account_type}</p>
                </div>
                <span className="tabular-nums text-base font-semibold">
                  ₹{Number(a.current_balance).toLocaleString('en-IN')}
                </span>
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
            {transactions?.map((t) => (
              <Card key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{t.note || (t.kind === 'expense' ? 'Expense' : 'Income')}</p>
                  <p className="text-xs text-[var(--ink-soft)]">{t.occurred_on}</p>
                </div>
                <span
                  className={`tabular-nums text-sm font-semibold ${t.kind === 'expense' ? 'text-[var(--danger)]' : 'text-[var(--accent-ink)]'}`}
                >
                  {t.kind === 'expense' ? '−' : '+'}₹{Number(t.amount).toFixed(0)}
                </span>
              </Card>
            ))}
          </div>

          <SpendAnalytics />
        </>
      )}
    </div>
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
        await api.post('/finance/transactions', {
          account_id: accountId,
          kind,
          amount,
          note: note || null,
          category_id: categoryId,
        })
      ).data,
    onSuccess: () => {
      setAmount('')
      setNote('')
      setLastCategory(kind, categoryId)
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
