"use client"

// Pestaña "Cuadre por orden" de Transacciones de Inventario.
//
// Gerencia (2026-10-08): "necesito una tabla que tenga el pedido, la orden de cargue,
// cantidad de la orden, cantidad despachada y que marque la diferencia; si la orden es de
// descargue manual o de autodescargue debe verse como un ingreso".
//
// Cada orden del período contra lo que de verdad movió en el inventario (regla en
// lib/cuadre-por-orden.ts), y debajo todo lo que entró o salió SIN número de orden: eso
// es lo que no cruza con nada y por eso el inventario "no cuadra".

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { Chip } from "@/components/ui/lipgo"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import { Loader2, Search, Download, ChevronDown, ChevronRight } from "lucide-react"
import { getCuadrePorOrden, type CuadrePorOrdenData, type MovSinOrden } from "@/lib/transacciones-codigo-actions"
import { ESTADOS_CON_DIFERENCIA, ETIQUETA_ESTADO, type OrdenCuadre } from "@/lib/cuadre-por-orden"

const hoyColombia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
const primeroDelMes = () => hoyColombia().slice(0, 8) + "01"

const fmtFechaHora = (iso: any) => {
  if (!iso) return ""
  try {
    return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date(String(iso)))
  } catch {
    return String(iso).slice(0, 16)
  }
}
const n = (v: number) => Number(v || 0).toLocaleString("es-CO")
const dif = (v: number) => (Math.abs(v) < 0.5 ? "0" : (v > 0 ? "+" : "") + n(v))

function tipoDeOrden(o: OrdenCuadre) {
  if (o.sentido === "ingreso") return o.automatica ? "Ingreso · autodescargue" : "Ingreso · descargue"
  if (o.sentido === "salida") return "Salida · cargue"
  return o.tipo || "—"
}

