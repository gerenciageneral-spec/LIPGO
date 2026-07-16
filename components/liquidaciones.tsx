"use client"

// Submódulo "Liquidaciones": lista las personas retiradas (estado Inactivo) con
// sus novedades de nómina pendientes (desde pagonomina, hasta su fecha de retiro)
// y el total a pagar. Detalle expandible por persona + export a Excel. Solo lee.

import { useCallback, useEffect, useMemo, useState, Fragment } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Download, ChevronDown, ChevronRight, UserMinus } from "lucide-react"
import * as XLSX from "xlsx"
import { getLiquidaciones, type LiquidacionPersona } from "@/lib/liquidaciones-actions"

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

  const cargar = useCallback(async () => {
    if (!selectedEmpresaId) return
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

  const totalGeneral = useMemo(() => data.reduce((s, p) => s + p.total, 0), [data])

  const exportar = () => {
    try {
      const headers = [
        "Persona",
        "Identificación",
        "Fecha retiro",
        "Fecha",
        "Actividad",
        "Novedad",
        "Base día",
        "HED",
        "HEDF",
        "HEN",
        "HEF",
        "HN",
        "Pago domingo",
        "Recargo dominical",
        "Total día",
      ]
      const rows: (string | number)[][] = []
      for (const p of data) {
        if (p.novedades.length === 0) {
          rows.push([p.persona, p.identificacion, p.fecha_retiro || "", "", "", "(sin novedades pendientes)", 0, 0, 0, 0, 0, 0, 0, 0, 0])
          continue
        }
        for (const n of p.novedades) {
          rows.push([
            p.persona,
            p.identificacion,
            p.fecha_retiro || "",
            n.fecha || "",
            n.actividad_registrada || "",
            n.novedad_reportada || "",
            n.base_dia,
            n.hed,
            n.hedf,
            n.hen,
            n.hef,
            n.hn,
            n.pago_domingo,
            n.recargodominical,
            n.total_liquidado_dia,
          ])
        }
      }
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Liquidaciones")
      ws["!cols"] = [28, 16, 12, 12, 22, 24, 14, 10, 10, 10, 10, 10, 14, 16, 16].map((wch) => ({ wch }))
      XLSX.writeFile(wb, `liquidaciones-${new Date().toISOString().split("T")[0]}.xlsx`)
      toast({ title: "Éxito", description: "Archivo exportado correctamente" })
    } catch {
      toast({ title: "Error", description: "Error al exportar archivo", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4">
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
            retiro. Estas personas ya no aparecen en el archivo plano; su pago se gestiona aquí.
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

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Retirados</p>
              <p className="text-2xl font-bold tabular-nums">{data.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Total a liquidar</p>
              <p className="text-2xl font-bold tabular-nums text-primary">{money(totalGeneral)}</p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No hay personal retirado para esta empresa.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((p) => (
                    <Fragment key={p.persona}>
                      <TableRow className="cursor-pointer" onClick={() => toggle(p.persona)}>
                        <TableCell>
                          {expanded.has(p.persona) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{p.persona}</TableCell>
                        <TableCell className="font-mono text-sm">{p.identificacion}</TableCell>
                        <TableCell className="font-mono text-sm">{p.fecha_retiro || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.dias}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{money(p.total)}</TableCell>
                      </TableRow>
                      {expanded.has(p.persona) && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30 p-0">
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
