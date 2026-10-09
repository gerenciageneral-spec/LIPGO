"use client"

// Pestaña "Cuadre por orden" de Exactitud y cierre (Panel LIP Inventario).
//
// Gerencia (2026-10-08): "necesito una tabla que tenga el pedido, la orden de cargue, cantidad
// de la orden, cantidad despachada y que marque la diferencia; si la orden es de descargue
// manual o de autodescargue debe verse como un ingreso".
// Y al revisarla (2026-10-09): "revisa si la orden se eliminó, si la orden se reclasificó con
// correcciones de lote; me gusta la fecha desde/hasta pero ocupa mucho espacio; el 360 y todo
// lo demás está perfecto".
//
// Cada orden del período contra lo que de verdad movió en el inventario (regla en
// lib/cuadre-por-orden.ts), y debajo lo que no cruza con nada: órdenes borradas que dejaron
// movimientos, e ingresos/salidas sin número de orden.

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Chip, Cifra, Esqueleto, EstadoVacio, Eyebrow, Seccion } from "@/components/ui/lipgo"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import { ChevronDown, ChevronRight, Download, Link2, Loader2, Search, Trash2, Wrench } from "lucide-react"
import { enlazarIngresoAOrden, getCuadrePorOrden, type CuadrePorOrdenData, type MovSinOrden } from "@/lib/transacciones-codigo-actions"
import { ESTADOS_CON_DIFERENCIA, ETIQUETA_ESTADO, type OrdenCuadre, type OrdenEliminada } from "@/lib/cuadre-por-orden"
import { etiquetaRango, PRESETS_PERIODO, rangoDe, validarRango, type PresetPeriodo } from "@/lib/periodo-rango"

const hoyColombia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())

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

