/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { NotificationItem } from '../types/notification'
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead, getUnreadCount } from '../services/notifications'

export function useNotifications() {
  const { user } = useAuth()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setItems([])
      setUnreadCount(0)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [items, unread] = await Promise.all([
        fetchNotifications(user.id),
        getUnreadCount(user.id)
      ])
      setItems(items)
      setUnreadCount(unread)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
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

  const reload = useCallback(() => loadNotifications(), [loadNotifications])

  return { items, loading, error, unreadCount, markAsRead, markAllRead, reload }
}
