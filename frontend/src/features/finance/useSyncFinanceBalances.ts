import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * Fetching transactions, SIPs, or credit cards can silently post a backdated
 * SIP transaction as a side effect on the backend (see sync_due_sips) — the
 * account it hits changes balance without any mutation ever running, so
 * React Query has no reason to refetch the accounts or summary totals. That's
 * what made "Total balance" occasionally look stale until something else
 * happened to refresh it. Call this with one of those queries' `dataUpdatedAt`
 * to keep balances honest every time such a fetch lands.
 */
export function useSyncFinanceBalances(dataUpdatedAt: number) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (dataUpdatedAt === 0) return
    queryClient.invalidateQueries({ queryKey: ['finance', 'accounts'] })
    queryClient.invalidateQueries({ queryKey: ['finance', 'analytics', 'summary'] })
  }, [dataUpdatedAt, queryClient])
}
