"use client"

import { Target, Award, TrendingUp, TrendingDown, CheckCircle2, Clock, AlertTriangle } from "lucide-react"
import { PanelCard } from "./panel-card"

/**
 * Objetivos Estrategicos
 *
 * Muestra los KPIs estrategicos del mes en formato gauge (arco semicircular)
 * con indicador de tendencia vs mes anterior y semaforo de cumplimiento.
 *
 * Fuentes conectables (mapeo sugerido cuando se cablee):
 *   - OTIF / Productividad / Toneladas / Exactitud: dashboardoperaciones
 *   - Asistencia: registroasistencia
 *   - NPS: encuestas o tiempo promedio de permanencia por cliente
 *     (lib/vehicle-actions.ts + cabeceraoc).
 */

export interface ObjetivoEstrategico {
  id: string
  titulo: string
  actual: number
  meta: number
  unidad?: string
  delta?: number
  descripcion?: string
  icon?: React.ReactNode
  accent?: "emerald" | "cyan" | "amber" | "sky" | "violet" | "rose"
}

interface Props {
  objetivos?: ObjetivoEstrategico[]
  /** Real acumulado del mes (metadia + EMPRESA_META_DIA_TON) — reemplaza el
   *  dato de ejemplo de la tarjeta "Toneladas del Mes" cuando se provee. Las
   *  demas tarjetas (OTIF/Productividad/Asistencia/Exactitud/NPS) siguen
   *  siendo de ejemplo hasta que tengan su propia fuente real. */
  toneladasDelMes?: { actual: number; meta: number }
}

const DEMO_OBJETIVOS: ObjetivoEstrategico[] = [
  {
    id: "otif",
    titulo: "Cumplimiento OTIF",
    actual: 94.7,
    meta: 95,
    unidad: "%",
    delta: 2.3,
    descripcion: "On-Time / In-Full — pedidos entregados a tiempo y completos.",
    accent: "emerald",
  },
  {
    id: "productividad",
    titulo: "Productividad Op.",
    actual: 87.5,
    meta: 90,
    unidad: "%",
    delta: -1.2,
    descripcion: "Eficiencia real vs capacidad instalada de la operación.",
    accent: "amber",
  },
  {
    id: "asistencia",
    titulo: "Asistencia Personal",
    actual: 96.4,
    meta: 98,
    unidad: "%",
    delta: 0.5,
    descripcion: "Registro de asistencia efectiva del personal operativo.",
    accent: "cyan",
  },
  {
    id: "toneladas",
    titulo: "Toneladas del Mes",
    actual: 2840,
    meta: 3200,
    unidad: "Ton",
    delta: 8.2,
    descripcion: "Tonelaje total procesado acumulado en el mes en curso.",
    accent: "sky",
  },
  {
    id: "exactitud",
    titulo: "Exactitud Inventario",
    actual: 98.2,
    meta: 99,
    unidad: "%",
    delta: 0.5,
    descripcion: "Coincidencia entre inventario físico y sistema.",
    accent: "violet",
  },
  {
    id: "nps",
    titulo: "NPS Clientes",
    actual: 72,
    meta: 80,
    unidad: "pts",
    delta: 4,
    descripcion: "Net Promoter Score promedio del mes en curso.",
    accent: "rose",
  },
]

