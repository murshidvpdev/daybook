import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import type { Exercise, WorkoutSession } from '../../types/api'
import { Card } from '../../components/Card'

export function FitnessPage() {
  const queryClient = useQueryClient()
  const { data: exercises } = useQuery({
    queryKey: ['fitness', 'exercises'],
    queryFn: async () => (await api.get<Exercise[]>('/fitness/exercises')).data,
  })
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['fitness', 'sessions'],
    queryFn: async () => (await api.get<WorkoutSession[]>('/fitness/sessions')).data,
  })

  const [sessionName, setSessionName] = useState('Workout')
  const startSession = useMutation({
    mutationFn: async () => (await api.post('/fitness/sessions', { name: sessionName })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fitness', 'sessions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })

  const [newExercise, setNewExercise] = useState('')
  const addExercise = useMutation({
    mutationFn: async () => (await api.post('/fitness/exercises', { name: newExercise })).data,
    onSuccess: () => {
      setNewExercise('')
      queryClient.invalidateQueries({ queryKey: ['fitness', 'exercises'] })
    },
  })

  return (
    <div>
      <h1 className="mb-4 text-2xl">Fitness</h1>

      <Card className="mb-4">
        <p className="mb-2 text-sm font-semibold">Start a session</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            startSession.mutate()
          }}
          className="flex gap-2"
        >
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={startSession.isPending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Start
          </button>
        </form>
      </Card>

      {(!exercises || exercises.length === 0) && (
        <Card className="mb-4">
          <p className="mb-2 text-sm font-semibold">Add an exercise to your catalog</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (newExercise.trim()) addExercise.mutate()
            }}
            className="flex gap-2"
          >
            <input
              placeholder="e.g. Bench Press"
              value={newExercise}
              onChange={(e) => setNewExercise(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
              Add
            </button>
          </form>
        </Card>
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Recent sessions</h2>
      {isLoading && <p className="text-sm text-[var(--ink-soft)]">Loading…</p>}
      <div className="flex flex-col gap-3">
        {sessions?.map((session) => (
          <SessionCard key={session.id} session={session} exercises={exercises ?? []} />
        ))}
      </div>
    </div>
  )
}

function SessionCard({ session, exercises }: { session: WorkoutSession; exercises: Exercise[] }) {
  const queryClient = useQueryClient()
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? '')
  const [reps, setReps] = useState('8')
  const [weight, setWeight] = useState('')

  const addSet = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/fitness/sessions/${session.id}/sets`, {
          exercise_id: exerciseId,
          reps: Number(reps),
          weight_kg: weight || null,
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fitness', 'sessions'] }),
  })

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium">{session.name}</h3>
        <span className="text-xs text-[var(--ink-soft)]">{session.performed_on}</span>
      </div>
      <ul className="mb-2 flex flex-col gap-1 text-sm">
        {session.sets.map((s) => {
          const exercise = exercises.find((e) => e.id === s.exercise_id)
          return (
            <li key={s.id} className="tabular-nums text-[var(--ink-soft)]">
              {exercise?.name ?? 'Exercise'} — {s.reps} reps{s.weight_kg ? ` × ${s.weight_kg}kg` : ''}
            </li>
          )
        })}
        {session.sets.length === 0 && <li className="text-[var(--ink-soft)]">No sets logged yet.</li>}
      </ul>
      {exercises.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            addSet.mutate()
          }}
          className="flex flex-wrap gap-2"
        >
          <select
            value={exerciseId}
            onChange={(e) => setExerciseId(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-xs"
          >
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="w-16 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-xs"
            placeholder="reps"
          />
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-20 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-xs"
            placeholder="kg"
          />
          <button type="submit" className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white">
            Add set
          </button>
        </form>
      )}
    </Card>
  )
}
