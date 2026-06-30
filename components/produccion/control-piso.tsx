"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Award,
  Boxes,
  Calendar,
  Download,
  FileText,
  Gauge,
  Layers,
  MapPin,
  Package2,
  Radio,
  Search,
  Target,
  Timer,
  TrendingUp,
  TriangleAlert,
  Warehouse,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

// Fila cruda de `produccion` (usada por las pestanias Mensual/Anual que
// agregan en cliente sobre la tabla base).
interface ProduccionRow {
  id: number
  fecha_hora: string
  producto: number
  bodega: number | null
  localizacion: number | null
  tipo_empaque: string | null
  lote: number | null
  bultos_procesados: number | null
  averias: number | null
}

// Vista `vw_produccion_dashboard`: una fila por registro, ya enriquecida
// en PostgreSQL con el nombre del producto, el intervalo de 10 min, los
// minutos transcurridos desde el registro anterior y la bandera de parada.
interface VwDashboardRow {
  id: number
  fecha_hora: string
  producto_nombre: string | null
  tipo_empaque: string | null
  lote: number | null
  bultos_procesados: number | null
  averias: number | null
  intervalo_10m: string | null
  minutos_desde_anterior: number | null
  alerta_parada: boolean | null
}

// Vista `vw_produccion_agrupada_10m`: una fila por cubeta de 10 min, ya
// agregada en SQL. Alimenta los KPIs y el grafico de la linea de tiempo.
interface VwAgrupada10mRow {
  intervalo: string
  total_bultos: number | null
  total_averias: number | null
  total_estibas: number | null
  bultos_arrume: number | null
}

// Mostramos la hora EXACTA almacenada en los timestamptz sin convertir a
// la zona de Colombia: formateamos en UTC para que los digitos coincidan
// con los del valor guardado (sin restar las 5 horas).
const HORA_FMT = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
})

// Umbral de parada de linea (minutos). Por encima, el cronometro de
// inactividad entra en estado critico (rojo).
const DOWNTIME_THRESHOLD_MIN = 45

// Ventana del turno (en hora UTC literal, igual que el resto del tablero).
const SHIFT_START_HOUR = 6
const SHIFT_END_HOUR = 20

// Tamanio de la cubeta del eje de cobertura de 10 min.
const BUCKET_MIN = 10

// Reglas de ritmo (pacing): meta fija por hora y meta total del dia.
const META_POR_HORA = 240
const HORAS_TURNO = SHIFT_END_HOUR - SHIFT_START_HOUR // 14 horas
const META_DIA = META_POR_HORA * HORAS_TURNO // 3360 bultos

// Colores (variables CSS del tema) para los estados de pacing.
const PACE_COLOR: Record<"good" | "warn" | "bad", string> = {
  good: "var(--chart-3)",
  warn: "var(--chart-4)",
  bad: "var(--destructive)",
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]
const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

// Paleta para el Product Mix (pie chart), tomada de los tokens de marca.
const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-secondary)",
  "var(--color-primary)",
  "var(--color-destructive)",
]

// Fecha (YYYY-MM-DD) del dia actual en UTC. La usamos para el filtro
// "hoy" porque mostramos la hora literal del timestamptz (en UTC), de
// modo que el limite del dia coincida con los digitos que se ven.
function utcDateStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

// Dado un YYYY-MM-DD devuelve el dia siguiente en el mismo formato.
// Lo usamos para construir el limite superior [desde, hasta) del filtro
// por dia sin depender de la zona horaria local.
function nextDateStr(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(next)
}

// Convierte un instante real a milisegundos en el marco del eje, que usa
// la "hora literal" (UTC). Tomamos la hora de pared de Bogota y la
// reinterpretamos como UTC para que el corte de "ahora" coincida con la
// hora visible y las cubetas futuras no se pinten como parada.
function bogotaWallAsUtcMs(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00"
  // "24" puede aparecer a medianoche en algunos motores; lo normalizamos.
  const hour = get("hour") === "24" ? "00" : get("hour")
  return Date.parse(
    `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}Z`,
  )
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

// Parseo robusto de un timestamptz de Supabase a Date (instante UTC).
// Normaliza variantes que algunos navegadores no parsean bien:
//  - separador con espacio en lugar de "T" ("2026-06-08 14:30:00+00")
//  - offset corto de 2 digitos ("+00" / "-05" -> "+00:00" / "-05:00")
// Si el valor no trae zona horaria, se asume UTC.
function parseTs(value: string): Date {
  if (!value) return new Date(NaN)
  let s = value.trim().replace(" ", "T")
  const tzMatch = s.match(/([+-]\d{2}(:?\d{2})?|Z)$/)
  if (!tzMatch) {
    s = `${s}Z`
  } else if (/[+-]\d{2}$/.test(s)) {
    s = `${s}:00`
  }
  return new Date(s)
}

// Rango [inicio, fin) en zona Bogota para un mes dado (mes 0-11).
function monthRange(year: number, month: number) {
  const start = `${year}-${pad2(month + 1)}-01T00:00:00-05:00`
  const ny = month === 11 ? year + 1 : year
  const nm = month === 11 ? 0 : month + 1
  const end = `${ny}-${pad2(nm + 1)}-01T00:00:00-05:00`
  return { start, end }
}

// Rango [inicio, fin) en zona Bogota para un anio completo.
function yearRange(year: number) {
  return {
    start: `${year}-01-01T00:00:00-05:00`,
    end: `${year + 1}-01-01T00:00:00-05:00`,
  }
}

function isEstiba(t: string | null) {
  return (t || "").trim().toLowerCase() === "estiba"
}
function isArrume(t: string | null) {
  return (t || "").trim().toLowerCase() === "arrume"
}

// Dia del mes (1-31) en zona Bogota desde un timestamp.
function bogotaDay(iso: string) {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    day: "2-digit",
  }).format(parseTs(iso))
  return Number(s)
}

// Mes (0-11) en zona Bogota desde un timestamp.
function bogotaMonth(iso: string) {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    month: "2-digit",
  }).format(parseTs(iso))
  return Number(s) - 1
}

// Estilo comun del tooltip de Recharts usando los tokens de marca.
const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--color-popover-foreground)",
}

