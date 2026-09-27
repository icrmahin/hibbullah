/**
 * Date formatting.
 *
 * Two hazards are handled here, and both of them used to be a hard app crash.
 *
 * 1. Postgres timestamps are not ISO 8601. A `timestamptz` read from a real column
 *    arrives over PostgREST as `2026-09-26T20:34:37.885+00:00`, but a timestamp
 *    stored *inside* a `jsonb` column is serialised by Postgres to its own text form,
 *    `2026-09-26 20:34:37.88504+00` — space instead of `T`, `+00` instead of `+00:00`,
 *    and however many fractional digits the column happened to keep. V8 parses that
 *    leniently; Hermes, the engine the app actually ships on, is spec-strict and
 *    returns an Invalid Date.
 *
 * 2. `Intl.DateTimeFormat.prototype.format` *throws* `RangeError: Invalid time value`
 *    on an invalid date. `Date.prototype.toLocaleString` returns the string
 *    "Invalid Date" instead, which is why this is easy to get wrong: an earlier
 *    version of this file used `toLocaleString` and silently printed nonsense, and the
 *    switch to `Intl` turned that silence into a thrown error during render. With no
 *    ErrorBoundary above it, that killed the app.
 *
 * So every entry point normalises first, then checks, and never hands an Invalid Date
 * to `Intl`.
 *
 * 3. The two engines disagree about what `new Date(string)` will tolerate, and a value one
 *    of them reads as a date can be a *different* date to the other. V8, handed
 *    "not-a-year-09-26T20:34:37.88504+00:00", does not return an Invalid Date -- it returns
 *    27 September, and the formatter prints it. Nothing throws, so nothing reports it, and a
 *    wrong order date is worse than a blank one. So parsing below is strict: a value is
 *    either one of the two shapes the app knows a database produces, or it is refused.
 *    Trusting the engine to reject nonsense is the exact assumption that produced the crash.
 */

/** What a date formatter returns when the input cannot be understood at all. */
const UNKNOWN_DATE = "—";

/**
 * Postgres's text form of a timestamp: a space or `T` separator, and a UTC offset with
 * only two digits. Both are legal Postgres output and neither is a valid ES Date Time
 * String, which is what makes Hermes refuse it.
 */
const POSTGRES_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2})$/;

/** An ES Date Time String, which `Date` reads identically on every engine. */
const ES_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Normalise a stored timestamp to something `Date` parses on every engine, or null when the
 * value is not a timestamp at all.
 *
 * Only the shape is rewritten; no timezone is guessed. `2026-09-26 20:34:37.88504+00`
 * becomes `2026-09-26T20:34:37.88504+00:00`, a valid ES Date Time String.
 *
 * The null return is the important part. An earlier version returned the input unchanged
 * when it did not match, and handed whatever followed to `new Date()` on the assumption that
 * the engine would reject it. That assumption is false on V8, and it is why this returns
 * null rather than the original string: the caller has to make a decision about a value it
 * does not recognise, instead of the engine making one silently.
 */
function toParsable(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = POSTGRES_TIMESTAMP.exec(trimmed);
  if (match) {
    const [, datePart, timePart, fraction, signOffset] = match;
    return `${datePart}T${timePart}${fraction ?? ''}${signOffset}:00`;
  }

  if (ES_TIMESTAMP.test(trimmed)) return trimmed;

  return null;
}

/**
 * Parse a stored timestamp, or null when it cannot be read.
 *
 * Exported so `verify:device-runtime` can assert the *value* it produces and not only that
 * the guard is still present in the source. Structural checks cannot tell a correct parser
 * from one that returns a confidently wrong date, and a wrong date is the worse of the two
 * faults: it never throws, so nothing reports it.
 */
export function toDate(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;

  const parsable = toParsable(value);
  if (!parsable) return null;

  // The shape is now known-good, but the components may still be out of range — month 13,
  // hour 99 — and `Date` rejects those by returning an Invalid Date rather than throwing.
  const parsed = new Date(parsable);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const formatDate = (
  value: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string => {
  const date = toDate(value);
  if (!date) return UNKNOWN_DATE;
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
};

export const formatShortDate = (value: string | Date): string =>
  formatDate(value, { month: "short", day: "numeric" });

export const formatDateTime = (value: string | Date): string => {
  const date = toDate(value);
  if (!date) return UNKNOWN_DATE;
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};
