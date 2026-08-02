"use client"

/**
 * Sección INGRESOS del Estado de Resultados.
 *
 * Renderiza hasta cuatro filas EXPANDIBLES (drill-down: al tocar una fila se
 * ven las operaciones facturadas que la componen) + el total:
 *  1. Facturacion de toneladas → detalle por operación × owner.
 *  2. Facturacion de turnos (vista) → detalle por puesto. (Solo proyectos ≠ Avimol.)
 *  3. Produccion, turnos y HE — Avimol (conciliación) → 3 sublíneas. (Solo si el
 *     alcance incluye id2.)
 *  4. Cargos fijos → detalle por concepto.
 *
 * El componente NO conoce la fuente de datos: recibe el resultado del hook
 * `useIngresos` desde el padre; sigue 100% presentacional.
 */

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, AlertCircle, ChevronDown, ChevronRight } from "lucide-react"
import type { DetalleIngreso, IngresosTotales } from "./use-ingresos"

interface Props {
  data: IngresosTotales | undefined
  isLoading: boolean
  error?: Error
  /** Texto del periodo seleccionado (ej. "Abril 2026" o "2026 (año completo)"). */
  periodoLabel: string
}

const formatoCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

export default function SeccionIngresos({
  data,
  isLoading,
  error,
  periodoLabel,
}: Props) {
  const totalRegistros =
    (data?.conteoToneladas ?? 0) +
    (data?.conteoTurnosVista ?? 0) +
    (data?.conteoConciliacion ?? 0) +
    (data?.conteoFijos ?? 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
              Ingresos
            </CardTitle>
            <CardDescription>
              Facturacion del periodo {periodoLabel}. Toca una fila para ver su detalle.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            <span>{error.message}</span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Concepto</th>
                  <th className="px-4 py-2 text-right font-medium">Registros</th>
                  <th className="px-4 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                <FilaConcepto
                  label="Facturacion de toneladas"
                  hint="public.facturacion · valor_a_facturar · detalle por operación × owner"
                  registros={data?.conteoToneladas}
                  valor={data?.toneladas}
                  detalle={data?.detalleToneladas}
                  conToneladas
                  isLoading={isLoading}
                />
                {(isLoading || (data?.turnosVista ?? 0) > 0 || (data?.conteoTurnosVista ?? 0) > 0) && (
                  <FilaConcepto
                    label="Facturacion de turnos"
                    hint="public.facturacionturnos · facturacion_total · detalle por puesto"
                    registros={data?.conteoTurnosVista}
                    valor={data?.turnosVista}
                    detalle={data?.detalleTurnosVista}
                    isLoading={isLoading}
                  />
                )}
                {(isLoading || (data?.turnosConciliacion ?? 0) > 0 || (data?.conteoConciliacion ?? 0) > 0) && (
                  <FilaConcepto
                    label="Produccion, turnos y horas extra — Avimol"
                    hint="getConciliacionAvimol · produccion aprobada + turnos aprobados + horas extra (registros = dias con datos)"
                    registros={data?.conteoConciliacion}
                    valor={data?.turnosConciliacion}
                    detalle={data?.detalleConciliacion}
                    isLoading={isLoading}
                  />
                )}
                <FilaConcepto
                  label="Cargos fijos"
                  hint="cargos_fijos_generados · $2M Manejo de Inventario (id1/id3), 600 ton fijas Avimol, alquiler de montacargas facturado"
                  registros={data?.conteoFijos}
                  valor={data?.fijos}
                  detalle={data?.detalleFijos}
                  isLoading={isLoading}
                />
                <tr className="border-t-2 border-primary/30 bg-primary/5">
                  <td className="px-4 py-3 font-semibold text-foreground">
                    Total ingresos
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {isLoading ? <Skeleton className="ml-auto h-4 w-10" /> : totalRegistros.toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-primary tabular-nums">
                    {isLoading ? (
                      <Skeleton className="ml-auto h-5 w-32" />
                    ) : (
                      formatoCOP.format(data?.total ?? 0)
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function FilaConcepto({
  label,
  hint,
  registros,
  valor,
  detalle,
  conToneladas = false,
  isLoading,
}: {
  label: string
  hint: string
  registros: number | undefined
  valor: number | undefined
  detalle: DetalleIngreso[] | undefined
  /** Muestra la columna de toneladas en el detalle (fila de toneladas). */
  conToneladas?: boolean
  isLoading: boolean
}) {
  const [abierta, setAbierta] = useState(false)
  const tieneDetalle = (detalle?.length ?? 0) > 0

  return (
    <>
      <tr
        className={`border-b last:border-0 ${tieneDetalle ? "cursor-pointer hover:bg-muted/40" : ""}`}
        onClick={() => tieneDetalle && setAbierta((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-start gap-1.5">
            {tieneDetalle ? (
              abierta ? (
                <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <div>
              <div className="font-medium text-foreground">{label}</div>
              <div className="text-xs text-muted-foreground">{hint}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
          {isLoading ? (
            <Skeleton className="ml-auto h-4 w-10" />
          ) : (
            (registros ?? 0).toLocaleString("es-CO")
          )}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {isLoading ? (
            <Skeleton className="ml-auto h-4 w-28" />
          ) : (
            formatoCOP.format(valor ?? 0)
          )}
        </td>
      </tr>
      {abierta &&
        (detalle ?? []).map((d) => (
          <tr key={d.nombre} className="border-b bg-muted/20 last:border-0">
            <td className="py-2 pl-12 pr-4 text-xs text-muted-foreground">
              {d.nombre}
              {conToneladas && d.toneladas !== undefined && (
                <span className="ml-2 tabular-nums">
                  · {d.toneladas.toLocaleString("es-CO", { maximumFractionDigits: 1 })} t
                </span>
              )}
            </td>
            <td className="px-4 py-2 text-right text-xs text-muted-foreground tabular-nums">
              {d.registros.toLocaleString("es-CO")}
            </td>
            <td className="px-4 py-2 text-right text-xs tabular-nums">{formatoCOP.format(d.valor)}</td>
          </tr>
        ))}
    </>
  )
}
