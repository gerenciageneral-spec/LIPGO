"use client"

// Gestión Financiera › Conciliación Avimol.
// Avimol tiene un modelo asimétrico: se PAGA por turnos (Estibado PT /
// Salvado) y se COBRA por producción (ingresos de tolva valorizados por
// tonelada). Esta pantalla cruza ambos lados día por día, en dinero, con el
// desglose de productos facturados y de personas del turno al expandir el día.

import { Fragment, useCallback, useEffect, useState } from "react"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, ChevronRight, Loader2, Scale, TrendingDown, TrendingUp } from "lucide-react"
import {
  getConciliacionAvimol,
  type ConciliacionAvimolData,
  type AlertaAvimol,
} from "@/lib/conciliacion-avimol-actions"

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO")
const moneyS = (n: number) =>
  (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(Number(n) || 0)).toLocaleString("es-CO")
const ton = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 3 })
const kg = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })

function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
}

const TITULO_ALERTA: Record<AlertaAvimol["tipo"], string> = {
  lote_invalido: "Lote sin fecha válida",
  sin_tarifa: "Sin tarifa vigente",
  sin_liquidar: "Turno no liquidado",
}

export default function ConciliacionAvimol() {
  const { toast } = useToast()
  const hoy = hoyISO()
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01")
  const [hasta, setHasta] = useState(hoy)
  const [data, setData] = useState<ConciliacionAvimolData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expand, setExpand] = useState<Set<string>>(new Set())

  const consultar = useCallback(async () => {
    setLoading(true)
    setError(null)
    setExpand(new Set())
    const r = await getConciliacionAvimol(desde, hasta)
    setLoading(false)
    if (r.success && r.data) setData(r.data)
    else {
      setData(null)
      setError(r.message || "Error desconocido al armar la conciliación.")
      toast({ title: "No se pudo armar la conciliación", description: r.message, variant: "destructive" })
    }
  }, [desde, hasta, toast])

  useEffect(() => {
    consultar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleExpand = (k: string) =>
    setExpand((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const r = data?.resumen
  const alertasPorTipo = (data?.alertas || []).reduce<Record<string, AlertaAvimol[]>>((acc, a) => {
    ;(acc[a.tipo] ||= []).push(a)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Scale className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Conciliación Avimol</h1>
          <p className="text-sm text-muted-foreground">
            Lo que se cobra por producción (ingresos de tolva × tarifa por tonelada) vs. lo que se paga en turnos
            de Estibado PT y Salvado, día por día.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label>Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-[160px]" />
          </div>
          <div className="space-y-1">
            <Label>Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-[160px]" />
          </div>
          <Button onClick={consultar} disabled={loading} className="min-w-[130px]">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scale className="mr-2 h-4 w-4" />}
            Conciliar
          </Button>
          <Badge variant="outline" className="ml-auto">
            Proyecto: Avimol (id 2)
          </Badge>
        </CardContent>
      </Card>

      {data && r && (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Kpi
              label="Toneladas de ingreso"
              value={`${ton(r.tonTotal)} t`}
              hint={`${kg(r.kgTotal)} kg · ${ton(r.tonEstibado)} t Estibado · ${ton(r.tonSalvado)} t Salvado`}
            />
            <Kpi label="Cobro a Avimol" value={money(r.cobro)} hint="producción × tarifa por tonelada" />
            <Kpi
              label="Pago de turnos"
              value={money(r.pagoTotal)}
              hint={`base ${money(r.pagoBase)} · extras ${money(r.pagoRecargos)}`}
            />
            <Kpi
              label="Margen"
              value={moneyS(r.margen)}
              hint={`${r.margenPct >= 0 ? "+" : ""}${r.margenPct.toFixed(1)}% sobre el cobro`}
              tone={r.margen >= 0 ? "up" : "down"}
            />
            <Kpi
              label="Días en pérdida"
              value={String(r.diasMargenNegativo)}
              hint={`de ${r.diasConDatos} día(s) · ${r.personasDistintas} persona(s)`}
              tone={r.diasMargenNegativo > 0 ? "down" : "up"}
            />
          </div>

          {/* Alertas */}
          {Object.entries(alertasPorTipo).map(([tipo, lista]) => (
            <Card key={tipo} className="border-amber-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  {TITULO_ALERTA[tipo as AlertaAvimol["tipo"]]} ({lista.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-muted-foreground">
                  {lista.slice(0, 50).map((a, i) => (
                    <li key={i}>{a.detalle}</li>
                  ))}
                </ul>
                {lista.length > 50 && (
                  <p className="mt-1 text-xs text-muted-foreground">…y {lista.length - 50} más.</p>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Día por día */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cruce por día — {data.dias.length} día(s)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Ton Estibado PT</TableHead>
                    <TableHead className="text-right">Ton Salvado</TableHead>
                    <TableHead className="text-right">Ton total</TableHead>
                    <TableHead className="text-right">Kg total</TableHead>
                    <TableHead className="text-right">Cobro</TableHead>
                    <TableHead className="text-right">Pago turnos</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                    <TableHead className="text-right">Personas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {data.dias.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-20 text-center text-sm text-muted-foreground">
                        Sin ingresos de producción ni turnos de Estibado PT/Salvado en el rango.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.dias.map((d) => {
                      const abierto = expand.has(d.fecha)
                      return (
                        <Fragment key={d.fecha}>
                          <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => toggleExpand(d.fecha)}>
                            <TableCell className="whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                <ChevronRight
                                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${abierto ? "rotate-90" : ""}`}
                                />
                                {d.fecha}
                                {d.esFestivo && (
                                  <Badge variant="outline" className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                                    {d.motivoFestivo}
                                  </Badge>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{ton(d.tonEstibado)}</TableCell>
                            <TableCell className="text-right">{ton(d.tonSalvado)}</TableCell>
                            <TableCell className="text-right font-medium">{ton(d.tonTotal)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{kg(d.kgTotal)}</TableCell>
                            <TableCell className="text-right font-medium">{money(d.cobro)}</TableCell>
                            <TableCell className="text-right">{money(d.pagoTotal)}</TableCell>
                            <TableCell
                              className={`text-right font-semibold ${d.margen < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}
                            >
                              {moneyS(d.margen)}
                            </TableCell>
                            <TableCell className="text-right">{d.personas}</TableCell>
                          </TableRow>

                          {abierto && (
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={9} className="px-2 py-3">
                                <div className="grid gap-3 lg:grid-cols-2">
                                  {/* Producción facturada */}
                                  <div className="rounded border bg-background">
                                    <div className="border-b px-2 py-1.5 text-xs font-semibold">
                                      Producción facturada — {money(d.cobro)}
                                    </div>
                                    <div className="max-h-64 overflow-auto">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="text-xs">Producto</TableHead>
                                            <TableHead className="text-right text-xs">Bultos</TableHead>
                                            <TableHead className="text-right text-xs">Kg</TableHead>
                                            <TableHead className="text-right text-xs">Ton</TableHead>
                                            <TableHead className="text-xs">Tarifa aplicada</TableHead>
                                            <TableHead className="text-right text-xs">$/t</TableHead>
                                            <TableHead className="text-right text-xs">Cobro</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody className="tabular-nums">
                                          {d.productos.length === 0 ? (
                                            <TableRow>
                                              <TableCell colSpan={7} className="h-12 text-center text-xs text-muted-foreground">
                                                Sin ingresos de producción este día.
                                              </TableCell>
                                            </TableRow>
                                          ) : (
                                            d.productos.map((p, i) => (
                                              <TableRow key={i}>
                                                <TableCell className="text-xs">{p.nombreproducto}</TableCell>
                                                <TableCell className="text-right text-xs">{kg(p.bultos)}</TableCell>
                                                <TableCell className="text-right text-xs">{kg(p.kg)}</TableCell>
                                                <TableCell className="text-right text-xs font-medium">{ton(p.toneladas)}</TableCell>
                                                <TableCell className="text-xs">{p.operacion}</TableCell>
                                                <TableCell className="text-right text-xs">
                                                  {p.tarifa > 0 ? money(p.tarifa) : <span className="text-rose-500">sin tarifa</span>}
                                                </TableCell>
                                                <TableCell className="text-right text-xs font-medium">{money(p.cobro)}</TableCell>
                                              </TableRow>
                                            ))
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>

                                  {/* Personal del turno */}
                                  <div className="rounded border bg-background">
                                    <div className="border-b px-2 py-1.5 text-xs font-semibold">
                                      Personal del turno — {money(d.pagoTotal)}
                                    </div>
                                    <div className="max-h-64 overflow-auto">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="text-xs">Persona</TableHead>
                                            <TableHead className="text-xs">Puesto</TableHead>
                                            <TableHead className="text-right text-xs">Base día</TableHead>
                                            <TableHead className="text-right text-xs">H. extra</TableHead>
                                            <TableHead className="text-right text-xs">$ extra</TableHead>
                                            <TableHead className="text-right text-xs">Dominical</TableHead>
                                            <TableHead className="text-right text-xs">Total día</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody className="tabular-nums">
                                          {d.detallePersonas.length === 0 ? (
                                            <TableRow>
                                              <TableCell colSpan={7} className="h-12 text-center text-xs text-muted-foreground">
                                                Sin turnos de Estibado PT/Salvado liquidados este día.
                                              </TableCell>
                                            </TableRow>
                                          ) : (
                                            d.detallePersonas.map((p, i) => (
                                              <TableRow key={i}>
                                                <TableCell className="text-xs font-medium">
                                                  {p.persona}
                                                  {p.novedad && (
                                                    <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                                                      {p.novedad.slice(0, 20)}
                                                    </span>
                                                  )}
                                                </TableCell>
                                                <TableCell className="text-xs">{p.puesto}</TableCell>
                                                <TableCell className="text-right text-xs">{money(p.baseDia)}</TableCell>
                                                <TableCell className="text-right text-xs">
                                                  {p.horasExtra > 0 ? p.horasExtra.toFixed(2) : "—"}
                                                </TableCell>
                                                <TableCell className="text-right text-xs">
                                                  {p.valorExtra > 0 ? money(p.valorExtra) : "—"}
                                                </TableCell>
                                                <TableCell className="text-right text-xs">
                                                  {p.dominical > 0 ? money(p.dominical) : "—"}
                                                </TableCell>
                                                <TableCell className="text-right text-xs font-medium">{money(p.totalDia)}</TableCell>
                                              </TableRow>
                                            ))
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                El <strong>cobro</strong> sale de los ingresos de producción aprobados (<code>invtrans</code>,
                origen "ingreso producción"), fechados por el <strong>lote</strong> (YYYYMMDD) y valorizados con la
                tarifa por tonelada de <code>tarifasoperacion</code>: los productos MOGOLLA van a{" "}
                <strong>Salvado</strong> y el resto a <strong>Estibado PT</strong>, en su variante{" "}
                <em>Festivo</em> los domingos y festivos de ley. El <strong>pago</strong> es lo que liquida{" "}
                <code>pagonomina</code> para los turnos de esos dos puestos. Toca un día para ver el detalle.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-2 py-6 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <div className="font-medium text-destructive">No se pudo armar la conciliación</div>
              <div className="mt-1 text-muted-foreground">{error}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: "up" | "down"
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "up" ? "text-emerald-600 dark:text-emerald-400" : tone === "down" ? "text-rose-600 dark:text-rose-400" : ""}`}
        >
          {tone === "up" && <TrendingUp className="mr-1 inline h-4 w-4" />}
          {tone === "down" && <TrendingDown className="mr-1 inline h-4 w-4" />}
          {value}
        </div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}
