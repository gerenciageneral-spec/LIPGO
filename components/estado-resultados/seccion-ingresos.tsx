"use client"

/**
 * Sección INGRESOS del Estado de Resultados.
 *
 * Renderiza tres filas:
 *  1. Facturacion de toneladas (suma de `facturacion.valor_a_facturar`).
 *  2. Facturacion de turnos    (suma de `facturacionturnos.facturacion_total`).
 *  3. Total ingresos           (suma de las dos anteriores).
 *
 * El componente NO conoce la fuente de datos: recibe el resultado del
 * hook `useIngresos` desde el padre, lo que mantiene la seccion 100%
 * presentacional y testeable.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, AlertCircle } from "lucide-react"
import type { IngresosTotales } from "./use-ingresos"

interface Props {
  data: IngresosTotales | undefined
  isLoading: boolean
  error?: Error
  /** Texto del periodo seleccionado (ej. "Abril 2026" o "Abril 2026 (Q1: 1-15)"). */
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
              Facturacion del periodo {periodoLabel}.
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
                  <th className="px-4 py-2 text-left font-medium">
                    Concepto
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    Registros
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                <FilaConcepto
                  label="Facturacion de toneladas"
                  hint="public.facturacion · valor_a_facturar"
                  registros={data?.conteoToneladas}
                  valor={data?.toneladas}
                  isLoading={isLoading}
                />
                <FilaConcepto
                  label="Facturacion de turnos"
                  hint="public.facturacionturnos · facturacion_total"
                  registros={data?.conteoTurnos}
                  valor={data?.turnos}
                  isLoading={isLoading}
                />
                <tr className="border-t-2 border-primary/30 bg-primary/5">
                  <td className="px-4 py-3 font-semibold text-foreground">
                    Total ingresos
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {isLoading ? (
                      <Skeleton className="ml-auto h-4 w-10" />
                    ) : (
                      (data?.conteoToneladas ?? 0) +
                      (data?.conteoTurnos ?? 0)
                    )}
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
  isLoading,
}: {
  label: string
  hint: string
  registros: number | undefined
  valor: number | undefined
  isLoading: boolean
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
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
  )
}
