'use client';

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'

export const useChat = (currentUserId: string) => {
  const [users, setUsers] = useState([])
  const [messages, setMessages] = useState([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  
  // 1. Cargar la lista de usuarios (Profiles) para el Sidebar
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const supabase = await createClient()
        // Traemos todos menos el nuestro
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .neq('id', currentUserId) 
        setUsers(data || [])
      } catch (error) {
        console.error('[v0] Error fetching users:', error)
      }
    }
    if (currentUserId) fetchUsers()
  }, [currentUserId])

  // 2. Cargar mensajes cuando seleccionas un chat
  useEffect(() => {
    if (!activeChatId) return

    const fetchMessages = async () => {
      try {
        const supabase = await createClient()
        const { data } = await supabase
          .from('messages')
          .select('*')
          .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${activeChatId}),and(sender_id.eq.${activeChatId},receiver_id.eq.${currentUserId})`)
          .order('created_at', { ascending: true })
        
        setMessages(data || [])
      } catch (error) {
        console.error('[v0] Error fetching messages:', error)
      }
    }

    fetchMessages()
  }, [activeChatId, currentUserId])

  // 3. REALTIME: Suscripción a nuevos mensajes
  useEffect(() => {
    if (!currentUserId) return;

    const setupRealtime = async () => {
      try {
        const supabase = await createClient()
        const channel = supabase
          .channel('chat_realtime')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              // Filtro: Solo escuchar mensajes donde YO soy el receptor o el emisor
              filter: `receiver_id=eq.${currentUserId}` 
            },
            (payload) => {
              const newMessage = payload.new
              
              // A. Si el mensaje es del chat que tengo abierto actualmente
              if (newMessage.sender_id === activeChatId) {
                setMessages((prev) => [...prev, newMessage])
                // Aquí podrías marcar como leído automáticamente
              } 
              // B. Si el mensaje es de otra persona (NOTIFICACIÓN)
              else {
                 // Aquí disparas tu Toast/Notificación visual
                 console.log(`[v0] Nuevo mensaje de usuario ${newMessage.sender_id}`) 
                 // Opcional: Actualizar un contador de no leídos en el array de users
              }
            }
          )
          .subscribe()

        return () => {
          supabase.removeChannel(channel)
        }
      } catch (error) {
        console.error('[v0] Error setting up realtime:', error)
      }
    }

    setupRealtime()
  }, [currentUserId, activeChatId])

  // 4. Función para enviar mensaje
  const sendMessage = async (text: string) => {
    if (!text.trim() || !activeChatId) return

    try {
      // Optimistic UI: Agregarlo inmediatamente a la lista antes de que el servidor responda
      const optimisticMsg = {
        sender_id: currentUserId,
        receiver_id: activeChatId,
        content: text,
        created_at: new Date().toISOString()
      }
      setMessages((prev) => [...prev, optimisticMsg])

      const supabase = await createClient()
      const { error } = await supabase.from('messages').insert({
        content: text,
        sender_id: currentUserId,
        receiver_id: activeChatId
      })

      if (error) {
        console.error('[v0] Error enviando mensaje:', error)
        // Remover el mensaje optimista si hay error
        setMessages((prev) => prev.slice(0, -1))
      }
    } catch (error) {
      console.error('[v0] Unexpected error sending message:', error)
    }
  }

  return { users, messages, activeChatId, setActiveChatId, sendMessage }
}
