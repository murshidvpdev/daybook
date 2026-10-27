import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { PencilIcon, PlusIcon, TrashIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import { isContactPickerSupported } from '../../lib/contactPicker'
import type { Account, Lending, LendingPerson, ReminderLinks } from '../../types/api'
import { type Friend, FriendPicker } from './FriendPicker'
import { useLendingPeople } from './lendingPeople'

export function LendingTab() {
  const queryClient = useQueryClient()
  const { data: lendings, isLoading } = useQuery({
    queryKey: ['finance', 'lendings'],
    queryFn: async () => (await api.get<Lending[]>('/finance/lendings')).data,
  })
  const { data: accounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [paying, setPaying] = useState<{ id: string; mode: PayMode } | null>(null)
  const [person, setPerson] = useState<LendingPerson | null>(null)

  const rowPayProps = (l: Lending) => ({
    payMode: paying?.id === l.id ? paying.mode : null,
    onPay: (mode: PayMode) => setPaying(paying?.id === l.id && paying.mode === mode ? null : { id: l.id, mode }),
    onDonePaying: () => setPaying(null),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/finance/lendings/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance', 'lendings'] }),
  })
  const deletePayment = useMutation({
    mutationFn: async ({ lendingId, paymentId }: { lendingId: string; paymentId: string }) =>
      (await api.delete(`/finance/lendings/${lendingId}/payments/${paymentId}`)).data,
    // A payment can carry a linked transaction that moved an account's balance —
    // undoing it needs to refresh accounts/summary too, not just the lending list.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance'] }),
  })

  const shown = person ? (lendings ?? []).filter((l) => person.lending_ids.includes(l.id)) : (lendings ?? [])
  const open = shown.filter((l) => !l.is_settled)
  const settled = shown.filter((l) => l.is_settled)

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
        >
          <PlusIcon width={16} height={16} /> Add
        </button>
      </div>

      {showNew && <NewLendingForm onDone={() => setShowNew(false)} />}

      <PeopleSummary selectedKey={person?.key ?? null} onSelect={setPerson} />
      {person && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs">
          <span>
            Showing <b>{person.person_name}</b>'s {person.times} {person.times === 1 ? 'lending' : 'lendings'}
          </span>
          <button onClick={() => setPerson(null)} className="font-medium text-[var(--accent-ink)]">
            Show everyone
          </button>
        </div>
      )}

      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && lendings?.length === 0 && !showNew && (
        <Card className="text-center text-sm text-[var(--ink-soft)]">
          Nothing tracked yet — money lent to or borrowed from friends goes here.
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {open.map((l) =>
          editingId === l.id ? (
            <EditLendingForm key={l.id} lending={l} onDone={() => setEditingId(null)} />
          ) : (
            <LendingRow
              key={l.id}
              lending={l}
              accounts={accounts ?? []}
              {...rowPayProps(l)}
              onEdit={() => setEditingId(l.id)}
              onRemove={() => remove.mutate(l.id)}
              onDeletePayment={(paymentId) => deletePayment.mutate({ lendingId: l.id, paymentId })}
            />
          ),
        )}
      </div>

      {settled.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Settled</h2>
          <div className="flex flex-col gap-2 opacity-60">
            {settled.map((l) => (
              <LendingRow
                key={l.id}
                lending={l}
                accounts={accounts ?? []}
                {...rowPayProps(l)}
                onEdit={() => setEditingId(l.id)}
                onRemove={() => remove.mutate(l.id)}
                onDeletePayment={(paymentId) => deletePayment.mutate({ lendingId: l.id, paymentId })}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

type PayMode = 'pay' | 'settle' | 'emi'

function accountLabel(a: Account) {
  return a.account_type === 'credit_card' ? `${a.name} (credit card)` : a.name
}

function LendingRow({
  lending,
  accounts,
  payMode,
  onPay,
  onDonePaying,
  onEdit,
  onRemove,
  onDeletePayment,
}: {
  lending: Lending
  accounts: Account[]
  payMode: PayMode | null
  onPay: (mode: PayMode) => void
  onDonePaying: () => void
  onEdit: () => void
  onRemove: () => void
  onDeletePayment: (paymentId: string) => void
}) {
  const { data: reminder } = useQuery({
    queryKey: ['finance', 'lendings', lending.id, 'reminder'],
    queryFn: async () => (await api.get<ReminderLinks>(`/finance/lendings/${lending.id}/reminder`)).data,
    enabled: !!lending.phone_number && !lending.is_settled,
    retry: false,
  })

  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const hasPayments = lending.payments.length > 0
  const outstanding = Number(lending.outstanding)
  const sourceAccount = lending.account_id ? accountById.get(lending.account_id) : undefined
  const canConvertToEmi =
    lending.direction === 'lent' && !lending.emi && !lending.is_settled && sourceAccount?.account_type === 'credit_card'
  const pct = hasPayments ? Math.min(100, Math.max(0, (Number(lending.amount_paid) / Number(lending.amount)) * 100)) : 0

  return (
    <Card>
      <div className="mb-1 flex items-start justify-between">
        <div>
          <p className="font-medium">
            {lending.person_name}
            <span className="ml-2 text-xs font-normal uppercase tracking-wide text-[var(--ink-soft)]">
              {lending.direction === 'lent' ? 'you lent' : 'you borrowed'}
            </span>
          </p>
          <p className="text-xs text-[var(--ink-soft)]">
            {format(parseISO(lending.given_on), 'MMM d, yyyy')}
            {lending.remind_on && ` · ask by ${format(parseISO(lending.remind_on), 'MMM d')}`}
            {lending.transaction_id &&
              ` · ${lending.direction === 'lent' ? 'from' : 'into'} ${
                (lending.account_id && accountById.get(lending.account_id)?.name) || 'an account'
              }`}
          </p>
          {lending.note && <p className="mt-1 text-xs text-[var(--ink-soft)]">{lending.note}</p>}
          {lending.emi && (
            <p className="mt-1 text-xs font-medium text-[var(--ink)]">
              On EMI · ₹{Number(lending.emi.monthly_amount).toLocaleString('en-IN')}/mo ·{' '}
              {lending.emi.installments_paid}/{lending.emi.total_installments} charged
              {lending.emi.installments_paid < lending.emi.total_installments &&
                ` · next ${format(parseISO(lending.emi.next_due_date), 'MMM d')}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p
              className={`tabular-nums text-lg font-semibold ${
                lending.direction === 'lent' ? 'text-[var(--accent-ink)]' : 'text-[var(--danger)]'
              }`}
            >
              ₹{Number(lending.amount).toLocaleString('en-IN')}
            </p>
            {hasPayments && !lending.is_settled && (
              <p className="text-xs text-[var(--ink-soft)]">₹{outstanding.toLocaleString('en-IN')} left</p>
            )}
          </div>
          <button
            onClick={onEdit}
            className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
            aria-label="Edit lending"
          >
            <PencilIcon width={15} height={15} />
          </button>
        </div>
      </div>

      {hasPayments && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
        </div>
      )}

      {hasPayments && (
        <div className="mt-2 flex flex-col gap-1">
          {lending.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs text-[var(--ink-soft)]">
              <span>
                ₹{Number(p.amount).toLocaleString('en-IN')} · {format(parseISO(p.paid_on), 'MMM d')}
                {p.account_id && ` · via ${accountById.get(p.account_id)?.name ?? 'account'}`}
              </span>
              <button
                onClick={() => onDeletePayment(p.id)}
                className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
                aria-label="Remove payment"
              >
                <TrashIcon width={12} height={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!lending.is_settled && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => onPay('pay')}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
          >
            Record payment
          </button>
          <button
            onClick={() => onPay('settle')}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
          >
            {hasPayments ? 'Mark rest settled' : 'Mark settled'}
          </button>
          {canConvertToEmi && (
            <button
              onClick={() => onPay('emi')}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
            >
              Convert to EMI
            </button>
          )}
          {reminder && (
            <>
              <a
                href={reminder.whatsapp_link}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
              >
                Remind via WhatsApp
              </a>
              <a
                href={reminder.sms_link}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
              >
                Remind via SMS
              </a>
            </>
          )}
          <button onClick={onRemove} className="ml-auto text-xs text-[var(--ink-soft)] hover:text-[var(--danger)]">
            Delete
          </button>
        </div>
      )}
      {lending.is_settled && (
        <div className="mt-2 flex items-center justify-end gap-3">
          {outstanding > 0 && (
            // Settled with no money recorded against an account — let the balance catch up.
            <button onClick={() => onPay('pay')} className="text-xs text-[var(--accent-ink)] hover:underline">
              {lending.direction === 'lent' ? 'Add to the account it came into' : 'Add to the account it went from'}
            </button>
          )}
          <button onClick={onRemove} className="text-xs text-[var(--ink-soft)] hover:text-[var(--danger)]">
            Delete
          </button>
        </div>
      )}

      {payMode === 'emi' && sourceAccount && (
        <ConvertToEmiForm lending={lending} cardName={sourceAccount.name} onDone={onDonePaying} />
      )}
      {payMode && payMode !== 'emi' && (
        <RecordPaymentForm lending={lending} accounts={accounts} mode={payMode} onDone={onDonePaying} />
      )}
    </Card>
  )
}

function RecordPaymentForm({
  lending,
  accounts,
  mode,
  onDone,
}: {
  lending: Lending
  accounts: Account[]
  mode: Exclude<PayMode, 'emi'>
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const settling = mode === 'settle'
  // On EMI, a friend usually pays you back one installment at a time.
  const [amount, setAmount] = useState(
    lending.emi ? String(Math.min(Number(lending.emi.monthly_amount), Number(lending.outstanding))) : lending.outstanding,
  )
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  // Default back onto the account the money originally moved through — e.g. a
  // friend repaying a card spend usually means paying down that same card.
  const [accountId, setAccountId] = useState(lending.account_id ?? '')
  const [note, setNote] = useState('')

  const record = useMutation({
    mutationFn: async () =>
      settling
        ? (
            await api.post(`/finance/lendings/${lending.id}/settle`, {
              paid_on: paidOn,
              account_id: accountId || null,
              note: note || null,
            })
          ).data
        : (
            await api.post(`/finance/lendings/${lending.id}/payments`, {
              amount,
              paid_on: paidOn,
              account_id: accountId || null,
              note: note || null,
            })
          ).data,
    onSuccess: () => {
      // A payment can move an account's balance, not just this one lending record.
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      onDone()
    },
  })

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
      <p className="mb-2 text-xs font-medium text-[var(--ink-soft)]">
        {settling
          ? `Settling the remaining ₹${Number(lending.outstanding).toLocaleString('en-IN')}`
          : `${lending.direction === 'lent' ? 'How much did they pay back?' : 'How much did you pay back?'} (up to ₹${Number(
              lending.outstanding,
            ).toLocaleString('en-IN')})`}
      </p>
      <div className="flex flex-col gap-2">
        <div className={`grid gap-2 ${settling ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!settling && (
            <input
              type="number"
              inputMode="decimal"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          )}
          <input
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        {accounts.length > 0 && (
          <label className="text-xs font-medium text-[var(--ink-soft)]">
            {lending.direction === 'lent' ? 'Received into' : 'Paid from'} (optional — updates that account's
            balance)
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="">{settling ? 'No account — just mark it settled' : 'Just track it, no account'}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
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
            onClick={() => record.mutate()}
            disabled={(!settling && (!amount || Number(amount) <= 0)) || record.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {settling ? 'Settle' : 'Save'}
          </button>
          <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
            Cancel
          </button>
        </div>
        {record.isError && (
          <p className="text-xs text-[var(--danger)]">
            Couldn't save that — check the amount isn't more than what's outstanding.
          </p>
        )}
      </div>
    </div>
  )
}

function ConvertToEmiForm({ lending, cardName, onDone }: { lending: Lending; cardName: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [monthly, setMonthly] = useState('')
  const [months, setMonths] = useState('6')
  const [fee, setFee] = useState('')
  const [startDate, setStartDate] = useState('')
  const total = Number(monthly || 0) * Number(months || 0) + Number(fee || 0)

  const convert = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/finance/lendings/${lending.id}/convert-to-emi`, {
          monthly_amount: monthly,
          total_installments: Number(months),
          processing_fee: fee || 0,
          start_date: startDate || null,
        })
      ).data,
    onSuccess: () => {
      // Moves the card balance and adds an EMI, not just this lending.
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      onDone()
    },
  })

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
      <p className="mb-2 text-xs font-medium text-[var(--ink-soft)]">
        The bank takes ₹{Number(lending.amount).toLocaleString('en-IN')} off {cardName}'s bill and charges it monthly
        instead. Copy the numbers from the bank's EMI offer.
      </p>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-[var(--ink-soft)]">
            Monthly EMI
            <input
              type="number"
              inputMode="decimal"
              placeholder="e.g. 5300"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="text-xs font-medium text-[var(--ink-soft)]">
            Months
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="text-xs font-medium text-[var(--ink-soft)]">
            Processing fee
            <input
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="text-xs font-medium text-[var(--ink-soft)]">
            First EMI due
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>
        {total > 0 && (
          <p className="text-xs text-[var(--ink-soft)]">
            {lending.person_name} will owe ₹{total.toLocaleString('en-IN')} in total — ₹
            {Number(lending.amount).toLocaleString('en-IN')} plus ₹
            {Math.max(0, total - Number(lending.amount)).toLocaleString('en-IN')} interest and fee. You can lower it
            afterwards with the edit button if you're covering the interest.
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => convert.mutate()}
            disabled={!monthly || Number(monthly) <= 0 || !months || Number(months) < 1 || convert.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Convert
          </button>
          <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
            Cancel
          </button>
        </div>
        {convert.isError && (
          <p className="text-xs text-[var(--danger)]">Couldn't convert that — check the EMI amount and months.</p>
        )}
      </div>
    </div>
  )
}

function EditLendingForm({ lending, onDone }: { lending: Lending; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [personName, setPersonName] = useState(lending.person_name)
  const [phoneNumber, setPhoneNumber] = useState(lending.phone_number ?? '')
  const [amount, setAmount] = useState(lending.amount)
  const [givenOn, setGivenOn] = useState(lending.given_on)
  const [remindOn, setRemindOn] = useState(lending.remind_on ?? '')
  const [note, setNote] = useState(lending.note ?? '')

  const update = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/finance/lendings/${lending.id}`, {
          person_name: personName,
          phone_number: phoneNumber || null,
          amount,
          given_on: givenOn,
          remind_on: remindOn || null,
          note: note || null,
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
          placeholder="Friend's name"
          data-testid="edit-lending-name"
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <input
          placeholder="Phone number (optional)"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <label className="flex flex-col text-xs text-[var(--ink-soft)]">
            Date
            <input
              type="date"
              value={givenOn}
              onChange={(e) => setGivenOn(e.target.value)}
              className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>
        <label className="flex flex-col text-xs text-[var(--ink-soft)]">
          Remind me on
          <input
            type="date"
            value={remindOn}
            onChange={(e) => setRemindOn(e.target.value)}
            className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        {lending.transaction_id && !lending.emi && (
          <p className="text-xs text-[var(--ink-soft)]">
            This was logged from a card spend — changing the amount also corrects that transaction and the card
            balance.
          </p>
        )}
        {lending.emi && (
          <p className="text-xs text-[var(--ink-soft)]">
            This is on EMI — the amount is what your friend owes you in total. Changing it doesn't touch the card.
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => update.mutate()}
            disabled={!personName.trim() || !amount || update.isPending}
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

function rupees(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function PeopleSummary({
  selectedKey,
  onSelect,
}: {
  selectedKey: string | null
  onSelect: (person: LendingPerson | null) => void
}) {
  const { data: people } = useLendingPeople()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  if (!people || people.length === 0) return null

  const owedToYou = people.reduce((sum, p) => sum + Number(p.lent_outstanding), 0)
  const youOwe = people.reduce((sum, p) => sum + Number(p.borrowed_outstanding), 0)

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="font-medium">People</p>
        <p className="text-xs text-[var(--ink-soft)]">
          Owed to you <b className="text-[var(--accent-ink)]">{rupees(owedToYou)}</b>
          {youOwe > 0 && (
            <>
              {' '}
              · you owe <b className="text-[var(--danger)]">{rupees(youOwe)}</b>
            </>
          )}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--ink-soft)]">
            <th className="pb-1 font-medium">Name</th>
            <th className="pb-1 text-right font-medium">Times</th>
            <th className="pb-1 text-right font-medium">Lent</th>
            <th className="pb-1 text-right font-medium">Still owes</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const isSelected = selectedKey === p.key
            return (
              <PersonRow
                key={p.key}
                person={p}
                isSelected={isSelected}
                isEditing={editingKey === p.key}
                onSelect={() => onSelect(isSelected ? null : p)}
                onEdit={() => setEditingKey(editingKey === p.key ? null : p.key)}
                onDoneEditing={() => {
                  setEditingKey(null)
                  onSelect(null)
                }}
              />
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function PersonRow({
  person,
  isSelected,
  isEditing,
  onSelect,
  onEdit,
  onDoneEditing,
}: {
  person: LendingPerson
  isSelected: boolean
  isEditing: boolean
  onSelect: () => void
  onEdit: () => void
  onDoneEditing: () => void
}) {
  const queryClient = useQueryClient()
  const [friend, setFriend] = useState<Friend>({ name: person.person_name, phone: person.phone_number ?? '' })
  const owes = Number(person.lent_outstanding)
  const youOwe = Number(person.borrowed_outstanding)
  // One reminder for their whole remaining total — only once there's a number and something owed.
  const { data: reminder } = useQuery({
    queryKey: ['finance', 'lendings', 'people', person.key, 'reminder', person.lent_outstanding],
    queryFn: async () =>
      (await api.get<ReminderLinks>('/finance/lendings/people/reminder', { params: { key: person.key } })).data,
    enabled: isSelected && !!person.phone_number && owes > 0,
    retry: false,
  })

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put('/finance/lendings/people', {
          key: person.key,
          person_name: friend.name.trim(),
          phone_number: friend.phone || null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'lendings'] })
      onDoneEditing()
    },
  })

  return (
    <>
      <tr
        onClick={onSelect}
        className={`cursor-pointer border-t border-[var(--border)] ${isSelected ? 'bg-[var(--surface-2)]' : ''}`}
      >
        <td className="py-2 pr-2">
          <p className="font-medium">{person.person_name}</p>
          <p className="text-xs text-[var(--ink-soft)]">{person.phone_number ?? 'no number yet'}</p>
        </td>
        <td className="py-2 text-right tabular-nums">{person.times}</td>
        <td className="py-2 text-right tabular-nums">{rupees(Number(person.lent_total))}</td>
        <td className="py-2 text-right tabular-nums font-semibold">
          {owes > 0 ? <span className="text-[var(--accent-ink)]">{rupees(owes)}</span> : '—'}
          {youOwe > 0 && <p className="text-xs font-normal text-[var(--danger)]">you owe {rupees(youOwe)}</p>}
        </td>
      </tr>
      {isSelected && (
        <tr>
          <td colSpan={4} className="pb-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ink-soft)]">
              <span>
                Repaid {rupees(Number(person.lent_repaid))} of {rupees(Number(person.lent_total))}
                {person.open_count > 0 && ` · ${person.open_count} still open`}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
                className="font-medium text-[var(--accent-ink)]"
              >
                {person.phone_number ? 'Edit name / number' : 'Link contact'}
              </button>
            </div>
            {reminder && (
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={reminder.whatsapp_link}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  Remind {rupees(owes)} on WhatsApp
                </a>
                <a
                  href={reminder.sms_link}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
                >
                  SMS
                </a>
              </div>
            )}
            {isEditing && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
                <p className="text-xs text-[var(--ink-soft)]">
                  Updates all {person.times} of {person.person_name}'s lendings at once.
                </p>
                <FriendPicker value={friend} onChange={setFriend} fieldBg="bg-[var(--surface)]" />
                <div className="flex gap-2">
                  <button
                    onClick={() => save.mutate()}
                    disabled={!friend.name.trim() || save.isPending}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    Save for all
                  </button>
                  <button onClick={onEdit} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
                    Cancel
                  </button>
                </div>
                {save.isError && <p className="text-xs text-[var(--danger)]">Couldn't save — please try again.</p>}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function NewLendingForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const { data: accounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const [friend, setFriend] = useState<Friend>({ name: '', phone: '' })
  const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent')
  const [amount, setAmount] = useState('')
  const [remindOn, setRemindOn] = useState('')
  const [note, setNote] = useState('')
  const [accountId, setAccountId] = useState<string>('')

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/finance/lendings', {
          person_name: friend.name.trim(),
          phone_number: friend.phone || null,
          direction,
          amount,
          remind_on: remindOn || null,
          note: note || null,
          account_id: accountId || null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
      onDone()
    },
  })

  return (
    <Card className="mb-4">
      <div className="flex flex-col gap-3">
        <div className="flex rounded-lg border border-[var(--border)] p-0.5">
          {(['lent', 'borrowed'] as const).map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDirection(d)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                direction === d ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-soft)]'
              }`}
            >
              I {d} money
            </button>
          ))}
        </div>
        <FriendPicker value={friend} onChange={setFriend} />
        {!isContactPickerSupported() && (
          <p className="text-xs text-[var(--ink-soft)]">
            📇 imports a shared contact card — on iPhone: open the contact in Contacts, tap Share Contact → Save to
            Files, then pick that file here. You only need to do this once per friend; next time just start typing
            their name.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <label className="flex flex-col text-xs text-[var(--ink-soft)]">
            Remind me on
            <input
              type="date"
              value={remindOn}
              onChange={(e) => setRemindOn(e.target.value)}
              className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>
        {accounts && accounts.length > 0 && (
          <label className="text-xs font-medium text-[var(--ink-soft)]">
            {direction === 'lent' ? 'Paid from' : 'Received into'} (optional — updates that account's balance)
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
            >
              <option value="">Just track it, no account</option>
              {accounts.map((a) => (
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
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="flex gap-2">
          <button
            onClick={() => create.mutate()}
            disabled={!friend.name.trim() || !amount || create.isPending}
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
