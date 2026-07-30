"use client"

// Compensación › Bonos.
// Registra bonos OPERATIVOS y ADMINISTRATIVOS por día y por persona, con su
// concepto y su novedad de Siigo. Nacen PENDIENTES: solo al aprobarse entran a
// pagonomina (bonif_no_prestacional) y salen en el archivo plano.
// Son NO prestacionales: no cotizan al IBC ni generan prestaciones.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, Check, ChevronsUpDown, Gift, Loader2, Trash2, Users, X } from "lucide-react"
import {
  getColaboradoresBonos,
  registrarBono,
  aprobarBono,
  rechazarBono,
  eliminarBono,
  getBonos,
  type ColaboradorBono,
  type BonoRow,
  type BonosResumen,
} from "@/lib/bonos-actions"
import { NOVEDADES_BONO, TIPOS_BONO, type TipoBono, type EstadoBono } from "@/lib/bonos-constants"

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO")

function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
}

const ESTADO_CLASS: Record<EstadoBono, string> = {
  pendiente: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  aprobado: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rechazado: "bg-destructive/15 text-destructive",
}

export default function Bonos() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Gift className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Bonos</h1>
          <p className="text-sm text-muted-foreground">
            Bonos operativos y administrativos por día y por persona. Al aprobarse suman en la nómina y salen en el
            archivo plano con su novedad de Siigo.
          </p>
        </div>
      </div>

      <Tabs defaultValue="registrar" className="w-full">
        <TabsList>
          <TabsTrigger value="registrar">Registrar</TabsTrigger>
          <TabsTrigger value="listado">Aprobación y consulta</TabsTrigger>
        </TabsList>
        <TabsContent value="registrar" className="mt-4">
          <RegistrarBonoTab />
        </TabsContent>
        <TabsContent value="listado" className="mt-4">
          <ListadoBonosTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Registrar
