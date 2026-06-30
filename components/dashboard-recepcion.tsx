"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useAuth } from "@/components/auth-provider"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  CalendarRange,
  Clock,
  Loader2,
  Package,
  RefreshCw,
  Truck,
  TrendingUp,
  BarChart3,
  PieChart,
  Timer,
  Gauge,
  AlertCircle,
  Download,
  Flame,
  TrendingDown,
  Layers,
  Sparkles,
  FileText,
  Trophy,
  Target,
  Info,
  CheckCircle2,
  Radio,
  Hourglass,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
  ComposedChart,
  Line,
} from "recharts"
import {
  getDashboardRecepcionData,
  type DashboardRecepcionPayload,
  type EtapaTiempo,
  type VehiculoActivo,
  type ThroughputHora,
  type DistribucionEstado,
  type VolumenPorDia,
  type VolumenPorMes,
  type VolumenPorTipo,
  type RecepcionKpisMensual,
  type RecepcionKpisAnual,
  type LiveSummary,
  type OperacionInsight,
} from "@/lib/dashboard-recepcion-actions"
import { cn } from "@/lib/utils"

// ============================================================================
// Formatters
// ============================================================================

function fmtInt(n: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n)
}

function fmtDecimal(n: number, digits = 1): string {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)
}

function fmtMinutos(min: number): string {
  if (min < 60) return `${fmtInt(min)} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatFechaHoy(fecha: string): string {
  const d = new Date(fecha + "T12:00:00")
  return d.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

// ============================================================================
// Color palette
// ============================================================================

const CHART_COLORS = {
  // Cargue en naranja (chart-5) para diferenciarlo del azul/cian que
  // domina el resto de la paleta del dashboard.
  cargue: "var(--chart-5)",
  descargue: "var(--chart-2)",
  distribucion: "var(--chart-3)",
}

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
]

const ESTADO_COLORS: Record<string, string> = {
  "Fin Operación": "var(--chart-3)",
  "Finalizado LIP": "var(--chart-3)",
  "En proceso": "var(--chart-1)",
  "En cola": "var(--chart-4)",
  "Sin lote": "var(--destructive)",
  "Por pesar": "var(--destructive)",
  "Pesaje inicial": "var(--chart-2)",
  "Pesaje final": "var(--chart-2)",
  "En patio": "var(--chart-5)",
}

// ============================================================================
// Micro KPI Card (Compacta)
// ============================================================================

interface MicroKpiProps {
  label: string
  value: string | number
  subtext?: string
  icon: React.ElementType
  variant?: "default" | "success" | "warning" | "danger"
  loading?: boolean
}

/**
 * Estilos por variante. La regla de negocio aquí es: TODAS las tarjetas
 * comparten el mismo fondo blanco (`bg-card`) — nunca tintamos el
 * background. La única señal cromática vive en el borde sutil y, sobre
 * todo, en el ícono coloreado del lado derecho. Esto mantiene un look
 * limpio "Enterprise Modern" y a la vez permite escanear el estado de
 * un KPI con la periferia visual.
 */
const MICRO_VARIANTS = {
  default: {
    card: "border-border/60 bg-card",
    icon: "text-[var(--chart-1)]",
    value: "",
  },
  success: {
    card: "border-[var(--chart-3)]/40 bg-card",
    icon: "text-[var(--chart-3)]",
    value: "text-[var(--chart-3)]",
  },
  warning: {
    card: "border-[var(--chart-4)]/40 bg-card",
    icon: "text-[var(--chart-4)]",
    value: "",
  },
  danger: {
    card: "border-destructive/40 bg-card",
    icon: "text-destructive",
    value: "text-destructive",
  },
} as const

/**
 * Burbujita circular detrás del ícono. Usa el mismo color del ícono al
 * 10% para reforzar la jerarquía sin gritar. Es el único lugar donde
 * "tintamos" un area pequeña — el resto de la tarjeta queda blanco.
 */
function MicroKpi({ label, value, subtext, icon: Icon, variant = "default", loading }: MicroKpiProps) {
  if (loading) {
    return (
      <Card className="border-border/60 bg-card">
        <CardContent className="p-3">
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-6 w-12" />
        </CardContent>
      </Card>
    )
  }

  const styles = MICRO_VARIANTS[variant]

  return (
    <Card className={cn("border", styles.card)}>
      <CardContent className="p-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </p>
          <p
            className={cn(
              "text-lg font-bold tabular-nums leading-tight mt-0.5",
              styles.value,
            )}
          >
            {value}
          </p>
          {subtext && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{subtext}</p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 mt-0.5 h-7 w-7 rounded-md flex items-center justify-center",
            // Fondo de 10% del color del ícono. `currentColor` toma el
            // color de texto del span, por eso primero aplicamos el
            // color del ícono al span y usamos `bg-current/10`.
            styles.icon,
            "bg-current/10",
          )}
          aria-hidden="true"
        >
          <Icon className={cn("h-4 w-4", styles.icon)} />
        </span>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Live Status Indicator
// ============================================================================

function LiveIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      Live
    </span>
  )
}

// ============================================================================
// Cuello de Botella Chart (Barras Horizontales)
// ============================================================================

function CuelloBotelllaChart({ data, loading }: { data: EtapaTiempo[]; loading: boolean }) {
  if (loading) {
    return <Skeleton className="h-[200px] w-full" />
  }

  if (data.length === 0) {
    return <EmptyState text="Sin datos de tiempos." compact />
  }

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
          barSize={16}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}m`}
          />
          <YAxis
            type="category"
            dataKey="etapa"
            stroke="var(--muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            width={90}
            tickFormatter={(s: string) => (s.length > 14 ? `${s.slice(0, 12)}...` : s)}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--popover-foreground)",
              fontSize: 11,
              padding: "6px 10px",
            }}
            formatter={(value: number, _name: string, item) => {
              const payload = item?.payload as EtapaTiempo | undefined
              return [
                `${fmtMinutos(value)} (${payload?.porcentaje ?? 0}%)`,
                payload?.esCuelloBotella
                  ? "CUELLO DE BOTELLA (promedio)"
                  : "Promedio por vehículo",
              ]
            }}
          />
          <Bar dataKey="promedioMin" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.esCuelloBotella ? "var(--destructive)" : "var(--chart-1)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================================================
// Insights Ticker (rotating de mensajes operativos del día)
// ============================================================================

/**
 * Mapa de niveles → estilos del marcador izquierdo del ticker. Mantenemos
 * la paleta semántica (success/warn/danger/info) para que el operador
 * pueda leer el ticker rápido aún sin texto.
 */
