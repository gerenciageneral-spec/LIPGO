"use client"

import {
  TruckIcon,
  Send,
  Package,
  Target,
  ShieldCheck,
  Gauge,
} from "lucide-react"
import { KpiCard } from "./kpi-card"
import type { GerenciaKpis } from "@/lib/dashboard-gerencia-actions"

interface KpiRowProps {
  data?: GerenciaKpis
  loading?: boolean
}

/**
 * Fila de 6 KPIs ejecutivos del Centro de Operaciones. Recibe `data` desde
 * el contenedor padre (que hace fetch + auto-refresh).
 * Nota: el KPI "Alertas Activas" se retiró por decisión del equipo de gerencia.
 *
 * Pulido Ciclo 7:
 *  - Todos los valores numericos van como `number` al `KpiCard` para que
 *    se anime el count-up (vs. strings ya formateados).
 *  - La unidad (`%`, `t`) viaja separada para que la animacion no rompa el
 *    formato.
 *  - Se decora la fila con `animate-in fade-in slide-in-from-bottom-2` para
 *    un boot-up elegante.
 */
export function KpiRow({ data, loading = false }: KpiRowProps) {
  const kpis: Array<React.ComponentProps<typeof KpiCard>> = [
    {
      icon: TruckIcon,
      label: "Vehículos Recibidos",
      value: data?.vehiculosRecibidos ?? 0,
      trendHint: "Hoy · vs ayer",
      accent: "cyan",
    },
    {
      icon: Send,
      label: "Vehículos Despachados",
      value: data?.vehiculosDespachados ?? 0,
      trendHint: "Hoy · vs ayer",
      accent: "sky",
    },
    {
      icon: Package,
      label: "Toneladas Procesadas",
      value: data?.toneladasProcesadas ?? 0,
      unit: "t",
      trendHint: "Ciclo actual",
      accent: "teal",
    },
    {
      icon: Target,
      label: "Cumplimiento OTIF",
      value: data?.cumplimientoOtif ?? 0,
      unit: "%",
      decimals: 1,
      trendHint: "Meta: 95%",
      accent: "emerald",
    },
    {
      icon: ShieldCheck,
      label: "Exactitud Operación",
      value: data?.exactitudOperacion ?? 0,
      unit: "%",
      decimals: 1,
      trendHint: "LIPGO AI",
      accent: "violet",
    },
    {
      icon: Gauge,
      label: "Productividad Op.",
      value: data?.productividad ?? 0,
      unit: "%",
      decimals: 1,
      trendHint: "Meta: 90%",
      accent: "amber",
    },
  ]

  return (
    <div
      className="grid gap-3 md:gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
      aria-busy={loading}
      style={{
        // Grid fluido: 2 col en movil, hasta 7 en monitor ejecutivo.
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      }}
    >
      {kpis.map((k) => (
        <KpiCard key={k.label} {...k} />
      ))}
    </div>
  )
}
