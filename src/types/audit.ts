export type AuditEntry = {
  id: string;
  /**
   * The actor's display name, or a short form of their id, or 'System'.
   *
   * `audit_entries.actor_id` is a bare uuid, and the rows written by database triggers --
   * which is most of them -- have a null actor_id because no signed-in user caused them.
   * Both cases used to render as a raw uuid or an empty line.
   */
  actorName: string;
  /** The raw uuid, kept for the copy-to-clipboard case where an admin needs the id. */
  actor: string;
  action: string;
  timestamp: string;
  recordType: string;
  oldValue?: string;
  newValue?: string;
};
