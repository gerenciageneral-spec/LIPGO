"use client"

// Gestión Humana › Nómina › Revisión de nómina.
// Selecciona un colaborador + quincena y, con un botón, arma el CUADRO DEFINITIVO
// del nuevo modelo: (A) liquidación diaria (cada día = base; turno suma recargos),
// (B) resumen de quincena (base + turno + bono neto de destajo, pérdida visible),
// (C) archivo plano → Siigo. Lee las vistas pagonomina/archivoplano (fuente de verdad).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  Loader2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react"
import {
  getColaboradores,
  getRevisionNomina,
  type ColaboradorRef,
  type RevisionNominaData,
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
  const { colaborador: c, quincena: q, dias, resumen: r, metaResumen: mr, plano } = data
  const sinDatos = dias.length === 0
  const ton1 = (x: number) => (Number(x) || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })

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
