"use client"

// Centro de Coordinación (Operación LIP): pantalla única del coordinador que
// une Picking (Cargue), Packing (Descargue/Distribución) y el control de
// muelles/SLA/ritmo en una sola vista. Reutiliza las MISMAS acciones que ya
// usan esas pantallas (asignar personal, iniciar, cerrar con fotos, pausar) —
// no las reescribe. Diseño validado con el usuario en varias rondas de
// iteración: semáforo de 3 colores (verde=libre/amarillo=ocupado/rojo=fuera
// de tiempo), franja de control siempre visible (toneladas, ritmo,
// proyección), línea de 5 pasos con responsable (🚜 Montacarguista vs
// Coordinador), acciones de utilidad (pausar/reasignar/liberar), alerta
// temprana antes de vencer SLA, comparación vs. ayer, filtro "Solo
// atención", sugerencias (reforzar con auxiliar / siguiente turno) y "Parte
// de turno".

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LayoutGrid, Loader2, Camera, UserPlus, Play, Pause, ChevronDown, Truck, Users, AlertTriangle, ClipboardList } from "lucide-react"
import {
  getCentroCoordinacion,
  iniciarOrdenEnMuelle,
  asignarOrdenAMuelle,
  liberarMuelle,
  getHojaDelMuelle,
  getParteDeTurno,
  type CentroCoordinacionData,
  type OrdenOperativa,
  type TipoOperacion,
  type HojaMuelle,
  type ParteDeTurno,
} from "@/lib/centro-coordinacion-actions"
import {
  getCarguDescarguePersonnel,
  assignPersonnelToOrder,
  pausarOrden,
  reanudarOrden,
  type PersonnelEmployee,
} from "@/lib/picking-actions"
import { PickingPhotoUploadDialog } from "@/components/picking-photo-upload-dialog"
import { TipoPagoSelector } from "@/components/tipo-pago-selector"

const t1 = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })
const t2 = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })

const TIPO_LABEL: Record<TipoOperacion, string> = {
  Cargue: "Cargue · Picking",
  Descargue: "Descargue · Packing",
  Distribucion: "Distribución",
}

const FILTROS: Array<{ value: TipoOperacion | "Todos"; label: string }> = [
  { value: "Todos", label: "Todos" },
  { value: "Cargue", label: "Cargue (Picking)" },
  { value: "Descargue", label: "Descargue (Packing)" },
  { value: "Distribucion", label: "Distribución" },
]

const VEHICULOS_GRANDES = new Set(["Dobletroque", "Tractomula", "Mula"])
function iconoVehiculo(tipovehiculo: string | null): string {
  if (tipovehiculo && VEHICULOS_GRANDES.has(tipovehiculo)) return "🚛"
  return "🚚"
}

function fmtHora(hhmm: string | null): string {
  return hhmm ? hhmm.slice(0, 5) : "—"
}

/** % de avance de la orden. En orden de preferencia (el más real primero):
 *  1) Cerrada: peso real de báscula contra la capacidad del vehículo.
 *  2) Cargue en curso: líneas de picking verificadas (dato real por línea).
 *  3) Cualquier orden en curso sin dato por línea (Descargue/Distribución, o
 *     Cargue antes de tener líneas): estimado por tiempo — minutos
 *     transcurridos ÷ SLA acordado × toneladas objetivo. No es un peso real,
 *     pero da una referencia razonable de "debería llevar esto" con datos
 *     que sí existen (pesoorden, iniciocargue, SLA), en vez de mostrar 0. */
function progresoOrden(o: OrdenOperativa): { pct: number; fuente: string } {
  if (o.fincargue && o.pesovascula != null && o.capacidadVehiculo) {
    return { pct: Math.min(100, Math.round((o.pesovascula / o.capacidadVehiculo) * 100)), fuente: "capacidad del vehículo" }
  }
  if (o.tipooperacion === "Cargue" && o.lineasTotal > 0 && o.lineasAprobadas != null) {
    return { pct: Math.round((o.lineasAprobadas / o.lineasTotal) * 100), fuente: "líneas verificadas" }
  }
  if (o.iniciocargue && o.minutosTranscurridos != null && o.slaMin) {
    const pct = Math.min(100, Math.round((o.minutosTranscurridos / o.slaMin) * 100))
    return { pct, fuente: "estimado por tiempo vs. SLA" }
  }
  return { pct: 0, fuente: "sin iniciar" }
}

