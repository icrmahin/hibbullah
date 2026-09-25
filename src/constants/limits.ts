/**
 * How much history the app keeps.
 *
 * Two lists are transient and are therefore capped; everything else (products, orders,
 * inventory, returns, profiles, categories, manufacturers) is business data and is left
 * to grow without limit.
 *
 * These must stay in step with the database triggers that enforce the same bounds:
 * `supabase/migrations/20260926170000_notifications_and_audit_limits.sql`. The database
 * is what actually caps the tables — trimming only the query would let them grow
 * forever, and a client could always ask for more. The numbers live here as well so the
 * UI can ask for a bounded list in the first place and so the app can explain the limit
 * to the user instead of silently truncating. `supabase/verify-limits.mjs` asserts the
 * two agree.
 */

/**
 * Newest audit entries kept, across all admins.
 *
 * Small on purpose. `audit_entries` is written by a trigger on products, orders,
 * inventory and returns, so with a 4k-product catalog it is the fastest-growing table
 * in the database, and it answers "what just happened" rather than "what happened
 * last quarter".
 */
export const AUDIT_LOG_LIMIT = 20

/**
 * Newest notifications kept, per user.
 *
 * Per user rather than global, so one busy account cannot empty someone else's list.
 * Higher than the audit limit because notifications are addressed to a person and a
 * user legitimately wants more than the last 20 things that happened to them.
 */
export const NOTIFICATION_LIMIT = 50
