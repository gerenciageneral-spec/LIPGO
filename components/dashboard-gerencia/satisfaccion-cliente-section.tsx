"use client"

import { Heart, Users, Clock, Smile, Meh, Frown, Star, TrendingUp, TrendingDown } from "lucide-react"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { PanelCard } from "./panel-card"

/**
 * Satisfaccion Cliente
 *
 * Los datos vienen via props con fallback demo. En un ciclo posterior se
 * pueden alimentar desde encuestas o desde tiempo de permanencia promedio
 * de vehiculos por cliente.
 */

export interface ClienteSatisfaccion {
  id: string
  nombre: string
  volumen: number
  satisfaccion: number
  tiempoPromedio: number
}

export interface NpsTendenciaMes {
  mes: string
  nps: number
}

export interface SatisfaccionData {
  npsActual: number
  npsAnterior: number
  promotores: number
  pasivos: number
  detractores: number
  clientesActivos: number
  clientesTotal: number
  tiempoPromedioMin: number
  clientes: ClienteSatisfaccion[]
  tendencia: NpsTendenciaMes[]
}

interface Props {
  data?: SatisfaccionData
}

const DEMO: SatisfaccionData = {
  npsActual: 72,
  npsAnterior: 68,
  promotores: 78,
  pasivos: 16,
  detractores: 6,
  clientesActivos: 38,
  clientesTotal: 45,
  tiempoPromedioMin: 42,
  clientes: [
    { id: "c1", nombre: "Alpina S.A.", volumen: 124, satisfaccion: 94, tiempoPromedio: 38 },
    { id: "c2", nombre: "Colanta", volumen: 98, satisfaccion: 91, tiempoPromedio: 42 },
    { id: "c3", nombre: "Nestlé Colombia", volumen: 84, satisfaccion: 88, tiempoPromedio: 45 },
    { id: "c4", nombre: "Grupo Nutresa", volumen: 76, satisfaccion: 86, tiempoPromedio: 48 },
    { id: "c5", nombre: "Ramo", volumen: 62, satisfaccion: 82, tiempoPromedio: 52 },
    { id: "c6", nombre: "Productos Yupi", volumen: 54, satisfaccion: 79, tiempoPromedio: 58 },
  ],
  tendencia: [
    { mes: "Nov", nps: 64 },
    { mes: "Dic", nps: 66 },
    { mes: "Ene", nps: 68 },
    { mes: "Feb", nps: 69 },
    { mes: "Mar", nps: 70 },
    { mes: "Abr", nps: 72 },
  ],
}

