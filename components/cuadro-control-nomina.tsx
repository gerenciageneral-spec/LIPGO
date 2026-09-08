"use client"

// Cuadro de Control consolidado: un vistazo de clase mundial a los 4 frentes de
// nómina/prestaciones cerrados y armonizados esta sesión -- Parafiscales
// (aporte PILA real del mes), Liquidaciones (retirados pendientes), Prima/
// Cesantías de personal ACTIVO (acumulado EN VIVO a la fecha de hoy, mismo
// concepto "Acumulado" de las planillas reales) y Vacaciones (saldo
// acumulado, con alerta cuando supera el umbral crítico). Cada módulo YA
// tiene su propia pantalla detallada con edición; esto es el resumen
// ejecutivo — a pedido explícito del usuario, con el mismo nivel de cuidado
// visual que el tablero de indicadores SST 0312.

import { useCallback, useEffect, useState } from "react"
import { Landmark, FileClock, Wallet, Palmtree, CheckCircle2, Clock, Loader2, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react"
import { getLiquidaciones } from "@/lib/liquidaciones-actions"
import { getPrestacionesActivosPeriodo, calcularPrestacionesActivos } from "@/lib/prestaciones-activos-actions"
import { getVacacionesResumen } from "@/lib/vacaciones-actions"
import type { ResumenParafiscales } from "@/lib/parafiscales-actions"

const money = (n: number) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })
const IDS_LIP = [1, 2, 3, 4]
const hoyISO = () => new Date().toISOString().slice(0, 10)

function periodoPrimaVigente(): { desde: string; hasta: string; label: string } {
  const hoy = hoyISO()
  const anio = Number(hoy.slice(0, 4))
  const enSemestre2 = hoy >= `${anio}-07-01`
  return enSemestre2
    ? { desde: `${anio}-07-01`, hasta: `${anio}-12-31`, label: `2° semestre ${anio}` }
    : { desde: `${anio}-01-01`, hasta: `${anio}-06-30`, label: `1er semestre ${anio}` }
}
function periodoCesantiasVigente(): { desde: string; hasta: string; label: string } {
  const anio = Number(hoyISO().slice(0, 4))
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, label: `Año ${anio}` }
}

type Severidad = "ok" | "warn" | "crit"