export function ObjetivosEstrategicosSection({ objetivos, toneladasDelMes }: Props) {
  const base = objetivos && objetivos.length > 0 ? objetivos : DEMO_OBJETIVOS
  const items =
    toneladasDelMes && toneladasDelMes.meta > 0
      ? base.map((o) =>
          o.id === "toneladas"
            ? { ...o, actual: toneladasDelMes.actual, meta: toneladasDelMes.meta, delta: undefined }
            : o,
        )
      : base

  const cumplidos = items.filter((o) => o.actual >= o.meta).length
  const enProgreso = items.filter((o) => o.actual >= o.meta * 0.85 && o.actual < o.meta).length
  const retrasados = items.filter((o) => o.actual < o.meta * 0.85).length

  return (
    <div className="flex flex-col gap-4">
      {/* Resumen del periodo */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-3">
        <SummaryCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Objetivos cumplidos"
          value={`${cumplidos}/${items.length}`}
          accent="emerald"
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4" />}
          label="En progreso"
          value={`${enProgreso}/${items.length}`}
          accent="amber"
        />
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Requieren acción"
          value={`${retrasados}/${items.length}`}
          accent="rose"
        />
      </div>

      {/* Grid de gauges */}
      <PanelCard
        title="Metas del Mes"
        subtitle="Avance vs objetivo · tendencia vs mes anterior"
        icon={<Target className="h-4 w-4 text-[#0aa1c4]" />}
        accent="cyan"
        headerRight={
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200">
            <Award className="h-3 w-3 text-violet-600" />
            <span className="text-[10px] tracking-wider text-violet-700 font-semibold uppercase">
              Plan 2026
            </span>
          </div>
        }
      >
        <div
          className="grid gap-3 md:gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
        >
          {items.map((o) => (
            <ObjetivoGauge key={o.id} objetivo={o} />
          ))}
        </div>
      </PanelCard>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Subcomponentes                                                         */
/* --------------------------------------------------------------------- */

function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: "emerald" | "amber" | "rose"
}) {
  const styles: Record<string, string> = {
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    rose: "text-rose-700 bg-rose-50 border-rose-200",
  }
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl border flex items-center justify-center ${styles[accent]}`}>
          {icon}
        </div>
        <div>
          <div className="text-[11px] tracking-wider text-muted-foreground uppercase">{label}</div>
          <div className="text-2xl font-bold text-foreground font-mono tabular-nums">{value}</div>
        </div>
      </div>
    </div>
  )
}

function ObjetivoGauge({ objetivo }: { objetivo: ObjetivoEstrategico }) {
  const { actual, meta, unidad = "%", delta = 0 } = objetivo

  const progreso = meta > 0 ? Math.min(100, Math.max(0, (actual / meta) * 100)) : 0

  const cumplio = actual >= meta
  const cerca = actual >= meta * 0.85

  // Acento por objetivo (para el badge del estado y el glow sutil)
  const accentMap: Record<string, { text: string; bg: string }> = {
    emerald: { text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
    cyan: { text: "text-[#0aa1c4]", bg: "bg-[#5bc0de]/10 border-[#5bc0de]/30" },
    amber: { text: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    sky: { text: "text-sky-700", bg: "bg-sky-50 border-sky-200" },
    violet: { text: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
    rose: { text: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
  }

  // Semáforo del arco (override por cumplimiento).
  const strokeColor = cumplio ? "#059669" : cerca ? "#d97706" : "#dc2626"
  const glowColor = cumplio
    ? "rgba(16,185,129,0.18)"
    : cerca
      ? "rgba(245,158,11,0.18)"
      : "rgba(239,68,68,0.18)"
  const valueTextColor = cumplio
    ? "text-emerald-700"
    : cerca
      ? "text-amber-700"
      : "text-rose-700"

  const accentBadge = accentMap[objetivo.accent || "cyan"].bg
  const accentIconText = accentMap[objetivo.accent || "cyan"].text

  const formatValue = (v: number) =>
    v >= 1000 ? v.toLocaleString("es-CO") : v % 1 !== 0 ? v.toFixed(1) : v.toString()

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm p-4">
      <div
        className="absolute -top-8 -right-8 h-32 w-32 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
        style={{ background: glowColor }}
      />

      <div className="relative flex items-start gap-4">
        {/* Gauge semicircular */}
        <div className="shrink-0">
          <SemiGauge value={progreso} stroke={strokeColor} />
          <div className="mt-1 text-center">
            <div className={`text-xl font-bold font-mono tabular-nums ${valueTextColor}`}>
              {formatValue(actual)}
              {unidad !== "pts" && unidad !== "Ton" && (
                <span className="text-sm opacity-70">{unidad}</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Meta: {formatValue(meta)}
              {unidad === "pts" || unidad === "Ton" ? ` ${unidad}` : unidad}
            </div>
          </div>
        </div>

        {/* Texto descriptivo */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground truncate">{objetivo.titulo}</h4>
            {delta !== 0 && (
              <span
                className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                  delta > 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {delta > 0 ? "+" : ""}
                {delta}
                {unidad === "Ton" || unidad === "pts" ? "" : "%"}
              </span>
            )}
          </div>
          {objetivo.descripcion && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground text-pretty">
              {objetivo.descripcion}
            </p>
          )}
          <div className={`mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] ${accentBadge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cumplio ? "bg-emerald-500" : cerca ? "bg-amber-500" : "bg-rose-500"}`} />
            <span className={accentIconText}>
              {cumplio ? "En meta" : cerca ? "Cerca de meta" : "Por debajo"}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SemiGauge({ value, stroke }: { value: number; stroke: string }) {
  const r = 42
  const cx = 50
  const cy = 50
  const circumference = Math.PI * r
  const offset = circumference * (1 - Math.min(1, Math.max(0, value / 100)))

  return (
    <div className="relative w-[110px] h-[72px]">
      <svg viewBox="0 0 100 55" className="w-full h-full" aria-hidden="true">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(100,116,139,0.18)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={stroke}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span className="text-xs font-mono font-bold text-foreground tabular-nums">
          {Math.round(value)}%
        </span>
      </div>
    </div>
  )
}
