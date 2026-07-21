"use client"

// Cuadro de Control de Facturación (pestaña dentro de Gestión de Facturas).
// Cruza las ÓRDENES DE SERVICIO procesadas (fuente de verdad) con lo facturado,
// por owner/proyecto, para garantizar que todo lo procesado se facture. En ROJO
// lo "sin gestionar" (procesado sin facturar) y lo "sin tarifa". De aquí salen
// los anexos por proyecto. Datos: lib/facturacion-control-actions.ts.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Download, Filter, RotateCcw, AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import * as XLSX from "xlsx"
import {
  getControlFacturacion,
  getPrefactura,
  type ControlFacturacion,
  type CategoriaFactura,
  type FiltrosControl,
  type Prefactura,
} from "@/lib/facturacion-control-actions"
import { getAccessibleEmpresesFromPermisos } from "@/lib/orders-actions"

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO")
const ton = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })

const CAT_LABEL: Record<CategoriaFactura, string> = {
  facturado: "Facturado",
  en_proceso: "En proceso",
  sin_gestionar: "Sin gestionar",
}
const OPERACIONES = ["Cargue", "Distribucion", "Descargue", "Tolva"]

const emptyFiltros = (): FiltrosControl => ({
  desde: "",
  hasta: "",
  owner: "",
  tipooperacion: "",
  categoria: null,
  cliente: "",
  placa: "",
})

