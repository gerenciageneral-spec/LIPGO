"use client"

// Cuadro de Control consolidado: un vistazo a los 4 frentes de nómina/prestaciones
// que se cerraron y armonizaron esta sesión -- Parafiscales (aportes reales del
// mes), Liquidaciones (retirados pendientes), y Prestaciones Personal Activo
// (prima/cesantías, real vs. proyectado). Cada módulo YA tiene su propia
// pantalla detallada con edición; esto es solo el resumen ejecutivo de arriba.

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Landmark, FileClock, Wallet, CheckCircle2, Clock, Loader2 } from "lucide-react"
import { getLiquidaciones } from "@/lib/liquidaciones-actions"
import { getPrestacionesActivosPeriodo } from "@/lib/prestaciones-activos-actions"
import type { ResumenParafiscales } from "@/lib/parafiscales-actions"

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })
const IDS_LIP = [1, 2, 3, 4]

function periodoPrimaVigente(): { desde: string; hasta: string; label: string } {
  const hoy = new Date().toISOString().slice(0, 10)
  const anio = Number(hoy.slice(0, 4))
  const enSemestre2 = hoy >= `${anio}-07-01`
  return enSemestre2
    ? { desde: `${anio}-07-01`, hasta: `${anio}-12-31`, label: `2° semestre ${anio}` }
    : { desde: `${anio}-01-01`, hasta: `${anio}-06-30`, label: `1er semestre ${anio}` }
}
function periodoCesantiasVigente(): { desde: string; hasta: string; label: string } {
  const anio = Number(new Date().toISOString().slice(0, 4))
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, label: `Año ${anio}` }
}

interface Props {
  /** Resumen de Parafiscales del periodo ya seleccionado en la pantalla (se
   * reusa en vez de volver a pedirlo — mismo dato que ya se ve abajo). */
  parafiscalesResumen: ResumenParafiscales | null
  parafiscalesPeriodoLabel: string
}

export default function CuadroControlNomina({ parafiscalesResumen, parafiscalesPeriodoLabel }: Props) {
  const [loading, setLoading] = useState(true)
  const [liquidacionesPendientes, setLiquidacionesPendientes] = useState(0)
  const [liquidacionesTotal, setLiquidacionesTotal] = useState(0)
  const [primaEstado, setPrimaEstado] = useState<{ label: string; total: number; pagada: boolean; personas: number } | null>(null)
  const [cesantiasEstado, setCesantiasEstado] = useState<{ label: string; total: number; pagada: boolean; personas: number } | null>(null)

  useEffect(() => {
    let vivo = true
    async function cargar() {
      setLoading(true)
      const [liqPorId, primaP, cesP] = await Promise.all([
        Promise.all(IDS_LIP.map((id) => getLiquidaciones(id))),
        (() => {
          const p = periodoPrimaVigente()
          return getPrestacionesActivosPeriodo("prima", p.desde, p.hasta).then((r) => ({ ...r, label: p.label }))
        })(),
        (() => {
          const p = periodoCesantiasVigente()
          return getPrestacionesActivosPeriodo("cesantias", p.desde, p.hasta).then((r) => ({ ...r, label: p.label }))
        })(),
      ])
      if (!vivo) return
      let pend = 0, total = 0
      for (const r of liqPorId) {
        if (!r.success) continue
        for (const p of r.data) {
          if (p.estado === "pendiente") {
            pend += 1
            total += p.total_liquidacion
          }
        }
      }
      setLiquidacionesPendientes(pend)
      setLiquidacionesTotal(total)

      if (primaP.success) {
        const tot = primaP.data.reduce((s, x) => s + (x.valor_real ?? x.valor_calculado), 0)
        setPrimaEstado({
          label: primaP.label,
          total: tot,
          pagada: primaP.data.length > 0 && primaP.data.every((x) => x.estado === "pagada"),
          personas: primaP.data.length,
        })
      }
      if (cesP.success) {
        const tot = cesP.data.reduce((s, x) => s + (x.valor_real ?? x.valor_calculado), 0)
        setCesantiasEstado({
          label: cesP.label,
          total: tot,
          pagada: cesP.data.length > 0 && cesP.data.every((x) => x.estado === "pagada"),
          personas: cesP.data.length,
        })
      }
      setLoading(false)
    }
    cargar()
    return () => {
      vivo = false
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="h-5 w-5 text-primary" /> Cuadro de Control · Nómina y Prestaciones
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Landmark className="h-3.5 w-3.5" /> Parafiscales · {parafiscalesPeriodoLabel}
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums">{money(parafiscalesResumen?.totalPila ?? 0)}</div>
              <div className="text-xs text-muted-foreground">Total planilla PILA (aporte real)</div>
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FileClock className="h-3.5 w-3.5" /> Liquidaciones · pendientes
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums">{money(liquidacionesTotal)}</div>
              <div className="text-xs text-muted-foreground">{liquidacionesPendientes} retirado(s) sin liquidar, los 4 ID</div>
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Prestaciones Personal Activo
              </div>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Prima {primaEstado?.label ?? ""}</span>
                  {primaEstado && primaEstado.personas > 0 ? (
                    <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                      {primaEstado.pagada ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                      )}
                      {money(primaEstado.total)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">sin generar</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Cesantías {cesantiasEstado?.label ?? ""}</span>
                  {cesantiasEstado && cesantiasEstado.personas > 0 ? (
                    <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                      {cesantiasEstado.pagada ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                      )}
                      {money(cesantiasEstado.total)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">sin generar</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
