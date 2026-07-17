"use client"

// Indicadores del SG-SST (Resolución 0312 · Dec. 1072). Tablero de gestión con
// COMPARATIVO INTERANUAL: cada indicador se lee contra su meta y contra el mismo
// mes del año anterior, que es como se demuestra gestión ante auditoría.
// Datos LIP (idempresa 100), tabla `sst_indicadores` (indexada por `periodo`:
// 'YYYY-MM' mensual y 'YYYY' para el consolidado anual).
//
// Cableado (se muestra en cada tarjeta para que la auditoría lo pueda rastrear):
//   · 0312   → numeral 3.3.x de la Resolución 0312.
//   · Matriz → auto-cumple el numeral en la Matriz de 60 Estándares cuando hay medición.
//   · BSC    → alimenta el Balanced Scorecard (sig_indicadores).
//
// COLOR (validado con el validador de paletas, claro y oscuro):
//   Los AÑOS son una dimensión ORDINAL (2025 → 2026), no categorías sueltas, así
//   que se codifican con una rampa de un solo tono azul (claro = año anterior,
//   oscuro = año actual). Es segura para daltonismo por luminosidad y NO compite
//   con el semáforo. En modo oscuro la rampa se invierte (el navy desaparece
//   contra el fondo), no se voltea automáticamente.
//   Verde/ámbar/rojo quedan RESERVADOS para el estado frente a la meta.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Row3, Field, Sel } from "@/components/sst/sst-form-ui"
import { listIndicadores, upsertIndicador } from "@/lib/sst-plan-actions"
import type { IndicadorRow } from "@/lib/sst-evidencia-types"
import { FICHAS, MESES, enMeta, type Ficha } from "@/components/sst/indicador-detalle"
import { IndicadorModal3D } from "@/components/sst/indicador-modal-3d"
import { TrendingDown, TrendingUp, Minus, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react"
import {
  LineChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts"

const REG_TIPOS: [string, string][] = FICHAS.map((f) => [f.tipo, f.nombre])

// Rampa ordinal de años (ver nota de COLOR arriba). Se exponen como CSS vars para
// que el modo oscuro use sus propios escalones sin detectar el tema en JS.
const RAMPA = `
.ind-scope {
  --ind-prev: #93B4F5;  /* año anterior  */
  --ind-act:  #0D3B6E;  /* año actual    */
  --ind-grid: #e2e8f0;
  --ind-meta: #94a3b8;
}
.dark .ind-scope {
  --ind-prev: #2E63B8;
  --ind-act:  #A8C7F0;
  --ind-grid: #334155;
  --ind-meta: #64748b;
}
`

const fmt = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", { maximumFractionDigits: 2 })

export function IndicadoresSST({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [rows, setRows] = useState<IndicadorRow[]>([])
  const [tab, setTab] = useState("tablero")
  const [anio, setAnio] = useState<string>("")
  const [base, setBase] = useState<string>("") // año contra el que se compara
  const [verTipo, setVerTipo] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, any>>(vacio())
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function cargar() {
    setRows(await listIndicadores(empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const anios = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) s.add(String(r.periodo).slice(0, 4))
    return Array.from(s).filter(Boolean).sort().reverse()
  }, [rows])

  useEffect(() => {
    if (anios.length && !anios.includes(anio)) setAnio(anios[0])
  }, [anios, anio])
  useEffect(() => {
    // Por defecto se compara contra el año inmediatamente anterior disponible.
    if (!anio) return
    const candidatos = anios.filter((a) => a < anio)
    if (!candidatos.includes(base)) setBase(candidatos[0] ?? "")
  }, [anios, anio, base])

  // Serie mensual + consolidado anual de un indicador para un año dado.
  const serieDe = useMemo(() => {
    return (tipo: string, y: string) => {
      const mens: (number | null)[] = Array(12).fill(null)
      let anual: IndicadorRow | null = null
      if (!y) return { mens, anual }
      for (const r of rows) {
        if (r.tipo !== tipo) continue
        if (r.periodo === y) anual = r
        const m = String(r.periodo).match(new RegExp(`^${y}-(\\d{2})$`))
        if (m) mens[Number(m[1]) - 1] = r.valor
      }
      return { mens, anual }
    }
  }, [rows])

  const datos = useMemo(() => {
    const out: Record<string, DatoIndicador> = {}
    for (const f of FICHAS) {
      const act = serieDe(f.tipo, anio)
      const ant = serieDe(f.tipo, base)
      out[f.tipo] = {
        valor: act.anual?.valor ?? null,
        meta: act.anual?.meta ?? null,
        unidad: act.anual?.unidad ?? "",
        prev: ant.anual?.valor ?? null,
        mens: act.mens,
        mensPrev: ant.mens,
      }
    }
    return out
  }, [serieDe, anio, base])

  async function guardar() {
    const payload = {
      ...form,
      numerador: Number(form.numerador),
      denominador: Number(form.denominador),
      valor: Number(form.valor),
      meta: Number(form.meta),
    }
    const res = await upsertIndicador(payload as Partial<IndicadorRow>, empresaId)
    if (res.success) {
      toast({ title: "Indicador guardado" })
      setForm(vacio())
      cargar()
      setTab("tablero")
    } else toast({ title: "Error", description: res.message })
  }

  const medicion = FICHAS.filter((f) => f.clase === "resultado")
  const gestion = FICHAS.filter((f) => f.clase === "gestion")

  // Resumen de gestión del año: cuántos en meta y cuántos mejoran contra el año base.
  const resumen = useMemo(() => {
    let enM = 0, fuera = 0, sinM = 0, mejoran = 0, empeoran = 0, comparables = 0
    for (const f of FICHAS) {
      const d = datos[f.tipo]
      const ok = enMeta(d?.valor ?? null, d?.meta ?? null, f.sentido)
      if (ok == null) sinM++
      else if (ok) enM++
      else fuera++
      const m = mejora(d?.valor ?? null, d?.prev ?? null, f.sentido)
      if (m != null) {
        comparables++
        if (m === true) mejoran++
        else if (m === false) empeoran++
      }
    }
    return { enM, fuera, sinM, mejoran, empeoran, comparables }
  }, [datos])

  return (
    <div className="ind-scope space-y-4">
      <style>{RAMPA}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
            Indicadores del SG-SST · Resolución 0312
          </h2>
          <p className="text-xs text-muted-foreground">
            Medición LIP · comparativo interanual para demostrar gestión ante auditoría.
          </p>
        </div>
        {tab !== "registrar" && anios.length > 0 && (
          <div className="flex items-end gap-3 text-sm">
            <label className="space-y-0.5">
              <span className="block text-xs text-muted-foreground">Año</span>
              <select
                className="rounded-md border border-input bg-background px-2 py-1"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
              >
                {anios.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="block text-xs text-muted-foreground">Comparar contra</span>
              <select
                className="rounded-md border border-input bg-background px-2 py-1"
                value={base}
                onChange={(e) => setBase(e.target.value)}
              >
                <option value="">(sin comparativo)</option>
                {anios
                  .filter((a) => a !== anio)
                  .map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tablero">Tablero</TabsTrigger>
          <TabsTrigger value="comparativo">Comparativo {base && `${base} vs ${anio}`}</TabsTrigger>
          <TabsTrigger value="registrar">Registrar</TabsTrigger>
        </TabsList>

        {/* ---------------- TABLERO ---------------- */}
        <TabsContent value="tablero" className="space-y-5">
          {rows.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">Sin indicadores registrados aún.</Card>
          ) : (
            <>
              {/* Titular de gestión del año */}
              <Card className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
                <Resumen l="En meta" v={`${resumen.enM} de ${FICHAS.length}`} color={SST_TOKENS.ok} icon={CheckCircle2} />
                <Resumen l="Fuera de meta" v={String(resumen.fuera)} color={SST_TOKENS.bad} icon={AlertTriangle} />
                <Resumen
                  l={base ? `Mejoran vs ${base}` : "Mejoran"}
                  v={base ? `${resumen.mejoran} de ${resumen.comparables}` : "—"}
                  color={SST_TOKENS.ok}
                  icon={TrendingDown}
                />
                <Resumen
                  l={base ? `Empeoran vs ${base}` : "Empeoran"}
                  v={base ? String(resumen.empeoran) : "—"}
                  color={SST_TOKENS.bad}
                  icon={TrendingUp}
                />
              </Card>

              <Seccion titulo="Medición (numerales 3.3.1 – 3.3.6)">
                <Grid>
                  {medicion.map((f) => (
                    <TarjetaIndicador
                      key={f.tipo}
                      f={f}
                      d={datos[f.tipo]}
                      anio={anio}
                      base={base}
                      onVer={() => setVerTipo(f.tipo)}
                    />
                  ))}
                </Grid>
              </Seccion>
              <Seccion titulo="Gestión del SG-SST">
                <Grid>
                  {gestion.map((f) => (
                    <TarjetaIndicador
                      key={f.tipo}
                      f={f}
                      d={datos[f.tipo]}
                      anio={anio}
                      base={base}
                      onVer={() => setVerTipo(f.tipo)}
                    />
                  ))}
                </Grid>
              </Seccion>
            </>
          )}
        </TabsContent>

        {/* ---------------- COMPARATIVO ---------------- */}
        <TabsContent value="comparativo" className="space-y-5">
          {!base ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Elige arriba el año contra el cual comparar para ver la evolución.
            </Card>
          ) : (
            <>
              {/* Tabla comparativa = soporte de auditoría y vista accesible de los gráficos */}
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-xs">
                  <caption className="px-4 pt-4 text-left text-sm font-semibold text-foreground">
                    Comparativo {base} vs {anio} · consolidado anual
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Indicador</th>
                      <th className="px-4 py-2 font-medium">0312</th>
                      <th className="px-4 py-2 text-right font-medium">{base}</th>
                      <th className="px-4 py-2 text-right font-medium">{anio}</th>
                      <th className="px-4 py-2 text-right font-medium">Variación</th>
                      <th className="px-4 py-2 text-right font-medium">Meta {anio}</th>
                      <th className="px-4 py-2 text-center font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FICHAS.map((f) => {
                      const d = datos[f.tipo]
                      const ok = enMeta(d?.valor ?? null, d?.meta ?? null, f.sentido)
                      const delta = d?.valor != null && d?.prev != null ? d.valor - d.prev : null
                      const mej = mejora(d?.valor ?? null, d?.prev ?? null, f.sentido)
                      return (
                        <tr key={f.tipo} className="border-b border-border/50 last:border-0">
                          <td className="px-4 py-2 font-medium text-foreground">{f.nombre}</td>
                          <td className="px-4 py-2 text-muted-foreground">{f.numeral ?? "—"}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmt(d?.prev)}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-foreground">
                            {fmt(d?.valor)}
                          </td>
                          <td
                            className="px-4 py-2 text-right tabular-nums"
                            style={{ color: mej == null ? undefined : mej ? SST_TOKENS.ok : SST_TOKENS.bad }}
                          >
                            {delta == null ? "—" : `${delta > 0 ? "+" : ""}${fmt(delta)}`}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmt(d?.meta)}</td>
                          <td className="px-4 py-2 text-center">
                            <EstadoChip ok={ok} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="px-4 pb-4 pt-2 text-xs text-muted-foreground">
                  La <strong>variación</strong> se colorea según el sentido de cada indicador: para los de
                  “menor es mejor” (accidentalidad, ausentismo) bajar es mejorar; para los de “mayor es mejor”
                  (investigaciones) es al revés.
                </p>
              </Card>

              {/* Small multiples: un gráfico por indicador, dos años, un solo eje */}
              <Seccion titulo={`Evolución mensual · ${base} vs ${anio}`}>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {FICHAS.map((f) => (
                    <GraficoComparativo key={f.tipo} f={f} d={datos[f.tipo]} anio={anio} base={base} />
                  ))}
                </div>
              </Seccion>
            </>
          )}
        </TabsContent>

        {/* ---------------- REGISTRAR ---------------- */}
        <TabsContent value="registrar">
          <Card className="space-y-3 p-4">
            <Row3>
              <Field l="Periodo (AAAA-MM o AAAA)">
                <Input value={form.periodo} onChange={(e) => set("periodo", e.target.value)} placeholder="2026-06" />
              </Field>
              <Field l="Indicador">
                <Sel v={form.tipo} on={(v) => set("tipo", v)} o={REG_TIPOS} />
              </Field>
              <Field l="Unidad">
                <Input value={form.unidad} onChange={(e) => set("unidad", e.target.value)} placeholder="%, índice…" />
              </Field>
              <Field l="Numerador">
                <Input type="number" value={form.numerador} onChange={(e) => set("numerador", e.target.value)} />
              </Field>
              <Field l="Denominador">
                <Input type="number" value={form.denominador} onChange={(e) => set("denominador", e.target.value)} />
              </Field>
              <Field l="Valor del indicador">
                <Input type="number" value={form.valor} onChange={(e) => set("valor", e.target.value)} />
              </Field>
              <Field l="Meta">
                <Input type="number" value={form.meta} onChange={(e) => set("meta", e.target.value)} />
              </Field>
            </Row3>
            <Field l="Análisis / observación del período">
              <Textarea
                value={form.observacion}
                onChange={(e) => set("observacion", e.target.value)}
                placeholder="Qué pasó y qué acciones se tomaron…"
              />
            </Field>
            <Button onClick={guardar} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Guardar indicador
            </Button>
          </Card>
        </TabsContent>
      </Tabs>

      {verTipo && anio && <IndicadorModal3D tipo={verTipo} anio={anio} onClose={() => setVerTipo(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------

interface DatoIndicador {
  valor: number | null
  meta: number | null
  unidad: string
  prev: number | null
  mens: (number | null)[]
  mensPrev: (number | null)[]
}

/** ¿El indicador mejoró respecto al año base, según su sentido? null si no es comparable. */
function mejora(valor: number | null, prev: number | null, sentido: "menor" | "mayor"): boolean | null {
  if (valor == null || prev == null || valor === prev) return null
  return sentido === "menor" ? valor < prev : valor > prev
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: SST_TOKENS.ink }}>
        {titulo}
      </h3>
      {children}
    </div>
  )
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
}

function Resumen({ l, v, color, icon: Icon }: { l: string; v: string; color: string; icon: any }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color }} /> {l}
      </div>
      <div className="text-xl font-bold tabular-nums text-foreground">{v}</div>
    </div>
  )
}

/** Estado frente a la meta. Nunca por color solo: siempre icono + texto. */
function EstadoChip({ ok }: { ok: boolean | null }) {
  const cfg =
    ok == null
      ? { c: SST_TOKENS.grey, t: "Sin meta", I: HelpCircle, fg: SST_TOKENS.ink }
      : ok
        ? { c: SST_TOKENS.ok, t: "En meta", I: CheckCircle2, fg: "#fff" }
        : { c: SST_TOKENS.bad, t: "Fuera", I: AlertTriangle, fg: "#fff" }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: cfg.c, color: cfg.fg }}
    >
      <cfg.I className="h-3 w-3" /> {cfg.t}
    </span>
  )
}

