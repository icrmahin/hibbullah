import { AppError, AppErrorType } from './errors'

/**
 * Assert that a single-row write actually changed a row.
 *
 * PostgREST answers an `UPDATE` or `DELETE` that matched nothing with the same `204 No
 * Content` as one that matched a row, and `supabase-js` surfaces that as a successful
 * promise with no error. So a write guarded only by `if (error) throw` reports success
 * when it changed nothing at all, and the caller has no way to tell the two apart.
 *
 * The failure is not hypothetical. The admin returns screen approves a return by
 * `PATCH`-ing `return_requests` filtered on the id, behind an `UPDATE` policy whose
 * `using` clause is `is_admin()`. A non-admin, or a row that has since been deleted,
 * matches zero rows and answers a cheerful `204`. This is also what made a test of that
 * screen report a stranger's rejected update as a successful `204`.
 *
 * Only for writes aimed at one specific row. A bulk write matching nothing is usually the
 * correct outcome — there was nothing to clear — and raising there would turn an ordinary
 * "you have no notifications" into an error. Single-row writes are the case where zero
 * means "the row you named is not there, or not yours", which is never what the caller
 * meant.
 *
 * @param rows The `data` from a write that had `.select()` appended to it.
 * @param what What was being written, phrased for the person reading the message.
 */
export function requireAffected(rows: unknown, what: string): void {
  const affected = Array.isArray(rows) ? rows.length : rows ? 1 : 0
  if (affected === 0) {
    throw new AppError(
      AppErrorType.NOT_FOUND,
      `Nothing was updated: ${what}. It may have been removed, or it may not belong to you.`,
    )
  }
}
