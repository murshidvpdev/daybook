export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'daybook-theme'

export function getStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back silently
  }
  return 'system'
}

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement
  if (pref === 'system') {
    delete root.dataset.theme
  } else {
    root.dataset.theme = pref
  }
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // ignore
  }
}

export function nextTheme(current: ThemePreference): ThemePreference {
  const order: ThemePreference[] = ['system', 'light', 'dark']
  return order[(order.indexOf(current) + 1) % order.length]
}
