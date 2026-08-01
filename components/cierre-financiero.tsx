"use client"

// CIERRE FINANCIERO (pestaña del Cuadro de Control de Facturación).
//
// Lo PAGADO contra lo FACTURADO del proyecto elegido en el selector DEL MÓDULO
// (no el global), por día y acumulado del mes, proceso por proceso, con el
// estado real de la gestión de facturas y las alarmas de control. El cálculo
// vive en lib/cierre-financiero-actions.ts y REUSA los motores del Cuadro y de
// la Conciliación: las pestañas tienen que cuadrar entre sí.
//
// Reemplaza a la tarjeta de cierre del día (components/cierre-diario.tsx): todo
// lo que la tarjeta mostraba está aquí, más el acumulado y la gestión de
// facturas.

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KpiCard } from "@/components/orders/dashboard-pedidos/kpi-card"
import {
  AlertTriangle,
  Banknote,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  getCierreFinanciero,
  type AlertaCierre,
  type CierreFinanciero as CierreData,
  type CierreProyecto,
  type LineaProceso,
} from "@/lib/cierre-financiero-actions"

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO")
const moneyS = (n: number) =>
  (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(Number(n) || 0)).toLocaleString("es-CO")

/** Hoy en Bogotá — mismo criterio que el server action. */
function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
}

const REFRESH_MS = 60_000

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

function Margen({ v, className = "" }: { v: number | null; className?: string }) {
  if (v === null) return <span className="text-muted-foreground">—</span>
  const c = v < 0 ? "text-red-600 font-semibold" : "text-emerald-700"
  return <span className={`${c} ${className}`}>{moneyS(v)}</span>
}

