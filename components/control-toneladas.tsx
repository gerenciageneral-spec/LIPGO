"use client"

// Operación LIP › Control de Toneladas.
// Vista OPERATIVA para el coordinador: toneladas por día y acumuladas por
// trabajador, para gestionar personal (quién mueve menos, quién es más
// eficiente, qué vehículos atendió, en qué órdenes). Lee `getControlToneladas`
// (lib/control-toneladas-actions.ts), que reutiliza la MISMA fórmula que ya
// paga nómina — el número aquí nunca diverge del de Revisión de Nómina.
// El proyecto lo define el SELECTOR GLOBAL de la app (igual que Panel LIP
// Operación): el coordinador solo ve el suyo, no hay opción "Todo LIP" aquí.

import { Fragment, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronRight, Loader2, Scale, Truck, Users, Gauge, LayoutGrid, Clock, CheckCircle2 } from "lucide-react"
import { getControlToneladas, getRitmoEnVivo, type TrabajadorToneladas, type RitmoEnVivo } from "@/lib/control-toneladas-actions"

const TODOS = "__todos__"
const BOGOTA_TZ = "America/Bogota"
const t2 = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })

// Fechas SIEMPRE en hora Colombia, sin pasar por el huso horario del
// navegador/servidor: `Date#toISOString()` convierte a UTC, así que después
// de las 7pm hora Colombia (UTC-5) ya cae en "mañana" en UTC y el filtro
// "Hoy" cogía el día siguiente. `hoyBogota()` lee la fecha real de Bogotá con
// Intl, y toda la aritmética de calendario se hace con Date.UTC (un
// calculador neutral, nunca se reconvierte a hora local).
function hoyBogota() {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  const [y, m, d] = iso.split("-").map(Number)
  return { y, m: m - 1, d } // m: mes 0-indexado, como Date
}
const isoUTC = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
const hoyISO = () => {
  const { y, m, d } = hoyBogota()
  return isoUTC(y, m, d)
}
const fechaCorta = (isoStr: string) => {
  const [a, m, d] = isoStr.split("-")
  return `${d}/${m}/${a}`
}

