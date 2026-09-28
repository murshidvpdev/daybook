import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { DownloadIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import type { DayReport, PeriodReport } from '../../types/api'

const today = () => new Date().toISOString().slice(0, 10)
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

async function downloadPdf(url: string, filename: string, onError: (failed: boolean) => void) {
  onError(false)
  try {
    const response = await api.get(url, { responseType: 'blob' })
    const objectUrl = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    onError(true)
  }
}

type Mode = 'day' | 'month' | 'all'

/** A diary-style look back at your data — a single day, a whole month you can
 * flip through, or everything at once — each downloadable as a handwritten-
 * style PDF. The card always shows a quick live preview first, using the same
 * data the PDF is built from, so picking a period gives feedback before
 * committing to a download. */
export function ReportsCard() {
  const [mode, setMode] = useState<Mode>('day')

  return (
    <Card className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">📔 Reports</p>
          <p className="text-xs text-[var(--ink-soft)]">Look back at any day, month, or everything at once.</p>
        </div>
      </div>

      <div className="mb-3 flex rounded-lg border border-[var(--border)] p-0.5">
        {(['day', 'month', 'all'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
              mode === m ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-soft)]'
            }`}
          >
            {m === 'all' ? 'All time' : m}
          </button>
        ))}
      </div>

      {mode === 'day' && <DayReport />}
      {mode === 'month' && <MonthReport />}
      {mode === 'all' && <AllTimeReport />}
    </Card>
  )
}

function DayReport() {
  const [selectedDate, setSelectedDate] = useState(today)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  const { data: report, isFetching } = useQuery({
    queryKey: ['reports', 'day', selectedDate],
    queryFn: async () => (await api.get<DayReport>(`/reports/day/${selectedDate}`)).data,
  })

  const highlights = report
    ? [
        report.routine_items_total > 0 && `${report.routine_items_done.length}/${report.routine_items_total} routine`,
        report.habits_total > 0 && `${report.habits_done.length}/${report.habits_total} habits`,
        Number(report.total_spent) > 0 && `₹${Number(report.total_spent).toFixed(0)} spent`,
        report.workouts.length > 0 && 'workout logged',
      ].filter(Boolean)
    : []

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="date"
          max={today()}
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={async () => {
            setDownloading(true)
            await downloadPdf(`/reports/day/${selectedDate}/pdf`, `daybook-${selectedDate}.pdf`, setDownloadError)
            setDownloading(false)
          }}
          disabled={downloading}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <DownloadIcon width={15} height={15} />
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>

      {downloadError && (
        <p className="mt-2 text-xs text-[var(--danger)]">Couldn't generate that PDF — please try again.</p>
      )}

      <div className="mt-3 min-h-5 text-xs text-[var(--ink-soft)]">
        {isFetching && 'Loading…'}
        {!isFetching && report && highlights.length > 0 && (
          <p>
            {format(parseISO(selectedDate), 'EEEE, MMM d')} — {highlights.join(' · ')}
          </p>
        )}
        {!isFetching && report && highlights.length === 0 && (
          <p>Nothing logged on {format(parseISO(selectedDate), 'MMM d')} — the PDF will say so too.</p>
        )}
      </div>
    </div>
  )
}

function MonthReport() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  const { data: report, isFetching } = useQuery({
    queryKey: ['reports', 'month', year, month],
    queryFn: async () => (await api.get<PeriodReport>(`/reports/month/${year}/${month}`)).data,
  })

  function shiftMonth(delta: number) {
    let newMonth = month + delta
    let newYear = year
    if (newMonth > 12) {
      newMonth = 1
      newYear += 1
    } else if (newMonth < 1) {
      newMonth = 12
      newYear -= 1
    }
    setMonth(newMonth)
    setYear(newYear)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm hover:bg-[var(--surface-2)]"
          >
            ←
          </button>
          <span className="min-w-32 text-center text-sm font-medium">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm hover:bg-[var(--surface-2)]"
          >
            →
          </button>
        </div>
        <button
          onClick={async () => {
            setDownloading(true)
            await downloadPdf(
              `/reports/month/${year}/${month}/pdf`,
              `daybook-${year}-${String(month).padStart(2, '0')}.pdf`,
              setDownloadError,
            )
            setDownloading(false)
          }}
          disabled={downloading}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <DownloadIcon width={15} height={15} />
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>

      {downloadError && (
        <p className="mt-2 text-xs text-[var(--danger)]">Couldn't generate that PDF — please try again.</p>
      )}

      <div className="mt-3 text-xs text-[var(--ink-soft)]">
        {isFetching && 'Loading…'}
        {!isFetching && report && <PeriodSummary report={report} />}
      </div>
    </div>
  )
}

function AllTimeReport() {
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  const { data: report, isFetching } = useQuery({
    queryKey: ['reports', 'all'],
    queryFn: async () => (await api.get<PeriodReport>('/reports/all')).data,
  })

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Everything, since the beginning</p>
        <button
          onClick={async () => {
            setDownloading(true)
            await downloadPdf('/reports/all/pdf', 'daybook-all-time.pdf', setDownloadError)
            setDownloading(false)
          }}
          disabled={downloading}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <DownloadIcon width={15} height={15} />
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>

      {downloadError && (
        <p className="mt-2 text-xs text-[var(--danger)]">Couldn't generate that PDF — please try again.</p>
      )}

      <div className="mt-3 text-xs text-[var(--ink-soft)]">
        {isFetching && 'Loading…'}
        {!isFetching && report && <PeriodSummary report={report} />}
      </div>
    </div>
  )
}

function PeriodSummary({ report }: { report: PeriodReport }) {
  const bits = [
    report.routine_completions > 0 && `${report.routine_completions} routine items`,
    report.habits_completed > 0 && `${report.habits_completed} habits`,
    report.transactions_count > 0 && `₹${Number(report.total_spent).toFixed(0)} spent`,
    report.workouts_count > 0 && `${report.workouts_count} workouts`,
  ].filter(Boolean)

  if (bits.length === 0) {
    return <p>Nothing logged in this period yet — the PDF will say so too.</p>
  }
  return <p>{bits.join(' · ')}</p>
}