export function CuadrePorOrden() {
  const { toast } = useToast()
  const { selectedEmpresaId } = useAuth()
  const [desde, setDesde] = useState(primeroDelMes())
  const [hasta, setHasta] = useState(hoyColombia())
  const [data, setData] = useState<CuadrePorOrdenData | null>(null)
  const [cargando, setCargando] = useState(false)
  const [soloDiferencias, setSoloDiferencias] = useState(false)
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set())

  const consultar = async () => {
    if (!selectedEmpresaId) return
    setCargando(true)
    const r = await getCuadrePorOrden({ selectedEmpresaId, desde, hasta })
    setCargando(false)
    if (r.success && r.data) {
      setData(r.data)
      setAbiertas(new Set())
    } else toast({ title: "No se pudo consultar", description: r.error, variant: "destructive" })
  }

  const ordenes = useMemo(() => {
    if (!data) return []
    return soloDiferencias ? data.ordenes.filter((o) => ESTADOS_CON_DIFERENCIA.has(o.estado)) : data.ordenes
  }, [data, soloDiferencias])

  const conteo = useMemo(() => {
    const c = { cuadran: 0, diferencias: 0, pendientes: 0, otras: 0 }
    for (const o of data?.ordenes ?? []) {
      if (o.estado === "cuadra") c.cuadran++
      else if (ESTADOS_CON_DIFERENCIA.has(o.estado)) c.diferencias++
      else if (o.estado === "pendiente") c.pendientes++
      else c.otras++
    }
    return c
  }, [data])

  const alternar = (id: number) => {
    setAbiertas((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  const exportarExcel = async () => {
    if (!data) return
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()
    const hojaOrdenes = data.ordenes.map((o) => ({
      Fecha: o.fecha || "",
      Orden: o.orden,
      Tipo: tipoDeOrden(o),
      "Orden origen": o.ordenorigen || "",
      Pedido: o.pedidos || "",
      Placa: o.placa || "",
      Cliente: o.cliente || "",
      Estado_orden: o.status || "",
      "Cant. orden": o.cantOrden,
      "Cant. inventario": o.cantInventario,
      Diferencia: o.diferencia,
      "Por aprobar": o.pendientes,
      Rechazados: o.rechazados,
      Cuadre: ETIQUETA_ESTADO[o.estado].texto,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaOrdenes), "Órdenes")
    const hojaLineas = data.ordenes.flatMap((o) =>
      o.lineas.map((l) => ({
        Orden: o.orden,
        Tipo: tipoDeOrden(o),
        Producto: l.producto,
        "Cant. orden": l.orden,
        "Cant. inventario": l.inventario,
        Diferencia: l.diferencia,
      })),
    )
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaLineas), "Líneas")
    const sinOrden = [
      ...data.sinOrden.entradas.map((m) => ({ Tipo: "Entrada 101 a mano", ...filaSinOrden(m) })),
      ...data.sinOrden.salidas.map((m) => ({ Tipo: "Salida 601 sin orden", ...filaSinOrden(m) })),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sinOrden.length ? sinOrden : [{ Tipo: "Sin movimientos sin orden" }]), "Sin orden")
    XLSX.writeFile(wb, `cuadre_por_orden_${desde}_a_${hasta}.xlsx`)
  }

  if (!selectedEmpresaId) return <p className="py-8 text-center text-sm text-muted-foreground">Selecciona un proyecto en el selector global.</p>

  const r = data?.resumen

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div>
          <Label className="text-[11px] uppercase text-muted-foreground">Desde</Label>
          <DatePickerField value={desde} onChange={setDesde} className="mt-1 h-9 w-40" />
        </div>
        <div>
          <Label className="text-[11px] uppercase text-muted-foreground">Hasta</Label>
          <DatePickerField value={hasta} onChange={setHasta} className="mt-1 h-9 w-40" />
        </div>
        <Button onClick={consultar} disabled={cargando} className="h-9">
          {cargando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />} Consultar
        </Button>
        <Button variant="outline" onClick={exportarExcel} disabled={!data} className="h-9">
          <Download className="mr-1 h-4 w-4" /> Excel
        </Button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} className="h-4 w-4" />
          Solo las que no cuadran
        </label>
      </Card>

      {!data && !cargando && (
        <p className="px-1 text-sm text-muted-foreground">
          Cada orden de cargue es una <b>salida</b> y cada descargue (manual o autodescargue) es un <b>ingreso</b>. Se compara lo que
          dice la orden con lo que de verdad movió en el inventario, y debajo se lista lo que entró o salió sin número de orden.
        </p>
      )}

      {data && r && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Órdenes del período</p>
              <p className="text-2xl font-semibold tabular-nums">{n(data.ordenes.length)}</p>
              <p className="text-xs text-muted-foreground">
                {n(conteo.cuadran)} cuadran · <span className={conteo.diferencias ? "font-semibold text-red-600" : ""}>{n(conteo.diferencias)} con diferencia</span>
                {conteo.pendientes ? ` · ${n(conteo.pendientes)} por aprobar` : ""}
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Entradas del período</p>
              <p className="text-2xl font-semibold tabular-nums text-[#1E8449]">{n(r.totalEntradas)}</p>
              <p className="text-xs text-muted-foreground">
                {n(r.ingresosPorOrden)} por descargue · <span className={r.ingresosAMano ? "font-semibold text-amber-700" : ""}>{n(r.ingresosAMano)} a mano sin orden</span>
                {r.devoluciones ? ` · ${n(r.devoluciones)} devoluciones` : ""}{r.sobrantes ? ` · ${n(r.sobrantes)} sobrantes` : ""}
                {r.reversosSalida ? ` · ${n(r.reversosSalida)} reversos` : ""}{r.inventarioInicial ? ` · ${n(r.inventarioInicial)} inicial` : ""}
                {r.otrosEntrada ? ` · ${n(r.otrosEntrada)} otros` : ""}
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Salidas del período</p>
              <p className="text-2xl font-semibold tabular-nums text-[#C0392B]">{n(r.totalSalidas)}</p>
              <p className="text-xs text-muted-foreground">
                {n(r.salidasPorOrden)} por orden de cargue · <span className={r.salidasAMano ? "font-semibold text-amber-700" : ""}>{n(r.salidasAMano)} a mano sin orden</span>
                {r.averias ? ` · ${n(r.averias)} averías/desecho` : ""}{r.faltantes ? ` · ${n(r.faltantes)} faltantes` : ""}
                {r.reversosEntrada ? ` · ${n(r.reversosEntrada)} reversos` : ""}{r.otrosSalida ? ` · ${n(r.otrosSalida)} otros` : ""}
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Neto del período</p>
              <p className="text-2xl font-semibold tabular-nums">{dif(r.totalEntradas - r.totalSalidas)}</p>
              <p className="text-xs text-muted-foreground">
                {r.trasladosFilas ? `${n(r.trasladosFilas)} traslados/reclasificaciones (no suman)` : "Sin traslados"}
                {data.deOtroPeriodo.filas ? ` · ${n(data.deOtroPeriodo.unidades)} und de órdenes de otro período` : ""}
              </p>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                    <th className="w-6 px-2 py-2"></th>
                    <th className="px-2 py-2">Fecha</th>
                    <th className="px-2 py-2">Orden</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Pedido</th>
                    <th className="px-2 py-2">Placa</th>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2 text-right">Cant. orden</th>
                    <th className="px-2 py-2 text-right">Inventario</th>
                    <th className="px-2 py-2 text-right">Diferencia</th>
                    <th className="px-2 py-2">Cuadre</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenes.map((o) => {
                    const abierta = abiertas.has(o.id)
                    const et = ETIQUETA_ESTADO[o.estado]
                    const noMueve = o.sentido === "ninguno"
                    return (
                      <FilaOrden key={o.id} o={o} abierta={abierta} et={et} noMueve={noMueve} onToggle={() => alternar(o.id)} />
                    )
                  })}
                  {ordenes.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        {soloDiferencias ? "Todas las órdenes del período cuadran con su inventario." : "Sin órdenes en el rango."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="p-2 text-[11px] text-muted-foreground">
              Salida = unidades 601 aprobadas que citan la orden · Ingreso = unidades 101 aprobadas que citan la orden. Distribución (clon “+D”)
              y Tolva no mueven inventario por diseño. Tolerancia de media unidad.{data.truncado ? " Consulta recortada: acorta el rango." : ""}
            </p>
          </Card>

          <SinOrden titulo="Entradas 101 hechas a mano, sin número de orden" nota="Son recepciones que no cruzan con ningún descargue. Al registrarlas con el código 101, escribe la orden de descargue en el campo «Orden de descargue que se recibe» para que crucen." filas={data.sinOrden.entradas} tono="atencion" />
          <SinOrden titulo="Salidas 601 sin número de orden" nota="Despachos que no cruzan con ninguna orden de cargue." filas={data.sinOrden.salidas} tono="critico" />
        </>
      )}
    </div>
  )
}