export default function ControlToneladas() {
  const { toast } = useToast()
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()

  const [desde, setDesde] = useState(() => {
    const { y, m } = hoyBogota()
    return isoUTC(y, m, 1)
  })
  const [hasta, setHasta] = useState(() => {
    const { y, m } = hoyBogota()
    return isoUTC(y, m + 1, 0)
  })
  const [trabajadorFiltro, setTrabajadorFiltro] = useState(TODOS)
  const [loading, setLoading] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [trabajadores, setTrabajadores] = useState<TrabajadorToneladas[]>([])
  const [expand, setExpand] = useState<Set<string>>(new Set())
  const [ritmo, setRitmo] = useState<RitmoEnVivo | null>(null)

  const consultar = async () => {
    if (!selectedEmpresaId) return
    setLoading(true)
    const r = await getControlToneladas(selectedEmpresaId, desde, hasta)
    setLoading(false)
    setCargado(true)
    if (r.success && r.data) {
      setTrabajadores(r.data.trabajadores)
      setExpand(new Set())
      setTrabajadorFiltro(TODOS)
    } else {
      setTrabajadores([])
      toast({ title: "No se pudo cargar Control de Toneladas", description: r.message, variant: "destructive" })
    }
  }

  // El proyecto lo define el SELECTOR GLOBAL (conector) de la app: se recarga
  // solo con lo del proyecto activo cuando el usuario lo cambia arriba.
  useEffect(() => {
    consultar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  // Avance en Vivo / Estado de Muelles — siempre es HOY, independiente del
  // filtro de fechas de la tabla histórica de abajo. Refresco cada 60s
  // (mismo intervalo que ya usa Dashboard Gerencia) para que el coordinador
  // no tenga que recargar la página a mano durante el turno.
  useEffect(() => {
    if (!selectedEmpresaId) {
      setRitmo(null)
      return
    }
    let activo = true
    const consultarRitmo = async () => {
      const r = await getRitmoEnVivo(selectedEmpresaId, hoyISO())
      if (activo) setRitmo(r.success && r.data ? r.data : null)
    }
    consultarRitmo()
    const id = setInterval(consultarRitmo, 60_000)
    return () => {
      activo = false
      clearInterval(id)
    }
  }, [selectedEmpresaId])

  const aplicarPreset = (preset: "hoy" | "mes" | "mesAnterior" | "trimestre" | "anio") => {
    const { y, m } = hoyBogota()
    if (preset === "hoy") {
      setDesde(hoyISO())
      setHasta(hoyISO())
    } else if (preset === "mes") {
      setDesde(isoUTC(y, m, 1))
      setHasta(isoUTC(y, m + 1, 0))
    } else if (preset === "mesAnterior") {
      setDesde(isoUTC(y, m - 1, 1))
      setHasta(isoUTC(y, m, 0))
    } else if (preset === "trimestre") {
      setDesde(isoUTC(y, m - 2, 1))
      setHasta(hoyISO())
    } else {
      setDesde(`${y}-01-01`)
      setHasta(hoyISO())
    }
  }

  const toggleExpand = (persona: string) => {
    setExpand((prev) => {
      const next = new Set(prev)
      if (next.has(persona)) next.delete(persona)
      else next.add(persona)
      return next
    })
  }

  const seleccionarTrabajador = (persona: string) => {
    setTrabajadorFiltro(persona)
    // Elegir un trabajador puntual abre directo su historial de órdenes/días.
    setExpand(persona === TODOS ? new Set() : new Set([persona]))
  }

  const nombresTrabajadores = useMemo(
    () => trabajadores.map((t) => t.persona).sort((a, b) => a.localeCompare(b)),
    [trabajadores],
  )
  const trabajadoresFiltrados =
    trabajadorFiltro === TODOS ? trabajadores : trabajadores.filter((t) => t.persona === trabajadorFiltro)
  const variosDias = desde !== hasta

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
          <Scale className="h-5 w-5 text-primary md:h-6 md:w-6" />
          Control de Toneladas
        </h1>
        <p className="text-xs text-muted-foreground md:text-sm">
          Toneladas por día y acumuladas por trabajador — para gestionar personal, identificar bajo desempeño y ver qué
          vehículos y órdenes atendió cada uno.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            Proyecto: {selectedEmpresaId ? selectedEmpresaNombre || `ID ${selectedEmpresaId}` : "sin proyecto"}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            (según el selector de proyecto de la parte superior)
          </span>
        </div>
      </div>

      {!selectedEmpresaId ? (
        <p className="py-6 text-sm text-muted-foreground">
          Selecciona un proyecto en la parte superior de la aplicación para consultar el Control de Toneladas.
        </p>
      ) : (
        <>
          {ritmo && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Gauge className="h-4 w-4 text-primary" />
                    Avance en Vivo — hoy {fechaCorta(hoyISO())}
                  </CardTitle>
                  <Badge
                    className={
                      ritmo.estado === "adelantado"
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : ritmo.estado === "cerca"
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400"
                          : ritmo.estado === "atrasado"
                            ? "bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400"
                            : "bg-muted text-muted-foreground hover:bg-muted"
                    }
                  >
                    {ritmo.estado === "adelantado"
                      ? "Adelantado"
                      : ritmo.estado === "cerca"
                        ? "Cerca"
                        : ritmo.estado === "atrasado"
                          ? "Atrasado"
                          : "Sin datos aún"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-3xl font-bold tabular-nums">{t2(ritmo.tonMovido)}</span>
                  <span className="text-xs text-muted-foreground">t hoy (órdenes ya cerradas)</span>
                  <span className="ml-auto text-right text-xs text-muted-foreground">
                    esperado a esta hora{" "}
                    <span className="font-semibold tabular-nums text-foreground">{t2(ritmo.metaEsperadaAhora)} t</span>
                    {" · "}meta del día{" "}
                    <span className="font-semibold tabular-nums text-foreground">{t2(ritmo.metaTonDia)} t</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      ritmo.estado === "atrasado" ? "bg-rose-500" : ritmo.estado === "cerca" ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, (ritmo.tonMovido / Math.max(ritmo.metaTonDia, 0.01)) * 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-md border bg-background p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Personal real</div>
                    <div className="text-sm font-semibold tabular-nums">{ritmo.headcountReal} aux.</div>
                  </div>
                  <div className="rounded-md border bg-background p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Capacidad</div>
                    <div className="text-sm font-semibold tabular-nums">{t2(ritmo.capacidadTonHora)} t/h</div>
                  </div>
                  <div className="rounded-md border bg-background p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ritmo real</div>
                    <div className="text-sm font-semibold tabular-nums">{t2(ritmo.ritmoTonHoraReloj)} t/h</div>
                  </div>
                  <div className="rounded-md border bg-background p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pendiente</div>
                    <div className="text-sm font-semibold tabular-nums">
                      {ritmo.tonPendienteEstimada > 0 ? `${t2(ritmo.tonPendienteEstimada)} t` : "—"}
                    </div>
                  </div>
                </div>
                {ritmo.vehiculosEnProceso + ritmo.vehiculosEnCola > 0 ? (
                  <p className="flex items-center gap-1.5 border-t pt-2 text-xs text-amber-700 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {ritmo.vehiculosEnProceso} en proceso + {ritmo.vehiculosEnCola} en cola (~{t2(ritmo.tonPendienteEstimada)} t)
                    {ritmo.proyeccionHoraFinCola ? (
                      <>
                        {" "}
                        — patio despejado proyectado <strong className="tabular-nums">{ritmo.proyeccionHoraFinCola}</strong>
                      </>
                    ) : (
                      " — al ritmo actual no alcanza a despejarse hoy"
                    )}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 border-t pt-2 text-xs text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    Sin vehículos pendientes — patio despejado
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {ritmo && ritmo.muelles.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <LayoutGrid className="h-4 w-4 text-primary" />
                  Estado de Muelles — {ritmo.muelles.filter((m) => !m.ocupado).length}/{ritmo.muelles.length} libres
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {ritmo.muelles.map((m) => {
                    const vencido = m.ocupado && m.libreDesde !== null && m.libreDesde < ritmo.horaActual
                    return (
                      <div
                        key={m.muelle}
                        className={`min-w-[112px] flex-1 rounded-lg border p-2.5 ${
                          !m.ocupado
                            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                            : vencido
                              ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                              : "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
                        }`}
                      >
                        <div
                          className={`text-[10px] font-bold uppercase tracking-wide ${
                            !m.ocupado
                              ? "text-emerald-700 dark:text-emerald-400"
                              : vencido
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-rose-700 dark:text-rose-400"
                          }`}
                        >
                          Muelle {m.muelle}
                        </div>
                        {!m.ocupado ? (
                          <div className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Libre</div>
                        ) : (
                          <>
                            <div className="mt-1 font-mono text-xs font-semibold">{m.placa}</div>
                            <div className="text-[10px] text-muted-foreground">{m.tipovehiculo || "—"}</div>
                            <div className={`text-[10px] ${vencido ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                              {vencido ? `SLA vencido (${m.libreDesde})` : `Libre aprox. ${m.libreDesde}`}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 pt-6">
              <div className="space-y-1">
                <Label>Desde</Label>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-[150px] text-sm" />
              </div>
              <div className="space-y-1">
                <Label>Hasta</Label>
                <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-[150px] text-sm" />
              </div>
              <div className="flex flex-wrap gap-1">
                <Button variant="outline" size="sm" onClick={() => aplicarPreset("hoy")}>
                  Hoy
                </Button>
                <Button variant="outline" size="sm" onClick={() => aplicarPreset("mes")}>
                  Este mes
                </Button>
                <Button variant="outline" size="sm" onClick={() => aplicarPreset("mesAnterior")}>
                  Mes anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => aplicarPreset("trimestre")}>
                  Últimos 3 meses
                </Button>
                <Button variant="outline" size="sm" onClick={() => aplicarPreset("anio")}>
                  Historial del año
                </Button>
              </div>
              <div className="space-y-1">
                <Label>Trabajador</Label>
                <Select value={trabajadorFiltro} onValueChange={seleccionarTrabajador}>
                  <SelectTrigger className="w-[230px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos los trabajadores</SelectItem>
                    {nombresTrabajadores.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={consultar} disabled={loading} className="min-w-[130px]">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                Consultar
              </Button>
            </CardContent>
          </Card>

          {cargado && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Toneladas por trabajador — {fechaCorta(desde)} a {fechaCorta(hasta)}
                  {trabajadorFiltro !== TODOS ? ` · ${trabajadorFiltro}` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {trabajadoresFiltrados.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">Sin movimiento de toneladas en el periodo.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Trabajador</TableHead>
                        <TableHead className="text-right">Días trabajados</TableHead>
                        <TableHead className="text-right">Ton acumulada</TableHead>
                        <TableHead className="text-right">Ton/día prom.</TableHead>
                        <TableHead className="text-right">Meta día</TableHead>
                        <TableHead className="text-right">% cumplimiento</TableHead>
                        <TableHead className="text-right"># Vehículos</TableHead>
                        <TableHead className="text-right"># Órdenes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="tabular-nums">
                      {trabajadoresFiltrados.map((t) => {
                        const abierto = expand.has(t.persona)
                        const cumple = t.metaDia > 0 && t.pctCumplimiento >= 100
                        return (
                          <Fragment key={t.persona}>
                            <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => toggleExpand(t.persona)}>
                              <TableCell>
                                <span className="inline-flex items-center gap-1 font-medium">
                                  <ChevronRight
                                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${abierto ? "rotate-90" : ""}`}
                                  />
                                  {t.persona}
                                  {!t.activo && (
                                    <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                                      Inactivo hoy
                                    </Badge>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">{t.diasTrabajados}</TableCell>
                              <TableCell className="text-right font-semibold">{t2(t.tonAcumulada)}</TableCell>
                              <TableCell className="text-right">{t2(t.tonPromedioDia)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {t.metaDia > 0 ? t2(t.metaDia) : "—"}
                              </TableCell>
                              <TableCell
                                className={`text-right font-medium ${t.metaDia === 0 ? "text-muted-foreground" : cumple ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                              >
                                {t.metaDia > 0 ? `${cumple ? "✓ " : "✗ "}${t.pctCumplimiento}%` : "—"}
                              </TableCell>
                              <TableCell className="text-right">{t.vehiculos.length}</TableCell>
                              <TableCell className="text-right">{t.ordenes.length}</TableCell>
                            </TableRow>
                            {abierto && (
                              <TableRow className="bg-muted/20 hover:bg-muted/20">
                                <TableCell colSpan={8} className="px-2 py-2">
                                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                                    <div className="max-h-72 overflow-auto rounded border bg-background">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="text-xs">Fecha</TableHead>
                                            <TableHead className="text-xs">Orden</TableHead>
                                            <TableHead className="text-xs">Operación</TableHead>
                                            <TableHead className="text-xs">Puesto programado</TableHead>
                                            <TableHead className="text-xs">Placa</TableHead>
                                            <TableHead className="text-right text-xs">Ton asignada</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody className="tabular-nums">
                                          {t.ordenes.map((o, i) => (
                                            <TableRow key={i}>
                                              <TableCell className="text-xs whitespace-nowrap">{o.fecha.slice(5)}</TableCell>
                                              <TableCell className="text-xs">{o.orden}</TableCell>
                                              <TableCell className="text-xs">{o.tipooperacion}</TableCell>
                                              <TableCell className="text-xs text-muted-foreground">{o.puesto || "—"}</TableCell>
                                              <TableCell className="text-xs">
                                                {o.placa ? (
                                                  <span className="inline-flex items-center gap-1">
                                                    <Truck className="h-3 w-3 text-muted-foreground" />
                                                    {o.placa}
                                                  </span>
                                                ) : (
                                                  "—"
                                                )}
                                              </TableCell>
                                              <TableCell className="text-right text-xs font-medium">{t2(o.tonPersona)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                    <div className="max-h-72 min-w-[220px] overflow-auto rounded border bg-background p-2">
                                      <p className="mb-1.5 text-xs font-semibold">
                                        {variosDias ? "Toneladas y vehículos por día" : "Vehículos del día"}
                                      </p>
                                      <div className="space-y-2">
                                        {t.tonPorDia.map((d) => (
                                          <div key={d.fecha} className="border-b pb-1.5 last:border-b-0 last:pb-0">
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="font-medium text-muted-foreground">{d.fecha.slice(5)}</span>
                                              <span className="font-medium tabular-nums">{t2(d.toneladas)} t</span>
                                            </div>
                                            {d.vehiculos.length > 0 && (
                                              <div className="mt-1 flex flex-wrap gap-1">
                                                {d.vehiculos.map((v) => (
                                                  <Badge key={v} variant="outline" className="text-[10px]">
                                                    {v}
                                                  </Badge>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Ordenado de menor a mayor tonelaje acumulado. <strong>% cumplimiento</strong> compara el promedio
                  real de toneladas/día contra la meta dinámica del proyecto (toneladas de Cargue/Distribución
                  acordadas ÷ personal real y horas realmente programadas ese día — no un número fijo; ver
                  "Avance en Vivo" arriba, — si el proyecto no tiene datos de asistencia ese día). "Inactivo hoy"
                  marca a quien ya no está en Head Count (se retiró después
                  del periodo consultado) — su tonelaje real del periodo se sigue mostrando. Amplía el rango de
                  fechas (o usa "Historial del año") y elige un trabajador puntual para revisar su historial
                  completo día a día. Toca un trabajador para ver el detalle de sus órdenes y de sus vehículos por día.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
