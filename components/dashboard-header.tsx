"use client"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Home, User, Clock, Package, CheckCircle2, FileText, LogOut } from "lucide-react"
import Image from "next/image"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DashboardHeaderProps {
  onBack?: () => void
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 shadow-sm min-w-[120px] flex-shrink-0">
      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 flex-shrink-0">
        <Icon className="h-2.5 w-2.5 text-primary" />
      </div>
      <div className="flex flex-col">
        <span className="text-[8px] sm:text-[10px] text-muted-foreground leading-tight whitespace-nowrap">{label}</span>
        <span className="text-xs sm:text-sm font-semibold text-foreground leading-tight">{value}</span>
      </div>
    </div>
  )
}

export function DashboardHeader({ onBack }: DashboardHeaderProps) {
  const { profile, signOut, selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const router = useRouter()

  console.log("[v0] DashboardHeader: Profile data:", profile)

  const handleSignOut = async () => {
    await signOut()
    router.push("/login")
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container mx-auto px-2 sm:px-4 md:px-6 lg:px-8">
        <div className="flex flex-col gap-1.5 py-1.5 sm:flex-row sm:h-16 sm:items-center sm:justify-between sm:gap-4 sm:py-0">
          {/* Logo and user info row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              {onBack && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onBack}
                  className="h-6 w-6 sm:h-10 sm:w-10 text-muted-foreground hover:text-foreground hover:bg-accent"
                  aria-label="Volver al inicio"
                >
                  <Home className="h-3 w-3 sm:h-5 sm:w-5" />
                </Button>
              )}
              <div className={`flex items-center ${onBack ? "cursor-pointer" : ""}`} onClick={onBack}>
                <Image
                  src="/lipgo-logo.png"
                  alt="LiPGO"
                  width={200}
                  height={60}
                  className="h-7 sm:h-12 w-auto"
                  priority
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                    <Avatar className="h-6 w-6 border-2 border-border">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm font-medium">
                      {profile ? profile.usuario : "Usuario"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel className="text-base">Información de Sesión</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {profile ? (
                    <div className="px-3 py-3 space-y-3">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">ID de Empresa</div>
                        <div className="text-lg font-bold text-primary">{selectedEmpresaId || profile.empresa_id}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">Empresa</div>
                        <div className="text-base font-semibold text-foreground">{selectedEmpresaNombre || profile.empresa_nombre}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">Usuario</div>
                        <div className="text-base font-medium text-foreground">{profile.usuario}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Cargando información de sesión...</div>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Cerrar Sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div
            className="flex items-center gap-1.5 sm:gap-3 overflow-x-auto overflow-y-hidden pb-1 sm:pb-0 sm:flex-1 sm:px-2 scrollbar-hide -mx-2 px-2 sm:mx-0"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <StatCard icon={Clock} label="Ordenes en proceso" value={5} />
            <StatCard icon={Package} label="Traslados por recibir" value={3} />
            <StatCard icon={CheckCircle2} label="Ordenes terminadas" value={7} />
            <StatCard icon={FileText} label="Pedidos por aprobar" value={6} />
          </div>
        </div>
      </div>
    </header>
  )
}