function TablaProcesos({ vista }: { vista: CierreProyecto }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const toggle = (k: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev)
      if (s.has(k)) s.delete(k)
      else s.add(k)
      return s
    })

  const totCobroDia = vista.cobroDia
  const totCobroMes = vista.cobroMes
  const totOpDia = vista.procesos.reduce((a, p) => a + p.costoOpDia, 0)
  const totOpMes = vista.procesos.reduce((a, p) => a + p.costoOpMes, 0)
  const totAdDia = vista.procesos.reduce((a, p) => a + p.costoAdDia, 0)
  const totAdMes = vista.procesos.reduce((a, p) => a + p.costoAdMes, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pagado vs facturado por proceso</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cada proceso tiene asignado su recurso: cómo se paga y cómo se factura. Festivo y Sin registro no facturan por
          definición: su costo resta en el TOTAL, no en un margen propio.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="min-w-[230px]">Proceso</TableHead>
                <TableHead className="text-center border-l" colSpan={3}>
                  Día
                </TableHead>
                <TableHead className="text-center border-l" colSpan={4}>
                  Acumulado del mes
                </TableHead>
              </TableRow>
              <TableRow className="text-[11px]">
                <TableHead />
                <TableHead className="text-right border-l">Cobro</TableHead>
                <TableHead className="text-right">Nómina</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                <TableHead className="text-right border-l">Cobro</TableHead>
                <TableHead className="text-right">Nómina operativa</TableHead>
                <TableHead className="text-right">Nómina administrativa</TableHead>
                <TableHead className="text-right">Margen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vista.procesos.map((p: LineaProceso) => {
                const abierto = abiertos.has(p.proceso)
                const costoDia = p.costoOpDia + p.costoAdDia
                return (
                  <>
                    <TableRow
                      key={p.proceso}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => toggle(p.proceso)}
                    >
                      <TableCell>
                        <div className="flex items-start gap-1.5">
                          {abierto ? (
                            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <div>
                            <div className="text-xs font-medium">{p.etiqueta}</div>
                            <div className="text-[10px] text-muted-foreground">
                              paga: {p.comoPaga} · factura: {p.comoFactura}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs border-l">{money(p.cobroDia)}</TableCell>
                      <TableCell className="text-right text-xs">{money(costoDia)}</TableCell>
                      <TableCell className="text-right text-xs">
                        <Margen v={p.margenDia} />
                      </TableCell>
                      <TableCell className="text-right text-xs border-l">{money(p.cobroMes)}</TableCell>
                      <TableCell className="text-right text-xs">{money(p.costoOpMes)}</TableCell>
                      <TableCell className="text-right text-xs">{money(p.costoAdMes)}</TableCell>
                      <TableCell className="text-right text-xs">
                        <Margen v={p.margenMes} />
                      </TableCell>
                    </TableRow>
                    {abierto &&
                      p.detalle.map((d) => (
                        <TableRow key={`${p.proceso}-${d.nombre}`} className="bg-muted/20">
                          <TableCell className="pl-8 text-[11px] text-muted-foreground">{d.nombre}</TableCell>
                          <TableCell className="text-right text-[11px] border-l">{d.cobroDia ? money(d.cobroDia) : ""}</TableCell>
                          <TableCell className="text-right text-[11px]">{d.costoDia ? money(d.costoDia) : ""}</TableCell>
                          <TableCell />
                          <TableCell className="text-right text-[11px] border-l">{d.cobroMes ? money(d.cobroMes) : ""}</TableCell>
                          <TableCell className="text-right text-[11px]" colSpan={2}>
                            {d.costoMes ? money(d.costoMes) : ""}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      ))}
                  </>
                )
              })}
              <TableRow className="border-t-2 font-semibold">
                <TableCell className="text-xs">TOTAL {vista.proyecto}</TableCell>
                <TableCell className="text-right text-xs border-l">{money(totCobroDia)}</TableCell>
                <TableCell className="text-right text-xs">{money(totOpDia + totAdDia)}</TableCell>
                <TableCell className="text-right text-xs">
                  <Margen v={vista.margenDia} />
                </TableCell>
                <TableCell className="text-right text-xs border-l">{money(totCobroMes)}</TableCell>
                <TableCell className="text-right text-xs">{money(totOpMes)}</TableCell>
                <TableCell className="text-right text-xs">{money(totAdMes)}</TableCell>
                <TableCell className="text-right text-xs">
                  <Margen v={vista.margenMes} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          El bono de destajo (excedente de la quincena) se reparte entre los días con tonelaje de cada persona,
          proporcional a su producción, para que la suma de los días cuadre peso a peso con la quincena. Con carga
          prestacional del estado de resultados ({money(vista.costoProvisionadoMes)} en el mes), el margen queda en{" "}
          <Margen v={vista.margenProvisionadoMes} className="text-[10px]" />.
        </p>
      </CardContent>
    </Card>
  )
}

function GraficoMes({ vista }: { vista: CierreProyecto }) {
  if (vista.serie.length < 2) return null
  const data = vista.serie.map((s) => ({ ...s, dia: s.fecha.slice(8, 10) }))
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Evolución del mes — cobrado vs pagado (acumulado)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={10}
                width={70}
                tickFormatter={(v: number) => "$" + (v / 1_000_000).toFixed(0) + "M"}
              />
              <Tooltip
                formatter={(v: any, name: any) => [money(Number(v)), name]}
                labelFormatter={(l: any) => `Día ${l}`}
                contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="cobroAcum"
                name="Cobrado acumulado"
                stroke="#059669"
                fill="#05966922"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="costoAcum"
                name="Nómina acumulada"
                stroke="#e11d48"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Si la línea de nómina cruza por encima del área de cobro, ese día el proyecto pagó más de lo que cobró.
        </p>
      </CardContent>
    </Card>
  )
}

