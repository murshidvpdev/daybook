import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import type { Routine } from '../../types/api'
import { Card } from '../../components/Card'
import { PencilIcon, PlusIcon, TrashIcon } from '../../components/Icons'

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
  const deleteRoutine = useMutation({
    mutationFn: async (routineId: string) => api.delete(`/routines/${routineId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routines'] }),
  })
  const deleteItem = useMutation({
    mutationFn: async ({ routineId, itemId }: { routineId: string; itemId: string }) =>
      (await api.delete(`/routines/${routineId}/items/${itemId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routines'] }),
  })

  const [showNew, setShowNew] = useState(false)
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null)
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<{ routineId: string; itemId: string } | null>(null)

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
        {routines?.map((routine) => {
          if (editingRoutineId === routine.id) {
            return (
              <EditRoutineForm key={routine.id} routine={routine} onDone={() => setEditingRoutineId(null)} />
            )
          }
          return (
            <Card key={routine.id}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold">{routine.name}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-[var(--ink-soft)]">
                    {routine.time_of_day}
                  </span>
                  <button
                    onClick={() => setEditingRoutineId(routine.id)}
                    className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                    aria-label="Edit routine"
                  >
                    <PencilIcon width={15} height={15} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${routine.name}"? This removes all its items and history.`)) {
                        deleteRoutine.mutate(routine.id)
                      }
                    }}
                    className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
                    aria-label="Delete routine"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                </div>
              </div>
              <ul className="flex flex-col gap-1.5">
                {routine.items.map((item) =>
                  editingItem?.routineId === routine.id && editingItem?.itemId === item.id ? (
                    <li key={item.id}>
                      <EditItemForm
                        routineId={routine.id}
                        itemId={item.id}
                        title={item.title}
                        onDone={() => setEditingItem(null)}
                      />
                    </li>
                  ) : (
                    <li key={item.id} className="group flex items-center gap-1">
                      <button
                        onClick={() => toggle.mutate({ routineId: routine.id, itemId: item.id })}
                        className="flex flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[var(--surface-2)]"
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
                      <button
                        onClick={() => setEditingItem({ routineId: routine.id, itemId: item.id })}
                        className="flex-none text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                        aria-label="Edit item"
                      >
                        <PencilIcon width={14} height={14} />
                      </button>
                      <button
                        onClick={() => deleteItem.mutate({ routineId: routine.id, itemId: item.id })}
                        className="flex-none text-[var(--ink-soft)] hover:text-[var(--danger)]"
                        aria-label="Delete item"
                      >
                        <TrashIcon width={14} height={14} />
                      </button>
                    </li>
                  ),
                )}
              </ul>

              {addingItemFor === routine.id ? (
                <AddItemForm routineId={routine.id} onDone={() => setAddingItemFor(null)} />
              ) : (
                <button
                  onClick={() => setAddingItemFor(routine.id)}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-[var(--accent-ink)]"
                >
                  <PlusIcon width={13} height={13} /> Add item
                </button>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function EditRoutineForm({ routine, onDone }: { routine: Routine; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(routine.name)
  const [timeOfDay, setTimeOfDay] = useState(routine.time_of_day)

  const update = useMutation({
    mutationFn: async () => (await api.patch(`/routines/${routine.id}`, { name, time_of_day: timeOfDay })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      onDone()
    },
  })

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <input
          data-testid="edit-routine-name"
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
        {update.isError && (
          <p className="text-xs text-[var(--danger)]">Couldn't save those changes — please try again.</p>
        )}
      </div>
    </Card>
  )
}

function EditItemForm({
  routineId,
  itemId,
  title,
  onDone,
}: {
  routineId: string
  itemId: string
  title: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(title)

  const update = useMutation({
    mutationFn: async () => (await api.patch(`/routines/${routineId}/items/${itemId}`, { title: value })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      onDone()
    },
  })

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <input
        autoFocus
        data-testid="edit-item-title"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) update.mutate()
          if (e.key === 'Escape') onDone()
        }}
        className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
      />
      <button
        onClick={() => value.trim() && update.mutate()}
        disabled={!value.trim() || update.isPending}
        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      >
        Save
      </button>
      <button onClick={onDone} className="text-xs text-[var(--ink-soft)]">
        Cancel
      </button>
    </div>
  )
}

function AddItemForm({ routineId, onDone }: { routineId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: async () => (await api.post(`/routines/${routineId}/items`, { title })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      onDone()
    },
  })

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        autoFocus
        placeholder="New item"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && title.trim()) create.mutate()
          if (e.key === 'Escape') onDone()
        }}
        className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
      />
      <button
        onClick={() => title.trim() && create.mutate()}
        disabled={!title.trim() || create.isPending}
        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      >
        Add
      </button>
      <button onClick={onDone} className="text-xs text-[var(--ink-soft)]">
        Cancel
      </button>
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
