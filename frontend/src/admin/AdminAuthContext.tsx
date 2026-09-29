import { createContext, useContext, useState, type ReactNode } from 'react'
import { adminApi } from './adminApi'
import { setAdminAccessToken } from './adminTokenStore'

interface AdminAuthContextValue {
  isLoggedIn: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  // No bootstrap-on-load check, unlike the regular AuthProvider — there's no
  // refresh cookie to silently restore a session from, so a fresh page load
  // always starts logged out. That's an accepted tradeoff for a much simpler
  // admin auth story (see adminApi.ts).
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  async function login(email: string, password: string) {
    const { data } = await adminApi.post<{ access_token: string }>('/auth/login', { email, password })
    setAdminAccessToken(data.access_token)
    setIsLoggedIn(true)
  }

  function logout() {
    setAdminAccessToken(null)
    setIsLoggedIn(false)
  }

  return <AdminAuthContext.Provider value={{ isLoggedIn, login, logout }}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
