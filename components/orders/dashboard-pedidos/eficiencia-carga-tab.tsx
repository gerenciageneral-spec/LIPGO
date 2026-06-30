"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  CheckCircle2,
  PackageOpen,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { KpiCard } from "./kpi-card"
import { PeriodFilter, usePeriodFilter } from "./period-filter"
import {
  calcBrechasCarga,
  calcCumplimientoGlobalPct,
  calcCumplimientoPorMes,
  calcTasaCargaPerfectaPct,
  calcTotalUnidadesPendientes,
  fmtFloat1,
  fmtInt,
  fmtPct,
} from "./calculations"
import type { PedidoCabecera, PedidoDetalle } from "./types"

interface Props {
  /**
   * `cabecera` se usa para construir el filtro de Año/Mes y para cruzar
   * `idpedido` cuando necesitamos la fecha (chart mes a mes).
   */
  cabecera: PedidoCabecera[]
  detalle: PedidoDetalle[]
}

/**
 * Tab 3: Eficiencia de Carga e In-Full.
 *
 * Enfoque: SOLO unidades pedidas vs cargadas. No usa peso_bascula ni
 * ningun calculo de precision de bascula.
 *
 * Layout:
 *   - Fila 1: 3 KPI cards (Pendientes, % Cumplimiento Global, Carga Perfecta).
 *   - Fila 2: LineChart full-width "% Cumplimiento mes a mes"
 *             (agrupado por `fechadeentrega`).
 *   - Fila 3: tabla "Brechas de Carga" (solo pedidas vs cargadas).
 */