function finProyectado(o: OrdenOperativa): string | null {
  if (!o.iniciocargue || o.slaMin == null) return null
  const [ih, im] = o.iniciocargue.split(":").map(Number)
  const totalMin = ih * 60 + (im || 0) + o.slaMin
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

type Paso = { label: string; done: boolean; current: boolean; role: "coord" | "op"; detail?: string }

function construirPasos(o: OrdenOperativa): Paso[] {
  const esCargue = o.tipooperacion === "Cargue"
  const pickingListo = esCargue ? o.lineasTotal > 0 && o.lineasAprobadas === o.lineasTotal : !!o.iniciocargue
  const pdfListo = !!o.iniciocargue
  const personalListo = o.auxiliares.length > 0

  const pasos: Omit<Paso, "current">[] = [{ label: "Muelle asignado", done: true, role: "coord" }]
  if (esCargue) {
    pasos.push({
      label: "Realizar Picking",
      done: pickingListo,
      role: "op",
      detail: o.lineasTotal > 0 ? `${o.lineasAprobadas ?? 0}/${o.lineasTotal}` : undefined,
    })
    pasos.push({ label: "Generar PDF", done: pdfListo, role: "op", detail: pdfListo ? fmtHora(o.iniciocargue) : undefined })
  } else {
    pasos.push({ label: "Realizar Packing + PDF", done: pdfListo, role: "op", detail: pdfListo ? fmtHora(o.iniciocargue) : undefined })
  }
  pasos.push({ label: "Asignar Personal", done: personalListo, role: "coord" })
  pasos.push({ label: "Cargar fotos", done: false, role: "coord" })

  const idxActual = pasos.findIndex((p) => !p.done)
  return pasos.map((p, i) => ({ ...p, current: i === idxActual }))
}

interface CentroCoordinacionProps {
  onNavigate?: (moduleName: string) => void
}

export default function CentroCoordinacion({ onNavigate }: CentroCoordinacionProps) {
  const { toast } = useToast()
  const { selectedEmpresaId, selectedEmpresaNombre, profile } = useAuth()

  const [data, setData] = useState<CentroCoordinacionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<TipoOperacion | "Todos">("Todos")
  const [soloAtencion, setSoloAtencion] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [hojasPorOrden, setHojasPorOrden] = useState<Map<number, HojaMuelle>>(new Map())
  const [loadingHojaId, setLoadingHojaId] = useState<number | null>(null)

  // Asignar orden de la cola a un muelle libre / reasignar una activa.
  const [asignarDialogOrder, setAsignarDialogOrder] = useState<OrdenOperativa | null>(null)
  const [muelleElegido, setMuelleElegido] = useState<string>("")
  const [asignando, setAsignando] = useState(false)

  // Asignar personal (mismo flujo que Picking/Packing).
  const [personnelDialogOrder, setPersonnelDialogOrder] = useState<OrdenOperativa | null>(null)
  const [personnel, setPersonnel] = useState<PersonnelEmployee[]>([])
  const [selectedPersonnel, setSelectedPersonnel] = useState<string[]>([])
  const [auxiliaresInput, setAuxiliaresInput] = useState("")
  const [loadingPersonnel, setLoadingPersonnel] = useState(false)
  const [assigningPersonnel, setAssigningPersonnel] = useState(false)

  // Cerrar con fotos (diálogo compartido con Picking).
  const [photoOrder, setPhotoOrder] = useState<OrdenOperativa | null>(null)
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false)

  const [pausingOrder, setPausingOrder] = useState<string | null>(null)

  // Parte de turno — carga bajo demanda, solo cuando se abre. Control manual
  // (no <details>/<summary>): más predecible que depender del toggle nativo.
  const [parteTurnoAbierto, setParteTurnoAbierto] = useState(false)
  const [parteTurno, setParteTurno] = useState<ParteDeTurno | null>(null)
  const [loadingParte, setLoadingParte] = useState(false)

  // El filtro de tipo NUNCA se manda al backend: los muelles son un recurso
  // físico compartido por los 3 tipos, así que siempre se piden completos.
  // El filtro solo atenúa visualmente en el cliente — ver `coincideFiltro`.
  const cargar = useCallback(async () => {
    if (!selectedEmpresaId) return
    const r = await getCentroCoordinacion(selectedEmpresaId)
    setLoading(false)
    if (r.success && r.data) {
      setData(r.data)
      for (const a of r.data.autoAsignaciones) {
        toast({
          title: "Muelle asignado automáticamente",
          description: `${a.ordendecargue} (${a.placa || "sin placa"}) llevaba 15+ min cargando sin muelle — se asignó solo al muelle ${a.muelle}.`,
        })
      }
    } else {
      toast({ title: "No se pudo cargar el Centro de Coordinación", description: r.message, variant: "destructive" })
    }
  }, [selectedEmpresaId, toast])

  useEffect(() => {
    setLoading(true)
    cargar()
    const id = setInterval(cargar, 60_000)
    return () => clearInterval(id)
  }, [cargar])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const horaActualReloj = useMemo(
    () =>
      new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now),
    [now],
  )

  const toggleExpand = async (orden: OrdenOperativa) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(orden.orderId)) next.delete(orden.orderId)
      else next.add(orden.orderId)
      return next
    })
    if (!hojasPorOrden.has(orden.orderId)) {
      setLoadingHojaId(orden.orderId)
      const r = await getHojaDelMuelle(orden.orderId)
      setLoadingHojaId(null)
      if (r.success && r.data) {
        setHojasPorOrden((prev) => new Map(prev).set(orden.orderId, r.data!))
      }
    }
  }

  const muellesLibres = useMemo(() => (data ? data.muelles.filter((m) => !m.orden).map((m) => m.muelle) : []), [data])

  const abrirAsignar = (orden: OrdenOperativa) => {
    setAsignarDialogOrder(orden)
    setMuelleElegido(muellesLibres[0] ? String(muellesLibres[0]) : "")
  }

  const confirmarAsignar = async () => {
    if (!asignarDialogOrder || !muelleElegido) return
    setAsignando(true)
    // Si la orden YA tiene muelle (reasignar), solo movemos el muelle; si es
    // nueva (desde la cola), además dispara Generar PDF / inicia el cargue —
    // mismas acciones que ya usan Picking/Packing.
    let success: boolean
    let message: string | undefined
    let urlGenerada: string | undefined
    if (asignarDialogOrder.muelle) {
      const res = await asignarOrdenAMuelle(asignarDialogOrder.orderId, Number(muelleElegido))
      success = res.success
      message = res.message
    } else {
      const res = await iniciarOrdenEnMuelle(asignarDialogOrder.orderId, Number(muelleElegido), {
        ordendecargue: asignarDialogOrder.ordendecargue,
        cliente: asignarDialogOrder.cliente,
        placa: asignarDialogOrder.placa || "",
        conductor: asignarDialogOrder.conductor || "",
        tipooperacion: asignarDialogOrder.tipooperacion,
      })
      success = res.success
      message = res.message
      urlGenerada = res.url
    }
    setAsignando(false)
    if (success) {
      toast({ title: "Éxito", description: message })
      setAsignarDialogOrder(null)
      await cargar()
      if (urlGenerada) window.open(urlGenerada, "_blank")
    } else {
      toast({ title: "Error", description: message, variant: "destructive" })
    }
  }

  const quitarDeMuelle = async (orden: OrdenOperativa) => {
    const r = await liberarMuelle(orden.orderId)
    if (r.success) {
      toast({ title: "Muelle liberado", description: r.message })
      await cargar()
    } else {
      toast({ title: "Error", description: r.message, variant: "destructive" })
    }
  }

  const abrirPersonal = async (orden: OrdenOperativa) => {
    setPersonnelDialogOrder(orden)
    setSelectedPersonnel(orden.auxiliares)
    setAuxiliaresInput("")
    setLoadingPersonnel(true)
    const r = await getCarguDescarguePersonnel(selectedEmpresaId)
    setLoadingPersonnel(false)
    if (r.success) {
      // "Personal disponible" ya excluye a quien esté asignado a CUALQUIER
      // orden activa — incluida esta misma que se está editando. Para poder
      // agregar o quitar sobre lo ya asignado, la lista del diálogo debe
      // ser: disponibles + quien ya esté en ESTA orden (aunque por eso
      // mismo no salga como "disponible" en general).
      const yaEnLista = new Set(r.data.map((p) => p.nombreempleado.trim().toUpperCase()))
      const asignadosFaltantes = orden.auxiliares
        .filter((nombre) => !yaEnLista.has(nombre.trim().toUpperCase()))
        .map((nombre, i) => ({ id: -1000 - i, nombreempleado: nombre }))
      setPersonnel(
        [...r.data, ...asignadosFaltantes].sort((a, b) => a.nombreempleado.localeCompare(b.nombreempleado, "es")),
      )
    } else {
      toast({ title: "Error", description: r.message, variant: "destructive" })
    }
  }

  const togglePersonnelSelection = (name: string) => {
    setSelectedPersonnel((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
  }

  const confirmarPersonal = async () => {
    if (!personnelDialogOrder || selectedPersonnel.length === 0) {
      toast({ title: "Error", description: "Debe seleccionar al menos un empleado", variant: "destructive" })
      return
    }
    setAssigningPersonnel(true)
    const currentUserName = profile?.usuario || "Usuario desconocido"
    const r = await assignPersonnelToOrder(personnelDialogOrder.orderId, selectedPersonnel, auxiliaresInput, currentUserName, {
      id: personnelDialogOrder.orderId,
      ordendecargue: personnelDialogOrder.ordendecargue,
      cliente: personnelDialogOrder.cliente,
      placa: personnelDialogOrder.placa || "",
      conductor: personnelDialogOrder.conductor || "",
    })
    setAssigningPersonnel(false)
    if (r.success) {
      toast({ title: "Éxito", description: r.message })
      setPersonnelDialogOrder(null)
      await cargar()
    } else {
      toast({ title: "Error", description: r.message, variant: "destructive" })
    }
  }

  const togglePausa = async (orden: OrdenOperativa) => {
    setPausingOrder(orden.ordendecargue)
    const r = orden.pausado ? await reanudarOrden(orden.ordendecargue) : await pausarOrden(orden.ordendecargue)
    setPausingOrder(null)
    if (r.success) {
      toast({ title: orden.pausado ? "Cargue reanudado" : "Cargue pausado", description: r.message })
      await cargar()
    } else {
      toast({ title: "Error", description: r.message, variant: "destructive" })
    }
  }

  const abrirFotos = (orden: OrdenOperativa) => {
    setPhotoOrder(orden)
    setPhotoDialogOpen(true)
  }

  const toggleParteTurno = async () => {
    const abriendo = !parteTurnoAbierto
    setParteTurnoAbierto(abriendo)
    if (!abriendo || parteTurno || !selectedEmpresaId) return
    setLoadingParte(true)
    const r = await getParteDeTurno(selectedEmpresaId)
    setLoadingParte(false)
    if (r.success && r.data) setParteTurno(r.data)
    else toast({ title: "No se pudo cargar el parte de turno", description: r.message, variant: "destructive" })
  }

  const puedeConcluirSinPersonal = (o: OrdenOperativa) => o.tipooperacion === "Distribucion" && o.facturar === false

  if (!selectedEmpresaId) {
    return (
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
          <LayoutGrid className="h-5 w-5 text-primary md:h-6 md:w-6" />
          Centro de Coordinación
        </h1>
        <p className="text-sm text-muted-foreground">Selecciona un proyecto en la parte superior para continuar.</p>
      </div>
    )
  }

  const muellesFiltrados = data
    ? data.muelles.filter((slot) => !soloAtencion || (slot.orden && (slot.orden.slaVencido || slot.orden.slaEnRiesgo || slot.orden.pausado)))
    : []

  // Conteo del DÍA (abiertas + cerradas), no de ocupación en vivo — así no
  // baja cuando una orden cierra y libera su muelle.
  const conteoDia = data?.conteoTipoHoy || { Cargue: 0, Descargue: 0, Distribucion: 0 }
  const conteoPorTipo: Record<TipoOperacion | "Todos", number> = {
    Todos: conteoDia.Cargue + conteoDia.Descargue + conteoDia.Distribucion,
    ...conteoDia,
  }

  const estadoLabel = { adelantado: "Adelantado", cerca: "Cerca", atrasado: "Atrasado", sin_datos: "Sin datos aún" }
  const estadoColor = {
    adelantado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    cerca: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    atrasado: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
    sin_datos: "bg-muted text-muted-foreground",
  }

  return (
    <div className="-m-4 space-y-0 md:-m-6">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 bg-[#0e3b3b] px-4 py-3 text-white shadow md:px-6">
        <LayoutGrid className="h-5 w-5 text-[#21d4c8]" />
        <span className="text-sm font-bold tracking-tight">Centro de Coordinación</span>
        <Badge className="ml-auto border-white/15 bg-white/10 text-white hover:bg-white/10">
          Proyecto: {selectedEmpresaNombre || `ID ${selectedEmpresaId}`}
        </Badge>
        <span className="flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-xs text-[#cfe9e6]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#21d4c8]" />
          {horaActualReloj}
        </span>
      </div>

      <div className="space-y-4 p-4 md:p-6">
        {loading && !data ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando Centro de Coordinación...
          </div>
        ) : !data ? (
          <p className="py-8 text-sm text-muted-foreground">No se pudo cargar la información.</p>
        ) : (
          <>
            {data.alertaCargandoSinMuelle.length > 0 && (
              <div className="rounded-lg border-2 border-rose-600 bg-rose-600 p-3 text-white shadow-md animate-pulse">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <AlertTriangle className="h-4 w-4" />
                  {data.alertaCargandoSinMuelle.length === 1
                    ? "1 vehículo está cargando sin muelle asignado"
                    : `${data.alertaCargandoSinMuelle.length} vehículos están cargando sin muelle asignado`}
                </div>
                <div className="mt-2 space-y-1.5">
                  {data.alertaCargandoSinMuelle.map((o) => (
                    <div key={o.orderId} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/15 px-2.5 py-1.5 text-xs">
                      <span>
                        <span className="font-mono">{o.ordendecargue}</span> · {o.cliente} · {o.placa || "sin placa"} —{" "}
                        {o.minutosTranscurridos != null ? `${o.minutosTranscurridos} min cargando` : "recién iniciado"}
                        {o.minutosTranscurridos != null && o.minutosTranscurridos >= 15
                          ? " · se asigna solo apenas haya muelle libre"
                          : ` · se asigna solo a los 15 min si nadie la asigna antes`}
                      </span>
                      <Button size="sm" variant="secondary" className="h-6 text-xs" onClick={() => abrirAsignar(o)}>
                        Asignar ahora
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
              <div className="rounded-lg border bg-card p-3 shadow-sm sm:col-span-2 lg:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cargado hoy</div>
                  <Badge className={estadoColor[data.kpis.estadoTurno]}>{estadoLabel[data.kpis.estadoTurno]}</Badge>
                </div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold tabular-nums">{t1(data.kpis.cargadoHoyTon)}</span>
                  <span className="text-xs text-muted-foreground">/ {t1(data.kpis.metaTonDia)} t meta del día</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${data.kpis.estadoTurno === "atrasado" ? "bg-rose-500" : data.kpis.estadoTurno === "cerca" ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, (data.kpis.cargadoHoyTon / Math.max(data.kpis.metaTonDia, 0.01)) * 100)}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  esperado a esta hora <b className="tabular-nums text-foreground">{t1(data.kpis.metaEsperadaAhoraTon)} t</b>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  vs. ayer a esta hora{" "}
                  {data.kpis.vsAyerPct === null ? (
                    "—"
                  ) : (
                    <b className={`tabular-nums ${data.kpis.vsAyerPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {data.kpis.vsAyerPct >= 0 ? "▲" : "▼"} {t1(Math.abs(data.kpis.vsAyerPct))}%
                    </b>
                  )}{" "}
                  <span className="text-muted-foreground">({t1(data.kpis.cargadoAyerMismaHoraTon)} t ayer)</span>
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ritmo real</div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold tabular-nums">{t2(data.kpis.ritmoTonHora)}</span>
                  <span className="text-xs text-muted-foreground">t/h</span>
                </div>
                <div className="text-[11px] text-muted-foreground">capacidad {t2(data.kpis.capacidadTonHora)} t/h</div>
              </div>
              <div className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cumplimiento SLA</div>
                <span
                  className={`text-2xl font-extrabold tabular-nums ${
                    data.kpis.slaCumplimientoPct === null
                      ? "text-muted-foreground"
                      : data.kpis.slaCumplimientoPct >= 90
                        ? "text-emerald-600 dark:text-emerald-400"
                        : data.kpis.slaCumplimientoPct >= 70
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {data.kpis.slaCumplimientoPct === null ? "—" : `${data.kpis.slaCumplimientoPct}%`}
                </span>
                {data.kpis.ordenesEnRiesgo > 0 && (
                  <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{data.kpis.ordenesEnRiesgo} vencida(s)</div>
                )}
              </div>
              <div className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Personal en piso</div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold tabular-nums">{data.kpis.personalEnPiso}</span>
                  <span className="text-xs text-muted-foreground">aux.</span>
                </div>
                <div className="text-[11px] text-muted-foreground">{data.kpis.personalAsignado} asignados</div>
                <div className="text-[11px] font-medium text-primary">{data.kpis.personalDisponible} disponibles</div>
              </div>
              <div className="rounded-lg border border-[#0e3b3b] bg-[#0e3b3b] p-3 text-white">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8fd3ce]">Proyección de cierre</div>
                <div className="text-2xl font-extrabold tabular-nums text-[#21d4c8]">{data.kpis.proyeccionHoraFinCola || "—"}</div>
                <div className="text-[11px] text-[#cfe9e6]">
                  muelles {data.kpis.muellesOcupados}/{data.kpis.muellesTotal}
                  {data.colaSinMuelle.length > 0 && ` · ${data.colaSinMuelle.length} en cola`}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tiempo de cargue</div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold tabular-nums">
                    {data.kpis.tiempoCargueProedioMin ?? "—"}
                  </span>
                  {data.kpis.tiempoCargueProedioMin != null && <span className="text-xs text-muted-foreground">min</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">{data.kpis.tiempoCargueBaseOrdenes} órdenes hoy</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {FILTROS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFiltroTipo(f.value)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        filtroTipo === f.value
                          ? "border-[#12706b] bg-[#12706b] text-white"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {f.label}
                      <span
                        className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                          filtroTipo === f.value ? "bg-white/20" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {conteoPorTipo[f.value]}
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => setSoloAtencion((v) => !v)}
                    className={`ml-auto rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      soloAtencion ? "border-rose-600 bg-rose-600 text-white" : "border-rose-200 text-rose-600 hover:bg-rose-50"
                    }`}
                  >
                    ⚠ Solo atención
                  </button>
                </div>

                <div className="rounded-xl border bg-card shadow-sm">
                  <div className="flex items-center gap-2 border-b px-4 py-3">
                    <h2 className="text-sm font-bold">Distribución de muelles</h2>
                    <span className="text-[11px] text-muted-foreground">— toca un muelle para operarlo</span>
                    <div className="ml-auto flex gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <i className="inline-block h-2 w-2 rounded-sm bg-emerald-600" />
                        Libre
                      </span>
                      <span className="flex items-center gap-1">
                        <i className="inline-block h-2 w-2 rounded-sm bg-amber-500" />
                        Ocupado
                      </span>
                      <span className="flex items-center gap-1">
                        <i className="inline-block h-2 w-2 rounded-sm bg-rose-600" />
                        Fuera de tiempo
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 p-2.5">
                    {muellesFiltrados.map((slot) => (
                      <MuelleRow
                        key={slot.muelle}
                        slot={slot}
                        expanded={!!slot.orden && expandedIds.has(slot.orden.orderId)}
                        loadingHoja={!!slot.orden && loadingHojaId === slot.orden.orderId}
                        hoja={slot.orden ? hojasPorOrden.get(slot.orden.orderId) || null : null}
                        onToggle={() => slot.orden && toggleExpand(slot.orden)}
                        onAsignarPersonal={() => slot.orden && abrirPersonal(slot.orden)}
                        onCerrarFotos={() => slot.orden && abrirFotos(slot.orden)}
                        onPausar={() => slot.orden && togglePausa(slot.orden)}
                        onQuitar={() => slot.orden && quitarDeMuelle(slot.orden)}
                        onReasignar={() => slot.orden && abrirAsignar(slot.orden)}
                        onCambioTipoPago={cargar}
                        pausingOrder={pausingOrder}
                        puedeConcluirSinPersonal={slot.orden ? puedeConcluirSinPersonal(slot.orden) : false}
                        metaPorHoraTrabajador={data.kpis.metaPorHoraTrabajador}
                        personalDisponibleCount={data.kpis.personalDisponible}
                        atenuado={filtroTipo !== "Todos" && !!slot.orden && slot.orden.tipooperacion !== filtroTipo}
                      />
                    ))}
                  </div>
                </div>

                {data.colaSinMuelle.length > 0 && (
                  <div className="rounded-xl border bg-card p-3 shadow-sm">
                    <h2 className="mb-2 text-sm font-bold">Cola sin muelle asignado ({data.colaSinMuelle.length})</h2>
                    <div className="space-y-1.5">
                      {data.colaSinMuelle.map((o) => (
                        <div key={o.orderId} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                          <div className="min-w-0">
                            <span className="font-mono text-xs text-muted-foreground">{o.ordendecargue}</span>{" "}
                            <span className="font-semibold">{o.cliente}</span>{" "}
                            <span className="text-xs text-muted-foreground">{o.placa}</span>
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              {TIPO_LABEL[o.tipooperacion]}
                            </Badge>
                            {o.rezagada && (
                              <Badge variant="outline" className="ml-1 border-amber-300 text-[10px] text-amber-700 dark:border-amber-800 dark:text-amber-400">
                                Pendiente de un día anterior
                              </Badge>
                            )}
                          </div>
                          <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => abrirAsignar(o)}>
                            Asignar a muelle
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border bg-card p-3 shadow-sm">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <AlertTriangle className="h-4 w-4 text-amber-600" /> Alertas de cumplimiento
                  </h2>
                  <div className="space-y-1.5">
                    {data.kpis.ordenesEnRiesgo === 0 ? (
                      <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                        Todas las órdenes en cargue están dentro del SLA
                      </p>
                    ) : (
                      data.muelles
                        .filter((s) => s.orden?.slaVencido)
                        .map((s) => (
                          <div
                            key={s.orden!.orderId}
                            className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs dark:border-rose-900 dark:bg-rose-950/30"
                          >
                            Muelle {s.muelle} · <span className="font-mono">{s.orden!.ordendecargue}</span> · {s.orden!.placa} — SLA
                            vencido ({s.orden!.minutosTranscurridos} de {s.orden!.slaMin} min)
                          </div>
                        ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-3 shadow-sm">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Truck className="h-4 w-4 text-primary" /> Cola de patio ({data.colaPatio.length})
                  </h2>
                  <div className="space-y-1">
                    {data.colaPatio.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin vehículos esperando cita/orden.</p>
                    ) : (
                      data.colaPatio.map((c, i) => {
                        const sugerido = data.sugerenciaProximoTurno?.placa === c.placa
                        return (
                          <div key={i}>
                            <div
                              className={`flex items-center justify-between text-xs ${sugerido ? "-mx-2 rounded-md bg-emerald-50 px-2 py-1 dark:bg-emerald-950/30" : ""}`}
                            >
                              <span className="font-mono">{c.placa}</span>
                              <span className="text-muted-foreground">{c.tipovehiculo || "—"}</span>
                              <span className="font-mono text-muted-foreground">{fmtHora(c.horallegada)}</span>
                            </div>
                            {sugerido && (
                              <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                💡 sugerido para Muelle {data.sugerenciaProximoTurno!.muelle} (libre ahora)
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-3 shadow-sm">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Users className="h-4 w-4 text-primary" /> Personal disponible ({data.personalDisponibleLista.length})
                  </h2>
                  <p className="mb-1 text-[10px] text-muted-foreground">
                    Única lista de libres — se usa desde "Personal" en cualquier muelle.
                  </p>
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {data.personalDisponibleLista.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nadie disponible ahora mismo.</p>
                    ) : (
                      data.personalDisponibleLista.map((p) => (
                        <div key={p.id} className="text-xs">
                          {p.nombreempleado}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card shadow-sm">
              <button
                type="button"
                onClick={toggleParteTurno}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold"
              >
                <ClipboardList className="h-4 w-4 text-primary" /> Parte de turno — resumen para el próximo coordinador
                <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${parteTurnoAbierto ? "rotate-180" : ""}`} />
              </button>
              {parteTurnoAbierto && (
              <div className="border-t p-4">
                {loadingParte ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Calculando...
                  </div>
                ) : !parteTurno ? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <div className="rounded-md border bg-background p-2">
                        <div className="text-[9px] font-semibold uppercase text-muted-foreground">Cargado en el turno</div>
                        <div className="text-sm font-bold tabular-nums">{t1(parteTurno.cargadoHoyTon)} t</div>
                      </div>
                      <div className="rounded-md border bg-background p-2">
                        <div className="text-[9px] font-semibold uppercase text-muted-foreground">Órdenes cerradas</div>
                        <div className="text-sm font-bold tabular-nums">{parteTurno.ordenesCerradas}</div>
                      </div>
                      <div className="rounded-md border bg-background p-2">
                        <div className="text-[9px] font-semibold uppercase text-muted-foreground">En curso</div>
                        <div className="text-sm font-bold tabular-nums">{parteTurno.ordenesEnCurso}</div>
                      </div>
                      <div className="rounded-md border bg-background p-2">
                        <div className="text-[9px] font-semibold uppercase text-muted-foreground">SLA vencidos ahora</div>
                        <div className="text-sm font-bold tabular-nums text-rose-600">{parteTurno.slaVencidosAhora}</div>
                      </div>
                      <div className="rounded-md border bg-background p-2">
                        <div className="text-[9px] font-semibold uppercase text-muted-foreground">Auxiliares en piso</div>
                        <div className="text-sm font-bold tabular-nums">{parteTurno.personalEnPiso}</div>
                      </div>
                    </div>
                    {parteTurno.pendientes.length > 0 && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        <strong className="text-foreground">Pendiente para el siguiente turno:</strong>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          {parteTurno.pendientes.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Historial del día completo (abiertas + cerradas) con su
                        personal real asignado — esto es lo que ya no se ve en
                        el tablero de muelles apenas una orden cierra. */}
                    <div className="mt-3">
                      <h3 className="mb-1.5 text-xs font-bold text-foreground">
                        Historial de órdenes de hoy ({parteTurno.historial.length})
                      </h3>
                      <div className="max-h-72 overflow-auto rounded-md border">
                        <table className="w-full text-left text-[11px]">
                          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                            <tr>
                              <th className="px-2 py-1.5 font-semibold">Orden</th>
                              <th className="px-2 py-1.5 font-semibold">Tipo</th>
                              <th className="px-2 py-1.5 font-semibold">Placa</th>
                              <th className="px-2 py-1.5 font-semibold">Muelle</th>
                              <th className="px-2 py-1.5 font-semibold">Estado</th>
                              <th className="px-2 py-1.5 font-semibold">Personal real asignado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parteTurno.historial.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">
                                  Sin órdenes hoy.
                                </td>
                              </tr>
                            ) : (
                              parteTurno.historial.map((h) => (
                                <tr key={h.ordendecargue} className="border-t">
                                  <td className="px-2 py-1 font-mono">{h.ordendecargue}</td>
                                  <td className="px-2 py-1">{TIPO_LABEL[h.tipooperacion]}</td>
                                  <td className="px-2 py-1">{h.placa || "—"}</td>
                                  <td className="px-2 py-1">{h.muelle ?? "—"}</td>
                                  <td className="px-2 py-1">
                                    <span
                                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                        h.estado === "cerrada"
                                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                                      }`}
                                    >
                                      {h.estado === "cerrada" ? `Cerrada ${fmtHora(h.horaCierre)}` : "En curso"}
                                    </span>
                                    {h.rezagada && (
                                      <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                        de un día anterior
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1 text-muted-foreground">
                                    {h.personalReal.length > 0 ? h.personalReal.join(", ") : "—"}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Diálogo: asignar a muelle / iniciar / reasignar */}
      <Dialog open={!!asignarDialogOrder} onOpenChange={(open) => !open && setAsignarDialogOrder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{asignarDialogOrder?.muelle ? "Reasignar a otro muelle" : "Iniciar orden en muelle"}</DialogTitle>
            <DialogDescription className="text-sm">
              {asignarDialogOrder?.ordendecargue} · {asignarDialogOrder?.cliente}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Muelle</Label>
            <Select value={muelleElegido} onValueChange={setMuelleElegido}>
              <SelectTrigger>
                <SelectValue placeholder="Elige un muelle libre" />
              </SelectTrigger>
              <SelectContent>
                {muellesLibres.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    Muelle {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {muellesLibres.length === 0 && <p className="text-xs text-rose-600">No hay muelles libres ahora mismo.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsignarDialogOrder(null)} disabled={asignando}>
              Cancelar
            </Button>
            <Button onClick={confirmarAsignar} disabled={asignando || !muelleElegido}>
              {asignando ? "..." : asignarDialogOrder?.muelle ? "Reasignar" : "Iniciar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: asignar personal (mismo flujo real de Picking/Packing) */}
      <Dialog open={!!personnelDialogOrder} onOpenChange={(open) => !open && setPersonnelDialogOrder(null)}>
        <DialogContent className="max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle className="text-base">Asignar Personal</DialogTitle>
            <DialogDescription className="text-sm" asChild>
              <span className="block">
                <span className="block">Orden: {personnelDialogOrder?.ordendecargue}</span>
                <span className="mt-1 block">Usuario: {profile?.usuario || "Usuario desconocido"}</span>
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cc-auxiliares" className="text-sm font-medium">
                Auxiliares (opcional)
              </Label>
              <Input
                id="cc-auxiliares"
                placeholder="Ingrese los nombres de los auxiliares..."
                value={auxiliaresInput}
                onChange={(e) => setAuxiliaresInput(e.target.value)}
                className="text-sm"
              />
            </div>
            {loadingPersonnel ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Cargando personal...</div>
            ) : personnel.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No hay personal disponible</div>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {personnel.map((employee) => (
                  <div key={employee.id} className="flex items-center space-x-2 rounded border p-2">
                    <Checkbox
                      id={`cc-employee-${employee.id}`}
                      checked={selectedPersonnel.includes(employee.nombreempleado)}
                      onCheckedChange={() => togglePersonnelSelection(employee.nombreempleado)}
                    />
                    <Label htmlFor={`cc-employee-${employee.id}`} className="flex-1 cursor-pointer text-sm font-normal">
                      {employee.nombreempleado}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPersonnelDialogOrder(null)} disabled={assigningPersonnel} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={confirmarPersonal} disabled={assigningPersonnel || selectedPersonnel.length === 0} className="flex-1">
              {assigningPersonnel ? "..." : `Asignar (${selectedPersonnel.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {photoOrder && (
        <PickingPhotoUploadDialog
          open={photoDialogOpen}
          onOpenChange={setPhotoDialogOpen}
          orderId={photoOrder.orderId}
          orderLabel={photoOrder.ordendecargue}
          title={photoOrder.tipooperacion === "Cargue" ? "Cargar Fotos de Picking" : "Cargar Fotos de Packing"}
          onUploaded={cargar}
        />
      )}
    </div>
  )
}

function MuelleRow({
  slot,
  expanded,
  loadingHoja,
  hoja,
  onToggle,
  onAsignarPersonal,
  onCerrarFotos,
  onPausar,
  onQuitar,
  onReasignar,
  onCambioTipoPago,
  pausingOrder,
  puedeConcluirSinPersonal,
  metaPorHoraTrabajador,
  personalDisponibleCount,
  atenuado,
}: {
  slot: { muelle: number; orden: OrdenOperativa | null }
  expanded: boolean
  loadingHoja: boolean
  hoja: HojaMuelle | null
  onToggle: () => void
  onAsignarPersonal: () => void
  onCerrarFotos: () => void
  onPausar: () => void
  onQuitar: () => void
  onReasignar: () => void
  onCambioTipoPago: () => void
  pausingOrder: string | null
  puedeConcluirSinPersonal: boolean
  metaPorHoraTrabajador: number
  personalDisponibleCount: number
  /** true = no coincide con el filtro de tipo activo — se atenúa, NUNCA se oculta (los muelles son un recurso físico real). */
  atenuado: boolean
}) {
  const o = slot.orden

  // Semáforo de 3 colores: verde=libre, amarillo=ocupado, rojo=fuera de tiempo.
  const estado: "libre" | "ocupado" | "vencido" = !o ? "libre" : o.slaVencido ? "vencido" : "ocupado"
  const badgeColor = { libre: "bg-emerald-600", ocupado: "bg-amber-500", vencido: "bg-rose-600" }[estado]
  const badgeTextColor = estado === "ocupado" ? "text-amber-950" : "text-white"
  const rowBg = { libre: "bg-emerald-50/60 border-emerald-200", ocupado: "bg-amber-50/60 border-amber-200", vencido: "bg-rose-50/60 border-rose-200" }[
    estado
  ]

  const progreso = o ? progresoOrden(o) : null
  // Lo que se DEBERÍA llevar a esta hora, según el personal REAL asignado a
  // esta orden y el tiempo transcurrido desde que inició — no un promedio
  // del proyecto, sino el cálculo puntual de este muelle.
  const esperado =
    o && o.auxiliares.length > 0 && o.minutosTranscurridos != null
      ? metaPorHoraTrabajador * o.auxiliares.length * (o.minutosTranscurridos / 60)
      : null
  const eta = o ? finProyectado(o) : null
  const pasos = o ? construirPasos(o) : []
  const pasoActual = pasos.find((p) => p.current)

  const auxiliaresLabel = o?.auxiliares.length ? o.auxiliares.join(", ") : null
  const gananciaReforzar = t2(metaPorHoraTrabajador)

  return (
    <div className={`rounded-lg border ${rowBg} dark:bg-card dark:border-border transition-opacity ${atenuado ? "opacity-40" : ""}`}>
      <button type="button" onClick={onToggle} disabled={!o} className="grid w-full grid-cols-[64px_1fr_auto_auto] items-center gap-3 p-2.5 text-left disabled:cursor-default">
        <div className={`flex h-16 w-16 flex-col items-center justify-center rounded-xl ${badgeColor} ${badgeTextColor} shadow ${o?.slaEnRiesgo ? "animate-pulse" : ""}`}>
          <div className="text-2xl font-extrabold leading-none">{slot.muelle}</div>
          <div className="mt-0.5 text-[8px] font-bold uppercase tracking-wide">
            {estado === "libre" ? "Libre" : estado === "vencido" ? "Fuera de tiempo" : o?.pausado ? "Pausado" : "Ocupado"}
          </div>
        </div>

        {o ? (
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="rounded bg-black/5 px-1 text-[9px] font-bold text-muted-foreground dark:bg-white/10">OC</span>
              <span className="font-mono text-xs text-muted-foreground">{o.ordendecargue}</span>
              <span className="text-sm font-bold">{o.cliente}</span>
              <span className="font-mono text-xs text-muted-foreground">{o.placa}</span>
              <Badge variant="outline" className="text-[10px]">
                {TIPO_LABEL[o.tipooperacion]}
              </Badge>
              {o.rezagada && (
                <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700 dark:border-amber-800 dark:text-amber-400">
                  Pendiente de un día anterior
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">{iconoVehiculo(o.tipovehiculo)}</span>
              <div className="h-1.5 max-w-[160px] flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full rounded-full bg-teal-600" style={{ width: `${progreso!.pct}%` }} />
              </div>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                {t1(o.pesoorden)} t objetivo{o.capacidadVehiculo ? ` · cap. ${t1(o.capacidadVehiculo)} t (${o.tipovehiculo})` : ""} ·{" "}
                {progreso!.pct}% {progreso!.fuente}
              </span>
            </div>
            {auxiliaresLabel && <div className="truncate text-[11px] text-muted-foreground">👤 {auxiliaresLabel}</div>}
            {esperado != null && (
              <div className="text-[11px] text-muted-foreground">
                esperado a esta hora{" "}
                <b className="tabular-nums text-foreground">{t1(esperado)} t</b>{" "}
                <span className="text-[10px]">
                  ({o!.auxiliares.length} aux. × {t1((o!.minutosTranscurridos || 0) / 60)} h)
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Sin orden asignada</div>
        )}

        {o && (
          <div
            className={`rounded-lg px-3 py-2 text-center ${estado === "vencido" ? "bg-rose-100 dark:bg-rose-950/40" : o.pausado ? "bg-amber-100 dark:bg-amber-950/40" : "bg-emerald-100 dark:bg-emerald-950/40"}`}
          >
            <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              {o.pausado ? "En pausa" : "Finaliza aprox."}
            </div>
            <div className={`text-lg font-extrabold tabular-nums ${estado === "vencido" ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
              {o.pausado ? "—" : eta || "—"}
            </div>
            <div className="text-[9px] text-muted-foreground">
              {o.pausado
                ? "reanuda para continuar"
                : estado === "vencido"
                  ? `+${o.minutosTranscurridos! - (o.slaMin || 0)} min`
                  : o.slaEnRiesgo
                    ? "⚠ poca holgura"
                    : "muelle libre"}
            </div>
          </div>
        )}

        {o && <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />}
      </button>

      {expanded && o && (
        <div className="border-t bg-background/60 p-3">
          {/* Línea de pasos — solo referencia, no compite con toneladas/tiempos */}
          <div className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-1 border-b pb-2 text-[11px] text-muted-foreground">
            {pasos.map((p, i) => (
              <span key={p.label} className="flex items-center gap-1">
                {i > 0 && <span className="text-border">→</span>}
                <span className={p.done ? "text-foreground" : p.current ? "font-bold text-teal-700 dark:text-teal-400" : "opacity-50"}>
                  {p.done ? "✓" : p.current ? "●" : ""} {p.label}
                  {p.detail ? ` (${p.detail})` : ""}
                </span>
                <span className="text-[8px] opacity-60">{p.role === "op" ? "🚜" : ""}</span>
              </span>
            ))}
          </div>

          {(o.slaVencido || o.slaEnRiesgo) && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {o.auxiliares.length === 0
                ? `Sin personal asignado — reforzar con auxiliares (hay ${personalDisponibleCount} disponibles) para retomar el ritmo.`
                : `A este ritmo no alcanza a cerrar dentro del SLA — un auxiliar más sumaría ~${gananciaReforzar} t/h.`}
            </div>
          )}

          {/* Panel de acción — el paso actual, contextual según quién lo ejecuta */}
          {pasoActual?.role === "op" ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              🚜 <strong className="text-foreground">{pasoActual.label}</strong> lo hace el operario de montacargas desde{" "}
              {o.tipooperacion === "Cargue" ? "Picking" : "Packing"} (celular{o.tipooperacion === "Cargue" ? ", con QR" : ""}) — aquí solo
              ves el avance en vivo, no se opera desde el Centro de Coordinación.
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border-[1.5px] border-teal-600 bg-teal-50/60 p-3 dark:bg-teal-950/20">
              <span className="text-xs text-muted-foreground">
                Paso actual: <strong className="text-foreground">{pasoActual?.label}</strong>
              </span>
              {pasoActual?.label === "Asignar Personal" ? (
                <Button size="sm" onClick={onAsignarPersonal}>
                  <UserPlus className="mr-1 h-3.5 w-3.5" /> Asignar personal
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={onCerrarFotos}
                  disabled={!puedeConcluirSinPersonal && (!auxiliaresLabel || !o.tipoPago)}
                  title={
                    !puedeConcluirSinPersonal && !auxiliaresLabel
                      ? "Asigna personal antes de cerrar"
                      : !puedeConcluirSinPersonal && !o.tipoPago
                        ? "Elige tipo de pago antes de cerrar"
                        : undefined
                  }
                >
                  <Camera className="mr-1 h-3.5 w-3.5" /> Cargar fotos (cierra la OC)
                </Button>
              )}
            </div>
          )}

          {/* Acciones de utilidad — independientes del paso actual. "Personal"
              se puede reabrir cuantas veces haga falta (agregar o quitar
              gente) mientras la orden siga abierta, no solo la primera vez —
              por eso vive aquí y no solo como CTA del paso "Asignar Personal". */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Otras acciones</span>
            {o.iniciocargue && pasoActual?.label !== "Asignar Personal" && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAsignarPersonal}>
                <UserPlus className="mr-1 h-3 w-3" /> {auxiliaresLabel ? "Editar personal" : "Asignar personal"}
              </Button>
            )}
            {o.iniciocargue && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPausar} disabled={pausingOrder === o.ordendecargue}>
                {o.pausado ? <Play className="mr-1 h-3 w-3" /> : <Pause className="mr-1 h-3 w-3" />}
                {o.pausado ? "Reanudar" : "Pausar"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onReasignar}>
              🔄 Reasignar a otro muelle
            </Button>
            {!o.iniciocargue && (
              <Button size="sm" variant="outline" className="h-7 text-xs text-rose-600" onClick={onQuitar}>
                ⛔ Liberar muelle
              </Button>
            )}
          </div>

          {!puedeConcluirSinPersonal && (
            <div className="mt-2">
              <TipoPagoSelector orderId={o.orderId} tipoPago={o.tipoPago} disabled={!!o.fincargue} onChanged={onCambioTipoPago} />
            </div>
          )}

          {/* Evidencias / detalle — bajo demanda */}
          <details className="mt-3 rounded-md border">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-muted-foreground">▸ Ver líneas y evidencias</summary>
            <div className="border-t p-3">
              {loadingHoja ? (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Cargando...
                </div>
              ) : !hoja ? (
                <p className="text-center text-xs text-muted-foreground">Sin datos.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded border bg-background p-2">
                    <div className="mb-1 text-xs font-semibold">Líneas ({hoja.lineas.length})</div>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {hoja.lineas.map((l) => (
                        <div key={l.id} className="flex items-center justify-between text-[11px]">
                          <span className="truncate">{l.producto}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {t2(l.cantidad)} {l.status && <Badge variant="outline" className="ml-1 text-[9px]">{l.status}</Badge>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded border bg-background p-2">
                    <div className="mb-1 text-xs font-semibold">Trazabilidad</div>
                    <div className="space-y-1">
                      {hoja.trazabilidad.map((ev) => (
                        <div key={ev.evento} className="flex items-center justify-between text-[11px]">
                          <span className={ev.hora ? "" : "text-muted-foreground"}>{ev.evento}</span>
                          <span className="font-mono tabular-nums text-muted-foreground">{fmtHora(ev.hora)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="rounded border bg-background p-2">
                      <div className="mb-1 text-xs font-semibold">Auxiliares</div>
                      {hoja.auxiliares.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">Sin personal asignado.</p>
                      ) : (
                        hoja.auxiliares.map((a) => (
                          <div key={a.nombre} className="flex items-center justify-between text-[11px]">
                            <span className="truncate">{a.nombre}</span>
                            <span className="tabular-nums text-muted-foreground">{t2(a.tonPorHora)} t/h</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="rounded border bg-background p-2">
                      <div className="mb-1 text-xs font-semibold">Evidencias</div>
                      {hoja.fotospicking.length === 0 && !hoja.evidenciaPreoperacional ? (
                        <p className="text-[11px] text-muted-foreground">Sin evidencias cargadas aún.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {hoja.evidenciaPreoperacional?.fotos.map((f, i) => (
                            <img key={`pre-${i}`} src={f || "/placeholder.svg"} alt="Preop" className="h-10 w-10 rounded object-cover" />
                          ))}
                          {hoja.fotospicking.map((f, i) => (
                            <img key={`pk-${i}`} src={f || "/placeholder.svg"} alt="Evidencia" className="h-10 w-10 rounded object-cover" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
