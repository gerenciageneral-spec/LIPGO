"use client"

import {
  Bell,
  AlertTriangle,
  Clock,
  PackageSearch,
  Truck,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
} from "lucide-react"
import { PanelCard } from "./panel-card"
import { EmptyState } from "./empty-state"
import { cn } from "@/lib/utils"
import type { AlertaInteligente } from "@/lib/dashboard-gerencia-actions"

/**
 * Alertas inteligentes — derivadas a partir de los otros paneles
 * (recibo, rutas, almacen) en `fetchAlertas` del server action.
 *
 * Tema LIPGO light.
 */
const NIVEL_STYLES: Record<
  AlertaInteligente["prioridad"],
  { iconBox: string; iconColor: string; dot: string }
> = {
  critica: {
    iconBox: "bg-rose-100 ring-rose-300",
    iconColor: "text-rose-700",
    dot: "bg-rose-500",
  },
  alta: {
    iconBox: "bg-amber-100 ring-amber-300",
    iconColor: "text-amber-700",
    dot: "bg-amber-500",
  },
  media: {
    iconBox: "bg-sky-100 ring-sky-300",
    iconColor: "text-sky-700",
    dot: "bg-sky-500",
  },
}

const TIPO_ICON: Record<AlertaInteligente["tipo"], typeof AlertTriangle> = {
  inventario: PackageSearch,
  retraso: Clock,
  vehiculo: Truck,
  sistema: ShieldAlert,
}

interface Props {
  data?: AlertaInteligente[]
}

export function AlertasActivasPanel({ data = [] }: Props) {
  const criticas = data.filter((a) => a.prioridad === "critica").length

  return (
    <PanelCard
      title="Alertas Activas"
      subtitle={
        data.length === 0
          ? "Sin alertas"
          : criticas > 0
            ? `${criticas} crítica${criticas === 1 ? "" : "s"}`
            : `${data.length} activa${data.length === 1 ? "" : "s"}`
      }
      icon={
        <div className="relative">
          <Bell className="h-4 w-4" />
          {criticas > 0 && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center ring-1 ring-card">
              {criticas}
            </span>
          )}
        </div>
      }
      iconColor="rose"
      headerRight={
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-100 border border-violet-300">
          <Sparkles className="h-3 w-3 text-violet-700" />
          <span className="text-[10px] font-bold tracking-wider text-violet-700 uppercase">
            LIPGO AI
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto">
        {data.length === 0 && (
          <EmptyState
            icon={CheckCircle2}
            title="Operación estable"
            description="No hay alertas activas. LIPGO AI sigue monitoreando en segundo plano."
            minHeight="220px"
          />
        )}
        {data.map((a) => {
          const s = NIVEL_STYLES[a.prioridad]
          const Icon = TIPO_ICON[a.tipo] || AlertTriangle
          return (
            <div
              key={a.id}
              className="group relative flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5 hover:bg-muted/70 transition-colors"
            >
              <div
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center ring-1 shrink-0",
                  s.iconBox,
                )}
              >
                <Icon className={cn("h-4 w-4", s.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{a.titulo}</span>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      s.dot,
                      a.prioridad === "critica" && "animate-pulse",
                    )}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{a.descripcion}</div>
              </div>
              <div className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{a.hace}</div>
            </div>
          )
        })}
      </div>
    </PanelCard>
  )
}
