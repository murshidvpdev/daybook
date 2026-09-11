// Remembers the last category picked per transaction kind, per browser — a
// pure convenience so logging a string of same-category expenses (lunch,
// lunch, lunch) doesn't mean re-picking "Food" from the dropdown every time.
const KEY_PREFIX = 'daybook-last-category-'

export function getLastCategory(kind: 'expense' | 'income'): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + kind)
  } catch {
    return null
  }
}

export function setLastCategory(kind: 'expense' | 'income', categoryId: string | null): void {
  try {
    if (categoryId) localStorage.setItem(KEY_PREFIX + kind, categoryId)
    else localStorage.removeItem(KEY_PREFIX + kind)
  } catch {
    // ignore — private mode, storage disabled, etc.
  }
}