/** Badges del cableado — para que la auditoría vea de dónde a dónde va el indicador. */
function Cableado({ f }: { f: Ficha }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {f.numeral && (
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
          style={{ backgroundColor: SST_TOKENS.navy }}
          title={`Numeral ${f.numeral} de la Resolución 0312`}
        >
          0312 · {f.numeral}
        </span>
      )}
      {f.numeral && (
        <span
          className="rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          title="Auto-cumple este numeral en la Matriz de 60 Estándares cuando hay medición del año"
        >
          Matriz
        </span>
      )}
      <span
        className="rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        title="Alimenta el Balanced Scorecard (BSC)"
      >
        BSC
      </span>
    </div>
  )
}

function TarjetaIndicador({
  f,
  d,
  anio,
  base,
  onVer,
}: {
  f: Ficha
  d: DatoIndicador
  anio: string
  base: string
  onVer: () => void
}) {
  const valor = d?.valor ?? null
  const meta = d?.meta ?? null
  const ok = enMeta(valor, meta, f.sentido)
  const prev = d?.prev ?? null
  const delta = valor != null && prev != null ? Math.round((valor - prev) * 10) / 10 : null
  const mej = mejora(valor, prev, f.sentido)
  const color = ok == null ? SST_TOKENS.ink : ok ? SST_TOKENS.ok : SST_TOKENS.bad

  // Serie del año actual + la del año base como referencia recesiva detrás.
  const chart = MESES.map((mes, i) => ({
    mes,
    actual: d?.mens?.[i] ?? null,
    anterior: base ? (d?.mensPrev?.[i] ?? null) : null,
  }))

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg">
      <button type="button" onClick={onVer} className="w-full p-4 text-left">
        <Cableado f={f} />
        <div className="mt-1.5 text-sm font-semibold text-foreground">{f.nombre}</div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <span className="text-3xl font-extrabold tabular-nums" style={{ color }}>
              {fmt(valor)}
            </span>
            <span className="ml-1 text-xs text-muted-foreground">
              {d?.unidad || ""} · meta {fmt(meta)}
            </span>
          </div>
          <EstadoChip ok={ok} />
        </div>

        <div className="mt-2 h-14">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              {meta != null && (
                <ReferenceLine y={meta} stroke="var(--ind-meta)" strokeDasharray="4 3" strokeWidth={1} />
              )}
              {base && (
                <Line
                  type="monotone"
                  dataKey="anterior"
                  stroke="var(--ind-prev)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
              <Line
                type="monotone"
                dataKey="actual"
                stroke="var(--ind-act)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-1 flex items-center justify-between text-[11px]">
          {delta != null && base ? (
            <span
              className="flex items-center gap-1 font-medium"
              style={{ color: mej == null ? SST_TOKENS.ink : mej ? SST_TOKENS.ok : SST_TOKENS.bad }}
            >
              {mej == null ? (
                <Minus className="h-3 w-3" />
              ) : (f.sentido === "menor") === mej ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <TrendingUp className="h-3 w-3" />
              )}
              {delta > 0 ? "+" : ""}
              {fmt(delta)} vs {base}
            </span>
          ) : (
            <span />
          )}
          <span className="text-primary underline decoration-dotted">ver 3D →</span>
        </div>
      </button>
    </Card>
  )
}

