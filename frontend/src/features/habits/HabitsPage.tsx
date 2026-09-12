import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import type { Habit } from '../../types/api'
import { Card } from '../../components/Card'
import { PencilIcon, PlusIcon, TrashIcon } from '../../components/Icons'

export function HabitsPage() {
  const queryClient = useQueryClient()
  const [showArchived, setShowArchived] = useState(false)
  const { data: habits, isLoading } = useQuery({
    queryKey: ['habits', { showArchived }],
    queryFn: async () =>
      (await api.get<Habit[]>('/habits', { params: { include_archived: showArchived } })).data,
  })

  const toggle = useMutation({
    mutationFn: async (habitId: string) => (await api.post(`/habits/${habitId}/toggle`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })
  const archive = useMutation({
    mutationFn: async (habitId: string) => api.delete(`/habits/${habitId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habits'] }),
  })
  const unarchive = useMutation({
    mutationFn: async (habitId: string) => (await api.patch(`/habits/${habitId}`, { is_archived: false })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habits'] }),
  })

  const [newName, setNewName] = useState('')
  const create = useMutation({
    mutationFn: async () => (await api.post('/habits', { name: newName })).data,
    onSuccess: () => {
      setNewName('')
      queryClient.invalidateQueries({ queryKey: ['habits'] })
    },
  })

  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl">Habits</h1>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="text-xs font-medium text-[var(--accent-ink)]"
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

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
        {habits?.map((habit) =>
          editingId === habit.id ? (
            <EditHabitForm key={habit.id} habit={habit} onDone={() => setEditingId(null)} />
          ) : (
            <Card key={habit.id} className={`flex items-center justify-between ${habit.is_archived ? 'opacity-60' : ''}`}>
              <div>
                <p className="font-medium">{habit.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {habit.is_archived
                    ? 'archived'
                    : habit.current_streak > 0
                      ? `🔥 ${habit.current_streak}-day streak`
                      : habit.cadence}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {habit.is_archived ? (
                  <button
                    onClick={() => unarchive.mutate(habit.id)}
                    className="text-xs font-medium text-[var(--accent-ink)]"
                  >
                    Unarchive
                  </button>
                ) : (
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
                )}
                <button
                  onClick={() => setEditingId(habit.id)}
                  className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                  aria-label="Edit habit"
                >
                  <PencilIcon width={15} height={15} />
                </button>
                {!habit.is_archived && (
                  <button
                    onClick={() => archive.mutate(habit.id)}
                    className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
                    aria-label="Archive habit"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                )}
              </div>
            </Card>
          ),
        )}
      </div>
    </div>
  )
}

function EditHabitForm({ habit, onDone }: { habit: Habit; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(habit.name)
  const [cadence, setCadence] = useState(habit.cadence)

  const update = useMutation({
    mutationFn: async () => (await api.patch(`/habits/${habit.id}`, { name, cadence })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] })
      onDone()
    },
  })

  return (
    <Card className="flex flex-col gap-2">
      <input
        data-testid="edit-habit-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      />
      <select
        value={cadence}
        onChange={(e) => setCadence(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </select>
      <div className="flex gap-2">
        <button
          onClick={() => update.mutate()}
          disabled={!name.trim() || update.isPending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Save
        </button>
        <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-soft)]">
          Cancel
        </button>
      </div>
      {update.isError && <p className="text-xs text-[var(--danger)]">Couldn't save those changes — please try again.</p>}
    </Card>
  )
}
