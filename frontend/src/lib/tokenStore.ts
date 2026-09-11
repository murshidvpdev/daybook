// The access token lives in memory only — never localStorage — so an XSS payload
// reading storage can't walk off with a long-lived credential. It's naturally lost
// on a hard refresh, which is what the /auth/refresh call on app boot is for.
let accessToken: string | null = null
let listeners: Array<(token: string | null) => void> = []

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
  listeners.forEach((l) => l(token))
}

export function onAccessTokenChange(listener: (token: string | null) => void): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}