const INSIGHT_LEVEL_STYLES: Record<
  OperacionInsight["level"],
  { dot: string; icon: typeof Info; iconClass: string; label: string }
> = {
  info: { dot: "bg-[var(--chart-1)]", icon: Info, iconClass: "text-[var(--chart-1)]", label: "Info" },
  success: {
    dot: "bg-[var(--chart-3)]",
    icon: CheckCircle2,
    iconClass: "text-[var(--chart-3)]",
    label: "OK",
  },
  warn: { dot: "bg-[var(--chart-4)]", icon: Hourglass, iconClass: "text-[var(--chart-4)]", label: "Atención" },
  danger: { dot: "bg-destructive", icon: AlertCircle, iconClass: "text-destructive", label: "Crítico" },
}

function InsightsTicker({ insights }: { insights: OperacionInsight[] }) {
  const [index, setIndex] = useState(0)

  // Si la lista cambia (por refetch), reseteamos al primero para no
  // "saltar" a un mensaje viejo que ya no existe.
  useEffect(() => {
    setIndex(0)
  }, [insights])

  // Auto-rotar cada 5s. Pausamos cuando no hay multiples mensajes para
  // evitar render churn innecesario.
  useEffect(() => {
    if (insights.length <= 1) return
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % insights.length)
    }, 5000)
    return () => clearInterval(id)
  }, [insights.length])

  if (insights.length === 0) return null

  const current = insights[index]
  const style = INSIGHT_LEVEL_STYLES[current.level]
  const Icon = style.icon

  return (
    <Card className="border-border/60 bg-card overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-stretch">
          {/* Marcador lateral coloreado por nivel */}
          <div className={cn("w-1 shrink-0", style.dot)} aria-hidden="true" />

          {/* Mensaje rotando + dots de progreso */}
          <div className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0">
            <span
              className={cn(
                "shrink-0 h-7 w-7 rounded-md flex items-center justify-center bg-current/10",
                style.iconClass,
              )}
              aria-hidden="true"
            >
              <Icon className={cn("h-4 w-4", style.iconClass)} />
            </span>

            {/* Animación de fade entre mensajes */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Insight {index + 1} de {insights.length}
              </p>
              <p
                key={current.id}
                className="text-xs sm:text-[13px] font-medium text-foreground leading-snug truncate animate-in fade-in slide-in-from-right-2 duration-300"
              >
                {current.message}
              </p>
            </div>

            {/* Dots de progreso */}
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              {insights.map((it, i) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-all",
                    i === index
                      ? cn("w-4", style.dot)
                      : "bg-muted-foreground/30 hover:bg-muted-foreground/50",
                  )}
                  aria-label={`Ver insight ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// LiveOpsPanel - reemplaza la tabla simple de vehículos activos
// ============================================================================

/**
 * Mapeo de urgencia → estilos del item de vehículo. Usamos colores
 * sólidos pero suaves: el dot pulsante atrapa la atención, el resto
 * de la fila se mantiene tranquilo para no marear al usuario que
 * deja el dashboard abierto en un televisor del centro de control.
 */
const URGENCIA_STYLES: Record<
  VehiculoActivo["urgencia"],
  { dot: string; pulse: string; ring: string; row: string }
> = {
  ok: {
    dot: "bg-[var(--chart-3)]",
    pulse: "bg-[var(--chart-3)]/60",
    ring: "ring-[var(--chart-3)]/20",
    row: "",
  },
  warn: {
    dot: "bg-[var(--chart-4)]",
    pulse: "bg-[var(--chart-4)]/60",
    ring: "ring-[var(--chart-4)]/30",
    row: "",
  },
  danger: {
    dot: "bg-destructive",
    pulse: "bg-destructive/70",
    ring: "ring-destructive/30",
    row: "bg-destructive/5",
  },
}

/**
 * Punto verde "live" que pulsa. Lo usamos para el header (siempre verde,
 * indica que la conexión está activa) y como base del marcador de
 * urgencia por vehículo (se pinta con el color de urgencia).
 */
function PulseDot({
  className,
  pulseClassName,
}: {
  className?: string
  pulseClassName?: string
}) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span
        className={cn(
          "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
          pulseClassName ?? "bg-[var(--chart-3)]/70",
        )}
      />
      <span
        className={cn(
          "relative inline-flex rounded-full h-2.5 w-2.5",
          className ?? "bg-[var(--chart-3)]",
        )}
      />
    </span>
  )
}

function LiveOpsPanel({
  data,
  summary,
  loading,
}: {
  data: VehiculoActivo[]
  summary?: LiveSummary
  loading: boolean
}) {
  if (loading) {
    return <Skeleton className="h-[260px] w-full" />
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-2 py-8 text-muted-foreground">
        <Truck className="h-6 w-6 opacity-60" />
        <p className="text-xs">Sin vehículos activos en patio.</p>
        <p className="text-[10px]">El sistema está listo para recibir nuevas órdenes.</p>
      </div>
    )
  }

  // Buffer para barra relativa (cada vehículo respecto al de mayor tiempo).
  const maxMin = data.reduce((m, v) => Math.max(m, v.tiempoEnProcesoMin), 0) || 1
  const horasAcum = summary
    ? Math.round((summary.horasAcumuladasMin / 60) * 10) / 10
    : 0

  return (
    <div className="space-y-3">
      {/* Header con resumen agregado */}
      {summary && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 rounded-md border border-border/60 bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <PulseDot />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              En vivo
            </span>
          </div>
          <span className="text-xs flex items-center gap-1.5">
            <Truck className="h-3 w-3 text-[var(--chart-1)]" />
            <span className="font-semibold tabular-nums">{summary.totalVehiculos}</span>
            <span className="text-muted-foreground">en patio</span>
          </span>
          <span className="text-xs flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-[var(--chart-2)]" />
            <span className="font-semibold tabular-nums">{horasAcum} h</span>
            <span className="text-muted-foreground">acumuladas</span>
          </span>
          <span className="text-xs flex items-center gap-1.5">
            <Package className="h-3 w-3 text-[var(--chart-3)]" />
            <span className="font-semibold tabular-nums">
              {fmtDecimal(summary.tonsEnProceso)} t
            </span>
            <span className="text-muted-foreground">en proceso</span>
          </span>
          {/* Chips compactos por estado */}
          {summary.porEstado.slice(0, 3).map((e) => (
            <Badge
              key={e.estado}
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-5 font-normal gap-1",
                e.critico && "border-destructive/50 text-destructive bg-destructive/5",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  e.critico ? "bg-destructive" : "bg-[var(--chart-1)]",
                )}
              />
              {e.estado}
              <span className="font-semibold tabular-nums">{e.count}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Lista de vehículos con dot pulsante por urgencia */}
      <div className="rounded-md border max-h-[260px] overflow-auto divide-y divide-border/50">
        {data.map((v, i) => {
          const styles = URGENCIA_STYLES[v.urgencia]
          const pct = Math.min(100, Math.round((v.tiempoEnProcesoMin / maxMin) * 100))
          return (
            <div
              key={`${v.placa}-${i}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors",
                styles.row,
              )}
            >
              {/* Dot pulsante de urgencia */}
              <PulseDot className={styles.dot} pulseClassName={styles.pulse} />

              {/* Info principal: placa + estado + tipo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-semibold tabular-nums">
                    {v.placa}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1.5 py-0 h-4 font-normal",
                      v.urgencia === "danger" &&
                        "border-destructive/50 text-destructive bg-destructive/10",
                      v.urgencia === "warn" &&
                        "border-[var(--chart-4)]/50 text-[var(--chart-4)] bg-[var(--chart-4)]/10",
                    )}
                  >
                    {v.estado}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{v.tipooperacion}</span>
                  {v.pesovasculaTon > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      · {fmtDecimal(v.pesovasculaTon)} t
                    </span>
                  )}
                </div>
                {/* Barra de progreso relativo al peor del momento */}
                <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", styles.dot)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Tiempo en proceso */}
              <div className="text-right shrink-0">
                <div className="text-xs font-bold tabular-nums leading-tight">
                  {fmtMinutos(v.tiempoEnProcesoMin)}
                </div>
                <div className="text-[9px] text-muted-foreground">en proceso</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Throughput por Hora (Area Chart Compacto)
// ============================================================================

function ThroughputHoraChart({
  data,
  loading,
}: {
  data: ThroughputHora[]
  loading: boolean
}) {
  if (loading) {
    return <Skeleton className="h-[160px] w-full" />
  }

  if (data.length === 0 || data.every((d) => d.toneladas === 0)) {
    return <EmptyState text="Sin actividad registrada." compact />
  }

  const maxTon = Math.max(...data.map((d) => d.toneladas))
  const peakHour = data.find((d) => d.toneladas === maxTon && maxTon > 0)

  return (
    <div className="space-y-1">
      {peakHour && (
        <p className="text-[10px] text-muted-foreground">
          Pico: {peakHour.hora}:00 ({fmtDecimal(peakHour.toneladas)} t)
        </p>
      )}
      <div className="h-[140px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="colorTon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="hora"
              stroke="var(--muted-foreground)"
              fontSize={9}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}h`}
              interval={1}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={9}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}t`}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--popover-foreground)",
                fontSize: 11,
                padding: "6px 10px",
              }}
              formatter={(value: number) => [`${fmtDecimal(value)} t`, "Toneladas"]}
              labelFormatter={(label) => `${label}:00`}
            />
            <Area
              type="monotone"
              dataKey="toneladas"
              stroke="var(--chart-1)"
              fill="url(#colorTon)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ============================================================================
