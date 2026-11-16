import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type SelectOption = {
  value: string
  label: string
  /** Small secondary text on the right of the row, e.g. "income". */
  hint?: string
}

/** A dropdown with a search box at the top — a plain <select> stops being
 * usable once there are dozens of categories, especially on a phone where the
 * native wheel shows five at a time. Type a few letters, hit Enter. */
export function SearchableSelect({
  options,
  value,
  onChange,
  ariaLabel,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  className = '',
  fieldBg = 'bg-[var(--paper)]',
  action,
}: {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  /** Trigger text when `value` matches no option. */
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  fieldBg?: string
  /** An extra row pinned under the list (e.g. "+ New category"). Gets the
   * current search text so it can offer to create exactly what was typed. */
  action?: { label: (query: string) => string; onSelect: (query: string) => void }
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [alignRight, setAlignRight] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])
  // The action row sits after the options, so it's reachable with the arrow keys too.
  const rowCount = filtered.length + (action ? 1 : 0)

  function openMenu() {
    // Open toward whichever side has room, so a picker near the right edge of
    // a phone screen doesn't push its menu off-screen.
    const rect = triggerRef.current?.getBoundingClientRect()
    setAlignRight(rect ? rect.left + 256 > window.innerWidth : false)
    setQuery('')
    const idx = options.findIndex((o) => o.value === value)
    setActive(idx >= 0 ? idx : 0)
    setOpen(true)
  }

  function close(refocus = true) {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  function choose(index: number) {
    if (index < filtered.length) {
      onChange(filtered[index].value)
      close()
    } else if (action) {
      const q = query.trim()
      close()
      action.onSelect(q)
    }
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--border)] ${fieldBg} px-2 py-2 text-left text-sm outline-none focus:border-[var(--accent)]`}
      >
        <span className={`truncate ${selected ? '' : 'text-[var(--ink-soft)]'}`}>{selected?.label ?? placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 text-[var(--ink-soft)]" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] min-w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg ${
            alignRight ? 'right-0' : 'left-0'
          }`}
        >
          <div className="border-b border-[var(--border)] p-1.5">
            <input
              autoFocus
              role="combobox"
              aria-label={`Search ${ariaLabel.toLowerCase()}`}
              aria-controls={listId}
              aria-expanded
              aria-activedescendant={rowCount ? `${listId}-${active}` : undefined}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActive((i) => Math.min(i + 1, rowCount - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive((i) => Math.max(i - 1, 0))
                } else if (e.key === 'Enter') {
                  // Never let Enter submit the surrounding form from in here.
                  e.preventDefault()
                  if (rowCount) choose(active)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  close()
                } else if (e.key === 'Tab') {
                  close(false)
                }
              }}
              className="w-full rounded-md bg-[var(--paper)] px-2 py-1.5 text-sm outline-none"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-y-auto py-1">
            {filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                  i === active ? 'bg-[var(--accent-soft)]' : ''
                } ${o.value === value ? 'font-semibold text-[var(--accent-ink)]' : ''}`}
              >
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs capitalize text-[var(--ink-soft)]">{o.hint}</span>}
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-[var(--ink-soft)]">No matches</li>}
            {action && (
              <li
                id={`${listId}-${filtered.length}`}
                data-index={filtered.length}
                role="option"
                aria-selected={false}
                onPointerEnter={() => setActive(filtered.length)}
                onClick={() => choose(filtered.length)}
                className={`cursor-pointer border-t border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--accent-ink)] ${
                  active === filtered.length ? 'bg-[var(--accent-soft)]' : ''
                }`}
              >
                {action.label(query.trim())}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
