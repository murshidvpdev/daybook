import { differenceInCalendarDays, parseISO } from 'date-fns'

// After this many days without a check, the Finance page nudges you to check again.
export const CHECK_EVERY_DAYS = 7

export function checkedLabel(lastCheckedOn: string | null) {
  if (!lastCheckedOn) return 'never checked'
  const days = differenceInCalendarDays(new Date(), parseISO(lastCheckedOn))
  if (days <= 0) return 'checked today'
  if (days === 1) return 'checked yesterday'
  return `checked ${days} days ago`
}
