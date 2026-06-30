"use client"

import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Search, ArrowLeft } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { createClient } from "@/lib/supabase-client"
import { cn } from "@/lib/utils"
import { sendMessageAction, markMessagesAsReadAction } from "./actions"

interface User {
  id: string
  usuario: string
  avatar_url?: string
}

interface Message {
  id: string
  content: string
  sender_id: string
  receiver_id: string
  created_at: string
}

export default function ChatPage() {
  const { profile, loading, selectedEmpresaId } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [usersWithChats, setUsersWithChats] = useState<User[]>([])
  const [usersWithoutChats, setUsersWithoutChats] = useState<User[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [unreadByUser, setUnreadByUser] = useState<{ [key: string]: number }>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // No auth validation - just load chat
  }, [])

  // Load users
  useEffect(() => {
    if (selectedEmpresaId) {
      loadUsers()
    }
  }, [selectedEmpresaId])

  // Load messages when user is selected
  useEffect(() => {
    if (selectedUserId && profile?.id) {
      loadMessages()
      // Mark messages as read when opening a conversation
      markMessagesAsReadAction(profile.id, selectedUserId)
      // Clear unread count for this user
      setUnreadByUser((prev) => ({
        ...prev,
        [selectedUserId]: 0,
      }))
    }
  }, [selectedUserId, profile?.id])

  // Subscribe to new messages
  useEffect(() => {
    if (!profile?.id) return

    const supabasePromise = createClient()
    const subscription = supabasePromise.then((supabase) => {
      return supabase
        .channel(`messages-${profile.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `receiver_id=eq.${profile.id}`,
          },
          (payload) => {
            console.log("[v0] New unread message:", payload)
            const newMessage = payload.new as Message
            setMessages((prev) => [...prev, newMessage])
            
            // Update unread count for this user
            if (!selectedUserId || selectedUserId !== newMessage.sender_id) {
              setUnreadByUser((prev) => ({
                ...prev,
                [newMessage.sender_id]: (prev[newMessage.sender_id] || 0) + 1,
              }))
            }
          }
        )
        .subscribe()
    })

    return () => {
      subscription.then((sub) => sub?.unsubscribe())
    }
  }, [profile?.id, selectedUserId])

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const loadUsers = async () => {
    try {
      setLoadingUsers(true)
console.log("[v0] Loading users for empresa_id:", selectedEmpresaId, "profile:", profile?.id)
    const supabase = await createClient()

    // Get all users
    const { data: allUsers, error } = await supabase
      .from("profiles")
      .select("id, usuario")
      .eq("empresa_id", selectedEmpresaId)
      .neq("id", profile?.id)
        .order("usuario")

      console.log("[v0] Users load result - error:", error, "data:", allUsers)
      
      if (!error && allUsers) {
        setUsers(allUsers as User[])
        
        // Get users with active chats (users who have messages with current user)
        const { data: chatUsers } = await supabase
          .from("messages")
          .select("sender_id, receiver_id")
          .or(`sender_id.eq.${profile?.id},receiver_id.eq.${profile?.id}`)
          .limit(1000)
        
        const usersWithChatIds = new Set<string>()
        chatUsers?.forEach((msg) => {
          if (msg.sender_id === profile?.id) {
            usersWithChatIds.add(msg.receiver_id)
          } else {
            usersWithChatIds.add(msg.sender_id)
          }
        })
        
        const active = allUsers.filter((user) => usersWithChatIds.has(user.id)) as User[]
        const inactive = allUsers.filter((user) => !usersWithChatIds.has(user.id)) as User[]
        
        setUsersWithChats(active)
        setUsersWithoutChats(inactive)
        
        // Load unread messages count for each user
        const { data: unreadMessages } = await supabase
          .from("messages")
          .select("sender_id")
          .eq("receiver_id", profile?.id)
          .eq("is_read", false)
        
        console.log("[v0] Unread messages:", unreadMessages?.length)
        
        if (unreadMessages) {
          const unreadCount: { [key: string]: number } = {}
          unreadMessages.forEach((msg) => {
            unreadCount[msg.sender_id] = (unreadCount[msg.sender_id] || 0) + 1
          })
          console.log("[v0] Unread count by user:", unreadCount)
          setUnreadByUser(unreadCount)
        }
      } else if (error) {
        console.error("[v0] Error loading users:", error)
      }
    } catch (error) {
      console.error("[v0] Error loading users (catch):", error)
    } finally {
      setLoadingUsers(false)
    }
  }

  const loadMessages = async () => {
    if (!selectedUserId || !profile?.id) return
    try {
      console.log("[v0] Loading messages between", profile.id, "and", selectedUserId)
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${profile.id},receiver_id.eq.${selectedUserId}),and(sender_id.eq.${selectedUserId},receiver_id.eq.${profile.id})`
        )
        .order("created_at", { ascending: true })

      console.log("[v0] Load messages result - error:", error, "data count:", data?.length)
      if (!error && data) {
        setMessages(data as Message[])
      }
    } catch (error) {
      console.error("[v0] Error loading messages:", error)
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !selectedUserId || !profile?.id) return

    try {
      console.log("[v0] Sending message from", profile.id, "to", selectedUserId, "content:", inputValue)
      
      // Use server action to bypass RLS issues
      const result = await sendMessageAction(profile.id, selectedUserId, inputValue)
      
      console.log("[v0] Send message result - success:", result.success, "error:", result.error)
      if (result.success) {
        console.log("[v0] Message sent successfully")
        setInputValue("")
        await loadMessages()
      } else {
        console.error("[v0] Error response from action:", result.error)
      }
    } catch (error) {
      console.error("[v0] Error sending message (catch):", error)
    }
  }

  const filteredUsersWithChats = usersWithChats.filter((user) =>
    user.usuario.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  const filteredUsersWithoutChats = usersWithoutChats.filter((user) =>
    user.usuario.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const renderUsersList = (usersList: User[], title: string) => (
    <div>
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{title}</div>
      {usersList.length === 0 ? (
        <div className="px-2 py-1 text-xs text-muted-foreground">Sin usuarios</div>
      ) : (
        usersList.map((user) => (
          <button
            key={user.id}
            onClick={() => setSelectedUserId(user.id)}
            className={cn(
              "w-full p-2 rounded-md text-left transition-all duration-200 mx-1",
              selectedUserId === user.id 
                ? "bg-primary/15 shadow-sm ring-1 ring-primary/20" 
                : "hover:bg-accent/50"
            )}
          >
            <div className="flex items-center gap-2 relative">
              <div className="relative flex-shrink-0">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary/20 text-xs">{getInitials(user.usuario)}</AvatarFallback>
                </Avatar>
                {unreadByUser[user.id] > 0 && (
                  <div className="absolute top-0 right-0 h-3.5 w-3.5 bg-blue-500 rounded-full shadow-lg animate-pulse z-10 ring-2 ring-background"></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{user.usuario}</div>
              </div>
              {unreadByUser[user.id] > 0 && (
                <span className="text-xs font-bold text-white bg-blue-500 px-2 py-0.5 rounded-full min-w-fit flex-shrink-0">
                  {unreadByUser[user.id] > 9 ? '9+' : unreadByUser[user.id]}
                </span>
              )}
            </div>
          </button>
        ))
      )}
    </div>
  )

  const filteredUsers = users.filter((user) =>
    user.usuario.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const activeUser = users.find((user) => user.id === selectedUserId)
  const chatMessages = messages.filter(
    (msg) =>
      (msg.sender_id === selectedUserId || msg.sender_id === profile?.id) &&
      (msg.receiver_id === selectedUserId || msg.receiver_id === profile?.id)
  )

  const getInitials = (username: string) => {
    return username
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)
  }

  // Show loading while auth is being checked
  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with back button */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm px-6 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
      </div>

      {/* Chat container with max width and better spacing */}
      <div className="flex-1 flex overflow-hidden max-w-7xl w-full mx-auto px-4 py-4 gap-4">
        {/* Sidebar */}
        <div className="w-80 rounded-lg bg-card/50 backdrop-blur-sm border border-border/30 shadow-sm flex flex-col overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-border/20">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuario..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-background/50 border-border/30"
              />
            </div>
          </div>

          {/* Users List */}
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {loadingUsers ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Cargando usuarios...</div>
              ) : filteredUsersWithChats.length === 0 && filteredUsersWithoutChats.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">No hay usuarios disponibles</div>
              ) : (
                <>
                  {filteredUsersWithChats.length > 0 && renderUsersList(filteredUsersWithChats, "Chats Activos")}
                  {filteredUsersWithoutChats.length > 0 && renderUsersList(filteredUsersWithoutChats, "Otros Usuarios")}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className="flex-1 rounded-lg bg-card/50 backdrop-blur-sm border border-border/30 shadow-sm flex flex-col overflow-hidden">
          {selectedUserId ? (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between bg-gradient-to-r from-card/50 to-card/30">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/20 text-xs">{getInitials(activeUser?.usuario || "")}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold text-sm">{activeUser?.usuario}</div>
                    <div className="text-xs text-muted-foreground">En línea</div>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-3">
                <div className="space-y-3">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground py-8">No hay mensajes aún</div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn("flex", msg.sender_id === profile?.id ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-xs px-3 py-2 rounded-lg text-sm shadow-sm",
                            msg.sender_id === profile?.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/70 text-foreground"
                          )}
                        >
                          <p className="text-sm break-words">{msg.content}</p>
                          <span className="text-xs opacity-70 block mt-1">
                            {new Date(msg.created_at).toLocaleTimeString("es-CO", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={scrollRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="px-3 py-3 border-t border-border/20 bg-gradient-to-r from-card/30 to-card/50 flex gap-2">
                <Input
                  placeholder="Escribe un mensaje..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  className="h-9 text-sm bg-background/50 border-border/30"
                />
                <Button size="sm" onClick={handleSendMessage} className="px-3">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="text-base font-semibold mb-2">Selecciona un usuario</div>
                <div className="text-sm">para comenzar la conversación</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
