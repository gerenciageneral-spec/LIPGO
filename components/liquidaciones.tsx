"use client"

// Submódulo "Liquidaciones": personas retiradas CON contrato (nº SIIGO),
// separadas por cliente. Muestra la nómina PENDIENTE de pago y las PRESTACIONES
// SOCIALES (prima, cesantías, intereses, vacaciones) como columnas, con % de ley
// editables. Por persona: "Pagado hasta", marcar Liquidada/Pendiente, adjuntar
// soporte. Detalle expandible + export a Excel.

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
  Save,
  SlidersHorizontal,
  Scale,
} from "lucide-react"
import * as XLSX from "xlsx"
import {
  getLiquidaciones,
  guardarEstadoLiquidacion,
  guardarPagadoHasta,
  guardarParametrosPrestaciones,
  subirSoporteLiquidacion,
  type LiquidacionPersona,
  type ParametrosPrestaciones,
} from "@/lib/liquidaciones-actions"

const money = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PARAMS_DEFAULT: ParametrosPrestaciones = {
  pctPrima: 8.33,
  pctCesantias: 8.33,
  pctInteresesCesantias: 12,
  pctVacaciones: 4.17,
  incluyeAux: true,
}

export default function Liquidaciones() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [data, setData] = useState<LiquidacionPersona[]>([])
  const [params, setParams] = useState<ParametrosPrestaciones>(PARAMS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [savingParams, setSavingParams] = useState(false)
  const [showParams, setShowParams] = useState(false)
  const [showNomenclatura, setShowNomenclatura] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadTarget = useRef<LiquidacionPersona | null>(null)

  const cargar = useCallback(async () => {
    if (!selectedEmpresaId) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)
    const r = await getLiquidaciones(selectedEmpresaId)
    if (r.success) {
      setData(r.data)
      if (r.params) setParams(r.params)
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
    setLoading(false)
  }, [selectedEmpresaId, toast])

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
      totalNomina: pendientes.reduce((s, p) => s + p.total, 0),
      totalPrestaciones: pendientes.reduce((s, p) => s + p.prestaciones, 0),
      totalLiquidar: pendientes.reduce((s, p) => s + p.total_liquidacion, 0),
    }
  }, [data])

  const guardarParams = async () => {
    setSavingParams(true)
    const r = await guardarParametrosPrestaciones(params)
    setSavingParams(false)
    if (r.success) {
      toast({ title: "Parámetros guardados", description: "Se recalcularon las prestaciones." })
      await cargar()
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const cambiarEstado = async (p: LiquidacionPersona) => {
    setBusy(p.identificacion)
    const nuevo = p.estado === "liquidada" ? "pendiente" : "liquidada"
    const r = await guardarEstadoLiquidacion({
      idempresa: p.idempresa,
      identificacion: p.identificacion,
      persona: p.persona,
      fecha_retiro: p.fecha_retiro,
      total: p.total_liquidacion,
      estado: nuevo,
    })
    setBusy(null)
    if (r.success) {
      setData((prev) => prev.map((x) => (x.identificacion === p.identificacion ? { ...x, estado: nuevo } : x)))
      toast({ title: "Actualizado", description: `Marcada como ${nuevo}.` })
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const cambiarPagadoHasta = async (p: LiquidacionPersona, value: string) => {
    setBusy(p.identificacion)
    const r = await guardarPagadoHasta({
      idempresa: p.idempresa,
      identificacion: p.identificacion,
      persona: p.persona,
      fecha_retiro: p.fecha_retiro,
      pagado_hasta: value || null,
    })
    setBusy(null)
    if (r.success) {
      await cargar()
      toast({ title: "Actualizado", description: value ? `Pagado hasta ${value}.` : "Se borró la fecha de pago." })
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const pedirSoporte = (p: LiquidacionPersona) => {
    uploadTarget.current = p
    fileInputRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const p = uploadTarget.current
    e.target.value = ""
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
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const exportar = () => {
    try {
      const headers = [
        "Persona",
        "Identificación",
        "Fecha retiro",
        "Estado",
        "Nómina pendiente",
        "Prima",
        "Cesantías",
        "Intereses cesantías",
        "Vacaciones",
        "Total prestaciones",
        "Total a pagar",
        "Soporte",
      ]
      const rows = data.map((p) => [
        p.persona,
        p.identificacion,
        p.fecha_retiro || "",
        p.estado,
        p.total,
        p.prima,
        p.cesantias,
        p.intereses,
        p.vacaciones,
        p.prestaciones,
        p.total_liquidacion,
        p.soporte_url || "",
      ])
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Liquidaciones")
      ws["!cols"] = [26, 15, 12, 11, 16, 14, 14, 16, 14, 16, 16, 40].map((wch) => ({ wch }))
      XLSX.writeFile(wb, `liquidaciones-${new Date().toISOString().split("T")[0]}.xlsx`)
      toast({ title: "Éxito", description: "Archivo exportado correctamente" })
    } catch {
      toast({ title: "Error", description: "Error al exportar archivo", variant: "destructive" })
    }
  }

  const setP = (k: keyof ParametrosPrestaciones, v: number | boolean) => setParams((prev) => ({ ...prev, [k]: v }))

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={onFileChange} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserMinus className="h-5 w-5 text-primary" /> Liquidaciones de personal retirado
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowNomenclatura((s) => !s)}>
              <Scale className="mr-2 h-4 w-4" /> Nomenclatura legal
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowParams((s) => !s)}>
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Parámetros de ley
            </Button>
            <Button size="sm" variant="outline" onClick={exportar} disabled={loading || data.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Exportar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Retirados <strong>con contrato</strong> (nº SIIGO) y su liquidación: <strong>nómina pendiente</strong>{" "}
            (posterior a "Pagado hasta") + <strong>prestaciones sociales</strong> (prima, cesantías, intereses,
            vacaciones) sobre el devengado del período de causación.
          </p>

          {/* Parámetros de ley (prestaciones) */}
          {showParams && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4 text-primary" /> Porcentajes de prestaciones (ley colombiana)
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  { k: "pctPrima" as const, l: "Prima %" },
                  { k: "pctCesantias" as const, l: "Cesantías %" },
                  { k: "pctInteresesCesantias" as const, l: "Interés ces. % (anual)" },
                  { k: "pctVacaciones" as const, l: "Vacaciones %" },
                ].map((f) => (
                  <div key={f.k} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{f.l}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={params[f.k] as number}
                      onChange={(e) => setP(f.k, Number(e.target.value))}
                    />
                  </div>
                ))}
                <div className="flex items-end">
                  <Button size="sm" onClick={guardarParams} disabled={savingParams}>
                    {savingParams ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Base = devengado (salario + extras + recargos) + auxilio de transporte. <strong>Vacaciones</strong> (CST
                art. 192) va sobre el <strong>salario ordinario</strong>: excluye horas extras, trabajo dominical/festivo
                y el auxilio. Causación: cesantías/vacaciones desde 1-ene del año del retiro; prima desde 1-ene o 1-jul
                según el semestre. Ver <strong>Nomenclatura legal</strong> para el detalle.
              </p>
            </div>
          )}

          {/* Hoja de NOMENCLATURA LEGAL — base normativa de cada concepto (siempre prima la ley) */}
          {showNomenclatura && (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <Scale className="h-4 w-4 text-primary" /> Nomenclatura legal de la liquidación
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Fundamento normativo de cada concepto (Código Sustantivo del Trabajo — Ministerio de Trabajo de
                Colombia). <strong>Siempre prima la ley.</strong>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-2 py-1.5 font-medium">Concepto</th>
                      <th className="px-2 py-1.5 font-medium">Norma</th>
                      <th className="px-2 py-1.5 font-medium">Base de cálculo</th>
                      <th className="px-2 py-1.5 font-medium">Fórmula / criterio</th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {[
                      {
                        c: "Nómina pendiente",
                        n: "Pago quincenal (1–15 / 16–fin)",
                        b: "Devengado real de LIPgo (tarifa por tonelada / turno)",
                        f: "Novedades posteriores a “Pagado hasta” y hasta la fecha de retiro (la quincena en curso).",
                      },
                      {
                        c: "Prima de servicios",
                        n: "CST art. 306 · Ley 1788 de 2016",
                        b: "Salario + auxilio de transporte",
                        f: "1 mes de salario por año (15 días/semestre), proporcional. 1er semestre pagado al 30-jun → retiro en junio descuenta los días pagados de más.",
                      },
                      {
                        c: "Cesantías",
                        n: "CST art. 249 · Ley 50 de 1990",
                        b: "Salario + extras + recargos + auxilio de transporte",
                        f: "1 mes de salario por año, proporcional (devengado × 8.33%). Se causan desde el 1-ene del año del retiro.",
                      },
                      {
                        c: "Intereses a las cesantías",
                        n: "Ley 52 de 1975",
                        b: "Valor de las cesantías del período",
                        f: "12% anual sobre las cesantías, proporcional al tiempo (× días/360).",
                      },
                      {
                        c: "Vacaciones",
                        n: "CST art. 186 · 189 · 192",
                        b: "Salario ORDINARIO (excluye horas extras, trabajo dominical/festivo y auxilio de transporte)",
                        f: "15 días hábiles por año, compensables en dinero al retiro, proporcional a los días laborados de TODO el vínculo, menos los días ya disfrutados.",
                      },
                    ].map((r) => (
                      <tr key={r.c} className="border-b border-border/50">
                        <td className="px-2 py-2 font-medium text-foreground">{r.c}</td>
                        <td className="px-2 py-2 text-muted-foreground">{r.n}</td>
                        <td className="px-2 py-2 text-muted-foreground">{r.b}</td>
                        <td className="px-2 py-2 text-muted-foreground">{r.f}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>
                  <strong>Incapacidades EPS/ARL</strong> y <strong>descansos/festivos</strong> se reconocen como 1 día de
                  salario (ya vienen en el devengado de LIPgo).
                </li>
                <li>
                  Los <strong>4 primeros días de enero</strong> (que no existen en el sistema) se rellenan a 1 día de
                  salario básico, solo para quienes ingresaron en 2025.
                </li>
                <li>
                  Auxilio de transporte y SMLV vigentes por año (tabla <em>parametros_legales_anio</em>); porcentajes de
                  prestaciones editables en “Parámetros de ley”.
                </li>
              </ul>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Retirados</p>
              <p className="text-2xl font-bold tabular-nums">{kpis.retirados}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <p className="text-2xl font-bold tabular-nums text-amber-600">{kpis.pendientes}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Nómina pendiente</p>
              <p className="text-xl font-bold tabular-nums text-foreground">{money(kpis.totalNomina)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Prestaciones</p>
              <p className="text-xl font-bold tabular-nums text-foreground">{money(kpis.totalPrestaciones)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Total a liquidar</p>
              <p className="text-xl font-bold tabular-nums text-primary">{money(kpis.totalLiquidar)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Persona</TableHead>
                  <TableHead>Cédula</TableHead>
                  <TableHead>Retiro</TableHead>
                  <TableHead className="text-right">Nómina pend.</TableHead>
                  <TableHead className="text-right">Prima</TableHead>
                  <TableHead className="text-right">Cesantías</TableHead>
                  <TableHead className="text-right">Intereses</TableHead>
                  <TableHead className="text-right">Vacaciones</TableHead>
                  <TableHead className="text-right">Total a pagar</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                      No hay personal retirado con contrato para esta empresa.
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
                        <TableCell className="font-mono text-xs">{p.identificacion}</TableCell>
                        <TableCell className="font-mono text-xs">{p.fecha_retiro || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.prima)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.cesantias)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.intereses)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.vacaciones)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{money(p.total_liquidacion)}</TableCell>
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
                            <Button size="sm" variant="outline" disabled={busy === p.identificacion} onClick={() => pedirSoporte(p)}>
                              {busy === p.identificacion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              size="sm"
                              variant={p.estado === "liquidada" ? "outline" : "default"}
                              disabled={busy === p.identificacion}
                              onClick={() => cambiarEstado(p)}
                            >
                              {p.estado === "liquidada" ? "Reabrir" : "Liquidar"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded.has(p.persona) && (
                        <TableRow>
                          <TableCell colSpan={12} className="bg-muted/30 p-0">
                            <div className="space-y-2 p-3">
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-muted-foreground">Pagado hasta:</span>
                                <Input
                                  type="date"
                                  className="h-8 w-40"
                                  value={p.pagado_hasta || ""}
                                  max={p.fecha_retiro || undefined}
                                  disabled={busy === p.identificacion}
                                  onChange={(e) => cambiarPagadoHasta(p, e.target.value)}
                                />
                                <span className="text-xs text-muted-foreground">
                                  Novedades <strong>posteriores</strong> a esta fecha (nómina pendiente), hasta el retiro.
                                </span>
                              </div>
                              {p.novedades.length === 0 ? (
                                <div className="text-sm text-muted-foreground">Sin novedades de nómina pendientes.</div>
                              ) : (
                                <div className="overflow-x-auto">
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
                            </div>
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
