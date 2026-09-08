"use client"

import { Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  PROVISIONES_PRESTACIONES,
  type CostoNominaData,
} from "./use-costo-nomina"

interface Props {
  data?: CostoNominaData
  isLoading: boolean
  error: unknown
  periodoLabel: string
}

const fmtCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v)

const fmtPct = (v: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)

/**
 * Subseccion: una linea simple "concepto / porcentaje / valor".
 * Reutilizada por los dos bloques de provisiones.
 */
function FilaProvision({
  label,
  porcentaje,
  valor,
}: {
  label: string
  porcentaje: number
  valor: number | undefined
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          {fmtPct(porcentaje)}
        </span>
        <span className="w-32 text-right tabular-nums">
          {valor != null ? fmtCOP(valor) : "—"}
        </span>
      </div>
    </div>
  )
}

/** Fila de un aporte REAL (no estimado por %) — mismo layout que FilaProvision
 * pero sin columna de porcentaje, ya que el valor varia mes a mes (exoneracion
 * art. 114-1, clase de riesgo, dias trabajados). */
function FilaReal({ label, valor }: { label: string; valor: number | undefined }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="w-32 text-right tabular-nums">
        {valor != null ? fmtCOP(valor) : "—"}
      </span>
    </div>
  )
}

function FilaTotal({
  label,
  valor,
  highlight = false,
}: {
  label: string
  valor: number | undefined
  highlight?: boolean
}) {
  return (
    <div
      className={
        "flex items-center justify-between gap-4 rounded-md px-2 py-2 text-sm font-semibold " +
        (highlight ? "bg-primary/10 text-primary" : "bg-muted/40")
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">
        {valor != null ? fmtCOP(valor) : "—"}
      </span>
    </div>
  )
}

export default function SeccionCostoNomina({
  data,
  isLoading,
  error,
  periodoLabel,
}: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-base">Costo de Nomina</CardTitle>
        </div>
        <span className="text-xs text-muted-foreground">{periodoLabel}</span>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            No se pudieron cargar los datos de nomina.
          </div>
        ) : null}

        {isLoading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <>
            {/* ---------------------- Nomina base ---------------------- */}
            <div className="flex items-center justify-between gap-4 rounded-md bg-muted/30 px-2 py-2 text-sm">
              <div>
                <p className="font-medium">Total liquidado nomina</p>
                <p className="text-xs text-muted-foreground">
                  Base por dia + bono de productividad (neto por quincena) ·{" "}
                  {data?.registros ?? 0} registros
                </p>
              </div>
              <span className="tabular-nums font-semibold">
                {fmtCOP(data?.totalLiquidado ?? 0)}
              </span>
            </div>

            {/* --------------- Provisiones prestaciones --------------- */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Provision prestaciones sociales
              </h4>
              <div className="rounded-md border border-border/60 px-3 py-2">
                <FilaProvision
                  label="Provision cesantias"
                  porcentaje={PROVISIONES_PRESTACIONES.cesantias}
                  valor={data?.prestaciones.cesantias}
                />
                <FilaProvision
                  label="Provision intereses cesantias"
                  porcentaje={PROVISIONES_PRESTACIONES.interesesCesantias}
                  valor={data?.prestaciones.interesesCesantias}
                />
                <FilaProvision
                  label="Provision prima"
                  porcentaje={PROVISIONES_PRESTACIONES.prima}
                  valor={data?.prestaciones.prima}
                />
                <FilaProvision
                  label="Provision vacaciones"
                  porcentaje={PROVISIONES_PRESTACIONES.vacaciones}
                  valor={data?.prestaciones.vacaciones}
                />
                <Separator className="my-2" />
                <FilaTotal
                  label="Total provisiones prestaciones"
                  valor={data?.prestaciones.total}
                />
              </div>
            </div>

            {/* --------------- Seguridad social (aporte REAL) --------------- */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Seguridad social — aporte patronal real
              </h4>
              <p className="mb-2 text-xs text-muted-foreground">
                Por el proyecto asignado a cada persona en Head Count (LIP es una sola empresa/NIT; los ID son
                proyectos/clientes internos) — misma asignación con la que se radica en Aportes en Línea. Puede no
                coincidir exacto con "Total liquidado nómina" de arriba (esa cifra atribuye el costo al proyecto
                donde se trabajó cada día, que puede diferir del proyecto asignado en días puntuales).
              </p>
              <div className="rounded-md border border-border/60 px-3 py-2">
                <FilaReal label="Pension empresa" valor={data?.segSocial.pensionEmpresa} />
                <FilaReal label="Caja de compensacion" valor={data?.segSocial.cajaCompensacion} />
                <FilaReal label="ARL" valor={data?.segSocial.arl} />
                <FilaReal label="Salud patronal + SENA + ICBF" valor={data?.segSocial.otros} />
                <Separator className="my-2" />
                <FilaTotal
                  label="Total seguridad social (real)"
                  valor={data?.segSocial.total}
                />
              </div>
            </div>

            {/* --------------- Bonos no prestacionales --------------- */}
            {data && data.bonosNoPrestacionales > 0 ? (
              <div className="flex items-center justify-between gap-4 rounded-md bg-muted/30 px-2 py-2 text-sm">
                <div>
                  <p className="font-medium">Bonos no prestacionales</p>
                  <p className="text-xs text-muted-foreground">
                    Modulo Bonos (43/50/66) · aprobados · no cotizan IBC, sin provision
                  </p>
                </div>
                <span className="tabular-nums font-semibold">
                  {fmtCOP(data.bonosNoPrestacionales)}
                </span>
              </div>
            ) : null}

            {/* ------------------- Costo total nomina ------------------- */}
            <FilaTotal
              label="Costo total nomina"
              valor={data?.costoTotal}
              highlight
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