export default function ControlPiso() {
  // Diccionario de productos compartido por las pestanias Mensual/Anual
  // (que agregan sobre la tabla base `produccion`). La pestania En Vivo
  // ya recibe el nombre desde la vista SQL.
  const [productos, setProductos] = useState<Record<number, string>>({})

  useEffect(() => {
    let active = true
    supabase
      .from("productos")
      .select("id, nombre")
      .then(({ data }) => {
        if (!active) return
        const dict: Record<number, string> = {}
        for (const p of (data as { id: number; nombre: string }[]) || []) {
          dict[p.id] = p.nombre
        }
        setProductos(dict)
      })
    return () => {
      active = false
    }
  }, [])

  const nombreProducto = (id: number) => productos[id] || `Producto ${id}`

  return (
    <div className="min-h-full bg-background p-4 text-foreground md:p-6">
      <div className="space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/30">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-card-foreground">Dashboard de Producción</h1>
              <p className="text-sm text-muted-foreground">
                Disponibilidad operativa y ritmo de planta en tiempo real
              </p>
            </div>
          </div>
        </header>

        <Tabs defaultValue="vivo" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-muted md:w-auto md:inline-grid">
            <TabsTrigger value="vivo" className="data-[state=active]:bg-card data-[state=active]:text-primary">
              En Vivo
            </TabsTrigger>
            <TabsTrigger value="mensual" className="data-[state=active]:bg-card data-[state=active]:text-primary">
              Resumen Mensual
            </TabsTrigger>
            <TabsTrigger value="anual" className="data-[state=active]:bg-card data-[state=active]:text-primary">
              Resumen Anual
            </TabsTrigger>
            <TabsTrigger value="reporte" className="data-[state=active]:bg-card data-[state=active]:text-primary">
              Reporte
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vivo" className="mt-6">
            <LiveTab />
          </TabsContent>
          <TabsContent value="mensual" className="mt-6">
            <MonthlyTab nombreProducto={nombreProducto} />
          </TabsContent>
          <TabsContent value="anual" className="mt-6">
            <AnnualTab nombreProducto={nombreProducto} />
          </TabsContent>
          <TabsContent value="reporte" className="mt-6">
            <ReportTab nombreProducto={nombreProducto} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* TAB 1: EN VIVO (HOY) — alimentado por vistas SQL                    */
/* ------------------------------------------------------------------ */

function LiveTab() {
  const [dashRows, setDashRows] = useState<VwDashboardRow[]>([])
  const [aggRows, setAggRows] = useState<VwAgrupada10mRow[]>([])
  const [loading, setLoading] = useState(true)
  const [realtimeOk, setRealtimeOk] = useState(false)
  // Dia seleccionado (YYYY-MM-DD en hora literal/UTC). Por defecto HOY.
  // Permite navegar hacia atras para ver el tablero de dias anteriores.
  const [selectedDate, setSelectedDate] = useState<string>(() => utcDateStr())
  const isToday = selectedDate === utcDateStr()
  // Reloj de alta frecuencia (cada segundo) para el cronometro de
  // inactividad, que debe mostrar minutos y segundos vivos.
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Trae el dia seleccionado desde ambas vistas. Reutilizable: el realtime
  // la invoca para re-leer los datos ya calculados por PostgreSQL tras cada
  // INSERT (solo relevante cuando se mira HOY).
  const loadViews = useCallback(async () => {
    try {
      const desde = `${selectedDate}T00:00:00Z`
      const hasta = `${nextDateStr(selectedDate)}T00:00:00Z`
      const [dashRes, aggRes] = await Promise.all([
        supabase
          .from("vw_produccion_dashboard")
          .select(
            "id, fecha_hora, producto_nombre, tipo_empaque, lote, bultos_procesados, averias, intervalo_10m, minutos_desde_anterior, alerta_parada",
          )
          .gte("fecha_hora", desde)
          .lt("fecha_hora", hasta)
          .order("fecha_hora", { ascending: true }),
        supabase
          .from("vw_produccion_agrupada_10m")
          .select("intervalo, total_bultos, total_averias, total_estibas, bultos_arrume")
          .gte("intervalo", desde)
          .lt("intervalo", hasta)
          .order("intervalo", { ascending: true }),
      ])
      if (dashRes.error) console.log("[v0] Control Piso vw_dashboard error:", dashRes.error.message)
      if (aggRes.error) console.log("[v0] Control Piso vw_agrupada error:", aggRes.error.message)
      setDashRows(((dashRes.data as VwDashboardRow[]) || []).filter(Boolean))
      setAggRows(((aggRes.data as VwAgrupada10mRow[]) || []).filter(Boolean))
    } catch (e: any) {
      console.log("[v0] Control Piso loadViews exception:", e?.message)
    }
  }, [selectedDate])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      await loadViews()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [loadViews])

  // Realtime: ante un INSERT en la tabla base, re-leemos las vistas para
  // obtener los agregados y banderas recalculados por SQL. Solo tiene
  // sentido cuando se mira HOY; en dias pasados no hay nuevos INSERTs.
  useEffect(() => {
    if (!isToday) {
      setRealtimeOk(false)
      return
    }
    const channel = supabase
      .channel("control-piso-produccion")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "produccion" },
        () => {
          loadViews()
        },
      )
      .subscribe((status) => {
        setRealtimeOk(status === "SUBSCRIBED")
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadViews, isToday])

  // KPIs del dia: suma de la vista agrupada de 10 min.
  const metrics = useMemo(() => {
    let totalBultos = 0
    let estibas = 0
    let arrume = 0
    let averias = 0
    for (const a of aggRows) {
      totalBultos += a.total_bultos || 0
      estibas += a.total_estibas || 0
      arrume += a.bultos_arrume || 0
      averias += a.total_averias || 0
    }
    return { totalBultos, estibas, arrume, averias }
  }, [aggRows])

  // Cronometro de inactividad: tiempo transcurrido desde el ultimo
  // registro (max fecha_hora) hasta el reloj actual, en min + seg.
  const inactividad = useMemo(() => {
    if (dashRows.length === 0) {
      return { hayDatos: false, totalSeg: 0, min: 0, seg: 0, ultimo: null as Date | null }
    }
    const ultimo = parseTs(dashRows[dashRows.length - 1].fecha_hora)
    // `fecha_hora` se guarda como hora de pared de Bogota etiquetada como UTC,
    // por lo que comparamos contra la hora de pared actual de Bogota (tambien
    // reinterpretada como UTC) para evitar el desfase del offset horario.
    const totalSeg = Math.max(0, Math.floor((bogotaWallAsUtcMs(now) - ultimo.getTime()) / 1000))
    return { hayDatos: true, totalSeg, min: Math.floor(totalSeg / 60), seg: totalSeg % 60, ultimo }
  }, [dashRows, now])

  // Resumen del dia agregado por producto: total de bultos, averias y
  // desglose de bultos segun empaque (Estiba vs Arrume). Ordenado de
  // mayor a menor por bultos procesados.
  const productResumen = useMemo(() => {
    const map = new Map<
      string,
      { producto: string; bultos: number; averias: number; estiba: number; arrume: number }
    >()
    for (const r of dashRows) {
      const nombre = r.producto_nombre || "Sin nombre"
      const cur =
        map.get(nombre) || { producto: nombre, bultos: 0, averias: 0, estiba: 0, arrume: 0 }
      const bultos = r.bultos_procesados || 0
      cur.bultos += bultos
      cur.averias += r.averias || 0
      if (isEstiba(r.tipo_empaque)) cur.estiba += bultos
      else cur.arrume += bultos
      map.set(nombre, cur)
    }
    return [...map.values()].sort((a, b) => b.bultos - a.bultos)
  }, [dashRows])

  // Meta dinamica (pacing): horas transcurridas desde las 06:00 (en
  // fracciones) multiplicadas por la meta por hora, topadas a la meta del
  // dia. Usamos la hora de pared de Bogota reinterpretada como UTC para
  // alinearnos con el resto del tablero (hora literal).
  const pacing = useMemo(() => {
    const inicio = new Date(`${selectedDate}T${pad2(SHIFT_START_HOUR)}:00:00Z`).getTime()
    // Para HOY usamos la hora de pared actual; para dias pasados el turno
    // ya termino, asi que la meta es la del dia completo.
    const nowMs = isToday
      ? bogotaWallAsUtcMs(now)
      : new Date(`${selectedDate}T${pad2(SHIFT_END_HOUR)}:00:00Z`).getTime()
    const horasTranscurridas = Math.min(
      Math.max((nowMs - inicio) / 3_600_000, 0),
      HORAS_TURNO,
    )
    const metaActual = Math.round(horasTranscurridas * META_POR_HORA)
    const procesados = metrics.totalBultos
    const pct = metaActual > 0 ? (procesados / metaActual) * 100 : procesados > 0 ? 100 : 0
    // Estado de color segun el % de cumplimiento de la meta actual.
    const estado: "good" | "warn" | "bad" = pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad"
    return { metaActual, procesados, pct, estado, horasTranscurridas }
  }, [now, metrics.totalBultos, selectedDate, isToday])

  // Cumplimiento hora a hora: agrupa los bultos por hora del turno
  // (06:00-20:00) usando la hora literal del intervalo de la vista.
  const hourly = useMemo(() => {
    const buckets = new Map<number, number>()
    for (let h = SHIFT_START_HOUR; h < SHIFT_END_HOUR; h++) buckets.set(h, 0)
    for (const a of aggRows) {
      const h = parseTs(a.intervalo).getUTCHours()
      if (buckets.has(h)) buckets.set(h, (buckets.get(h) || 0) + (a.total_bultos || 0))
    }
    return [...buckets.entries()].map(([h, bultos]) => ({
      hora: `${pad2(h)}:00`,
      bultos,
    }))
  }, [aggRows])

  // Eje de cobertura del turno: una celda por cubeta de 10 min entre
  // SHIFT_START_HOUR y SHIFT_END_HOUR. Verde = hubo produccion en esa
  // ventana (segun vw_produccion_agrupada_10m), rojo = ventana ya
  // transcurrida sin produccion (maquina parada), gris = aun por venir.
  const coverage = useMemo(() => {
    // Set de marcas de tiempo (epoch) de los intervalos con bultos > 0,
    // normalizadas al inicio de su bloque de 10 min.
    const activos = new Set<number>()
    for (const a of aggRows) {
      if ((a.total_bultos || 0) > 0) {
        const t = parseTs(a.intervalo).getTime()
        activos.add(t - (t % (BUCKET_MIN * 60000)))
      }
    }

    const base = new Date(`${selectedDate}T${pad2(SHIFT_START_HOUR)}:00:00Z`).getTime()
    const totalBuckets = ((SHIFT_END_HOUR - SHIFT_START_HOUR) * 60) / BUCKET_MIN
    // El corte de "ahora" usa la hora de pared de Bogota reinterpretada
    // como UTC para no marcar como parada las cubetas que aun no ocurren.
    // En dias pasados el turno ya termino: el corte es el fin del turno.
    const nowMs = isToday
      ? bogotaWallAsUtcMs(now)
      : new Date(`${selectedDate}T${pad2(SHIFT_END_HOUR)}:00:00Z`).getTime()
    const cells: { start: number; label: string; status: "active" | "down" | "future" }[] = []
    for (let i = 0; i < totalBuckets; i++) {
      const start = base + i * BUCKET_MIN * 60000
      const end = start + BUCKET_MIN * 60000
      let status: "active" | "down" | "future"
      if (activos.has(start)) status = "active"
      else if (end > nowMs) status = "future"
      else status = "down"
      cells.push({ start, label: HORA_FMT.format(new Date(start)), status })
    }
    return cells
  }, [aggRows, now, selectedDate, isToday])

  const relojTexto = new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }).format(now)

  const inactCritico = inactividad.min >= DOWNTIME_THRESHOLD_MIN

  return (
    <div className="space-y-6">
      {/* Selector de fecha + estado realtime + reloj */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <label htmlFor="fecha-dia" className="text-sm font-medium text-card-foreground">
            Día:
          </label>
          <input
            id="fecha-dia"
            type="date"
            value={selectedDate}
            max={utcDateStr()}
            onChange={(e) => setSelectedDate(e.target.value || utcDateStr())}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground outline-none focus:ring-2 focus:ring-primary"
          />
          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(utcDateStr())}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-muted"
            >
              Volver a Hoy
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isToday ? (
            <>
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
                <Radio
                  className={`h-3.5 w-3.5 ${realtimeOk ? "animate-pulse text-chart-3" : "text-muted-foreground"}`}
                />
                <span className="text-xs font-medium text-card-foreground">
                  {realtimeOk ? "IoT Edge: SEÑAL ACTIVA" : "Conectando..."}
                </span>
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums text-primary">{relojTexto}</div>
            </>
          ) : (
            <span className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Vista histórica
            </span>
          )}
        </div>
      </div>

      {/* Eje de cobertura del turno (cubetas de 10 min) — primero arriba */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-card-foreground">
              Cobertura del Turno cada 10 min ({pad2(SHIFT_START_HOUR)}:00 - {pad2(SHIFT_END_HOUR)}:00)
            </h2>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-chart-3" /> Trabajando
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-destructive" /> Parada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-muted" /> Pendiente
            </span>
          </div>
        </div>
        <div className="flex h-7 w-full gap-px overflow-hidden rounded-sm">
          {coverage.map((c) => (
            <div
              key={c.start}
              title={`${c.label} — ${
                c.status === "active" ? "Trabajando" : c.status === "down" ? "Máquina parada" : "Pendiente"
              }`}
              className={`h-full min-w-0 flex-1 transition-colors ${
                c.status === "active" ? "bg-chart-3" : c.status === "down" ? "bg-destructive" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>{pad2(SHIFT_START_HOUR)}:00</span>
          <span>{pad2(Math.floor((SHIFT_START_HOUR + SHIFT_END_HOUR) / 2))}:00</span>
          <span>{pad2(SHIFT_END_HOUR)}:00</span>
        </div>
      </section>

      {/* Cronometro de inactividad (alta visibilidad, segundos vivos) — solo HOY */}
      {isToday && (
      <section
        className={`flex flex-col items-center justify-between gap-3 rounded-xl border p-5 sm:flex-row ${
          inactCritico ? "animate-pulse border-destructive/60 bg-destructive/10" : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-lg ring-1 ${
              inactCritico
                ? "bg-destructive/15 text-destructive ring-destructive/40"
                : "bg-chart-3/15 text-chart-3 ring-chart-3/40"
            }`}
          >
            <Timer className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tiempo Inactivo</p>
            <p className="text-sm text-muted-foreground">
              {inactividad.hayDatos && inactividad.ultimo
                ? `Última señal: ${HORA_FMT.format(inactividad.ultimo)}`
                : loading
                  ? "Cargando señal de máquina..."
                  : "Sin señal de máquina hoy"}
            </p>
          </div>
        </div>
        <div
          className={`font-mono text-3xl font-bold tabular-nums sm:text-4xl ${
            inactCritico ? "text-destructive" : "text-chart-3"
          }`}
        >
          {inactividad.hayDatos
            ? `${inactividad.min} min, ${pad2(inactividad.seg)} seg`
            : "—"}
        </div>
      </section>
      )}

      {/* KPI Matrix (desde vw_produccion_agrupada_10m) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Total Bultos"
          value={metrics.totalBultos.toLocaleString("es-CO")}
          sub="Throughput acumulado hoy"
          icon={<Boxes className="h-5 w-5" />}
          accent="info"
        />
        <KpiCard
          title="Estibas Despachadas"
          value={metrics.estibas.toLocaleString("es-CO")}
          sub="Registros tipo Estiba"
          icon={<Layers className="h-5 w-5" />}
          accent="info"
        />
        <KpiCard
          title="Bultos en Arrume"
          value={metrics.arrume.toLocaleString("es-CO")}
          sub="Unidades sin estibar"
          icon={<Package2 className="h-5 w-5" />}
          accent="info"
        />
        <KpiCard
          title="Total Averías"
          value={metrics.averias.toLocaleString("es-CO")}
          sub="Unidades con defecto"
          icon={<AlertTriangle className="h-5 w-5" />}
          accent={metrics.averias > 0 ? "bad" : "good"}
        />
      </div>

      {/* Rendimiento dinamico (donut) + cumplimiento hora a hora */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Donut de rendimiento actual */}
        <section className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
          <div className="mb-2 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-card-foreground">Rendimiento Actual</h2>
          </div>
          <div className="relative mx-auto h-52 w-full max-w-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "logro", value: Math.min(pacing.pct, 100) },
                    { name: "resto", value: Math.max(100 - pacing.pct, 0) },
                  ]}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={92}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  isAnimationActive={false}
                >
                  <Cell fill={PACE_COLOR[pacing.estado]} />
                  <Cell fill="var(--muted)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-4xl font-bold tabular-nums"
                style={{ color: PACE_COLOR[pacing.estado] }}
              >
                {Math.round(pacing.pct)}%
              </span>
              <span className="text-xs text-muted-foreground">de la meta actual</span>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Procesados</span>
              <span className="font-mono font-semibold text-card-foreground">
                {pacing.procesados.toLocaleString("es-CO")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Meta Actual</span>
              <span className="font-mono font-semibold text-card-foreground">
                {pacing.metaActual.toLocaleString("es-CO")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Target className="h-3.5 w-3.5" /> Meta Final del Día
              </span>
              <span className="font-mono font-semibold text-primary">
                {META_DIA.toLocaleString("es-CO")}
              </span>
            </div>
          </div>
        </section>

        {/* Cumplimiento hora a hora */}
        <section className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-card-foreground">
                Cumplimiento Hora a Hora ({pad2(SHIFT_START_HOUR)}:00 - {pad2(SHIFT_END_HOUR)}:00)
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-chart-3" /> {"≥240"}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-chart-4" /> 200-239
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-destructive" /> {"<200"}
              </span>
            </div>
          </div>
          {loading ? (
            <EmptyState loading text="" />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly} barCategoryGap="20%" margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="hora" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v.toLocaleString("es-CO")} bultos`, "Procesado"]}
                  />
                  <ReferenceLine
                    y={META_POR_HORA}
                    stroke="var(--primary)"
                    strokeDasharray="4 4"
                    label={{
                      value: `Meta: ${META_POR_HORA}/hr`,
                      position: "insideTopRight",
                      fill: "var(--primary)",
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="bultos" radius={[3, 3, 0, 0]}>
                    {hourly.map((d) => (
                      <Cell
                        key={d.hora}
                        fill={
                          d.bultos >= META_POR_HORA
                            ? "var(--chart-3)"
                            : d.bultos >= 200
                              ? "var(--chart-4)"
                              : "var(--destructive)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Resumen del dia por producto */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="relative flex h-2.5 w-2.5">
            {realtimeOk && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-3 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${realtimeOk ? "bg-chart-3" : "bg-muted-foreground"}`}
            />
          </span>
          <h2 className="text-sm font-semibold text-card-foreground">Producción del Día por Producto</h2>
        </div>
        {productResumen.length === 0 ? (
          <div className="p-6">
            <EmptyState loading={loading} text="Sin producción registrada hoy" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Producto</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total Bultos</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3 w-3 text-primary" /> Estiba
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Boxes className="h-3 w-3 text-chart-4" /> Arrume
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">Averías</th>
                </tr>
              </thead>
              <tbody>
                {productResumen.map((p) => {
                  const conAveria = p.averias > 0
                  return (
                    <tr
                      key={p.producto}
                      className={`border-b border-border/60 last:border-0 ${
                        conAveria ? "bg-chart-4/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium text-card-foreground">{p.producto}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-card-foreground">
                        {p.bultos.toLocaleString("es-CO")}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-primary">
                        {p.estiba.toLocaleString("es-CO")}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-chart-4">
                        {p.arrume.toLocaleString("es-CO")}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {conAveria ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-chart-4/15 px-2 py-0.5 font-mono text-xs font-semibold text-chart-4 ring-1 ring-chart-4/30">
                            <TriangleAlert className="h-3 w-3" />
                            {p.averias.toLocaleString("es-CO")}
                          </span>
                        ) : (
                          <span className="font-mono text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/50 text-sm font-semibold">
                  <td className="px-4 py-3 text-card-foreground">Total ({productResumen.length})</td>
                  <td className="px-4 py-3 text-right font-mono text-card-foreground">
                    {productResumen.reduce((s, p) => s + p.bultos, 0).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-primary">
                    {productResumen.reduce((s, p) => s + p.estiba, 0).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-chart-4">
                    {productResumen.reduce((s, p) => s + p.arrume, 0).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-chart-4">
                    {productResumen.reduce((s, p) => s + p.averias, 0).toLocaleString("es-CO")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* TAB 2: RESUMEN MENSUAL                                              */
/* ------------------------------------------------------------------ */

function MonthlyTab({ nombreProducto }: { nombreProducto: (id: number) => string }) {
  const today = new Date()
  const [year, setYear] = useState<number>(today.getFullYear())
  const [month, setMonth] = useState<number>(today.getMonth())
  const [rows, setRows] = useState<ProduccionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const { start, end } = monthRange(year, month)
        const { data, error } = await supabase
          .from("produccion")
          .select("id, fecha_hora, producto, tipo_empaque, bultos_procesados, averias")
          .gte("fecha_hora", start)
          .lt("fecha_hora", end)
          .order("fecha_hora", { ascending: true })
        if (!active) return
        if (error) console.log("[v0] Control Piso mensual error:", error.message)
        setRows(((data as ProduccionRow[]) || []).filter(Boolean))
      } catch (e: any) {
        console.log("[v0] Control Piso mensual exception:", e?.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [year, month])

  const kpis = useMemo(() => {
    let procesados = 0
    let averias = 0
    let estibasCount = 0
    let arrumeBultos = 0
    for (const r of rows) {
      procesados += r.bultos_procesados || 0
      averias += r.averias || 0
      if (isEstiba(r.tipo_empaque)) estibasCount += 1
      else if (isArrume(r.tipo_empaque)) arrumeBultos += r.bultos_procesados || 0
    }
    const tasaDesperdicio = procesados > 0 ? (averias / procesados) * 100 : 0
    return { procesados, averias, estibasCount, arrumeBultos, tasaDesperdicio }
  }, [rows])

  // Tendencia diaria: cubeta por dia del mes (1..diasEnMes).
  const daily = useMemo(() => {
    const diasEnMes = new Date(year, month + 1, 0).getDate()
    const buckets = Array.from({ length: diasEnMes }, (_, i) => ({
      dia: i + 1,
      procesados: 0,
      averias: 0,
    }))
    for (const r of rows) {
      const d = bogotaDay(r.fecha_hora)
      if (d >= 1 && d <= diasEnMes) {
        buckets[d - 1].procesados += r.bultos_procesados || 0
        buckets[d - 1].averias += r.averias || 0
      }
    }
    return buckets
  }, [rows, year, month])

  // Top 5 productos con mas averias.
  const topDefectos = useMemo(() => {
    const map = new Map<number, { producto: number; averias: number; procesados: number }>()
    for (const r of rows) {
      const cur = map.get(r.producto) || { producto: r.producto, averias: 0, procesados: 0 }
      cur.averias += r.averias || 0
      cur.procesados += r.bultos_procesados || 0
      map.set(r.producto, cur)
    }
    return Array.from(map.values())
      .filter((x) => x.averias > 0)
      .sort((a, b) => b.averias - a.averias)
      .slice(0, 5)
  }, [rows])

  const years = useMemo(() => {
    const y = today.getFullYear()
    return [y, y - 1, y - 2, y - 3]
  }, [today])

  return (
    <div className="space-y-6">
      {/* Selector de mes/anio */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="font-medium">Periodo:</span>
        </div>
        <DarkSelect value={String(month)} onChange={(v) => setMonth(Number(v))}>
          {MESES.map((m, i) => (
            <option key={i} value={i}>
              {m}
            </option>
          ))}
        </DarkSelect>
        <DarkSelect value={String(year)} onChange={(v) => setYear(Number(v))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </DarkSelect>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Total Bultos del Mes"
          value={kpis.procesados.toLocaleString("es-CO")}
          sub="Throughput acumulado"
          icon={<Boxes className="h-5 w-5" />}
          accent="info"
        />
        <KpiCard
          title="Tasa de Desperdicio"
          value={`${kpis.tasaDesperdicio.toFixed(1)}%`}
          sub={`${kpis.averias.toLocaleString("es-CO")} averías`}
          icon={<AlertOctagon className="h-5 w-5" />}
          accent={kpis.tasaDesperdicio > 5 ? "bad" : kpis.averias > 0 ? "warn" : "good"}
        />
        <KpiCard
          title="Estibas Armadas"
          value={kpis.estibasCount.toLocaleString("es-CO")}
          sub="Registros tipo Estiba"
          icon={<Layers className="h-5 w-5" />}
          accent="info"
        />
        <KpiCard
          title="Bultos en Arrume"
          value={kpis.arrumeBultos.toLocaleString("es-CO")}
          sub="Suma de bultos en Arrume"
          icon={<Package2 className="h-5 w-5" />}
          accent="info"
        />
      </div>

      {/* Tendencia diaria */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-card-foreground">
          Tendencia Diaria — {MESES[month]} {year} (Bultos vs Averías)
        </h2>
        {loading ? (
          <EmptyState loading text="" />
        ) : kpis.procesados === 0 ? (
          <EmptyState loading={false} text="Sin producción en el periodo seleccionado" />
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="gradProc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradAver" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-destructive)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-destructive)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="dia" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={{ color: "var(--color-popover-foreground)" }}
                  labelFormatter={(l) => `Día ${l}`}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-muted-foreground)" }} />
                <Area
                  type="monotone"
                  dataKey="procesados"
                  name="Bultos"
                  stroke="var(--color-chart-1)"
                  fill="url(#gradProc)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="averias"
                  name="Averías"
                  stroke="var(--color-destructive)"
                  fill="url(#gradAver)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Top productos con averias */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <AlertOctagon className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-semibold text-card-foreground">
            Top 5 Productos con Más Averías (Cuellos de Botella)
          </h2>
        </div>
        {topDefectos.length === 0 ? (
          <div className="p-6">
            <EmptyState loading={loading} text="Sin averías registradas en el periodo" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Producto</th>
                  <th className="px-4 py-2.5 text-right font-medium">Averías</th>
                  <th className="px-4 py-2.5 text-right font-medium">Bultos</th>
                  <th className="px-4 py-2.5 text-right font-medium">% Avería</th>
                </tr>
              </thead>
              <tbody>
                {topDefectos.map((d, i) => {
                  const pct = d.procesados > 0 ? (d.averias / d.procesados) * 100 : 0
                  return (
                    <tr key={d.producto} className="border-b border-border/60 last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2.5 text-card-foreground">{nombreProducto(d.producto)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-destructive">
                        {d.averias.toLocaleString("es-CO")}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-foreground">
                        {d.procesados.toLocaleString("es-CO")}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-chart-4">{pct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* TAB 3: RESUMEN ANUAL                                                */
/* ------------------------------------------------------------------ */

function AnnualTab({ nombreProducto }: { nombreProducto: (id: number) => string }) {
  const today = new Date()
  const [year, setYear] = useState<number>(today.getFullYear())
  const [rows, setRows] = useState<ProduccionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const { start, end } = yearRange(year)
        const { data, error } = await supabase
          .from("produccion")
          .select("id, fecha_hora, producto, tipo_empaque, bultos_procesados, averias")
          .gte("fecha_hora", start)
          .lt("fecha_hora", end)
          .order("fecha_hora", { ascending: true })
        if (!active) return
        if (error) console.log("[v0] Control Piso anual error:", error.message)
        setRows(((data as ProduccionRow[]) || []).filter(Boolean))
      } catch (e: any) {
        console.log("[v0] Control Piso anual exception:", e?.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [year])

  // Agregado por mes (0-11): procesados y tasa de desperdicio.
  const monthly = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, i) => ({
      mesIdx: i,
      mes: MESES_CORTO[i],
      procesados: 0,
      averias: 0,
      desperdicio: 0,
    }))
    for (const r of rows) {
      const m = bogotaMonth(r.fecha_hora)
      if (m >= 0 && m <= 11) {
        buckets[m].procesados += r.bultos_procesados || 0
        buckets[m].averias += r.averias || 0
      }
    }
    for (const b of buckets) {
      b.desperdicio = b.procesados > 0 ? Number(((b.averias / b.procesados) * 100).toFixed(1)) : 0
    }
    return buckets
  }, [rows])

  const kpis = useMemo(() => {
    let procesados = 0
    let averias = 0
    let estibasCount = 0
    let arrumeBultos = 0
    for (const r of rows) {
      procesados += r.bultos_procesados || 0
      averias += r.averias || 0
      if (isEstiba(r.tipo_empaque)) estibasCount += 1
      else if (isArrume(r.tipo_empaque)) arrumeBultos += r.bultos_procesados || 0
    }
    const tasaDesperdicio = procesados > 0 ? (averias / procesados) * 100 : 0
    // Mejor mes por unidades producidas.
    let mejorMes = "—"
    let mejorVal = -1
    for (const b of monthly) {
      if (b.procesados > mejorVal) {
        mejorVal = b.procesados
        mejorMes = b.procesados > 0 ? MESES[b.mesIdx] : "—"
      }
    }
    return { procesados, averias, tasaDesperdicio, estibasCount, arrumeBultos, mejorMes, mejorVal }
  }, [rows, monthly])

  // Product mix: distribucion de bultos procesados por producto.
  const productMix = useMemo(() => {
    const map = new Map<number, number>()
    for (const r of rows) {
      map.set(r.producto, (map.get(r.producto) || 0) + (r.bultos_procesados || 0))
    }
    const arr = Array.from(map.entries())
      .map(([producto, value]) => ({ name: nombreProducto(producto), value }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
    // Agrupar la cola en "Otros" si hay muchos productos.
    if (arr.length > 7) {
      const top = arr.slice(0, 7)
      const otros = arr.slice(7).reduce((s, x) => s + x.value, 0)
      top.push({ name: "Otros", value: otros })
      return top
    }
    return arr
  }, [rows, nombreProducto])

  const years = useMemo(() => {
    const y = today.getFullYear()
    return [y, y - 1, y - 2, y - 3]
  }, [today])

  const hayDatos = kpis.procesados > 0

  return (
    <div className="space-y-6">
      {/* Selector de anio */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="font-medium">Año:</span>
        </div>
        <DarkSelect value={String(year)} onChange={(v) => setYear(Number(v))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </DarkSelect>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Unidades Producidas"
          value={kpis.procesados.toLocaleString("es-CO")}
          sub="Total bultos YTD"
          icon={<TrendingUp className="h-5 w-5" />}
          accent="info"
        />
        <KpiCard
          title="Desperdicio YTD"
          value={`${kpis.tasaDesperdicio.toFixed(1)}%`}
          sub={`${kpis.averias.toLocaleString("es-CO")} averías`}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent={kpis.tasaDesperdicio > 5 ? "bad" : kpis.averias > 0 ? "warn" : "good"}
        />
        <KpiCard
          title="Mejor Mes"
          value={kpis.mejorMes}
          sub={kpis.mejorVal > 0 ? `${kpis.mejorVal.toLocaleString("es-CO")} bultos` : "Sin datos"}
          icon={<Award className="h-5 w-5" />}
          accent="good"
        />
        <KpiCard
          title="Estibas vs Arrume"
          value={`${kpis.estibasCount.toLocaleString("es-CO")} / ${kpis.arrumeBultos.toLocaleString("es-CO")}`}
          sub="Estibas (count) / Arrume (bultos)"
          icon={<Layers className="h-5 w-5" />}
          accent="info"
        />
      </div>

      {/* Tendencia mensual (line) */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-card-foreground">
          Tendencia Mensual {year} (Unidades y Desperdicio %)
        </h2>
        {loading ? (
          <EmptyState loading text="" />
        ) : !hayDatos ? (
          <EmptyState loading={false} text="Sin producción en el año seleccionado" />
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis yAxisId="left" stroke="var(--color-chart-1)" fontSize={12} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="var(--color-destructive)"
                  fontSize={12}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={{ color: "var(--color-popover-foreground)" }}
                  formatter={(value: any, name: any) =>
                    name === "Desperdicio %" ? [`${value}%`, name] : [Number(value).toLocaleString("es-CO"), name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-muted-foreground)" }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="procesados"
                  name="Unidades Procesadas"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="desperdicio"
                  name="Desperdicio %"
                  stroke="var(--color-destructive)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Product mix (pie) */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-card-foreground">Mix de Producción por Producto ({year})</h2>
        {loading ? (
          <EmptyState loading text="" />
        ) : productMix.length === 0 ? (
          <EmptyState loading={false} text="Sin producción en el año seleccionado" />
        ) : (
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={productMix}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={130}
                  innerRadius={60}
                  paddingAngle={2}
                  label={(entry: any) => `${entry.name}`}
                  labelLine={false}
                >
                  {productMix.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="var(--color-card)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: any) => [`${Number(value).toLocaleString("es-CO")} bultos`, "Producción"]}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-muted-foreground)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* TAB 4: REPORTE — consulta directa a `produccion` con joins         */
/* ------------------------------------------------------------------ */

// Fila enriquecida de la tabla base `produccion`. Los nombres de
// producto, bodega y localizacion se resuelven en cliente con los
// diccionarios cargados desde sus tablas maestras (joins logicos).
interface ReporteRow {
  id: number
  fecha_hora: string
  producto: number
  bodega: number
  localizacion: number
  tipo_empaque: string | null
  lote: number | null
  bultos_procesados: number | null
  cantidad_meta: number | null
  averias: number | null
}

function ReportTab({ nombreProducto }: { nombreProducto: (id: number) => string }) {
  // Rango por defecto: ultimos 7 dias (en fecha literal UTC).
  const hoy = utcDateStr()
  const hace7 = useMemo(() => {
    const [y, m, d] = hoy.split("-").map(Number)
    const past = new Date(Date.UTC(y, m - 1, d - 6))
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(past)
  }, [hoy])

  const [desde, setDesde] = useState<string>(hace7)
  const [hasta, setHasta] = useState<string>(hoy)
  const [rows, setRows] = useState<ReporteRow[]>([])
  const [bodegas, setBodegas] = useState<Record<number, string>>({})
  const [locs, setLocs] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [consultado, setConsultado] = useState(false)

  // Catalogos para los joins logicos (bodega y localizacion). El de
  // productos lo provee el padre via `nombreProducto`.
  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from("bodegas").select("idbodega, nombrebodega"),
      supabase.from("locations").select("id, nombre, codigo"),
    ]).then(([bRes, lRes]) => {
      if (!active) return
      const bDict: Record<number, string> = {}
      for (const b of (bRes.data as { idbodega: number; nombrebodega: string }[]) || []) {
        bDict[b.idbodega] = b.nombrebodega
      }
      const lDict: Record<number, string> = {}
      for (const l of (lRes.data as { id: number; nombre: string; codigo: string }[]) || []) {
        lDict[l.id] = l.nombre || l.codigo || `Loc ${l.id}`
      }
      setBodegas(bDict)
      setLocs(lDict)
    })
    return () => {
      active = false
    }
  }, [])

  const consultar = useCallback(async () => {
    setLoading(true)
    setConsultado(true)
    try {
      // Rango [desde 00:00, dia_siguiente_de_hasta 00:00) en hora literal UTC.
      const desdeISO = `${desde}T00:00:00Z`
      const hastaISO = `${nextDateStr(hasta)}T00:00:00Z`
      const { data, error } = await supabase
        .from("produccion")
        .select(
          "id, fecha_hora, producto, bodega, localizacion, tipo_empaque, lote, bultos_procesados, cantidad_meta, averias",
        )
        .gte("fecha_hora", desdeISO)
        .lt("fecha_hora", hastaISO)
        .order("fecha_hora", { ascending: false })
      if (error) console.log("[v0] Control Piso reporte error:", error.message)
      setRows(((data as ReporteRow[]) || []).filter(Boolean))
    } catch (e: any) {
      console.log("[v0] Control Piso reporte exception:", e?.message)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  // Primera carga automatica con el rango por defecto.
  useEffect(() => {
    consultar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nombreBodega = (id: number) => bodegas[id] || `Bodega ${id}`
  const nombreLoc = (id: number) => locs[id] || `Loc ${id}`

  // Totales del rango consultado.
  const totales = useMemo(() => {
    let bultos = 0
    let averias = 0
    let meta = 0
    for (const r of rows) {
      bultos += r.bultos_procesados || 0
      averias += r.averias || 0
      meta += r.cantidad_meta || 0
    }
    const cumplimiento = meta > 0 ? (bultos / meta) * 100 : 0
    return { registros: rows.length, bultos, averias, meta, cumplimiento }
  }, [rows])

  const fmtFechaHora = (iso: string) =>
    new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(parseTs(iso))

  // Exporta las filas visibles a CSV (con nombres resueltos).
  const exportCSV = useCallback(() => {
    const headers = [
      "ID",
      "Fecha y Hora",
      "Producto",
      "Bodega",
      "Localizacion",
      "Tipo Empaque",
      "Lote",
      "Bultos Procesados",
      "Cantidad Meta",
      "Averias",
    ]
    const lines = rows.map((r) =>
      [
        r.id,
        fmtFechaHora(r.fecha_hora),
        nombreProducto(r.producto),
        nombreBodega(r.bodega),
        nombreLoc(r.localizacion),
        r.tipo_empaque ?? "",
        r.lote ?? "",
        r.bultos_procesados ?? 0,
        r.cantidad_meta ?? 0,
        r.averias ?? 0,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    )
    const csv = [headers.join(","), ...lines].join("\n")
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `reporte_produccion_${desde}_a_${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [rows, desde, hasta, bodegas, locs])

  return (
    <div className="space-y-6">
      {/* Filtros del reporte */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-card-foreground">Reporte de Producción</h2>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="space-y-1.5">
            <label htmlFor="rep-desde" className="block text-xs font-medium text-muted-foreground">
              Desde
            </label>
            <input
              id="rep-desde"
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rep-hasta" className="block text-xs font-medium text-muted-foreground">
              Hasta
            </label>
            <input
              id="rep-hasta"
              type="date"
              value={hasta}
              min={desde}
              max={hoy}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={consultar}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              {loading ? "Consultando..." : "Consultar"}
            </button>
            <button
              type="button"
              onClick={exportCSV}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        </div>
      </section>

      {/* KPIs del rango */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Total Registros"
          value={totales.registros.toLocaleString("es-CO")}
          sub="Filas en el rango"
          icon={<FileText className="h-5 w-5" />}
          accent="info"
        />
        <KpiCard
          title="Total Bultos"
          value={totales.bultos.toLocaleString("es-CO")}
          sub={`Meta: ${totales.meta.toLocaleString("es-CO")}`}
          icon={<Boxes className="h-5 w-5" />}
          accent="neutral"
        />
        <KpiCard
          title="Cumplimiento"
          value={`${totales.cumplimiento.toFixed(1)}%`}
          sub="Bultos vs meta"
          icon={<Target className="h-5 w-5" />}
          accent={totales.cumplimiento >= 95 ? "good" : totales.cumplimiento >= 80 ? "warn" : "bad"}
        />
        <KpiCard
          title="Total Averías"
          value={totales.averias.toLocaleString("es-CO")}
          sub="En el rango"
          icon={<TriangleAlert className="h-5 w-5" />}
          accent={totales.averias > 0 ? "bad" : "good"}
        />
      </div>

      {/* Tabla de detalle */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">
            Detalle de Registros{" "}
            <span className="font-normal text-muted-foreground">
              ({desde} a {hasta})
            </span>
          </h3>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            loading={loading}
            text={consultado ? "Sin registros para el rango seleccionado" : "Selecciona un rango y consulta"}
          />
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Fecha y Hora</th>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Bodega</th>
                  <th className="px-3 py-2 font-medium">Localización</th>
                  <th className="px-3 py-2 font-medium">Empaque</th>
                  <th className="px-3 py-2 font-medium">Lote</th>
                  <th className="px-3 py-2 text-right font-medium">Bultos</th>
                  <th className="px-3 py-2 text-right font-medium">Meta</th>
                  <th className="px-3 py-2 text-right font-medium">Averías</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/50">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.id}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-card-foreground">
                      {fmtFechaHora(r.fecha_hora)}
                    </td>
                    <td className="px-3 py-2 text-card-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Package2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {nombreProducto(r.producto)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-card-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Warehouse className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {nombreBodega(r.bodega)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-card-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {nombreLoc(r.localizacion)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-card-foreground">{r.tipo_empaque || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.lote ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-card-foreground">
                      {(r.bultos_procesados ?? 0).toLocaleString("es-CO")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {(r.cantidad_meta ?? 0).toLocaleString("es-CO")}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        (r.averias ?? 0) > 0 ? "font-medium text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {(r.averias ?? 0).toLocaleString("es-CO")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 border-t-2 border-border bg-muted">
                <tr className="font-semibold text-card-foreground">
                  <td className="px-3 py-2" colSpan={7}>
                    Totales ({totales.registros} registros)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{totales.bultos.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totales.meta.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totales.averias.toLocaleString("es-CO")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* COMPONENTES AUXILIARES                                              */
/* ------------------------------------------------------------------ */

function DarkSelect({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm font-medium text-card-foreground outline-none ring-ring/40 transition-colors hover:border-ring focus:ring-2"
    >
      {children}
    </select>
  )
}

function KpiCard({
  title,
  value,
  sub,
  icon,
  accent = "neutral",
}: {
  title: string
  value: string
  sub?: string
  icon: React.ReactNode
  accent?: "neutral" | "good" | "warn" | "bad" | "info"
}) {
  const accentClass =
    accent === "good"
      ? "text-chart-3"
      : accent === "warn"
        ? "text-chart-4"
        : accent === "bad"
          ? "text-destructive"
          : accent === "info"
            ? "text-primary"
            : "text-card-foreground"
  const ring =
    accent === "good"
      ? "ring-chart-3/30 bg-chart-3/10"
      : accent === "warn"
        ? "ring-chart-4/30 bg-chart-4/10"
        : accent === "bad"
          ? "ring-destructive/30 bg-destructive/10"
          : accent === "info"
            ? "ring-primary/30 bg-primary/10"
            : "ring-border bg-muted"
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${ring} ${accentClass}`}>
          {icon}
        </div>
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${accentClass}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function EmptyState({ loading, text }: { loading: boolean; text: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <Package2 className="h-8 w-8 opacity-40" />
      {loading ? "Cargando..." : text}
    </div>
  )
}
