import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getAccessToken, setAccessToken } from './tokenStore'

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true, // send the httpOnly refresh cookie on /auth/* calls
})

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post<{ access_token: string }>('/api/v1/auth/refresh', null, {
      withCredentials: true,
    })
    setAccessToken(data.access_token)
    return data.access_token
  } catch {
    setAccessToken(null)
    return null
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    if (error.response?.status === 401 && original && !original._retried && !original.url?.includes('/auth/')) {
      original._retried = true
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null
      })
      const newToken = await refreshPromise
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      }
    }
    return Promise.reject(error)
  },
)

export { refreshAccessToken }