// Distribución de Estados (Donut Compacto)
// ============================================================================

function DistribucionEstadosChart({
  data,
  loading,
}: {
  data: DistribucionEstado[]
  loading: boolean
}) {
  if (loading) {
    return <Skeleton className="h-[160px] w-full" />
  }

  if (data.length === 0) {
    return <EmptyState text="Sin estados registrados." compact />
  }

  const total = data.reduce((sum, d) => sum + d.cantidad, 0)

  return (
    <div className="flex items-center gap-3">
      <div className="h-[140px] w-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={data}
              dataKey="cantidad"
              nameKey="estado"
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={60}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={ESTADO_COLORS[entry.estado] || PIE_COLORS[index % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--popover-foreground)",
                fontSize: 11,
                padding: "6px 10px",
              }}
              formatter={(value: number, name: string) => [
                `${fmtInt(value)} (${Math.round((value / total) * 100)}%)`,
                name,
              ]}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {data.slice(0, 5).map((entry, index) => (
          <div key={entry.estado} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{
                backgroundColor:
                  ESTADO_COLORS[entry.estado] || PIE_COLORS[index % PIE_COLORS.length],
              }}
            />
            <span className="truncate text-muted-foreground text-[10px]">{entry.estado}</span>
            <span className="ml-auto font-semibold tabular-nums text-[11px]">
              {fmtInt(entry.cantidad)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Volumen Temporal (Mensual/Anual)
// ============================================================================

function VolumenTemporalChart({
  data,
  vista,
  loading,
}: {
  data: { mes?: string; dia?: string; cargue: number; descargue: number; distribucion: number }[]
  vista: "mensual" | "anual"
  loading: boolean
}) {
  if (loading) {
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-2 p-4">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Skeleton className="h-[240px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const xKey = vista === "anual" ? "mes" : "dia"
  const title = vista === "anual" ? "Evolución Mensual del Año" : "Volumen Diario del Mes"

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 p-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {data.length === 0 ? (
          <EmptyState text="Sin datos temporales." />
        ) : (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey={xKey}
                  stroke="var(--muted-foreground)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}t`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--popover-foreground)",
                    fontSize: 11,
                  }}
                  formatter={(value: number, name: string) => [
                    `${fmtDecimal(value)} t`,
                    name.charAt(0).toUpperCase() + name.slice(1),
                  ]}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  formatter={(value) => (
                    <span className="text-xs">{value.charAt(0).toUpperCase() + value.slice(1)}</span>
                  )}
                />
                <Bar dataKey="cargue" stackId="a" fill={CHART_COLORS.cargue} />
                <Bar dataKey="descargue" stackId="a" fill={CHART_COLORS.descargue} />
                <Bar
                  dataKey="distribucion"
                  stackId="a"
                  fill={CHART_COLORS.distribucion}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center text-xs text-muted-foreground",
        compact ? "h-[120px]" : "h-[200px]",
      )}
    >
      {text}
    </div>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <MicroKpi key={i} label="" value="" icon={Truck} loading />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Skeleton className="h-[380px] lg:col-span-3" />
        <Skeleton className="h-[380px] lg:col-span-2" />
      </div>
    </div>
  )
}

// ============================================================================
// Vista Diaria (Tiempo Real)
// ============================================================================

function VistaDiaria({
  data,
  loading,
}: {
  data: DashboardRecepcionPayload | null
  loading: boolean
}) {
  if (loading || !data) {
    return <DashboardSkeleton />
  }

  const k = data.kpisDiario
  const insights = data.insightsDelDia ?? []

  return (
    <div className="space-y-4">
      {/* Ticker rotando insights del día.
          Solo se muestra si hay al menos un mensaje. Es una "barra" que
          ocupa el ancho completo arriba de los KPIs y se siente como
          un noticiero del centro de control. */}
      {insights.length > 0 && <InsightsTicker insights={insights} />}

      {/* Micro-KPIs Grid 4x2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <MicroKpi
          label="Volumen Hoy"
          value={`${fmtDecimal(k.volumenHoyTon)} t`}
          icon={Package}
        />
        <MicroKpi
          label="Órdenes Hoy"
          value={fmtInt(k.ordenesHoy)}
          subtext={`${k.ordenesCargue}C / ${k.ordenesDescargue}D / ${k.ordenesDistribucion}Dist`}
          icon={BarChart3}
        />
        <MicroKpi
          label="Lead Time Prom"
          value={fmtMinutos(k.leadTimePromedioMin)}
          subtext="Órdenes finalizadas"
          icon={Timer}
          variant={k.leadTimePromedioMin > 120 ? "warning" : "default"}
        />
        <MicroKpi
          label="En Patio"
          value={fmtInt(k.vehiculosActivosPatio)}
          subtext="Vehículos activos"
          icon={Truck}
          variant={k.vehiculosActivosPatio > 10 ? "warning" : "default"}
        />
        <MicroKpi
          label="Rendimiento"
          value={`${fmtDecimal(k.rendimientoTonHr)} t/h`}
          subtext="Ton por hora"
          icon={Gauge}
          variant="success"
        />
        <MicroKpi
          label="Tiempo Cola"
          value={fmtMinutos(k.tiempoPromedioColaMin)}
          subtext="Orden → Lote"
          icon={Clock}
          variant={k.tiempoPromedioColaMin > 45 ? "warning" : "default"}
        />
        <MicroKpi
          label="Cuello Botella"
          value={k.cuelloBotellaDia}
          icon={AlertTriangle}
          variant={k.cuelloBotellaDia !== "N/A" ? "warning" : "default"}
        />
        <MicroKpi
          label="Alertas Rojas"
          value={fmtInt(k.alertasRojas)}
          subtext="Sin lote / Por pesar"
          icon={AlertCircle}
          variant={k.alertasRojas > 0 ? "danger" : "default"}
        />
      </div>

      {/* Sección de Análisis: 2 Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Columna Izquierda (60%): operación en vivo + funnel.
            El Live Ops Panel queda arriba para que sea lo primero que
            ve el operador, con el resumen agregado y los dots
            pulsantes. */}
        <Card className="border-border/60 lg:col-span-3 overflow-hidden">
          <CardHeader className="pb-2 p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Radio className="h-4 w-4 text-[var(--chart-3)]" />
                Operación en Tiempo Real
              </CardTitle>
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <PulseDot />
                Actualización en vivo
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Vehículos activos con su estado, tiempo en patio y carga ya
              registrada.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <LiveOpsPanel
              data={data.vehiculosActivos}
              summary={data.liveSummary}
              loading={false}
            />
          </CardContent>

          <CardHeader className="pb-2 p-4 pt-2 border-t">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Timer className="h-4 w-4 text-primary" />
              Funnel de Tiempos - Hoy
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Promedio por vehículo en cada etapa (no es la suma del día). Cuello de botella en rojo.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <CuelloBotelllaChart data={data.etapasTiempo} loading={false} />
          </CardContent>
        </Card>

        {/* Columna Derecha (40%) */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-border/60">
            <CardHeader className="pb-2 p-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-primary" />
                Rendimiento por Hora
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ThroughputHoraChart data={data.throughputHora} loading={false} />
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2 p-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <PieChart className="h-4 w-4 text-primary" />
                Estados en Vivo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <DistribucionEstadosChart data={data.distribucionEstados} loading={false} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ComposedChart Mensual: Toneladas (barras apiladas) + Lead Time (línea)
// ============================================================================

/**
 * Tooltip enriquecido del ComposedChart mensual: muestra día completo
 * (DD/MM), desglose por tipo, total del día y lead time promedio.
 * Recibe el `month` para construir la etiqueta `DD/MM`.
 */
function MensualTooltip({
  active,
  payload,
  label,
  month,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>
  label?: string
  month: string
}) {
  if (!active || !payload || !payload.length) return null

  const cargue = payload.find((p) => p.dataKey === "cargue")?.value ?? 0
  const descargue = payload.find((p) => p.dataKey === "descargue")?.value ?? 0
  const distribucion = payload.find((p) => p.dataKey === "distribucion")?.value ?? 0
  const lead = payload.find((p) => p.dataKey === "leadTimePromedioMin")?.value ?? 0
  const total = cargue + descargue + distribucion

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-xs font-semibold mb-1.5">
        Día {label}/{month}
      </p>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: CHART_COLORS.cargue }} />
            Cargue
          </span>
          <span className="font-mono tabular-nums">{fmtDecimal(cargue)} t</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: CHART_COLORS.descargue }}
            />
            Descargue
          </span>
          <span className="font-mono tabular-nums">{fmtDecimal(descargue)} t</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: CHART_COLORS.distribucion }}
            />
            Distribución
          </span>
          <span className="font-mono tabular-nums">{fmtDecimal(distribucion)} t</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 mt-1 border-t border-border/60">
          <span className="font-semibold">Total</span>
          <span className="font-mono tabular-nums font-semibold">{fmtDecimal(total)} t</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-destructive">
            <span className="h-2 w-2 rounded-sm bg-destructive" />
            Lead Time
          </span>
          <span className="font-mono tabular-nums text-destructive">{fmtMinutos(lead)}</span>
        </div>
      </div>
    </div>
  )
}

