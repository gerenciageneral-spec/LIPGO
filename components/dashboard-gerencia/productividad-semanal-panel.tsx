"use client"

import { BarChart3 } from "lucide-react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts"
import { PanelCard } from "./panel-card"
import type { ProductividadDia } from "@/lib/dashboard-gerencia-actions"

/**
 * Productividad semanal. Fuente: `cabeceraoc` últimos 7 días agrupada por
 * fechacargue y tipo de operación (Descargue/Cargue) + estado finalizado.
 * Misma tabla que "Gestión de Órdenes".
 *
 * Colores LIPGO: cyan (#5bc0de), verde (#198754) y amber (#ffc107).
 */
interface Props {
  data?: ProductividadDia[]
}

export function ProductividadSemanalPanel({ data = [] }: Props) {
  const promedio =
    data.length > 0
      ? Math.round(
          data.reduce((acc, d) => acc + (d.recibo + d.picking + d.despacho) / 3, 0) / data.length,
        )
      : 0

  return (
    <PanelCard
      title="Productividad Semanal"
      subtitle="Operaciones últimos 7 días · cabeceraoc"
      icon={<BarChart3 className="h-4 w-4" />}
      iconColor="cyan"
      headerRight={
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 border border-emerald-300">
          <span className="text-[10px] tracking-wider text-emerald-700 uppercase">Prom</span>
          <span className="text-xs font-bold text-emerald-700 tabular-nums">{promedio}</span>
        </div>
      }
    >
      <div className="h-56 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(52,58,64,0.08)"
              vertical={false}
            />
            <XAxis
              dataKey="dia"
              stroke="rgba(108,117,125,0.8)"
              tick={{ fill: "rgba(52,58,64,0.75)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(52,58,64,0.15)" }}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(108,117,125,0.8)"
              tick={{ fill: "rgba(52,58,64,0.75)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: "rgba(91,192,222,0.35)", strokeWidth: 1 }}
              contentStyle={{
                background: "#ffffff",
                border: "1px solid #dee2e6",
                borderRadius: 12,
                color: "#343a40",
                fontSize: 12,
                boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              }}
              labelStyle={{ color: "#343a40", fontWeight: 600 }}
            />
            <Legend
              verticalAlign="top"
              height={24}
              iconType="circle"
              wrapperStyle={{
                fontSize: 11,
                color: "#343a40",
                paddingBottom: 4,
              }}
            />
            <Line
              type="monotone"
              dataKey="recibo"
              name="Recibo"
              stroke="#5bc0de"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#5bc0de", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#5bc0de", stroke: "rgba(91,192,222,0.3)", strokeWidth: 4 }}
            />
            <Line
              type="monotone"
              dataKey="picking"
              name="Picking"
              stroke="#198754"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#198754", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#198754", stroke: "rgba(25,135,84,0.3)", strokeWidth: 4 }}
            />
            <Line
              type="monotone"
              dataKey="despacho"
              name="Despacho"
              stroke="#fd7e14"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#fd7e14", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#fd7e14", stroke: "rgba(253,126,20,0.3)", strokeWidth: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </PanelCard>
  )
}
