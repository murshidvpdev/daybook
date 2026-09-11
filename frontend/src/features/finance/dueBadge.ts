import { differenceInCalendarDays, format, parseISO } from 'date-fns'

export function dueBadge(nextDueDate: string): { text: string; tone: string } {
  const days = differenceInCalendarDays(parseISO(nextDueDate), new Date())
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: 'text-[var(--danger)]' }
  if (days === 0) return { text: 'Due today', tone: 'text-[var(--danger)]' }
  if (days <= 5) return { text: `Due in ${days}d`, tone: 'text-[var(--accent-ink)]' }
  return { text: `Due ${format(parseISO(nextDueDate), 'MMM d')}`, tone: 'text-[var(--ink-soft)]' }
}
