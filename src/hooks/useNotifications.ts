/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { NotificationItem } from '../types/notification'
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead, clearAllNotifications, clearReadNotifications, getUnreadCount } from '../services/notifications'

export function useNotifications() {
  const { user } = useAuth()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  // Monotonic request id; only the newest load may write. See the long note in
  // useAddresses for why this is needed.
  //
  // This hook is the one place it matters most, because the realtime channel below reloads
  // on every change to the table. Clearing notifications therefore starts *two* loads at
  // once — the one `clearAll()` awaits, and the one the resulting DELETE event triggers —
  // and there is nothing ordering them. Whichever row set each one read depends purely on
  // where the DELETE fell relative to its SELECT, so a load that read the rows before the
  // delete could resolve last and put every cleared notification straight back on screen.
  // That is the same "Clear all does nothing" symptom as the dead Alert, from a completely
  // different cause, and it would only appear on a slow connection.
  const seq = useRef(0)

  const loadNotifications = useCallback(async () => {
    if (!user) {
      seq.current += 1
      setItems([])
      setUnreadCount(0)
      setLoading(false)
      return
    }

    const mine = ++seq.current
    setLoading(true)
    // Cleared up front, not only on success: without this a single failed load leaves
    // `error` set, and the screen stays stuck on the error view even after a later
    // reload succeeds. Clearing on entry is what makes retry actually recover.
    setError(null)
    try {
      const [rows, unread] = await Promise.all([
        fetchNotifications(user.id),
        getUnreadCount(user.id)
      ])
      if (mine !== seq.current) return
      setItems(rows)
      setUnreadCount(unread)
    } catch (err) {
      if (mine !== seq.current) return
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      // Only the newest request may clear the spinner; a stale one doing so would show a
      // settled screen while the read that matters is still in flight.
      if (mine === seq.current) setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadNotifications()
    if (!user?.id) return
    // Unique channel per hook instance: multiple screens call useNotifications() (e.g. Home tabs + notifications screen).
    // Supabase caches channels by name; same name + StrictMode double-mount causes
    // "cannot add postgres_changes callbacks after subscribe()" on second instance.
    const channelName = `notifications:${user.id}:${Math.random().toString(36).slice(2, 8)}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => loadNotifications()
      )
      .subscribe((status, err) => {
        if (err && !String(err).includes('PGRST205')) {
          console.warn('[notifications] realtime subscribe', status, err)
        }
      })
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadNotifications is keyed by user.id; including it would re-subscribe whenever the user object identity changes (e.g. after refreshUser), which is churn with no behavior change.
  }, [user?.id])

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) throw new Error('User not authenticated')
    await markNotificationAsRead(notificationId, user.id)
    setItems(prev => prev.map(item => item.id === notificationId ? { ...item, read: true } : item))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [user])

  const markAllRead = useCallback(async () => {
    if (!user) throw new Error('User not authenticated')
    await markAllNotificationsAsRead(user.id)
    setItems(prev => prev.map(item => ({ ...item, read: true })))
    setUnreadCount(0)
  }, [user])

  /**
   * Clearing updates the list from what the server just did rather than assuming.
   *
   * A filtered delete ("clear read") cannot be mirrored locally without recomputing
   * which rows the database considered read, and guessing would either leave ghosts in
   * the list or drop one the server kept. Refetching is one round trip on an action the
   * user takes deliberately, and it also picks up anything a trigger inserted since the
   * last load.
   */
  const clearAll = useCallback(async () => {
    if (!user) throw new Error('User not authenticated')
    await clearAllNotifications(user.id)
    await loadNotifications()
  }, [user, loadNotifications])

  const clearRead = useCallback(async () => {
    if (!user) throw new Error('User not authenticated')
    await clearReadNotifications(user.id)
    await loadNotifications()
  }, [user, loadNotifications])

  const reload = useCallback(() => loadNotifications(), [loadNotifications])

  return {
    items,
    loading,
    error,
    unreadCount,
    readCount: items.filter((item) => item.read).length,
    markAsRead,
    markAllRead,
    clearAll,
    clearRead,
    reload,
  }
}