function TendenciaDiariaMensualChart({
  data,
  month,
  loading,
}: {
  data: VolumenPorDia[]
  month: string
  loading: boolean
}) {
  if (loading) return <Skeleton className="h-[280px] w-full" />
  if (data.length === 0 || data.every((d) => d.cargue + d.descargue + d.distribucion === 0)) {
    return <EmptyState text="Sin operaciones registradas en el mes." />
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="dia"
            stroke="var(--muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            yAxisId="left"
            stroke="var(--muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}t`}
            width={32}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="var(--destructive)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}m`}
            width={36}
          />
          <Tooltip content={<MensualTooltip month={month} />} />
          <Legend
            verticalAlign="top"
            height={28}
            iconType="square"
            formatter={(value) => (
              <span className="text-[11px]">
                {value === "leadTimePromedioMin"
                  ? "Lead Time (min)"
                  : value.charAt(0).toUpperCase() + value.slice(1)}
              </span>
            )}
          />
          <Bar
            yAxisId="left"
            dataKey="cargue"
            stackId="ton"
            fill={CHART_COLORS.cargue}
            name="cargue"
          />
          <Bar
            yAxisId="left"
            dataKey="descargue"
            stackId="ton"
            fill={CHART_COLORS.descargue}
            name="descargue"
          />
          <Bar
            yAxisId="left"
            dataKey="distribucion"
            stackId="ton"
            fill={CHART_COLORS.distribucion}
            name="distribucion"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="leadTimePromedioMin"
            stroke="var(--destructive)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--destructive)" }}
            activeDot={{ r: 4 }}
            name="leadTimePromedioMin"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================================================
