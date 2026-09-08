"use client"

// "Prestaciones Sociales · Personal Activo" (dentro de Parafiscales): prima,
// cesantías e intereses de cesantías REALES para personal ACTIVO -- distinto
// de Liquidaciones (que solo dispara al RETIRO). Mismo patrón "valor real"
// que el resto del sistema: se proyecta un cálculo (misma fórmula que ya
// valida Liquidaciones), se puede ajustar por persona, y se marca el periodo
// como pagado cuando Siigo lo liquida de verdad -- ese valor real es luego lo
// que usan Estado de Resultados / Cierre Financiero en vez de la provisión
// estimada. Ver lib/prestaciones-activos-actions.ts.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { Loader2, Wallet, RefreshCw, CheckCircle2, Clock, BadgeCheck } from "lucide-react"
import {
  generarCalculoPrestacionesActivos,
  getPrestacionesActivosPeriodo,
  guardarValorRealPrestacionActivo,
  marcarPeriodoPagado,
  type ConceptoPrestacion,
  type PrestacionActivoPersona,
} from "@/lib/prestaciones-activos-actions"

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })

/** Semestre/año de PRIMA o CESANTÍAS que contiene `fecha` (formato YYYY-MM-DD). */
function periodoPrima(fecha: string): { desde: string; hasta: string } {
  const anio = Number(fecha.slice(0, 4))
  const enSemestre2 = fecha >= `${anio}-07-01`
  return enSemestre2 ? { desde: `${anio}-07-01`, hasta: `${anio}-12-31` } : { desde: `${anio}-01-01`, hasta: `${anio}-06-30` }
}
function periodoCesantias(fecha: string): { desde: string; hasta: string } {
  const anio = Number(fecha.slice(0, 4))
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
}

const CONCEPTOS: { value: ConceptoPrestacion; label: string }[] = [
  { value: "prima", label: "Prima de servicios" },
  { value: "cesantias", label: "Cesantías" },
  { value: "intereses_cesantias", label: "Intereses de cesantías" },
]

