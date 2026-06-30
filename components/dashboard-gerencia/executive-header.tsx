"use client"

import { useEffect, useState } from "react"
import {
  Radio,
  MapPin,
  ShieldCheck,
  Circle,
  Wifi,
  Search,
  Bell,
  ChevronDown,
  Clock,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Encabezado ejecutivo del Dashboard Gerencia. Muestra:
 * - Titulo "Centro de Control Logistico" + fecha actual en espanol.
 * - Badge "TIEMPO REAL" pulsante.
 * - Selector de sede (empresas accesibles desde useAuth).
 * - Indicador "Conexion Segura".
 * - "EN VIVO" + reloj Bogota en vivo (refresco cada segundo).
 * - Indicador de senal (mock 99.9%).
 * - Accesos rapidos: buscar, notificaciones, perfil.
 *
 * Tema LIPGO claro: fondo F4F7FC, cards blancas, texto #343a40,
 * bordes #dee2e6, acento primario #5bc0de.
 */
export function ExecutiveHeader() {
  const { profile, accessibleEmpresas, selectedEmpresaId, selectedEmpresaNombre, setSelectedEmpresaId } = useAuth()

  // Reloj en vivo hora Bogota
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const fecha = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  })
    .format(now)
    // Convertimos la primera letra de cada palabra a mayuscula para estetica
    .replace(/\b\p{L}/gu, (m) => m.toUpperCase())

  const hora = new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  }).format(now)

  // UserProfile expone `usuario` y `empresa_nombre`; usamos esos campos.
  const usuarioLabel = profile?.usuario || "Usuario"
  const empresaLabel = selectedEmpresaNombre || profile?.empresa_nombre || "Todas las Sedes"

  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between animate-in fade-in slide-in-from-top-2 duration-500">
      {/* Izquierda: titulo + fecha */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight text-balance">
          Centro de Control Logístico
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{fecha}</p>
      </div>

      {/* Derecha: cluster de status + acciones. En mobile scrollea horizontalmente. */}
      <div className="flex items-center gap-2 overflow-x-auto md:flex-wrap pb-0.5 -mx-1 px-1 [scrollbar-width:thin]">
        {/* TIEMPO REAL */}
        <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#5bc0de]/10 border border-[#5bc0de]/40">
          <Radio className="h-3.5 w-3.5 text-[#0aa1c4]" />
          <span className="text-[10px] font-bold tracking-widest text-[#0aa1c4] uppercase">
            Tiempo Real
          </span>
        </div>

        {/* Selector de sede */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border hover:bg-muted transition-colors shadow-sm"
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground max-w-[140px] truncate">
                {empresaLabel}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            {accessibleEmpresas.length === 0 ? (
              <DropdownMenuItem disabled>Sin sedes disponibles</DropdownMenuItem>
            ) : (
              accessibleEmpresas.map((e) => (
                <DropdownMenuItem
                  key={e.id}
                  onClick={() => setSelectedEmpresaId(e.id)}
                  className={e.id === selectedEmpresaId ? "bg-accent text-accent-foreground" : undefined}
                >
                  {e.nombre}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Conexion Segura */}
        <div className="shrink-0 hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border shadow-sm">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-[11px] font-medium text-foreground leading-tight">
            Conexión
            <br />
            Segura
          </span>
        </div>

        {/* EN VIVO + Reloj */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300">
          <div className="flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-bold tracking-wider text-emerald-700">
              EN
              <br />
              VIVO
            </span>
          </div>
          <div className="flex items-center gap-1 border-l border-emerald-300 pl-2">
            <Clock className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-mono text-xs font-bold text-foreground tabular-nums">{hora}</span>
          </div>
        </div>

        {/* Senal */}
        <div className="shrink-0 hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border shadow-sm">
          <Wifi className="h-3.5 w-3.5 text-[#0aa1c4]" />
          <span className="text-[11px] font-medium text-foreground">99.9%</span>
        </div>

        {/* Acciones */}
        <button
          type="button"
          aria-label="Buscar"
          className="shrink-0 p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shadow-sm"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Notificaciones"
          className="shrink-0 relative p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shadow-sm"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 ring-2 ring-background" />
          </span>
        </button>

        {/* Perfil */}
        <div className="shrink-0 flex items-center gap-2 pl-2 ml-1 border-l border-border">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-foreground capitalize">{usuarioLabel}</div>
            <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
              {empresaLabel}
            </div>
          </div>
          <div className="relative">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#5bc0de] to-[#0aa1c4] flex items-center justify-center text-white font-bold text-sm ring-2 ring-[#5bc0de]/40">
              {(usuarioLabel[0] || "U").toUpperCase()}
            </div>
            <Circle
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-emerald-500 fill-emerald-500 stroke-background"
              strokeWidth={3}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