export function EficienciaCargaTab({ cabecera, detalle }: Props) {
  const filter = usePeriodFilter(cabecera, detalle)
  const cab = filter.filteredCabecera
  const det = filter.filteredDetalle

  const kpis = useMemo(
    () => ({
      pendientes: calcTotalUnidadesPendientes(det),
      cumplimientoGlobal: calcCumplimientoGlobalPct(det),
      cargaPerfecta: calcTasaCargaPerfectaPct(det),
    }),
    [det],
  )

  // Serie mensual cruzando cabecera.fecha con detalle por idpedido.
  const cumplimientoMes = useMemo(
    () => calcCumplimientoPorMes(cab, det),
    [cab, det],
  )

  // Insights derivados de la serie: promedio movil 3M, mejor/peor mes,
  // delta vs mes anterior. Sirven para enriquecer el header del chart
  // sin recalcular en cada render.
  const tendenciaInsights = useMemo(() => {
    if (cumplimientoMes.length === 0) {
      return null
    }
    const last = cumplimientoMes[cumplimientoMes.length - 1]
    const prev =
      cumplimientoMes.length >= 2
        ? cumplimientoMes[cumplimientoMes.length - 2]
        : null
    const delta = prev ? last.cumplimiento - prev.cumplimiento : 0

    const ultimos3 = cumplimientoMes.slice(-3)
    const promMovil =
      ultimos3.reduce((acc, m) => acc + m.cumplimiento, 0) / ultimos3.length

    let mejor = cumplimientoMes[0]
    let peor = cumplimientoMes[0]
    for (const m of cumplimientoMes) {
      if (m.cumplimiento > mejor.cumplimiento) mejor = m
      if (m.cumplimiento < peor.cumplimiento) peor = m
    }

    return { last, prev, delta, promMovil, mejor, peor }
  }, [cumplimientoMes])

  const brechas = useMemo(() => calcBrechasCarga(det, 50), [det])

  return (
    <div className="space-y-4">
      <PeriodFilter
        year={filter.year}
        month={filter.month}
        day={filter.day}
        setYear={filter.setYear}
        setMonth={filter.setMonth}
        setDay={filter.setDay}
        years={filter.years}
        days={filter.days}
        reset={filter.reset}
        isActive={filter.isActive}
        totalPedidos={filter.meta.totalPedidos}
        filteredPedidos={filter.meta.filteredPedidos}
      />

      {/* Fila 1: KPIs (3 cards en lg). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="% Cumplimiento Global"
          value={fmtPct(kpis.cumplimientoGlobal)}
          icon={CheckCircle2}
          variant="success"
          subtext="cargadas / pedidas (acumulado)"
        />
        <KpiCard
          label="Tasa de Carga Perfecta"
          value={fmtPct(kpis.cargaPerfecta)}
          icon={Target}
          variant="primary"
          subtext="líneas con cargadas = pedidas"
        />
        <KpiCard
          label="Total Unidades Pendientes"
          value={fmtInt(kpis.pendientes)}
          icon={PackageOpen}
          variant="danger"
          subtext="suma de unidadespendientes"
        />
      </div>

      {/* Fila 2: LineChart de cumplimiento mes a mes. */}
      <Card className="border-border/60">
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base">
              % Cumplimiento de Entregas — Mes a Mes
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Evolución de{" "}
              <code className="rounded bg-muted px-1">
                unidadescargadas / unidades
              </code>{" "}
              agrupado por{" "}
              <code className="rounded bg-muted px-1">fechadeentrega</code> de
              cabecera, cruzando el detalle por{" "}
              <code className="rounded bg-muted px-1">idpedido</code>.
            </p>
          </div>
          {tendenciaInsights ? (
            <div className="flex flex-wrap gap-2 shrink-0">
              <InsightChip
                label="Último mes"
                value={`${fmtFloat1(tendenciaInsights.last.cumplimiento)}%`}
                hint={tendenciaInsights.last.label}
              />
              <InsightChip
                label="Δ vs mes anterior"
                value={`${tendenciaInsights.delta >= 0 ? "+" : ""}${fmtFloat1(tendenciaInsights.delta)} pp`}
                tone={tendenciaInsights.delta >= 0 ? "success" : "danger"}
                trendIcon={
                  tendenciaInsights.delta >= 0 ? TrendingUp : TrendingDown
                }
              />
              <InsightChip
                label="Promedio 3M"
                value={`${fmtFloat1(tendenciaInsights.promMovil)}%`}
                tone="muted"
              />
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="pt-0">
          {cumplimientoMes.length === 0 ? (
            <EmptyState text="No hay datos de cumplimiento mensuales para el rango seleccionado." />
          ) : (
            <>
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={cumplimientoMes}
                    margin={{ top: 8, right: 24, left: 0, bottom: 24 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--popover-foreground)",
                        fontSize: 12,
                      }}
                      formatter={(_value, _name, item) => {
                        const p = item?.payload as
                          | (typeof cumplimientoMes)[number]
                          | undefined
                        if (!p) return ["—", ""]
                        const lines = [
                          `${fmtFloat1(p.cumplimiento)}%`,
                          `${fmtInt(p.cargadas)} / ${fmtInt(p.pedidas)} und`,
                        ]
                        if (p.pendientes > 0) {
                          lines.push(`${fmtInt(p.pendientes)} pend.`)
                        }
                        return [lines.join(" · "), "Cumplimiento"]
                      }}
                    />
                    {tendenciaInsights ? (
                      <ReferenceLine
                        y={tendenciaInsights.promMovil}
                        stroke="var(--muted-foreground)"
                        strokeDasharray="4 4"
                        label={{
                          value: `Prom. 3M ${fmtFloat1(tendenciaInsights.promMovil)}%`,
                          fill: "var(--muted-foreground)",
                          fontSize: 10,
                          position: "insideTopRight",
                        }}
                      />
                    ) : null}
                    <Line
                      type="monotone"
                      dataKey="cumplimiento"
                      stroke="var(--chart-1)"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: "var(--chart-1)" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Mejor / peor mes como mini-cards al pie del chart */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <MiniHighlight
                  label="Mejor mes"
                  value={`${fmtFloat1(tendenciaInsights!.mejor.cumplimiento)}%`}
                  caption={tendenciaInsights!.mejor.label}
                  tone="success"
                />
                <MiniHighlight
                  label="Peor mes"
                  value={`${fmtFloat1(tendenciaInsights!.peor.cumplimiento)}%`}
                  caption={tendenciaInsights!.peor.label}
                  tone="danger"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Fila 3: tabla "Brechas de Carga" — solo pedidas vs cargadas. */}
      <Card className="border-border/60">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Brechas de Carga
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Líneas con pendientes &gt; 0 o cargadas &lt; pedidas. Mayor
              brecha primero.
            </p>
          </div>
          <Badge variant="outline" className="font-mono">
            {fmtInt(brechas.length)} líneas
          </Badge>
        </CardHeader>
        <CardContent className="pt-0">
          {brechas.length === 0 ? (
            <EmptyState text="Sin brechas de carga: todas las líneas evaluables están completas." />
          ) : (
            // Mismo patron sticky thead que en otras tablas del dashboard.
            <div className="rounded-md border max-h-[420px] overflow-auto relative">
              <table className="w-full caption-bottom text-sm border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-left text-xs font-medium whitespace-nowrap">
                      ID Pedido
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-left text-xs font-medium whitespace-nowrap">
                      Producto
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                      Pedidas
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                      Cargadas
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                      Pendientes
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                      % Cumplimiento
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {brechas.map((row, i) => (
                    <tr
                      key={`${row.idpedido}-${i}`}
                      className="border-b last:border-0"
                    >
                      <td className="px-3 py-2 text-sm font-mono">
                        {row.idpedido}
                      </td>
                      <td className="px-3 py-2 text-sm">{row.producto}</td>
                      <td className="px-3 py-2 text-sm text-right tabular-nums">
                        {fmtInt(row.unidades)}
                      </td>
                      <td className="px-3 py-2 text-sm text-right tabular-nums">
                        {row.unidadescargadas == null
                          ? "—"
                          : fmtInt(row.unidadescargadas)}
                      </td>
                      <td className="px-3 py-2 text-sm text-right tabular-nums">
                        {row.unidadespendientes > 0 ? (
                          <Badge
                            variant="destructive"
                            className="font-mono tabular-nums"
                          >
                            {fmtInt(row.unidadespendientes)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-right">
                        <CumplimientoCell pct={row.cumplimientoPct} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componentes locales
// ---------------------------------------------------------------------------

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

/**
 * Chip compacto para resaltar metricas clave en el header del chart.
 * `tone` mapea a tokens del theme. `trendIcon` opcional para arrow up/down.
 */
function InsightChip({
  label,
  value,
  hint,
  tone = "default",
  trendIcon: TrendIcon,
}: {
  label: string
  value: string
  hint?: string
  tone?: "default" | "success" | "danger" | "muted"
  trendIcon?: React.ComponentType<{ className?: string }>
}) {
  const fg =
    tone === "success"
      ? "var(--chart-3)"
      : tone === "danger"
        ? "var(--destructive)"
        : tone === "muted"
          ? "var(--muted-foreground)"
          : "var(--foreground)"
  return (
    <div className="flex flex-col items-end px-3 py-1.5 rounded-md bg-muted/40 border border-border/60 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      <span
        className="text-sm font-bold tabular-nums inline-flex items-center gap-1 whitespace-nowrap"
        style={{ color: fg }}
      >
        {TrendIcon ? <TrendIcon className="h-3.5 w-3.5" /> : null}
        {value}
      </span>
      {hint ? (
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
}

/**
 * Mini-card para mostrar mejor / peor mes al pie del LineChart. Usa
 * fondo color-mix con un token del theme para un acento sutil.
 */
function MiniHighlight({
  label,
  value,
  caption,
  tone,
}: {
  label: string
  value: string
  caption: string
  tone: "success" | "danger"
}) {
  const accent = tone === "success" ? "var(--chart-3)" : "var(--destructive)"
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
      style={{
        borderColor: "var(--border)",
        backgroundColor: `color-mix(in oklch, ${accent} 8%, transparent)`,
      }}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>
      <span
        className="text-base font-bold tabular-nums whitespace-nowrap"
        style={{ color: accent }}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Renderiza el % de cumplimiento de una fila con codificacion de color
 * por umbrales: verde >=95, ambar 80-94, rojo <80. Texto monospace
 * tabular para alineacion vertical.
 */
function CumplimientoCell({ pct }: { pct: number }) {
  let bg: string
  let fg: string
  if (pct >= 95) {
    bg = "color-mix(in oklch, var(--chart-3) 18%, transparent)"
    fg = "var(--chart-3)"
  } else if (pct >= 80) {
    bg = "color-mix(in oklch, var(--chart-4) 18%, transparent)"
    fg = "var(--chart-4)"
  } else {
    bg = "color-mix(in oklch, var(--destructive) 18%, transparent)"
    fg = "var(--destructive)"
  }
  return (
    <span
      className="inline-flex items-center justify-end rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg }}
    >
      {fmtFloat1(pct)}%
    </span>
  )
}