export function CuadroControlFacturacion() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [data, setData] = useState<ControlFacturacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<FiltrosControl>(emptyFiltros())
  const [filtros, setFiltros] = useState<FiltrosControl>(emptyFiltros())
  // Selector propio de PROYECTO/EMPRESA: la facturación es por ID. Arranca en la
  // empresa del selector global, pero se puede cambiar acá para facturar otro proyecto.
  const [empresas, setEmpresas] = useState<Array<{ id: number; nombre: string }>>([])
  const [empresaId, setEmpresaId] = useState<number | null>(selectedEmpresaId ?? null)
  // Prefactura interactiva: se elige (owner × servicio) qué facturar y se arma en pantalla.
  const [pref, setPref] = useState<Prefactura | null>(null)
  const [prefLoading, setPrefLoading] = useState(false)
  const [selKeys, setSelKeys] = useState<Set<string>>(new Set())
  const keyRes = (owner: string, servicio: string) => `${owner}|||${servicio}`

  useEffect(() => {
    getAccessibleEmpresesFromPermisos()
      .then((list) => {
        setEmpresas(list)
        setEmpresaId((prev) => prev ?? selectedEmpresaId ?? list[0]?.id ?? null)
      })
      .catch(() => setEmpresas([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const limpiar = () => {
    setPending(emptyFiltros())
    setFiltros(emptyFiltros())
  }

  const owners = useMemo(() => (data?.porOwner || []).map((o) => o.owner), [data])

  const t = data?.totales

  const exportarDetalle = () => {
    if (!data) return
    const rows = data.filas.map((f) => ({
      Fecha: f.fecha ?? "",
      "Orden de cargue": f.numeroorden,
      Placa: f.placa ?? "",
      Tiquete: f.tiquete ?? "",
      Operación: f.tipooperacion ?? "",
      Owner: f.owner,
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
    const r = await getPrefactura(empresaId, { desde: filtros.desde, hasta: filtros.hasta })
    setPrefLoading(false)
    if (!r.success || !r.data) {
      toast({ title: "Error", description: r.message, variant: "destructive" })
      return
    }
    setPref(r.data)
    setSelKeys(new Set(r.data.resumen.map((x) => keyRes(x.owner, x.servicio)))) // todo seleccionado
  }

  const toggleSel = (k: string) =>
    setSelKeys((prev) => {
      const n = new Set(prev)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })

  // Resumen SELECCIONADO, agrupado por owner (para la prefactura en pantalla).
  const prefSel = useMemo(() => {
    if (!pref) return null
    const rows = pref.resumen.filter((x) => selKeys.has(keyRes(x.owner, x.servicio)))
    const porOwner = new Map<string, { owner: string; items: typeof rows; ton: number; total: number }>()
    for (const r of rows) {
      const g = porOwner.get(r.owner) || { owner: r.owner, items: [] as any, ton: 0, total: 0 }
      g.items.push(r)
      g.ton += r.toneladas
      g.total += r.valor
      porOwner.set(r.owner, g)
    }
    const grupos = Array.from(porOwner.values()).sort((a, b) => a.owner.localeCompare(b.owner))
    const totalTon = rows.reduce((s, r) => s + r.toneladas, 0)
    const totalVal = rows.reduce((s, r) => s + r.valor, 0)
    return { grupos, totalTon, totalVal, keys: new Set(rows.map((r) => keyRes(r.owner, r.servicio))) }
  }, [pref, selKeys])

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
      ["Owner", "Servicio", "Toneladas", "Tarifa", "Total"],
    ]
    for (const g of prefSel.grupos) {
      for (const it of g.items) {
        aoa.push([g.owner, it.servicio, Number(it.toneladas.toFixed(3)), it.tarifa, Math.round(it.valor)])
      }
      aoa.push(["", `Subtotal ${g.owner}`, Number(g.ton.toFixed(3)), "", Math.round(g.total)])
      aoa.push([])
    }
    aoa.push(["", "TOTAL PREFACTURA", Number(prefSel.totalTon.toFixed(3)), "", Math.round(prefSel.totalVal)])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "PREFACTURA")
    // TABLA ORIGEN de lo SELECCIONADO (soporte).
    const origen = pref.origen
      .filter((l) => prefSel.keys.has(keyRes(l.owner, l.servicio)))
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
    XLSX.writeFile(wb, `Prefactura_${proyecto.replace(/[^a-zA-Z0-9]+/g, "_")}.xlsx`)
  }

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
                onChange={(e) => setEmpresaId(e.target.value ? Number(e.target.value) : null)}
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
              <Label className="text-xs">Operación</Label>
              <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={pending.tipooperacion ?? ""} onChange={(e) => setF("tipooperacion", e.target.value)}>
                <option value="">Todas</option>
                {OPERACIONES.map((o) => (
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

      {loading ? (
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
      ) : !data || data.filas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No hay órdenes procesadas para este proyecto con los filtros aplicados.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <StatCard l="Valor a facturar" v={money(t!.valor_a_facturar)} sub={`${t!.ordenes} órdenes`} />
            <StatCard l="Facturado" v={money(t!.val_facturado)} icon={CheckCircle2} color="text-emerald-600" />
            <StatCard l="En proceso" v={money(t!.val_en_proceso)} icon={Clock} color="text-amber-600" />
            <StatCard l="Sin gestionar" v={money(t!.val_sin_gestionar)} icon={AlertTriangle} color="text-red-600" sub={`${t!.ordenes_sin_gestionar} órdenes 🔴`} rojo={t!.val_sin_gestionar > 0} />
            <StatCard l="Órdenes sin tarifa" v={String(t!.ordenes_sin_tarifa)} icon={AlertTriangle} color="text-red-600" sub="revisar maestro" rojo={t!.ordenes_sin_tarifa > 0} />
          </div>

          <Tabs defaultValue="owner">
            <TabsList>
              <TabsTrigger value="owner">Resumen por owner</TabsTrigger>
              <TabsTrigger value="detalle">Detalle por orden</TabsTrigger>
              <TabsTrigger value="prefactura">Prefactura</TabsTrigger>
            </TabsList>

            <TabsContent value="owner">
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Owner</TableHead>
                        <TableHead className="text-right">Órdenes</TableHead>
                        <TableHead className="text-right">Toneladas</TableHead>
                        <TableHead className="text-right">Valor a facturar</TableHead>
                        <TableHead className="text-right">Facturado</TableHead>
                        <TableHead className="text-right">En proceso</TableHead>
                        <TableHead className="text-right">Sin gestionar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.porOwner.map((o) => (
                        <TableRow key={o.owner}>
                          <TableCell className="font-medium">{o.owner}</TableCell>
                          <TableCell className="text-right tabular-nums">{o.ordenes}</TableCell>
                          <TableCell className="text-right tabular-nums">{ton(o.toneladas)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{money(o.valor_a_facturar)}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700">{money(o.val_facturado)}</TableCell>
                          <TableCell className="text-right tabular-nums text-amber-700">{money(o.val_en_proceso)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-semibold ${o.val_sin_gestionar > 0 ? "bg-red-50 text-red-700 dark:bg-red-950/40" : "text-muted-foreground"}`}>
                            {money(o.val_sin_gestionar)}
                          </TableCell>
                        </TableRow>
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
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Tarifa</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.filas.slice(0, 500).map((f, i) => {
                        const rojo = f.categoria === "sin_gestionar" || f.sin_tarifa
                        return (
                          <TableRow key={`${f.numeroorden}-${f.owner}-${i}`} className={rojo ? "bg-red-50 dark:bg-red-950/30" : ""}>
                            <TableCell className="text-xs font-medium">{f.numeroorden}</TableCell>
                            <TableCell className="text-xs">{f.fecha ?? "-"}</TableCell>
                            <TableCell className="text-xs">{f.placa ?? "-"}</TableCell>
                            <TableCell className="text-xs">{f.tiquete ?? "-"}</TableCell>
                            <TableCell className="text-xs">{f.tipooperacion ?? "-"}</TableCell>
                            <TableCell className="text-xs">{f.owner}</TableCell>
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
                              {f.categoria === "sin_gestionar" ? (
                                <span className="font-semibold text-red-600">Sin gestionar</span>
                              ) : (
                                <span className="text-muted-foreground">{f.estadofactura}</span>
                              )}
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

            {/* PREFACTURA interactiva: elegir qué facturar y verlo armado aquí. */}
            <TabsContent value="prefactura" className="space-y-3">
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-base font-bold">Prefactura</div>
                      <div className="text-xs text-muted-foreground">
                        Elige owner y servicio a facturar; la prefactura se arma abajo. Descárgala a Excel cuando esté lista.
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={generarPrefactura} disabled={prefLoading}>
                        {prefLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                        {pref ? "Actualizar" : "Generar prefactura"}
                      </Button>
                      <Button size="sm" onClick={descargarPrefacturaExcel} disabled={!pref || !prefSel || prefSel.keys.size === 0}>
                        <Download className="mr-2 h-4 w-4" /> Descargar Excel
                      </Button>
                    </div>
                  </div>

                  {!pref ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Genera la prefactura para elegir qué facturar.
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {/* Selección */}
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qué facturar</span>
                          <div className="flex gap-2 text-xs">
                            <button className="text-primary hover:underline" onClick={() => setSelKeys(new Set(pref.resumen.map((x) => keyRes(x.owner, x.servicio))))}>
                              Todo
                            </button>
                            <button className="text-primary hover:underline" onClick={() => setSelKeys(new Set())}>
                              Nada
                            </button>
                          </div>
                        </div>
                        <div className="overflow-x-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead>Owner</TableHead>
                                <TableHead>Servicio</TableHead>
                                <TableHead className="text-right">Ton</TableHead>
                                <TableHead className="text-right">Tarifa</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pref.resumen.map((x) => {
                                const k = keyRes(x.owner, x.servicio)
                                return (
                                  <TableRow key={k} className={selKeys.has(k) ? "" : "opacity-50"}>
                                    <TableCell>
                                      <input type="checkbox" className="h-4 w-4 accent-primary" checked={selKeys.has(k)} onChange={() => toggleSel(k)} />
                                    </TableCell>
                                    <TableCell className="text-xs font-medium">{x.owner}</TableCell>
                                    <TableCell className="text-xs">{x.servicio}</TableCell>
                                    <TableCell className="text-right text-xs tabular-nums">{ton(x.toneladas)}</TableCell>
                                    <TableCell className="text-right text-xs tabular-nums">{money(x.tarifa)}</TableCell>
                                    <TableCell className="text-right text-xs font-semibold tabular-nums">{money(x.valor)}</TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      {/* Prefactura armada (formateada) */}
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prefactura</span>
                        <div className="mt-1 rounded-md border p-3">
                          <div className="mb-2 border-b pb-2">
                            <div className="text-sm font-bold">{empresas.find((e) => e.id === empresaId)?.nombre || `Empresa ${empresaId}`}</div>
                            <div className="text-xs text-muted-foreground">
                              Período: {filtros.desde || "inicio"} a {filtros.hasta || "fin"}
                            </div>
                          </div>
                          {!prefSel || prefSel.grupos.length === 0 ? (
                            <div className="py-6 text-center text-xs text-muted-foreground">Selecciona qué facturar.</div>
                          ) : (
                            <>
                              {prefSel.grupos.map((g) => (
                                <div key={g.owner} className="mb-3">
                                  <div className="text-xs font-bold text-foreground">{g.owner}</div>
                                  <table className="w-full text-xs">
                                    <tbody>
                                      {g.items.map((it) => (
                                        <tr key={it.servicio}>
                                          <td className="py-0.5 pl-2 text-muted-foreground">{it.servicio}</td>
                                          <td className="py-0.5 text-right tabular-nums">{ton(it.toneladas)} t</td>
                                          <td className="py-0.5 text-right tabular-nums text-muted-foreground">× {money(it.tarifa)}</td>
                                          <td className="py-0.5 text-right font-medium tabular-nums">{money(it.valor)}</td>
                                        </tr>
                                      ))}
                                      <tr className="border-t">
                                        <td className="py-0.5 pl-2 font-semibold">Subtotal {g.owner}</td>
                                        <td className="py-0.5 text-right tabular-nums">{ton(g.ton)} t</td>
                                        <td></td>
                                        <td className="py-0.5 text-right font-semibold tabular-nums">{money(g.total)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                              <div className="mt-2 flex items-center justify-between border-t-2 border-primary/40 pt-2">
                                <span className="text-sm font-bold">TOTAL PREFACTURA</span>
                                <span className="text-lg font-extrabold tabular-nums text-primary">{money(prefSel.totalVal)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
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
