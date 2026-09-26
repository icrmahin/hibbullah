/**
 * Turn the `old_value` / `new_value` JSON blobs on an audit row into the handful of fields
 * that actually changed.
 *
 * The audit log captured the full row before and after every change, and then displayed
 * none of it: each entry read as "UPDATE · order_items, System, 22:13:10". An admin could
 * see that something had happened to an order line and had no way to find out what, which
 * is the one question an audit log exists to answer. The blobs were still arriving, so the
 * data was there and only the screen was missing it.
 *
 * Both values are kept as strings by `mapAuditEntry` because a row can hold a shape the
 * app has no type for. Parsing is therefore best-effort, and an unparseable value yields
 * no diff rather than an exception — a malformed blob should cost one entry's detail, not
 * the whole screen.
 */

/** One field that differs between the row before and after the change. */
export type AuditFieldChange = {
  field: string
  /** Rendered previous value, or null when the field is new. */
  from: string | null
  /** Rendered new value, or null when the field was removed. */
  to: string | null
}

const asObject = (raw?: string): Record<string, unknown> => {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** Render a JSON scalar for display. Truncated so one huge field cannot fill the card. */
const render = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.length > 60 ? `"${value.slice(0, 57)}…"` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const json = JSON.stringify(value)
  if (json === undefined) return null
  return json.length > 60 ? `${json.slice(0, 57)}…` : json
}

/**
 * `id` is the row's own primary key. It is in both blobs for an UPDATE and is the least
 * informative field on the page, so showing it wastes the space the real change needs.
 */
const IGNORED = new Set(['id'])

/**
 * Fields whose change is worth showing, most significant first.
 *
 * Without a cap an INSERT shows every column of the row, and a long order line pushes the
 * actual state change off the card. Ordered so the money and quantity moves come first.
 */
const INTERESTING = [
  'status', 'quantity', 'total', 'unit_price', 'price', 'stock', 'discount', 'delivery_fee',
  'subtotal', 'reason', 'name', 'title', 'body', 'is_active', 'expiry_date', 'batch_number',
]

const rank = (field: string) => {
  const i = INTERESTING.indexOf(field)
  return i === -1 ? INTERESTING.length : i
}

/**
 * The changed fields between two audit blobs, most significant first.
 *
 * `maxFields` bounds the result so a wide row cannot turn a one-line-per-entry list into a
 * wall of text. The caller is told how many were dropped via the returned array's length
 * before slicing — see `auditChangeSummary` for the display string.
 */
export function diffAuditValues(oldValue?: string, newValue?: string, maxFields = 4): {
  changes: AuditFieldChange[]
  hidden: number
} {
  const before = asObject(oldValue)
  const after = asObject(newValue)
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])

  const changes: AuditFieldChange[] = []
  for (const field of fields) {
    if (IGNORED.has(field)) continue
    const a = before[field]
    const b = after[field]
    // Compare the rendered form, so `120` and `"120"` are not reported as a change.
    if (render(a) === render(b)) continue
    changes.push({ field, from: render(a), to: render(b) })
  }

  changes.sort((x, y) => rank(x.field) - rank(y.field) || x.field.localeCompare(y.field))
  return { changes: changes.slice(0, maxFields), hidden: changes.length - maxFields }
}
