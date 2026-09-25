import { supabase } from '../lib/supabase'
import { mapAuditEntry } from '../lib/mappers'
import { AUDIT_LOG_LIMIT } from '../constants/limits'
import type { AuditEntry } from '../types/audit'

/**
 * The newest audit entries, newest first.
 *
 * Bounded by `AUDIT_LOG_LIMIT`, which the database enforces independently: a trigger on
 * `audit_entries` deletes everything past that cap on every insert, so the table itself
 * never holds more. The limit here is therefore not a truncation of a longer list — it
 * is the whole list, and asking for more would simply return the same rows.
 *
 * The trigger matters more than this query. `audit_entries` is written by triggers on
 * products, orders, inventory and returns, so a 4k-product catalog produces thousands
 * of rows; capping only the read would let the table grow without bound while the
 * screen showed a reassuring 20.
 */
export async function fetchAuditEntries(limit: number = AUDIT_LOG_LIMIT): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_entries')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).map((r) => mapAuditEntry(r as unknown as Parameters<typeof mapAuditEntry>[0]) as AuditEntry)
}
