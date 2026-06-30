"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Receipt, AlertCircle } from "lucide-react"
import type { GastosResumen } from "./use-gastos-por-categoria"

interface Props {
  data: GastosResumen | undefined
  isLoading: boolean
  error: Error | undefined
  periodoLabel: string
}

const fmtCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

/**
 * Detalle de gastos por categoria. Una fila por cada categoria con
 * registros en el periodo + fila final "Total gastos". Si no hay datos,
 * muestra un estado vacio en vez de la tabla.
 *
 * Las categorias vienen de `gastos.categoria` (texto libre del modulo
 * Registrar Gasto), asi que la tabla es dinamica.
 */
export default function SeccionGastos({
  data,
  isLoading,
  error,
  periodoLabel,
}: Props) {
  const categorias = data?.porCategoria ?? []
  const total = data?.total ?? 0
  const cantidadTotal = data?.cantidadTotal ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-primary" />
              Gastos por categoría
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              {periodoLabel}
            </CardDescription>
          </div>
          {!isLoading && cantidadTotal > 0 && (
            <Badge variant="secondary" className="shrink-0">
              {cantidadTotal} {cantidadTotal === 1 ? "gasto" : "gastos"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">No se pudieron cargar los gastos.</p>
              <p className="text-xs opacity-80">{error.message}</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : categorias.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay gastos registrados para este periodo.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Categoría</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Cantidad
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {categorias.map((c) => (
                  <tr key={c.categoria} className="hover:bg-muted/30">
                    <td className="px-3 py-2">{c.categoria}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                      {c.cantidad}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtCOP.format(c.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-primary/5 font-semibold">
                  <td className="px-3 py-2.5">Total gastos</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {cantidadTotal}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-primary">
                    {fmtCOP.format(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
