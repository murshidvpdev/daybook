import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { api } from '../../lib/api'
import type { Account, CreditCard, Lending, SmsCapture } from '../../types/api'
import { CategoryPicker } from './CategoryPicker'

type Purpose = 'normal' | 'lend' | 'repayment' | 'card-payment'

const inputClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]'

export function ReviewCapturesPanel({ onDone }: { onDone: () => void }) {
  const { data: captures, isLoading } = useQuery({
    queryKey: ['capture', 'pending'],
    queryFn: async () => (await api.get<SmsCapture[]>('/capture/pending')).data,
  })
  const { data: accounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const { data: cards } = useQuery({
    queryKey: ['finance', 'credit-cards'],
    queryFn: async () => (await api.get<CreditCard[]>('/finance/credit-cards')).data,
  })
  const { data: lendings } = useQuery({
    queryKey: ['finance', 'lendings'],
    queryFn: async () => (await api.get<Lending[]>('/finance/lendings')).data,
  })

  return (
    <Card className="mb-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">SMS to review</p>
          <p className="text-xs text-[var(--ink-soft)]">
            Check each one and save it, or dismiss it if it's not yours or already logged. A card bill payment sends
            two SMS (bank and card) — save one as "Card bill payment" and dismiss the other.
          </p>
        </div>
        <button onClick={onDone} className="text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]">
          Close
        </button>
      </div>
      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && captures?.length === 0 && (
        <p className="text-sm text-[var(--ink-soft)]">All caught up — nothing waiting.</p>
      )}
      <div className="flex flex-col gap-3">
        {captures?.map((c) => (
          <CaptureRow
            key={c.id}
            capture={c}
            accounts={accounts ?? []}
            cards={cards ?? []}
            lendings={lendings ?? []}
          />
        ))}
      </div>
    </Card>
  )
}

function CaptureRow({
  capture,
  accounts,
  cards,
  lendings,
}: {
  capture: SmsCapture
  accounts: Account[]
  cards: CreditCard[]
  lendings: Lending[]
}) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState(capture.amount ?? '')
  const [kind, setKind] = useState<'expense' | 'income'>(capture.kind ?? 'expense')
  const [accountId, setAccountId] = useState(capture.account_id ?? '')
  const [occurredOn, setOccurredOn] = useState(capture.occurred_on)
  const [note, setNote] = useState(capture.counterparty ?? '')
  const [purpose, setPurpose] = useState<Purpose>('normal')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [personName, setPersonName] = useState('')
  const [lendingId, setLendingId] = useState('')
  const [payCardId, setPayCardId] = useState('')

  const selectedCard = cards.find((c) => c.account_id === accountId)
  // A repayment toward money you lent comes *in*; toward money you borrowed goes *out*.
  const openLendings = lendings.filter(
    (l) => !l.is_settled && l.direction === (kind === 'income' ? 'lent' : 'borrowed'),
  )
  const purposes: [Purpose, string][] = [
    ['normal', kind === 'expense' ? 'Spending' : 'Income'],
    ['lend', kind === 'expense' ? 'Lent to a friend' : 'Borrowed from a friend'],
    ['repayment', kind === 'income' ? 'Friend paid me back' : 'I paid a friend back'],
    ['card-payment', 'Card bill payment'],
  ]
  const effectivePayCardId = purpose === 'card-payment' ? (selectedCard?.id ?? payCardId) : ''

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['capture'] })
    queryClient.invalidateQueries({ queryKey: ['finance'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
  }
  const save = useMutation({
    mutationFn: async () =>
      api.post(`/capture/${capture.id}/confirm`, {
        account_id: accountId,
        kind,
        amount,
        occurred_on: occurredOn,
        note: note || null,
        category_id: purpose === 'normal' ? categoryId : null,
        lend: purpose === 'lend' ? { person_name: personName } : null,
        lending_id: purpose === 'repayment' ? lendingId : null,
        pay_card_id: effectivePayCardId || null,
      }),
    onSuccess: invalidate,
  })
  const dismiss = useMutation({
    mutationFn: async () => api.post(`/capture/${capture.id}/dismiss`),
    onSuccess: invalidate,
  })

  const ready =
    !!accountId &&
    Number(amount) > 0 &&
    !categoryBusy &&
    (purpose !== 'lend' || personName.trim() !== '') &&
    (purpose !== 'repayment' || lendingId !== '') &&
    (purpose !== 'card-payment' || effectivePayCardId !== '')

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
      <p className="mb-2 whitespace-pre-line text-xs text-[var(--ink-soft)]">{capture.raw_text}</p>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface-2)] p-1 text-xs font-medium">
          {(
            [
              ['expense', 'Money out'],
              ['income', 'Money in'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setKind(value)
                setLendingId('')
              }}
              className={`rounded-md px-2 py-1.5 ${
                kind === value ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-soft)]'
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
            aria-label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
          <input
            type="date"
            aria-label="Date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className={inputClass}
          />
        </div>
        <select
          aria-label="Account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={inputClass}
        >
          <option value="">
            {capture.last_four ? `Which account? (SMS says …${capture.last_four})` : 'Which account?'}
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_type === 'credit_card' ? `${a.name} (credit card)` : a.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {purposes.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPurpose(value)}
              className={`rounded-lg border px-2 py-1 text-xs font-medium ${
                purpose === value
                  ? 'border-[var(--accent)] text-[var(--accent-ink)]'
                  : 'border-[var(--border)] text-[var(--ink-soft)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {purpose === 'normal' && (
          <CategoryPicker
            kind={kind}
            value={categoryId}
            onChange={setCategoryId}
            onBusyChange={setCategoryBusy}
            fieldBg="bg-[var(--surface)]"
            className="w-full"
          />
        )}
        {purpose === 'lend' && (
          <input
            placeholder="Friend's name"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            className={inputClass}
          />
        )}
        {purpose === 'repayment' && (
          <select
            aria-label="Which lending"
            value={lendingId}
            onChange={(e) => setLendingId(e.target.value)}
            className={inputClass}
          >
            <option value="">{openLendings.length ? 'Which one?' : 'No open lendings in this direction'}</option>
            {openLendings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.person_name} — ₹{Number(l.outstanding).toLocaleString('en-IN')} left
              </option>
            ))}
          </select>
        )}
        {purpose === 'card-payment' &&
          (selectedCard ? (
            <p className="text-xs text-[var(--ink-soft)]">
              Pays down {selectedCard.name}. Dismiss the matching bank SMS so it isn't counted twice.
            </p>
          ) : (
            <select
              aria-label="Which card was paid"
              value={payCardId}
              onChange={(e) => setPayCardId(e.target.value)}
              className={inputClass}
            >
              <option value="">Which card did you pay?</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ))}
        <input
          placeholder="Note"
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
        />
        <div className="flex gap-2">
          <button
            onClick={() => save.mutate()}
            disabled={!ready || save.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save
          </button>
          <button
            onClick={() => dismiss.mutate()}
            disabled={dismiss.isPending}
            className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]"
          >
            Dismiss
          </button>
        </div>
        {save.isError && (
          <p className="text-xs text-[var(--danger)]">
            Couldn't save — check the amount (a repayment can't be more than what's left).
          </p>
        )}
      </div>
    </div>
  )
}
