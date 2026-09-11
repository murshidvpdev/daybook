import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { api } from '../../lib/api'
import type { Emi } from '../../types/api'

/** Surfaces on the Today dashboard the moment an EMI installment is due, so
 * "did you pay it" is asked right when you'd naturally open the app — not
 * buried in the EMIs tab where you'd have to go looking for it. */
export function EmiDueBanner() {
  const queryClient = useQueryClient()
  const { data: emis } = useQuery({
    queryKey: ['finance', 'emis'],
    queryFn: async () => (await api.get<Emi[]>('/finance/emis')).data,
  })
  const confirmPayment = useMutation({
    mutationFn: async (id: string) => (await api.post(`/finance/emis/${id}/confirm-payment`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })

  const due = emis?.filter((e) => e.is_due) ?? []
  if (due.length === 0) return null

  return (
    <div className="mb-4 flex flex-col gap-2">
      {due.map((emi) => (
        <div
          key={emi.id}
          className="flex items-center justify-between rounded-xl border-l-4 border-[var(--amber)] bg-[var(--amber-soft)] px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium">
              {emi.name} — ₹{Number(emi.monthly_amount).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-[var(--ink-soft)]">
              Due {format(parseISO(emi.next_due_date), 'MMM d')} — have you paid this?
            </p>
          </div>
          <button
            onClick={() => confirmPayment.mutate(emi.id)}
            disabled={confirmPayment.isPending}
            className="flex-none rounded-lg bg-[var(--amber)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            Yes, paid
          </button>
        </div>
      ))}
    </div>
  )
}
