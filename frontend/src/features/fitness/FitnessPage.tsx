import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import type { Exercise, ExerciseSet, WorkoutSession } from '../../types/api'
import { Card } from '../../components/Card'
import { PencilIcon, TrashIcon } from '../../components/Icons'

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

  const [showExercises, setShowExercises] = useState(false)

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

      <Card className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Exercise catalog</p>
          {exercises && exercises.length > 0 && (
            <button
              onClick={() => setShowExercises((v) => !v)}
              className="text-xs font-medium text-[var(--accent-ink)]"
            >
              {showExercises ? 'Hide' : `Manage (${exercises.length})`}
            </button>
          )}
        </div>
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
        {showExercises && exercises && exercises.length > 0 && (
          <ExerciseList exercises={exercises} />
        )}
      </Card>

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

function ExerciseList({ exercises }: { exercises: Exercise[] }) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/fitness/exercises/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fitness', 'exercises'] }),
  })

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
      {exercises.map((ex) =>
        editingId === ex.id ? (
          <EditExerciseForm key={ex.id} exercise={ex} onDone={() => setEditingId(null)} />
        ) : (
          <div key={ex.id} className="flex items-center justify-between text-sm">
            <span>
              {ex.name}
              {ex.muscle_group && <span className="ml-1 text-xs text-[var(--ink-soft)]">({ex.muscle_group})</span>}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditingId(ex.id)}
                className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                aria-label="Edit exercise"
              >
                <PencilIcon width={14} height={14} />
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${ex.name}"? This also removes any logged sets for it.`)) {
                    remove.mutate(ex.id)
                  }
                }}
                className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
                aria-label="Delete exercise"
              >
                <TrashIcon width={14} height={14} />
              </button>
            </div>
          </div>
        ),
      )}
    </div>
  )
}

function EditExerciseForm({ exercise, onDone }: { exercise: Exercise; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(exercise.name)
  const [muscleGroup, setMuscleGroup] = useState(exercise.muscle_group ?? '')

  const update = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/fitness/exercises/${exercise.id}`, {
          name,
          muscle_group: muscleGroup || null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fitness', 'exercises'] })
      onDone()
    },
  })

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        data-testid="edit-exercise-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
      />
      <input
        placeholder="Muscle group"
        value={muscleGroup}
        onChange={(e) => setMuscleGroup(e.target.value)}
        className="w-28 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
      />
      <button
        onClick={() => name.trim() && update.mutate()}
        disabled={!name.trim() || update.isPending}
        className="rounded-lg bg-[var(--accent)] px-2 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      >
        Save
      </button>
      <button onClick={onDone} className="text-xs text-[var(--ink-soft)]">
        Cancel
      </button>
    </div>
  )
}

function SessionCard({ session, exercises }: { session: WorkoutSession; exercises: Exercise[] }) {
  const queryClient = useQueryClient()
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? '')
  const [reps, setReps] = useState('8')
  const [weight, setWeight] = useState('')
  const [editingSession, setEditingSession] = useState(false)
  const [editingSetId, setEditingSetId] = useState<string | null>(null)

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
  const deleteSession = useMutation({
    mutationFn: async () => api.delete(`/fitness/sessions/${session.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fitness', 'sessions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })
  const deleteSet = useMutation({
    mutationFn: async (setId: string) =>
      (await api.delete(`/fitness/sessions/${session.id}/sets/${setId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fitness', 'sessions'] }),
  })

  if (editingSession) {
    return <EditSessionForm session={session} onDone={() => setEditingSession(false)} />
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium">{session.name}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--ink-soft)]">{session.performed_on}</span>
          <button
            onClick={() => setEditingSession(true)}
            className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
            aria-label="Edit session"
          >
            <PencilIcon width={14} height={14} />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete this "${session.name}" session and all its sets?`)) deleteSession.mutate()
            }}
            className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
            aria-label="Delete session"
          >
            <TrashIcon width={14} height={14} />
          </button>
        </div>
      </div>
      {session.notes && <p className="mb-2 text-xs text-[var(--ink-soft)]">{session.notes}</p>}
      <ul className="mb-2 flex flex-col gap-1 text-sm">
        {session.sets.map((s) =>
          editingSetId === s.id ? (
            <li key={s.id}>
              <EditSetForm
                sessionId={session.id}
                exerciseSet={s}
                onDone={() => setEditingSetId(null)}
              />
            </li>
          ) : (
            <li key={s.id} className="flex items-center justify-between tabular-nums text-[var(--ink-soft)]">
              <span>
                {exercises.find((e) => e.id === s.exercise_id)?.name ?? 'Exercise'} — {s.reps} reps
                {s.weight_kg ? ` × ${s.weight_kg}kg` : ''}
              </span>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => setEditingSetId(s.id)}
                  className="text-[var(--ink-soft)] hover:text-[var(--accent-ink)]"
                  aria-label="Edit set"
                >
                  <PencilIcon width={13} height={13} />
                </button>
                <button
                  onClick={() => deleteSet.mutate(s.id)}
                  className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
                  aria-label="Delete set"
                >
                  <TrashIcon width={13} height={13} />
                </button>
              </span>
            </li>
          ),
        )}
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

function EditSessionForm({ session, onDone }: { session: WorkoutSession; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(session.name)
  const [performedOn, setPerformedOn] = useState(session.performed_on)
  const [duration, setDuration] = useState(session.duration_minutes ? String(session.duration_minutes) : '')
  const [notes, setNotes] = useState(session.notes ?? '')

  const update = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/fitness/sessions/${session.id}`, {
          name,
          performed_on: performedOn,
          duration_minutes: duration ? Number(duration) : null,
          notes: notes || null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fitness', 'sessions'] })
      onDone()
    },
  })

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <input
          data-testid="edit-session-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={performedOn}
            onChange={(e) => setPerformedOn(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            placeholder="Duration (min)"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
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

function EditSetForm({
  sessionId,
  exerciseSet,
  onDone,
}: {
  sessionId: string
  exerciseSet: ExerciseSet
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [reps, setReps] = useState(String(exerciseSet.reps))
  const [weight, setWeight] = useState(exerciseSet.weight_kg ?? '')

  const update = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/fitness/sessions/${sessionId}/sets/${exerciseSet.id}`, {
          reps: Number(reps),
          weight_kg: weight || null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fitness', 'sessions'] })
      onDone()
    },
  })

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        data-testid="edit-set-reps"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        className="w-16 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
        placeholder="reps"
      />
      <input
        type="number"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        className="w-20 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
        placeholder="kg"
      />
      <button
        onClick={() => update.mutate()}
        disabled={update.isPending}
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
