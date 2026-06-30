"use client"

import { Download, TruckIcon } from "lucide-react"
import { PanelCard } from "./panel-card"
import { EmptyState } from "./empty-state"
import { cn } from "@/lib/utils"
import type { ReciboVehiculo } from "@/lib/dashboard-gerencia-actions"

/**
 * Fuente de datos: `citasvehiculos` filtrada por `fechallegada = hoy` +
 * `idempresa` del usuario actual. Misma tabla/columnas que el módulo
 * "Ver Vehículos" (lib/vehicle-actions.ts).
 */
const ESTADO_STYLES: Record<
  ReciboVehiculo["estado"],
  { className: string; dot: string }
> = {
  Completado: {
    className: "bg-emerald-100 text-emerald-700 border border-emerald-300",
    dot: "bg-emerald-500",
  },
  Descargando: {
    className: "bg-[#5bc0de]/15 text-[#0aa1c4] border border-[#5bc0de]/40",
    dot: "bg-[#5bc0de] animate-pulse",
  },
  "En espera": {
    className: "bg-amber-100 text-amber-700 border border-amber-300",
    dot: "bg-amber-500",
  },
  Demora: {
    className: "bg-rose-100 text-rose-700 border border-rose-300",
    dot: "bg-rose-500 animate-pulse",
  },
}

interface Props {
  data?: ReciboVehiculo[]
}

export function ReciboDescargueePanel({ data = [] }: Props) {
  const completados = data.filter((v) => v.estado === "Completado").length
  const total = data.length

  return (
    <PanelCard
      title="Recibo / Descargue"
      subtitle="Control de muelles · citasvehiculos"
      icon={<Download className="h-5 w-5" />}
      iconColor="cyan"
      headerRight={
        <span className="px-2.5 py-1 rounded-lg bg-[#5bc0de]/10 border border-[#5bc0de]/40 text-xs font-semibold text-[#0aa1c4]">
          {completados}/{total}
        </span>
      }
    >
      <div className="overflow-hidden">
        <div className="grid grid-cols-[70px_90px_70px_70px_1fr] gap-2 px-2 pb-2 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>ID</span>
          <span>Placa</span>
          <span>Llegada</span>
          <span>Tiempo</span>
          <span>Estado</span>
        </div>

        <div className="flex flex-col divide-y divide-border max-h-[240px] overflow-y-auto">
          {data.length === 0 && (
            <EmptyState
              icon={TruckIcon}
              title="Sin vehículos en muelle"
              description="Los vehículos aparecerán aquí a medida que lleguen al CEDI."
              minHeight="180px"
            />
          )}
          {data.map((v) => {
            const s = ESTADO_STYLES[v.estado]
            return (
              <div
                key={v.id}
                className="grid grid-cols-[70px_90px_70px_70px_1fr] gap-2 px-2 py-2.5 items-center hover:bg-muted/50 transition-colors"
              >
                <span className="text-xs font-mono text-muted-foreground">{v.id}</span>
                <span className="text-xs font-semibold text-foreground">{v.placa}</span>
                <span className="text-xs text-foreground font-mono">{v.llegada}</span>
                <span className="text-xs text-muted-foreground">{v.tiempoMin} min</span>
                <span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold",
                      s.className,
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                    {v.estado}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </PanelCard>
  )
}