// Volumen por Tipo (barras horizontales agrupadas, columna derecha mensual)
// ============================================================================

function VolumenPorTipoChart({
  data,
  loading,
}: {
  data: VolumenPorTipo[]
  loading: boolean
}) {
  if (loading) return <Skeleton className="h-[200px] w-full" />
  if (data.length === 0 || data.every((d) => d.toneladas === 0)) {
    return <EmptyState text="Sin datos por tipo de operación." compact />
  }

  // Color por tipo, casteo manual para evitar índices.
  const colorMap: Record<string, string> = {
    Cargue: CHART_COLORS.cargue,
    Descargue: CHART_COLORS.descargue,
    Distribución: CHART_COLORS.distribucion,
  }

  const total = data.reduce((s, d) => s + d.toneladas, 0)

  return (
    <div className="space-y-3">
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
            barSize={28}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}t`}
            />
            <YAxis
              type="category"
              dataKey="tipooperacion"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={86}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{
                backgroundColor: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--popover-foreground)",
                fontSize: 11,
                padding: "6px 10px",
              }}
              formatter={(value: number) => [
                `${fmtDecimal(value)} t (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
                "Toneladas",
              ]}
            />
            <Bar dataKey="toneladas" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.tipooperacion}
                  fill={colorMap[entry.tipooperacion] || "var(--chart-5)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/60 pt-2">
        <span>Total mes</span>
        <span className="font-semibold tabular-nums text-foreground">
          {fmtDecimal(total)} t
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// Vista Mensual
// ============================================================================

/**
 * Construye un CSV simple del volumen diario y dispara una descarga
 * client-side. No tocamos servidor para evitar overhead; el dataset
 * mensual ya está en el cliente.
 */
function exportarMensualCsv(data: VolumenPorDia[], mesLabel: string) {
  const header = "dia,cargue_ton,descargue_ton,distribucion_ton,lead_time_min\n"
  const rows = data
    .map(
      (d) =>
        `${d.dia},${d.cargue.toFixed(2)},${d.descargue.toFixed(2)},${d.distribucion.toFixed(2)},${d.leadTimePromedioMin}`,
    )
    .join("\n")
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `volumen_diario_${mesLabel.replace(/\s+/g, "_").toLowerCase()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function VistaMensual({
  data,
  loading,
}: {
  data: DashboardRecepcionPayload | null
  loading: boolean
}) {
  if (loading || !data) {
    return <DashboardSkeleton />
  }

  // Si por alguna razón el server no calculó kpisMensual (datos viejos
  // en cache, error de tipos, etc.) caemos a un fallback derivado del
  // payload diario para no romper la UI.
  const km: RecepcionKpisMensual =
    data.kpisMensual ?? {
      volumenAcumuladoTon: data.kpisDiario.volumenHoyTon,
      promedioDiarioTon: 0,
      totalOrdenesMes: data.kpisDiario.ordenesHoy,
      pctCargue: 0,
      pctDescargue: 0,
      pctDistribucion: 0,
      leadTimePromedioMin: data.kpisDiario.leadTimePromedioMin,
      diaPicoLabel: "—",
      diaPicoTon: 0,
      tiempoPromedioColaMin: data.kpisDiario.tiempoPromedioColaMin,
      cuelloBotellaMes: data.kpisDiario.cuelloBotellaDia,
      evolucionLeadTimePct: 0,
    }

  const dias = data.volumenTemporal as VolumenPorDia[]
  const mesNum = data.mesActual?.split("-")[1] ?? ""
  const mesLabel = data.mesActualLabel ?? "Mes Actual"

  return (
    <div className="space-y-4">
      {/* Toolbar local Mensual: título contextual + exportar.
          El selector de vista global vive en el header principal. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          <span>
            Periodo: <span className="font-medium text-foreground capitalize">{mesLabel}</span>
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => exportarMensualCsv(dias, mesLabel)}
          disabled={dias.length === 0}
        >
          <Download className="h-3 w-3" />
          Exportar CSV
        </Button>
      </div>

      {/* Micro-KPIs Grid 4x2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        <MicroKpi
          label="Volumen Acumulado"
          value={`${fmtDecimal(km.volumenAcumuladoTon)} t`}
          subtext="Total mes"
          icon={Package}
        />
        <MicroKpi
          label="Promedio Diario"
          value={`${fmtDecimal(km.promedioDiarioTon)} t/día`}
          subtext="Días operativos"
          icon={Gauge}
          variant="success"
        />
        <MicroKpi
          label="Total Órdenes"
          value={fmtInt(km.totalOrdenesMes)}
          subtext={`${km.pctCargue}% C / ${km.pctDescargue}% D / ${km.pctDistribucion}% Dist`}
          icon={BarChart3}
        />
        <MicroKpi
          label="Lead Time Prom"
          value={fmtMinutos(km.leadTimePromedioMin)}
          subtext="Promedio mes"
          icon={Timer}
          variant={km.leadTimePromedioMin > 120 ? "warning" : "default"}
        />
        <MicroKpi
          label="Día Pico"
          value={km.diaPicoLabel}
          subtext={`${fmtDecimal(km.diaPicoTon)} t`}
          icon={Flame}
          variant="warning"
        />
        <MicroKpi
          label="Tiempo Cola Prom"
          value={fmtMinutos(km.tiempoPromedioColaMin)}
          subtext="Orden → Lote"
          icon={Clock}
          variant={km.tiempoPromedioColaMin > 45 ? "warning" : "default"}
        />
        <MicroKpi
          label="Cuello Botella Mes"
          value={km.cuelloBotellaMes}
          subtext="Mayor tiempo prom."
          icon={AlertTriangle}
          variant={km.cuelloBotellaMes !== "N/A" ? "danger" : "default"}
        />
        {/* Evolución vs mes anterior: sin historial real aún → badge neutro.
            Replica el patron del MicroKpi (fondo blanco + icono coloreado en
            burbuja) para que la grilla luzca homogenea. */}
        <Card className="border-border/60 bg-card">
          <CardContent className="p-3 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                Evolución Lead Time
              </p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-lg font-bold tabular-nums leading-tight">
                  {km.evolucionLeadTimePct === 0
                    ? "0%"
                    : `${km.evolucionLeadTimePct > 0 ? "+" : ""}${km.evolucionLeadTimePct}%`}
                </span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 h-4 font-normal text-muted-foreground"
                >
                  Estable
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                vs mes anterior
              </p>
            </div>
            <span
              className="shrink-0 mt-0.5 h-7 w-7 rounded-md flex items-center justify-center text-[var(--chart-2)] bg-current/10"
              aria-hidden="true"
            >
              <TrendingDown className="h-4 w-4 text-[var(--chart-2)]" />
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Fila Superior: ComposedChart 100% ancho */}
      <Card className="border-border/60">
        <CardHeader className="pb-2 p-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-primary" />
                Tendencia Diaria del Mes
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Toneladas apiladas por tipo (eje izq.) vs Lead Time promedio (eje der., línea
                roja).
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <TendenciaDiariaMensualChart data={dias} month={mesNum} loading={false} />
        </CardContent>
      </Card>

      {/* Fila Inferior: 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2 p-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Timer className="h-4 w-4 text-primary" />
              Cuellos de Botella Estructurales
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Promedio de cada etapa en todo el mes. Mayor en rojo.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <CuelloBotelllaChart data={data.etapasTiempo} loading={false} />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2 p-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Truck className="h-4 w-4 text-primary" />
              Distribución de Carga de Trabajo
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Volumen total agrupado por tipo de operación.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <VolumenPorTipoChart data={data.volumenPorTipo} loading={false} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================================
// Tooltip enriquecido del ComposedChart anual
// ============================================================================

/**
 * Formatea numeros grandes con separadores. Para volumenes de toneladas
 * a nivel anual queremos ver "1,520,800 Ton", no "1.5M".
 */
function fmtTonGrandes(n: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n)
}

function AnualTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>
  label?: string
}) {
  if (!active || !payload || !payload.length) return null

  const cargue = payload.find((p) => p.dataKey === "cargue")?.value ?? 0
  const descargue = payload.find((p) => p.dataKey === "descargue")?.value ?? 0
  const distribucion = payload.find((p) => p.dataKey === "distribucion")?.value ?? 0
  const lead = payload.find((p) => p.dataKey === "leadTimePromedioMin")?.value ?? 0
  const total = cargue + descargue + distribucion

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-xs font-semibold mb-1.5">{label}</p>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: CHART_COLORS.cargue }} />
            Cargue
          </span>
          <span className="font-mono tabular-nums">{fmtTonGrandes(cargue)} t</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: CHART_COLORS.descargue }}
            />
            Descargue
          </span>
          <span className="font-mono tabular-nums">{fmtTonGrandes(descargue)} t</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: CHART_COLORS.distribucion }}
            />
            Distribución
          </span>
          <span className="font-mono tabular-nums">{fmtTonGrandes(distribucion)} t</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 mt-1 border-t border-border/60">
          <span className="font-semibold">Total mes</span>
          <span className="font-mono tabular-nums font-semibold">
            {fmtTonGrandes(total)} t
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-destructive">
            <span className="h-2 w-2 rounded-sm bg-destructive" />
            Lead Time
          </span>
          <span className="font-mono tabular-nums text-destructive">
            {fmtMinutos(lead)}
          </span>
        </div>
      </div>
    </div>
  )
}

function TendenciaAnualChart({
  data,
  loading,
}: {
  data: VolumenPorMes[]
  loading: boolean
}) {
  if (loading) return <Skeleton className="h-[300px] w-full" />
  if (
    data.length === 0 ||
    data.every((m) => m.cargue + m.descargue + m.distribucion === 0)
  ) {
    return <EmptyState text="Sin operaciones registradas en el año." />
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="mes"
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="left"
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            // Formateo grande: 1,200 t en lugar de 1.2k cuando los
            // numeros son del orden de miles. Anuales pueden subir a
            // millones, asi que para >= 1k usamos sufijos.
            tickFormatter={(v: number) => {
              const abs = Math.abs(v)
              if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M t`
              if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K t`
              return `${v}t`
            }}
            width={48}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="var(--destructive)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}m`}
            width={40}
          />
          <Tooltip content={<AnualTooltip />} />
          <Legend
            verticalAlign="top"
            height={28}
            iconType="square"
            formatter={(value) => (
              <span className="text-[11px]">
                {value === "leadTimePromedioMin"
                  ? "Lead Time prom (min)"
                  : value.charAt(0).toUpperCase() + value.slice(1)}
              </span>
            )}
          />
          <Bar
            yAxisId="left"
            dataKey="cargue"
            stackId="ton"
            fill={CHART_COLORS.cargue}
            name="cargue"
          />
          <Bar
            yAxisId="left"
            dataKey="descargue"
            stackId="ton"
            fill={CHART_COLORS.descargue}
            name="descargue"
          />
          <Bar
            yAxisId="left"
            dataKey="distribucion"
            stackId="ton"
            fill={CHART_COLORS.distribucion}
            name="distribucion"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="leadTimePromedioMin"
            stroke="var(--destructive)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--destructive)" }}
            activeDot={{ r: 4 }}
            name="leadTimePromedioMin"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================================================
