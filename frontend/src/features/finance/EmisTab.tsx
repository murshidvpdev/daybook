import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { PlusIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import type { Account, Emi } from '../../types/api'

const typeLabel: Record<string, string> = { credit_card: 'Credit Card', bank: 'Bank', cash: 'Cash' }

export function EmisTab() {
  const queryClient = useQueryClient()
  const { data: emis, isLoading } = useQuery({
    queryKey: ['finance', 'emis'],
    queryFn: async () => (await api.get<Emi[]>('/finance/emis')).data,
  })
  const { data: accounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const [showNew, setShowNew] = useState(false)

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/finance/emis/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance'] }),
  })
  const confirmPayment = useMutation({
    mutationFn: async (id: string) => (await api.post(`/finance/emis/${id}/confirm-payment`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })

  if (!accounts) return <p className="text-sm text-[var(--ink-soft)]">Loading…</p>

  if (accounts.length === 0) {
    return (
      <Card className="text-center text-sm text-[var(--ink-soft)]">
        Add a credit card or a bank account first — an EMI is tracked against whichever one it's auto-debited from.
      </Card>
    )
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
        >
          <PlusIcon width={16} height={16} /> Add EMI
        </button>
      </div>

      {showNew && <NewEmiForm accounts={accounts} onDone={() => setShowNew(false)} />}

      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && emis?.length === 0 && !showNew && (
        <Card className="text-center text-sm text-[var(--ink-soft)]">No EMIs tracked yet.</Card>
      )}

      <div className="flex flex-col gap-3">
        {emis?.map((emi) => {
          const account = accounts.find((a) => a.id === emi.account_id)
          const pct = Math.round((emi.installments_paid / emi.total_installments) * 100)
          return (
            <Card key={emi.id} style={emi.is_due ? { borderColor: 'var(--amber)' } : undefined}>
              <div className="mb-1 flex items-start justify-between">
                <div>
                  <p className="font-medium">{emi.name}</p>
                  <p className="text-xs text-[var(--ink-soft)]">
                    {account?.name ?? 'Account'} · ₹{Number(emi.monthly_amount).toLocaleString('en-IN')}/mo
                  </p>
                </div>
                <button
                  onClick={() => remove.mutate(emi.id)}
                  className="text-xs text-[var(--ink-soft)] hover:text-[var(--danger)]"
                >
                  Remove
                </button>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                {emi.installments_paid}/{emi.total_installments} paid
                {!emi.is_completed && ` · next ${format(parseISO(emi.next_due_date), 'MMM d')}`}
                {emi.is_completed && ' · completed'}
              </p>
              {emi.is_due && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-[var(--amber-soft)] px-3 py-2">
                  <p className="text-xs font-medium text-[var(--amber)]">
                    Due {format(parseISO(emi.next_due_date), 'MMM d')} — have you paid this?
                  </p>
                  <button
                    onClick={() => confirmPayment.mutate(emi.id)}
                    disabled={confirmPayment.isPending}
                    className="flex-none rounded-lg bg-[var(--amber)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    Yes, paid
                  </button>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function NewEmiForm({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [accountId, setAccountId] = useState(accounts[0].id)
  const [name, setName] = useState('')
  const [monthlyAmount, setMonthlyAmount] = useState('')
  const [totalInstallments, setTotalInstallments] = useState('12')
  const [dueDay, setDueDay] = useState('5')

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/finance/emis', {
          account_id: accountId,
          name,
          monthly_amount: monthlyAmount,
          total_installments: Number(totalInstallments),
          due_day: Number(dueDay),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      onDone()
    },
  })

  return (
    <Card className="mb-4">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium text-[var(--ink-soft)]">
          Debited from
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({typeLabel[a.account_type] ?? a.account_type})
              </option>
            ))}
          </select>
        </label>
        <input
          placeholder="What is it? e.g. iPhone 15 or Personal Loan"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            placeholder="₹/month"
            value={monthlyAmount}
            onChange={(e) => setMonthlyAmount(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            placeholder="Months"
            value={totalInstallments}
            onChange={(e) => setTotalInstallments(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            placeholder="Due day"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || !monthlyAmount || create.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save
          </button>
          <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
            Cancel
          </button>
        </div>
        {create.isError && <p className="text-xs text-[var(--danger)]">Couldn't save that EMI — please try again.</p>}
      </div>
    </Card>
  )
}
