"use client"

import { MapPin, TrendingUp, TrendingDown, Truck, Package, Building2, Signal } from "lucide-react"
import { PanelCard } from "./panel-card"

/**
 * Cobertura Nacional
 *
 * Vista ejecutiva de la presencia operativa por ciudad/sede. En un ciclo
 * posterior se conectara al server action que agrupe `dashboardoperaciones`
 * y `citasvehiculos` por `idempresa` (cada sede = una empresa dentro del
 * grupo LIPGO) para alimentar recibos, despachos y cumplimiento.
 */

export interface SedeCobertura {
  id: string
  ciudad: string
  region: "Norte" | "Centro" | "Sur" | "Pacifico" | "Caribe"
  x: number
  y: number
  recibos: number
  despachos: number
  cumplimiento: number
  estado: "operativa" | "atencion" | "critica"
}

interface Props {
  data?: SedeCobertura[]
}

const DEMO_SEDES: SedeCobertura[] = [
  { id: "BOG", ciudad: "Bogotá", region: "Centro", x: 52, y: 55, recibos: 24, despachos: 18, cumplimiento: 95, estado: "operativa" },
  { id: "MDE", ciudad: "Medellín", region: "Centro", x: 42, y: 45, recibos: 18, despachos: 14, cumplimiento: 92, estado: "operativa" },
  { id: "CLO", ciudad: "Cali", region: "Pacifico", x: 38, y: 70, recibos: 15, despachos: 12, cumplimiento: 88, estado: "atencion" },
  { id: "BAQ", ciudad: "Barranquilla", region: "Caribe", x: 48, y: 18, recibos: 12, despachos: 10, cumplimiento: 91, estado: "operativa" },
  { id: "CTG", ciudad: "Cartagena", region: "Caribe", x: 40, y: 22, recibos: 9, despachos: 7, cumplimiento: 96, estado: "operativa" },
  { id: "BGA", ciudad: "Bucaramanga", region: "Norte", x: 58, y: 35, recibos: 8, despachos: 6, cumplimiento: 78, estado: "critica" },
  { id: "PEI", ciudad: "Pereira", region: "Centro", x: 40, y: 55, recibos: 6, despachos: 5, cumplimiento: 94, estado: "operativa" },
  { id: "VUP", ciudad: "Villavicencio", region: "Sur", x: 62, y: 62, recibos: 5, despachos: 4, cumplimiento: 89, estado: "atencion" },
]

const ESTADO_STYLES: Record<
  SedeCobertura["estado"],
  { dot: string; ring: string; tag: string; label: string }
> = {
  operativa: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-200",
    tag: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "Operativa",
  },
  atencion: {
    dot: "bg-amber-500",
    ring: "ring-amber-200",
    tag: "bg-amber-50 text-amber-700 border-amber-200",
    label: "Atención",
  },
  critica: {
    dot: "bg-rose-500",
    ring: "ring-rose-200",
    tag: "bg-rose-50 text-rose-700 border-rose-200",
    label: "Crítica",
  },
}

