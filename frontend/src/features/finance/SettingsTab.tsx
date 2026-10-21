import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { api } from '../../lib/api'
import type { CaptureKeyStatus } from '../../types/api'

export function SettingsTab() {
  return (
    <div className="flex flex-col gap-4">
      <SmsTrackingCard />
      <StartFreshCard />
    </div>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--ink-soft)]">{label}</p>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
          {value}
        </code>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              // Clipboard can be blocked; the value is still selectable above.
            }
          }}
          className="flex-none rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-2)]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function SmsTrackingCard() {
  const queryClient = useQueryClient()
  const { data: status } = useQuery({
    queryKey: ['capture', 'key'],
    queryFn: async () => (await api.get<CaptureKeyStatus>('/capture/key')).data,
  })
  const [newKey, setNewKey] = useState<string | null>(null)
  const captureUrl = `${window.location.origin}/api/v1/capture/sms`

  const create = useMutation({
    mutationFn: async () => (await api.post<{ key: string }>('/capture/key')).data,
    onSuccess: (data) => {
      setNewKey(data.key)
      queryClient.invalidateQueries({ queryKey: ['capture'] })
    },
  })
  const turnOff = useMutation({
    mutationFn: async () => api.delete('/capture/key'),
    onSuccess: () => {
      setNewKey(null)
      queryClient.invalidateQueries({ queryKey: ['capture'] })
    },
  })

  return (
    <Card>
      <p className="font-medium">SMS tracking</p>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        Your phone forwards each bank SMS (Paytm/UPI payments, card spends, money received) to Daybook. Nothing is
        booked on its own — each one waits under "SMS to review" at the top of Finance for you to confirm. Add the last
        4 digits to your bank accounts and cards so each SMS lands on the right one.
      </p>

      {status && (
        <p className="mt-2 text-xs font-medium">
          {status.enabled
            ? `On · ${
                status.last_used_at
                  ? `last SMS ${format(parseISO(status.last_used_at), 'MMM d, h:mm a')}`
                  : 'no SMS received yet'
              }`
            : 'Off'}
        </p>
      )}

      {newKey && (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
          <p className="text-xs font-medium text-[var(--danger)]">
            Copy the key now — for your safety it's only shown this once.
          </p>
          <CopyField label="URL" value={captureUrl} />
          <CopyField label="Key (header X-Daybook-Key)" value={newKey} />
          <div className="text-xs text-[var(--ink-soft)]">
            <p className="mb-1 font-semibold text-[var(--ink)]">iPhone (Shortcuts app)</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Automation → + → Message.</li>
              <li>
                Message Contains: <b>debited</b>. Choose <b>Run Immediately</b> and turn off "Notify When Run".
              </li>
              <li>
                Add action <b>Get Contents of URL</b>: paste the URL, Method <b>POST</b>, add header{' '}
                <b>X-Daybook-Key</b> = the key, Request Body <b>JSON</b> with field <b>text</b> = Shortcut Input →
                Message → <b>Content</b>.
              </li>
              <li>
                Repeat for <b>spent</b>, <b>credited</b>, <b>received</b> and <b>used at</b> — between them these
                catch Axis, ICICI, Federal and HSBC messages. An SMS caught by two of them is only counted once.
              </li>
            </ol>
            <p className="mb-1 mt-3 font-semibold text-[var(--ink)]">Android</p>
            <p>
              In an SMS forwarding app (e.g. SMS Forwarder or MacroDroid), forward bank SMS as a webhook: POST to the
              URL, header X-Daybook-Key = the key, JSON body {'{"text": "<the SMS text>"}'}.
            </p>
          </div>
          <button onClick={() => setNewKey(null)} className="self-start text-xs text-[var(--ink-soft)]">
            I've copied it — hide
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => {
            if (!status?.enabled || confirm('Make a new key? The old one stops working until you update your phone.')) {
              create.mutate()
            }
          }}
          disabled={create.isPending}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {status?.enabled ? 'Make a new key' : 'Turn on SMS tracking'}
        </button>
        {status?.enabled && (
          <button
            onClick={() => {
              if (confirm('Turn off SMS tracking? Your phone will stop being able to send SMS.')) turnOff.mutate()
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
          >
            Turn off
          </button>
        )}
      </div>
    </Card>
  )
}

function StartFreshCard() {
  const queryClient = useQueryClient()
  const [downloaded, setDownloaded] = useState(false)
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(false)

  const download = useMutation({
    mutationFn: async () => (await api.get('/finance/backup')).data,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `daybook-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setDownloaded(true)
    },
  })
  const startFresh = useMutation({
    mutationFn: async () => api.post('/finance/start-fresh', { confirm: 'START FRESH' }),
    onSuccess: () => {
      setDone(true)
      setTyped('')
      queryClient.invalidateQueries()
    },
  })

  return (
    <Card>
      <p className="font-medium">Start fresh</p>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        For when the numbers have drifted too far to fix. Removes your accounts, cards, transactions, bills, EMIs and
        SIPs, so you can re-add today's real balances. <b>Lendings are kept</b> — who owes you what, with every
        repayment. Only your own data is touched.
      </p>

      {done ? (
        <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs font-medium">
          Done. Now add your bank accounts (Accounts tab) with today's balance, and your cards (Credit Cards tab) with
          the total outstanding from your card app.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={() => download.mutate()}
            disabled={download.isPending}
            className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
          >
            1. {downloaded ? 'Backup downloaded ✓ — download again' : 'Download backup (JSON)'}
          </button>
          {download.isError && <p className="text-xs text-[var(--danger)]">Couldn't create the backup — try again.</p>}
          <label className="text-xs font-medium text-[var(--ink-soft)]">
            2. Type START FRESH to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={!downloaded}
              placeholder={downloaded ? 'START FRESH' : 'Download the backup first'}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-60"
            />
          </label>
          <button
            onClick={() => startFresh.mutate()}
            disabled={!downloaded || typed !== 'START FRESH' || startFresh.isPending}
            className="self-start rounded-lg bg-[var(--danger)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            3. Start fresh
          </button>
          {startFresh.isError && <p className="text-xs text-[var(--danger)]">Nothing was removed — please try again.</p>}
        </div>
      )}
    </Card>
  )
}
