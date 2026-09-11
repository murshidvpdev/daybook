import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import type { Category } from '../../types/api'

/** A category select with an inline "add new" affordance — categorizing spend as
 * you go is what makes the category-breakdown chart on Overview mean anything;
 * without this every transaction just piles up as "Uncategorized". */
export function CategoryPicker({
  kind,
  value,
  onChange,
  className = '',
  fieldBg = 'bg-[var(--paper)]',
}: {
  kind: 'expense' | 'income'
  value: string | null
  onChange: (categoryId: string | null) => void
  className?: string
  /** Match the input background to whatever surface this picker sits on —
   * a card (white) wants paper-colored fields, a paper panel wants surface ones. */
  fieldBg?: string
}) {
  const queryClient = useQueryClient()
  const { data: categories } = useQuery({
    queryKey: ['finance', 'categories'],
    queryFn: async () => (await api.get<Category[]>('/finance/categories')).data,
  })
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const create = useMutation({
    mutationFn: async () => (await api.post<Category>('/finance/categories', { name: newName, kind })).data,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'categories'] })
      onChange(created.id)
      setAdding(false)
      setNewName('')
    },
  })

  const options = categories?.filter((c) => c.kind === kind) ?? []

  if (adding) {
    return (
      <div className={`flex gap-1 ${className}`}>
        <input
          autoFocus
          placeholder="New category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) create.mutate()
            if (e.key === 'Escape') setAdding(false)
          }}
          className={`min-w-0 flex-1 rounded-lg border border-[var(--border)] ${fieldBg} px-2 py-2 text-sm outline-none focus:border-[var(--accent)]`}
        />
        <button
          type="button"
          onClick={() => newName.trim() && create.mutate()}
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
    <select
      aria-label="Category"
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new__') setAdding(true)
        else onChange(e.target.value || null)
      }}
      className={`rounded-lg border border-[var(--border)] ${fieldBg} px-2 py-2 text-sm ${className}`}
    >
      <option value="">No category</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__new__">+ New category…</option>
    </select>
  )
}