export function CuadrePorOrden({
  onAbrirOrden,
  onAbrirIngreso,
}: {
  onAbrirOrden?: (ordendecargue: string) => void
  onAbrirIngreso?: (ordendecargue: string) => void
} = {}) {
  const { toast } = useToast()
  const { selectedEmpresaId } = useAuth()
  // El filtro de fechas en una sola línea: presets + el rango escrito. Los dos DatePicker
  // grandes solo aparecen cuando se elige "Rango" (gerencia: "me gusta la fecha desde/hasta,
  // sin embargo ocupa mucho espacio").
  const [preset, setPreset] = useState<PresetPeriodo>("mes")
  const [rango, setRango] = useState(() => rangoDe("mes", hoyColombia()))
  const [data, setData] = useState<CuadrePorOrdenData | null>(null)
  const [cargando, setCargando] = useState(false)
  const [soloDiferencias, setSoloDiferencias] = useState(false)
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set())

  const elegirPreset = (p: PresetPeriodo) => {
    setPreset(p)
    if (p !== "rango") setRango(rangoDe(p, hoyColombia()))
  }

  const consultar = async () => {
    if (!selectedEmpresaId) return
    const error = validarRango(rango.desde, rango.hasta)
    if (error) {
      toast({ title: "Revisa el período", description: error, variant: "destructive" })
      return
    }
    setCargando(true)
    const r = await getCuadrePorOrden({ selectedEmpresaId, desde: rango.desde, hasta: rango.hasta })
    setCargando(false)
    if (r.success && r.data) {
      setData(r.data)
      setAbiertas(new Set())
    } else toast({ title: "No se pudo consultar", description: r.error, variant: "destructive" })
  }

  const ordenes = useMemo(() => {
    if (!data) return []
    return soloDiferencias ? data.ordenes.filter((o) => ESTADOS_CON_DIFERENCIA.has(o.estado) || o.correcciones.length > 0) : data.ordenes
  }, [data, soloDiferencias])

  const conteo = useMemo(() => {
    const c = { cuadran: 0, diferencias: 0, pendientes: 0, corregidas: 0, otras: 0 }
    for (const o of data?.ordenes ?? []) {
      if (o.correcciones.length > 0) c.corregidas++
      if (o.estado === "cuadra") c.cuadran++
      else if (ESTADOS_CON_DIFERENCIA.has(o.estado)) c.diferencias++
      else if (o.estado === "pendiente") c.pendientes++
      else c.otras++
    }
    return c
  }, [data])

  const alternar = (id: number) =>
    setAbiertas((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })

  const exportarExcel = async () => {
    if (!data) return
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.ordenes.map((o) => ({
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
          Corregida: o.correcciones.length ? o.correcciones.map((c) => `#${c.invtransId} ${c.que}`).join(" · ") : "",
          Cuadre: ETIQUETA_ESTADO[o.estado].texto,
        })),
      ),
      "Órdenes",
    )
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.ordenes.flatMap((o) =>
          o.lineas.map((l) => ({
            Orden: o.orden,
            Tipo: tipoDeOrden(o),
            Producto: l.producto,
            "Cant. orden": l.orden,
            "Cant. inventario": l.inventario,
            Devuelto: l.devuelto ?? 0,
            Diferencia: l.diferencia,
          })),
        ),
      ),
      "Líneas",
    )
    const sinOrden = [
      ...data.sinOrden.entradas.map((m) => ({ Tipo: "Entrada 101 a mano", ...filaSinOrden(m) })),
      ...data.sinOrden.salidas.map((m) => ({ Tipo: "Salida 601 sin orden", ...filaSinOrden(m) })),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sinOrden.length ? sinOrden : [{ Tipo: "Sin movimientos sin orden" }]), "Sin orden")
    if (data.eliminadas.length) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          data.eliminadas.map((e) => ({
            Orden: e.ocargue,
            Movimientos: e.movimientos,
            Entradas: e.entradas,
            Salidas: e.salidas,
            Productos: e.productos.join(" · "),
            Desde: fmtFechaHora(e.primera),
            Hasta: fmtFechaHora(e.ultima),
          })),
        ),
        "Órdenes borradas",
      )
    }
    XLSX.writeFile(wb, `cuadre_por_orden_${rango.desde}_a_${rango.hasta}.xlsx`)
  }

  if (!selectedEmpresaId) return <EstadoVacio titulo="Selecciona un proyecto" texto="Elige el proyecto en el selector global para ver su cuadre." />

  const r = data?.resumen

  return (
    <div className="space-y-4">
      {/* FILTRO EN UNA LÍNEA. Presets a la izquierda, el rango escrito al lado, y los dos
          campos de fecha solo cuando se pide "Rango". */}
      <div className="lg-card flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {PRESETS_PERIODO.map((p) => (
            <button
              key={p.valor}
              type="button"
              onClick={() => elegirPreset(p.valor)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                preset === p.valor ? "bg-foreground text-background" : "border border-input hover:bg-accent"
              }`}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>

        {preset === "rango" ? (
          <div className="flex items-center gap-1.5">
            <Input type="date" value={rango.desde} onChange={(e) => setRango((v) => ({ ...v, desde: e.target.value }))} className="h-8 w-[150px] text-xs" />
            <span className="text-xs text-muted-foreground">a</span>
            <Input type="date" value={rango.hasta} onChange={(e) => setRango((v) => ({ ...v, hasta: e.target.value }))} className="h-8 w-[150px] text-xs" />
          </div>
        ) : (
          <span className="lg-num text-xs text-muted-foreground">{etiquetaRango(rango.desde, rango.hasta)}</span>
        )}

        <Button onClick={consultar} disabled={cargando} size="sm" className="h-8 gap-1.5">
          {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Consultar
        </Button>

        <div className="ml-auto flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} className="h-3.5 w-3.5" />
            Solo las que no cuadran
          </label>
          <Button variant="outline" size="sm" onClick={exportarExcel} disabled={!data} className="h-8 gap-1.5">
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {cargando && !data && <Esqueleto lineas={6} />}

      {!data && !cargando && (
        <EstadoVacio
          titulo="Elige un período y consulta"
          texto="Cada orden de cargue es una salida y cada descargue —manual o autodescargue— es un ingreso. Se compara lo que dice la orden con lo que de verdad movió en el inventario."
        />
      )}

      {data && r && (
        <>
          <div className="lg-card grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-5">
            <Cifra
              label="Órdenes del período"
              valor={n(data.ordenes.length)}
              tamano="compacta"
              sub={`${n(conteo.cuadran)} cuadran${conteo.pendientes ? ` · ${n(conteo.pendientes)} por aprobar` : ""}`}
              chips={
                <>
                  {conteo.diferencias > 0 && <Chip tono="critico">{n(conteo.diferencias)} con diferencia</Chip>}
                  {conteo.corregidas > 0 && <Chip tono="atencion"><Wrench className="h-3 w-3" /> {n(conteo.corregidas)} corregidas</Chip>}
                </>
              }
            />
            <Cifra
              label="Entradas del período"
              valor={n(r.totalEntradas)}
              tono="ok"
              tamano="compacta"
              sub={`${n(r.ingresosPorOrden)} por descargue${r.devoluciones ? ` · ${n(r.devoluciones)} devoluciones` : ""}${r.sobrantes ? ` · ${n(r.sobrantes)} sobrantes` : ""}`}
              chips={r.ingresosAMano > 0 ? <Chip tono="atencion">{n(r.ingresosAMano)} a mano sin orden</Chip> : undefined}
            />
            <Cifra
              label="Salidas del período"
              valor={n(r.totalSalidas)}
              tono="critico"
              tamano="compacta"
              sub={`${n(r.salidasPorOrden)} por orden${r.averias ? ` · ${n(r.averias)} averías` : ""}${r.faltantes ? ` · ${n(r.faltantes)} faltantes` : ""}`}
              chips={r.salidasAMano > 0 ? <Chip tono="atencion">{n(r.salidasAMano)} a mano sin orden</Chip> : undefined}
            />
            <Cifra
              label="Neto del período"
              valor={dif(r.totalEntradas - r.totalSalidas)}
              tamano="compacta"
              sub={r.trasladosFilas ? `${n(r.trasladosFilas)} traslados (no suman)` : "Sin traslados"}
              chips={data.eliminadas.length > 0 ? <Chip tono="critico"><Trash2 className="h-3 w-3" /> {data.eliminadas.length} orden{data.eliminadas.length > 1 ? "es" : ""} borrada{data.eliminadas.length > 1 ? "s" : ""}</Chip> : undefined}
            />
          </div>

          <Seccion
            eyebrow="Orden por orden"
            titulo={soloDiferencias ? "Las que no cuadran o se corrigieron" : "Todas las órdenes del período"}
            accion={<Chip tono="neutro">{n(ordenes.length)} de {n(data.ordenes.length)}</Chip>}
            sinPadding
          >
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-6 px-2 py-2"></th>
                    <th className="px-2 py-2 text-left font-semibold">Fecha</th>
                    <th className="px-2 py-2 text-left font-semibold">Orden</th>
                    <th className="px-2 py-2 text-left font-semibold">Tipo</th>
                    <th className="px-2 py-2 text-left font-semibold">Pedido</th>
                    <th className="px-2 py-2 text-left font-semibold">Placa</th>
                    <th className="px-2 py-2 text-right font-semibold">Cant. orden</th>
                    <th className="px-2 py-2 text-right font-semibold">Inventario</th>
                    <th className="px-2 py-2 text-right font-semibold">Diferencia</th>
                    <th className="px-3 py-2 text-left font-semibold">Cuadre</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenes.map((o) => {
                    const onVer360 =
                      o.sentido === "salida" && onAbrirOrden ? () => onAbrirOrden(o.orden) : o.sentido === "ingreso" && onAbrirIngreso ? () => onAbrirIngreso(o.orden) : undefined
                    return (
                      <FilaOrden
                        key={o.id}
                        o={o}
                        abierta={abiertas.has(o.id)}
                        onToggle={() => alternar(o.id)}
                        onVer360={onVer360}
                        onEnlazar={async (invtransId) => {
                          const r = await enlazarIngresoAOrden({ invtransId, ocargue: o.orden, selectedEmpresaId })
                          toast({ title: r.success ? "Ingreso enlazado" : "No se pudo enlazar", description: r.message, variant: r.success ? undefined : "destructive" })
                          if (r.success) await consultar()
                        }}
                      />
                    )
                  })}
                  {ordenes.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {soloDiferencias ? "Todas las órdenes del período cuadran con su inventario." : "Sin órdenes en el rango."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground sm:px-5">
              Salida = unidades 601 aprobadas que citan la orden, menos lo devuelto por mal cargue (654) · Ingreso = unidades 101 aprobadas que
              la citan. Distribución (clon “+D”) y Tolva no mueven inventario por diseño. Tolerancia de media unidad.
              {data.truncado ? " Consulta recortada: acorta el período." : ""}
            </p>
          </Seccion>

          {/* ÓRDENES BORRADAS. Lo más grave y lo que esta pantalla, que lista órdenes, nunca
              mostraría: movimientos de una orden que ya no existe. */}
          {data.eliminadas.length > 0 && (
            <Seccion
              eyebrow="Movieron inventario y su documento ya no existe"
              titulo={`${data.eliminadas.length} orden${data.eliminadas.length > 1 ? "es" : ""} borrada${data.eliminadas.length > 1 ? "s" : ""} con rastro`}
              accion={<Chip tono="critico">Revisar</Chip>}
              sinPadding
            >
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Orden</th>
                    <th className="px-2 py-2 text-left font-semibold">Productos</th>
                    <th className="px-2 py-2 text-right font-semibold">Entró</th>
                    <th className="px-2 py-2 text-right font-semibold">Salió</th>
                    <th className="px-2 py-2 text-right font-semibold">Movs.</th>
                    <th className="px-4 py-2 text-left font-semibold">Cuándo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.eliminadas.map((e: OrdenEliminada) => (
                    <tr key={e.ocargue} className="border-t border-border/60">
                      <td className="lg-num px-4 py-2 font-mono text-xs">{e.ocargue}</td>
                      <td className="max-w-[320px] px-2 py-2 text-xs">{e.productos.join(" · ")}</td>
                      <td className="lg-num px-2 py-2 text-right text-[#1E8449]">{e.entradas ? n(e.entradas) : "—"}</td>
                      <td className="lg-num px-2 py-2 text-right text-[#C0392B]">{e.salidas ? n(e.salidas) : "—"}</td>
                      <td className="lg-num px-2 py-2 text-right">{n(e.movimientos)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{fmtFechaHora(e.primera)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground sm:px-5">
                Alguien borró la orden y sus movimientos quedaron: el inventario se movió sin documento que lo respalde. O se vuelve a crear la
                orden, o se reversan los movimientos; no se dejan así.
              </p>
            </Seccion>
          )}

          <SinOrden
            titulo="Entradas 101 hechas a mano, sin número de orden"
            nota="Son recepciones que no cruzan con ningún descargue. Al registrarlas con el código 101, escribe la orden en el campo «Orden de descargue que se recibe» para que crucen."
            filas={data.sinOrden.entradas}
            tono="atencion"
          />
          <SinOrden titulo="Salidas 601 sin número de orden" nota="Despachos que no cruzan con ninguna orden de cargue." filas={data.sinOrden.salidas} tono="critico" />
        </>
      )}
    </div>
  )
}

function FilaOrden({
  o,
  abierta,
  onToggle,
  onVer360,
  onEnlazar,
}: {
  o: OrdenCuadre
  abierta: boolean
  onToggle: () => void
  onVer360?: () => void
  onEnlazar?: (invtransId: number) => Promise<void>
}) {
  const et = ETIQUETA_ESTADO[o.estado]
  const noMueve = o.sentido === "ninguno"
  const [enlazando, setEnlazando] = useState<number | null>(null)
  const tieneCandidato = o.lineas.some((l) => (l.candidatos?.length ?? 0) > 0)
  return (
    <>
      <tr className="cursor-pointer border-t border-border/60 align-top hover:bg-muted/40" onClick={onToggle}>
        <td className="px-2 py-2 text-muted-foreground">{abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
        <td className="px-2 py-2 text-xs">{o.fecha || "—"}</td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1.5">
            <span className="lg-num font-mono text-xs">{o.orden}</span>
            {onVer360 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onVer360() }}
                className="rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Ver el ciclo completo"
              >
                360
              </button>
            )}
          </div>
          {o.ordenorigen && <div className="text-[10px] text-muted-foreground">de {o.ordenorigen}</div>}
        </td>
        <td className="px-2 py-2 text-xs">{tipoDeOrden(o)}</td>
        <td className="px-2 py-2 text-xs">{o.pedidos || "—"}</td>
        <td className="lg-num px-2 py-2 font-mono text-xs">{o.placa || "—"}</td>
        <td className="lg-num px-2 py-2 text-right">{n(o.cantOrden)}</td>
        <td className="lg-num px-2 py-2 text-right">{noMueve ? "—" : n(o.cantInventario)}</td>
        <td className={`lg-num px-2 py-2 text-right ${!noMueve && Math.abs(o.diferencia) >= 0.5 ? "font-semibold text-critico-fg" : ""}`}>{noMueve ? "—" : dif(o.diferencia)}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <Chip tono={et.tono}>{et.texto}</Chip>
            {o.correcciones.length > 0 && (
              <Chip tono="atencion" title={o.correcciones.map((c) => `#${c.invtransId} ${c.producto}: ${c.que}`).join("\n")}>
                <Wrench className="h-3 w-3" /> corregida
              </Chip>
            )}
            {tieneCandidato && (
              <Chip tono="info" title="Lo que falta parece estar en un ingreso digitado a mano: ábrela para enlazarlo">
                <Link2 className="h-3 w-3" /> hay ingreso a mano
              </Chip>
            )}
          </div>
          {o.pendientes > 0 && <div className="mt-0.5 text-[10px] text-muted-foreground">{o.pendientes} por aprobar</div>}
        </td>
      </tr>
      {abierta && (
        <tr className="border-t border-border/60 bg-muted/20">
          <td></td>
          <td colSpan={9} className="px-2 py-2.5">
            {o.lineas.length === 0 ? (
              <p className="text-xs text-muted-foreground">La orden no tiene líneas de detalle.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-1 font-semibold">Producto</th>
                    <th className="px-2 py-1 text-right font-semibold">Orden</th>
                    <th className="px-2 py-1 text-right font-semibold">Inventario</th>
                    <th className="px-2 py-1 text-right font-semibold">Devuelto</th>
                    <th className="px-2 py-1 text-right font-semibold">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lineas.map((l, i) => (
                    <>
                      <tr key={i} className={l.orden < 0.5 && l.inventario >= 0.5 ? "text-critico-fg" : ""}>
                        <td className="px-2 py-1">
                          {l.producto}
                          {l.orden < 0.5 && l.inventario >= 0.5 && <span className="ml-2 text-[10px] uppercase">no estaba en la orden</span>}
                        </td>
                        <td className="lg-num px-2 py-1 text-right">{n(l.orden)}</td>
                        <td className="lg-num px-2 py-1 text-right">{noMueve ? "—" : n(l.inventario)}</td>
                        <td className="lg-num px-2 py-1 text-right">{l.devuelto ? n(l.devuelto) : "—"}</td>
                        <td className={`lg-num px-2 py-1 text-right ${!noMueve && Math.abs(l.diferencia) >= 0.5 ? "font-semibold" : ""}`}>{noMueve ? "—" : dif(l.diferencia)}</td>
                      </tr>
                      {/* El producto sí llegó, pero se digitó a mano sin el número de orden
                          (gerencia 9-oct: "fue un error del coordinador"). Enlazarlo no mueve
                          ninguna unidad: solo le pone la orden que le faltaba. */}
                      {(l.candidatos?.length ?? 0) > 0 && (
                        <tr key={`c-${i}`}>
                          <td colSpan={5} className="px-2 pb-1.5">
                            <div className="rounded-md border border-info-bd bg-info-bg px-2.5 py-1.5 text-[11px] text-info-fg">
                              <b>Lo que falta parece estar digitado a mano.</b> El producto llegó, pero el ingreso quedó sin el número de orden:
                              <ul className="mt-1 space-y-1">
                                {l.candidatos!.map((c) => (
                                  <li key={c.invtransId} className="flex flex-wrap items-center gap-2">
                                    <span className="lg-num">
                                      #{c.invtransId} · {n(c.cantidad)} und · lote {c.lote ?? "—"} {c.location ?? ""} · {fmtFechaHora(c.creado)}
                                      {c.creadopor ? ` · ${c.creadopor}` : ""}
                                    </span>
                                    {c.calce === "exacto" ? <Chip tono="ok">calza exacto</Chip> : <Chip tono="neutro">no calza exacto</Chip>}
                                    {onEnlazar && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 gap-1 text-[11px]"
                                        disabled={enlazando === c.invtransId}
                                        onClick={async (e) => {
                                          e.stopPropagation()
                                          setEnlazando(c.invtransId)
                                          await onEnlazar(c.invtransId)
                                          setEnlazando(null)
                                        }}
                                      >
                                        {enlazando === c.invtransId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />} Enlazar a esta orden
                                      </Button>
                                    )}
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-1 opacity-80">Enlazarlo no mueve ninguna unidad: el producto ya está en el inventario, solo le falta decir con qué orden llegó.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
            {o.correcciones.length > 0 && (
              <div className="mt-2 rounded-md border border-atencion-bd bg-atencion-bg px-2.5 py-1.5 text-[11px] text-atencion-fg">
                <b>Se corrigió después de despachar:</b>{" "}
                {o.correcciones.map((c) => `#${c.invtransId} ${c.producto} (${c.que})`).join(" · ")}
              </div>
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
  if (filas.length === 0) {
    return (
      <div className="lg-card flex items-center gap-2 px-4 py-2.5">
        <Chip tono="ok">Ninguno</Chip>
        <span className="text-sm text-muted-foreground">{titulo}</span>
      </div>
    )
  }
  return (
    <Seccion eyebrow="No cruza con ninguna orden" titulo={titulo} accion={<Chip tono={tono}>{n(filas.length)} movimientos · {n(total)} und</Chip>} sinPadding>
      <p className="px-4 pt-3 text-[11px] text-muted-foreground sm:px-5">{nota}</p>
      <div className="mt-2 max-h-[40vh] overflow-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="sticky top-0 bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">#</th>
              <th className="px-2 py-2 text-left font-semibold">Fecha</th>
              <th className="px-2 py-2 text-left font-semibold">Producto</th>
              <th className="px-2 py-2 text-left font-semibold">Lote</th>
              <th className="px-2 py-2 text-left font-semibold">Ubic.</th>
              <th className="px-2 py-2 text-right font-semibold">Cantidad</th>
              <th className="px-2 py-2 text-left font-semibold">Usuario</th>
              <th className="px-4 py-2 text-left font-semibold">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-border/60 align-top">
                <td className="lg-num px-4 py-1.5 font-mono text-xs">{f.id}</td>
                <td className="px-2 py-1.5 text-xs">{fmtFechaHora(f.creado)}</td>
                <td className="px-2 py-1.5 text-xs">{f.nombreproducto}</td>
                <td className="lg-num px-2 py-1.5 text-xs">{f.lote || "—"}</td>
                <td className="px-2 py-1.5 text-xs">{f.location || "—"}</td>
                <td className="lg-num px-2 py-1.5 text-right">{n(f.cantidad)}</td>
                <td className="px-2 py-1.5 text-xs">{f.creadopor || "—"}</td>
                <td className="max-w-[260px] px-4 py-1.5 text-xs text-muted-foreground">{f.observaciones || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Seccion>
  )
}
