import axios from 'axios'
import { getAdminAccessToken, setAdminAccessToken } from './adminTokenStore'

// Its own axios instance, deliberately — no shared interceptors/refresh logic
// with the regular user's `api` client in lib/api.ts. No refresh-token flow
// either: an admin session is just the in-memory token until it expires
// (2 hours) or the tab closes, then it's a plain re-login. Lower usage
// frequency than the main app doesn't justify the cookie/rotation machinery.
export const adminApi = axios.create({
  baseURL: '/api/v1/admin',
})

adminApi.interceptors.request.use((config) => {
  const token = getAdminAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    // No refresh flow to attempt (see the file comment) — an expired/invalid
    // admin token just goes straight back to login. A hard navigation is
    // fine here: this is a low-frequency internal tool, not the main app.
    if (error?.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      setAdminAccessToken(null)
      if (window.location.pathname !== '/admin/login') {
        window.location.href = '/admin/login'
      }
    }
    return Promise.reject(error)
  },
)
