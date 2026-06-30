"use client"

import { Warehouse } from "lucide-react"
import { PanelCard } from "./panel-card"
import { cn } from "@/lib/utils"
import type { OcupacionAlmacen } from "@/lib/dashboard-gerencia-actions"

/**
 * Heat-map de posiciones 4x6 + barras por zona.
 *
 * Fuente de datos: misma lógica que el módulo "Capacidad Bodega"
 * (lib/inventory-actions.ts → getWarehouseCapacities).
 *  - `locations.capacidad` → cuánto cabe.
 *  - `saldoinvdetalle.stock_actual` → cuánto hay.
 * El porcentaje global y por zona reflejan exactamente ese módulo.
 *
 * Tema LIPGO light: celdas en verde / amarillo / rojo de baja saturación
 * sobre fondo gris muy claro.
 */
const CELL_LEVEL_STYLES = [
  "bg-muted ring-1 ring-inset ring-border",
  "bg-emerald-200/70 ring-1 ring-inset ring-emerald-300",
  "bg-amber-300/70 ring-1 ring-inset ring-amber-400",
  "bg-rose-400/70 ring-1 ring-inset ring-rose-500",
]

function zoneColor(porcentaje: number): {
  bar: string
  text: string
} {
  if (porcentaje >= 90) return { bar: "bg-rose-500", text: "text-rose-700" }
  if (porcentaje >= 75) return { bar: "bg-[#5bc0de]", text: "text-[#0aa1c4]" }
  if (porcentaje >= 50) return { bar: "bg-emerald-500", text: "text-emerald-700" }
  return { bar: "bg-amber-500", text: "text-amber-700" }
}

interface Props {
  data?: OcupacionAlmacen
}

export function AlmacenamientoPanel({ data }: Props) {
  const grid: number[][] =
    data?.grid && data.grid.length === 4
      ? data.grid
      : Array.from({ length: 4 }, () => Array(6).fill(0))

  const zonas = data?.zonas ?? []
  const unidades = data?.unidadesTotales ?? 0
  const avg = data?.porcentajeGlobal ?? 0

  return (
    <PanelCard
      title="Almacenamiento"
      subtitle={`${unidades.toLocaleString("es-CO")} uds · Capacidad Bodega`}
      icon={<Warehouse className="h-5 w-5" />}
      iconColor="emerald"
      headerRight={
        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-xs font-semibold text-emerald-700">
          {avg}%
        </span>
      }
    >
      <div className="grid grid-cols-[1fr_130px] gap-4 items-center">
        <div className="grid grid-rows-4 gap-1.5">
          {grid.map((fila, rowIdx) => (
            <div key={rowIdx} className="grid grid-cols-6 gap-1.5">
              {fila.map((level, colIdx) => (
                <div
                  key={`${rowIdx}-${colIdx}`}
                  className={cn(
                    "aspect-square rounded-md transition-transform hover:scale-110",
                    CELL_LEVEL_STYLES[Math.max(0, Math.min(3, level))],
                  )}
                  title={`Zona ${String.fromCharCode(65 + rowIdx)} — posición ${colIdx + 1}`}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {zonas.length === 0 && (
            <div className="text-[11px] text-muted-foreground text-center py-4 rounded-lg border border-dashed border-border">
              Sin zonas cargadas
            </div>
          )}
          {zonas.map((z) => {
            const c = zoneColor(z.porcentaje)
            return (
              <div
                key={z.zona}
                className="flex items-center gap-2 rounded-lg bg-muted/60 border border-border px-2 py-1.5"
              >
                <span className="text-xs font-bold text-foreground w-4">{z.zona}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", c.bar)}
                    style={{ width: `${z.porcentaje}%` }}
                  />
                </div>
                <span className={cn("text-[11px] font-semibold tabular-nums", c.text)}>
                  {z.porcentaje}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </PanelCard>
  )
}
