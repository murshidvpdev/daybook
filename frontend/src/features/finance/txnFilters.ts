import { endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns'

export type DatePreset = 'all' | 'today' | '7d' | 'month' | 'last-month' | 'custom'

export type TxnFilters = {
  search: string
  preset: DatePreset
  /** yyyy-MM-dd, only used when preset is "custom". */
  start: string
  end: string
  kind: '' | 'expense' | 'income'
  /** '' = any category, UNCATEGORIZED = only uncategorized, else a category id. */
  categoryId: string
  accountId: string
}

export const UNCATEGORIZED = '__none__'

export const EMPTY_FILTERS: TxnFilters = {
  search: '',
  preset: 'all',
  start: '',
  end: '',
  kind: '',
  categoryId: '',
  accountId: '',
}

export const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
]

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

function dateRange(f: TxnFilters): { start?: string; end?: string } {
  const today = new Date()
  switch (f.preset) {
    case 'today':
      return { start: ymd(today), end: ymd(today) }
    case '7d':
      return { start: ymd(subDays(today, 6)), end: ymd(today) }
    case 'month':
      return { start: ymd(startOfMonth(today)), end: ymd(today) }
    case 'last-month': {
      const last = subMonths(today, 1)
      return { start: ymd(startOfMonth(last)), end: ymd(endOfMonth(last)) }
    }
    case 'custom':
      return { start: f.start || undefined, end: f.end || undefined }
    default:
      return {}
  }
}

/** The non-search filters that are narrowing the list — search is shown in its
 * own box, so it isn't counted on the "Filters" badge. */
export function activeFilterCount(f: TxnFilters): number {
  const { start, end } = dateRange(f)
  return [start || end, f.kind, f.categoryId, f.accountId].filter(Boolean).length
}

/** Query-string params for GET /finance/transactions, or null when nothing is
 * filtering (so the plain feed keeps its own cache entry and optimistic updates). */
export function filtersToParams(f: TxnFilters, limit: number): Record<string, string> | null {
  const params: Record<string, string> = {}
  const { start, end } = dateRange(f)
  if (start) params.start = start
  if (end) params.end = end
  if (f.kind) params.kind = f.kind
  if (f.categoryId === UNCATEGORIZED) params.uncategorized = 'true'
  else if (f.categoryId) params.category_id = f.categoryId
  if (f.accountId) params.account_id = f.accountId
  if (f.search.trim()) params.q = f.search.trim()
  if (Object.keys(params).length === 0) return null
  params.limit = String(limit)
  return params
}
