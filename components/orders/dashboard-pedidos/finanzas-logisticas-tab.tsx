"use client"

import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Banknote,
  PercentSquare,
  Receipt,
  TrendingDown,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { KpiCard } from "./kpi-card"
import { PeriodFilter, usePeriodFilter } from "./period-filter"
import {
  calcComposicionSobrecostos,
  calcCostoDemoras,
  calcGastoTotalFletes,
  calcRatioFleteVentasPct,
  calcRentabilidadTopClientes,
  calcResumenFinanciero,
  calcTotalDescuentos,
  fmtCOP,
  fmtFloat1,
  fmtInt,
  fmtPct,
} from "./calculations"
import type { PedidoCabecera } from "./types"

interface Props {
  cabecera: PedidoCabecera[]
}

// Paleta del donut: dos categorias agregadas (fletes/demoras). Usamos
// los tokens chart-X del theme para mantener coherencia con las demas
// pestañas, no colores hardcoded.
const DONUT_COLORS: Record<string, string> = {
  Fletes: "var(--chart-2)",
  Demoras: "var(--destructive)",
}

/**
 * Tab 4: Finanzas Logisticas y Rentabilidad.
 *
 * Layout Bento:
 *   - Fila 1: 4 KPI cards (1/2/4 cols).
 *   - Fila 2: PieChart "Composicion Sobrecostos" (1/3) + BarChart apilado
 *             "Rentabilidad por Cliente Top 5" (2/3).
 *   - Fila 3: tabla financiera por pedido full-width.
 */
export function FinanzasLogisticasTab({ cabecera }: Props) {
  const filter = usePeriodFilter(cabecera)
  const cab = filter.filteredCabecera

  const kpis = useMemo(
    () => ({
      gastoFletes: calcGastoTotalFletes(cab),
      costoDemoras: calcCostoDemoras(cab),
      totalDescuentos: calcTotalDescuentos(cab),
      ratioFleteVentas: calcRatioFleteVentasPct(cab),
    }),
    [cab],
  )

  const composicion = useMemo(
    () => calcComposicionSobrecostos(cab),
    [cab],
  )
  const totalSobrecostos = useMemo(
    () => composicion.reduce((acc, c) => acc + c.valor, 0),
    [composicion],
  )

  const rentabilidad = useMemo(
    () => calcRentabilidadTopClientes(cab, 5),
    [cab],
  )

  const finanzas = useMemo(() => calcResumenFinanciero(cab), [cab])

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

      {/* Fila 1: KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Gasto Total Fletes"
          value={fmtCOP(kpis.gastoFletes)}
          icon={Banknote}
          variant="primary"
          subtext="suma campo flete"
        />
        <KpiCard
          label="Costo de Demoras"
          value={fmtCOP(kpis.costoDemoras)}
          icon={TrendingDown}
          variant="danger"
          subtext="suma campo demora"
        />
        <KpiCard
          label="Total Descuentos"
          value={fmtCOP(kpis.totalDescuentos)}
          icon={Receipt}
          variant="warning"
          subtext="descuentopp + descuentoiva"
        />
        <KpiCard
          label="Ratio Flete / Ventas"
          value={fmtPct(kpis.ratioFleteVentas)}
          icon={PercentSquare}
          variant="success"
          subtext="flete sobre total a pagar"
        />
      </div>

      {/* Fila 2: Bento — Donut (1/3) + Stacked bar (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Composición de Sobrecostos
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Fletes vs demoras como peso del gasto logístico.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {composicion.length === 0 ? (
              <EmptyState text="Sin sobrecostos registrados." />
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={composicion}
                      dataKey="valor"
                      nameKey="categoria"
                      innerRadius={60}
                      outerRadius={92}
                      paddingAngle={2}
                      stroke="var(--background)"
                      strokeWidth={2}
                    >
                      {composicion.map((entry) => (
                        <Cell
                          key={entry.categoria}
                          fill={DONUT_COLORS[entry.categoria]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--popover-foreground)",
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => {
                        const pct =
                          totalSobrecostos > 0
                            ? (value / totalSobrecostos) * 100
                            : 0
                        return [`${fmtCOP(value)} (${fmtFloat1(pct)}%)`, name]
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={28}
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Rentabilidad por Cliente (Top 5)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Margen base + sobrecostos apilados (flete y demora). Top por
              total a pagar.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {rentabilidad.length === 0 ? (
              <EmptyState text="Sin clientes con facturación registrada." />
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={rentabilidad}
                    margin={{ top: 8, right: 12, left: 0, bottom: 24 }}
                    barSize={36}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="cliente"
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      tickFormatter={(v) => {
                        const s = String(v)
                        return s.length > 14 ? `${s.slice(0, 12)}…` : s
                      }}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => {
                        const n = Number(v)
                        if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
                        if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
                        return `$${n}`
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--popover-foreground)",
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = {
                          margen: "Margen",
                          flete: "Flete",
                          demora: "Demora",
                        }
                        return [fmtCOP(value), labels[name] ?? name]
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value) =>
                        value === "margen"
                          ? "Margen"
                          : value === "flete"
                            ? "Flete"
                            : "Demora"
                      }
                    />
                    <Bar
                      dataKey="margen"
                      stackId="rent"
                      fill="var(--chart-3)"
                    />
                    <Bar
                      dataKey="flete"
                      stackId="rent"
                      fill="var(--chart-2)"
                    />
                    <Bar
                      dataKey="demora"
                      stackId="rent"
                      fill="var(--destructive)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fila 3: tabla financiera general */}
      <Card className="border-border/60">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Resumen Financiero</CardTitle>
            <p className="text-xs text-muted-foreground">
              Pedidos ordenados por impacto logístico (flete + demora) sobre el
              total a pagar.
            </p>
          </div>
          <Badge variant="outline" className="font-mono">
            {fmtInt(finanzas.length)} pedidos
          </Badge>
        </CardHeader>
        <CardContent className="pt-0">
          {finanzas.length === 0 ? (
            <EmptyState text="No hay pedidos con total a pagar > 0." />
          ) : (
            <div className="rounded-md border max-h-[420px] overflow-auto relative">
              <table className="w-full caption-bottom text-sm border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-left text-xs font-medium whitespace-nowrap">
                      ID Pedido
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-left text-xs font-medium whitespace-nowrap">
                      Cliente
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-left text-xs font-medium whitespace-nowrap">
                      Cond. Pago
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                      Total
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                      Flete
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                      Demora
                    </th>
                    <th className="sticky top-0 z-20 bg-muted border-b px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                      Impacto Logístico
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {finanzas.map((row) => (
                    <tr key={row.idpedido} className="border-b last:border-0">
                      <td className="px-3 py-2 text-sm font-mono">
                        {row.idpedido}
                      </td>
                      <td className="px-3 py-2 text-sm">{row.cliente}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">
                        {row.condicion_pago}
                      </td>
                      <td className="px-3 py-2 text-sm text-right tabular-nums">
                        {fmtCOP(row.total_pagar)}
                      </td>
                      <td className="px-3 py-2 text-sm text-right tabular-nums">
                        {fmtCOP(row.flete)}
                      </td>
                      <td className="px-3 py-2 text-sm text-right tabular-nums">
                        {fmtCOP(row.demora)}
                      </td>
                      <td className="px-3 py-2 text-sm text-right tabular-nums">
                        {row.impactoLogisticoPct > 10 ? (
                          <Badge
                            variant="destructive"
                            className="font-mono tabular-nums"
                          >
                            {fmtFloat1(row.impactoLogisticoPct)}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {fmtFloat1(row.impactoLogisticoPct)}%
                          </span>
                        )}
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
