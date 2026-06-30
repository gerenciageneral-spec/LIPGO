'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'

export function useUnreadMessages(userId?: string) {
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!userId) return

    const loadUnreadCount = async () => {
      try {
        const supabase = await createClient()
        const { data, error } = await supabase
          .from('messages')
          .select('id')
          .eq('receiver_id', userId)
          .eq('is_read', false)

        if (!error && data) {
          setUnreadCount(data.length)
        }
      } catch (error) {
        console.error('[v0] Error loading unread count:', error)
      }
    }

    loadUnreadCount()

    // Subscribe to new messages
    const subscribeToMessages = async () => {
      const supabase = await createClient()
      supabase
        .channel(`unread-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${userId}`,
          },
          (payload) => {
            console.log('[v0] New unread message:', payload)
            setUnreadCount((prev) => prev + 1)
          }
        )
        .subscribe()
    }

    subscribeToMessages()
  }, [userId])

  return unreadCount
}
