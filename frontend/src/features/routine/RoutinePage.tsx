import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import type { Routine } from '../../types/api'
import { Card } from '../../components/Card'
import { PlusIcon } from '../../components/Icons'

export function RoutinePage() {
  const queryClient = useQueryClient()
  const { data: routines, isLoading } = useQuery({
    queryKey: ['routines'],
    queryFn: async () => (await api.get<Routine[]>('/routines')).data,
  })

  const toggle = useMutation({
    mutationFn: async ({ routineId, itemId }: { routineId: string; itemId: string }) =>
      (await api.post(`/routines/${routineId}/items/${itemId}/toggle`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })

  const [showNew, setShowNew] = useState(false)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl">Routine</h1>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
        >
          <PlusIcon width={16} height={16} /> New
        </button>
      </div>

      {showNew && <NewRoutineForm onDone={() => setShowNew(false)} />}

      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && routines?.length === 0 && !showNew && (
        <Card className="text-center text-sm text-[var(--ink-soft)]">
          No routines yet. A morning or evening checklist is a good place to start.
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {routines?.map((routine) => (
          <Card key={routine.id}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold">{routine.name}</h2>
              <span className="text-xs uppercase tracking-wide text-[var(--ink-soft)]">{routine.time_of_day}</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {routine.items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => toggle.mutate({ routineId: routine.id, itemId: item.id })}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[var(--surface-2)]"
                  >
                    <span
                      className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 text-[10px] ${
                        item.completed_today
                          ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                          : 'border-[var(--border)]'
                      }`}
                    >
                      {item.completed_today ? '✓' : ''}
                    </span>
                    <span className={item.completed_today ? 'text-[var(--ink-soft)] line-through' : ''}>
                      {item.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  )
}

function NewRoutineForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [timeOfDay, setTimeOfDay] = useState('morning')
  const [items, setItems] = useState(['', ''])

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/routines', {
          name,
          time_of_day: timeOfDay,
          items: items.filter((t) => t.trim()).map((title, i) => ({ title, sort_order: i })),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      onDone()
    },
  })

  return (
    <Card className="mb-4">
      <div className="flex flex-col gap-3">
        <input
          placeholder="Routine name (e.g. Morning routine)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <select
          value={timeOfDay}
          onChange={(e) => setTimeOfDay(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
        >
          <option value="morning">Morning</option>
          <option value="evening">Evening</option>
          <option value="anytime">Anytime</option>
        </select>
        {items.map((val, i) => (
          <input
            key={i}
            placeholder={`Item ${i + 1}`}
            value={val}
            onChange={(e) => setItems(items.map((v, idx) => (idx === i ? e.target.value : v)))}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, ''])}
          className="self-start text-xs font-medium text-[var(--accent-ink)]"
        >
          + Add another item
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
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
