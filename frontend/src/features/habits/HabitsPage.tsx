import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import type { Habit } from '../../types/api'
import { Card } from '../../components/Card'
import { PlusIcon } from '../../components/Icons'

export function HabitsPage() {
  const queryClient = useQueryClient()
  const { data: habits, isLoading } = useQuery({
    queryKey: ['habits'],
    queryFn: async () => (await api.get<Habit[]>('/habits')).data,
  })

  const toggle = useMutation({
    mutationFn: async (habitId: string) => (await api.post(`/habits/${habitId}/toggle`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })

  const [newName, setNewName] = useState('')
  const create = useMutation({
    mutationFn: async () => (await api.post('/habits', { name: newName })).data,
    onSuccess: () => {
      setNewName('')
      queryClient.invalidateQueries({ queryKey: ['habits'] })
    },
  })

  return (
    <div>
      <h1 className="mb-4 text-2xl">Habits</h1>

      <Card className="mb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (newName.trim()) create.mutate()
          }}
          className="flex gap-2"
        >
          <input
            placeholder="New habit, e.g. Read"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={!newName.trim() || create.isPending}
            className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <PlusIcon width={16} height={16} /> Add
          </button>
        </form>
      </Card>

      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      {!isLoading && habits?.length === 0 && (
        <Card className="text-center text-sm text-[var(--ink-soft)]">No habits yet — add your first one above.</Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {habits?.map((habit) => (
          <Card key={habit.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{habit.name}</p>
              <p className="text-xs text-[var(--ink-soft)]">
                {habit.current_streak > 0 ? `🔥 ${habit.current_streak}-day streak` : habit.cadence}
              </p>
            </div>
            <button
              onClick={() => toggle.mutate(habit.id)}
              className={`h-9 w-9 flex-none rounded-full border-2 text-sm font-semibold ${
                habit.completed_today
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-[var(--border)] text-[var(--ink-soft)]'
              }`}
            >
              {habit.completed_today ? '✓' : ''}
            </button>
          </Card>
        ))}
      </div>
    </div>
  )
}
