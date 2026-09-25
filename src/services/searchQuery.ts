/**
 * PostgREST `.or()` filter safety.
 *
 * A search term is interpolated into a PostgREST filter string, where `%`, `_`,
 * `,`, `"`, `(`, `)` and `\` are all syntax. `_` in particular is a LIKE
 * single-character wildcard, so `a_b` silently matched `axb` and `aab`, and any
 * residual metacharacter produced a 400 that took down the whole list rather
 * than just that term. This is the one place terms are made safe.
 */

/** Below this, a match is noise rather than a search. */
export const MIN_SEARCH_TERM_LENGTH = 2;

/** Hard cap so a pathological term cannot produce a megabyte of filter string. */
const MAX_TERM_LENGTH = 80;

const POSTGREST_RESERVED = /[%_,"()\\]/g;

/**
 * Returns a term safe to embed in a PostgREST `.or()` string, or '' when the
 * input is too short to search for.
 */
export function sanitizeSearchTerm(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .trim()
    // A backslash is the PostgREST escape character itself, so it goes first.
    .replace(/\\/g, ' ')
    .replace(POSTGREST_RESERVED, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TERM_LENGTH);
  return cleaned.length >= MIN_SEARCH_TERM_LENGTH ? cleaned : '';
}

/** True when the term is long enough to be worth a round trip. */
export function isSearchableTerm(raw?: string | null): boolean {
  return sanitizeSearchTerm(raw).length > 0;
}