export function CoberturaNacionalSection({ data }: Props) {
  const sedes = data && data.length > 0 ? data : DEMO_SEDES

  const totalRecibos = sedes.reduce((acc, s) => acc + s.recibos, 0)
  const totalDespachos = sedes.reduce((acc, s) => acc + s.despachos, 0)
  const cumplimientoPromedio = Math.round(
    sedes.reduce((acc, s) => acc + s.cumplimiento, 0) / Math.max(1, sedes.length),
  )
  const sedesActivas = sedes.filter((s) => s.estado !== "critica").length

  const topSedes = [...sedes].sort((a, b) => b.cumplimiento - a.cumplimiento).slice(0, 5)
  const sedesEnRiesgo = [...sedes]
    .filter((s) => s.estado !== "operativa")
    .sort((a, b) => a.cumplimiento - b.cumplimiento)

  return (
    <div className="flex flex-col gap-4">
      {/* Fila superior: Stats consolidados */}
      <div
        className="grid gap-3 md:gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        <ConsolidatedStat
          icon={<Building2 className="h-4 w-4" />}
          label="Sedes activas"
          value={`${sedesActivas}/${sedes.length}`}
          accent="cyan"
        />
        <ConsolidatedStat
          icon={<Truck className="h-4 w-4" />}
          label="Recibos del día"
          value={totalRecibos.toString()}
          accent="emerald"
        />
        <ConsolidatedStat
          icon={<Package className="h-4 w-4" />}
          label="Despachos del día"
          value={totalDespachos.toString()}
          accent="sky"
        />
        <ConsolidatedStat
          icon={<Signal className="h-4 w-4" />}
          label="Cumplimiento prom."
          value={`${cumplimientoPromedio}%`}
          accent={cumplimientoPromedio >= 90 ? "emerald" : cumplimientoPromedio >= 80 ? "amber" : "rose"}
        />
      </div>

      {/* Fila principal: mapa simbolico + ranking */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <PanelCard
            title="Red Nacional de Operaciones"
            subtitle={`${sedes.length} sedes CEDI conectadas en tiempo real`}
            icon={<MapPin className="h-4 w-4 text-[#0aa1c4]" />}
            accent="cyan"
            headerRight={
              <div className="inline-flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Conectadas</span>
              </div>
            }
          >
            <SymbolicMap sedes={sedes} />
            <MapLegend />
          </PanelCard>
        </div>

        <div className="flex flex-col gap-3 md:gap-4">
          <PanelCard
            title="Top Sedes"
            subtitle="Mayor cumplimiento hoy"
            icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
            accent="emerald"
            bodyClassName="gap-2"
          >
            <div className="flex flex-col gap-2">
              {topSedes.map((sede, i) => (
                <SedeRankingRow key={sede.id} sede={sede} position={i + 1} />
              ))}
            </div>
          </PanelCard>

          {sedesEnRiesgo.length > 0 && (
            <PanelCard
              title="Requieren atención"
              subtitle={`${sedesEnRiesgo.length} sede${sedesEnRiesgo.length === 1 ? "" : "s"} por debajo del objetivo`}
              icon={<TrendingDown className="h-4 w-4 text-rose-600" />}
              accent="rose"
            >
              <div className="flex flex-col gap-2">
                {sedesEnRiesgo.map((sede) => (
                  <SedeRiesgoRow key={sede.id} sede={sede} />
                ))}
              </div>
            </PanelCard>
          )}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Subcomponentes                                                         */
/* --------------------------------------------------------------------- */

function ConsolidatedStat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: "cyan" | "emerald" | "sky" | "amber" | "rose"
}) {
  const accentColors: Record<string, string> = {
    cyan: "text-[#0aa1c4] bg-[#5bc0de]/10 border-[#5bc0de]/30",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
    sky: "text-sky-700 bg-sky-50 border-sky-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    rose: "text-rose-700 bg-rose-50 border-rose-200",
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-xl border flex items-center justify-center ${accentColors[accent]}`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-[11px] tracking-wider text-muted-foreground uppercase">{label}</div>
          <div className="text-xl font-bold text-foreground font-mono tabular-nums">{value}</div>
        </div>
      </div>
    </div>
  )
}

function SymbolicMap({ sedes }: { sedes: SedeCobertura[] }) {
  return (
    <div
      className="relative w-full rounded-xl border border-border overflow-hidden bg-[#F4F7FC]"
      style={{ aspectRatio: "16 / 10", minHeight: 280 }}
    >
      {/* Fondo con gradiente sutil + grilla sutil */}
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(800px 400px at 50% 50%, rgba(91,192,222,0.15), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.4]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(100,116,139,0.12) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(100,116,139,0.12) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* SVG para conexiones entre nodos */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        {sedes.map((sede, i) =>
          sedes.slice(i + 1).map((otra) => (
            <line
              key={`${sede.id}-${otra.id}`}
              x1={`${sede.x}%`}
              y1={`${sede.y}%`}
              x2={`${otra.x}%`}
              y2={`${otra.y}%`}
              stroke="rgba(91,192,222,0.18)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          )),
        )}
      </svg>

      {/* Nodos de las sedes */}
      {sedes.map((sede) => {
        const styles = ESTADO_STYLES[sede.estado]
        return (
          <div
            key={sede.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${sede.x}%`, top: `${sede.y}%` }}
          >
            {sede.estado !== "operativa" && (
              <span
                className={`absolute inset-0 rounded-full ${styles.dot} opacity-40 animate-ping`}
                style={{ transform: "scale(1.6)" }}
                aria-hidden="true"
              />
            )}
            <div
              className={`relative flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-white border border-border shadow-sm ring-2 ${styles.ring} transition-transform group-hover:scale-105`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
              <span className="text-[10px] font-mono font-bold text-foreground tracking-wide">
                {sede.id}
              </span>
            </div>
            <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <div className="px-2 py-1.5 rounded-md bg-white border border-border shadow-lg whitespace-nowrap">
                <div className="text-[11px] font-semibold text-foreground">{sede.ciudad}</div>
                <div className="text-[10px] text-muted-foreground">
                  {sede.recibos} rec · {sede.despachos} desp · {sede.cumplimiento}%
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MapLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Operativa
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        En atención
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-rose-500" />
        Crítica
      </span>
      <span className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground/80">
        <span className="inline-block h-px w-6 border-t border-dashed border-[#5bc0de]/50" />
        Conexión de red
      </span>
    </div>
  )
}

function SedeRankingRow({ sede, position }: { sede: SedeCobertura; position: number }) {
  const styles = ESTADO_STYLES[sede.estado]
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/40 border border-border">
      <div className="h-7 w-7 rounded-lg bg-[#5bc0de]/10 border border-[#5bc0de]/30 flex items-center justify-center text-xs font-bold text-[#0aa1c4]">
        {position}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate">{sede.ciudad}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {sede.recibos} rec · {sede.despachos} desp
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-emerald-700 font-mono tabular-nums">
          {sede.cumplimiento}%
        </div>
        <div className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded border text-[9px] ${styles.tag}`}>
          <span className={`h-1 w-1 rounded-full ${styles.dot}`} />
          {styles.label}
        </div>
      </div>
    </div>
  )
}

function SedeRiesgoRow({ sede }: { sede: SedeCobertura }) {
  const styles = ESTADO_STYLES[sede.estado]
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/40 border border-border">
      <div className={`h-2 w-2 rounded-full ${styles.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate">{sede.ciudad}</div>
        <div className="text-[11px] text-muted-foreground">{sede.region}</div>
      </div>
      <div className={`text-sm font-bold font-mono tabular-nums ${sede.estado === "critica" ? "text-rose-700" : "text-amber-700"}`}>
        {sede.cumplimiento}%
      </div>
    </div>
  )
}
