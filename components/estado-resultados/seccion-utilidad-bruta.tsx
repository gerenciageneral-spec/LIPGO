"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  totalIngresos: number
  costoTotalNomina: number
  isLoading: boolean
}

const fmtCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

const fmtPct = new Intl.NumberFormat("es-CO", {
  style: "percent",
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})

/**
 * Utilidad Bruta = Ingresos totales - Costo total de nomina.
 *
 * Es un calculo derivado: NO consulta nada en BD, depende de los hooks
 * `useIngresos` y `useCostoNomina` que ya viven en el padre. Por eso
 * solo recibe los dos numeros y un flag `isLoading` que se enciende
 * mientras alguno de los dos hooks esta cargando.
 */
export default function SeccionUtilidadBruta({
  totalIngresos,
  costoTotalNomina,
  isLoading,
}: Props) {
  const utilidadBruta = totalIngresos - costoTotalNomina
  // Margen sobre ingresos. Si no hay ingresos lo dejamos en 0 para no
  // dividir por cero.
  const margen = totalIngresos > 0 ? utilidadBruta / totalIngresos : 0
  const negativa = utilidadBruta < 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Utilidad Bruta
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "flex flex-col gap-1 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
            // Color condicional: verde sutil si hay utilidad, rojo sutil si
            // hay perdida. Mantenemos paleta primary/destructive del tema.
            negativa
              ? "border-destructive/30 bg-destructive/5"
              : "border-primary/20 bg-primary/5",
          )}
        >
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Ingresos − Costo nómina
            </p>
            <p className="text-xs text-muted-foreground">
              Margen sobre ingresos:{" "}
              <span className="font-medium tabular-nums text-foreground">
                {isLoading ? "—" : fmtPct.format(margen)}
              </span>
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                negativa ? "text-destructive" : "text-primary",
              )}
            >
              {isLoading ? "—" : fmtCOP.format(utilidadBruta)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