// Donut: Proporción de Negocio Anual (volumen por tipo de operación)
// ============================================================================

function ProporcionNegocioDonut({
  data,
  loading,
}: {
  data: VolumenPorTipo[]
  loading: boolean
}) {
  if (loading) return <Skeleton className="h-[260px] w-full" />
  const total = data.reduce((s, d) => s + d.toneladas, 0)
  if (total === 0) {
    return <EmptyState text="Sin volumen registrado." compact />
  }

  const colorMap: Record<string, string> = {
    Cargue: CHART_COLORS.cargue,
    Descargue: CHART_COLORS.descargue,
    Distribución: CHART_COLORS.distribucion,
  }

  return (
    <div className="space-y-3">
      <div className="h-[200px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={data}
              dataKey="toneladas"
              nameKey="tipooperacion"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--background)"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.tipooperacion}
                  fill={colorMap[entry.tipooperacion] || "var(--chart-5)"}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--popover-foreground)",
                fontSize: 11,
                padding: "6px 10px",
              }}
              formatter={(value: number, name: string) => [
                `${fmtTonGrandes(value)} t (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
                name,
              ]}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
        {/* Centro del donut con el total YTD */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total YTD
          </span>
          <span className="text-base font-bold tabular-nums leading-tight">
            {fmtTonGrandes(total)} t
          </span>
        </div>
      </div>
      {/* Leyenda compacta debajo del donut */}
      <div className="space-y-1.5">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.toneladas / total) * 100) : 0
          return (
            <div
              key={d.tipooperacion}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: colorMap[d.tipooperacion] || "var(--chart-5)" }}
                />
                <span>{d.tipooperacion}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-muted-foreground">
                  {fmtTonGrandes(d.toneladas)} t
                </span>
                <span className="font-mono tabular-nums font-semibold w-9 text-right">
                  {pct}%
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Vista Anual (YTD)
// ============================================================================

function exportarReporteAnual(
  meses: VolumenPorMes[],
  k: RecepcionKpisAnual,
  year: number,
) {
  // Bloque 1: KPIs resumen.
  const summary = [
    "RESUMEN ANUAL YTD",
    `Año,${year}`,
    `Volumen Total YTD (t),${k.volumenTotalYTDTon}`,
    `Promedio Mensual (t),${k.promedioMensualTon}`,
    `Total Órdenes YTD,${k.totalOrdenesYTD}`,
    `% Cargue,${k.pctCargue}`,
    `% Descargue,${k.pctDescargue}`,
    `% Distribución,${k.pctDistribucion}`,
    `Lead Time Histórico (min),${k.leadTimeHistoricoMin}`,
    `Mes Récord,${k.mesRecordLabel}`,
    `Volumen Mes Récord (t),${k.mesRecordTon}`,
    `Cuello Botella Anual,${k.cuelloBotellaAnual}`,
    `Mes Más Eficiente,${k.mesEficienteLabel}`,
    `Lead Time Mes Eficiente (min),${k.mesEficienteMin}`,
    `Proyección de Cierre (t),${k.proyeccionCierreTon}`,
    "",
  ].join("\n")

  // Bloque 2: detalle mes a mes.
  const header = "mes,cargue_t,descargue_t,distribucion_t,total_t,lead_time_min\n"
  const rows = meses
    .map((m) => {
      const tot = m.cargue + m.descargue + m.distribucion
      return `${m.mes},${m.cargue.toFixed(2)},${m.descargue.toFixed(2)},${m.distribucion.toFixed(2)},${tot.toFixed(2)},${m.leadTimePromedioMin}`
    })
    .join("\n")

  const blob = new Blob([summary + header + rows], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `reporte_anual_${year}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function VistaAnual({
  data,
  loading,
}: {
  data: DashboardRecepcionPayload | null
  loading: boolean
}) {
  if (loading || !data) {
    return <DashboardSkeleton />
  }

  // Fallback si por algun motivo el server no calculo kpisAnual.
  const ka: RecepcionKpisAnual =
    data.kpisAnual ?? {
      volumenTotalYTDTon: data.kpisDiario.volumenHoyTon,
      promedioMensualTon: 0,
      totalOrdenesYTD: data.kpisDiario.ordenesHoy,
      pctCargue: 0,
      pctDescargue: 0,
      pctDistribucion: 0,
      leadTimeHistoricoMin: data.kpisDiario.leadTimePromedioMin,
      mesRecordLabel: "—",
      mesRecordTon: 0,
      cuelloBotellaAnual: data.kpisDiario.cuelloBotellaDia,
      mesEficienteLabel: "—",
      mesEficienteMin: 0,
      proyeccionCierreTon: 0,
    }

  const meses = data.volumenTemporal as VolumenPorMes[]
  const year = new Date().getFullYear()

  return (
    <div className="space-y-4">
      {/* Toolbar local Anual: contexto + exportar reporte */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          <span>
            Periodo:{" "}
            <span className="font-medium text-foreground">
              1 enero — {formatFechaHoy(data.fechaHoy).split(",")[1]?.trim() || data.fechaHoy}
            </span>
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => exportarReporteAnual(meses, ka, year)}
          disabled={meses.length === 0}
        >
          <FileText className="h-3 w-3" />
          Generar Reporte Anual
        </Button>
      </div>

      {/* Grid 4x2 de Micro-KPIs anuales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MicroKpi
          label="Volumen Total YTD"
          value={`${fmtTonGrandes(ka.volumenTotalYTDTon)} t`}
          subtext="Acumulado año"
          icon={Package}
        />
        <MicroKpi
          label="Promedio Mensual"
          value={`${fmtTonGrandes(ka.promedioMensualTon)} t/mes`}
          subtext="Meses transcurridos"
          icon={Gauge}
          variant="success"
        />
        <MicroKpi
          label="Total Órdenes YTD"
          value={fmtInt(ka.totalOrdenesYTD)}
          subtext={`${ka.pctCargue}% C / ${ka.pctDescargue}% D / ${ka.pctDistribucion}% Dist`}
          icon={BarChart3}
        />
        <MicroKpi
          label="Lead Time Histórico"
          value={fmtMinutos(ka.leadTimeHistoricoMin)}
          subtext="Promedio año"
          icon={Timer}
          variant={ka.leadTimeHistoricoMin > 120 ? "warning" : "default"}
        />
        <MicroKpi
          label="Mes Récord"
          value={ka.mesRecordLabel}
          subtext={`${fmtTonGrandes(ka.mesRecordTon)} t`}
          icon={Trophy}
          variant="warning"
        />
        {/* Cuello de botella en rojo (variant=danger). */}
        <MicroKpi
          label="Cuello Botella Anual"
          value={ka.cuelloBotellaAnual}
          subtext="Etapa más lenta"
          icon={AlertTriangle}
          variant={ka.cuelloBotellaAnual !== "N/A" ? "danger" : "default"}
        />
        <MicroKpi
          label="Mes Más Eficiente"
          value={ka.mesEficienteLabel}
          subtext={
            ka.mesEficienteMin > 0
              ? `Lead time ${fmtMinutos(ka.mesEficienteMin)}`
              : "Sin data suficiente"
          }
          icon={Sparkles}
          variant="success"
        />
        <MicroKpi
          label="Proyección Cierre"
          value={`${fmtTonGrandes(ka.proyeccionCierreTon)} t`}
          subtext="Promedio × 12"
          icon={Target}
        />
      </div>

      {/* Fila Superior: ComposedChart full-width */}
      <Card className="border-border/60">
        <CardHeader className="pb-2 p-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-primary" />
                Evolución Mes a Mes
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Toneladas apiladas por tipo (eje izq.) vs Lead Time promedio (eje der.).
                Detecta si la operación pierde eficiencia en temporada alta.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <TendenciaAnualChart data={meses} loading={false} />
        </CardContent>
      </Card>

      {/* Fila Inferior: Análisis de Tiempos Históricos + Proporción de Negocio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2 p-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Timer className="h-4 w-4 text-primary" />
              Análisis de Tiempos Históricos
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Promedio de cada etapa para todo el año. La etapa más lenta marca dónde
              invertir presupuesto el próximo año.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <CuelloBotelllaChart data={data.etapasTiempo} loading={false} />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2 p-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <PieChart className="h-4 w-4 text-primary" />
              Proporción de Negocio Anual
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Peso porcentual del volumen por tipo de operación.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <ProporcionNegocioDonut data={data.volumenPorTipo} loading={false} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function DashboardRecepcion() {
  // El selector global de empresa vive en el AuthProvider (lo mismo
  // patron que usan dashboard-operacion-dia, gestion-facturas, etc.).
  // `selectedEmpresaId` es null hasta que el usuario elija una empresa
  // distinta a la suya por defecto; en ese caso pasamos undefined al
  // server action para que caiga al `getCurrentEmpresaId()` del perfil.
  const { selectedEmpresaId } = useAuth()
  const [vista, setVista] = useState<"diario" | "mensual" | "anual">("diario")
  const [data, setData] = useState<DashboardRecepcionPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // ─── Selección de periodo ────────────────────────────────────────────
  // Permiten navegar a otros días/meses/años distintos al actual.
  //   - selectedDate: "YYYY-MM-DD" para la vista diaria.
  //   - selectedYear / selectedMonth: para mensual (ambos) y anual (año).
  // Se inicializan al periodo actual en zona Bogota.
  const hoyBogota = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
    return parts // "YYYY-MM-DD"
  }, [])
  const [yHoy, mHoy] = useMemo(() => {
    const [y, m] = hoyBogota.split("-")
    return [Number(y), Number(m)] as const
  }, [hoyBogota])

  const [selectedDate, setSelectedDate] = useState<string>(hoyBogota)
  const [selectedYear, setSelectedYear] = useState<number>(yHoy)
  const [selectedMonth, setSelectedMonth] = useState<number>(mHoy)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      // Pasamos el id de empresa seleccionado en el top bar para que
      // el server action lo aplique como filtro en `idempresa`. Si no
      // hay una seleccion explicita (selectedEmpresaId === null), el
      // server cae al empresa_id del perfil autenticado.
      // Tambien pasamos el periodo elegido segun la vista activa.
      const result = await getDashboardRecepcionData(
        selectedEmpresaId ?? undefined,
        vista,
        vista === "diario" ? selectedDate : undefined,
        vista === "diario" ? undefined : selectedYear,
        vista === "mensual" ? selectedMonth : undefined,
      )
      if (!result.success) {
        setError(result.error || "Error desconocido")
        setData(null)
      } else {
        setData(result.data)
      }
    } catch (err) {
      console.error("[v0] DashboardRecepcion fetch error:", err)
      setError("Error al cargar el dashboard")
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [vista, selectedEmpresaId, selectedDate, selectedYear, selectedMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const fechaDisplay = useMemo(() => {
    if (!data?.fechaHoy) return ""
    return formatFechaHoy(data.fechaHoy)
  }, [data?.fechaHoy])

  // ¿El periodo seleccionado es el actual? Solo entonces la vista diaria
  // es realmente "en vivo".
  const esDiaHoy = vista === "diario" && selectedDate === hoyBogota
  const esPeriodoActual =
    (vista === "diario" && selectedDate === hoyBogota) ||
    (vista === "mensual" && selectedYear === yHoy && selectedMonth === mHoy) ||
    (vista === "anual" && selectedYear === yHoy)

  // Lista de años para los selectores: desde 2022 hasta el año actual,
  // descendente (el más reciente primero).
  const yearOptions = useMemo(() => {
    const years: number[] = []
    for (let y = yHoy; y >= 2022; y--) years.push(y)
    return years
  }, [yHoy])

  // Nombres de meses en español para el selector mensual.
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: new Date(2020, i, 1).toLocaleDateString("es-CO", { month: "long" }),
      })),
    [],
  )

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={handleRefresh} variant="outline" className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header Compacto */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold capitalize">
              {vista === "diario"
                ? "Operación en Tiempo Real"
                : vista === "mensual"
                  ? `Análisis Mensual${data?.mesActualLabel ? ` — ${data.mesActualLabel}` : ""}`
                  : `Resumen Anual y Estacionalidad — ${data?.anioActual ?? selectedYear}`}
            </h2>
            {esDiaHoy && <LiveIndicator />}
            {!esPeriodoActual && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal gap-1">
                <CalendarRange className="h-3 w-3" />
                Histórico
              </Badge>
            )}
          </div>
          {vista === "diario" && fechaDisplay && (
            <p className="text-xs text-muted-foreground capitalize">{fechaDisplay}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de periodo segun la vista activa */}
          {vista === "diario" ? (
            <Input
              type="date"
              value={selectedDate}
              max={hoyBogota}
              onChange={(e) => setSelectedDate(e.target.value || hoyBogota)}
              className="h-8 w-[150px] text-xs"
              aria-label="Seleccionar día"
            />
          ) : vista === "mensual" ? (
            <>
              <Select
                value={String(selectedMonth)}
                onValueChange={(v) => setSelectedMonth(Number(v))}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs capitalize" aria-label="Seleccionar mes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)} className="capitalize text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => setSelectedYear(Number(v))}
              >
                <SelectTrigger className="h-8 w-[90px] text-xs" aria-label="Seleccionar año">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-xs">
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <Select
              value={String(selectedYear)}
              onValueChange={(v) => setSelectedYear(Number(v))}
            >
              <SelectTrigger className="h-8 w-[90px] text-xs" aria-label="Seleccionar año">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)} className="text-xs">
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Tabs value={vista} onValueChange={(v) => setVista(v as typeof vista)}>
            <TabsList className="h-8">
              <TabsTrigger value="diario" className="gap-1 text-xs h-7 px-2">
                <Calendar className="h-3 w-3" />
                <span className="hidden sm:inline">Diario</span>
              </TabsTrigger>
              <TabsTrigger value="mensual" className="gap-1 text-xs h-7 px-2">
                <CalendarDays className="h-3 w-3" />
                <span className="hidden sm:inline">Mensual</span>
              </TabsTrigger>
              <TabsTrigger value="anual" className="gap-1 text-xs h-7 px-2">
                <CalendarRange className="h-3 w-3" />
                <span className="hidden sm:inline">Anual</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="h-8"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Contenido por vista */}
      {vista === "diario" ? (
        <VistaDiaria data={data} loading={loading && !data} />
      ) : vista === "mensual" ? (
        <VistaMensual data={data} loading={loading && !data} />
      ) : (
        <VistaAnual data={data} loading={loading && !data} />
      )}

      {/* Footer con timestamp */}
      {data && (
        <p className="text-[10px] text-muted-foreground text-right">
          Última actualización:{" "}
          {new Date(data.generatedAt).toLocaleString("es-CO", {
            timeZone: "America/Bogota",
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      )}
    </div>
  )
}
