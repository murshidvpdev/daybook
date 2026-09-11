import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { applyTheme, getStoredTheme, nextTheme, type ThemePreference } from '../lib/theme'
import {
  FinanceIcon,
  FitnessIcon,
  HabitIcon,
  LogoutIcon,
  RoutineIcon,
  SunMoonIcon,
  TodayIcon,
} from './Icons'

const NAV_ITEMS = [
  { to: '/', label: 'Today', icon: TodayIcon, end: true },
  { to: '/routine', label: 'Routine', icon: RoutineIcon, end: false },
  { to: '/habits', label: 'Habits', icon: HabitIcon, end: false },
  { to: '/finance', label: 'Finance', icon: FinanceIcon, end: false },
  { to: '/fitness', label: 'Fitness', icon: FitnessIcon, end: false },
]

function navLinkClasses(isActive: boolean, layout: 'sidebar' | 'bottom') {
  const active = isActive ? 'text-[var(--accent-ink)]' : 'text-[var(--ink-soft)]'
  if (layout === 'sidebar') {
    return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active} ${
      isActive ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-2)]'
    }`
  }
  return `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium ${active}`
}

export function Layout() {
  const { user, logout } = useAuth()
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme())

  // Applying the theme touches document.documentElement — an external system,
  // which is exactly what effects are for; the state itself is set on init/click.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function cycleTheme() {
    setTheme(nextTheme(theme))
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-none border-r border-[var(--border)] bg-[var(--surface)] p-5 md:flex md:flex-col">
        <div className="mb-8 flex items-center gap-2">
          <span className="text-xl">📔</span>
          <span className="font-serif text-lg font-semibold">Daybook</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClasses(isActive, 'sidebar')}>
              <Icon width={18} height={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
          <span className="truncate text-xs text-[var(--ink-soft)]">{user?.email}</span>
          <div className="flex gap-1">
            <button
              onClick={cycleTheme}
              title={`Theme: ${theme}`}
              className="rounded-md p-2 text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
            >
              <SunMoonIcon width={16} height={16} />
            </button>
            <button onClick={logout} title="Log out" className="rounded-md p-2 text-[var(--ink-soft)] hover:bg-[var(--surface-2)]">
              <LogoutIcon width={16} height={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="safe-top sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <span className="text-lg">📔</span>
          <span className="font-serif text-base font-semibold">Daybook</span>
        </div>
        <div className="flex gap-1">
          <button onClick={cycleTheme} className="rounded-md p-2 text-[var(--ink-soft)]">
            <SunMoonIcon width={18} height={18} />
          </button>
          <button onClick={logout} className="rounded-md p-2 text-[var(--ink-soft)]">
            <LogoutIcon width={18} height={18} />
          </button>
        </div>
      </header>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 flex border-t border-[var(--border)] bg-[var(--surface)] md:hidden">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClasses(isActive, 'bottom')}>
            <Icon width={20} height={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
