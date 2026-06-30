"use client"

import { Package, CheckCircle2, Clock, AlertOctagon, Crown, Medal, Award, Users } from "lucide-react"
import { PanelCard } from "./panel-card"
import { EmptyState } from "./empty-state"
import { cn } from "@/lib/utils"
import type { PickingPacking } from "@/lib/dashboard-gerencia-actions"

/**
 * Picking / Packing — operarios activos en alistamiento.
 *
 * Fuente de datos:
 *   - Contadores (alistados/pendientes/errores) → cabeceraoc por empresa
 *     filtrada por fechacargue = hoy, campo horapicking para saber si ya
 *     fue alistado.
 *   - Top operarios → asignacionpersonal (módulo de RRHH / Aprobar Turnos).
 *
 * Tema LIPGO light.
 */
const CONTADOR_STYLES = {
  emerald: {
    box: "bg-emerald-50 border-emerald-300 hover:bg-emerald-100",
    icon: "text-emerald-700",
    value: "text-emerald-800",
    label: "text-emerald-700/80",
  },
  amber: {
    box: "bg-amber-50 border-amber-300 hover:bg-amber-100",
    icon: "text-amber-700",
    value: "text-amber-800",
    label: "text-amber-700/80",
  },
  rose: {
    box: "bg-rose-50 border-rose-300 hover:bg-rose-100",
    icon: "text-rose-700",
    value: "text-rose-800",
    label: "text-rose-700/80",
  },
} as const

const RANK_STYLES = [
  { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-300", icon: Crown },
  { bg: "bg-slate-200", text: "text-slate-700", ring: "ring-slate-300", icon: Medal },
  { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-300", icon: Award },
]

interface Props {
  data?: PickingPacking
}

export function PickingPackingPanel({ data }: Props) {
  const alistados = data?.alistados ?? 0
  const pendientes = data?.pendientes ?? 0
  const errores = data?.errores ?? 0
  const topOperarios = data?.topOperarios ?? []
  const activos = topOperarios.length

  const contadores = [
    { label: "Alistados", value: alistados, icon: CheckCircle2, color: "emerald" as const },
    { label: "Pendientes", value: pendientes, icon: Clock, color: "amber" as const },
    { label: "Errores", value: errores, icon: AlertOctagon, color: "rose" as const },
  ]

  return (
    <PanelCard
      title="Picking / Packing"
      subtitle="Alistamiento · cabeceraoc + asignacionpersonal"
      icon={<Package className="h-4 w-4" />}
      iconColor="emerald"
      headerRight={
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted border border-border">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-semibold text-foreground tabular-nums">{activos}</span>
          <span className="text-[10px] text-muted-foreground">operarios</span>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {contadores.map((c) => {
            const styles = CONTADOR_STYLES[c.color]
            const Icon = c.icon
            return (
              <div
                key={c.label}
                className={cn(
                  "rounded-xl border p-3 flex flex-col items-center gap-1 transition-colors",
                  styles.box,
                )}
              >
                <Icon className={cn("h-4 w-4", styles.icon)} />
                <div className={cn("text-2xl font-bold tabular-nums leading-none", styles.value)}>
                  {c.value}
                </div>
                <div
                  className={cn(
                    "text-[10px] font-semibold tracking-wider uppercase",
                    styles.label,
                  )}
                >
                  {c.label}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
              Top Operarios
            </span>
            <span className="text-[10px] text-muted-foreground">hoy</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {topOperarios.length === 0 && (
              <EmptyState
                icon={Users}
                title="Sin asignaciones hoy"
                description="Cuando se asignen operarios a alistamiento aparecerá el ranking."
                minHeight="140px"
              />
            )}
            {topOperarios.map((op, idx) => {
              const rs = RANK_STYLES[idx] || RANK_STYLES[2]
              const RankIcon = rs.icon
              return (
                <div
                  key={op.nombre}
                  className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2 hover:bg-muted/70 transition-colors"
                >
                  <div
                    className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center ring-1 shrink-0",
                      rs.bg,
                      rs.ring,
                    )}
                  >
                    <RankIcon className={cn("h-3.5 w-3.5", rs.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{op.nombre}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {op.pedidos} ped.
                    </span>
                    <span className="inline-flex px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[11px] font-bold tabular-nums ring-1 ring-emerald-300">
                      {op.efectividad}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </PanelCard>
  )
}
