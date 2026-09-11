// The Contact Picker API (https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API)
// isn't in TypeScript's DOM lib. It ships in Chromium on Android (and desktop
// Chrome/Edge) but Safari — including iOS — has no implementation and no stated
// plan to add one, so this is always feature-detected before use, never assumed.
interface ContactInfo {
  name?: string[]
  tel?: string[]
  email?: string[]
}

interface ContactsManager {
  select(properties: string[], options?: { multiple?: boolean }): Promise<ContactInfo[]>
}

interface Navigator {
  contacts?: ContactsManager
}
