"use client"

// Cuadro de Control de Facturación (pestaña dentro de Gestión de Facturas).
// Cruza las ÓRDENES DE SERVICIO procesadas (fuente de verdad) con lo facturado,
// por owner/proyecto, para garantizar que todo lo procesado se facture. En ROJO
// lo "sin gestionar" (procesado sin facturar) y lo "sin tarifa". De aquí salen
// los anexos por proyecto. Datos: lib/facturacion-control-actions.ts.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2,
  Download,
  Filter,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Save,
  FileText,
  Check,
  Trash2,
  ChevronRight,
} from "lucide-react"
import * as XLSX from "xlsx"
import {
  getControlFacturacion,
  getPrefactura,
  guardarPrefactura,
  listarPrefacturas,
  cambiarEstadoPrefactura,
  eliminarPrefactura,
  type ControlFacturacion,
  type CategoriaFactura,
  type FiltrosControl,
  type Prefactura,
  type PrefacturaGuardada,
  type SoporteLinea,
  type UnidadCobro,
} from "@/lib/facturacion-control-actions"
import { getAccessibleEmpresesFromPermisos } from "@/lib/orders-actions"
import { OP_PRODUCCION, OP_PRODUCCION_LABEL } from "@/lib/facturacion-produccion-conceptos"
import { proyectoConReglaMedioPago } from "@/lib/facturacion-medio-pago"
import { CierreDiarioPanel, CierreDiarioTira } from "@/components/cierre-diario"
import { CierreFinanciero } from "@/components/cierre-financiero"
import { GESTION_LIPGO_DESDE } from "@/lib/facturacion-constantes"

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO")
const ton = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })
// La columna de cantidad es una sola para toneladas, horas y turnos: la unidad
// va al lado del número y SOLO las toneladas suman al tonelaje del documento.
const uLabel = (u?: UnidadCobro) => (u === "h" ? "h" : u === "turno" ? "turnos" : "t")
const esTon = (u?: UnidadCobro) => u !== "h" && u !== "turno"

// Semáforo de facturación (lo determina la FACTURA DE SIIGO):
//   VERDE = por facturar (sin factura Siigo) · ROJO = ya facturado (tiene factura Siigo, NO recobrar).
// "Factura solicitada" sin Siigo sigue siendo VERDE (aún no se facturó).
function Semaforo({ c, showLabel = false }: { c: CategoriaFactura; showLabel?: boolean }) {
  const facturado = c === "facturado"
  const dot = facturado ? "bg-red-500" : "bg-emerald-500"
  const text = facturado ? "text-red-700" : "text-emerald-700"
  const label = facturado ? "Facturado" : "Por facturar"
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      {showLabel && <span className={`text-xs font-medium ${text}`}>{label}</span>}
    </span>
  )
}

const CAT_LABEL: Record<CategoriaFactura, string> = {
  facturado: "Facturado",
  en_proceso: "En proceso",
  sin_gestionar: "Sin gestionar",
}
// Agrupa el soporte (detalle de órdenes) por OWNER × OPERACIÓN, con subtotales.
interface SoporteGrupo {
  owner: string
  operacion: string
  lineas: SoporteLinea[]
  ton: number
  valor: number
}
function agruparSoporte(lineas: SoporteLinea[]): { grupos: SoporteGrupo[]; totalTon: number; totalVal: number } {
  const map = new Map<string, SoporteGrupo>()
  for (const l of lineas) {
    const op = l.operacion || "(sin operación)"
    const k = `${l.owner}|||${op}`
    const g = map.get(k) || { owner: l.owner, operacion: op, lineas: [], ton: 0, valor: 0 }
    g.lineas.push(l)
    g.ton += Number(l.toneladas) || 0
    g.valor += Number(l.valor) || 0
    map.set(k, g)
  }
  const grupos = Array.from(map.values()).sort(
    (a, b) => a.owner.localeCompare(b.owner) || a.operacion.localeCompare(b.operacion),
  )
  // Las horas extra comparten la columna de cantidad pero NO son tonelaje.
  const totalTon = lineas.reduce((s, l) => s + (esTon(l.unidad) ? Number(l.toneladas) || 0 : 0), 0)
  const totalVal = lineas.reduce((s, l) => s + (Number(l.valor) || 0), 0)
  return { grupos, totalTon, totalVal }
}

// Documento de SOPORTE (anexo) en pantalla: un bloque por owner × operación con el
// detalle de órdenes y su subtotal. Se usa para la prefactura actual y las guardadas.
function SoporteAnexo({ lineas }: { lineas: SoporteLinea[] }) {
  const { grupos, totalTon, totalVal } = agruparSoporte(lineas)
  if (grupos.length === 0) return <div className="py-6 text-center text-xs text-muted-foreground">Sin soporte.</div>
  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <div key={`${g.owner}|||${g.operacion}`}>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wide">
              {g.owner} · {g.operacion}
            </div>
            <div className="text-[11px] text-muted-foreground">{g.lineas.length} órdenes</div>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="py-1 pl-2 font-medium">Fecha</th>
                  <th className="py-1 font-medium">Orden</th>
                  <th className="py-1 font-medium">Placa</th>
                  <th className="py-1 font-medium">Cliente</th>
                  <th className="py-1 font-medium">Producto</th>
                  <th className="py-1 text-right font-medium">Cantidad</th>
                  <th className="py-1 text-right font-medium">Tarifa</th>
                  <th className="py-1 pr-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {g.lineas.map((l, i) => (
                  <tr key={`${l.numeroorden}-${i}`} className="border-b last:border-0">
                    <td className="py-1 pl-2 tabular-nums">{l.fecha ?? "-"}</td>
                    <td className="py-1">{l.numeroorden}</td>
                    <td className="py-1">{l.placa ?? "-"}</td>
                    <td className="py-1">{l.cliente ?? "-"}</td>
                    <td className="py-1">{l.producto ?? "-"}</td>
                    <td className="py-1 text-right tabular-nums">
                      {ton(l.toneladas)} <span className="text-[9px] text-muted-foreground">{uLabel(l.unidad)}</span>
                    </td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">{money(l.tarifa)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{money(l.valor)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="py-1 pl-2" colSpan={5}>
                    Subtotal {g.owner} · {g.operacion}
                  </td>
                  <td className="py-1 text-right tabular-nums">{ton(g.ton)}</td>
                  <td></td>
                  <td className="py-1 pr-2 text-right tabular-nums">{money(g.valor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between border-t-2 border-primary/40 pt-2">
        <span className="text-sm font-bold">TOTAL SOPORTE</span>
        <span className="text-base font-extrabold tabular-nums text-primary">
          {ton(totalTon)} t · {money(totalVal)}
        </span>
      </div>
    </div>
  )
}

// Exporta el soporte a Excel (una hoja por owner × operación) — opción, no el flujo.
function exportarSoporteExcel(lineas: SoporteLinea[], nombre: string) {
  const { grupos } = agruparSoporte(lineas)
  const wb = XLSX.utils.book_new()
  const usados = new Set<string>()
  const abrev = (w: string) => {
    const u = w.toUpperCase()
    if (u.includes("MOLINOS")) return "MOLINOS"
    if (u.includes("HARINERA") || u.includes("INDUPAN")) return "HARINERA"
    if (u.includes("AVIMOL")) return "AVIMOL"
    return w.substring(0, 12)
  }
  for (const g of grupos) {
    const rows = g.lineas.map((l) => ({
      Fecha: l.fecha ?? "",
      Orden: l.numeroorden,
      Placa: l.placa ?? "",
      Cliente: l.cliente ?? "",
      Producto: l.producto ?? "",
      Servicio: l.servicio,
      Cantidad: Number((Number(l.toneladas) || 0).toFixed(3)),
      Unidad: uLabel(l.unidad),
      Tarifa: l.tarifa,
      Valor: Math.round(Number(l.valor) || 0),
    }))
    rows.push({
      Fecha: "", Orden: "", Placa: "", Cliente: "", Producto: "", Servicio: "SUBTOTAL",
      Cantidad: Number(g.ton.toFixed(3)), Unidad: uLabel(g.lineas[0]?.unidad),
      Tarifa: "" as any, Valor: Math.round(g.valor),
    })
    let hoja = `${abrev(g.owner)} - ${g.operacion}`.substring(0, 31).replace(/[\\/?*[\]:]/g, "")
    let i = 2
    while (usados.has(hoja)) hoja = `${hoja.substring(0, 28)}(${i++})`
    usados.add(hoja)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), hoja || "Anexo")
  }
  XLSX.writeFile(wb, `Soporte_${nombre.replace(/[^a-zA-Z0-9]+/g, "_")}.xlsx`)
}

