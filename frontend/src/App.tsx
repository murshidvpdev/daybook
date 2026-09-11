import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { FinancePage } from './features/finance/FinancePage'
import { FitnessPage } from './features/fitness/FitnessPage'
import { HabitsPage } from './features/habits/HabitsPage'
import { RoutinePage } from './features/routine/RoutinePage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isBootstrapping } = useAuth()
  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--ink-soft)]">Loading…</div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/routine" element={<RoutinePage />} />
        <Route path="/habits" element={<HabitsPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/fitness" element={<FitnessPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
