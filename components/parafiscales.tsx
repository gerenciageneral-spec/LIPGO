"use client"

// Submódulo "Parafiscales" (Gestión Humana › Nómina): cuadro de control de los
// aportes que la empresa paga cada mes a los entes de control (planilla PILA).
// Resumen por entidad + detalle por persona, con los % de ley editables.
// El cálculo vive en lib/parafiscales.ts; aquí solo se presenta.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Loader2,
  Landmark,
  SlidersHorizontal,
  Save,
  Scale,
  HeartPulse,
  ShieldAlert,
  Home,
  GraduationCap,
  Baby,
  PiggyBank,
} from "lucide-react"
import {
  getParafiscales,
  guardarParametrosParafiscales,
  type ParafiscalPersona,
  type ResumenParafiscales,
} from "@/lib/parafiscales-actions"
import { CLASES_ARL, PARAFISCALES_DEFAULT, type ClaseRiesgo, type ParametrosParafiscales } from "@/lib/parafiscales"

const money = (n: number) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

export default function Parafiscales() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [consolidado, setConsolidado] = useState(false)
  const [data, setData] = useState<ParafiscalPersona[]>([])
  const [resumen, setResumen] = useState<ResumenParafiscales | null>(null)
  const [params, setParams] = useState<ParametrosParafiscales>({ anio, ...PARAFISCALES_DEFAULT })
  const [smlv, setSmlv] = useState(0)
  const [loading, setLoading] = useState(true)
  const [savingParams, setSavingParams] = useState(false)
  const [showParams, setShowParams] = useState(false)
  const [showNomenclatura, setShowNomenclatura] = useState(false)

  const cargar = useCallback(async () => {
    if (!consolidado && !selectedEmpresaId) {
      setData([])
      setResumen(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const r = await getParafiscales(consolidado ? null : selectedEmpresaId, anio, mes)
    if (r.success) {
      setData(r.data)
      setResumen(r.resumen ?? null)
      if (r.params) setParams(r.params)
      if (r.smlv) setSmlv(r.smlv)
    } else {
      setData([])
      setResumen(null)
      toast({ title: "Error", description: r.message, variant: "destructive" })
    }
    setLoading(false)
  }, [selectedEmpresaId, consolidado, anio, mes, toast])

  useEffect(() => {
    cargar()
  }, [cargar])

  const guardarParams = async () => {
    setSavingParams(true)
    const r = await guardarParametrosParafiscales({ ...params, anio })
    setSavingParams(false)
    if (r.success) {
      toast({ title: "Parámetros guardados", description: "Se recalcularon los aportes." })
      await cargar()
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const setP = (k: keyof ParametrosParafiscales, v: number | boolean | string) =>
    setParams((prev) => ({ ...prev, [k]: v }) as ParametrosParafiscales)

  // Tarjetas por ENTIDAD: lo que se gira a cada ente de control.
  const entidades = useMemo(() => {
    if (!resumen) return []
    const arlPct = data.length
      ? Array.from(new Set(data.map((p) => p.pctArl))).sort((a, b) => a - b).map((x) => `${x}%`).join(" / ")
      : "—"
    return [
      {
        k: "pension",
        nombre: "Pensión",
        icon: PiggyBank,
        pct: `${params.pctPensionEmpleador}%`,
        empresa: resumen.pensionEmpleador,
        empleado: resumen.pensionEmpleado,
        nota: `Empleador ${params.pctPensionEmpleador}% + trabajador ${params.pctPensionEmpleado}%`,
      },
      {
        k: "salud",
        nombre: "Salud (EPS)",
        icon: HeartPulse,
        pct: `${params.pctSaludEmpleador}%`,
        empresa: resumen.saludEmpleador,
        empleado: resumen.saludEmpleado,
        nota:
          resumen.saludEmpleador === 0
            ? `Empleador exonerado (art. 114-1) · trabajador ${params.pctSaludEmpleado}%`
            : `Empleador ${params.pctSaludEmpleador}% + trabajador ${params.pctSaludEmpleado}%`,
      },
      {
        k: "arl",
        nombre: "ARL",
        icon: ShieldAlert,
        pct: arlPct,
        empresa: resumen.arl,
        empleado: 0,
        nota: "100% a cargo de la empresa · según clase de riesgo",
      },
      {
        k: "caja",
        nombre: "Caja de Compensación",
        icon: Home,
        pct: `${params.pctCaja}%`,
        empresa: resumen.caja,
        empleado: 0,
        nota: "Obligatorio para todos · NO tiene exenciones",
      },
      {
        k: "sena",
        nombre: "SENA",
        icon: GraduationCap,
        pct: `${params.pctSena}%`,
        empresa: resumen.sena,
        empleado: 0,
        nota: resumen.sena === 0 ? "Exonerado (art. 114-1)" : "Causa: hay salarios ≥ 10 SMMLV",
      },
      {
        k: "icbf",
        nombre: "ICBF",
        icon: Baby,
        pct: `${params.pctIcbf}%`,
        empresa: resumen.icbf,
        empleado: 0,
        nota: resumen.icbf === 0 ? "Exonerado (art. 114-1)" : "Causa: hay salarios ≥ 10 SMMLV",
      },
    ]
  }, [resumen, params, data])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Landmark className="h-5 w-5 text-primary" /> Parafiscales y Seguridad Social
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowNomenclatura((s) => !s)}>
              <Scale className="mr-2 h-4 w-4" /> Nomenclatura legal
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowParams((s) => !s)}>
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Parámetros de ley
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Aportes del mes a los <strong>entes de control</strong> (planilla PILA), calculados sobre el{" "}
            <strong>IBC real</strong> de cada trabajador (salario + extras + recargos + dominicales, sin auxilio de
            transporte). Aplica la <strong>exoneración del art. 114-1</strong> del Estatuto Tributario.
          </p>

          {/* Periodo */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Año</Label>
              <Input
                type="number"
                className="w-28"
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Mes</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={consolidado}
                onChange={(e) => setConsolidado(e.target.checked)}
              />
              Consolidado LIP (todos los clientes)
            </label>
            {smlv > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                SMLV {anio}: <strong>{money(smlv)}</strong> · umbral art. 114-1:{" "}
                <strong>{money(smlv * params.umbralExoneracionSmlv)}</strong>
              </span>
            )}
          </div>

          {/* Parámetros de ley */}
          {showParams && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4 text-primary" /> Porcentajes de ley {anio}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
                {[
                  { k: "pctPensionEmpleador" as const, l: "Pensión empresa %" },
                  { k: "pctPensionEmpleado" as const, l: "Pensión trabajador %" },
                  { k: "pctSaludEmpleador" as const, l: "Salud empresa %" },
                  { k: "pctSaludEmpleado" as const, l: "Salud trabajador %" },
                  { k: "pctCaja" as const, l: "Caja %" },
                  { k: "pctSena" as const, l: "SENA %" },
                  { k: "pctIcbf" as const, l: "ICBF %" },
                  { k: "umbralExoneracionSmlv" as const, l: "Umbral exoneración (SMMLV)" },
                  { k: "topeIbcSmlv" as const, l: "Tope IBC (SMLV)" },
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
                {[
                  { k: "claseArlOperativo" as const, l: "Clase ARL · operativo" },
                  { k: "claseArlAdmin" as const, l: "Clase ARL · administrativo" },
                ].map((f) => (
                  <div key={f.k} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{f.l}</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={params[f.k] as ClaseRiesgo}
                      onChange={(e) => setP(f.k, e.target.value)}
                    >
                      {CLASES_ARL.map((c) => (
                        <option key={c.clase} value={c.clase}>
                          {c.clase} — {c.pct}% ({c.ejemplo})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={params.incluyeAuxParafiscales}
                    onChange={(e) => setP("incluyeAuxParafiscales", e.target.checked)}
                  />
                  Sumar el auxilio de transporte a la base de Caja/SENA/ICBF
                </label>
                <Button size="sm" onClick={guardarParams} disabled={savingParams}>
                  {savingParams ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                La <strong>clase de riesgo ARL</strong> se asigna por tipo de personal: los marcados como{" "}
                <strong>administrativos</strong> en Head Count usan la clase administrativa; el resto, la operativa.
              </p>
            </div>
          )}

          {/* Nomenclatura legal */}
          {showNomenclatura && (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <Scale className="h-4 w-4 text-primary" /> Nomenclatura legal de los aportes
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Fundamento normativo de cada aporte (Ministerio de Trabajo · Estatuto Tributario).{" "}
                <strong>Siempre prima la ley.</strong>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-xs">
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
                        c: "IBC (Ingreso Base de Cotización)",
                        n: "Ley 100 de 1993 art. 18 · CST art. 127 y 128",
                        b: "Salario básico + comisiones + horas extras + recargo nocturno + dominicales y festivos",
                        f: "NO incluye el auxilio de transporte (no es salario). Piso: 1 SMLV mensual, proporcional a los días cotizados. Tope: 25 SMLV.",
                      },
                      {
                        c: "Pensión",
                        n: "Ley 100 de 1993 art. 20",
                        b: "IBC",
                        f: "16% total: 12% a cargo de la EMPRESA + 4% a cargo del trabajador. No tiene exoneración.",
                      },
                      {
                        c: "Salud (EPS)",
                        n: "Ley 100 de 1993 art. 204 · E.T. art. 114-1",
                        b: "IBC",
                        f: "12,5% total: 8,5% empresa + 4% trabajador. La empresa está EXONERADA del 8,5% por los trabajadores que devenguen menos de 10 SMMLV. El 4% del trabajador siempre se retiene.",
                      },
                      {
                        c: "Riesgos Laborales (ARL)",
                        n: "Decreto 1772 de 1994 · Ley 1562 de 2012",
                        b: "IBC",
                        f: "100% a cargo de la EMPRESA, según la clase de riesgo: I 0,522% · II 1,044% · III 2,436% · IV 4,350% · V 6,960%.",
                      },
                      {
                        c: "Caja de Compensación Familiar",
                        n: "Ley 21 de 1982",
                        b: "IBC + auxilio de transporte",
                        f: "4% a cargo de la EMPRESA. Obligatorio para TODOS los trabajadores — no tiene exenciones.",
                      },
                      {
                        c: "SENA",
                        n: "Ley 21 de 1982 · E.T. art. 114-1",
                        b: "IBC + auxilio de transporte",
                        f: "2% a cargo de la EMPRESA. EXONERADO por los trabajadores que devenguen menos de 10 SMMLV.",
                      },
                      {
                        c: "ICBF",
                        n: "Ley 89 de 1988 · E.T. art. 114-1",
                        b: "IBC + auxilio de transporte",
                        f: "3% a cargo de la EMPRESA. EXONERADO por los trabajadores que devenguen menos de 10 SMMLV.",
                      },
                      {
                        c: "Auxilio de transporte",
                        n: "CST art. 128 · Ley 15 de 1959",
                        b: "—",
                        f: "Se paga a quien devengue hasta 2 SMMLV, proporcional a los días laborados. NO es base de salud, pensión ni ARL; sí se suma para Caja/SENA/ICBF.",
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
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Calculando los aportes del período…
          </CardContent>
        </Card>
      ) : !resumen || data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {!consolidado && !selectedEmpresaId
              ? "Selecciona una empresa (o marca “Consolidado LIP”) para ver el cuadro."
              : `No hay nómina registrada en ${MESES[mes - 1]} de ${anio} para este alcance.`}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Resumen por ENTIDAD */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entidades.map((e) => {
              const Icon = e.icon
              const cero = e.empresa === 0
              return (
                <Card key={e.k} className={cero ? "opacity-70" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">{e.nombre}</span>
                      </div>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{e.pct}</span>
                    </div>
                    <div className="mt-2 text-2xl font-bold tabular-nums">{money(e.empresa)}</div>
                    <div className="text-xs text-muted-foreground">a cargo de la empresa</div>
                    {e.empleado > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        + {money(e.empleado)} retenido al trabajador ={" "}
                        <strong>{money(e.empresa + e.empleado)}</strong> a girar
                      </div>
                    )}
                    <div className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">{e.nota}</div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Totales */}
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-4 md:grid-cols-5">
              {[
                { l: "Trabajadores", v: String(resumen.personas), sub: `${resumen.exonerados} exonerados (114-1)` },
                { l: "IBC total del mes", v: money(resumen.ibc), sub: "base de cotización" },
                { l: "Aporte EMPRESA", v: money(resumen.totalEmpresa), sub: "costo real del empleador", fuerte: true },
                { l: "Retenido al trabajador", v: money(resumen.totalEmpleado), sub: "salud 4% + pensión 4%" },
                { l: "Total planilla PILA", v: money(resumen.totalPila), sub: "lo que se gira", fuerte: true },
              ].map((t) => (
                <div key={t.l}>
                  <div className="text-xs text-muted-foreground">{t.l}</div>
                  <div className={`text-xl font-bold tabular-nums ${t.fuerte ? "text-primary" : ""}`}>{t.v}</div>
                  <div className="text-xs text-muted-foreground">{t.sub}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Detalle por PERSONA */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Detalle por trabajador — {MESES[mes - 1]} {anio}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trabajador</TableHead>
                    <TableHead className="text-right">Días</TableHead>
                    <TableHead className="text-right">IBC</TableHead>
                    <TableHead className="text-right">Auxilio</TableHead>
                    <TableHead className="text-center">ARL</TableHead>
                    <TableHead className="text-right">Pensión</TableHead>
                    <TableHead className="text-right">Salud</TableHead>
                    <TableHead className="text-right">ARL $</TableHead>
                    <TableHead className="text-right">Caja</TableHead>
                    <TableHead className="text-right">SENA</TableHead>
                    <TableHead className="text-right">ICBF</TableHead>
                    <TableHead className="text-right">Total empresa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((p) => (
                    <TableRow key={p.identificacion || p.persona}>
                      <TableCell>
                        <div className="font-medium">{p.persona}</div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{p.identificacion}</span>
                          {p.esAdmin && (
                            <span className="rounded bg-muted px-1 py-0.5 text-[10px]">Admin</span>
                          )}
                          {!p.exonerado && (
                            <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                              ≥ 10 SMMLV
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.dias}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(p.ibc)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {money(p.auxilio)}
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {p.claseArl} · {p.pctArl}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(p.pensionEmpleador)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.saludEmpleador === 0 ? <span className="text-muted-foreground">—</span> : money(p.saludEmpleador)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(p.arl)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(p.caja)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.sena === 0 ? <span className="text-muted-foreground">—</span> : money(p.sena)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.icbf === 0 ? <span className="text-muted-foreground">—</span> : money(p.icbf)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(p.totalEmpresa)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                “—” = exonerado por el art. 114-1 del E.T. (devenga menos de {params.umbralExoneracionSmlv} SMMLV).
                La <strong>Caja de Compensación</strong> nunca se exonera.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
