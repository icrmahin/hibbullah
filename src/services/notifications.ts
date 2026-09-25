import { supabase } from '../lib/supabase'
import { mapNotification } from '../lib/mappers'
import { NOTIFICATION_LIMIT } from '../constants/limits'
import type { NotificationItem } from '../types/notification'

/**
 * Notifications are created by database triggers, never by the client: an order or
 * return changing status is the thing that produces one, and `notify_user` is
 * SECURITY DEFINER so those triggers bypass the revoked INSERT grant. Nothing here
 * inserts, which is why the app can trust that every row describes something that
 * really happened.
 *
 * Reads are bounded by `NOTIFICATION_LIMIT`, which the database also enforces by
 * trimming on insert. The limit is not a guess: the table cannot hold more than that
 * per user, so this is the whole list rather than a truncated one.
 */
export async function fetchNotifications(
  userId: string,
  limit: number = NOTIFICATION_LIMIT,
): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data || []).map((r) => mapNotification(r as unknown as Parameters<typeof mapNotification>[0]) as NotificationItem).filter(Boolean) as NotificationItem[]
}

export async function markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)
  if (error) throw error
}

/**
 * Remove every notification belonging to the user.
 *
 * Deletes the rows outright rather than marking them read: the cap is enforced by
 * deleting the oldest, so a "clear" that only flipped a flag would leave the list
 * still full and still subject to trimming. `.eq('user_id', userId)` is not redundant
 * with RLS — it is what keeps the intent obvious, and RLS is the backstop.
 */
export async function clearAllNotifications(userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('user_id', userId)
  if (error) throw error
}

/**
 * Remove only the notifications already read, keeping unread ones.
 *
 * This is the option worth having by default: someone clearing "the clutter" usually
 * wants the things they have not dealt with yet to survive.
 */
export async function clearReadNotifications(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('read', true)
  if (error) throw error
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)

  if (error) throw error
  return count || 0
}