function FilaOrden({ o, abierta, et, noMueve, onToggle }: { o: OrdenCuadre; abierta: boolean; et: { texto: string; tono: "ok" | "atencion" | "critico" | "info" | "neutro" }; noMueve: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer border-b align-top hover:bg-muted/40" onClick={onToggle}>
        <td className="px-2 py-1.5 text-muted-foreground">{abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
        <td className="px-2 py-1.5 text-xs">{o.fecha || "—"}</td>
        <td className="px-2 py-1.5 font-mono text-xs">
          {o.orden}
          {o.ordenorigen && <div className="text-[10px] text-muted-foreground">de {o.ordenorigen}</div>}
        </td>
        <td className="px-2 py-1.5 text-xs">{tipoDeOrden(o)}</td>
        <td className="px-2 py-1.5 text-xs">{o.pedidos || "—"}</td>
        <td className="px-2 py-1.5 font-mono text-xs">{o.placa || "—"}</td>
        <td className="max-w-[220px] truncate px-2 py-1.5 text-xs" title={o.cliente || ""}>{o.cliente || "—"}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{n(o.cantOrden)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{noMueve ? "—" : n(o.cantInventario)}</td>
        <td className={`px-2 py-1.5 text-right tabular-nums ${!noMueve && Math.abs(o.diferencia) >= 0.5 ? "font-semibold text-red-600" : ""}`}>{noMueve ? "—" : dif(o.diferencia)}</td>
        <td className="px-2 py-1.5">
          <Chip tono={et.tono}>{et.texto}</Chip>
          {o.pendientes > 0 && <div className="mt-0.5 text-[10px] text-muted-foreground">{o.pendientes} por aprobar</div>}
          {o.rechazados > 0 && <div className="mt-0.5 text-[10px] text-muted-foreground">{o.rechazados} rechazado{o.rechazados > 1 ? "s" : ""}</div>}
        </td>
      </tr>
      {abierta && (
        <tr className="border-b bg-muted/20">
          <td></td>
          <td colSpan={10} className="px-2 py-2">
            {o.lineas.length === 0 ? (
              <p className="text-xs text-muted-foreground">La orden no tiene líneas de detalle.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-muted-foreground">
                    <th className="px-2 py-1">Producto</th>
                    <th className="px-2 py-1 text-right">Orden</th>
                    <th className="px-2 py-1 text-right">Inventario</th>
                    <th className="px-2 py-1 text-right">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lineas.map((l, i) => (
                    <tr key={i} className={l.orden < 0.5 && l.inventario >= 0.5 ? "text-red-700" : ""}>
                      <td className="px-2 py-1">
                        {l.producto}
                        {l.orden < 0.5 && l.inventario >= 0.5 && <span className="ml-2 text-[10px] uppercase">no estaba en la orden</span>}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{n(l.orden)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{noMueve ? "—" : n(l.inventario)}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${!noMueve && Math.abs(l.diferencia) >= 0.5 ? "font-semibold" : ""}`}>{noMueve ? "—" : dif(l.diferencia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function filaSinOrden(m: MovSinOrden) {
  return {
    "#": m.id,
    Fecha: fmtFechaHora(m.creado),
    Producto: m.nombreproducto || "",
    Lote: m.lote || "",
    Ubicación: m.location || "",
    Cantidad: m.cantidad,
    Usuario: m.creadopor || "",
    Observaciones: m.observaciones || "",
  }
}

function SinOrden({ titulo, nota, filas, tono }: { titulo: string; nota: string; filas: MovSinOrden[]; tono: "atencion" | "critico" }) {
  const total = filas.reduce((s, f) => s + f.cantidad, 0)
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Chip tono={filas.length ? tono : "ok"}>{filas.length ? `${n(filas.length)} movimientos · ${n(total)} und` : "Ninguno"}</Chip>
        <span className="text-sm font-medium">{titulo}</span>
      </div>
      {filas.length > 0 && (
        <>
          <p className="px-3 pt-2 text-xs text-muted-foreground">{nota}</p>
          <div className="max-h-[40vh] overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Producto</th>
                  <th className="px-2 py-2">Lote</th>
                  <th className="px-2 py-2">Ubic.</th>
                  <th className="px-2 py-2 text-right">Cantidad</th>
                  <th className="px-2 py-2">Usuario</th>
                  <th className="px-2 py-2">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 align-top">
                    <td className="px-2 py-1.5 font-mono text-xs">{f.id}</td>
                    <td className="px-2 py-1.5 text-xs">{fmtFechaHora(f.creado)}</td>
                    <td className="px-2 py-1.5 text-xs">{f.nombreproducto}</td>
                    <td className="px-2 py-1.5 text-xs">{f.lote || "—"}</td>
                    <td className="px-2 py-1.5 text-xs">{f.location || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{n(f.cantidad)}</td>
                    <td className="px-2 py-1.5 text-xs">{f.creadopor || "—"}</td>
                    <td className="max-w-[260px] px-2 py-1.5 text-xs text-muted-foreground">{f.observaciones || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
