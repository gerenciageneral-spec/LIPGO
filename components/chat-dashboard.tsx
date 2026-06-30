"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Search } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface User {
  id: string
  username: string
  avatar_url?: string
}

interface Message {
  id: string
  content: string
  sender_id: string
  created_at: string
}

interface ChatDashboardProps {
  users: User[]
  messages: Message[]
  activeChatId: string | null
  onSelectUser: (userId: string) => void
  onSendMessage: (content: string) => void
  currentUserId: string
}

export default function ChatDashboard({
  users,
  messages,
  activeChatId,
  onSelectUser,
  onSendMessage,
  currentUserId,
}: ChatDashboardProps) {
  const [inputValue, setInputValue] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // Filter users based on search
  const filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Get active user
  const activeUser = users.find((user) => user.id === activeChatId)

  // Filter messages for active chat
  const chatMessages = messages.filter(
    (msg) =>
      (msg.sender_id === activeChatId || msg.sender_id === currentUserId) &&
      (activeChatId === null ||
        messages.some(
          (m) =>
            (m.sender_id === activeChatId && m.sender_id === msg.sender_id) ||
            (m.sender_id === currentUserId && m.sender_id === msg.sender_id)
        ))
  )

  // Get last message preview for each user
  const getLastMessage = (userId: string) => {
    const userMessages = messages.filter(
      (msg) =>
        (msg.sender_id === userId && msg.sender_id !== currentUserId) ||
        (msg.sender_id === currentUserId && msg.sender_id !== userId)
    )
    return userMessages.length > 0
      ? userMessages[userMessages.length - 1].content.substring(0, 50)
      : "No hay mensajes"
  }

  // Handle send message
  const handleSendMessage = () => {
    if (inputValue.trim() && activeChatId) {
      onSendMessage(inputValue)
      setInputValue("")
    }
  }

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [chatMessages])

  // Get user avatar initials
  const getInitials = (username: string) => {
    return username
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - Users List */}
      <div className="w-[30%] border-r border-border bg-white flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground mb-4">Mensajes</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar usuarios..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 text-sm"
            />
          </div>
        </div>

        {/* Users List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No hay usuarios disponibles
              </div>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => onSelectUser(user.id)}
                  className={cn(
                    "w-full p-3 rounded-lg text-left transition-colors duration-200 hover:bg-muted",
                    activeChatId === user.id
                      ? "bg-blue-50 border-l-4 border-blue-500"
                      : "border-l-4 border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarImage src={user.avatar_url || "/placeholder.svg"} alt={user.username} />
                      <AvatarFallback className="bg-blue-100 text-blue-700">
                        {getInitials(user.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">
                        {user.username}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {getLastMessage(user.id)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Panel */}
      <div className="w-[70%] bg-white flex flex-col">
        {!activeChatId ? (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Send className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Selecciona un usuario para chatear
              </h3>
              <p className="text-sm text-muted-foreground">
                Elige un usuario del listado para empezar una conversación
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-border flex items-center gap-3 bg-white">
              <Avatar className="h-10 w-10">
                <AvatarImage
                  src={activeUser?.avatar_url || "/placeholder.svg"}
                  alt={activeUser?.username}
                />
                <AvatarFallback className="bg-blue-100 text-blue-700">
                  {getInitials(activeUser?.username || "")}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-foreground">
                  {activeUser?.username}
                </h3>
                <p className="text-xs text-muted-foreground">En línea</p>
              </div>
            </div>

            {/* Messages Container */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="flex justify-center items-center h-full">
                    <p className="text-sm text-muted-foreground">
                      No hay mensajes aún. ¡Inicia la conversación!
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-2 animate-in fade-in-50 slide-in-from-bottom-4",
                        msg.sender_id === currentUserId
                          ? "justify-end"
                          : "justify-start"
                      )}
                    >
                      {msg.sender_id !== currentUserId && (
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage
                            src={activeUser?.avatar_url || "/placeholder.svg"}
                            alt={activeUser?.username}
                          />
                          <AvatarFallback className="bg-gray-200 text-gray-700 text-xs">
                            {getInitials(activeUser?.username || "")}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={cn(
                          "max-w-xs px-4 py-2 rounded-lg",
                          msg.sender_id === currentUserId
                            ? "bg-blue-500 text-white rounded-br-none"
                            : "bg-gray-100 text-foreground rounded-bl-none"
                        )}
                      >
                        <p className="text-sm break-words">{msg.content}</p>
                        <p
                          className={cn(
                            "text-xs mt-1",
                            msg.sender_id === currentUserId
                              ? "text-blue-100"
                              : "text-muted-foreground"
                          )}
                        >
                          {new Date(msg.created_at).toLocaleTimeString(
                            "es-CO",
                            { hour: "2-digit", minute: "2-digit" }
                          )}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            {/* Input Footer */}
            <div className="p-4 border-t border-border bg-white">
              <div className="flex gap-2">
                <Input
                  placeholder="Escribe un mensaje..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
