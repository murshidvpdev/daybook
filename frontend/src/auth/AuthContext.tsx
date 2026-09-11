import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, refreshAccessToken } from '../lib/api'
import { setAccessToken } from '../lib/tokenStore'
import type { User } from '../types/api'

interface AuthContextValue {
  user: User | null
  isBootstrapping: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName?: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  useEffect(() => {
    ;(async () => {
      const token = await refreshAccessToken()
      if (token) {
        try {
          const { data } = await api.get<User>('/auth/me')
          setUser(data)
        } catch {
          setUser(null)
        }
      }
      setIsBootstrapping(false)
    })()
  }, [])

  async function login(email: string, password: string) {
    const { data } = await api.post<{ access_token: string }>('/auth/login', { email, password })
    setAccessToken(data.access_token)
    const me = await api.get<User>('/auth/me')
    setUser(me.data)
  }

  async function register(email: string, password: string, displayName?: string) {
    await api.post('/auth/register', { email, password, display_name: displayName })
    await login(email, password)
  }

  async function logout() {
    await api.post('/auth/logout').catch(() => undefined)
    setAccessToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isBootstrapping, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
