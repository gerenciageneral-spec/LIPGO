"use client"

import { Send, MapPin, CheckCircle2, Truck, MapPinned } from "lucide-react"
import { PanelCard } from "./panel-card"
import { EmptyState } from "./empty-state"
import { cn } from "@/lib/utils"
import type { RutaDespacho } from "@/lib/dashboard-gerencia-actions"

/**
 * Rutas de despacho. Fuente de datos:
 * `cabeceraoc` filtrada por fechacargue = hoy, tipooperacion = "Cargue".
 * Agrupa por cliente → cuenta entregados (status "Fin Operación"/"finalizado")
 * vs. pendientes. Misma tabla que "Gestión de Órdenes".
 *
 * Tema LIPGO light.
 */
function progressStyles(porcentaje: number) {
  if (porcentaje >= 90)
    return {
      bar: "bg-gradient-to-r from-emerald-500 to-emerald-400",
      text: "text-emerald-700",
      chip: "bg-emerald-100 text-emerald-700 border-emerald-300",
      glow: "from-emerald-100 to-transparent",
    }
  if (porcentaje >= 70)
    return {
      bar: "bg-gradient-to-r from-[#5bc0de] to-[#0aa1c4]",
      text: "text-[#0aa1c4]",
      chip: "bg-[#5bc0de]/10 text-[#0aa1c4] border-[#5bc0de]/40",
      glow: "from-[#5bc0de]/15 to-transparent",
    }
  if (porcentaje >= 50)
    return {
      bar: "bg-gradient-to-r from-amber-500 to-amber-400",
      text: "text-amber-700",
      chip: "bg-amber-100 text-amber-700 border-amber-300",
      glow: "from-amber-100 to-transparent",
    }
  return {
    bar: "bg-gradient-to-r from-rose-500 to-rose-400",
    text: "text-rose-700",
    chip: "bg-rose-100 text-rose-700 border-rose-300",
    glow: "from-rose-100 to-transparent",
  }
}

interface Props {
  data?: RutaDespacho[]
}

export function DespachoPanel({ data = [] }: Props) {
  const totalEntregados = data.reduce((a, r) => a + r.entregados, 0)
  const totalPendientes = data.reduce((a, r) => a + r.pendientes, 0)

  return (
    <PanelCard
      title="Despacho"
      subtitle="Rutas activas · cabeceraoc"
      icon={<Send className="h-5 w-5" />}
      iconColor="sky"
      headerRight={
        <>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {totalEntregados}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 border border-amber-300 text-xs font-semibold text-amber-700">
            <Truck className="h-3.5 w-3.5" />
            {totalPendientes}
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-2.5 max-h-[240px] overflow-y-auto pr-1">
        {data.length === 0 && (
          <EmptyState
            icon={MapPinned}
            title="Sin rutas activas"
            description="Las rutas de despacho aparecerán aquí cuando se generen órdenes de cargue."
            minHeight="200px"
          />
        )}
        {data.map((r) => {
          const s = progressStyles(r.porcentaje)
          return (
            <div
              key={r.id}
              className={cn(
                "relative rounded-xl border border-border bg-muted/40 px-3 py-2.5 overflow-hidden",
                "hover:bg-muted/70 transition-colors",
              )}
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 w-24 pointer-events-none bg-gradient-to-r opacity-60",
                  s.glow,
                )}
                aria-hidden="true"
              />
              <div className="relative flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-md border text-[10px] font-bold font-mono shrink-0",
                      s.chip,
                    )}
                  >
                    {r.id}
                  </span>
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-semibold text-foreground truncate">{r.zona}</span>
                </div>
                <span className={cn("text-sm font-bold tabular-nums", s.text)}>
                  {r.porcentaje}%
                </span>
              </div>

              <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", s.bar)}
                  style={{ width: `${r.porcentaje}%` }}
                />
              </div>

              <div className="relative flex items-center justify-between mt-2 text-[11px]">
                <span className="text-muted-foreground">
                  Entregados: <span className="text-foreground font-semibold">{r.entregados}</span>
                </span>
                <span className="text-muted-foreground">
                  Pendientes:{" "}
                  <span className="text-foreground font-semibold">{r.pendientes}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </PanelCard>
  )
}
