import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useRef, useState } from 'react'
import { Card } from '../../components/Card'
import { PencilIcon, PlusIcon, TrashIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import { isContactPickerSupported, parseVCard, pickContact } from '../../lib/contactPicker'
import type { Account, Lending, ReminderLinks } from '../../types/api'

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
  const [payingId, setPayingId] = useState<string | null>(null)

  const settle = useMutation({
    mutationFn: async (id: string) => (await api.post(`/finance/lendings/${id}/settle`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance', 'lendings'] }),
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

  const open = lendings?.filter((l) => !l.is_settled) ?? []
  const settled = lendings?.filter((l) => l.is_settled) ?? []

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
              isPaying={payingId === l.id}
              onTogglePay={() => setPayingId(payingId === l.id ? null : l.id)}
              onDonePaying={() => setPayingId(null)}
              onSettle={() => settle.mutate(l.id)}
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
                isPaying={false}
                onTogglePay={() => {}}
                onDonePaying={() => {}}
                onSettle={() => {}}
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

function LendingRow({
  lending,
  accounts,
  isPaying,
  onTogglePay,
  onDonePaying,
  onSettle,
  onEdit,
  onRemove,
  onDeletePayment,
}: {
  lending: Lending
  accounts: Account[]
  isPaying: boolean
  onTogglePay: () => void
  onDonePaying: () => void
  onSettle: () => void
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
            {lending.transaction_id && ' · from a card spend'}
          </p>
          {lending.note && <p className="mt-1 text-xs text-[var(--ink-soft)]">{lending.note}</p>}
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
            onClick={onTogglePay}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
          >
            Record payment
          </button>
          <button
            onClick={onSettle}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
          >
            {hasPayments ? 'Mark rest settled' : 'Mark settled'}
          </button>
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
        <div className="mt-2 flex justify-end">
          <button onClick={onRemove} className="text-xs text-[var(--ink-soft)] hover:text-[var(--danger)]">
            Delete
          </button>
        </div>
      )}

      {isPaying && (
        <RecordPaymentForm lending={lending} accounts={accounts} onDone={onDonePaying} />
      )}
    </Card>
  )
}

function RecordPaymentForm({
  lending,
  accounts,
  onDone,
}: {
  lending: Lending
  accounts: Account[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState(lending.outstanding)
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState('')
  const [note, setNote] = useState('')

  const record = useMutation({
    mutationFn: async () =>
      (
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
        {lending.direction === 'lent' ? 'How much did they pay back?' : 'How much did you pay back?'} (up to ₹
        {Number(lending.outstanding).toLocaleString('en-IN')})
      </p>
      <div className="flex flex-col gap-2">
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
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="flex gap-2">
          <button
            onClick={() => record.mutate()}
            disabled={!amount || Number(amount) <= 0 || record.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save
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
        {lending.transaction_id && (
          <p className="text-xs text-[var(--ink-soft)]">
            This was logged from a card spend — changing the amount also corrects that transaction and the card
            balance.
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

function NewLendingForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const { data: accounts } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: async () => (await api.get<Account[]>('/finance/accounts')).data,
  })
  const [personName, setPersonName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent')
  const [amount, setAmount] = useState('')
  const [remindOn, setRemindOn] = useState('')
  const [note, setNote] = useState('')
  const [accountId, setAccountId] = useState<string>('')

  const vcardInputRef = useRef<HTMLInputElement>(null)
  const [vcardError, setVcardError] = useState(false)

  async function handlePickContact() {
    const contact = await pickContact()
    if (contact) {
      if (contact.name) setPersonName(contact.name)
      if (contact.tel) setPhoneNumber(contact.tel)
    }
  }

  async function handleVCardFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return
    const contact = parseVCard(await file.text())
    setVcardError(!contact)
    if (contact) {
      if (contact.name) setPersonName(contact.name)
      if (contact.tel) setPhoneNumber(contact.tel)
    }
  }

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/finance/lendings', {
          person_name: personName,
          phone_number: phoneNumber || null,
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
        <input
          placeholder="Friend's name"
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="flex gap-2">
          <input
            placeholder="Phone number (for reminders, optional)"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          {isContactPickerSupported() ? (
            <button
              type="button"
              onClick={handlePickContact}
              title="Pick from Contacts"
              className="flex-none rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
            >
              📇
            </button>
          ) : (
            <>
              <input
                ref={vcardInputRef}
                type="file"
                accept=".vcf,text/vcard"
                onChange={handleVCardFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => vcardInputRef.current?.click()}
                title="Import from a shared contact (.vcf) — on iPhone: Contacts app → share the contact → Save to Files, then pick it here"
                className="flex-none rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
              >
                📇
              </button>
            </>
          )}
        </div>
        {vcardError && (
          <p className="text-xs text-[var(--danger)]">
            Couldn't read a name or number from that file — is it a contact's .vcf?
          </p>
        )}
        {!isContactPickerSupported() && (
          <p className="text-xs text-[var(--ink-soft)]">
            📇 imports a shared contact card — on iPhone: open the contact in Contacts, tap Share Contact → Save to
            Files, then pick that file here.
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
            disabled={!personName.trim() || !amount || create.isPending}
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
