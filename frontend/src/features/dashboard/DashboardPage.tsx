import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { api } from '../../lib/api'
import type { TodaySummary } from '../../types/api'
import { StatCard } from '../../components/Card'
import { useAuth } from '../../auth/AuthContext'
import { EmiDueBanner } from '../finance/EmiDueBanner'

export function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: async () => (await api.get<TodaySummary>('/dashboard/today')).data,
  })

  const greetingName = user?.display_name || user?.email.split('@')[0]

  return (
    <div>
      <p className="text-sm text-[var(--ink-soft)]">{format(new Date(), 'EEEE, MMMM d')}</p>
      <h1 className="mb-4 text-2xl">Good day, {greetingName}</h1>

      <EmiDueBanner />

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--surface-2)]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Routine" value={`${data.routines.completed}/${data.routines.total}`} />
            <StatCard label="Habits" value={`${data.habits.completed}/${data.habits.total}`} />
            <StatCard
              label="Spent today"
              value={`₹${data.finance.spent_today.toFixed(0)}`}
              sub={data.finance.currency}
            />
            <StatCard
              label="Fitness"
              value={data.fitness.logged_today ? 'Logged' : 'Not yet'}
              sub={data.fitness.last_workout_on ? `Last: ${data.fitness.last_workout_on}` : 'No sessions yet'}
            />
          </div>
          <FocusNote data={data} />
        </>
      )}
    </div>
  )
}

/** Deterministic, not AI-generated — a plain-English read of the numbers above,
 * exactly the kind of thing that will later graduate into an AI briefing once
 * there's enough history to interpret rather than just restate. */
function FocusNote({ data }: { data: TodaySummary }) {
  const notes: string[] = []
  if (data.routines.total > 0 && data.routines.completed < data.routines.total) {
    notes.push(`${data.routines.total - data.routines.completed} routine item(s) left today.`)
  }
  if (data.habits.total > 0 && data.habits.completed === data.habits.total) {
    notes.push('All habits done for today.')
  }
  if (!data.fitness.logged_today) {
    notes.push('No workout logged yet today.')
  }
  if (notes.length === 0) return null

  return (
    <div className="mt-4 rounded-xl border-l-4 border-[var(--accent)] bg-[var(--accent-soft)] p-4 text-sm">
      {notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </div>
  )
}
