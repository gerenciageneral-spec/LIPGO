"use client"

// Producción › Liquidación Tolva del día.
// Toma las toneladas APROBADAS del día (Aprobación de ingreso de producción),
// las reparte por Turno 1/Turno 2 según la ventana horaria programada en
// RRHH › Programación de turnos (Auxiliar Mixto) y genera la orden de Tolva/
// Tolva f en cabeceraoc con un click. Incluye la auditoría pago/cobro/entrega.

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, CheckCircle2, Clock, Loader2, Package, Users, Wallet } from "lucide-react"
import {
  getLiquidacionTolvaDia,
  registrarTolvaTurno,
  getAuditoriaTolva,
  type LiquidacionTolvaDia,
  type AuditoriaTolvaDia,
} from "@/lib/liquidacion-tolva-actions"

const ton = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 3 })
const signedTon = (n: number) => (n >= 0 ? "+" : "−") + ton(Math.abs(n))
const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO")

function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
}

export default function LiquidacionTolva() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Liquidación Tolva del día</h1>
          <p className="text-sm text-muted-foreground">
            Genera la orden de Tolva por turno desde los ingresos de producción ya aprobados.
          </p>
        </div>
      </div>

      <Tabs defaultValue="dia" className="w-full">
        <TabsList>
          <TabsTrigger value="dia">Liquidación del día</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoría (pago / cobro / entrega)</TabsTrigger>
        </TabsList>
        <TabsContent value="dia" className="mt-4">
          <LiquidacionDelDia />
        </TabsContent>
        <TabsContent value="auditoria" className="mt-4">
          <AuditoriaTolvaTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function LiquidacionDelDia() {
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const { toast } = useToast()
  const [fecha, setFecha] = useState(hoyISO())
  const [data, setData] = useState<LiquidacionTolvaDia | null>(null)
  const [loading, setLoading] = useState(false)
  const [registrando, setRegistrando] = useState<1 | 2 | null>(null)

  const consultar = useCallback(async () => {
    if (!selectedEmpresaId) return
    setLoading(true)
    const r = await getLiquidacionTolvaDia(fecha, selectedEmpresaId)
    setLoading(false)
    if (r.success && r.data) setData(r.data)
    else {
      setData(null)
      toast({ title: "No se pudo cargar la liquidación", description: r.message, variant: "destructive" })
    }
  }, [fecha, selectedEmpresaId, toast])

  useEffect(() => {
    consultar()
  }, [consultar])

  const registrar = async (turno: 1 | 2) => {
    if (!selectedEmpresaId) return
    setRegistrando(turno)
    const r = await registrarTolvaTurno(fecha, selectedEmpresaId, turno)
    setRegistrando(null)
    if (r.success) {
      toast({
        title: `Tolva registrada — Turno ${turno}`,
        description: `${r.ordendecargue} · ${ton(r.toneladas || 0)} t${r.message ? " · " + r.message : ""}`,
      })
      consultar()
    } else {
      toast({ title: "No se pudo registrar", description: r.message, variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-[160px]" />
          </div>
          <Button onClick={consultar} disabled={loading} className="min-w-[130px]">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
            Consultar
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">
              Empresa: {selectedEmpresaNombre || "—"} (id {selectedEmpresaId ?? "—"})
            </Badge>
            {data && (
              <Badge variant="secondary">
                {data.tipoOperacion === "Tolva f" ? "Domingo → Tolva f" : "Tolva"}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {data && (
        <>
          {data.pendientes.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <strong>{data.pendientes.length}</strong> ingreso(s) requieren revisión manual antes de poder
                registrar la Tolva:
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {data.pendientes.map((p) => (
                    <li key={p.id}>
                      {p.nombreproducto} · {p.cantidad} und ·{" "}
                      {p.motivo === "atrasado"
                        ? `aprobación atrasada (creado ${String(p.creado).slice(0, 10)} vs producción ${p.fechaprod})`
                        : "fuera de la ventana de Turno 1/Turno 2 (sin turno programado que la cubra)"}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {data.turnos.map((t) => (
              <Card key={t.turno}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Turno {t.turno}</CardTitle>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {t.horaInicio && t.horaFin ? `${t.horaInicio} – ${t.horaFin}` : "sin programar"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {t.personas.length > 0 ? t.personas.join(", ") : "sin personal asignado"}
                  </div>

                  {t.lineas.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Sin ingresos aprobados en esta ventana horaria.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Toneladas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="tabular-nums">
                        {t.lineas.map((l, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{l.nombreproducto}</TableCell>
                            <TableCell className="text-right">{l.cantidad}</TableCell>
                            <TableCell className="text-right">{ton(l.toneladas)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2">
                          <TableCell className="font-semibold">Total</TableCell>
                          <TableCell />
                          <TableCell className="text-right font-bold">{ton(t.totalToneladas)} t</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}

                  {t.personas.length === 0 && t.lineas.length > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Sin personal asignado: la Tolva se registrará sin auxiliares (no se le paga a nadie por este
                      tonelaje).
                    </div>
                  )}

                  <Button
                    onClick={() => registrar(t.turno)}
                    disabled={
                      !data.puedeRegistrar || t.lineas.length === 0 || registrando === t.turno
                    }
                    className="w-full gap-2"
                  >
                    {registrando === t.turno ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Registrar Tolva — Turno {t.turno}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AuditoriaTolvaTab() {
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const { toast } = useToast()
  const hoy = hoyISO()
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01")
  const [hasta, setHasta] = useState(hoy)
  const [rows, setRows] = useState<AuditoriaTolvaDia[]>([])
  const [loading, setLoading] = useState(false)
  const [cargado, setCargado] = useState(false)

  const consultar = useCallback(async () => {
    if (!selectedEmpresaId) return
    setLoading(true)
    const r = await getAuditoriaTolva(desde, hasta, selectedEmpresaId)
    setLoading(false)
    setCargado(true)
    if (r.success) setRows(r.data)
    else toast({ title: "No se pudo cargar la auditoría", description: r.message, variant: "destructive" })
  }, [desde, hasta, selectedEmpresaId, toast])

  // Recarga automática al cambiar la empresa seleccionada (encabezado) o el
  // rango de fechas — antes solo se refrescaba al pulsar "Consultar", por lo
  // que cambiar de empresa no se reflejaba hasta un click manual.
  useEffect(() => {
    if (selectedEmpresaId) consultar()
  }, [consultar, selectedEmpresaId])

  const totales = rows.reduce(
    (a, r) => ({
      entrega: a.entrega + r.entregaToneladas,
      facturado: a.facturado + r.facturadoToneladas,
      pago: a.pago + r.pago,
      cobro: a.cobro + r.cobro,
      alertas: a.alertas + r.ordenesSinPersonal,
      discrepancias: a.discrepancias + (r.discrepancia ? 1 : 0),
    }),
    { entrega: 0, facturado: 0, pago: 0, cobro: 0, alertas: 0, discrepancias: 0 },
  )
  const diasConDiscrepancia = rows.filter((r) => r.discrepancia)

  return (
    <div className="space-y-4">
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
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
            Consultar
          </Button>
          <Badge variant="outline" className="ml-auto">
            Empresa: {selectedEmpresaNombre || "—"} (id {selectedEmpresaId ?? "—"})
          </Badge>
        </CardContent>
      </Card>

      {cargado && (
        <>
          {diasConDiscrepancia.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <strong>{diasConDiscrepancia.length} día(s)</strong> con discrepancia entre toneladas{" "}
                <strong>entregadas</strong> y <strong>facturadas</strong> (diferencia mayor a 0,05 t):
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {diasConDiscrepancia.map((r) => (
                    <li key={r.fecha}>
                      {r.fecha}: entregó {ton(r.entregaToneladas)} t, facturó {ton(r.facturadoToneladas)} t (
                      {signedTon(r.diferenciaToneladas)} t)
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi label="Entrega real" value={`${ton(totales.entrega)} t`} />
            <Kpi label="Facturado" value={`${ton(totales.facturado)} t`} />
            <Kpi
              label="Días con discrepancia"
              value={String(totales.discrepancias)}
              tone={totales.discrepancias > 0 ? "down" : "up"}
            />
            <Kpi label="Pago a trabajadores" value={money(totales.pago)} />
            <Kpi label="Cobro (facturación)" value={money(totales.cobro)} />
            <Kpi
              label="Órdenes sin personal"
              value={String(totales.alertas)}
              tone={totales.alertas > 0 ? "down" : "up"}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cruce por día — entrega vs. facturado vs. pago</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin órdenes de Tolva/Tolva f ni ingresos de producción en el rango.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Entrega (t)</TableHead>
                      <TableHead className="text-right">Facturado (t)</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                      <TableHead className="text-right">Pago</TableHead>
                      <TableHead className="text-right">Cobro</TableHead>
                      <TableHead className="text-right">Alertas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="tabular-nums">
                    {rows.map((r) => (
                      <TableRow key={r.fecha} className={r.discrepancia ? "bg-destructive/5" : ""}>
                        <TableCell className="whitespace-nowrap">{r.fecha}</TableCell>
                        <TableCell className="text-right">{ton(r.entregaToneladas)}</TableCell>
                        <TableCell className="text-right">{ton(r.facturadoToneladas)}</TableCell>
                        <TableCell
                          className={`text-right font-medium ${r.discrepancia ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {r.discrepancia ? (
                            <span className="inline-flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {signedTon(r.diferenciaToneladas)}
                            </span>
                          ) : (
                            "✓ 0"
                          )}
                        </TableCell>
                        <TableCell className="text-right">{money(r.pago)}</TableCell>
                        <TableCell className="text-right">{money(r.cobro)}</TableCell>
                        <TableCell className="text-right">
                          {r.ordenesSinPersonal > 0 ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" /> {r.ordenesSinPersonal}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                <strong>Entrega</strong> = toneladas aprobadas en producción (invtrans). <strong>Facturado</strong> =
                toneladas de las órdenes de Tolva/Tolva f (mismas que valorizan el cobro). Deben coincidir al 100% —
                una diferencia indica ingresos "atrasados"/"sin turno" sin resolver, o una Tolva creada a mano con
                otra cantidad. Pago = $0 con entrega/cobro mayor a 0 señala un turno registrado sin personal.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "up" ? "text-emerald-600 dark:text-emerald-400" : tone === "down" ? "text-rose-600 dark:text-rose-400" : ""}`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  )
}
