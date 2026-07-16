"use client"

// Submódulo "Liquidaciones": personas retiradas (estado Inactivo) con sus
// novedades de nómina pendientes (desde pagonomina, hasta su fecha de retiro) y
// el total a pagar. Por persona: marcar Pendiente/Liquidada y adjuntar/ver el
// soporte de liquidación. Detalle expandible + export a Excel.

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Loader2,
  Download,
  ChevronDown,
  ChevronRight,
  UserMinus,
  CheckCircle2,
  Clock,
  Upload,
  FileText,
} from "lucide-react"
import * as XLSX from "xlsx"
import { getLiquidaciones, guardarEstadoLiquidacion, subirSoporteLiquidacion, type LiquidacionPersona } from "@/lib/liquidaciones-actions"

const money = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Liquidaciones() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [data, setData] = useState<LiquidacionPersona[]>([])
  const [loading, setLoading] = useState(true)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null) // identificacion en proceso
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadTarget = useRef<LiquidacionPersona | null>(null)

  // Separado por cliente: muestra los retirados de la empresa (cliente) seleccionada.
  const cargar = useCallback(async () => {
    if (!selectedEmpresaId) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)
    const r = await getLiquidaciones(selectedEmpresaId, desde || null, hasta || null)
    if (r.success) setData(r.data)
    else toast({ title: "Error", description: r.message, variant: "destructive" })
    setLoading(false)
  }, [selectedEmpresaId, desde, hasta, toast])

  useEffect(() => {
    cargar()
  }, [cargar])

  const toggle = (persona: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(persona) ? next.delete(persona) : next.add(persona)
      return next
    })

  const kpis = useMemo(() => {
    const pendientes = data.filter((p) => p.estado === "pendiente")
    return {
      retirados: data.length,
      pendientes: pendientes.length,
      liquidadas: data.length - pendientes.length,
      totalPendiente: pendientes.reduce((s, p) => s + p.total, 0),
    }
  }, [data])

  const cambiarEstado = async (p: LiquidacionPersona) => {
    setBusy(p.identificacion)
    const nuevo = p.estado === "liquidada" ? "pendiente" : "liquidada"
    const r = await guardarEstadoLiquidacion({
      idempresa: p.idempresa,
      identificacion: p.identificacion,
      persona: p.persona,
      fecha_retiro: p.fecha_retiro,
      total: p.total,
      estado: nuevo,
    })
    setBusy(null)
    if (r.success) {
      setData((prev) => prev.map((x) => (x.identificacion === p.identificacion ? { ...x, estado: nuevo } : x)))
      toast({ title: "Actualizado", description: `Marcada como ${nuevo}.` })
    } else {
      toast({ title: "Error", description: r.message, variant: "destructive" })
    }
  }

  const pedirSoporte = (p: LiquidacionPersona) => {
    uploadTarget.current = p
    fileInputRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const p = uploadTarget.current
    e.target.value = "" // permite re-subir el mismo archivo
    if (!file || !p) return
    setBusy(p.identificacion)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("idempresa", String(p.idempresa ?? ""))
    fd.append("identificacion", p.identificacion)
    fd.append("persona", p.persona)
    fd.append("fecha_retiro", p.fecha_retiro || "")
    const r = await subirSoporteLiquidacion(fd)
    setBusy(null)
    if (r.success && r.url) {
      setData((prev) =>
        prev.map((x) => (x.identificacion === p.identificacion ? { ...x, soporte_url: r.url!, soporte_nombre: file.name } : x)),
      )
      toast({ title: "Soporte adjuntado", description: file.name })
    } else {
      toast({ title: "Error", description: r.message, variant: "destructive" })
    }
  }

  const exportar = () => {
    try {
      const headers = ["Persona", "Identificación", "Fecha retiro", "Estado", "Días", "Total", "Soporte"]
      const rows = data.map((p) => [
        p.persona,
        p.identificacion,
        p.fecha_retiro || "",
        p.estado,
        p.dias,
        p.total,
        p.soporte_url || "",
      ])
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Liquidaciones")
      ws["!cols"] = [28, 16, 12, 12, 8, 16, 40].map((wch) => ({ wch }))
      XLSX.writeFile(wb, `liquidaciones-${new Date().toISOString().split("T")[0]}.xlsx`)
      toast({ title: "Éxito", description: "Archivo exportado correctamente" })
    } catch {
      toast({ title: "Error", description: "Error al exportar archivo", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={onFileChange} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserMinus className="h-5 w-5 text-primary" /> Liquidaciones de personal retirado
          </CardTitle>
          <Button size="sm" variant="outline" onClick={exportar} disabled={loading || data.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Personas retiradas (estado Inactivo) con sus novedades de nómina pendientes hasta su fecha de
            retiro. Marca cada una como <strong>Liquidada</strong> o <strong>Pendiente</strong> y adjunta el
            soporte de la liquidación. Ya no aparecen en el archivo plano.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            {loading && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Retirados</p>
              <p className="text-2xl font-bold tabular-nums">{kpis.retirados}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <p className="text-2xl font-bold tabular-nums text-amber-600">{kpis.pendientes}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Liquidadas</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-600">{kpis.liquidadas}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Total pendiente</p>
              <p className="text-2xl font-bold tabular-nums text-primary">{money(kpis.totalPendiente)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Persona</TableHead>
                  <TableHead>Identificación</TableHead>
                  <TableHead>Fecha retiro</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      No hay personal retirado para esta empresa.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((p) => (
                    <Fragment key={p.identificacion || p.persona}>
                      <TableRow>
                        <TableCell className="cursor-pointer" onClick={() => toggle(p.persona)}>
                          {expanded.has(p.persona) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="font-medium">{p.persona}</TableCell>
                        <TableCell className="font-mono text-sm">{p.identificacion}</TableCell>
                        <TableCell className="font-mono text-sm">{p.fecha_retiro || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.dias}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{money(p.total)}</TableCell>
                        <TableCell>
                          {p.estado === "liquidada" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Liquidada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                              <Clock className="h-3 w-3" /> Pendiente
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {p.soporte_url && (
                              <a
                                href={p.soporte_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                title={p.soporte_nombre || "Soporte"}
                              >
                                <FileText className="h-3.5 w-3.5" /> Ver
                              </a>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === p.identificacion}
                              onClick={() => pedirSoporte(p)}
                            >
                              {busy === p.identificacion ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                              <span className="ml-1 hidden sm:inline">Soporte</span>
                            </Button>
                            <Button
                              size="sm"
                              variant={p.estado === "liquidada" ? "outline" : "default"}
                              disabled={busy === p.identificacion}
                              onClick={() => cambiarEstado(p)}
                            >
                              {p.estado === "liquidada" ? "Reabrir" : "Marcar liquidada"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded.has(p.persona) && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30 p-0">
                            {p.novedades.length === 0 ? (
                              <div className="p-3 text-sm text-muted-foreground">Sin novedades pendientes en el rango.</div>
                            ) : (
                              <div className="overflow-x-auto p-2">
                                <table className="w-full text-xs">
                                  <thead className="text-left text-muted-foreground">
                                    <tr>
                                      <th className="px-2 py-1">Fecha</th>
                                      <th className="px-2 py-1">Novedad</th>
                                      <th className="px-2 py-1 text-right">Base día</th>
                                      <th className="px-2 py-1 text-right">Extras+recargos</th>
                                      <th className="px-2 py-1 text-right">Total día</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.novedades.map((n, i) => (
                                      <tr key={i} className="border-t border-border/50">
                                        <td className="whitespace-nowrap px-2 py-1 font-mono">{n.fecha}</td>
                                        <td className="px-2 py-1">{n.novedad_reportada || n.actividad_registrada || "—"}</td>
                                        <td className="px-2 py-1 text-right tabular-nums">{money(n.base_dia)}</td>
                                        <td className="px-2 py-1 text-right tabular-nums">
                                          {money(n.hed + n.hedf + n.hen + n.hef + n.hn + n.pago_domingo + n.recargodominical)}
                                        </td>
                                        <td className="px-2 py-1 text-right font-medium tabular-nums">{money(n.total_liquidado_dia)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
