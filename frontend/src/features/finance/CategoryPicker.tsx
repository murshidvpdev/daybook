import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { SearchableSelect } from '../../components/SearchableSelect'
import { api } from '../../lib/api'
import type { Category } from '../../types/api'

/** A searchable category dropdown with an inline "add new" affordance —
 * categorizing spend as you go is what makes the category-breakdown chart on
 * Overview mean anything; without this every transaction just piles up as
 * "Uncategorized". Typing a name that doesn't exist yet offers to create it
 * right there. */
export function CategoryPicker({
  kind,
  value,
  onChange,
  className = '',
  fieldBg = 'bg-[var(--paper)]',
  onBusyChange,
}: {
  kind: 'expense' | 'income'
  value: string | null
  onChange: (categoryId: string | null) => void
  className?: string
  /** Match the input background to whatever surface this picker sits on —
   * a card (white) wants paper-colored fields, a paper panel wants surface ones. */
  fieldBg?: string
  /** Fires while a new category is being made (the name form is open, or the
   * create request is in flight) — the category only actually lands in `value`
   * once that request resolves, so the parent form should block its own
   * submit during this window. Otherwise a fast submit races the category
   * creation and saves with the *old* category (often none). */
  onBusyChange?: (busy: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { data: categories } = useQuery({
    queryKey: ['finance', 'categories'],
    queryFn: async () => (await api.get<Category[]>('/finance/categories')).data,
  })
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const create = useMutation({
    mutationFn: async (name: string) => (await api.post<Category>('/finance/categories', { name, kind })).data,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'categories'] })
      onChange(created.id)
      setAdding(false)
      setNewName('')
    },
    // A one-tap "Create “x”" that fails drops into the typed-name form with
    // the name kept, so the retry is one more tap instead of retyping it.
    onError: (_err, name) => {
      setNewName(name)
      setAdding(true)
    },
  })

  const busy = adding || create.isPending
  useEffect(() => {
    onBusyChange?.(busy)
    // Unmounting mid-create (e.g. the parent hides the picker) mustn't leave
    // the parent's submit blocked forever.
    return () => {
      if (busy) onBusyChange?.(false)
    }
  }, [busy, onBusyChange])

  const options = useMemo(
    () =>
      (categories ?? [])
        .filter((c) => c.kind === kind)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ value: c.id, label: c.name })),
    [categories, kind],
  )

  if (adding) {
    return (
      <div className={`flex gap-1 ${className}`}>
        <input
          autoFocus
          placeholder="New category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (newName.trim()) create.mutate(newName.trim())
            }
            if (e.key === 'Escape') setAdding(false)
          }}
          aria-invalid={create.isError}
          title={create.isError ? "Couldn't add that category — try again" : undefined}
          className={`min-w-0 flex-1 rounded-lg border ${create.isError ? 'border-[var(--danger)]' : 'border-[var(--border)]'} ${fieldBg} px-2 py-2 text-sm outline-none focus:border-[var(--accent)]`}
        />
        <button
          type="button"
          onClick={() => newName.trim() && create.mutate(newName.trim())}
          disabled={!newName.trim() || create.isPending}
          className="rounded-lg bg-[var(--accent)] px-2 text-xs font-medium text-white disabled:opacity-60"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="rounded-lg px-2 text-xs text-[var(--ink-soft)]"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <SearchableSelect
      ariaLabel="Category"
      value={value ?? ''}
      onChange={(v) => onChange(v || null)}
      options={[{ value: '', label: 'No category' }, ...options]}
      placeholder="No category"
      searchPlaceholder="Search categories…"
      fieldBg={fieldBg}
      className={className}
      action={{
        label: (q) => {
          const exists = q && options.some((o) => o.label.toLowerCase() === q.toLowerCase())
          return q && !exists ? `+ Create “${q}”` : '+ New category…'
        },
        onSelect: (q) => {
          const existing = options.find((o) => o.label.toLowerCase() === q.toLowerCase())
          if (existing) onChange(existing.value)
          else if (q) create.mutate(q)
          else setAdding(true)
        },
      }}
    />
  )
}
