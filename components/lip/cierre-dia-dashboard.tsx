"use client"

/**
 * Dashboard "Cierre del Día" — Bitácora / Operación LIP.
 *
 * Compila en una sola vista (optimizada para impresion a PDF en hoja
 * carta) los indicadores mas representativos del dia operativo. Toma
 * fuentes existentes (no duplica logica de queries):
 *
 *   1. Pedidos (centro de comando / cierre del dia):
 *      `getDashboardPedidosData` → filtrado en cliente al dia actual
 *      (Bogota). KPIs: Ingresaron, Entregados, Cumplimiento, Entregas
 *      a tiempo, In-Full, OTIF Global, Volumen Despachado.
 *
 *   2. Eficiencia de carga e In-Full (mismas filas de detalle del dia):
 *      Cumplimiento Global y Tasa de Carga Perfecta.
 *
 *   3. Despachos (Dashboard Recepcion - vista diaria):
 *      `getDashboardRecepcionData(empresaId, "diario")` ya entrega
 *      datos solo del dia actual. Se muestran: Volumen Hoy, Ordenes,
 *      Lead Time, Rendimiento, Tiempo Cola, Cuello Botella + Funnel
 *      de Tiempos (bar chart horizontal de etapas).
 *
 *   4. RRHH LIP - Dashboard Diario:
  *      `/api/attendance/dashboard?mode=daily` ya entrega solo el dia.
 *      Se muestran turnos programados, asistencias, % asistencia y la
 *      distribucion de turnos por puesto (SOLO las columnas Puesto y
 *      Personas, contando personas unicas con turno asignado hoy).
 *
 * Generacion del PDF: el dashboard se imprime con `window.print()`.
 * Toda la app se oculta excepto el contenedor `#cierre-dia-print`,
 * forzando page-size letter y manteniendo tipografias compactas para
 * que la informacion completa quepa en una sola hoja carta vertical.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Gauge,
  Inbox,
  Loader2,
  Package,
  PackageCheck,
  Printer,
  RefreshCw,
  Target,
  Timer,
  Truck,
  UserCheck,
  Users,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getDashboardPedidosData } from "@/lib/dashboard-pedidos-actions"
import {
  getDashboardRecepcionData,
  type DashboardRecepcionPayload,
  type EtapaTiempo,
} from "@/lib/dashboard-recepcion-actions"
// Estadisticas de operacion: traemos meta del dia, toneladas programadas
// y ejecutadas para mostrar en la tarjeta compacta "Cumplimiento Toneladas".
// Es la misma fuente que usa el Dashboard de Operacion del Dia para
// mantener consistencia de cifras entre ambos modulos.
import { getDashboardOperacionesStats } from "@/lib/dashboard-actions"
import type {
  PedidoCabecera,
  PedidoDetalle,
} from "@/components/orders/dashboard-pedidos/types"

// ---------------------------------------------------------------------------
// Tipos auxiliares de la API de asistencia (mismos campos que el dashboard
// diario de RRHH).
// ---------------------------------------------------------------------------

interface AttendanceRow {
  id: number
  fecha: string
  nombre: string
  identificacion: string
  puesto: string | null
  asistencia: string | null
  hed: number | null
  hedf: number | null
  hen: number | null
  hef: number | null
  hn: number | null
  especialidad: string | null
}

// ---------------------------------------------------------------------------
// Helpers de formato (locales, compactos para impresion).
// ---------------------------------------------------------------------------

const fmtInt = (n: number) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n)
const fmtDec = (n: number, d = 1) =>
  new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n)
const fmtPct = (n: number) => `${fmtDec(n, 1)}%`

/** Convierte minutos a un string compacto "Xh Ym" / "Z min". */
function fmtMinutos(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 min"
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** Hoy en zona horaria America/Bogota como "YYYY-MM-DD". */
function getBogotaHoy(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** Etiqueta legible "Lunes, 11 de mayo de 2026" en Bogota. */
function fmtFechaLarga(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const fmt = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  return fmt.format(d).replace(/^./, (ch) => ch.toUpperCase())
}

// ---------------------------------------------------------------------------
// Calculo de KPIs de pedidos limitados al dia actual.
//
// Estrategia: tomamos como "deliveries de hoy" a los pedidos cuya
// `fechadeentrega` cae hoy (Bogota). Sobre ese subconjunto se calculan
// los KPIs de cumplimiento / OTIF / volumen. `Ingresaron` es la unica
// metrica que mira `fecha` (creacion), por convencion del dashboard de
// Pedidos original.
// ---------------------------------------------------------------------------

interface PedidosKpisDia {
  ingresados: number
  // Subdivision de "Ingresaron" segun el campo `aprobado` de
  // `pedidoscabecera`: si == "si" cuenta como aprobado, cualquier otro
  // valor (incluido null/vacio) cuenta como NO aprobado. La suma de
  // estos dos campos siempre es igual a `ingresados`.
  ingresadosAprobados: number
  ingresadosNoAprobados: number
  entregados: number
  cumplimientoPct: number
  entregasATiempoPct: number
  inFullPct: number
  otifPct: number
  volumenTon: number
  cumplimientoGlobalPct: number
  cargaPerfectaPct: number
}

function calcPedidosDia(
  cabecera: PedidoCabecera[],
  detalle: PedidoDetalle[],
  hoy: string,
): PedidosKpisDia {
  const ingresadosHoy = cabecera.filter(
    (p) => p.fecha?.slice(0, 10) === hoy,
  )
  // Separamos los ingresados de hoy entre aprobados y no aprobados.
  // Normalizamos `aprobado` para tolerar variantes ("Si", " SI ",
  // "si", "sí"). Cualquier otro valor (incluido null, vacio, "no",
  // "pendiente") cuenta como NO aprobado.
  let ingresadosAprobados = 0
  let ingresadosNoAprobados = 0
  for (const p of ingresadosHoy) {
    const aprobado = String(p.aprobado ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quitar acentos: "sí" → "si"
    if (aprobado === "si") {
      ingresadosAprobados += 1
    } else {
      ingresadosNoAprobados += 1
    }
  }
  const entregadosHoy = cabecera.filter(
    (p) => p.fechadeentrega?.slice(0, 10) === hoy,
  )

  // Set de idpedido para cruzar con detalle.
  const idsEntregados = new Set(entregadosHoy.map((p) => p.idpedido))
  const detalleHoy = detalle.filter((d) => idsEntregados.has(d.idpedido))

  // Cumplimiento (cargadas / pedidas, sumatoria de unidades).
  let pedidas = 0
  let cargadas = 0
  let perfectas = 0
  let lineasEvaluables = 0
  let pesoKg = 0
  for (const d of detalleHoy) {
    const up = Number(d.unidades) || 0
    const uc = Number(d.unidadescargadas) || 0
    pedidas += up
    cargadas += uc
    pesoKg += Number(d.peso) || 0
    if (up > 0) {
      lineasEvaluables += 1
      if (uc === up) perfectas += 1
    }
  }
  const cumplimientoPct = pedidas > 0 ? (cargadas / pedidas) * 100 : 0
  const cargaPerfectaPct =
    lineasEvaluables > 0 ? (perfectas / lineasEvaluables) * 100 : 0
  // Cumplimiento Global usa el MISMO criterio que `Cumplimiento` aqui
  // (cargadas / pedidas). En el dashboard de eficiencia es identico al
  // calculo diario; lo separamos para mostrarlo en el bloque
  // correspondiente sin recalcular nada distinto.
  const cumplimientoGlobalPct = cumplimientoPct

  // Entregas a tiempo: `fechaordencargue <= fecha_programada` sobre los
  // entregados de hoy. Si falta alguna fecha, se ignora la fila.
  let aTiempo = 0
  let evaluables = 0
  for (const p of entregadosHoy) {
    const programada = p.fecha_programada?.slice(0, 10)
    const cargue = p.fechaordencargue?.slice(0, 10)
    if (!programada || !cargue) continue
    evaluables += 1
    if (cargue <= programada) aTiempo += 1
  }
  const entregasATiempoPct =
    evaluables > 0 ? (aTiempo / evaluables) * 100 : 0

  // In-Full: % de lineas con unidadescargadas === unidades (sobre las
  // lineas del dia, no del periodo completo).
  const inFullPct = cargaPerfectaPct

  // OTIF Global: a tiempo Y completo. Aproximacion estricta sobre
  // entregados de hoy: el pedido cuenta como OTIF si cumplio ambas
  // condiciones (a tiempo Y todas sus lineas in-full).
  let otif = 0
  for (const p of entregadosHoy) {
    const programada = p.fecha_programada?.slice(0, 10)
    const cargue = p.fechaordencargue?.slice(0, 10)
    if (!programada || !cargue) continue
    if (cargue > programada) continue
    // Verificar in-full de todas sus lineas.
    const lineas = detalle.filter((d) => d.idpedido === p.idpedido)
    if (lineas.length === 0) continue
    const todasOk = lineas.every((d) => {
      const up = Number(d.unidades) || 0
      const uc = Number(d.unidadescargadas) || 0
      return up > 0 && uc >= up
    })
    if (todasOk) otif += 1
  }
  const otifPct = evaluables > 0 ? (otif / evaluables) * 100 : 0

  return {
    ingresados: ingresadosHoy.length,
    ingresadosAprobados,
    ingresadosNoAprobados,
    entregados: entregadosHoy.length,
    cumplimientoPct,
    entregasATiempoPct,
    inFullPct,
    otifPct,
    volumenTon: pesoKg / 1000,
    cumplimientoGlobalPct,
    cargaPerfectaPct,
  }
}

// ---------------------------------------------------------------------------
// Distribucion de turnos por puesto. Para cada puesto contamos cuantas
// personas UNICAS tienen un turno asignado hoy (no contamos asistencia
// real ni horas extra: solo programacion). Filtramos filas sin puesto
// porque corresponden a personal aun sin asignar o a novedades puras
// sin operacion, que no aportan a la distribucion de turnos.
// ---------------------------------------------------------------------------

interface DistribucionPuesto {
  puesto: string
  personas: number
}

function calcDistribucionTurnos(rows: AttendanceRow[]): DistribucionPuesto[] {
  const map: Record<string, Set<string>> = {}
  for (const r of rows) {
    // Solo cuentan filas con `puesto` real (turno programado). Si el
    // puesto viene vacio o nulo, no es una asignacion operativa.
    const puesto = r.puesto?.trim()
    if (!puesto) continue
    if (!map[puesto]) map[puesto] = new Set()
    // Usamos identificacion para no duplicar a la misma persona si por
    // alguna razon tiene 2 filas en el dia.
    map[puesto].add(r.identificacion || r.nombre || String(r.id))
  }
  return Object.entries(map)
    .map(([puesto, set]) => ({ puesto, personas: set.size }))
    .sort((a, b) => b.personas - a.personas)
}

// ---------------------------------------------------------------------------
// Estadisticas de asistencia (mismas reglas que attendance-daily-dashboard).
// ---------------------------------------------------------------------------

interface AttendanceStats {
  totalTurnos: number
  asistencias: number
  porcentajeAsistencia: number
}

function calcAttendanceStats(rows: AttendanceRow[]): AttendanceStats {
  const totalTurnos = rows.length
  const asistencias = rows.filter(
    (r) => r.puesto !== null && !r.asistencia,
  ).length
  const porcentajeAsistencia =
    totalTurnos > 0 ? Math.round((asistencias / totalTurnos) * 100) : 0
  return { totalTurnos, asistencias, porcentajeAsistencia }
}

// ---------------------------------------------------------------------------
// Funnel de Tiempos (bar chart horizontal) — copia simplificada del que
// vive en el Dashboard de Recepcion, ajustada a tamaño reducido para
// impresion. Marca en rojo la etapa identificada como cuello de botella.
// ---------------------------------------------------------------------------

function FunnelTiempos({ data }: { data: EtapaTiempo[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[140px] flex items-center justify-center text-[10px] text-muted-foreground">
        Sin datos de tiempos hoy
      </div>
    )
  }
  return (
    <div className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 0, bottom: 0 }}
          barSize={12}
        >
          <XAxis
            type="number"
            stroke="var(--muted-foreground)"
            fontSize={9}
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
            width={88}
            tickFormatter={(s: string) =>
              s.length > 14 ? `${s.slice(0, 12)}...` : s
            }
          />
          <Bar
            dataKey="promedioMin"
            radius={[0, 3, 3, 0]}
            label={{
              position: "right",
              fontSize: 9,
              fill: "var(--foreground)",
              formatter: (v: number) => fmtMinutos(v),
            }}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.esCuelloBotella
                    ? "var(--destructive)"
                    : "var(--chart-1)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tarjeta KPI compacta. Diseñada para apretarse en grids de 4-7 columnas
// y mantenerse legible al imprimirse a hoja carta.
// ---------------------------------------------------------------------------

interface MiniKpiProps {
  label: string
  value: string
  hint?: string
  icon: React.ElementType
  tone?: "default" | "success" | "warning" | "danger" | "info"
}

const TONE_STYLES: Record<NonNullable<MiniKpiProps["tone"]>, string> = {
  default: "text-foreground",
  success: "text-[var(--chart-3)]",
  warning: "text-[var(--chart-4)]",
  danger: "text-destructive",
  info: "text-[var(--chart-1)]",
}

function MiniKpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: MiniKpiProps) {
  return (
    <div className="rounded-md border border-border/60 bg-card px-2.5 py-2 flex items-start gap-2 print:px-2 print:py-1.5">
      <span
        className={`shrink-0 h-6 w-6 rounded-md flex items-center justify-center bg-current/10 ${TONE_STYLES[tone]} print:h-5 print:w-5`}
        aria-hidden="true"
      >
        <Icon className={`h-3.5 w-3.5 ${TONE_STYLES[tone]}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </p>
        <p
          className={`text-[15px] print:text-[13px] font-bold tabular-nums leading-tight ${TONE_STYLES[tone]}`}
        >
          {value}
        </p>
        {hint ? (
          <p className="text-[9px] text-muted-foreground leading-tight truncate">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Encabezado de seccion (titulo + descripcion corta). */
function SectionTitle({
  index,
  title,
  description,
}: {
  index: number
  title: string
  description?: string
}) {
  return (
    <div className="flex items-baseline gap-2 mb-2">
      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-primary text-primary-foreground text-[10px] font-bold px-1.5">
        {index}
      </span>
      <h3 className="text-[12px] font-bold uppercase tracking-wider text-foreground">
        {title}
      </h3>
      {description ? (
        <span className="text-[10px] text-muted-foreground truncate">
          {description}
        </span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function CierreDiaDashboard() {
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()

  // Estados base de las tres fuentes de datos.
  const [pedidos, setPedidos] = useState<{
    cabecera: PedidoCabecera[]
    detalle: PedidoDetalle[]
  } | null>(null)
  const [recepcion, setRecepcion] =
    useState<DashboardRecepcionPayload | null>(null)
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  // Estadisticas de toneladas del dia: meta (constante por empresa),
  // toneladas programadas (suma de pesoorden) y ejecutadas (suma de
  // pesoorden de ordenes finalizadas). Provienen de
  // `getDashboardOperacionesStats`, misma fuente del Dashboard de
  // Operacion del Dia.
  const [metaStats, setMetaStats] = useState<{
    meta: number
    programado: number
    ejecutado: number
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fecha seleccionada para el cierre. Por defecto el dia actual
  // (Bogota), pero el usuario puede elegir dias anteriores para
  // consultar el cierre historico. `fechaLarga` es la etiqueta legible.
  const [fechaSel, setFechaSel] = useState<string>(() => getBogotaHoy())
  const hoy = fechaSel
  const fechaLarga = useMemo(() => fmtFechaLarga(fechaSel), [fechaSel])
  const esHoy = fechaSel === getBogotaHoy()

  // Loader: las tres fuentes corren en paralelo. Si una falla, no
  // bloquea a las demas (mostramos vacios donde corresponda).
  const loadAll = useCallback(async () => {
    if (!selectedEmpresaId) {
      setPedidos(null)
      setRecepcion(null)
      setAttendance([])
      setMetaStats(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [pedRes, recRes, attRes, opRes] = await Promise.all([
        getDashboardPedidosData(selectedEmpresaId),
        getDashboardRecepcionData(selectedEmpresaId, "diario", fechaSel),
        fetch(
          `/api/attendance/dashboard?empresaId=${selectedEmpresaId}&mode=daily&date=${fechaSel}`,
        )
          .then((r) => r.json())
          .catch(() => ({ data: [] })),
        // Stats de toneladas del dia para la tarjeta "Cumplimiento
        // Toneladas". Si falla, mostramos ceros en la UI (no es critico
        // para el resto del dashboard).
        getDashboardOperacionesStats(selectedEmpresaId, fechaSel).catch(() => ({
          success: false as const,
          data: undefined,
        })),
      ])
      if (pedRes.success && pedRes.data) {
        setPedidos(pedRes.data)
      } else {
        setPedidos({ cabecera: [], detalle: [] })
      }
      if (recRes.success && recRes.data) {
        setRecepcion(recRes.data)
      } else {
        setRecepcion(null)
      }
      setAttendance(attRes?.data || [])
      if (opRes.success && opRes.data) {
        setMetaStats({
          meta: opRes.data.metaToneladasDia || 0,
          programado: opRes.data.toneladasProgramadas || 0,
          ejecutado: opRes.data.totalToneladasDia || 0,
        })
      } else {
        setMetaStats({ meta: 0, programado: 0, ejecutado: 0 })
      }
    } catch (e: any) {
      console.error("[v0] CierreDia loadAll error:", e)
      setError(e?.message || "Error al cargar el cierre del dia")
    } finally {
      setLoading(false)
    }
  }, [selectedEmpresaId, fechaSel])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // ── Calculos derivados ────────────────────────────────────────────
  const pedidosKpis = useMemo<PedidosKpisDia>(() => {
    if (!pedidos) {
      return {
        ingresados: 0,
        ingresadosAprobados: 0,
        ingresadosNoAprobados: 0,
        entregados: 0,
        cumplimientoPct: 0,
        entregasATiempoPct: 0,
        inFullPct: 0,
        otifPct: 0,
        volumenTon: 0,
        cumplimientoGlobalPct: 0,
        cargaPerfectaPct: 0,
      }
    }
    return calcPedidosDia(pedidos.cabecera, pedidos.detalle, hoy)
  }, [pedidos, hoy])

  const attStats = useMemo(
    () => calcAttendanceStats(attendance),
    [attendance],
  )
  const distribucionTurnos = useMemo(
    () => calcDistribucionTurnos(attendance),
    [attendance],
  )

  // ── Generar PDF ────────────────────────────────────────────────────
  // 1) Antes de imprimir, serializamos un HTML autocontenido del
  //    contenedor #cierre-dia-print y lo subimos a Vercel Blob bajo
  //    `cierres/<empresaId>/<YYYY-MM-DD>.html`. Asi el "Historial de
  //    Cierres" puede reabrir e imprimir cualquier dia pasado tal
  //    como salio originalmente.
  // 2) Despues llamamos a `window.print()` con el @media print en
  //    globals.css que oculta la UI y deja solo el contenedor
  //    imprimible. Es la opcion mas confiable porque respeta SVG de
  //    Recharts y CSS variables, sin depender de html2canvas.
  // El upload se hace en background con Promise; si falla, NO se
  // bloquea la impresion (UX prioritaria) - solo se loguea.
  const handlePrint = async () => {
    if (typeof window === "undefined") return

    // Serializa los estilos del documento para que el HTML guardado
    // sea totalmente autocontenido (no depende de la app para verse).
    try {
      const node = document.getElementById("cierre-dia-print")
      if (node && selectedEmpresaId) {
        const empresaIdNum =
          typeof selectedEmpresaId === "number"
            ? selectedEmpresaId
            : Number(selectedEmpresaId)

        // Fecha del cierre seleccionado (YYYY-MM-DD) para indexar el
        // snapshot. Usa la fecha elegida por el usuario, no siempre hoy.
        const fechaISO = fechaSel

        // Recolecta TODAS las hojas/estilos en linea para que el HTML
        // se vea identico fuera del contexto de la app. `link` con
        // href absoluto se conserva tal cual; `style` se inlinea.
        const styleNodes = Array.from(
          document.querySelectorAll('style, link[rel="stylesheet"]'),
        )
        const headStyles = styleNodes
          .map((n) => n.outerHTML)
          .join("\n")

        const titulo = `Cierre Operativo LipGo - ${
          selectedEmpresaNombre || "Empresa"
        } - ${fechaISO}`

        const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titulo}</title>
${headStyles}
<style>
  /* Forzamos que al abrir el snapshot directo (fuera de la app) se
     vea el cierre como estaria al imprimirse: una sola hoja carta. */
  html, body { margin: 0; padding: 0; background: #fff; }
  body { display: flex; justify-content: center; padding: 16px; }
  #cierre-dia-print { box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  @media print {
    body { padding: 0; display: block; }
    #cierre-dia-print { box-shadow: none; }
  }
</style>
</head>
<body>
${node.outerHTML}
</body>
</html>`

        // Lazy import para no engrosar el bundle con la action.
        import("@/lib/cierre-historial-actions").then(
          ({ saveCierreSnapshot }) => {
            saveCierreSnapshot(empresaIdNum, fechaISO, html).catch((e) => {
              console.log("[v0] saveCierreSnapshot failed:", e)
            })
          },
        )
      }
    } catch (e) {
      console.log("[v0] snapshot serialize failed:", e)
    }

    window.print()
  }

  return (
    <div className="flex flex-col gap-3 p-4 md:p-6 print:p-0">
      {/* Barra de acciones — oculta al imprimir */}
      <div className="flex items-center justify-between gap-2 flex-wrap no-print print:hidden">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">
            Dashboard - Cierre del Día
          </h2>
          <p className="text-xs text-muted-foreground">
            Resumen ejecutivo consolidado · {fechaLarga}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector de fecha del cierre. Permite consultar dias
              anteriores; el maximo es hoy (no hay cierre futuro). */}
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={fechaSel}
              max={getBogotaHoy()}
              onChange={(e) =>
                setFechaSel(e.target.value || getBogotaHoy())
              }
              disabled={loading}
              className="h-8 w-[150px] text-xs"
              aria-label="Fecha del cierre"
            />
            {!esHoy ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFechaSel(getBogotaHoy())}
                disabled={loading}
              >
                Hoy
              </Button>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={loading}
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Generar PDF
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando consolidado del día...</span>
        </div>
      ) : (
        // ─────────────────────────────────────────────────────────────
        // Contenedor imprimible. Importante: id="cierre-dia-print" para
        // que el CSS @media print solo muestre este nodo.
        // ─────────────────────────────────────────────────────────────
        <div
          id="cierre-dia-print"
          className="bg-card border border-border/60 rounded-lg p-4 print:rounded-none print:border-0 print:p-3 print:shadow-none"
        >
          {/* Cabecera del documento.
              Visible tanto en pantalla como en el PDF. Lleva el logo
              de LipGo a la izquierda y, al lado, el titulo "Cierre
              Operativo LipGo" con el nombre del proyecto (empresa
              seleccionada) y la fecha del cierre. La hora de
              generacion se mantiene en la esquina derecha como
              referencia para auditoria. */}
          <div className="flex items-center justify-between gap-3 border-b border-border pb-2 mb-3 print:pb-1.5 print:mb-2">
            <div className="flex items-center gap-3 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/lipgo-logo.png"
                alt="LipGo"
                className="h-9 w-auto print:h-7 shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-base font-bold leading-tight print:text-sm">
                  Cierre Operativo LipGo
                </h1>
                <p className="text-[11px] text-muted-foreground leading-tight truncate print:text-[10px]">
                  Proyecto:{" "}
                  <span className="font-medium text-foreground">
                    {selectedEmpresaNombre || "Empresa"}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight capitalize print:text-[10px]">
                  {fechaLarga}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded print:text-[9px]">
                <BadgeCheck className="h-3 w-3" />
                LIP · Operación
              </span>
              <p className="text-[9px] text-muted-foreground mt-1 tabular-nums print:text-[8px]">
                Generado{" "}
                {new Date().toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Bogota",
                })}{" "}
                · zona Bogotá
              </p>
            </div>
          </div>

          {/* ─── 1. PEDIDOS ─── */}
          <section className="mb-3">
            <SectionTitle
              index={1}
              title="Pedidos"
              description="Cifras del día (creación / entrega)"
            />
            <div className="grid grid-cols-3 lg:grid-cols-9 gap-2">
              <MiniKpi
                label="Ingresaron"
                value={fmtInt(pedidosKpis.ingresados)}
                hint="creados hoy"
                icon={Inbox}
                tone="info"
              />
              {/* Desglose de los ingresados por estado de aprobacion
                  (campo `aprobado` en pedidoscabecera). Tonos:
                  - success para aprobados (alentando ese flujo).
                  - warning para los pendientes/no aprobados (signal de
                    acciones que deben moverse hoy).
                  El "hint" muestra los aprobados como una fraccion para
                  dar contexto rapido del total sin ocupar mas espacio. */}
              <MiniKpi
                label="Aprobados"
                value={fmtInt(pedidosKpis.ingresadosAprobados)}
                hint={
                  pedidosKpis.ingresados > 0
                    ? `${pedidosKpis.ingresadosAprobados}/${pedidosKpis.ingresados}`
                    : "sin pedidos"
                }
                icon={BadgeCheck}
                tone="success"
              />
              <MiniKpi
                label="No aprobados"
                value={fmtInt(pedidosKpis.ingresadosNoAprobados)}
                hint={
                  pedidosKpis.ingresados > 0
                    ? `${pedidosKpis.ingresadosNoAprobados}/${pedidosKpis.ingresados}`
                    : "sin pedidos"
                }
                icon={AlertTriangle}
                tone={
                  pedidosKpis.ingresadosNoAprobados === 0
                    ? "success"
                    : "warning"
                }
              />
            </div>
          </section>

          {/* ─── 2. EFICIENCIA DE CARGA E IN-FULL ─── */}
          <section className="mb-3">
            <SectionTitle
              index={2}
              title="Eficiencia de Carga e In-Full"
              description="Calidad de la carga del día"
            />
            <div className="grid grid-cols-2 gap-2">
              <MiniKpi
                label="% Cumplimiento Global"
                value={fmtPct(pedidosKpis.cumplimientoGlobalPct)}
                hint="cargadas / pedidas (acum.)"
                icon={CheckCircle2}
                tone={
                  pedidosKpis.cumplimientoGlobalPct >= 95
                    ? "success"
                    : "warning"
                }
              />
              <MiniKpi
                label="Tasa de Carga Perfecta"
                value={fmtPct(pedidosKpis.cargaPerfectaPct)}
                hint="líneas con cargadas = pedidas"
                icon={PackageCheck}
                tone="info"
              />
            </div>
          </section>

          {/* ─── 3. DESPACHOS ─── */}
          <section className="mb-3">
            <SectionTitle
              index={3}
              title="Despachos"
              description="Operación de patio y báscula"
            />
            {/* Tarjeta compacta de Cumplimiento Toneladas (movida desde
                Pedidos por requerimiento de negocio: el cumplimiento
                Meta/Programado/Ejecutado pertenece conceptualmente al
                flujo de Despachos, donde se mide la salida real en
                toneladas).
                Muestra Meta → Programado → Ejecutado en una sola fila
                horizontal con el % de cumplimiento al final, calculado
                como ejecutado/meta. Tono color: success ≥ 95, warning
                ≥ 80, danger lo demas. */}
            {metaStats ? (() => {
              const pct =
                metaStats.meta > 0
                  ? Math.min(100, (metaStats.ejecutado / metaStats.meta) * 100)
                  : 0
              const tone: NonNullable<MiniKpiProps["tone"]> =
                pct >= 95 ? "success" : pct >= 80 ? "warning" : "danger"
              return (
                <div className="mb-2 rounded-md border border-border/60 bg-card px-3 py-2 flex items-center gap-3 print:px-2 print:py-1.5">
                  <span
                    className={`shrink-0 h-7 w-7 rounded-md flex items-center justify-center bg-current/10 ${TONE_STYLES[tone]} print:h-6 print:w-6`}
                    aria-hidden="true"
                  >
                    <Target className={`h-4 w-4 ${TONE_STYLES[tone]}`} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">
                      Cumplimiento Toneladas
                    </p>
                    <p className="text-[10px] text-foreground/80 leading-tight">
                      <span className="text-muted-foreground">Meta</span>{" "}
                      <span className="font-semibold tabular-nums">
                        {fmtDec(metaStats.meta, 1)}t
                      </span>
                      <span className="mx-1.5 text-muted-foreground/50">·</span>
                      <span className="text-muted-foreground">Programado</span>{" "}
                      <span className="font-semibold tabular-nums">
                        {fmtDec(metaStats.programado, 1)}t
                      </span>
                      <span className="mx-1.5 text-muted-foreground/50">·</span>
                      <span className="text-muted-foreground">Ejecutado</span>{" "}
                      <span className="font-semibold tabular-nums">
                        {fmtDec(metaStats.ejecutado, 1)}t
                      </span>
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p
                      className={`text-[18px] print:text-[15px] font-bold tabular-nums leading-none ${TONE_STYLES[tone]}`}
                    >
                      {fmtPct(pct)}
                    </p>
                    <p className="text-[9px] text-muted-foreground leading-tight">
                      ejecutado / meta
                    </p>
                  </div>
                </div>
              )
            })() : null}
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
              {/* Entregados se movio aqui desde la seccion Pedidos: el
                  conteo de entregas del dia pertenece conceptualmente
                  al flujo de Despachos, igual que Volumen, Ordenes y
                  Rendimiento. */}
              <MiniKpi
                label="Entregados"
                value={fmtInt(pedidosKpis.entregados)}
                hint="entregas del día"
                icon={Truck}
                tone="success"
              />
              {/* Cumplimiento, Entregas a tiempo e In-Full se trasladaron
                  desde la seccion Pedidos: pertenecen al flujo de
                  Despachos porque miden la calidad de la entrega
                  (cargado vs pedido, puntualidad y completitud de
                  lineas). OTIF Global y Volumen Desp. se eliminaron
                  por solicitud del negocio para reducir ruido en el
                  cierre. */}
              <MiniKpi
                label="Cumplimiento"
                value={fmtPct(pedidosKpis.cumplimientoPct)}
                hint="cargado / pedido"
                icon={Gauge}
                tone={
                  pedidosKpis.cumplimientoPct >= 95
                    ? "success"
                    : pedidosKpis.cumplimientoPct >= 80
                      ? "warning"
                      : "danger"
                }
              />
              <MiniKpi
                label="Entregas a tiempo"
                value={fmtPct(pedidosKpis.entregasATiempoPct)}
                hint="≤ programada"
                icon={CheckCircle2}
                tone="success"
              />
              <MiniKpi
                label="In-Full"
                value={fmtPct(pedidosKpis.inFullPct)}
                hint="líneas completas"
                icon={PackageCheck}
                tone="info"
              />
              <MiniKpi
                label="Volumen Hoy"
                value={`${fmtDec(recepcion?.kpisDiario.volumenHoyTon || 0)} t`}
                icon={Package}
                tone="info"
              />
              <MiniKpi
                label="Órdenes"
                value={fmtInt(recepcion?.kpisDiario.ordenesHoy || 0)}
                hint={
                  recepcion
                    ? `${recepcion.kpisDiario.ordenesCargue}C / ${recepcion.kpisDiario.ordenesDescargue}D / ${recepcion.kpisDiario.ordenesDistribucion}Dist`
                    : "—"
                }
                icon={Truck}
              />
              <MiniKpi
                label="Lead Time"
                value={fmtMinutos(
                  recepcion?.kpisDiario.leadTimePromedioMin || 0,
                )}
                hint="promedio del día"
                icon={Timer}
                tone={
                  (recepcion?.kpisDiario.leadTimePromedioMin || 0) > 120
                    ? "warning"
                    : "default"
                }
              />
              <MiniKpi
                label="Rendimiento"
                value={`${fmtDec(recepcion?.kpisDiario.rendimientoTonHr || 0)} t/h`}
                hint="toneladas / hora"
                icon={Gauge}
                tone="success"
              />
              <MiniKpi
                label="Tiempo Cola"
                value={fmtMinutos(
                  recepcion?.kpisDiario.tiempoPromedioColaMin || 0,
                )}
                hint="orden → lote"
                icon={Clock}
                tone={
                  (recepcion?.kpisDiario.tiempoPromedioColaMin || 0) > 45
                    ? "warning"
                    : "default"
                }
              />
              <MiniKpi
                label="Cuello Botella"
                value={recepcion?.kpisDiario.cuelloBotellaDia || "N/A"}
                hint="etapa crítica"
                icon={AlertTriangle}
                tone={
                  recepcion?.kpisDiario.cuelloBotellaDia &&
                  recepcion.kpisDiario.cuelloBotellaDia !== "N/A"
                    ? "warning"
                    : "default"
                }
              />
            </div>

            {/* Funnel de Tiempos */}
            <div className="rounded-md border border-border/60 bg-card px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Timer className="h-3 w-3 text-primary" />
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                  Tiempos de proceso por etapa
                </h4>
                <span className="text-[9px] text-muted-foreground">
                  Promedio por etapa · cuello en rojo
                </span>
              </div>
              <FunnelTiempos data={recepcion?.etapasTiempo || []} />
            </div>
          </section>

          {/* ─── 4. RRHH LIP ─── */}
          <section>
            <SectionTitle
                index={4}
                title="RRHH LIP"
                description="Asistencia del día y distribución de turnos por puesto"
              />
            <div className="grid grid-cols-12 gap-2">
              {/* KPIs de asistencia (col 4).
                  `print:col-span-4` fuerza la columna estrecha al
                  imprimir, porque el viewport de print de Chromium
                  suele caer por debajo del breakpoint `md:`, lo que
                  hacia que los dos bloques se apilaran en el PDF en
                  vez de quedar lado a lado como en pantalla. */}
              <div className="col-span-12 md:col-span-4 print:col-span-4 grid grid-cols-1 gap-2 content-start">
                <MiniKpi
                  label="Turnos Programados"
                  value={fmtInt(attStats.totalTurnos)}
                  icon={Users}
                  tone="info"
                />
                <MiniKpi
                  label="Asistencia"
                  value={fmtInt(attStats.asistencias)}
                  hint="presentes en su puesto"
                  icon={UserCheck}
                  tone="success"
                />
                <MiniKpi
                  label="% Asistencia"
                  value={`${attStats.porcentajeAsistencia}%`}
                  icon={Gauge}
                  tone={
                    attStats.porcentajeAsistencia >= 80
                      ? "success"
                      : attStats.porcentajeAsistencia >= 50
                        ? "warning"
                        : "danger"
                  }
                />
              </div>

              {/* Tabla "Distribución de Turnos" - solo Puesto + Personas.
                  `data-keep-together` impide que el bloque se parta a
                  la mitad si la pagina se quedara corta (lo respeta el
                  @media print en globals.css). */}
              <div
                data-keep-together
                className="col-span-12 md:col-span-8 print:col-span-8 rounded-md border border-border/60 bg-card px-3 py-2"
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Users className="h-3 w-3 text-primary" />
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                    Distribución de Turnos
                  </h4>
                </div>
                {distribucionTurnos.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-3 text-center">
                    Sin turnos programados hoy.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-3">
                    {/* Distribuimos en 2 columnas si hay muchos puestos
                         para mantener compacto */}
                    {[0, 1].map((col) => (
                      <table
                        key={col}
                        className="w-full text-[10px] border-separate border-spacing-0"
                      >
                        <thead>
                          <tr>
                            <th className="text-left py-1 px-1.5 font-semibold text-muted-foreground border-b border-border/60 uppercase tracking-wider text-[9px]">
                              Puesto
                            </th>
                            <th className="text-right py-1 px-1.5 font-semibold text-muted-foreground border-b border-border/60 uppercase tracking-wider text-[9px]">
                              Personas
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {distribucionTurnos
                            .filter((_, i) => i % 2 === col)
                            .map((r) => (
                              <tr
                                key={`${col}-${r.puesto}`}
                                className="border-b border-border/30"
                              >
                                <td className="py-0.5 px-1.5 truncate">
                                  {r.puesto}
                                </td>
                                <td className="py-0.5 px-1.5 text-right tabular-nums font-semibold">
                                  {r.personas}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Footer del documento - solo visible al imprimir.
              Lo anclamos absoluto al pie del contenedor de impresion
              (que ya tiene height: 11in en globals.css) para que NO
              empuje contenido al final del flujo y termine generando
              una segunda pagina con solo el footer. El padding-bottom
              extra del wrapper imprimible deja espacio reservado para
              esta barra. */}
          <div className="hidden print:flex absolute left-[0.3in] right-[0.3in] bottom-[0.3in] pt-2 border-t border-border text-[9px] text-muted-foreground justify-between">
            <span>
              Cierre del Día — {selectedEmpresaNombre || "Empresa"} ·{" "}
              {fechaLarga}
            </span>
            <span>Generado desde LipGo V3</span>
          </div>
        </div>
      )}
    </div>
  )
}