// ---------------------------------------------------------------------------
function RegistrarBonoTab() {
  const { toast } = useToast()
  const [colaboradores, setColaboradores] = useState<ColaboradorBono[]>([])
  const [persona, setPersona] = useState("")
  const [openPicker, setOpenPicker] = useState(false)
  const [fecha, setFecha] = useState(hoyISO())
  const [tipo, setTipo] = useState<TipoBono>("Operativo")
  const [concepto, setConcepto] = useState("")
  const [novedad, setNovedad] = useState<string>(NOVEDADES_BONO[0].nombre)
  const [valor, setValor] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getColaboradoresBonos().then((r) => {
      if (r.success) setColaboradores(r.data)
      else toast({ title: "No se pudieron cargar los colaboradores", description: r.message, variant: "destructive" })
    })
  }, [toast])

  const seleccionado = useMemo(() => colaboradores.find((c) => c.nombre === persona), [colaboradores, persona])

  const guardar = useCallback(async () => {
    setGuardando(true)
    setError(null)
    const r = await registrarBono({
      nombre: persona,
      fecha,
      tipo,
      concepto,
      novedadSiigo: novedad,
      valor: Number(valor.replace(/[^\d.-]/g, "")),
    })
    setGuardando(false)
    if (r.success) {
      toast({ title: "Bono registrado", description: "Queda PENDIENTE de aprobación; aún no impacta la nómina." })
      setConcepto("")
      setValor("")
    } else {
      setError(r.message || "No se pudo registrar el bono.")
      toast({ title: "No se pudo registrar el bono", description: r.message, variant: "destructive" })
    }
  }, [persona, fecha, tipo, concepto, novedad, valor, toast])

  const puedeGuardar = persona && fecha && concepto.trim() && Number(valor.replace(/[^\d.-]/g, "")) > 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Nuevo bono</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Colaborador</Label>
              <Popover open={openPicker} onOpenChange={setOpenPicker}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className="flex items-center gap-2 truncate">
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{persona || "Selecciona un colaborador…"}</span>
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
                    <CommandInput placeholder="Buscar colaborador…" />
                    <CommandList>
                      <CommandEmpty>Sin resultados.</CommandEmpty>
                      <CommandGroup>
                        {colaboradores.map((c) => (
                          <CommandItem
                            key={c.nombre}
                            value={c.nombre}
                            onSelect={() => {
                              setPersona(c.nombre)
                              setOpenPicker(false)
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${persona === c.nombre ? "opacity-100" : "opacity-0"}`} />
                            <span className="flex-1 truncate">{c.nombre}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{c.estado}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {seleccionado && (
                <p className="text-xs text-muted-foreground">
                  CC {seleccionado.identificacion || "—"} ·{" "}
                  {seleccionado.idempresa != null ? `emp${seleccionado.idempresa}` : "—"} · {seleccionado.estado}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Fecha del bono</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoBono)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_BONO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Solo clasificación; el cálculo es idéntico en ambos.</p>
            </div>

            <div className="space-y-1">
              <Label>Novedad en Siigo</Label>
              <Select value={novedad} onValueChange={setNovedad}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOVEDADES_BONO.map((n) => (
                    <SelectItem key={n.codigo} value={n.nombre}>
                      {n.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Con esta novedad sale al archivo plano.</p>
            </div>

            <div className="space-y-1">
              <Label>Valor</Label>
              <Input
                type="number"
                min="0"
                step="1000"
                placeholder="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
              {Number(valor) > 0 && (
                <p className="text-xs text-muted-foreground">{money(Number(valor))}</p>
              )}
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>Concepto</Label>
              <Textarea
                placeholder="Motivo del bono (queda registrado y visible en la aprobación)…"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={guardar} disabled={!puedeGuardar || guardando} className="min-w-[150px]">
              {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
              Registrar bono
            </Button>
            <p className="text-xs text-muted-foreground">
              Queda <strong>pendiente</strong>: no impacta la nómina hasta que se apruebe.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <div className="font-medium text-destructive">No se pudo registrar el bono</div>
                <div className="mt-1 text-muted-foreground">{error}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Los bonos son <strong>no prestacionales</strong>: se pagan al trabajador pero no cotizan a seguridad social
        (no entran al IBC de la PILA) ni sirven de base para cesantías, prima ni vacaciones.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aprobación y consulta
// ---------------------------------------------------------------------------
function ListadoBonosTab() {
  const { toast } = useToast()
  const hoy = hoyISO()
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01")
  const [hasta, setHasta] = useState(hoy)
  const [estado, setEstado] = useState<EstadoBono | "todos">("todos")
  const [tipo, setTipo] = useState<TipoBono | "todos">("todos")
  const [rows, setRows] = useState<BonoRow[]>([])
  const [resumen, setResumen] = useState<BonosResumen | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [rechazando, setRechazando] = useState<number | null>(null)
  const [motivo, setMotivo] = useState("")

  const consultar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await getBonos({ desde, hasta, estado, tipo })
    setLoading(false)
    if (r.success) {
      setRows(r.data)
      setResumen(r.resumen || null)
    } else {
      setRows([])
      setResumen(null)
      setError(r.message || "Error al listar los bonos.")
      toast({ title: "No se pudieron cargar los bonos", description: r.message, variant: "destructive" })
    }
  }, [desde, hasta, estado, tipo, toast])

  useEffect(() => {
    consultar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const accion = async (id: number, fn: () => Promise<{ success: boolean; message?: string }>, ok: string) => {
    setUpdatingId(id)
    const r = await fn()
    setUpdatingId(null)
    if (r.success) {
      toast({ title: ok })
      setRechazando(null)
      setMotivo("")
      consultar()
    } else {
      toast({ title: "No se pudo completar la acción", description: r.message, variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4">
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
          <div className="space-y-1">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoBono | "todos")}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="aprobado">Aprobados</SelectItem>
                <SelectItem value="rechazado">Rechazados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoBono | "todos")}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {TIPOS_BONO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={consultar} disabled={loading} className="min-w-[130px]">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
            Consultar
          </Button>
        </CardContent>
      </Card>

      {resumen && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Pendientes por aprobar" value={String(resumen.pendientes)} hint={money(resumen.valorPendiente)} tone={resumen.pendientes > 0 ? "warn" : undefined} />
          <Kpi label="Aprobados" value={String(resumen.aprobados)} hint={money(resumen.valorAprobado)} tone="ok" />
          <Kpi label="Rechazados" value={String(resumen.rechazados)} />
          <Kpi label="Personas" value={String(resumen.personas)} hint="con bonos en el periodo" />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bonos del periodo — {rows.length}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Novedad Siigo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-20 text-center text-sm text-muted-foreground">
                    Sin bonos en el periodo con los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((b) => (
                  <Fragment key={b.id}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap">{b.fecha}</TableCell>
                      <TableCell>
                        <div className="font-medium">{b.nombre}</div>
                        <div className="text-xs text-muted-foreground">CC {b.identificacion}</div>
                      </TableCell>
                      <TableCell>{b.tipo}</TableCell>
                      <TableCell className="max-w-[240px]">
                        <span className="line-clamp-2 text-xs">{b.concepto}</span>
                      </TableCell>
                      <TableCell className="text-xs">{b.novedadSiigo}</TableCell>
                      <TableCell className="text-right font-medium">{money(b.valor)}</TableCell>
                      <TableCell>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${ESTADO_CLASS[b.estado]}`}>
                          {b.estado}
                        </span>
                        {b.estado !== "pendiente" && b.aprobadoPor && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">por {b.aprobadoPor}</div>
                        )}
                        {b.motivoRechazo && (
                          <div className="mt-0.5 text-[10px] text-destructive">{b.motivoRechazo}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {b.estado === "pendiente" ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 gap-1"
                              disabled={updatingId === b.id}
                              onClick={() => accion(b.id, () => aprobarBono(b.id), "Bono aprobado")}
                            >
                              <Check className="h-3 w-3" /> Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1"
                              disabled={updatingId === b.id}
                              onClick={() => setRechazando(rechazando === b.id ? null : b.id)}
                            >
                              <X className="h-3 w-3" /> Rechazar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              disabled={updatingId === b.id}
                              title="Eliminar"
                              onClick={() => accion(b.id, () => eliminarBono(b.id), "Bono eliminado")}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {rechazando === b.id && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={8} className="px-3 py-2">
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-[280px] flex-1 space-y-1">
                              <Label className="text-xs">Motivo del rechazo</Label>
                              <Input
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                placeholder="Por qué se rechaza este bono…"
                                className="h-8"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={updatingId === b.id || !motivo.trim()}
                              onClick={() => accion(b.id, () => rechazarBono(b.id, motivo), "Bono rechazado")}
                            >
                              Confirmar rechazo
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setRechazando(null); setMotivo("") }}>
                              Cancelar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Solo los bonos <strong>aprobados</strong> entran a la nómina (columna "Bonif. no prestacional") y salen en
            el archivo plano con su novedad. Un bono aprobado ya no se puede eliminar: si fue un error, recházalo.
          </p>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-2 py-6 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <div className="font-medium text-destructive">No se pudieron cargar los bonos</div>
              <div className="mt-1 text-muted-foreground">{error}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : ""}`}
        >
          {value}
        </div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}
