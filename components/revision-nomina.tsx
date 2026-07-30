"use client"

// Gestión Humana › Nómina › Revisión de nómina.
// Selecciona un colaborador + quincena y, con un botón, arma el CUADRO DEFINITIVO
// del nuevo modelo: (A) liquidación diaria (cada día = base; turno suma recargos),
// (B) resumen de quincena (base + turno + bono neto de destajo, pérdida visible),
// (C) archivo plano → Siigo. Lee las vistas pagonomina/archivoplano (fuente de verdad).

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ChevronsUpDown,
  ClipboardCheck,
  Loader2,
  Scale,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react"
import {
  getColaboradores,
  getRevisionNomina,
  getHcPorDia,
  getConciliacionQuincena,
  type ColaboradorRef,
  type RevisionNominaData,
  type HcDiaProyecto,
  type ConciliacionData,
  type OrdenConciliada,
} from "@/lib/revision-nomina-actions"

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })
const signed = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(Math.round(Number(n) || 0)).toLocaleString("es-CO")

export default function RevisionNomina() {
  const { toast } = useToast()
  const hoy = new Date()
  const [colaboradores, setColaboradores] = useState<ColaboradorRef[]>([])
  const [persona, setPersona] = useState("")
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [quincena, setQuincena] = useState<1 | 2>(hoy.getDate() <= 15 ? 1 : 2)
  const [openPicker, setOpenPicker] = useState(false)
  const [data, setData] = useState<RevisionNominaData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getColaboradores().then((r) => {
      if (r.success) setColaboradores(r.data)
      else toast({ title: "No se pudieron cargar los colaboradores", description: r.message, variant: "destructive" })
    })
  }, [toast])

  const revisar = useCallback(async () => {
    if (!persona) {
      toast({ title: "Selecciona un colaborador", variant: "destructive" })
      return
    }
    setLoading(true)
    const r = await getRevisionNomina(persona, anio, mes, quincena)
    setLoading(false)
    if (r.success && r.data) setData(r.data)
    else {
      setData(null)
      toast({ title: "No se pudo armar la revisión", description: r.message, variant: "destructive" })
    }
  }, [persona, anio, mes, quincena, toast])

  const personaLabel = useMemo(() => {
    const c = colaboradores.find((x) => x.persona === persona)
    return c ? c.persona : "Selecciona un colaborador…"
  }, [colaboradores, persona])

  const anios = useMemo(() => {
    const y = new Date().getFullYear()
    return [y + 1, y, y - 1, y - 2]
  }, [])

  const tipoBadge = (tipo: string, anomalia: boolean) => {
    if (anomalia)
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" /> Cargue 0 ton
        </Badge>
      )
    const map: Record<string, string> = {
      Destajo: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      Turno: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
      Festivo: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      Novedad: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
      Descanso: "bg-muted text-muted-foreground",
      "Sin registro": "bg-muted text-muted-foreground",
    }
    return <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[tipo] || "bg-muted"}`}>{tipo}</span>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Revisión de nómina</h1>
          <p className="text-sm text-muted-foreground">
            Cuadro definitivo por colaborador — liquidación diaria, resumen de quincena y archivo plano (Siigo).
          </p>
        </div>
      </div>

      <Tabs defaultValue="colaborador" className="w-full">
        <TabsList>
          <TabsTrigger value="colaborador">Por colaborador</TabsTrigger>
          <TabsTrigger value="hc">HC por día (por proyecto)</TabsTrigger>
          <TabsTrigger value="conciliacion">Conciliación báscula ↔ pago</TabsTrigger>
        </TabsList>

        <TabsContent value="colaborador" className="mt-4 space-y-4">
      {/* Selectores + botón */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-[260px] flex-1 space-y-1">
            <Label>Colaborador</Label>
            <Popover open={openPicker} onOpenChange={setOpenPicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className="flex items-center gap-2 truncate">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{personaLabel}</span>
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[360px] p-0" align="start">
                <Command
                  filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
                >
                  <CommandInput placeholder="Buscar colaborador…" />
                  <CommandList>
                    <CommandEmpty>Sin resultados.</CommandEmpty>
                    <CommandGroup>
                      {colaboradores.map((c) => (
                        <CommandItem
                          key={c.persona}
                          value={c.persona}
                          onSelect={() => {
                            setPersona(c.persona)
                            setOpenPicker(false)
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${persona === c.persona ? "opacity-100" : "opacity-0"}`}
                          />
                          <span className="flex-1 truncate">{c.persona}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {c.empresa != null ? `emp${c.empresa}` : ""} · {c.estado}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>Año</Label>
            <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anios.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Mes</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Quincena</Label>
            <Select value={String(quincena)} onValueChange={(v) => setQuincena(Number(v) as 1 | 2)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1ª (1–15)</SelectItem>
                <SelectItem value="2">2ª (16–fin)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={revisar} disabled={loading || !persona} className="min-w-[130px]">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}
            Revisar
          </Button>
        </CardContent>
      </Card>

          {data && <Resultado data={data} tipoBadge={tipoBadge} />}
        </TabsContent>

        <TabsContent value="hc" className="mt-4">
          <HcPorDia />
        </TabsContent>

        <TabsContent value="conciliacion" className="mt-4">
          <ConciliacionBascula />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Resultado({
  data,
  tipoBadge,
}: {
  data: RevisionNominaData
  tipoBadge: (tipo: string, anomalia: boolean) => ReactNode
}) {
  const { colaborador: c, quincena: q, dias, resumen: r, metaResumen: mr, plano, siigo } = data
  const sinDatos = dias.length === 0
  const ton1 = (x: number) => (Number(x) || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })
  // Moneda con signo (para deducciones y deltas del cruce Siigo)
  const moneyS = (n: number) =>
    (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(Number(n) || 0)).toLocaleString("es-CO")

  return (
    <div className="space-y-4">
      {/* Encabezado colaborador */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <div className="text-lg font-semibold">{c.persona}</div>
            <div className="text-sm text-muted-foreground">
              CC {c.identificacion || "—"} · {c.empresa != null ? `emp${c.empresa}` : "—"} · salario{" "}
              {money(c.salario)} · base/día {money(c.baseDia)}
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            {MESES[q.mes - 1]} {q.anio} · {q.num}ª quincena ({q.desde.slice(8)}–{q.hasta.slice(8)})
          </div>
        </CardContent>
      </Card>

      {sinDatos ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No hay días liquidados para este colaborador en la quincena seleccionada.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* B) Resumen (arriba, para lectura rápida) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Base garantizada" value={money(r.baseGarantizada)} hint={`${r.diasDestajo} días de destajo`} />
            <Kpi label="Ingreso por turno" value={money(r.ingresoTurno)} hint="recargos / horas extra" />
            <Kpi
              label="Bono destajo (neto)"
              value={money(r.bono)}
              hint={`${r.diasAltos} altos · ${r.diasBajos} bajos`}
              tone={r.bono > 0 ? "up" : undefined}
            />
            <Kpi
              label={r.perdida > 0 ? "Pérdida productividad" : "Total quincena"}
              value={r.perdida > 0 ? money(r.perdida) : money(r.total)}
              hint={r.perdida > 0 ? "la asume la empresa (visible)" : "base + turno + bono"}
              tone={r.perdida > 0 ? "down" : undefined}
            />
          </div>

          {r.anomalias > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span>
                <strong>{r.anomalias}</strong> día(s) en Cargue/Descargue con <strong>0 toneladas</strong>. Revisa la
                orden o la asistencia: o falta acreditar el tonelaje, o debía marcarse otra novedad.
              </span>
            </div>
          )}

          {/* Cumplimiento de meta de toneladas (productividad) */}
          {mr.configurada && mr.diasDestajo > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cumplimiento de meta de toneladas (productividad)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="Meta ton/trabajador/día" value={ton1(mr.metaReferencia)} hint="mínimo para ganar la base" />
                  <Kpi
                    label="Promedio movido/día"
                    value={ton1(mr.promedioDia)}
                    hint={`${ton1(mr.toneladasMovidas)} t en ${mr.diasDestajo} días`}
                    tone={mr.metaReferencia > 0 ? (mr.promedioDia >= mr.metaReferencia ? "up" : "down") : undefined}
                  />
                  <Kpi
                    label="Cumplimiento"
                    value={`${Math.round(mr.pctCumplimiento)}%`}
                    hint={`${mr.diasCumple} de ${mr.diasCumple + mr.diasBajo} días cumplen`}
                    tone={mr.pctCumplimiento >= 100 ? "up" : mr.pctCumplimiento < 50 ? "down" : undefined}
                  />
                  <Kpi
                    label={mr.diasBajo > 0 ? "Días bajo meta" : "Toneladas vs meta"}
                    value={mr.diasBajo > 0 ? String(mr.diasBajo) : ton1(mr.toneladasMovidas - mr.toneladasMeta)}
                    hint={
                      mr.toneladasMeta > 0
                        ? `movió ${ton1(mr.toneladasMovidas)} vs meta ${ton1(mr.toneladasMeta)}`
                        : "meta acumulada del período"
                    }
                    tone={mr.diasBajo > 0 ? "down" : "up"}
                  />
                  <Kpi
                    label="HC real promedio/día"
                    value={ton1(mr.hcPromedioReal)}
                    hint={`planeado (config): ${mr.hcConfigurado || "—"} · el HC varía según el volumen`}
                    tone={
                      mr.hcConfigurado > 0
                        ? mr.hcPromedioReal > mr.hcConfigurado
                          ? "up"
                          : mr.hcPromedioReal < mr.hcConfigurado
                            ? "down"
                            : undefined
                        : undefined
                    }
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Indicador de productividad: mide si el trabajador mueve el mínimo para justificar la base fija. No
                  cambia la liquidación ni el bono. La meta se configura en Financiera › Tarifas › Metas.
                </p>
              </CardContent>
            </Card>
          )}

          {/* A) Liquidación diaria */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">A) Liquidación diaria</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Ton.</TableHead>
                    <TableHead className="text-right">Meta</TableHead>
                    <TableHead className="text-right">HC día</TableHead>
                    <TableHead className="text-right">Destajo</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Recargos</TableHead>
                    <TableHead className="text-right">Dominical</TableHead>
                    <TableHead className="text-right">Excedente</TableHead>
                    <TableHead className="text-right">Total día</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {dias.map((d) => (
                    <TableRow key={d.fecha} className={d.anomalia ? "bg-destructive/5" : ""}>
                      <TableCell className="whitespace-nowrap">
                        {d.dow} {d.fecha.slice(8)}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          {tipoBadge(d.tipo, d.anomalia)}
                          {d.tipo === "Turno" && d.actividad && (
                            <span className="text-xs text-muted-foreground">
                              {d.actividad.replace("Cargue/Descargue ", "")}
                            </span>
                          )}
                          {d.tipo === "Novedad" && d.novedad && (
                            <span className="text-xs text-muted-foreground">{d.novedad.slice(0, 22)}</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{d.toneladas ? d.toneladas.toFixed(1) : ""}</TableCell>
                      <TableCell className="text-right">
                        {d.esDestajo && d.meta > 0 ? (
                          <span
                            className={
                              d.cumpleMeta ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            }
                          >
                            {d.cumpleMeta ? "✓" : "✗"} {ton1(d.meta)}
                          </span>
                        ) : (
                          ""
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {d.esDestajo && d.hcDia > 0 ? d.hcDia : ""}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {d.esDestajo ? money(d.pagoProduccion) : ""}
                      </TableCell>
                      <TableCell className="text-right">{d.base ? money(d.base) : ""}</TableCell>
                      <TableCell className="text-right">{d.recargos ? money(d.recargos) : ""}</TableCell>
                      <TableCell className="text-right">{d.domingo ? money(d.domingo) : ""}</TableCell>
                      <TableCell
                        className={`text-right ${d.esDestajo ? (d.excedente >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400") : ""}`}
                      >
                        {d.esDestajo ? signed(d.excedente) : ""}
                      </TableCell>
                      <TableCell className="text-right font-medium">{money(d.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                Cada día de destajo se liquida a su <strong>base</strong> (no al valor de sus toneladas); el excedente
                (columna <em>Excedente</em>) se netea por quincena y se paga como bono. El turno suma sus recargos.
              </p>
            </CardContent>
          </Card>

          {/* B) Cruce de destajo */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">B) Cruce de destajo (toneladas vs. base)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <Fila label={`Días altos aportan (${r.diasAltos})`} value={signed(Math.max(0, r.netoDestajo + sumaBajos(dias)))} />
                <Fila label={`Días bajos consumen (${r.diasBajos})`} value={signed(sumaBajos(dias))} />
                <div className="my-1 border-t" />
                <Fila label="Neto de la quincena" value={signed(r.netoDestajo)} bold />
                {r.netoDestajo >= 0 ? (
                  <Fila label="→ Bono prestacional (MAX 0)" value={money(r.bono)} bold tone="up" />
                ) : (
                  <Fila
                    label="→ Pérdida asumida por la empresa (base garantizada)"
                    value={money(r.perdida)}
                    bold
                    tone="down"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* C) Archivo plano */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">C) Archivo plano → Siigo</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {plano.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Sin novedades en el archivo plano para esta quincena (el trabajador puede estar excluido por retiro, o
                  no tener bono/horas extra/días de novedad).
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Novedad</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Cant./Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="tabular-nums">
                    {plano.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell>{p.nombrenovedad}</TableCell>
                        <TableCell className="text-muted-foreground">{p.tiponovedad}</TableCell>
                        <TableCell className="text-right font-medium">
                          {p.tiponovedad === "Horas"
                            ? p.cantidadvalor.toLocaleString("es-CO", { maximumFractionDigits: 2 }) + " h"
                            : p.tiponovedad === "Dias"
                              ? p.cantidadvalor + " día(s)"
                              : money(p.cantidadvalor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                El salario quincenal (base) se paga vía Siigo; aquí van las <strong>novedades</strong> encima: bono de
                destajo, horas extra <strong>completas</strong> y días de novedad. Es lo que fija el IBC en Siigo.
              </p>
            </CardContent>
          </Card>

          {/* D) Cruce Siigo — simulación del pago */}
          {siigo.disponible && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">D) Cruce Siigo — simulación del pago</CardTitle>
                  {siigo.cuadra ? (
                    <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" /> CUADRA · dif {moneyS(siigo.diferencia)}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Δ {moneyS(siigo.diferencia)} — revisar
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5 overflow-x-auto">
                {/* Simulación de la liquidación Siigo */}
                <div>
                  <p className="mb-2 text-sm font-medium">Así liquidará Siigo al subir el archivo plano</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead>Cómo lo valora Siigo</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="tabular-nums">
                      {siigo.conceptos.map((cc, i) => (
                        <TableRow key={i} className={cc.tipo === "Base" ? "bg-muted/40" : ""}>
                          <TableCell className={cc.tipo === "Base" ? "font-medium" : ""}>{cc.concepto}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {cc.tipo === "Valor"
                              ? ""
                              : `${cc.cantidad.toLocaleString("es-CO", { maximumFractionDigits: 2 })} ${cc.unidad}`}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{cc.factor}</TableCell>
                          <TableCell
                            className={`text-right font-medium ${cc.valor < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}
                          >
                            {moneyS(cc.valor)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2">
                        <TableCell className="font-semibold">TOTAL SIMULADO SIIGO</TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell className="text-right text-base font-bold">{money(siigo.totalSiigo)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Valoración con la vigencia legal de la quincena: jornada {siigo.jornada} h · hora ordinaria (HOD){" "}
                    {money(siigo.hod)} = salario ÷ (30 × jornada).
                  </p>
                </div>

                {/* Cruce por componente */}
                <div>
                  <p className="mb-2 text-sm font-medium">Cruce contra el Total quincena de LIPgo</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Componente</TableHead>
                        <TableHead className="text-right">LIPgo</TableHead>
                        <TableHead className="text-right">Siigo (sim.)</TableHead>
                        <TableHead className="text-right">Δ (Siigo − LIPgo)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="tabular-nums">
                      {siigo.componentes.map((co, i) => {
                        const delta = co.siigo - co.lipgo
                        const ok = Math.abs(delta) <= 500
                        return (
                          <TableRow key={i}>
                            <TableCell>{co.nombre}</TableCell>
                            <TableCell className="text-right">{money(co.lipgo)}</TableCell>
                            <TableCell className="text-right">{money(co.siigo)}</TableCell>
                            <TableCell
                              className={`text-right font-medium ${ok ? "text-muted-foreground" : delta > 0 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}
                            >
                              {ok ? "✓ " : ""}
                              {moneyS(delta)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      <TableRow className="border-t-2">
                        <TableCell className="font-semibold">TOTAL</TableCell>
                        <TableCell className="text-right font-bold">{money(siigo.totalLipgo)}</TableCell>
                        <TableCell className="text-right font-bold">{money(siigo.totalSiigo)}</TableCell>
                        <TableCell
                          className={`text-right text-base font-bold ${siigo.cuadra ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                        >
                          {moneyS(siigo.diferencia)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Explicaciones de la diferencia */}
                {siigo.explicaciones.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {siigo.explicaciones.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function sumaBajos(dias: RevisionNominaData["dias"]) {
  return dias.reduce((a, d) => (d.esDestajo && d.excedente < 0 ? a + d.excedente : a), 0)
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

function Fila({
  label,
  value,
  bold,
  tone,
}: {
  label: string
  value: string
  bold?: boolean
  tone?: "up" | "down"
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span
        className={`tabular-nums ${bold ? "font-semibold" : ""} ${tone === "up" ? "text-emerald-600 dark:text-emerald-400" : tone === "down" ? "text-rose-600 dark:text-rose-400" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CONCILIACIÓN PESO ↔ PAGO ↔ FACTURACIÓN (LIP completo, id 1-4). La fuente de
// verdad del peso cambia por proyecto (igual que pagonomina): báscula física
// en las plantas (Indupan=1, Avimol=2); en los CEDIS (Cedi Funza=3, Cedi
// Medellín=4) es el peso declarado por productos, salvo Descargue con báscula
// del tiquete. Aquí se verifica que TODO lo pesado quede asignado y pagado,
// se expone la diferencia producto vs peso base (con su factor de prorrateo)
// y se puede abrir cada colaborador para revisar todo lo pagado orden a orden.
// ---------------------------------------------------------------------------
function ConciliacionBascula() {
  const { toast } = useToast()
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [quincena, setQuincena] = useState<1 | 2>(hoy.getDate() <= 15 ? 1 : 2)
  const [planta, setPlanta] = useState(0) // 0 = todo LIP (1-4)
  const [data, setData] = useState<ConciliacionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expand, setExpand] = useState<Set<string>>(new Set())
  const [buscar, setBuscar] = useState("")

  const anios = [hoy.getFullYear() + 1, hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2]
  const t1 = (x: number) => (Number(x) || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })
  const t2 = (x: number) => (Number(x) || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })
  const PLANTAS: Record<number, string> = { 1: "Indupan", 2: "Avimol", 3: "Cedi Funza", 4: "Cedi Medellín" }
  const plantaNombre = (id: number) => PLANTAS[id] || `ID ${id}`

  const consultar = useCallback(async () => {
    setLoading(true)
    setExpand(new Set())
    const r = await getConciliacionQuincena(anio, mes, quincena, planta)
    setLoading(false)
    if (r.success && r.data) setData(r.data)
    else {
      setData(null)
      toast({ title: "No se pudo armar la conciliación", description: r.message, variant: "destructive" })
    }
  }, [anio, mes, quincena, planta, toast])

  const toggleExpand = (k: string) =>
    setExpand((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const colaboradoresFiltrados = useMemo(() => {
    if (!data) return []
    const q = buscar.trim().toLowerCase()
    if (!q) return data.colaboradores
    return data.colaboradores.filter((c) => c.persona.toLowerCase().includes(q))
  }, [data, buscar])

  const r = data?.resumen
  const cobertura = r && r.tonBase > 0 ? (r.tonAsignada / r.tonBase) * 100 : 0
  const deltaPagonomina = r ? r.tonPagonomina - r.tonAsignada : 0
  const totalAlertas = r ? r.ordenesSinAux + r.ordenesSinTarifa + r.ordenesNoFacturar + r.auxiliaresHuerfanos.length : 0

  const TablaOrdenes = ({ rows, mostrarAux }: { rows: OrdenConciliada[]; mostrarAux?: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Orden</TableHead>
          <TableHead>Planta</TableHead>
          <TableHead>Operación</TableHead>
          <TableHead>Fuente</TableHead>
          <TableHead className="text-right">Ton base</TableHead>
          <TableHead className="text-right">Ton producto</TableHead>
          <TableHead className="text-right">Diferencia</TableHead>
          <TableHead className="text-right">Factor prorrateo</TableHead>
          {mostrarAux && <TableHead className="text-right"># Aux</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {rows.map((o) => {
          const dif = o.tonBase - o.tonProducto
          return (
            <TableRow key={o.idorden}>
              <TableCell className="whitespace-nowrap">{o.fecha.slice(5)}</TableCell>
              <TableCell>{o.orden}</TableCell>
              <TableCell>{plantaNombre(o.planta)}</TableCell>
              <TableCell>{o.tipooperacion}</TableCell>
              <TableCell>
                <span className={`text-xs ${o.fuente === "bascula" ? "text-primary" : "text-muted-foreground"}`}>
                  {o.fuente === "bascula" ? "Báscula" : "Producto"}
                </span>
              </TableCell>
              <TableCell className="text-right font-medium">{t2(o.tonBase)}</TableCell>
              <TableCell className="text-right text-muted-foreground">{t2(o.tonProducto)}</TableCell>
              <TableCell
                className={`text-right font-medium ${Math.abs(dif) > 0.05 ? (dif > 0 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400") : "text-muted-foreground"}`}
              >
                {dif >= 0 ? "+" : ""}
                {t2(dif)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {o.factor > 0 ? "×" + o.factor.toLocaleString("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "—"}
              </TableCell>
              {mostrarAux && <TableCell className="text-right">{o.nAux}</TableCell>}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label>Año</Label>
            <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anios.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Mes</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Quincena</Label>
            <Select value={String(quincena)} onValueChange={(v) => setQuincena(Number(v) as 1 | 2)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1ª (1–15)</SelectItem>
                <SelectItem value="2">2ª (16–fin)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Proyecto</Label>
            <Select value={String(planta)} onValueChange={(v) => setPlanta(Number(v))}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Todo LIP (1–4)</SelectItem>
                <SelectItem value="1">Indupan (1)</SelectItem>
                <SelectItem value="2">Avimol (2)</SelectItem>
                <SelectItem value="3">Cedi Funza (3)</SelectItem>
                <SelectItem value="4">Cedi Medellín (4)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={consultar} disabled={loading} className="min-w-[130px]">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scale className="mr-2 h-4 w-4" />}
            Conciliar
          </Button>
        </CardContent>
      </Card>

      {data && r && (
        <>
          {/* Tarjetas comparativas */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Toneladas base de cálculo (fuente de verdad)"
              value={`${t1(r.tonBase)} t`}
              hint={`${r.ordenes} órdenes · ${r.ordenesBascula} con pesaje físico`}
            />
            <Kpi
              label="Toneladas asignadas a personal"
              value={`${t1(r.tonAsignada)} t`}
              hint={`cobertura ${Math.round(cobertura)}% · sin asignar ${t1(r.tonSinAsignar)} t`}
              tone={cobertura >= 99.5 ? "up" : "down"}
            />
            <Kpi
              label="Destajo calculado (peso base × tarifa)"
              value={money(r.valorCalculado)}
              hint={`pagonomina liquida ${money(r.pagoPagonomina)}`}
              tone={Math.abs(r.valorCalculado - r.pagoPagonomina) <= Math.max(2000, r.valorCalculado * 0.01) ? "up" : "down"}
            />
            <Kpi
              label="Alertas de conciliación"
              value={String(totalAlertas)}
              hint={`${r.ordenesSinAux} sin aux · ${r.ordenesSinTarifa} sin tarifa · ${r.ordenesNoFacturar} no facturar · ${r.auxiliaresHuerfanos.length} huérfanos`}
              tone={totalAlertas > 0 ? "down" : "up"}
            />
          </div>

          {/* Cruce global vs pagonomina */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Cruce contra pagonomina (lo que liquida nómina)</CardTitle>
                {Math.abs(deltaPagonomina) <= 0.5 ? (
                  <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> CUADRA · Δ {t2(deltaPagonomina)} t
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Δ {t2(deltaPagonomina)} t — revisar
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Fila label="Toneladas repartidas según órdenes (báscula ÷ auxiliares)" value={`${t2(r.tonAsignada)} t`} />
              <Fila label="Toneladas que pagonomina liquida a esas personas" value={`${t2(r.tonPagonomina)} t`} />
              <div className="my-1 border-t" />
              <Fila label="Δ (pagonomina − órdenes)" value={`${deltaPagonomina >= 0 ? "+" : ""}${t2(deltaPagonomina)} t`} bold tone={Math.abs(deltaPagonomina) <= 0.5 ? "up" : "down"} />
              <p className="pt-1 text-xs text-muted-foreground">
                Un Δ distinto de 0 viene de los filtros de la vista (vínculo laboral, corte por retiro, fechas futuras)
                o de la misma persona con tonelaje el mismo día en otra sede. El pago SIEMPRE reparte el peso de
                báscula; el peso por producto solo se usa como referencia con su factor de prorrateo.
              </p>
            </CardContent>
          </Card>

          {/* Alertas */}
          {r.ordenesSinAux > 0 && (
            <Card className="border-destructive/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Órdenes SIN auxiliares — {t1(r.tonSinAsignar)} t facturables sin nadie a quien pagar
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <TablaOrdenes rows={data.ordenesSinAux} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Estas toneladas se cobran (peso base) pero no generan destajo. No siempre es un error: puede ser un
                  vehículo que no atiende LIP con personal propio, o un auxiliar de refuerzo (solo entra en picos de
                  volumen) que quedó sin registrar en la orden. Vale la pena revisarlas igual, caso a caso.
                </p>
              </CardContent>
            </Card>
          )}
          {r.ordenesSinTarifa > 0 && (
            <Card className="border-destructive/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Órdenes SIN tarifa vigente — reparten toneladas pero pagan $0
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <TablaOrdenes rows={data.ordenesSinTarifa} mostrarAux />
                <p className="mt-2 text-xs text-muted-foreground">
                  No hay tarifa en Financiera › Tarifas › Personal para esa operación/planta con vigencia en la fecha de
                  cargue: los auxiliares acumulan toneladas pero el destajo queda en $0. Se paga solo donde hay tarifa
                  asignada (p. ej. Distribución nunca la tiene: es la entrega del mismo cargue ya pagado, se muestra
                  aquí a propósito para poder verificar que siga en $0).
                </p>
              </CardContent>
            </Card>
          )}
          {r.ordenesNoFacturar > 0 && (
            <Card className="border-amber-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Órdenes marcadas NO facturar — {t1(r.tonNoFacturar)} t pagadas sin ingreso
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <TablaOrdenes rows={data.ordenesNoFacturar} mostrarAux />
                <p className="mt-2 text-xs text-muted-foreground">
                  Se desmarcó "Facturar" en estas órdenes: no se cobran al cliente, pero su tonelaje sí entra al
                  reparto de destajo. Es costo asumido — verificar que el motivo registrado lo justifique.
                </p>
              </CardContent>
            </Card>
          )}
          {r.auxiliaresHuerfanos.length > 0 && (
            <Card className="border-amber-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Auxiliares que no cruzan con Head Count ({r.auxiliaresHuerfanos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {r.auxiliaresHuerfanos.map((h) => (
                    <Badge key={h} variant="outline" className="font-normal">
                      {h}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  El nombre escrito en la orden no coincide EXACTO con headcount.nombre: reciben reparto de toneladas
                  pero pueden fallar el cruce de salario/vínculo en pagonomina. Corregir el nombre en la orden o en el
                  Head Count.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Diferencias producto vs peso base (báscula) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Peso producto vs peso báscula — {r.ordenesConDiferencia} órden(es) con diferencia (
                {r.difProductoBase >= 0 ? "+" : ""}
                {t1(r.difProductoBase)} t neta)
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.ordenesConDiferencia.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Sin diferencias &gt; 0,05 t entre el peso declarado por productos y la báscula en las órdenes con
                  pesaje físico. Todo cuadra.
                </p>
              ) : (
                <>
                  <TablaOrdenes rows={data.ordenesConDiferencia} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    <strong>Prevalece la báscula</strong>: el pago y el cobro reparten el peso base de cálculo (báscula
                    en plantas y en Descargue de CEDIs); el factor indica cómo se prorratea el detalle de productos
                    para llegar a él (base ÷ producto). Una diferencia grande sugiere error de digitación en el
                    detalle o en el tiquete.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Consolidado por colaborador (expandible) */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  Consolidado por colaborador — {data.colaboradores.length} persona(s)
                </CardTitle>
                <input
                  className="h-8 w-[220px] rounded-md border bg-background px-2 text-sm"
                  placeholder="Buscar colaborador…"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead className="text-right">Órdenes</TableHead>
                    <TableHead className="text-right">Ton asignadas</TableHead>
                    <TableHead className="text-right">Destajo calculado</TableHead>
                    <TableHead className="text-right">Ton pagonomina</TableHead>
                    <TableHead className="text-right">Δ ton</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {colaboradoresFiltrados.map((c) => {
                    const abierto = expand.has(c.persona)
                    const okDelta = Math.abs(c.deltaTon) <= 0.1
                    return (
                      <Fragment key={c.persona}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => toggleExpand(c.persona)}
                        >
                          <TableCell>
                            <span className="inline-flex items-center gap-1">
                              <ChevronRight
                                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${abierto ? "rotate-90" : ""}`}
                              />
                              <span className="font-medium">{c.persona}</span>
                              {!c.enHeadcount && (
                                <Badge variant="outline" className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                                  sin HC
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{c.ordenes}</TableCell>
                          <TableCell className="text-right font-medium">{t2(c.tonAsignada)}</TableCell>
                          <TableCell className="text-right">{money(c.valorPago)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{t2(c.tonPagonomina)}</TableCell>
                          <TableCell
                            className={`text-right font-medium ${okDelta ? "text-muted-foreground" : c.deltaTon > 0 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}
                          >
                            {okDelta ? "✓ " : ""}
                            {c.deltaTon >= 0 ? "+" : ""}
                            {t2(c.deltaTon)}
                          </TableCell>
                        </TableRow>
                        {abierto && (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={6} className="px-2 py-2">
                              <div className="max-h-72 overflow-auto rounded border bg-background">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-xs">Fecha</TableHead>
                                      <TableHead className="text-xs">Orden</TableHead>
                                      <TableHead className="text-xs">Operación</TableHead>
                                      <TableHead className="text-xs">Planta</TableHead>
                                      <TableHead className="text-right text-xs">Ton orden (báscula)</TableHead>
                                      <TableHead className="text-right text-xs"># Aux</TableHead>
                                      <TableHead className="text-right text-xs">Ton persona</TableHead>
                                      <TableHead className="text-right text-xs">Tarifa</TableHead>
                                      <TableHead className="text-right text-xs">Pago</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody className="tabular-nums">
                                    {c.detalle.map((d, i) => (
                                      <TableRow key={i}>
                                        <TableCell className="text-xs whitespace-nowrap">{d.fecha.slice(5)}</TableCell>
                                        <TableCell className="text-xs">{d.orden}</TableCell>
                                        <TableCell className="text-xs">{d.tipooperacion}</TableCell>
                                        <TableCell className="text-xs">{plantaNombre(d.planta)}</TableCell>
                                        <TableCell className="text-right text-xs">{t2(d.tonOrden)}</TableCell>
                                        <TableCell className="text-right text-xs">{d.nAux}</TableCell>
                                        <TableCell className="text-right text-xs font-medium">{t2(d.tonPersona)}</TableCell>
                                        <TableCell className="text-right text-xs">
                                          {d.tarifa > 0 ? money(d.tarifa) : <span className="text-rose-500">sin tarifa</span>}
                                        </TableCell>
                                        <TableCell className="text-right text-xs font-medium">{money(d.pago)}</TableCell>
                                      </TableRow>
                                    ))}
                                    <TableRow className="border-t-2">
                                      <TableCell colSpan={6} className="text-xs font-semibold">
                                        TOTAL {c.persona}
                                      </TableCell>
                                      <TableCell className="text-right text-xs font-bold">{t2(c.tonAsignada)}</TableCell>
                                      <TableCell />
                                      <TableCell className="text-right text-xs font-bold">{money(c.valorPago)}</TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                Toca un colaborador para abrir el detalle de TODO lo pagado en la quincena: cada orden con su tonelaje
                de báscula, el reparto entre auxiliares (báscula ÷ n), la tarifa vigente y el pago. <em>Δ ton</em>{" "}
                compara contra lo que la vista pagonomina liquida efectivamente (✓ = cuadra).
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {!data && !loading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Selecciona la quincena y la planta, y pulsa <strong>Conciliar</strong> para cruzar báscula, pago al
            personal y facturación.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Vista HC por día por proyecto (ID): base real de trabajadores por día, ratificada
// por asistencia (pagonomina), vs el HC planeado y la meta configurados.
function HcPorDia() {
  const { toast } = useToast()
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [rows, setRows] = useState<HcDiaProyecto[]>([])
  const [loading, setLoading] = useState(false)
  const [cargado, setCargado] = useState(false)
  const t1 = (x: number) => (Number(x) || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })

  const consultar = useCallback(async () => {
    setLoading(true)
    const r = await getHcPorDia(anio, mes)
    setLoading(false)
    setCargado(true)
    if (r.success) setRows(r.data)
    else toast({ title: "No se pudo cargar el HC por día", description: r.message, variant: "destructive" })
  }, [anio, mes, toast])

  const anios = [hoy.getFullYear() + 1, hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2]

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label>Año</Label>
            <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anios.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Mes</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
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
            <CardTitle className="text-base">HC por día por proyecto — {MESES[mes - 1]} {anio}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {rows.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">Sin movimiento de toneladas en el mes.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Proyecto</TableHead>
                    <TableHead className="text-right">HC real</TableHead>
                    <TableHead className="text-right">HC plan</TableHead>
                    <TableHead className="text-right">Toneladas</TableHead>
                    <TableHead className="text-right">Ton/trab</TableHead>
                    <TableHead className="text-right">Meta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {rows.map((r, i) => {
                    const cumpleMeta = r.meta > 0 && r.tonPorTrabajador >= r.meta
                    return (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap">
                          {r.dow} {r.fecha.slice(8)}/{r.fecha.slice(5, 7)}
                        </TableCell>
                        <TableCell>{r.idempresa}</TableCell>
                        <TableCell>{r.proyecto}</TableCell>
                        <TableCell className="text-right font-semibold">{r.hcReal}</TableCell>
                        <TableCell
                          className={`text-right ${r.hcConfig > 0 && r.hcReal !== r.hcConfig ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                        >
                          {r.hcConfig || "—"}
                        </TableCell>
                        <TableCell className="text-right">{t1(r.toneladas)}</TableCell>
                        <TableCell
                          className={`text-right ${r.meta > 0 ? (cumpleMeta ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400") : ""}`}
                        >
                          {r.meta > 0 ? (cumpleMeta ? "✓ " : "✗ ") : ""}
                          {t1(r.tonPorTrabajador)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{r.meta > 0 ? t1(r.meta) : "—"}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>HC real</strong> = trabajadores distintos que movieron toneladas ese día en el proyecto
              (asistencia ratificada). <strong>HC plan</strong> = configurado en Financiera › Tarifas › Metas (ámbar si
              difiere). <strong>Ton/trab</strong> = promedio real por trabajador ese día vs. la meta.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