const SEVERIDAD_TOKENS: Record<Severidad, { accent: string; ring: string; badgeBg: string; badgeText: string; icon: string }> = {
  ok: {
    accent: "before:bg-emerald-500",
    ring: "ring-emerald-500/15",
    badgeBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    badgeText: "text-emerald-700 dark:text-emerald-400",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  warn: {
    accent: "before:bg-amber-500",
    ring: "ring-amber-500/15",
    badgeBg: "bg-amber-500/10 dark:bg-amber-500/15",
    badgeText: "text-amber-700 dark:text-amber-400",
    icon: "text-amber-600 dark:text-amber-400",
  },
  crit: {
    accent: "before:bg-rose-500",
    ring: "ring-rose-500/15",
    badgeBg: "bg-rose-500/10 dark:bg-rose-500/15",
    badgeText: "text-rose-700 dark:text-rose-400",
    icon: "text-rose-600 dark:text-rose-400",
  },
}

interface EstadoPrestacion {
  label: string
  acumuladoHoy: number
  personas: number
  pagada: boolean
  valorPagado: number
}

interface MetricaProps {
  icon: React.ElementType
  titulo: string
  valorPrincipal: string
  subtitulo: string
  severidad: Severidad
  chip?: string
  children?: React.ReactNode
}

function TarjetaMetrica({ icon: Icon, titulo, valorPrincipal, subtitulo, severidad, chip, children }: MetricaProps) {
  const t = SEVERIDAD_TOKENS[severidad]
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm ring-1 ${t.ring} before:absolute before:inset-y-0 before:left-0 before:w-1 ${t.accent}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className={`h-4 w-4 ${t.icon}`} /> {titulo}
        </div>
        {chip && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.badgeBg} ${t.badgeText}`}>{chip}</span>
        )}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{valorPrincipal}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</div>
      {children}
    </div>
  )
}

interface Props {
  /** Resumen de Parafiscales del periodo ya seleccionado en la pantalla (se
   * reusa en vez de volver a pedirlo — mismo dato que ya se ve abajo). */
  parafiscalesResumen: ResumenParafiscales | null
  parafiscalesPeriodoLabel: string
}

export default function CuadroControlNomina({ parafiscalesResumen, parafiscalesPeriodoLabel }: Props) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string>("")
  const [liquidacionesPendientes, setLiquidacionesPendientes] = useState(0)
  const [liquidacionesTotal, setLiquidacionesTotal] = useState(0)
  const [primaEstado, setPrimaEstado] = useState<EstadoPrestacion | null>(null)
  const [cesantiasEstado, setCesantiasEstado] = useState<EstadoPrestacion | null>(null)
  const [vacacionesSaldo, setVacacionesSaldo] = useState(0)
  const [vacacionesPersonas, setVacacionesPersonas] = useState(0)
  const [vacacionesCriticas, setVacacionesCriticas] = useState(0)

  const cargar = useCallback(async () => {
    setRefreshing(true)
    const hoy = hoyISO()
    const pPrima = periodoPrimaVigente()
    const pCes = periodoCesantiasVigente()

    const [liqPorId, primaAcum, primaCerrada, cesAcum, cesCerrada, vacPorId] = await Promise.all([
      Promise.all(IDS_LIP.map((id) => getLiquidaciones(id))),
      calcularPrestacionesActivos("prima", pPrima.desde, hoy < pPrima.hasta ? hoy : pPrima.hasta),
      getPrestacionesActivosPeriodo("prima", pPrima.desde, pPrima.hasta),
      calcularPrestacionesActivos("cesantias", pCes.desde, hoy < pCes.hasta ? hoy : pCes.hasta),
      getPrestacionesActivosPeriodo("cesantias", pCes.desde, pCes.hasta),
      Promise.all(IDS_LIP.map((id) => getVacacionesResumen(id))),
    ])

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

    const primaPagada = primaCerrada.success && primaCerrada.data.length > 0 && primaCerrada.data.every((x) => x.estado === "pagada")
    setPrimaEstado({
      label: pPrima.label,
      acumuladoHoy: primaAcum.success ? primaAcum.data.reduce((s, x) => s + x.valor_calculado, 0) : 0,
      personas: primaAcum.success ? primaAcum.data.length : 0,
      pagada: primaPagada,
      valorPagado: primaPagada ? primaCerrada.data.reduce((s, x) => s + (x.valor_real ?? x.valor_calculado), 0) : 0,
    })

    const cesPagada = cesCerrada.success && cesCerrada.data.length > 0 && cesCerrada.data.every((x) => x.estado === "pagada")
    setCesantiasEstado({
      label: pCes.label,
      acumuladoHoy: cesAcum.success ? cesAcum.data.reduce((s, x) => s + x.valor_calculado, 0) : 0,
      personas: cesAcum.success ? cesAcum.data.length : 0,
      pagada: cesPagada,
      valorPagado: cesPagada ? cesCerrada.data.reduce((s, x) => s + (x.valor_real ?? x.valor_calculado), 0) : 0,
    })

    let vacSaldo = 0, vacPersonas = 0, vacCriticas = 0
    for (const r of vacPorId) {
      for (const p of r) {
        vacSaldo += p.valor_saldo
        if (p.saldo > 0) vacPersonas += 1
        if (p.alerta === "crit") vacCriticas += 1
      }
    }
    setVacacionesSaldo(vacSaldo)
    setVacacionesPersonas(vacPersonas)
    setVacacionesCriticas(vacCriticas)

    setUltimaActualizacion(
      new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }),
    )
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const alertasCriticas: string[] = []
  const alertasAtencion: string[] = []
  if (liquidacionesPendientes > 0) alertasAtencion.push(`${liquidacionesPendientes} liquidación(es) pendiente(s)`)
  if (vacacionesCriticas > 0) alertasCriticas.push(`${vacacionesCriticas} persona(s) con saldo crítico de vacaciones (≥30 días)`)
  const totalAlertas = alertasCriticas.length + alertasAtencion.length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {totalAlertas === 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Todo al día — sin pendientes críticos
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                alertasCriticas.length > 0
                  ? "bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
                  : "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> {totalAlertas} punto(s) por revisar
            </span>
          )}
          {ultimaActualizacion && (
            <span className="text-[11px] text-muted-foreground">Actualizado {ultimaActualizacion}</span>
          )}
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      {(alertasCriticas.length > 0 || alertasAtencion.length > 0) && (
        <div className="space-y-1">
          {[...alertasCriticas, ...alertasAtencion].map((a, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${
                i < alertasCriticas.length
                  ? "bg-rose-500/5 text-rose-700 dark:text-rose-400"
                  : "bg-amber-500/5 text-amber-700 dark:text-amber-400"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {a}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando cuadro de control...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TarjetaMetrica
            icon={Landmark}
            titulo={`Parafiscales · ${parafiscalesPeriodoLabel}`}
            valorPrincipal={money(parafiscalesResumen?.totalPila ?? 0)}
            subtitulo="Total planilla PILA (aporte real)"
            severidad="ok"
            chip="REAL"
          />

          <TarjetaMetrica
            icon={FileClock}
            titulo="Liquidaciones · pendientes"
            valorPrincipal={money(liquidacionesTotal)}
            subtitulo={`${liquidacionesPendientes} retirado(s) sin liquidar, los 4 ID`}
            severidad={liquidacionesPendientes > 0 ? "warn" : "ok"}
            chip={liquidacionesPendientes > 0 ? `${liquidacionesPendientes} POR PAGAR` : "AL DÍA"}
          />

          <TarjetaMetrica
            icon={Wallet}
            titulo="Prima / Cesantías"
            valorPrincipal={money(
              (primaEstado?.pagada ? primaEstado.valorPagado : primaEstado?.acumuladoHoy ?? 0) +
                (cesantiasEstado?.pagada ? cesantiasEstado.valorPagado : cesantiasEstado?.acumuladoHoy ?? 0),
            )}
            subtitulo="Acumulado a hoy, personal activo"
            severidad="ok"
            chip="EN VIVO"
          >
            <div className="mt-2.5 space-y-1 border-t border-border/60 pt-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Prima {primaEstado?.label ?? ""}</span>
                <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                  {primaEstado?.pagada ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Clock className="h-3 w-3 text-amber-600" />
                  )}
                  {money(primaEstado?.pagada ? primaEstado.valorPagado : primaEstado?.acumuladoHoy ?? 0)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Cesantías {cesantiasEstado?.label ?? ""}</span>
                <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                  {cesantiasEstado?.pagada ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Clock className="h-3 w-3 text-amber-600" />
                  )}
                  {money(cesantiasEstado?.pagada ? cesantiasEstado.valorPagado : cesantiasEstado?.acumuladoHoy ?? 0)}
                </span>
              </div>
              <div className="flex items-center gap-1 pt-0.5 text-[10px] text-muted-foreground">
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" /> pagado real ·
                <Clock className="h-2.5 w-2.5 text-amber-600" /> en vivo, sin pagar aún
              </div>
            </div>
          </TarjetaMetrica>

          <TarjetaMetrica
            icon={Palmtree}
            titulo="Vacaciones · saldo acumulado"
            valorPrincipal={money(vacacionesSaldo)}
            subtitulo={`${vacacionesPersonas} persona(s) con saldo pendiente, los 4 ID`}
            severidad={vacacionesCriticas > 0 ? "crit" : "ok"}
            chip={vacacionesCriticas > 0 ? `${vacacionesCriticas} CRÍTICO(S)` : "AL DÍA"}
          />
        </div>
      )}
    </div>
  )
}