function GestionFacturas({ vista }: { vista: CierreProyecto }) {
  const [verPendientes, setVerPendientes] = useState(false)
  const f = vista.facturas
  const pendienteValor = f.enProceso.valor + f.sinGestionar.valor
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Gestión de facturas — facturado vs pendiente (últimos 90 días)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Facturado = con factura Siigo cargada, el mismo criterio del Cuadro. Todo lo demás está pendiente y envejece
          desde el día del cargue.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-[11px] text-muted-foreground">Facturado (Siigo)</div>
            <div className="text-lg font-bold">{money(f.facturado.valor)}</div>
            <div className="text-[11px] text-muted-foreground">{f.facturado.ordenes} órdenes · no recobrar</div>
          </div>
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="text-[11px] text-amber-800 dark:text-amber-300">En proceso (solicitada, sin Siigo)</div>
            <div className="text-lg font-bold text-amber-900 dark:text-amber-200">{money(f.enProceso.valor)}</div>
            <div className="text-[11px] text-amber-800/80 dark:text-amber-300/80">{f.enProceso.ordenes} órdenes</div>
          </div>
          <div className="rounded-md border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
            <div className="text-[11px] text-red-800 dark:text-red-300">Sin gestionar</div>
            <div className="text-lg font-bold text-red-900 dark:text-red-200">{money(f.sinGestionar.valor)}</div>
            <div className="text-[11px] text-red-800/80 dark:text-red-300/80">{f.sinGestionar.ordenes} órdenes</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead>Antigüedad de lo pendiente</TableHead>
                <TableHead className="text-right">Órdenes</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f.antiguedad.map((t) => (
                <TableRow key={t.tramo}>
                  <TableCell className="text-xs">{t.tramo}</TableCell>
                  <TableCell className="text-right text-xs">{t.ordenes}</TableCell>
                  <TableCell className={`text-right text-xs ${t.valor > 0 && t.tramo !== "0-15 días" ? "font-semibold text-red-600" : ""}`}>
                    {money(t.valor)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t font-semibold">
                <TableCell className="text-xs">
                  Total pendiente {f.maxDiasSinFactura > 0 ? `· la más vieja lleva ${f.maxDiasSinFactura} días` : ""}
                </TableCell>
                <TableCell className="text-right text-xs">{f.enProceso.ordenes + f.sinGestionar.ordenes}</TableCell>
                <TableCell className="text-right text-xs text-red-600">{money(pendienteValor)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {f.pendientes.length > 0 && (
          <div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setVerPendientes((v) => !v)}>
              {verPendientes ? "Ocultar" : "Ver"} las {f.pendientes.length} pendientes más viejas
            </Button>
            {verPendientes && (
              <div className="mt-2 max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[11px]">
                      <TableHead>Orden</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Cargue</TableHead>
                      <TableHead className="text-right">Días</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {f.pendientes.map((o) => (
                      <TableRow key={`${o.proyecto}-${o.numeroorden}`}>
                        <TableCell className="text-xs font-mono">{o.numeroorden}</TableCell>
                        <TableCell className="text-xs">{o.proyecto}</TableCell>
                        <TableCell className="text-xs">{o.fecha ?? ""}</TableCell>
                        <TableCell className={`text-right text-xs ${o.dias > 15 ? "font-semibold text-red-600" : ""}`}>
                          {o.dias}
                        </TableCell>
                        <TableCell className="text-xs">
                          {o.categoria === "en_proceso" ? (
                            <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700">
                              En proceso
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-red-400 text-[10px] text-red-700">
                              Sin gestionar
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">{money(o.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Alertas({ vista }: { vista: CierreProyecto }) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  if (!vista.alertas.length && !vista.notas.length) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          Sin alertas de control en el período. Todo cuadra.
        </CardContent>
      </Card>
    )
  }
  const toggle = (k: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev)
      if (s.has(k)) s.delete(k)
      else s.add(k)
      return s
    })
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Cuadre y alertas</CardTitle>
        <p className="text-xs text-muted-foreground">
          Lo que no cuadra entre nómina, facturación y gestión de facturas. Todo sale de las mismas fuentes que pagan y
          cobran: es auditable línea a línea.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {vista.alertas.map((a: AlertaCierre, i) => {
          const k = `${a.tipo}-${i}`
          const abierta = abiertas.has(k)
          const rojo = a.nivel === "rojo"
          return (
            <div
              key={k}
              className={`rounded-md border p-2.5 ${
                rojo
                  ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                  : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
              }`}
            >
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                onClick={() => toggle(k)}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${rojo ? "text-red-600" : "text-amber-600"}`}
                  />
                  <div>
                    <div className={`text-xs font-medium ${rojo ? "text-red-900 dark:text-red-200" : "text-amber-900 dark:text-amber-200"}`}>
                      {a.titulo}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {a.cantidad > 0 ? `${a.cantidad} caso(s)` : ""}
                      {a.cantidad > 0 && a.valor > 0 ? " · " : ""}
                      {a.valor > 0 ? money(a.valor) : ""}
                    </div>
                  </div>
                </div>
                {a.detalle.length > 0 &&
                  (abierta ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ))}
              </button>
              {abierta && a.detalle.length > 0 && (
                <ul className="mt-2 max-h-48 space-y-0.5 overflow-auto pl-6 text-[11px] text-muted-foreground">
                  {a.detalle.map((d, j) => (
                    <li key={j}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
        {vista.notas.length > 0 && (
          <div className="rounded-md border border-border/60 p-2.5">
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">Notas del cálculo</div>
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {vista.notas.map((n, i) => (
                <li key={i}>· {n}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TablaProyectos({ data }: { data: CierreData }) {
  if (data.proyectos.length < 2) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Por proyecto</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead>Proyecto</TableHead>
                <TableHead className="text-right border-l">Cobro día</TableHead>
                <TableHead className="text-right">Nómina día</TableHead>
                <TableHead className="text-right">Margen día</TableHead>
                <TableHead className="text-right border-l">Cobro mes</TableHead>
                <TableHead className="text-right">Nómina mes</TableHead>
                <TableHead className="text-right">Margen mes</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.proyectos.map((p) => (
                <TableRow key={p.idempresa} className={p.margenDia < 0 || p.margenMes < 0 ? "bg-red-50 dark:bg-red-950/20" : ""}>
                  <TableCell className="text-xs font-medium">{p.proyecto}</TableCell>
                  <TableCell className="text-right text-xs border-l">{money(p.cobroDia)}</TableCell>
                  <TableCell className="text-right text-xs">{money(p.costoDia)}</TableCell>
                  <TableCell className="text-right text-xs">
                    <Margen v={p.margenDia} />
                  </TableCell>
                  <TableCell className="text-right text-xs border-l">{money(p.cobroMes)}</TableCell>
                  <TableCell className="text-right text-xs">{money(p.costoMes)}</TableCell>
                  <TableCell className="text-right text-xs">
                    <Margen v={p.margenMes} />
                  </TableCell>
                  <TableCell className="text-right text-xs">{p.margenPctMes !== null ? `${p.margenPctMes}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// La pestaña
// ---------------------------------------------------------------------------

export function CierreFinanciero({ empresaId }: { empresaId: number | null }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [alcance, setAlcance] = useState<"proyecto" | "todos">("proyecto")
  const [data, setData] = useState<CierreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const montado = useRef(true)

  const cargar = useCallback(
    async (silencioso: boolean) => {
      if (alcance === "proyecto" && !empresaId) {
        setData(null)
        setLoading(false)
        return
      }
      if (!silencioso) setLoading(true)
      const r = await getCierreFinanciero(alcance === "proyecto" ? empresaId : null, fecha)
      if (!montado.current) return
      if (r.success && r.data) {
        setData(r.data)
        setError(null)
      } else if (!silencioso) {
        setData(null)
        setError(r.message || "No se pudo armar el cierre financiero.")
      }
      setLoading(false)
    },
    [empresaId, fecha, alcance],
  )

  useEffect(() => {
    montado.current = true
    cargar(false)
    const t = fecha === hoyISO() ? setInterval(() => cargar(true), REFRESH_MS) : null
    return () => {
      montado.current = false
      if (t) clearInterval(t)
    }
  }, [cargar, fecha])

  const vista: CierreProyecto | null = data ? (data.total ?? data.proyectos[0] ?? null) : null

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label className="text-[11px]">Fecha del cierre</Label>
          <Input
            type="date"
            className="h-8 w-[150px] text-xs"
            value={fecha}
            max={hoyISO()}
            onChange={(e) => setFecha(e.target.value || hoyISO())}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px]">Alcance</Label>
          <div className="flex rounded-md border">
            <Button
              variant={alcance === "proyecto" ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-r-none text-xs"
              onClick={() => setAlcance("proyecto")}
            >
              Este proyecto
            </Button>
            <Button
              variant={alcance === "todos" ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-l-none text-xs"
              onClick={() => setAlcance("todos")}
            >
              Todos
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => cargar(false)}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refrescar
        </Button>
        {data?.esHoy && (
          <span className="text-[11px] text-muted-foreground">Se actualiza solo cada minuto mientras sea hoy.</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Armando el cierre financiero…
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-red-600">{error}</CardContent>
        </Card>
      ) : alcance === "proyecto" && !empresaId ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Selecciona un proyecto arriba para ver su cierre.
          </CardContent>
        </Card>
      ) : !vista || !data ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Sin datos para el período.</CardContent>
        </Card>
      ) : (
        <>
          {/* Alarma principal: se paga más de lo que se cobra */}
          {(vista.margenDia < 0 || vista.margenMes < 0) && (
            <div className="flex items-start gap-2 rounded-md border border-red-400 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/40">
              <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div className="text-sm text-red-900 dark:text-red-200">
                <span className="font-semibold">
                  {vista.margenMes < 0
                    ? `En lo corrido del mes se está pagando más de lo que se cobra: margen ${moneyS(vista.margenMes)}.`
                    : `Hoy se está pagando más de lo que se cobra: margen del día ${moneyS(vista.margenDia)}.`}
                </span>{" "}
                Revisa la tabla por proceso para ver de dónde sale la diferencia.
              </div>
            </div>
          )}

          {/* Semáforo */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={`Cobro del ${data.fecha.slice(8, 10)}`}
              value={money(vista.cobroDia)}
              subtext={`Mes: ${money(vista.cobroMes)}`}
              icon={Banknote}
              variant="primary"
            />
            <KpiCard
              label="Nómina del día"
              value={money(vista.costoDia)}
              subtext={`Mes: ${money(vista.costoMes)} · con prestaciones ${money(vista.costoProvisionadoMes)}`}
              icon={Wallet}
              variant="primary"
            />
            <KpiCard
              label="Margen del día"
              value={moneyS(vista.margenDia)}
              subtext={`Mes: ${moneyS(vista.margenMes)}${vista.margenPctMes !== null ? ` (${vista.margenPctMes}%)` : ""}`}
              icon={vista.margenDia < 0 ? TrendingDown : TrendingUp}
              variant={vista.margenDia < 0 ? "danger" : "success"}
            />
            <KpiCard
              label="Facturado de verdad (Siigo)"
              value={money(vista.facturas.facturado.valor)}
              subtext={`Pendiente: ${money(vista.facturas.enProceso.valor + vista.facturas.sinGestionar.valor)}${
                vista.facturas.maxDiasSinFactura > 0 ? ` · hasta ${vista.facturas.maxDiasSinFactura} días` : ""
              }`}
              icon={FileCheck2}
              variant={vista.facturas.sinGestionar.valor > 0 ? "warning" : "success"}
            />
          </div>

          {alcance === "todos" && <TablaProyectos data={data} />}
          <TablaProcesos vista={vista} />
          <GraficoMes vista={vista} />
          <GestionFacturas vista={vista} />
          <Alertas vista={vista} />
        </>
      )}
    </div>
  )
}
