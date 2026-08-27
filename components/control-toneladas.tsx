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
import { ChevronRight, Loader2, Scale, Truck, Users } from "lucide-react"
import { getControlToneladas, type TrabajadorToneladas } from "@/lib/control-toneladas-actions"

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
                                            <TableHead className="text-xs">Personal real asignado</TableHead>
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
                                              <TableCell className="max-w-[220px] truncate text-[11px] text-muted-foreground" title={o.personalReal.join(", ")}>
                                                {o.personalReal.length > 0 ? o.personalReal.join(", ") : "—"}
                                              </TableCell>
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
                  Centro de Coordinación para el avance en vivo del turno — si el proyecto no tiene datos de
                  asistencia ese día). "Inactivo hoy"
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
