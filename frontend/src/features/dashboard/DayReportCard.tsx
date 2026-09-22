import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Card } from '../../components/Card'
import { DownloadIcon } from '../../components/Icons'
import { api } from '../../lib/api'
import type { DayReport } from '../../types/api'

const today = () => new Date().toISOString().slice(0, 10)

/** A diary-style look back at any single day — downloads a handwritten-style
 * PDF of everything logged that day. The card shows a quick live preview
 * (same data the PDF is built from, via /reports/day/{date}) so picking a
 * date gives some feedback before committing to a download. */
export function DayReportCard() {
  const [selectedDate, setSelectedDate] = useState(today)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  const { data: report, isFetching } = useQuery({
    queryKey: ['reports', 'day', selectedDate],
    queryFn: async () => (await api.get<DayReport>(`/reports/day/${selectedDate}`)).data,
  })

  async function handleDownload() {
    setDownloading(true)
    setDownloadError(false)
    try {
      const response = await api.get(`/reports/day/${selectedDate}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `daybook-${selectedDate}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  const highlights = report
    ? [
        report.routine_items_total > 0 && `${report.routine_items_done.length}/${report.routine_items_total} routine`,
        report.habits_total > 0 && `${report.habits_done.length}/${report.habits_total} habits`,
        Number(report.total_spent) > 0 && `₹${Number(report.total_spent).toFixed(0)} spent`,
        report.workouts.length > 0 && 'workout logged',
      ].filter(Boolean)
    : []

  return (
    <Card className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">📔 Day report</p>
          <p className="text-xs text-[var(--ink-soft)]">Look back at any day, as a diary page you can keep.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="date"
          max={today()}
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={handleDownload}
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
    </Card>
  )
}
