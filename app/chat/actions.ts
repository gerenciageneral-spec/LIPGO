"use server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export async function sendMessageAction(
  senderId: string,
  receiverId: string,
  content: string
) {
  try {
    console.log("[v0] Server action: sending message from", senderId, "to", receiverId)
    const supabase = await getSupabaseAdmin()
    
    const { error, data } = await supabase
      .from("messages")
      .insert([
        {
          sender_id: senderId,
          receiver_id: receiverId,
          content: content,
          created_at: new Date().toISOString(),
        },
      ])
      .select()

    if (error) {
      console.error("[v0] Server action error:", error)
      return { success: false, error: error.message }
    }

    console.log("[v0] Server action: message sent successfully", data)
    return { success: true, data }
  } catch (error) {
    console.error("[v0] Server action catch error:", error)
    return { success: false, error: String(error) }
  }
}

export async function markMessagesAsReadAction(
  receiverId: string,
  senderId: string
) {
  try {
    console.log("[v0] Server action: marking messages as read from", senderId, "to", receiverId)
    const supabase = await getSupabaseAdmin()
    
    const { error } = await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("receiver_id", receiverId)
      .eq("sender_id", senderId)
      .eq("is_read", false)

    if (error) {
      console.error("[v0] Server action error marking as read:", error)
      return { success: false, error: error.message }
    }

    console.log("[v0] Server action: messages marked as read successfully")
    return { success: true }
  } catch (error) {
    console.error("[v0] Server action catch error:", error)
    return { success: false, error: String(error) }
  }
}