export default function PrestacionesActivos() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const hoy = new Date().toISOString().slice(0, 10)

  const [concepto, setConcepto] = useState<ConceptoPrestacion>("prima")
  const periodoDefault = useMemo(
    () => (concepto === "prima" ? periodoPrima(hoy) : periodoCesantias(hoy)),
    [concepto, hoy],
  )
  const [periodoDesde, setPeriodoDesde] = useState(periodoDefault.desde)
  const [periodoHasta, setPeriodoHasta] = useState(periodoDefault.hasta)
  useEffect(() => {
    setPeriodoDesde(periodoDefault.desde)
    setPeriodoHasta(periodoDefault.hasta)
  }, [periodoDefault])

  const [data, setData] = useState<PrestacionActivoPersona[]>([])
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [marcandoPagada, setMarcandoPagada] = useState(false)
  const [fechaPago, setFechaPago] = useState(hoy)
  const [editReal, setEditReal] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await getPrestacionesActivosPeriodo(concepto, periodoDesde, periodoHasta, selectedEmpresaId)
    if (r.success) setData(r.data)
    setLoading(false)
  }, [concepto, periodoDesde, periodoHasta, selectedEmpresaId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const generar = async () => {
    setGenerando(true)
    const r = await generarCalculoPrestacionesActivos(concepto, periodoDesde, periodoHasta, selectedEmpresaId)
    setGenerando(false)
    if (r.success) {
      toast({ title: "Cálculo generado", description: `${r.personas ?? 0} personas proyectadas.` })
      await cargar()
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const guardarReal = async (p: PrestacionActivoPersona) => {
    const raw = editReal[p.identificacion]
    const valor = raw === undefined || raw.trim() === "" ? null : Number(raw)
    if (valor != null && !Number.isFinite(valor)) {
      toast({ title: "Valor inválido", variant: "destructive" })
      return
    }
    setGuardando(p.identificacion)
    const r = await guardarValorRealPrestacionActivo({
      identificacion: p.identificacion,
      concepto,
      periodo_desde: periodoDesde,
      periodo_hasta: periodoHasta,
      valor_real: valor,
    })
    setGuardando(null)
    if (r.success) {
      await cargar()
      toast({ title: "Guardado" })
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const marcarPagada = async () => {
    setMarcandoPagada(true)
    const r = await marcarPeriodoPagado(concepto, periodoDesde, periodoHasta, fechaPago)
    setMarcandoPagada(false)
    if (r.success) {
      toast({ title: "Periodo marcado como pagado", description: `Estado de Resultados usará estos valores desde ahora.` })
      await cargar()
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const totalCalculado = data.reduce((s, p) => s + p.valor_calculado, 0)
  const totalReal = data.reduce((s, p) => s + (p.valor_real ?? p.valor_calculado), 0)
  const estaPagada = data.length > 0 && data.every((p) => p.estado === "pagada")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5 text-primary" /> Prestaciones Sociales · Personal Activo
        </CardTitle>
        <Button size="sm" variant="outline" onClick={cargar} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Prima, cesantías e intereses de cesantías del personal ACTIVO (distinto de Liquidaciones, que solo aplica
          al retiro) — misma fórmula legal, anclada al periodo de calendario. Se proyecta, se puede ajustar el valor
          real por persona, y al marcar el periodo como pagado ese valor pasa a usarse en Estado de Resultados en
          vez de la provisión estimada.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Concepto</Label>
            <Select value={concepto} onValueChange={(v) => setConcepto(v as ConceptoPrestacion)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONCEPTOS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Periodo desde</Label>
            <DatePickerField className="h-9 w-40" value={periodoDesde} onChange={setPeriodoDesde} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Periodo hasta</Label>
            <DatePickerField className="h-9 w-40" value={periodoHasta} onChange={setPeriodoHasta} />
          </div>
          <Button size="sm" onClick={generar} disabled={generando}>
            {generando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Generar cálculo del periodo
          </Button>
        </div>

        {data.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3 md:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">Personas</div>
                <div className="text-lg font-bold">{data.length}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total calculado</div>
                <div className="text-lg font-bold tabular-nums">{money(totalCalculado)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total (real donde exista)</div>
                <div className="text-lg font-bold tabular-nums text-primary">{money(totalReal)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Estado del periodo</div>
                <div className="text-sm font-semibold">
                  {estaPagada ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Pagada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <Clock className="h-4 w-4" /> Proyectada
                    </span>
                  )}
                </div>
              </div>
            </div>

            {!estaPagada && (
              <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fecha real de pago</Label>
                  <DatePickerField className="h-9 w-40" value={fechaPago} onChange={setFechaPago} />
                </div>
                <Button size="sm" variant="default" onClick={marcarPagada} disabled={marcandoPagada}>
                  {marcandoPagada ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Marcar periodo como pagado
                </Button>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trabajador</TableHead>
                  <TableHead className="text-right">Calculado</TableHead>
                  <TableHead className="text-right">Valor real</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p) => (
                  <TableRow key={p.identificacion}>
                    <TableCell>
                      <div className="font-medium">{p.persona}</div>
                      <div className="text-xs text-muted-foreground">{p.identificacion}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.valor_calculado)}</TableCell>
                    <TableCell className="text-right">
                      {p.estado === "pagada" ? (
                        <span className="inline-flex items-center gap-1 justify-end tabular-nums">
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                          {money(p.valor_real ?? p.valor_calculado)}
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            className="h-8 w-32 text-right"
                            placeholder="calculado"
                            value={editReal[p.identificacion] ?? (p.valor_real != null ? String(p.valor_real) : "")}
                            onChange={(e) => setEditReal((prev) => ({ ...prev, [p.identificacion]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            disabled={guardando === p.identificacion}
                            onClick={() => guardarReal(p)}
                          >
                            {guardando === p.identificacion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "✓"}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {p.estado === "pagada" ? (
                        <span className="text-emerald-600">Pagada {p.fecha_pago}</span>
                      ) : (
                        <span className="text-amber-600">Proyectada</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {data.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            Sin cálculo generado para este periodo todavía. Usa "Generar cálculo del periodo".
          </p>
        )}
      </CardContent>
    </Card>
  )
}