/** Un indicador, dos años, UN solo eje (misma unidad). Con leyenda y tooltip. */
function GraficoComparativo({ f, d, anio, base }: { f: Ficha; d: DatoIndicador; anio: string; base: string }) {
  const chart = MESES.map((mes, i) => ({
    mes,
    [base]: d?.mensPrev?.[i] ?? null,
    [anio]: d?.mens?.[i] ?? null,
  }))
  const meta = d?.meta ?? null
  const hayDatos = chart.some((p) => p[base] != null || p[anio] != null)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{f.nombre}</div>
          <div className="text-xs text-muted-foreground">
            {f.numeral ? `Numeral ${f.numeral} · ` : ""}
            {f.sentido === "menor" ? "menor es mejor" : "mayor es mejor"}
            {meta != null ? ` · meta ${fmt(meta)}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs">
          <div className="tabular-nums text-muted-foreground">
            {base}: {fmt(d?.prev)}
          </div>
          <div className="font-semibold tabular-nums text-foreground">
            {anio}: {fmt(d?.valor)}
          </div>
        </div>
      </div>

      <div className="mt-3 h-48">
        {hayDatos ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--ind-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--ind-grid)",
                  background: "hsl(var(--popover))",
                  color: "hsl(var(--popover-foreground))",
                }}
                formatter={(v: any, name: any) => [fmt(v as number), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
              {meta != null && (
                <ReferenceLine
                  y={meta}
                  stroke="var(--ind-meta)"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                  label={{ value: "meta", position: "right", fontSize: 10, fill: "var(--ind-meta)" }}
                />
              )}
              <Line
                type="monotone"
                dataKey={base}
                stroke="var(--ind-prev)"
                strokeWidth={2}
                dot={{ r: 2.5 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey={anio}
                stroke="var(--ind-act)"
                strokeWidth={2}
                dot={{ r: 2.5 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Sin medición mensual en estos años.
          </div>
        )}
      </div>
    </Card>
  )
}

const vacio = () => ({
  periodo: new Date().toISOString().slice(0, 7),
  tipo: "frecuencia_at",
  numerador: 0,
  denominador: 0,
  valor: 0,
  meta: 0,
  unidad: "",
  observacion: "",
})

export default IndicadoresSST
