import { useRef, useState } from 'react'
import { isContactPickerSupported, parseVCard, pickContact } from '../../lib/contactPicker'
import { useLendingPeople } from './lendingPeople'

export type Friend = { name: string; phone: string }

/** Name + phone for a lending. Suggests people you've lent to before (so a
 * friend's number only has to be entered once) and imports a contact —
 * the native picker on Android Chrome, a shared .vcf card everywhere else,
 * since iPhone browsers can't open Contacts directly. */
export function FriendPicker({
  value,
  onChange,
  fieldBg = 'bg-[var(--paper)]',
  showPhone = true,
}: {
  value: Friend
  onChange: (friend: Friend) => void
  fieldBg?: string
  showPhone?: boolean
}) {
  const { data: people } = useLendingPeople()
  const [focused, setFocused] = useState(false)
  const vcardInputRef = useRef<HTMLInputElement>(null)
  const [vcardError, setVcardError] = useState(false)
  const field = `rounded-lg border border-[var(--border)] ${fieldBg} px-3 py-2 text-sm outline-none focus:border-[var(--accent)]`

  const typed = value.name.trim().toLowerCase()
  const suggestions = (people ?? [])
    .filter((p) => !typed || p.person_name.toLowerCase().includes(typed))
    .filter((p) => !(p.person_name.toLowerCase() === typed && (p.phone_number ?? '') === value.phone))
    .slice(0, 5)

  async function handlePickContact() {
    const contact = await pickContact()
    if (contact) onChange({ name: contact.name || value.name, phone: contact.tel || value.phone })
  }

  async function handleVCardFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return
    const contact = parseVCard(await file.text())
    setVcardError(!contact)
    if (contact) onChange({ name: contact.name || value.name, phone: contact.tel || value.phone })
  }

  const contactButton = isContactPickerSupported() ? (
    <button
      type="button"
      onClick={handlePickContact}
      title="Pick from Contacts"
      className="flex-none rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
    >
      📇
    </button>
  ) : (
    <>
      <input
        ref={vcardInputRef}
        type="file"
        accept=".vcf,text/vcard"
        onChange={handleVCardFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => vcardInputRef.current?.click()}
        title="Import from a shared contact (.vcf) — on iPhone: Contacts app → share the contact → Save to Files, then pick it here"
        className="flex-none rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
      >
        📇
      </button>
    </>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          placeholder="Friend's name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          onFocus={() => setFocused(true)}
          // Delay so a tap on a suggestion lands before the list disappears.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          className={`min-w-0 flex-1 ${field}`}
        />
        {!showPhone && contactButton}
      </div>
      {focused && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="People you've lent to before">
          {suggestions.map((p) => (
            <button
              type="button"
              key={p.key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange({ name: p.person_name, phone: p.phone_number ?? '' })
                setFocused(false)
              }}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--surface-2)]"
            >
              {p.person_name}
              {p.phone_number && <span className="ml-1 text-[var(--ink-soft)]">· {p.phone_number}</span>}
            </button>
          ))}
        </div>
      )}
      {showPhone && (
        <div className="flex gap-2">
          <input
            placeholder="Phone number (for reminders, optional)"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            className={`min-w-0 flex-1 ${field}`}
          />
          {contactButton}
        </div>
      )}
      {vcardError && (
        <p className="text-xs text-[var(--danger)]">
          Couldn't read a name or number from that file — is it a contact's .vcf?
        </p>
      )}
    </div>
  )
}
