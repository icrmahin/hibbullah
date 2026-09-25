/**
 * Bangladesh phone numbers, normalized to canonical E.164.
 *
 * The app had one hard-coded regex duplicated in four places that only
 * *validated* — it rejected `01865858544`, `8801865858544` and `+880 1865-858544`
 * instead of converting them, and because the database constraint made the
 * leading `+` optional, `8801865858544` and `+8801865858544` could be stored as
 * two different people. This module is the single place a phone number is
 * interpreted, for every entry point: signup, profile editor, and checkout.
 */

const COUNTRY_CODE = '880'
const NATIONAL_LENGTH = 10 // 1XXXXXXXXX
const E164_LENGTH = COUNTRY_CODE.length + NATIONAL_LENGTH // 13 digits, plus the '+'

/** Shown as a fixed, non-editable adornment on the phone input. */
export const COUNTRY_PREFIX = `+${COUNTRY_CODE}`

/** Digits after the country code: 1XXXXXXXXX. */
export const NATIONAL_LENGTH_DIGITS = NATIONAL_LENGTH

export type PhoneParseResult = {
  ok: boolean
  /** Canonical '+8801XXXXXXXXX'. Only set when ok is true. */
  e164?: string
  /** The 10 national digits, '1XXXXXXXXX'. Only set when ok is true. */
  national?: string
  /** Human-readable reason, ready to show under the input. */
  error?: string
}

const INVALID_MESSAGE = 'Enter a valid Bangladeshi number, for example 01712345678.'

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Accepts any reasonable way a Bangladeshi number gets typed or pasted and
 * returns the canonical E.164 form.
 *
 *   01812345678          -> +8801812345678
 *   +8801812345678       -> +8801812345678
 *   8801812345678        -> +8801812345678
 *   +880 1812-345678     -> +8801812345678
 *   1812345678           -> +8801812345678
 */
export function normalizeBdPhone(input?: string | null): PhoneParseResult {
  if (input == null) return { ok: false, error: INVALID_MESSAGE }

  let digits = digitsOnly(input)
  if (!digits) return { ok: false, error: INVALID_MESSAGE }

  // Operator-prefixed local format: 018… / 017… / 016… / 015… / 014… / 013…
  if (digits.length === NATIONAL_LENGTH + 1 && digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  // Already country-prefixed, with or without the '+'.
  else if (digits.startsWith(COUNTRY_CODE)) {
    digits = digits.slice(COUNTRY_CODE.length)
  }

  if (digits.length !== NATIONAL_LENGTH || !digits.startsWith('1')) {
    return { ok: false, error: INVALID_MESSAGE }
  }

  return { ok: true, e164: `+${COUNTRY_CODE}${digits}`, national: digits }
}

export function isBdPhone(input?: string | null): boolean {
  return normalizeBdPhone(input).ok
}

/**
 * The '+880' shown as a fixed, non-editable prefix on the phone input, so the
 * user only ever types the 10 national digits. Returns '' when the current value
 * is not a valid number, which lets the user type freely.
 */
export function toNationalDigits(input?: string | null): string {
  const parsed = normalizeBdPhone(input)
  return parsed.ok && parsed.national ? parsed.national : ''
}

/** '+8801812345678' -> '+880 1812-345678'. Falls back to the raw value. */
export function formatBdPhone(value?: string | null): string {
  if (!value) return ''
  const parsed = normalizeBdPhone(value)
  if (!parsed.ok || !parsed.national) return value
  const n = parsed.national
  return `+${COUNTRY_CODE} ${n.slice(0, 4)}-${n.slice(4)}`
}

/**
 * The 10 digits to show in an input, from whatever the caller holds.
 *
 * Unlike `toNationalDigits` this does not require the number to be complete, so
 * it works while the user is still typing: partial input is preserved rather
 * than being blanked out on every keystroke. A pasted `+880…` or `018…` still
 * collapses to the same 10 digits.
 */
export function toEditableDigits(input?: string | null): string {
  if (!input) return ''
  let digits = digitsOnly(input)
  if (digits.length === NATIONAL_LENGTH + 1 && digits.startsWith('0')) {
    digits = digits.slice(1)
  } else if (digits.startsWith(COUNTRY_CODE)) {
    digits = digits.slice(COUNTRY_CODE.length)
  }
  return digits.slice(0, NATIONAL_LENGTH)
}

/** True when a phone number is already stored in canonical form. */
export function isCanonicalBdPhone(value?: string | null): boolean {
  return !!value && value.length === E164_LENGTH + 1 && normalizeBdPhone(value).e164 === value
}
