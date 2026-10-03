import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { PencilIcon, PlusIcon, TrashIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import { getLastCategory, setLastCategory } from '../../lib/lastCategory'
import type { Account, CreditCard, CreditCardBill, CreditCardSpendResult, Transaction } from '../../types/api'
import { CategoryPicker } from './CategoryPicker'
import { dueBadge } from './dueBadge'
import { useSyncFinanceBalances } from './useSyncFinanceBalances'

type Panel = 'spend' | 'money-in' | 'match' | 'activity' | 'bills' | 'edit' | null

// Bank and cash accounts a card can be paid from — never another card.
function usePayingAccounts() {
  const { data } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  return (data ?? []).filter((a) => a.account_type !== 'credit_card')
}

export function CreditCardsTab() {
  const queryClient = useQueryClient()
  const cardsQuery = useQuery({
    queryKey: ['finance', 'credit-cards'],
    queryFn: async () => (await api.get<CreditCard[]>('/finance/credit-cards')).data,
  })
  const { data: cards, isLoading } = cardsQuery
  useSyncFinanceBalances(cardsQuery.dataUpdatedAt)
  const [showNew, setShowNew] = useState(false)
  const [openPanel, setOpenPanel] = useState<{ cardId: string; panel: Panel }>({ cardId: '', panel: null })

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/finance/credit-cards/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance'] }),
  })

  function togglePanel(cardId: string, panel: Panel) {
    setOpenPanel((prev) => (prev.cardId === cardId && prev.panel === panel ? { cardId: '', panel: null } : { cardId, panel }))
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
        >
          <PlusIcon width={16} height={16} /> Add card
        </button>
      </div>

      {showNew && <NewCreditCardForm onDone={() => setShowNew(false)} />}

      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && cards?.length === 0 && !showNew && (
        <Card className="text-center text-sm text-[var(--ink-soft)]">
          No credit cards yet. Add one to track its due date and balance.
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {cards?.map((card) => {
          const badge = dueBadge(card.next_due_date)
          const limit = card.credit_limit ? Number(card.credit_limit) : null
          const balance = Number(card.outstanding_balance)
          const pct = limit ? Math.min(100, Math.max(0, (balance / limit) * 100)) : null
          const isOpen = openPanel.cardId === card.id
          return (
            <Card key={card.id}>
              <div className="mb-1 flex items-start justify-between">
                <div>
                  <p className="font-medium">
                    {card.name}
                    {card.last_four && <span className="ml-1 text-[var(--ink-soft)]">•••• {card.last_four}</span>}
                  </p>
                  <p className={`text-xs font-medium ${badge.tone}`}>{badge.text}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => togglePanel(card.id, 'edit')}
                    className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                    aria-label="Edit card"
                  >
                    <PencilIcon width={15} height={15} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove "${card.name}"? This also removes its transactions.`)) {
                        remove.mutate(card.id)
                      }
                    }}
                    className="text-xs text-[var(--ink-soft)] hover:text-[var(--danger)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="tabular-nums text-xl font-semibold">₹{balance.toLocaleString('en-IN')}</p>
              {limit !== null && (
                <>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">of ₹{limit.toLocaleString('en-IN')} limit</p>
                </>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ['spend', '+ Add spend'],
                    ['money-in', '+ Money in'],
                    ['match', 'Match statement'],
                    ['activity', 'Activity'],
                    ['bills', 'Bills'],
                  ] as const
                ).map(([panel, label]) => (
                  <button
                    key={panel}
                    onClick={() => togglePanel(card.id, panel)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)] ${
                      isOpen && openPanel.panel === panel
                        ? 'border-[var(--accent)] text-[var(--accent-ink)]'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {isOpen && openPanel.panel === 'spend' && (
                <SpendForm cardId={card.id} onDone={() => setOpenPanel({ cardId: '', panel: null })} />
              )}
              {isOpen && openPanel.panel === 'money-in' && (
                <MoneyInForm card={card} onDone={() => setOpenPanel({ cardId: '', panel: null })} />
              )}
              {isOpen && openPanel.panel === 'match' && (
                <MatchStatementForm card={card} onDone={() => setOpenPanel({ cardId: '', panel: null })} />
              )}
              {isOpen && openPanel.panel === 'activity' && <ActivityPanel card={card} />}
              {isOpen && openPanel.panel === 'bills' && <BillsPanel cardId={card.id} />}
              {isOpen && openPanel.panel === 'edit' && (
                <EditCreditCardForm card={card} onDone={() => setOpenPanel({ cardId: '', panel: null })} />
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function SpendForm({ cardId, onDone }: { cardId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(() => getLastCategory('expense'))
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [isLent, setIsLent] = useState(false)
  const [personName, setPersonName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [remindOn, setRemindOn] = useState('')

  const submit = useMutation({
    mutationFn: async () =>
      (
        await api.post<CreditCardSpendResult>(`/finance/credit-cards/${cardId}/spend`, {
          amount,
          note: note || null,
          category_id: isLent ? null : categoryId,
          lend: isLent ? { person_name: personName, phone_number: phoneNumber || null, remind_on: remindOn || null } : null,
        })
      ).data,
    onSuccess: () => {
      if (!isLent) setLastCategory('expense', categoryId)
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
      onDone()
    },
  })

  const canSubmit = amount && (!isLent || personName.trim())

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
      <div className="flex flex-col gap-2">
        <input
          type="number"
          inputMode="decimal"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <input
          placeholder="What was it for? e.g. Groceries"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        {!isLent && (
          <CategoryPicker
            kind="expense"
            value={categoryId}
            onChange={setCategoryId}
            onBusyChange={setCategoryBusy}
            fieldBg="bg-[var(--surface)]"
            className="w-full"
          />
        )}
        <label className="flex items-center gap-2 text-xs font-medium text-[var(--ink-soft)]">
          <input type="checkbox" checked={isLent} onChange={(e) => setIsLent(e.target.checked)} />
          This was money I lent to a friend
        </label>
        {isLent && (
          <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-2">
            <input
              placeholder="Friend's name"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <input
              placeholder="Phone number (for reminders, optional)"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <label className="flex flex-col text-xs text-[var(--ink-soft)]">
              Remind me on
              <input
                type="date"
                value={remindOn}
                onChange={(e) => setRemindOn(e.target.value)}
                className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => submit.mutate()}
            disabled={!canSubmit || submit.isPending || categoryBusy}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save
          </button>
          <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
            Cancel
          </button>
        </div>
        {submit.isError && <p className="text-xs text-[var(--danger)]">Couldn't save that — please try again.</p>}
      </div>
    </div>
  )
}

function BillsPanel({ cardId }: { cardId: string }) {
  const queryClient = useQueryClient()
  const payingAccounts = usePayingAccounts()
  const [fromAccountId, setFromAccountId] = useState('')
  const { data: bills, isLoading } = useQuery({
    queryKey: ['finance', 'credit-cards', cardId, 'bills'],
    queryFn: async () => (await api.get<CreditCardBill[]>(`/finance/credit-cards/${cardId}/bills`)).data,
  })

  const generate = useMutation({
    mutationFn: async () => (await api.post(`/finance/credit-cards/${cardId}/bills`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'credit-cards', cardId, 'bills'] })
      queryClient.invalidateQueries({ queryKey: ['finance', 'credit-cards'] })
    },
    onError: () => {
      // Most common cause: a bill already covers every day up to today — nothing new to close out.
    },
  })

  const pay = useMutation({
    mutationFn: async (billId: string) =>
      (await api.post(`/finance/credit-cards/bills/${billId}/pay`, { from_account_id: fromAccountId || null })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
  })

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Bills</p>
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          Generate bill
        </button>
      </div>
      {generate.isError && (
        <p className="mb-2 text-xs text-[var(--danger)]">
          Nothing new to bill — this card's last bill already covers up to today.
        </p>
      )}
      {payingAccounts.length > 0 && bills?.some((b) => !b.is_paid) && (
        <label className="mb-2 block text-xs font-medium text-[var(--ink-soft)]">
          Pay bills from
          <select
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            <option value="">Don't take it from any account</option>
            {payingAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {isLoading && <p className="text-xs text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && bills?.length === 0 && (
        <p className="text-xs text-[var(--ink-soft)]">No bills generated yet.</p>
      )}
      <div className="flex flex-col gap-2">
        {bills?.map((bill) => (
          <div key={bill.id} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2">
            <div>
              <p className="text-xs font-medium">
                {format(parseISO(bill.period_start), 'MMM d')} – {format(parseISO(bill.period_end), 'MMM d')}
              </p>
              <p className="text-xs text-[var(--ink-soft)]">Due {format(parseISO(bill.due_date), 'MMM d')}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular-nums text-sm font-semibold">₹{Number(bill.amount).toLocaleString('en-IN')}</span>
              {bill.is_paid ? (
                <span className="text-xs font-medium text-[var(--accent-ink)]">Paid</span>
              ) : (
                <button
                  onClick={() => pay.mutate(bill.id)}
                  className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-[var(--surface-2)]"
                >
                  Mark paid
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MoneyInForm({ card, onDone }: { card: CreditCard; onDone: () => void }) {
  const queryClient = useQueryClient()
  const payingAccounts = usePayingAccounts()
  const [source, setSource] = useState<'payment' | 'refund'>('payment')
  const [amount, setAmount] = useState('')
  const [fromAccountId, setFromAccountId] = useState('')
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')

  const submit = useMutation({
    mutationFn: async () =>
      (
        await api.post<Transaction>(`/finance/credit-cards/${card.id}/money-in`, {
          amount,
          source,
          from_account_id: source === 'payment' ? fromAccountId || null : null,
          occurred_on: occurredOn,
          note: note || null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
      onDone()
    },
  })

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface-2)] p-1 text-xs font-medium">
          {(
            [
              ['payment', 'I paid the card'],
              ['refund', 'Refund / cashback'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSource(value)}
              className={`rounded-md px-2 py-1.5 ${
                source === value ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-soft)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            inputMode="decimal"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        {source === 'payment' && payingAccounts.length > 0 && (
          <label className="text-xs font-medium text-[var(--ink-soft)]">
            Paid from (its balance drops by the same amount)
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="">Not from a tracked account</option>
              {payingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="flex gap-2">
          <button
            onClick={() => submit.mutate()}
            disabled={!amount || Number(amount) <= 0 || submit.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save
          </button>
          <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
            Cancel
          </button>
        </div>
        {submit.isError && <p className="text-xs text-[var(--danger)]">Couldn't save that — please try again.</p>}
      </div>
    </div>
  )
}

function MatchStatementForm({ card, onDone }: { card: CreditCard; onDone: () => void }) {
  const queryClient = useQueryClient()
  const current = Number(card.outstanding_balance)
  const [actual, setActual] = useState('')
  const diff = actual === '' ? 0 : Number(actual) - current

  const submit = useMutation({
    mutationFn: async () =>
      (await api.post(`/finance/credit-cards/${card.id}/match-statement`, { actual_outstanding: actual })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      onDone()
    },
  })

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-[var(--ink-soft)]">
          What does your bank app or statement say you owe right now? Daybook thinks ₹
          {current.toLocaleString('en-IN')}.
        </p>
        <input
          type="number"
          inputMode="decimal"
          placeholder="Total outstanding"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        {actual !== '' && diff !== 0 && (
          <p className="text-xs text-[var(--ink-soft)]">
            {diff > 0
              ? `Adds a ₹${diff.toLocaleString('en-IN')} charge (interest, fees, or a spend you didn't log).`
              : `Adds a ₹${Math.abs(diff).toLocaleString('en-IN')} credit (a payment or refund you didn't log).`}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => submit.mutate()}
            disabled={actual === '' || diff === 0 || submit.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Match
          </button>
          <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
            Cancel
          </button>
        </div>
        {submit.isError && <p className="text-xs text-[var(--danger)]">Couldn't update that — please try again.</p>}
      </div>
    </div>
  )
}

function ActivityPanel({ card }: { card: CreditCard }) {
  const queryClient = useQueryClient()
  const { data: txns, isLoading } = useQuery({
    queryKey: ['finance', 'transactions', { account: card.account_id }],
    queryFn: async () =>
      (await api.get<Transaction[]>('/finance/transactions', { params: { account_id: card.account_id, limit: 30 } }))
        .data,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/finance/transactions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance'] }),
  })

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Recent on this card</p>
      {isLoading && <p className="text-xs text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && txns?.length === 0 && <p className="text-xs text-[var(--ink-soft)]">Nothing logged yet.</p>}
      <div className="flex flex-col gap-1">
        {txns?.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface)] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{t.note || (t.kind === 'expense' ? 'Spend' : 'Money in')}</p>
              <p className="text-xs text-[var(--ink-soft)]">{format(parseISO(t.occurred_on), 'MMM d')}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`tabular-nums text-sm font-semibold ${
                  t.kind === 'income' ? 'text-[var(--accent-ink)]' : ''
                }`}
              >
                {t.kind === 'income' ? '−' : '+'}₹{Number(t.amount).toLocaleString('en-IN')}
              </span>
              <button
                onClick={() => {
                  if (confirm('Delete this entry? The card balance will change to match.')) remove.mutate(t.id)
                }}
                className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
                aria-label="Delete entry"
              >
                <TrashIcon width={12} height={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--ink-soft)]">+ adds to what you owe, − takes it off.</p>
    </div>
  )
}

function EditCreditCardForm({ card, onDone }: { card: CreditCard; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(card.name)
  const [lastFour, setLastFour] = useState(card.last_four ?? '')
  const [limit, setLimit] = useState(card.credit_limit ?? '')
  const [dueDay, setDueDay] = useState(String(card.due_day))

  const update = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/finance/credit-cards/${card.id}`, {
          name,
          last_four: lastFour || null,
          credit_limit: limit || null,
          due_day: Number(dueDay),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      onDone()
    },
  })

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
      <div className="flex flex-col gap-2">
        <input
          data-testid="edit-card-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Last 4 digits"
            maxLength={4}
            value={lastFour}
            onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            placeholder="Credit limit"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <label className="text-xs font-medium text-[var(--ink-soft)]">
          Payment due day of month
          <input
            type="number"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => update.mutate()}
            disabled={!name.trim() || update.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save
          </button>
          <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
            Cancel
          </button>
        </div>
        {update.isError && <p className="text-xs text-[var(--danger)]">Couldn't save those changes — please try again.</p>}
      </div>
    </div>
  )
}

function NewCreditCardForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [lastFour, setLastFour] = useState('')
  const [limit, setLimit] = useState('')
  const [dueDay, setDueDay] = useState('5')
  const [openingBalance, setOpeningBalance] = useState('')

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/finance/credit-cards', {
          name,
          last_four: lastFour || null,
          credit_limit: limit || null,
          due_day: Number(dueDay),
          opening_balance: openingBalance || 0,
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
        <input
          placeholder="Card name, e.g. HDFC Regalia"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Last 4 digits"
            maxLength={4}
            value={lastFour}
            onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            placeholder="Credit limit"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-[var(--ink-soft)]">
            Payment due day of month
            <input
              type="number"
              min={1}
              max={31}
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="text-xs font-medium text-[var(--ink-soft)]">
            Already owed on this card
            <input
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save
          </button>
          <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
            Cancel
          </button>
        </div>
        {create.isError && <p className="text-xs text-[var(--danger)]">Couldn't save that card — please try again.</p>}
      </div>
    </Card>
  )
}
