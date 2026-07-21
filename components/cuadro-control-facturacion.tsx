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
  type ControlFacturacion,
  type CategoriaFactura,
  type FiltrosControl,
} from "@/lib/facturacion-control-actions"

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

  const cargar = useCallback(async () => {
    if (!selectedEmpresaId) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const r = await getControlFacturacion(selectedEmpresaId, filtros)
    if (r.success && r.data) setData(r.data)
    else toast({ title: "Error", description: r.message, variant: "destructive" })
    setLoading(false)
  }, [selectedEmpresaId, filtros, toast])

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

  // Anexo por owner (soporte de la factura). Una hoja por owner con su detalle.
  const exportarAnexos = () => {
    if (!data) return
    const wb = XLSX.utils.book_new()
    for (const o of data.porOwner) {
      const rows = data.filas
        .filter((f) => f.owner === o.owner)
        .map((f) => ({
          Fecha: f.fecha ?? "",
          "Orden de cargue": f.numeroorden,
          Placa: f.placa ?? "",
          Tiquete: f.tiquete ?? "",
          Operación: f.tipooperacion ?? "",
          Owner: f.owner,
          Cliente: f.cliente ?? "",
          Cantidad: Number(f.toneladas.toFixed(3)),
          Tarifa: f.sin_tarifa ? "SIN TARIFA" : f.tarifa,
          Total: Math.round(f.valor_a_facturar),
          Estado: f.estadofactura ?? "(sin gestionar)",
        }))
      const sheet = XLSX.utils.json_to_sheet(rows)
      const nombre = o.owner.substring(0, 28).replace(/[\\/?*[\]:]/g, "")
      XLSX.utils.book_append_sheet(wb, sheet, nombre || "Owner")
    }
    XLSX.writeFile(wb, `Anexos_Facturacion_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">Cuadro de Control de Facturación</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportarDetalle} disabled={!data || data.filas.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Detalle
            </Button>
            <Button size="sm" variant="outline" onClick={exportarAnexos} disabled={!data || data.filas.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Anexos por owner
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
      ) : !selectedEmpresaId ? (
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