const emptyFiltros = (): FiltrosControl => ({
  desde: "",
  hasta: "",
  owner: "",
  tipooperaciones: [],
  categoria: null,
  cliente: "",
  placa: "",
})

// Vista inicial al abrir el módulo: piso GESTION_LIPGO_DESDE — el backlog
// anterior ya se facturó manual fuera de LIPgo (ver lib/facturacion-constantes.ts),
// así que no debe alarmar como "sin gestionar" al cargar. "Limpiar filtros"
// sigue yendo a emptyFiltros() (sin piso) para quien de verdad quiera ver todo
// el histórico a propósito — no se quita ninguna funcionalidad, solo cambia el
// punto de partida.
const defaultFiltros = (): FiltrosControl => ({ ...emptyFiltros(), desde: GESTION_LIPGO_DESDE })

export function CuadroControlFacturacion() {
  const { selectedEmpresaId, user } = useAuth() as any
  const { toast } = useToast()
  const [data, setData] = useState<ControlFacturacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<FiltrosControl>(defaultFiltros())
  const [filtros, setFiltros] = useState<FiltrosControl>(defaultFiltros())
  // Selector propio de PROYECTO/EMPRESA: la facturación es por ID. Arranca en la
  // empresa del selector global, pero se puede cambiar acá para facturar otro proyecto.
  const [empresas, setEmpresas] = useState<Array<{ id: number; nombre: string }>>([])
  const [empresaId, setEmpresaId] = useState<number | null>(selectedEmpresaId ?? null)
  // Prefactura interactiva: se elige (owner × servicio) qué facturar y se arma en pantalla.
  const [pref, setPref] = useState<Prefactura | null>(null)
  const [prefLoading, setPrefLoading] = useState(false)
  const [selKeys, setSelKeys] = useState<Set<string>>(new Set())
  const keyRes = (owner: string, servicio: string) => `${owner}|||${servicio}`
  // Guardar / retomar prefacturas (borrador → aprobada, luego Siigo).
  const [guardando, setGuardando] = useState(false)
  const [guardadas, setGuardadas] = useState<PrefacturaGuardada[]>([])
  const [obs, setObs] = useState("")
  const [expand, setExpand] = useState<Set<string>>(new Set()) // owner×servicio con detalle abierto
  const [verSoporteId, setVerSoporteId] = useState<number | null>(null) // prefactura guardada cuyo soporte se ve
  // Pestaña activa: controlada para que la tira del cierre pueda saltar a ella.
  const [tab, setTab] = useState("owner")

  // ¿El usuario ya eligió proyecto A MANO en este módulo? Si sí, el selector
  // global no se lo pisa.
  const eleccionManual = useRef(false)

  useEffect(() => {
    getAccessibleEmpresesFromPermisos()
      .then((list) => {
        setEmpresas(list)
        setEmpresaId((prev) => prev ?? selectedEmpresaId ?? list[0]?.id ?? null)
      })
      .catch(() => setEmpresas([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El selector GLOBAL resuelve DESPUÉS del primer render (el perfil llega
  // asíncrono), así que el efecto de arriba casi siempre lo encontraba en null
  // y caía en la primera empresa por orden alfabético. Cuando el global
  // resuelva (o cambie), el módulo lo adopta — salvo que el usuario ya haya
  // elegido proyecto a mano aquí.
  useEffect(() => {
    if (selectedEmpresaId && !eleccionManual.current) setEmpresaId(Number(selectedEmpresaId))
  }, [selectedEmpresaId])

  const cargar = useCallback(async () => {
    if (!empresaId) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const r = await getControlFacturacion(empresaId, filtros)
    if (r.success && r.data) setData(r.data)
    else toast({ title: "Error", description: r.message, variant: "destructive" })
    setLoading(false)
  }, [empresaId, filtros, toast])

  useEffect(() => {
    cargar()
  }, [cargar])

  const setF = (k: keyof FiltrosControl, v: any) => setPending((p) => ({ ...p, [k]: v }))
  const aplicar = () => setFiltros(pending)
  // La producción se calcula POR PERÍODO (la tolva y las horas extra son un día
  // a día), así que sin rango no se puede incluir. Este atajo evita que el
  // usuario tenga que armar el rango a mano solo para verla.
  const verMesActual = () => {
    const hoy = new Date()
    const p = (n: number) => String(n).padStart(2, "0")
    const ini = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-01`
    const fin = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate())}`
    const nuevos = { ...pending, desde: ini, hasta: fin, tipooperaciones: [], owner: "" }
    setPending(nuevos)
    setFiltros(nuevos)
  }
  const limpiar = () => {
    setPending(emptyFiltros())
    setFiltros(emptyFiltros())
  }

  const owners = useMemo(() => [...new Set((data?.porOwner || []).map((o) => o.owner))], [data])
  // Resumen agrupado por OWNER, con sus filas por operación y un subtotal por owner.
  const porOwnerGrupos = useMemo(() => {
    const m = new Map<string, { owner: string; filas: ControlFacturacion["porOwner"]; ordenes: number; toneladas: number; valor: number; fact: number; proc: number; sinG: number }>()
    for (const o of data?.porOwner || []) {
      const g = m.get(o.owner) || { owner: o.owner, filas: [] as ControlFacturacion["porOwner"], ordenes: 0, toneladas: 0, valor: 0, fact: 0, proc: 0, sinG: 0 }
      g.filas.push(o)
      g.ordenes += o.ordenes
      if (esTon(o.unidad)) g.toneladas += o.toneladas // las horas extra no son tonelaje
      g.valor += o.valor_a_facturar
      g.fact += o.val_facturado
      g.proc += o.val_en_proceso
      g.sinG += o.val_sin_gestionar
      m.set(o.owner, g)
    }
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor)
  }, [data])
  // Operaciones reales del proyecto seleccionado (para el filtro de Operación).
  const opcionesOperacion = useMemo(() => data?.operaciones || [], [data])

  const t = data?.totales
  // En Avimol el TRANSPORTE decide la condición de pago, así que el cuadro lo
  // muestra y separa por él. En los demás proyectos esas columnas no aportan.
  const hayTransporte = proyectoConReglaMedioPago(empresaId)

  const exportarDetalle = () => {
    if (!data) return
    const rows = data.filas.map((f) => ({
      Fecha: f.fecha ?? "",
      "Orden de cargue": f.numeroorden,
      Placa: f.placa ?? "",
      Tiquete: f.tiquete ?? "",
      Operación: f.tipooperacion ?? "",
      Owner: f.owner,
      Transporte: f.transporte ?? "",
      "Pago que corresponde": f.medioPagoEsperado ?? "",
      "Pago registrado": f.mediopago ?? "",
      "Pago no cuadra": f.medioPagoInconsistente ? "SÍ" : "",
      Cliente: f.cliente ?? "",
      Cantidad: Number(f.toneladas.toFixed(3)),
      Peso: f.fuente_peso === "bascula" ? "báscula" : "orden",
      Tarifa: f.sin_tarifa ? "SIN TARIFA" : f.tarifa,
      Total: Math.round(f.valor_a_facturar),
      Estado: f.estadofactura ?? "(sin gestionar)",
      Categoría: CAT_LABEL[f.categoria],
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Control Facturación")
    XLSX.writeFile(wb, `Control_Facturacion_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ---- PREFACTURA interactiva: se genera la data (owner × servicio) y el usuario
  // elige qué facturar; se refleja en una prefactura formateada + Excel. ----
  const generarPrefactura = async () => {
    if (!empresaId) {
      toast({ title: "Elige un proyecto", variant: "destructive" })
      return
    }
    setPrefLoading(true)
    const r = await getPrefactura(empresaId, {
      desde: filtros.desde,
      hasta: filtros.hasta,
      tipooperaciones: filtros.tipooperaciones,
    })
    setPrefLoading(false)
    if (!r.success || !r.data) {
      toast({ title: "Error", description: r.message, variant: "destructive" })
      return
    }
    setPref(r.data)
    setSelKeys(new Set(r.data.resumen.map((x) => keyRes(x.owner, x.operacion)))) // todo seleccionado
  }

  const toggleSel = (k: string) =>
    setSelKeys((prev) => {
      const n = new Set(prev)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })

  // Resumen SELECCIONADO, agrupado por owner (para la prefactura en pantalla).
  // Desglosa POR FACTURAR (verde) vs YA FACTURADO (rojo, no recobrar) para no cobrar doble.
  const prefSel = useMemo(() => {
    if (!pref) return null
    const rows = pref.resumen.filter((x) => selKeys.has(keyRes(x.owner, x.operacion)))
    type Grupo = {
      owner: string
      items: typeof rows
      ton: number
      total: number
      porFacturar: number
      facturado: number
      enProceso: number
      operacion: number // subtotal de lo que nace de órdenes de cargue
      produccion: number // subtotal de lo que se cobra por producción
    }
    const porOwner = new Map<string, Grupo>()
    for (const r of rows) {
      const g =
        porOwner.get(r.owner) ||
        ({ owner: r.owner, items: [] as any, ton: 0, total: 0, porFacturar: 0, facturado: 0, enProceso: 0, operacion: 0, produccion: 0 } as Grupo)
      g.items.push(r)
      if (esTon(r.unidad)) g.ton += r.toneladas // las horas extra no son tonelaje
      g.total += r.valor
      // Subtotales por bloque: cuánto de la factura es movimiento de órdenes y
      // cuánto es producción. Es la lectura que pide el cliente.
      if (r.bloque === "produccion") g.produccion += r.valor
      else g.operacion += r.valor
      g.porFacturar += r.valorPorFacturar
      g.facturado += r.valorFacturado
      g.enProceso += r.valorEnProceso
      porOwner.set(r.owner, g)
    }
    const grupos = Array.from(porOwner.values()).sort((a, b) => a.owner.localeCompare(b.owner))
    // Solo TONELADAS: las horas extra vienen en la misma columna con unidad "h"
    // y sumarlas al tonelaje daría un peso inventado.
    const totalTon = rows.reduce((s, r) => s + (esTon(r.unidad) ? r.toneladas : 0), 0)
    const totalVal = rows.reduce((s, r) => s + r.valor, 0)
    const totalPorFacturar = rows.reduce((s, r) => s + r.valorPorFacturar, 0)
    const totalFacturado = rows.reduce((s, r) => s + r.valorFacturado, 0)
    const totalEnProceso = rows.reduce((s, r) => s + r.valorEnProceso, 0)
    const totalProduccion = rows.reduce((s, r) => s + (r.bloque === "produccion" ? r.valor : 0), 0)
    const totalOperacion = totalVal - totalProduccion
    return {
      grupos,
      totalTon,
      totalVal,
      totalPorFacturar,
      totalFacturado,
      totalEnProceso,
      totalProduccion,
      totalOperacion,
      keys: new Set(rows.map((r) => keyRes(r.owner, r.operacion))),
    }
  }, [pref, selKeys])

  // SOPORTE (anexo) de la prefactura seleccionada: detalle de órdenes por
  // owner×operación MÁS el detalle de producción (día × producto / puesto), que
  // no tiene orden detrás pero igual hay que respaldarlo ante el cliente.
  const soporteLineas = useMemo<SoporteLinea[]>(() => {
    if (!pref || !prefSel) return []
    const deOrdenes = pref.origen
      // solo lo seleccionado y POR FACTURAR (sin factura Siigo) — igual que lo que se factura
      .filter((l) => prefSel.keys.has(keyRes(l.owner, l.tipooperacion || "(sin operación)")) && l.categoria !== "facturado")
      .map((l) => ({
        owner: l.owner,
        operacion: l.tipooperacion || "",
        servicio: l.servicio,
        fecha: l.fechacargue,
        numeroorden: l.numeroorden,
        placa: l.placa,
        cliente: l.cliente,
        producto: l.producto,
        toneladas: Number((l.toneladas || 0).toFixed(3)),
        tarifa: l.tarifaServicio,
        valor: Math.round(l.valorServicio),
        unidad: "t" as const,
      }))
    const deProduccion = (pref.soporteProduccion || []).filter((l) => prefSel.keys.has(keyRes(l.owner, l.operacion)))
    return [...deOrdenes, ...deProduccion]
  }, [pref, prefSel])

  // Detalle de producción de un concepto (lo que respalda una línea sin orden).
  const detalleProduccionDe = (owner: string, operacion: string) =>
    (pref?.soporteProduccion || []).filter((l) => l.owner === owner && l.operacion === operacion)

  // Descarga la prefactura SELECCIONADA, bien formateada (encabezado por owner,
  // filas de servicio con nombre/tipo operación, subtotales, total) + TABLA ORIGEN.
  const descargarPrefacturaExcel = () => {
    if (!pref || !prefSel) return
    const proyecto = empresas.find((e) => e.id === empresaId)?.nombre || `Empresa ${empresaId}`
    const rango = `${filtros.desde || "inicio"} a ${filtros.hasta || "fin"}`
    // Hoja PREFACTURA (formateada, por owner).
    const aoa: any[][] = [
      ["PREFACTURA"],
      ["Proyecto", proyecto],
      ["Período", rango],
      [],
      ["Owner", "Concepto", "Cantidad", "Unidad", "Tarifa", "Total", "Origen"],
    ]
    for (const g of prefSel.grupos) {
      for (const it of g.items) {
        aoa.push([
          g.owner,
          it.operacion,
          Number(it.toneladas.toFixed(3)),
          uLabel(it.unidad),
          it.tarifa,
          Math.round(it.valor),
          it.bloque === "produccion" ? "Producción" : "Movimiento de órdenes",
        ])
      }
      aoa.push(["", `Subtotal ${g.owner}`, Number(g.ton.toFixed(3)), "t", "", Math.round(g.total), ""])
      aoa.push([])
    }
    aoa.push(["", "TOTAL PREFACTURA", Number(prefSel.totalTon.toFixed(3)), "t", "", Math.round(prefSel.totalVal), ""])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "PREFACTURA")
    // TABLA ORIGEN de lo SELECCIONADO (soporte).
    const origen = pref.origen
      .filter((l) => prefSel.keys.has(keyRes(l.owner, l.tipooperacion || "(sin operación)")))
      .map((l) => ({
        "Fecha Orden": l.fechaorden ?? "",
        "Fecha Cargue": l.fechacargue ?? "",
        Cliente: l.cliente ?? "",
        "N° Orden": l.numeroorden,
        "Tiquete Báscula": l.tiquete ?? "",
        Placa: l.placa ?? "",
        Producto: l.producto ?? "",
        "Peso Báscula": l.pesobascula,
        Toneladas: Number(l.toneladas.toFixed(3)),
        Owner: l.owner,
        Servicio: l.servicio,
        Transporte: l.transporte ?? "",
        "Tipo Operación": l.tipooperacion ?? "",
        Tarifa: l.tarifa,
        "Valor a Facturar": Math.round(l.valor_a_facturar),
      }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(origen), "TABLA ORIGEN")
    // La PRODUCCIÓN no tiene orden de cargue: su respaldo es el día a día, y va
    // en su propia hoja para que el anexo del cliente esté completo.
    const prod = (pref.soporteProduccion || [])
      .filter((l) => prefSel.keys.has(keyRes(l.owner, l.operacion)))
      .map((l) => ({
        Fecha: l.fecha ?? "",
        Owner: l.owner,
        Concepto: l.operacion,
        Tipo: l.servicio,
        Detalle: l.producto ?? "",
        Cantidad: Number((Number(l.toneladas) || 0).toFixed(3)),
        Unidad: uLabel(l.unidad),
        Tarifa: l.tarifa,
        Valor: Math.round(Number(l.valor) || 0),
      }))
    if (prod.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prod), "PRODUCCION")
    XLSX.writeFile(wb, `Prefactura_${proyecto.replace(/[^a-zA-Z0-9]+/g, "_")}.xlsx`)
  }

  // Cargar prefacturas guardadas del proyecto.
  const cargarGuardadas = useCallback(async () => {
    if (!empresaId) {
      setGuardadas([])
      return
    }
    const r = await listarPrefacturas(empresaId)
    if (r.success) setGuardadas(r.data)
  }, [empresaId])
  useEffect(() => {
    cargarGuardadas()
  }, [cargarGuardadas])

  // Guardar la prefactura SELECCIONADA como borrador (para retomar/aprobar → Siigo).
  const guardarBorrador = async () => {
    if (!empresaId || !prefSel || prefSel.grupos.length === 0) {
      toast({ title: "Nada que guardar", description: "Genera y selecciona qué facturar.", variant: "destructive" })
      return
    }
    // Se guarda SOLO lo POR FACTURAR (sin factura Siigo) para no cobrar doble.
    const lineas = prefSel.grupos
      .flatMap((g) =>
        g.items
          .filter((it) => it.valorPorFacturar > 0)
          .map((it) => ({
            owner: g.owner,
            servicio: it.operacion,
            toneladas: Number(it.tonPorFacturar.toFixed(3)),
            tarifa: it.tarifa,
            total: Math.round(it.valorPorFacturar),
            fuente: it.fuente,
            unidad: it.unidad,
          })),
      )
    if (lineas.length === 0) {
      toast({ title: "Nada por facturar", description: "Todo lo seleccionado ya tiene factura Siigo.", variant: "destructive" })
      return
    }
    setGuardando(true)
    const proyecto = empresas.find((e) => e.id === empresaId)?.nombre || `Empresa ${empresaId}`
    // Soporte CONGELADO = detalle de órdenes de lo por facturar (respaldo fiel).
    const soporte = soporteLineas.filter((l) => l.valor > 0)
    const r = await guardarPrefactura({
      idempresa: empresaId,
      proyecto,
      periodo_desde: filtros.desde || null,
      periodo_hasta: filtros.hasta || null,
      lineas,
      soporte,
      total: Math.round(prefSel.totalPorFacturar),
      // Solo tonelaje real: las horas extra van en la misma columna con unidad "h".
      toneladas: Number(lineas.reduce((s, l) => s + (esTon(l.unidad) ? l.toneladas : 0), 0).toFixed(3)),
      usuario: user?.email || user?.nombre || null,
      observacion: obs || null,
    })
    setGuardando(false)
    if (r.success) {
      toast({ title: "Prefactura guardada", description: `Borrador #${r.id} guardado.` })
      setObs("")
      cargarGuardadas()
    } else {
      toast({ title: "No se pudo guardar", description: r.message, variant: "destructive" })
    }
  }

  const aprobar = async (id: number, estado: "borrador" | "aprobada") => {
    const r = await cambiarEstadoPrefactura(id, estado)
    if (r.success) {
      toast({ title: estado === "aprobada" ? "Prefactura aprobada" : "Reabierta a borrador" })
      cargarGuardadas()
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const borrar = async (id: number) => {
    const r = await eliminarPrefactura(id)
    if (r.success) {
      toast({ title: "Borrador eliminado" })
      cargarGuardadas()
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const toggleExpand = (k: string) =>
    setExpand((prev) => {
      const n = new Set(prev)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })

  // Órdenes (líneas origen) detrás de un owner×servicio, para navegar el detalle.
  const detalleDe = (owner: string, operacion: string) =>
    (pref?.origen || []).filter((l) => l.owner === owner && (l.tipooperacion || "(sin operación)") === operacion)

  const proyectoNombre = empresas.find((e) => e.id === empresaId)?.nombre || `Empresa ${empresaId}`

  // Anexos por OWNER × TIPO DE OPERACIÓN (una hoja por cada combinación, para
  // facturar cada ID por operación sin mezclar). Cada hoja lleva su subtotal.
  const exportarAnexos = () => {
    if (!data) return
    const abrev = (w: string) => {
      const u = w.toUpperCase()
      if (u.includes("MOLINOS")) return "MOLINOS"
      if (u.includes("HARINERA") || u.includes("INDUPAN")) return "HARINERA"
      if (u.includes("AVIMOL")) return "AVIMOL"
      return w.substring(0, 12)
    }
    // Agrupar filas por owner × operación, en orden estable.
    const grupos = new Map<string, { owner: string; op: string; filas: typeof data.filas }>()
    for (const f of data.filas) {
      const op = f.tipooperacion || "(sin op)"
      const k = `${f.owner}|||${op}`
      const g = grupos.get(k) || { owner: f.owner, op, filas: [] as any }
      g.filas.push(f)
      grupos.set(k, g)
    }
    const wb = XLSX.utils.book_new()
    const nombresUsados = new Set<string>()
    for (const g of Array.from(grupos.values()).sort((a, b) => a.owner.localeCompare(b.owner) || a.op.localeCompare(b.op))) {
      let subTon = 0
      let subVal = 0
      const rows = g.filas.map((f) => {
        subTon += f.toneladas
        subVal += f.valor_a_facturar
        return {
          Fecha: f.fecha ?? "",
          "Orden de cargue": f.numeroorden,
          Placa: f.placa ?? "",
          Tiquete: f.tiquete ?? "",
          Owner: f.owner,
          Operación: f.tipooperacion ?? "",
          Cliente: f.cliente ?? "",
          Cantidad: Number(f.toneladas.toFixed(3)),
          Tarifa: f.sin_tarifa ? "SIN TARIFA" : f.tarifa,
          Total: Math.round(f.valor_a_facturar),
          Estado: f.estadofactura ?? "(sin gestionar)",
        }
      })
      rows.push({
        Fecha: "", "Orden de cargue": "", Placa: "", Tiquete: "", Owner: "", Operación: "SUBTOTAL",
        Cliente: "", Cantidad: Number(subTon.toFixed(3)), Tarifa: "" as any, Total: Math.round(subVal), Estado: "",
      })
      // Nombre de hoja único, <=31 chars, sin caracteres inválidos.
      let nombre = `${abrev(g.owner)} - ${g.op}`.substring(0, 31).replace(/[\\/?*[\]:]/g, "")
      let i = 2
      while (nombresUsados.has(nombre)) nombre = `${nombre.substring(0, 28)}(${i++})`
      nombresUsados.add(nombre)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), nombre || "Anexo")
    }
    XLSX.writeFile(wb, `Anexos_por_owner_operacion_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-4">
      {/* Cierre del día, SIEMPRE visible y por encima de los filtros. Sigue el
          selector DEL MÓDULO (pedido expreso de gerencia): muestra el proyecto
          elegido; sin proyecto elegido, suma todos los accesibles. Su botón de
          alertas lleva a la pestaña del detalle. */}
      <CierreDiarioTira empresaId={empresaId} onVerDetalle={() => setTab("cierre")} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-lg">Cuadro de Control de Facturación</CardTitle>
            {/* Selector de PROYECTO/EMPRESA a facturar (por ID). */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Proyecto</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-medium"
                value={empresaId ?? ""}
                onChange={(e) => {
                  eleccionManual.current = true
                  setEmpresaId(e.target.value ? Number(e.target.value) : null)
                }}
              >
                <option value="">— elegir —</option>
                {empresas.map((em) => (
                  <option key={em.id} value={em.id}>
                    {em.nombre} (ID {em.id})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportarDetalle} disabled={!data || data.filas.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Detalle
            </Button>
            <Button size="sm" variant="outline" onClick={exportarAnexos} disabled={!data || data.filas.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Anexos owner+operación
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Fuente de verdad: <strong>órdenes de servicio procesadas</strong> del proyecto seleccionado, cruzadas con
            lo facturado. En <span className="font-semibold text-red-600">rojo</span> lo que quedó{" "}
            <strong>sin gestionar</strong> (procesado sin facturar) o <strong>sin tarifa</strong>.
            {" "}Vista inicial desde {GESTION_LIPGO_DESDE} (lo anterior ya se facturó manual) — cambia "Desde" para
            ver el histórico completo.
          </p>

          {/* Filtros */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={pending.desde ?? ""} onChange={(e) => setF("desde", e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={pending.hasta ?? ""} onChange={(e) => setF("hasta", e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Owner</Label>
              <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={pending.owner ?? ""} onChange={(e) => setF("owner", e.target.value)}>
                <option value="">Todos</option>
                {owners.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={pending.categoria ?? ""} onChange={(e) => setF("categoria", (e.target.value || null) as CategoriaFactura | null)}>
                <option value="">Todos</option>
                <option value="facturado">Facturado</option>
                <option value="en_proceso">En proceso</option>
                <option value="sin_gestionar">Sin gestionar</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Input value={pending.cliente ?? ""} onChange={(e) => setF("cliente", e.target.value)} placeholder="Cliente" className="h-8 text-xs" />
            </div>
          </div>

          {/* Operación: multi-selección con chips. Usa las operaciones REALES del
              proyecto seleccionado (selector de proyecto de arriba, no el global). */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs">Operación</Label>
              <span className="text-[11px] text-muted-foreground">
                {(pending.tipooperaciones?.length || 0) === 0
                  ? "todas"
                  : `${pending.tipooperaciones!.length} seleccionada(s)`}
              </span>
              {(pending.tipooperaciones?.length || 0) > 0 && (
                <button className="text-[11px] text-primary hover:underline" onClick={() => setF("tipooperaciones", [])}>
                  ver todas
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {opcionesOperacion.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  {empresaId ? "El proyecto no tiene operaciones procesadas." : "Selecciona un proyecto para ver sus operaciones."}
                </span>
              ) : (
                opcionesOperacion.map((o) => {
                  const sel = (pending.tipooperaciones || []).includes(o)
                  const esProd = o === OP_PRODUCCION
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => {
                        const cur = pending.tipooperaciones || []
                        setF("tipooperaciones", sel ? cur.filter((x) => x !== o) : [...cur, o])
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        sel
                          ? esProd
                            ? "border-sky-600 bg-sky-600 text-white"
                            : "border-primary bg-primary text-primary-foreground"
                          : esProd
                            ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"
                            : "border-input bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {esProd ? OP_PRODUCCION_LABEL : o}
                    </button>
                  )
                })
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Sin marcar = todas. Para la factura del owner en cedis marca solo Cargue + Distribucion (deja fuera los descargues).
              <strong> Producción</strong> aísla lo que se cobra por producción (tolva y horas extra); necesita rango de fechas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8" onClick={aplicar}>
              <Filter className="mr-1 h-3 w-3" /> Aplicar
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={limpiar}>
              <RotateCcw className="mr-1 h-3 w-3" /> Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* El cierre es cross-proyecto, así que va FUERA de las guardas de abajo:
          si el proyecto seleccionado no tiene órdenes, el cierre del día debe
          seguir estando. Solo se muestra cuando su pestaña está activa. */}
      {tab === "cierre" || tab === "financiero" ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="owner">Resumen por owner</TabsTrigger>
            <TabsTrigger value="detalle">Detalle por orden</TabsTrigger>
            <TabsTrigger value="prefactura">Prefactura</TabsTrigger>
            <TabsTrigger value="cierre">Cierre de facturación</TabsTrigger>
            <TabsTrigger value="financiero">Cierre Financiero</TabsTrigger>
          </TabsList>
          <TabsContent value="cierre" className="mt-4">
            <CierreDiarioPanel empresaId={empresaId} />
          </TabsContent>
          <TabsContent value="financiero" className="mt-4">
            {/* Sincroniza con el filtro Desde/Hasta del Cuadro (el que ordena
                Resumen por owner/Detalle/Prefactura), para no tener dos
                fechas distintas dentro del mismo módulo sin relación. */}
            <CierreFinanciero empresaId={empresaId} filtroFecha={filtros.hasta || filtros.desde || null} />
          </TabsContent>
        </Tabs>
      ) : loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Cruzando órdenes con la facturación…
          </CardContent>
        </Card>
      ) : !empresaId ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Selecciona un proyecto/empresa para ver su control de facturación.
          </CardContent>
        </Card>
      ) : !data || (data.filas.length === 0 && data.porOwner.length === 0) ? (
        // El vacío se mide contra el resumen, no solo contra las órdenes: al
        // filtrar por "Producción" no hay filas de orden y esto escondería
        // justamente lo que se quiso ver.
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No hay nada facturable para este proyecto con los filtros aplicados.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tarjetas resumen. La de PRODUCCIÓN solo aparece en los proyectos que
              facturan por producción: en los demás sería una tarjeta en $0. */}
          <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${t!.val_produccion > 0 ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
            <StatCard
              l="Valor a facturar"
              v={money(t!.valor_a_facturar)}
              sub={t!.val_produccion > 0 ? `${t!.ordenes} órdenes + producción` : `${t!.ordenes} órdenes`}
            />
            {t!.val_produccion > 0 && (
              <StatCard l="Producción" v={money(t!.val_produccion)} icon={FileText} color="text-sky-600" sub="incluido arriba" />
            )}
            <StatCard l="Facturado" v={money(t!.val_facturado)} icon={CheckCircle2} color="text-emerald-600" />
            <StatCard l="En proceso" v={money(t!.val_en_proceso)} icon={Clock} color="text-amber-600" />
            <StatCard l="Sin gestionar" v={money(t!.val_sin_gestionar)} icon={AlertTriangle} color="text-red-600" sub={`${t!.ordenes_sin_gestionar} órdenes 🔴`} rojo={t!.val_sin_gestionar > 0} />
            <StatCard l="Órdenes sin tarifa" v={String(t!.ordenes_sin_tarifa)} icon={AlertTriangle} color="text-red-600" sub="revisar maestro" rojo={t!.ordenes_sin_tarifa > 0} />
            {hayTransporte && (
              <StatCard
                l="Pago que no cuadra"
                v={String(t!.ordenes_medio_pago)}
                icon={AlertTriangle}
                color="text-red-600"
                sub="TERCEROS=contado · ZAMUDIO=crédito"
                rojo={t!.ordenes_medio_pago > 0}
              />
            )}
          </div>

          {/* Por qué la producción está (o no está) sumando. Va arriba del todo
              porque su ausencia es silenciosa: sin esto el módulo parece completo
              cuando le falta la mitad de lo que se le cobra al cliente. */}
          {data.produccionAviso && (
            <Card className="border-amber-300 bg-amber-50/70 dark:bg-amber-950/20">
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {data.produccionAviso}
                </span>
                {!filtros.desde && (
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={verMesActual}>
                    <Filter className="mr-1 h-3 w-3" /> Ver el mes actual
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          {!data.produccionAviso && data.produccionNota && t!.val_produccion > 0 && (
            <Card className="border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/20">
              <CardContent className="flex items-start gap-2 p-3 text-xs text-sky-900 dark:text-sky-200">
                <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>Producción:</strong> {data.produccionNota}
                </span>
              </CardContent>
            </Card>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="owner">Resumen por owner</TabsTrigger>
              <TabsTrigger value="detalle">Detalle por orden</TabsTrigger>
              <TabsTrigger value="prefactura">Prefactura</TabsTrigger>
              <TabsTrigger value="cierre">Cierre de facturación</TabsTrigger>
              <TabsTrigger value="financiero">Cierre Financiero</TabsTrigger>
            </TabsList>

            <TabsContent value="owner">
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Owner</TableHead>
                        {hayTransporte && <TableHead>Transporte</TableHead>}
                        {hayTransporte && <TableHead>Pago</TableHead>}
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Órdenes</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Valor a facturar</TableHead>
                        <TableHead className="text-right">Facturado</TableHead>
                        <TableHead className="text-right">En proceso</TableHead>
                        <TableHead className="text-right">Sin gestionar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {porOwnerGrupos.map((g) => (
                        <Fragment key={g.owner}>
                          {g.filas.map((o, i) => (
                            <TableRow key={`${o.owner}-${o.operacion}-${o.transporte ?? ""}`} className={o.bloque === "produccion" ? "bg-sky-50/50 dark:bg-sky-950/10" : ""}>
                              <TableCell className="font-medium">{i === 0 ? g.owner : ""}</TableCell>
                              {hayTransporte && (
                                <TableCell className="text-xs font-medium">{o.transporte ?? "—"}</TableCell>
                              )}
                              {hayTransporte && (
                                <TableCell className="text-xs">
                                  {o.medioPagoEsperado ? (
                                    <span className="inline-flex items-center gap-1.5">
                                      <span
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                          o.medioPagoEsperado === "Contado"
                                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                            : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                                        }`}
                                      >
                                        {o.medioPagoEsperado}
                                      </span>
                                      {o.ordenesInconsistentes > 0 && (
                                        <span
                                          className="text-[10px] font-semibold text-red-600"
                                          title={`${o.ordenesInconsistentes} orden(es) registradas con otra condición de pago`}
                                        >
                                          ⚠ {o.ordenesInconsistentes}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">sin regla</span>
                                  )}
                                </TableCell>
                              )}
                              <TableCell className="text-xs">
                                <span className="inline-flex items-center gap-1.5">
                                  {o.operacion}
                                  {o.bloque === "produccion" && (
                                    <span className="rounded bg-sky-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                                      producción
                                    </span>
                                  )}
                                </span>
                              </TableCell>
                              {/* La producción no se mide en órdenes: mostrar 0 haría pensar
                                  que falta información, cuando simplemente no aplica. */}
                              <TableCell className="text-right tabular-nums">{o.ordenes > 0 ? o.ordenes : "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {ton(o.toneladas)} <span className="text-[9px] text-muted-foreground">{uLabel(o.unidad)}</span>
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{money(o.valor_a_facturar)}</TableCell>
                              {o.bloque === "produccion" ? (
                                // El semáforo se apoya en la factura Siigo de la orden, y la
                                // producción no tiene orden: no aplica, no es un cero.
                                <TableCell colSpan={3} className="text-right text-[11px] text-muted-foreground">
                                  sin semáforo de factura (no nace de una orden)
                                </TableCell>
                              ) : (
                                <>
                                  <TableCell className="text-right tabular-nums text-emerald-700">{money(o.val_facturado)}</TableCell>
                                  <TableCell className="text-right tabular-nums text-amber-700">{money(o.val_en_proceso)}</TableCell>
                                  <TableCell className={`text-right tabular-nums font-semibold ${o.val_sin_gestionar > 0 ? "bg-red-50 text-red-700 dark:bg-red-950/40" : "text-muted-foreground"}`}>
                                    {money(o.val_sin_gestionar)}
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          ))}
                          {g.filas.length > 1 && (
                            <TableRow className="border-t bg-muted/40">
                              <TableCell className="font-semibold">{g.owner}</TableCell>
                              {hayTransporte && <TableCell colSpan={2} />}
                              <TableCell className="text-xs font-semibold">Subtotal</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{g.ordenes}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{ton(g.toneladas)}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{money(g.valor)}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums text-emerald-700">{money(g.fact)}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums text-amber-700">{money(g.proc)}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{money(g.sinG)}</TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="detalle">
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Orden</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Placa</TableHead>
                        <TableHead>Tiquete</TableHead>
                        <TableHead>Operación</TableHead>
                        <TableHead>Owner</TableHead>
                        {hayTransporte && <TableHead>Transporte</TableHead>}
                        {hayTransporte && <TableHead>Pago</TableHead>}
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Tarifa</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Factura</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.filas.slice(0, 500).map((f, i) => {
                        const rojo = f.categoria === "sin_gestionar" || f.sin_tarifa
                        return (
                          <TableRow key={`${f.numeroorden}-${f.owner}-${i}`} className={f.medioPagoInconsistente ? "bg-amber-50 dark:bg-amber-950/25" : rojo ? "bg-red-50 dark:bg-red-950/30" : ""}>
                            <TableCell className="text-xs font-medium">{f.numeroorden}</TableCell>
                            <TableCell className="text-xs">{f.fecha ?? "-"}</TableCell>
                            <TableCell className="text-xs">{f.placa ?? "-"}</TableCell>
                            <TableCell className="text-xs">{f.tiquete ?? "-"}</TableCell>
                            <TableCell className="text-xs">{f.tipooperacion ?? "-"}</TableCell>
                            <TableCell className="text-xs">{f.owner}</TableCell>
                            {hayTransporte && <TableCell className="text-xs font-medium">{f.transporte ?? "-"}</TableCell>}
                            {hayTransporte && (
                              <TableCell className="text-xs">
                                {f.medioPagoEsperado ? (
                                  <span className="inline-flex flex-col leading-tight">
                                    <span
                                      className={`font-semibold ${
                                        f.medioPagoEsperado === "Contado" ? "text-emerald-700" : "text-indigo-700"
                                      }`}
                                    >
                                      {f.medioPagoEsperado}
                                    </span>
                                    {/* Solo se muestra lo registrado cuando CONTRADICE la
                                        regla: si coincide, repetirlo es ruido. */}
                                    {f.medioPagoInconsistente && (
                                      <span className="text-[10px] font-semibold text-red-600">
                                        registrado: {f.mediopago}
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">{f.mediopago ?? "-"}</span>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="text-xs">{f.cliente ?? "-"}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {ton(f.toneladas)}
                              <span className="ml-1 text-[9px] text-muted-foreground">{f.fuente_peso === "bascula" ? "bás" : "ord"}</span>
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {f.sin_tarifa ? <span className="font-semibold text-red-600">sin tarifa</span> : money(f.tarifa || 0)}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{money(f.valor_a_facturar)}</TableCell>
                            <TableCell className="text-xs">
                              <span className="inline-flex items-center gap-1.5">
                                <Semaforo c={f.categoria} showLabel />
                                {f.categoria !== "facturado" && f.estadofactura && (
                                  <span className="text-[10px] text-muted-foreground">({f.estadofactura})</span>
                                )}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  {data.filas.length > 500 && (
                    <p className="p-3 text-xs text-muted-foreground">
                      Mostrando 500 de {data.filas.length.toLocaleString("es-CO")} filas. Usa filtros o exporta el detalle
                      completo.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* PREFACTURA: se arma como DOCUMENTO en pantalla; se elige qué incluir,
                se guarda como borrador y se aprueba (luego se enlaza a Siigo). */}
            <TabsContent value="prefactura" className="space-y-4">
              {/* Barra de acciones */}
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-base font-bold">Prefactura</div>
                      <div className="text-xs text-muted-foreground">
                        Se arma con las <strong>órdenes procesadas del período</strong> por <strong>owner y tipo de operación</strong>, más los{" "}
                        <strong>conceptos de producción del proyecto</strong>, cada uno con su tarifa. Elige qué
                        incluir, revísala abajo, <strong>guárdala</strong> y <strong>apruébala</strong> (luego se enlaza a Siigo).
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={generarPrefactura} disabled={prefLoading}>
                        {prefLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                        {pref ? "Actualizar" : "Generar prefactura"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={guardarBorrador} disabled={guardando || !prefSel || prefSel.grupos.length === 0}>
                        {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Guardar borrador
                      </Button>
                      <Button size="sm" variant="outline" onClick={descargarPrefacturaExcel} disabled={!pref || !prefSel || prefSel.keys.size === 0}>
                        <Download className="mr-2 h-4 w-4" /> Excel
                      </Button>
                    </div>
                  </div>

                  {/* Cargue que NO entra en este documento porque la placa no es del
                      proyecto. Va arriba y con el monto, porque es la diferencia
                      entre lo procesado y lo facturado: si no se ve, parece un faltante. */}
                  {pref?.exclusionCarguePlaca && (
                    <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/40">
                      <div className="mb-1 flex items-center gap-1.5 font-semibold">
                        <FileText className="h-3.5 w-3.5" />
                        Cargue que no se le factura a {proyectoNombre}: {pref.exclusionCarguePlaca.ordenes} órdenes ·{" "}
                        {ton(pref.exclusionCarguePlaca.toneladas)} t · {money(pref.exclusionCarguePlaca.valor)}
                      </div>
                      <p className="text-muted-foreground">{pref.exclusionCarguePlaca.nota}</p>
                      <ul className="mt-1 ml-4 list-disc">
                        {pref.exclusionCarguePlaca.porTransporte.map((x) => (
                          <li key={x.transporte}>
                            <strong>{x.transporte}</strong>: {x.ordenes} órdenes · {money(x.valor)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Cómo se factura la PRODUCCIÓN de este proyecto. Se muestra siempre
                      (incluso cuando ya viene en las órdenes) para que quede explícito
                      por qué el concepto suma aparte o no. */}
                  {pref?.produccionNota && (
                    <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-200">
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        <strong>Producción de {proyectoNombre}:</strong> {pref.produccionNota}
                        {pref.produccionDesde && (
                          <>
                            {" "}
                            <strong>
                              {pref.produccionVigencia === "si"
                                ? `Este período está dentro de la vigencia (desde ${pref.produccionDesde}): la producción sí suma en su bloque.`
                                : pref.produccionVigencia === "parcial"
                                  ? `Ojo: el rango se monta sobre el ${pref.produccionDesde}.`
                                  : `Este período es anterior al ${pref.produccionDesde}: se factura tal como se venía facturando.`}
                            </strong>
                          </>
                        )}
                      </span>
                    </div>
                  )}

                  {pref && pref.produccionAlertas.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                      <div className="mb-1 flex items-center gap-1.5 font-semibold">
                        <AlertTriangle className="h-3.5 w-3.5" /> Revisar antes de facturar ({pref.produccionAlertas.length})
                      </div>
                      <ul className="ml-4 list-disc space-y-0.5">
                        {pref.produccionAlertas.slice(0, 15).map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                      {pref.produccionAlertas.length > 15 && (
                        <p className="mt-1 text-[11px]">
                          … y {pref.produccionAlertas.length - 15} más. El detalle completo está en Conciliación Avimol.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Selección compacta de qué incluir */}
                  {pref && (
                    <div className="rounded-md border">
                      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          ¿Qué facturar? ({selKeys.size}/{pref.resumen.length} conceptos)
                        </span>
                        <div className="flex gap-3 text-xs">
                          <button className="text-primary hover:underline" onClick={() => setSelKeys(new Set(pref.resumen.map((x) => keyRes(x.owner, x.operacion))))}>
                            Todo
                          </button>
                          <button className="text-primary hover:underline" onClick={() => setSelKeys(new Set())}>
                            Nada
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-x-6 gap-y-1 p-3 sm:grid-cols-2 lg:grid-cols-3">
                        {pref.resumen.map((x) => {
                          const k = keyRes(x.owner, x.operacion)
                          const soloFacturado = x.valorPorFacturar === 0 && x.valorFacturado > 0
                          return (
                            <label key={k} className={`flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50 ${selKeys.has(k) ? "" : "opacity-50"}`}>
                              <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={selKeys.has(k)} onChange={() => toggleSel(k)} />
                              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${soloFacturado ? "bg-red-500" : x.valorFacturado > 0 ? "bg-amber-400" : "bg-emerald-500"}`} />
                              <span className="flex-1 truncate">
                                <span className="font-medium">{x.owner}</span> · {x.operacion}
                                {x.bloque === "produccion" && (
                                  <span className="ml-1 rounded bg-sky-100 px-1 py-px text-[9px] font-semibold uppercase text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                                    prod
                                  </span>
                                )}
                                {soloFacturado && <span className="ml-1 text-[10px] text-red-500">(ya facturado)</span>}
                              </span>
                              <span className="tabular-nums text-emerald-700">{money(x.valorPorFacturar)}</span>
                            </label>
                          )
                        })}
                      </div>
                      <div className="border-t px-3 py-2">
                        <Input
                          value={obs}
                          onChange={(e) => setObs(e.target.value)}
                          placeholder="Observación (opcional) para el borrador guardado"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* DOCUMENTO de prefactura en pantalla */}
              {!pref ? (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    Genera la prefactura para armarla aquí.
                  </CardContent>
                </Card>
              ) : !prefSel || prefSel.grupos.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    Marca al menos un concepto arriba para armar la prefactura.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-6">
                    {/* Encabezado del documento */}
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" /> Prefactura
                        </div>
                        <div className="mt-1 text-xl font-bold">{proyectoNombre}</div>
                        <div className="text-xs text-muted-foreground">
                          ID {empresaId} · Período {filtros.desde || "inicio"} → {filtros.hasta || "fin"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5 text-xs uppercase tracking-wide text-emerald-700">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Por facturar
                        </div>
                        <div className="text-2xl font-extrabold tabular-nums text-emerald-600">{money(prefSel.totalPorFacturar)}</div>
                        <div className="text-xs text-muted-foreground">
                          {ton(prefSel.totalTon)} t · Total {money(prefSel.totalVal)}
                        </div>
                        {prefSel.totalFacturado > 0 && (
                          <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] text-red-600">
                            <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Ya facturado (no recobrar): {money(prefSel.totalFacturado)}
                          </div>
                        )}
                      </div>
                    </div>

                    {prefSel.totalFacturado > 0 && (
                      <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/20">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          Hay <strong>{money(prefSel.totalFacturado)}</strong> con factura Siigo ya emitida (marcado en rojo).
                          No lo incluyas en la nueva factura para <strong>no cobrar doble</strong>.
                        </span>
                      </div>
                    )}

                    {/* Cuerpo: un bloque por owner, con detalle navegable por servicio */}
                    <div className="space-y-5">
                      {prefSel.grupos.map((g) => (
                        <div key={g.owner}>
                          <div className="mb-1 text-sm font-bold text-foreground">{g.owner}</div>
                          <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                                  <th className="py-1.5 pl-2 font-medium">Concepto</th>
                                  <th className="py-1.5 text-right font-medium">Cantidad</th>
                                  <th className="py-1.5 text-right font-medium">Tarifa</th>
                                  <th className="py-1.5 text-right font-medium">Por facturar</th>
                                  <th className="py-1.5 pr-3 text-right font-medium">Total</th>
                                  <th className="w-6"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.items.map((it) => {
                                  const k = keyRes(it.owner, it.operacion)
                                  const abierto = expand.has(k)
                                  // `bloque` decide cómo se presenta; `fuente`, de dónde sale el
                                  // respaldo. La tolva de Indupan suma como producción pero su
                                  // detalle sigue siendo el de las órdenes.
                                  const esBloqueProd = it.bloque === "produccion"
                                  const esProd = it.fuente === "produccion"
                                  const det = abierto && !esProd ? detalleDe(it.owner, it.operacion) : []
                                  const detProd = abierto && esProd ? detalleProduccionDe(it.owner, it.operacion) : []
                                  return (
                                    <Fragment key={k}>
                                      <tr
                                        className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                                        onClick={() => toggleExpand(k)}
                                      >
                                        <td className="py-1.5 pl-2">
                                          <span className="inline-flex items-center gap-1">
                                            <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${abierto ? "rotate-90" : ""}`} />
                                            {it.operacion}
                                            {esBloqueProd && (
                                              <span className="rounded bg-sky-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                                                producción
                                              </span>
                                            )}
                                          </span>
                                        </td>
                                        <td className="py-1.5 text-right tabular-nums">
                                          {ton(it.toneladas)}
                                          {!esTon(it.unidad) && <span className="ml-1 text-[9px] text-muted-foreground">{uLabel(it.unidad)}</span>}
                                        </td>
                                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{money(it.tarifa)}</td>
                                        <td className="py-1.5 text-right tabular-nums">
                                          <span className="inline-flex items-center justify-end gap-1.5">
                                            <span className={`inline-block h-2 w-2 rounded-full ${it.valorFacturado > 0 ? "bg-red-500" : "bg-emerald-500"}`} />
                                            <span className={it.valorFacturado > 0 && it.valorPorFacturar === 0 ? "text-red-600" : "text-emerald-700"}>
                                              {money(it.valorPorFacturar)}
                                            </span>
                                          </span>
                                          {it.valorFacturado > 0 && (
                                            <div className="text-[10px] text-red-500">fact. {money(it.valorFacturado)}</div>
                                          )}
                                        </td>
                                        <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{money(it.valor)}</td>
                                        <td></td>
                                      </tr>
                                      {abierto && !esProd && (
                                        <tr className="bg-muted/20">
                                          <td colSpan={6} className="px-2 py-2">
                                            <div className="max-h-64 overflow-auto rounded border bg-background">
                                              <table className="w-full text-[11px]">
                                                <thead>
                                                  <tr className="border-b text-left text-muted-foreground">
                                                    <th className="py-1 pl-2 font-medium">Factura</th>
                                                    <th className="py-1 font-medium">Fecha</th>
                                                    <th className="py-1 font-medium">Orden</th>
                                                    <th className="py-1 font-medium">Placa</th>
                                                    <th className="py-1 font-medium">Cliente</th>
                                                    <th className="py-1 font-medium">Producto</th>
                                                    <th className="py-1 pr-2 text-right font-medium">Ton</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {det.map((l, i) => (
                                                    <tr key={`${l.numeroorden}-${i}`} className={`border-b last:border-0 ${l.categoria === "facturado" ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                                                      <td className="py-1 pl-2"><Semaforo c={l.categoria} /></td>
                                                      <td className="py-1 tabular-nums">{l.fechacargue ?? "-"}</td>
                                                      <td className="py-1">{l.numeroorden}</td>
                                                      <td className="py-1">{l.placa ?? "-"}</td>
                                                      <td className="py-1">{l.cliente ?? "-"}</td>
                                                      <td className="py-1">{l.producto ?? "-"}</td>
                                                      <td className="py-1 pr-2 text-right tabular-nums">{ton(l.toneladas)}</td>
                                                    </tr>
                                                  ))}
                                                  {det.length === 0 && (
                                                    <tr>
                                                      <td colSpan={7} className="py-2 text-center text-muted-foreground">Sin líneas.</td>
                                                    </tr>
                                                  )}
                                                </tbody>
                                              </table>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                      {/* PRODUCCIÓN: el respaldo no son órdenes sino el día a
                                          día de la tolva / las horas extra por puesto. */}
                                      {abierto && esProd && (
                                        <tr className="bg-muted/20">
                                          <td colSpan={6} className="px-2 py-2">
                                            <div className="max-h-64 overflow-auto rounded border bg-background">
                                              <table className="w-full text-[11px]">
                                                <thead>
                                                  <tr className="border-b text-left text-muted-foreground">
                                                    <th className="py-1 pl-2 font-medium">Fecha</th>
                                                    <th className="py-1 font-medium">Detalle</th>
                                                    <th className="py-1 text-right font-medium">Cantidad</th>
                                                    <th className="py-1 text-right font-medium">Tarifa</th>
                                                    <th className="py-1 pr-2 text-right font-medium">Valor</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {detProd.map((l, i) => (
                                                    <tr key={`${l.operacion}-${l.fecha}-${i}`} className="border-b last:border-0">
                                                      <td className="py-1 pl-2 tabular-nums">{l.fecha ?? "-"}</td>
                                                      <td className="py-1">{l.producto ?? "-"}</td>
                                                      <td className="py-1 text-right tabular-nums">
                                                        {ton(l.toneladas)} {uLabel(l.unidad)}
                                                      </td>
                                                      <td className="py-1 text-right tabular-nums text-muted-foreground">{money(l.tarifa)}</td>
                                                      <td className="py-1 pr-2 text-right tabular-nums">{money(l.valor)}</td>
                                                    </tr>
                                                  ))}
                                                  {detProd.length === 0 && (
                                                    <tr>
                                                      <td colSpan={5} className="py-2 text-center text-muted-foreground">Sin detalle.</td>
                                                    </tr>
                                                  )}
                                                </tbody>
                                              </table>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  )
                                })}
                                {/* Desglose operación / producción: solo cuando el owner
                                    tiene de los dos, que es cuando aporta algo. */}
                                {g.operacion > 0 && g.produccion > 0 && (
                                  <>
                                    <tr className="border-t text-[11px] text-muted-foreground">
                                      <td className="py-1 pl-2">Movimiento de órdenes</td>
                                      <td colSpan={3}></td>
                                      <td className="py-1 pr-3 text-right tabular-nums">{money(g.operacion)}</td>
                                      <td></td>
                                    </tr>
                                    <tr className="text-[11px] text-sky-700 dark:text-sky-300">
                                      <td className="py-1 pl-2">Producción</td>
                                      <td colSpan={3}></td>
                                      <td className="py-1 pr-3 text-right tabular-nums">{money(g.produccion)}</td>
                                      <td></td>
                                    </tr>
                                  </>
                                )}
                                <tr className="border-t bg-muted/30 font-semibold">
                                  <td className="py-1.5 pl-2">Subtotal {g.owner}</td>
                                  <td className="py-1.5 text-right tabular-nums">{ton(g.ton)}</td>
                                  <td></td>
                                  <td className="py-1.5 text-right tabular-nums text-emerald-700">{money(g.porFacturar)}</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(g.total)}</td>
                                  <td></td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total general */}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t-2 border-primary/40 pt-3">
                      <div>
                        <span className="text-sm font-bold">TOTAL PREFACTURA</span>
                        {prefSel.totalProduccion > 0 && (
                          <div className="text-[11px] text-muted-foreground">
                            Movimiento de órdenes {money(prefSel.totalOperacion)} ·{" "}
                            <span className="text-sky-700 dark:text-sky-300">Producción {money(prefSel.totalProduccion)}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">Total período {money(prefSel.totalVal)}</span>
                        <span className="flex items-center gap-1.5 text-xl font-extrabold tabular-nums text-emerald-600">
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          {money(prefSel.totalPorFacturar)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SOPORTE (anexo) EN PANTALLA: detalle de órdenes por owner × operación
                  que respalda la prefactura. Se genera en la app; Excel es opcional. */}
              {pref && soporteLineas.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <div>
                      <CardTitle className="text-sm">Soporte de la factura (anexo por owner × operación)</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Detalle de órdenes que respalda lo por facturar. Se guarda con la prefactura como respaldo.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => exportarSoporteExcel(soporteLineas, proyectoNombre)}>
                      <Download className="mr-2 h-4 w-4" /> Excel (opcional)
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <SoporteAnexo lineas={soporteLineas} />
                  </CardContent>
                </Card>
              )}

              {/* Prefacturas guardadas del proyecto */}
              {guardadas.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Prefacturas guardadas ({guardadas.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Período</TableHead>
                          <TableHead className="text-right">Toneladas</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Guardó</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {guardadas.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs font-medium">{p.id}</TableCell>
                            <TableCell className="text-xs">
                              {p.periodo_desde || "inicio"} → {p.periodo_hasta || "fin"}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{ton(p.toneladas)}</TableCell>
                            <TableCell className="text-right text-xs font-semibold tabular-nums">{money(p.total)}</TableCell>
                            <TableCell>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                  p.estado === "aprobada"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/40"
                                }`}
                              >
                                {p.estado}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.usuario ?? "-"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setVerSoporteId(verSoporteId === p.id ? null : p.id)}
                                >
                                  <FileText className="mr-1 h-3 w-3" /> {verSoporteId === p.id ? "Ocultar" : "Soporte"}
                                </Button>
                                {p.estado === "borrador" ? (
                                  <>
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => aprobar(p.id, "aprobada")}>
                                      <Check className="mr-1 h-3 w-3" /> Aprobar
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600" onClick={() => borrar(p.id)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => aprobar(p.id, "borrador")}>
                                    Reabrir
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Soporte CONGELADO de la prefactura guardada seleccionada (respaldo). */}
                    {verSoporteId != null && (() => {
                      const p = guardadas.find((g) => g.id === verSoporteId)
                      if (!p) return null
                      const sop = p.soporte || []
                      return (
                        <div className="border-t bg-muted/20 p-4">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold">
                              Soporte de la prefactura #{p.id} · {p.proyecto} · {p.periodo_desde || "inicio"} → {p.periodo_hasta || "fin"}
                            </div>
                            {sop.length > 0 && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => exportarSoporteExcel(sop, `${p.proyecto}_${p.id}`)}>
                                <Download className="mr-1 h-3 w-3" /> Excel (opcional)
                              </Button>
                            )}
                          </div>
                          {sop.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Esta prefactura se guardó sin soporte (es anterior a esta función). Al guardar/aprobar una nueva, quedará el respaldo.
                            </p>
                          ) : (
                            <SoporteAnexo lineas={sop} />
                          )}
                        </div>
                      )
                    })()}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

function StatCard({
  l,
  v,
  sub,
  icon: Icon,
  color,
  rojo,
}: {
  l: string
  v: string
  sub?: string
  icon?: any
  color?: string
  rojo?: boolean
}) {
  return (
    <Card className={rojo ? "border-red-300 bg-red-50/60 dark:bg-red-950/20" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {Icon && <Icon className={`h-3.5 w-3.5 ${color ?? ""}`} />} {l}
        </div>
        <div className={`mt-1 text-xl font-bold tabular-nums ${rojo ? "text-red-700" : ""}`}>{v}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

export default CuadroControlFacturacion