export function SatisfaccionClienteSection({ data }: Props) {
  const d = data || DEMO
  const deltaNps = d.npsActual - d.npsAnterior

  return (
    <div className="flex flex-col gap-4">
      {/* Fila superior: 3 tarjetas hero */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 xl:grid-cols-3">
        <NpsHeroCard nps={d.npsActual} delta={deltaNps} />
        <ClientesActivosCard activos={d.clientesActivos} total={d.clientesTotal} />
        <TiempoPromedioCard minutos={d.tiempoPromedioMin} />
      </div>

      {/* Fila media: Distribucion NPS + Tendencia */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 xl:grid-cols-3">
        <PanelCard
          title="Distribución NPS"
          subtitle="Promotores · Pasivos · Detractores"
          icon={<Heart className="h-4 w-4 text-rose-600" />}
          accent="rose"
        >
          <NpsDistribution data={d} />
        </PanelCard>

        <div className="xl:col-span-2">
          <PanelCard
            title="Tendencia NPS · 6 meses"
            subtitle="Evolución mensual del Net Promoter Score"
            icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
            accent="emerald"
          >
            <NpsTrend data={d.tendencia} />
          </PanelCard>
        </div>
      </div>

      {/* Fila inferior: Ranking de clientes */}
      <PanelCard
        title="Top Clientes"
        subtitle="Volumen y satisfacción operativa"
        icon={<Star className="h-4 w-4 text-amber-600" />}
        accent="amber"
      >
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
        >
          {d.clientes.map((c) => (
            <ClienteCard key={c.id} cliente={c} />
          ))}
        </div>
      </PanelCard>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Hero cards                                                             */
/* --------------------------------------------------------------------- */

function NpsHeroCard({ nps, delta }: { nps: number; delta: number }) {
  const color =
    nps >= 70
      ? { stroke: "#059669", text: "text-emerald-700", glow: "rgba(16,185,129,0.2)" }
      : nps >= 50
        ? { stroke: "#0aa1c4", text: "text-[#0aa1c4]", glow: "rgba(91,192,222,0.25)" }
        : nps >= 30
          ? { stroke: "#d97706", text: "text-amber-700", glow: "rgba(245,158,11,0.2)" }
          : { stroke: "#dc2626", text: "text-rose-700", glow: "rgba(239,68,68,0.2)" }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm p-5 xl:col-span-1">
      <div
        className="absolute -top-12 -right-12 h-48 w-48 rounded-full blur-3xl pointer-events-none"
        style={{ background: color.glow }}
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-4">
        <div className="shrink-0">
          <CircularGauge value={((nps + 100) / 200) * 100} stroke={color.stroke} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] tracking-wider text-muted-foreground uppercase">Net Promoter Score</div>
          <div className={`text-4xl font-bold font-mono tabular-nums ${color.text}`}>{nps}</div>
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold">
            {delta > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-700">
                <TrendingUp className="h-3 w-3" />+{delta} pts
              </span>
            ) : delta < 0 ? (
              <span className="inline-flex items-center gap-0.5 text-rose-700">
                <TrendingDown className="h-3 w-3" />
                {delta} pts
              </span>
            ) : (
              <span className="text-muted-foreground">Sin cambio</span>
            )}
            <span className="text-muted-foreground/80">vs mes anterior</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ClientesActivosCard({ activos, total }: { activos: number; total: number }) {
  const porcentaje = total > 0 ? Math.round((activos / total) * 100) : 0
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm p-5">
      <div
        className="absolute -top-12 -right-12 h-48 w-48 rounded-full blur-3xl pointer-events-none"
        style={{ background: "rgba(91,192,222,0.22)" }}
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl border border-[#5bc0de]/30 bg-[#5bc0de]/10 flex items-center justify-center">
            <Users className="h-4 w-4 text-[#0aa1c4]" />
          </div>
          <div className="text-[11px] tracking-wider text-muted-foreground uppercase">
            Clientes Activos
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-4xl font-bold text-foreground font-mono tabular-nums">{activos}</span>
          <span className="text-sm text-muted-foreground">de {total}</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#5bc0de] to-[#0aa1c4] rounded-full"
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          {porcentaje}% del portafolio operando hoy
        </div>
      </div>
    </div>
  )
}

function TiempoPromedioCard({ minutos }: { minutos: number }) {
  const benchmark = 45
  const delta = minutos - benchmark
  const mejorQueBenchmark = delta <= 0

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm p-5">
      <div
        className="absolute -top-12 -right-12 h-48 w-48 rounded-full blur-3xl pointer-events-none"
        style={{ background: "rgba(139,92,246,0.18)" }}
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl border border-violet-200 bg-violet-50 flex items-center justify-center">
            <Clock className="h-4 w-4 text-violet-700" />
          </div>
          <div className="text-[11px] tracking-wider text-muted-foreground uppercase">
            Tiempo Promedio
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-4xl font-bold text-foreground font-mono tabular-nums">{minutos}</span>
          <span className="text-sm text-muted-foreground">min / vehículo</span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px]">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
              mejorQueBenchmark
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-rose-50 border-rose-200 text-rose-700"
            }`}
          >
            {mejorQueBenchmark ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <TrendingUp className="h-3 w-3" />
            )}
            {mejorQueBenchmark ? `${delta}` : `+${delta}`} min
          </span>
          <span className="text-muted-foreground/80">vs benchmark ({benchmark} min)</span>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Distribucion NPS (barra horizontal segmentada)                         */
/* --------------------------------------------------------------------- */

function NpsDistribution({ data }: { data: SatisfaccionData }) {
  const items = [
    {
      key: "promotores",
      label: "Promotores",
      pct: data.promotores,
      icon: Smile,
      color: "bg-emerald-500",
      text: "text-emerald-700",
      iconTint: "text-emerald-600",
    },
    {
      key: "pasivos",
      label: "Pasivos",
      pct: data.pasivos,
      icon: Meh,
      color: "bg-amber-500",
      text: "text-amber-700",
      iconTint: "text-amber-600",
    },
    {
      key: "detractores",
      label: "Detractores",
      pct: data.detractores,
      icon: Frown,
      color: "bg-rose-500",
      text: "text-rose-700",
      iconTint: "text-rose-600",
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Barra segmentada */}
      <div className="flex h-3 rounded-full overflow-hidden bg-muted border border-border">
        {items.map((it) => (
          <div
            key={it.key}
            className={it.color}
            style={{ width: `${it.pct}%` }}
            title={`${it.label}: ${it.pct}%`}
          />
        ))}
      </div>

      {/* Lista detallada */}
      <div className="flex flex-col gap-2">
        {items.map((it) => {
          const Icon = it.icon
          return (
            <div
              key={it.key}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/40 border border-border"
            >
              <Icon className={`h-5 w-5 ${it.iconTint}`} />
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">{it.label}</div>
              </div>
              <div className={`text-lg font-bold font-mono tabular-nums ${it.text}`}>{it.pct}%</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Tendencia NPS (area chart)                                             */
/* --------------------------------------------------------------------- */

function NpsTrend({ data }: { data: NpsTendenciaMes[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="npsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 6" stroke="rgba(100,116,139,0.18)" vertical={false} />
          <XAxis
            dataKey="mes"
            stroke="rgba(100,116,139,0.8)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(100,116,139,0.25)" }}
          />
          <YAxis
            stroke="rgba(100,116,139,0.8)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(100,116,139,0.25)" }}
            domain={[50, 80]}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid rgba(100,116,139,0.25)",
              borderRadius: 10,
              color: "#1f2937",
              fontSize: 12,
              boxShadow: "0 10px 25px -10px rgba(0,0,0,0.2)",
            }}
            labelStyle={{ color: "#64748b", fontSize: 11, textTransform: "uppercase" }}
            formatter={(value: number) => [`${value} pts`, "NPS"]}
          />
          <Area
            type="monotone"
            dataKey="nps"
            stroke="#059669"
            strokeWidth={2.5}
            fill="url(#npsGradient)"
            activeDot={{
              r: 5,
              fill: "#059669",
              stroke: "#ffffff",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Cliente card (ranking)                                                 */
/* --------------------------------------------------------------------- */

function ClienteCard({ cliente }: { cliente: ClienteSatisfaccion }) {
  const satColor =
    cliente.satisfaccion >= 90
      ? "text-emerald-700"
      : cliente.satisfaccion >= 80
        ? "text-[#0aa1c4]"
        : cliente.satisfaccion >= 70
          ? "text-amber-700"
          : "text-rose-700"

  const barColor =
    cliente.satisfaccion >= 90
      ? "from-emerald-500 to-emerald-400"
      : cliente.satisfaccion >= 80
        ? "from-[#5bc0de] to-[#0aa1c4]"
        : cliente.satisfaccion >= 70
          ? "from-amber-500 to-amber-400"
          : "from-rose-500 to-rose-400"

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground truncate">{cliente.nombre}</div>
        <div className={`text-lg font-bold font-mono tabular-nums ${satColor}`}>
          {cliente.satisfaccion}
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${barColor} rounded-full`}
          style={{ width: `${cliente.satisfaccion}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{cliente.volumen} pedidos</span>
        <span>{cliente.tiempoPromedio} min prom.</span>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Gauge circular completo (para NPS)                                     */
/* --------------------------------------------------------------------- */

function CircularGauge({ value, stroke }: { value: number; stroke: string }) {
  const r = 32
  const cx = 40
  const cy = 40
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(1, Math.max(0, value / 100)))

  return (
    <div className="relative w-[80px] h-[80px]">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(100,116,139,0.18)"
          strokeWidth={6}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Heart className="h-5 w-5 text-rose-600" fill="currentColor" />
      </div>
    </div>
  )
}
