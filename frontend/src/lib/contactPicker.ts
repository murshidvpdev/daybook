/** True only on Android Chrome, which is the only browser that actually ships
 * the Contact Picker API — not desktop Chrome/Edge, not any Safari (iOS or
 * macOS), not Firefox. On everything else this stays false and the vCard
 * import below (Share Sheet -> Save to Files -> pick a .vcf file) is the
 * only cross-platform way to pull a real contact in. */
export function isContactPickerSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.contacts?.select
}

export async function pickContact(): Promise<{ name: string; tel: string } | null> {
  if (!navigator.contacts?.select) return null
  const [contact] = await navigator.contacts.select(['name', 'tel'], { multiple: false })
  if (!contact) return null
  return { name: contact.name?.[0] ?? '', tel: contact.tel?.[0] ?? '' }
}

/** Parses the handful of vCard (.vcf) fields we actually need. iOS Contacts'
 * share sheet ("Share Contact" -> Save to Files) and macOS Contacts.app
 * ("Export vCard") both produce this format, so a plain file input reading
 * one works identically on a Mac and an iPhone — unlike the picker above. */
export function parseVCard(text: string): { name: string; tel: string } | null {
  const lines = text.split(/\r\n|\r|\n/)
  let name = ''
  let tel = ''
  for (const line of lines) {
    if (!name && line.startsWith('FN:')) {
      name = line.slice(3).trim()
    } else if (!tel && /^TEL/i.test(line) && line.includes(':')) {
      tel = line.slice(line.indexOf(':') + 1).trim()
    }
  }
  return name || tel ? { name, tel } : null
}
