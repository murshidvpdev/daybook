// A separate in-memory slot from the regular user's token store — an admin
// session must never be confused with, or overwrite, a regular user session
// in the same browser tab.
let adminAccessToken: string | null = null

export function getAdminAccessToken(): string | null {
  return adminAccessToken
}

export function setAdminAccessToken(token: string | null): void {
  adminAccessToken = token
}
