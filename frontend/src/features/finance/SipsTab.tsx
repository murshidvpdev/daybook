import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { PencilIcon, PlusIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import type { Account, Sip } from '../../types/api'
import { useSyncFinanceBalances } from './useSyncFinanceBalances'

export function SipsTab() {
  const queryClient = useQueryClient()
  const sipsQuery = useQuery({
    queryKey: ['finance', 'sips'],
    queryFn: async () => (await api.get<Sip[]>('/finance/sips')).data,
  })
  const { data: sips, isLoading } = sipsQuery
  useSyncFinanceBalances(sipsQuery.dataUpdatedAt)
  const { data: accounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const stop = useMutation({
    mutationFn: async (id: string) => api.delete(`/finance/sips/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance'] }),
  })

  if (!accounts) return <p className="text-sm text-[var(--ink-soft)]">Loading…</p>

  if (accounts.length === 0) {
    return (
      <Card className="text-center text-sm text-[var(--ink-soft)]">
        Add a bank account first — SIPs debit from a specific account.
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
          <PlusIcon width={16} height={16} /> Add SIP
        </button>
      </div>

      {showNew && <NewSipForm accounts={accounts} onDone={() => setShowNew(false)} />}

      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && sips?.length === 0 && !showNew && (
        <Card className="text-center text-sm text-[var(--ink-soft)]">No SIPs tracked yet.</Card>
      )}

      <div className="flex flex-col gap-2">
        {sips?.map((sip) =>
          editingId === sip.id ? (
            <EditSipForm key={sip.id} sip={sip} onDone={() => setEditingId(null)} />
          ) : (
            <Card key={sip.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{sip.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">
                  ₹{Number(sip.amount).toLocaleString('en-IN')}/mo · next{' '}
                  {format(parseISO(sip.next_due_date), 'MMM d')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingId(sip.id)}
                  className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                  aria-label="Edit SIP"
                >
                  <PencilIcon width={15} height={15} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Stop "${sip.name}"?`)) stop.mutate(sip.id)
                  }}
                  className="text-xs text-[var(--ink-soft)] hover:text-[var(--danger)]"
                >
                  Stop
                </button>
              </div>
            </Card>
          ),
        )}
      </div>
    </div>
  )
}

function EditSipForm({ sip, onDone }: { sip: Sip; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(sip.name)
  const [amount, setAmount] = useState(sip.amount)
  const [dueDay, setDueDay] = useState(String(sip.due_day))

  const update = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/finance/sips/${sip.id}`, {
          name,
          amount,
          due_day: Number(dueDay),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      onDone()
    },
  })

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <input
          data-testid="edit-sip-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="₹/month"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
            onClick={() => update.mutate()}
            disabled={!name.trim() || !amount || update.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save
          </button>
          <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
            Cancel
          </button>
        </div>
        {update.isError && (
          <p className="text-xs text-[var(--danger)]">Couldn't save those changes — please try again.</p>
        )}
      </div>
    </Card>
  )
}

function NewSipForm({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [accountId, setAccountId] = useState(accounts[0].id)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDay, setDueDay] = useState('10')

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/finance/sips', {
          account_id: accountId,
          name,
          amount,
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
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Fund name, e.g. Nifty 50 Index Fund"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="₹/month"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
            disabled={!name.trim() || !amount || create.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save
          </button>
          <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
            Cancel
          </button>
        </div>
      </div>
    </Card>
  )
}
