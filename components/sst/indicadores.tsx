"use client"

// Indicadores del SG-SST (Resolución 0312 · Dec. 1072, indicadores mínimos).
// Tablero por indicador: tarjeta con valor/meta/semáforo/tendencia, ficha
// técnica (exigencia de la norma), comparativo interanual y análisis.
// Registrar: alta/edición manual (upsert por periodo+tipo). Datos LIP (100).

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
import { TrendingDown, TrendingUp, Minus, ChevronDown, ChevronRight } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

// Ficha técnica por indicador (exigencia de la norma). sentido: menor|mayor.
interface Ficha {
  tipo: string
  numeral?: string
  nombre: string
  definicion: string
  formula: string
  interpretacion: string
  fuente: string
  periodicidad: string
  responsable: string
  sentido: "menor" | "mayor"
  clase: "resultado" | "gestion"
}
const FICHAS: Ficha[] = [
  { tipo: "frecuencia_at", numeral: "3.3.2", nombre: "Frecuencia de accidentalidad", clase: "resultado", sentido: "menor",
    definicion: "Relación entre el número de accidentes de trabajo y el número de trabajadores en el período.",
    formula: "(N.º de AT / N.º de trabajadores) × 100", interpretacion: "AT por cada 100 trabajadores.",
    fuente: "Registro de AT / investigaciones (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "severidad_at", numeral: "3.3.1", nombre: "Severidad de accidentalidad", clase: "resultado", sentido: "menor",
    definicion: "Días perdidos por AT en relación con el número de trabajadores.",
    formula: "(N.º de días perdidos por AT / N.º de trabajadores) × 100", interpretacion: "Días perdidos por cada 100 trabajadores.",
    fuente: "Incapacidades por AT (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "mortalidad_at", numeral: "3.3.3", nombre: "Mortalidad por AT/EL", clase: "resultado", sentido: "menor",
    definicion: "Proporción de accidentes de trabajo mortales frente al total de AT.",
    formula: "(N.º de AT mortales / N.º total de AT) × 100", interpretacion: "% de AT que fueron mortales.",
    fuente: "Registro de AT (LIPgo)", periodicidad: "Anual", responsable: "Coordinador SST" },
  { tipo: "prevalencia_el", numeral: "3.3.4", nombre: "Prevalencia de enfermedad laboral", clase: "resultado", sentido: "menor",
    definicion: "Número de casos de EL (nuevos y antiguos) en relación con los trabajadores.",
    formula: "(N.º de casos EL / N.º de trabajadores) × 100.000", interpretacion: "Casos de EL por cada 100.000 trabajadores.",
    fuente: "Diagnóstico EL / EPS-ARL", periodicidad: "Anual", responsable: "Coordinador SST" },
  { tipo: "incidencia_el", numeral: "3.3.5", nombre: "Incidencia de enfermedad laboral", clase: "resultado", sentido: "menor",
    definicion: "Número de casos NUEVOS de EL en relación con los trabajadores.",
    formula: "(N.º de casos nuevos EL / N.º de trabajadores) × 100.000", interpretacion: "Casos nuevos de EL por cada 100.000 trabajadores.",
    fuente: "Diagnóstico EL / EPS-ARL", periodicidad: "Anual", responsable: "Coordinador SST" },
  { tipo: "ausentismo", numeral: "3.3.6", nombre: "Ausentismo por causa médica", clase: "resultado", sentido: "menor",
    definicion: "Días de ausencia por causa médica frente a los días de trabajo programados.",
    formula: "(N.º de días de ausencia médica / N.º de días programados) × 100", interpretacion: "% de tiempo perdido por causa médica.",
    fuente: "Control diario / incapacidades (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "investigaciones", nombre: "Cumplimiento de investigación de AT/incidentes", clase: "gestion", sentido: "mayor",
    definicion: "Investigaciones de AT/incidentes realizadas frente a las requeridas.",
    formula: "(Investigaciones realizadas / requeridas) × 100", interpretacion: "% de eventos investigados.",
    fuente: "Investigaciones (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "rotacion_personal", nombre: "Índice de rotación de personal", clase: "gestion", sentido: "menor",
    definicion: "Retiros de personal frente al promedio de empleados.",
    formula: "(Retiros / promedio de empleados) × 100", interpretacion: "% de rotación del personal.",
    fuente: "Head Count / novedades (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
]
const fichaDe = (t: string) => FICHAS.find((f) => f.tipo === t)
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const REG_TIPOS: [string, string][] = FICHAS.map((f) => [f.tipo, f.nombre])

// ¿Está en meta? según sentido (menor-mejor o mayor-mejor).
function enMeta(valor: number | null, meta: number | null, sentido: "menor" | "mayor") {
  if (valor == null || meta == null) return null
  return sentido === "menor" ? valor <= meta : valor >= meta
}

export function IndicadoresSST({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [rows, setRows] = useState<IndicadorRow[]>([])
  const [tab, setTab] = useState("tablero")
  const [anio, setAnio] = useState<string>("")
  const [expandido, setExpandido] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, any>>(vacio())
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function cargar() {
    setRows(await listIndicadores(empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  // Años disponibles (de las filas anuales o mensuales).
  const anios = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) set.add(String(r.periodo).slice(0, 4))
    return Array.from(set).filter(Boolean).sort().reverse()
  }, [rows])
  useEffect(() => {
    if (anios.length && !anios.includes(anio)) setAnio(anios[0])
  }, [anios, anio])

  // Índice: tipo -> { anual, prevAnual, mensual[12] } para el año seleccionado.
  const datos = useMemo(() => {
    const anioPrev = String(Number(anio) - 1)
    const out: Record<string, { anual: IndicadorRow | null; prev: IndicadorRow | null; mens: (number | null)[] }> = {}
    for (const f of FICHAS) {
      const anual = rows.find((r) => r.tipo === f.tipo && r.periodo === anio) ?? null
      const prev = rows.find((r) => r.tipo === f.tipo && r.periodo === anioPrev) ?? null
      const mens: (number | null)[] = Array(12).fill(null)
      for (const r of rows) {
        if (r.tipo !== f.tipo) continue
        const m = String(r.periodo).match(new RegExp(`^${anio}-(\\d{2})$`))
        if (m) mens[Number(m[1]) - 1] = r.valor
      }
      out[f.tipo] = { anual, prev, mens }
    }
    return out
  }, [rows, anio])

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
          Indicadores del SG-SST · Resolución 0312
        </h2>
        {tab === "tablero" && anios.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Año</span>
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
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tablero">Tablero</TabsTrigger>
          <TabsTrigger value="registrar">Registrar</TabsTrigger>
        </TabsList>

        <TabsContent value="tablero" className="space-y-5">
          {rows.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">Sin indicadores registrados aún.</Card>
          ) : (
            <>
              <Seccion titulo="Medición (numerales 3.3.1 – 3.3.6)">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {medicion.map((f) => (
                    <TarjetaIndicador key={f.tipo} f={f} d={datos[f.tipo]} anio={anio} abierto={expandido === f.tipo} onToggle={() => setExpandido(expandido === f.tipo ? null : f.tipo)} />
                  ))}
                </div>
              </Seccion>
              <Seccion titulo="Gestión del SG-SST">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {gestion.map((f) => (
                    <TarjetaIndicador key={f.tipo} f={f} d={datos[f.tipo]} anio={anio} abierto={expandido === f.tipo} onToggle={() => setExpandido(expandido === f.tipo ? null : f.tipo)} />
                  ))}
                </div>
              </Seccion>
            </>
          )}
        </TabsContent>

        <TabsContent value="registrar">
          <Card className="p-4 space-y-3">
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
              <Textarea value={form.observacion} onChange={(e) => set("observacion", e.target.value)} placeholder="Qué pasó y qué acciones se tomaron…" />
            </Field>
            <Button onClick={guardar} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Guardar indicador
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
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

function TarjetaIndicador({
  f,
  d,
  anio,
  abierto,
  onToggle,
}: {
  f: Ficha
  d: { anual: IndicadorRow | null; prev: IndicadorRow | null; mens: (number | null)[] }
  anio: string
  abierto: boolean
  onToggle: () => void
}) {
  const valor = d?.anual?.valor ?? null
  const meta = d?.anual?.meta ?? null
  const ok = enMeta(valor, meta, f.sentido)
  const prev = d?.prev?.valor ?? null
  const delta = valor != null && prev != null ? valor - prev : null
  // Mejora = se mueve hacia el lado bueno (menor-mejor baja / mayor-mejor sube).
  const mejora = delta == null ? null : f.sentido === "menor" ? delta < 0 : delta > 0
  const color = ok == null ? SST_TOKENS.grey : ok ? SST_TOKENS.ok : SST_TOKENS.bad
  const chart = d?.mens.map((v, i) => ({ mes: MESES[i], valor: v }))

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {f.numeral && (
              <span className="mr-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: SST_TOKENS.navy }}>
                {f.numeral}
              </span>
            )}
            <span className="text-sm font-semibold text-foreground">{f.nombre}</span>
          </div>
          {abierto ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <span className="text-3xl font-extrabold tabular-nums" style={{ color }}>
              {valor ?? "—"}
            </span>
            <span className="ml-1 text-xs text-muted-foreground">
              {d?.anual?.unidad || ""} · meta {meta ?? "—"}
            </span>
          </div>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: color }}>
            {ok == null ? "s/meta" : ok ? "En meta" : "Fuera"}
          </span>
        </div>
        {/* Sparkline mensual */}
        <div className="mt-2 h-9">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
              {meta != null && <ReferenceLine y={meta} stroke={SST_TOKENS.bad} strokeDasharray="3 3" />}
              <Line type="monotone" dataKey="valor" stroke={SST_TOKENS.navy} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {delta != null && (
          <div className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: mejora ? SST_TOKENS.ok : SST_TOKENS.bad }}>
            {mejora ? <TrendingDown className="h-3 w-3" /> : delta === 0 ? <Minus className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}
            {Math.round(delta * 10) / 10} vs {Number(anio) - 1}
          </div>
        )}
      </button>

      {abierto && (
        <div className="border-t px-4 py-3 text-xs" style={{ backgroundColor: SST_TOKENS.light }}>
          {/* Gráfico mensual grande */}
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 6, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={34} />
                <Tooltip formatter={(v: any) => [v, f.nombre]} />
                {meta != null && <ReferenceLine y={meta} stroke={SST_TOKENS.bad} strokeDasharray="4 4" label={{ value: `Meta ${meta}`, fontSize: 10, position: "right", fill: SST_TOKENS.bad }} />}
                <Line type="monotone" dataKey="valor" stroke={SST_TOKENS.navy} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Ficha técnica (exigencia de la norma) */}
          <div className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <FTec l="Definición" v={f.definicion} full />
            <FTec l="Fórmula" v={f.formula} />
            <FTec l="Interpretación" v={f.interpretacion} />
            <FTec l="Fuente" v={f.fuente} />
            <FTec l="Periodicidad" v={f.periodicidad} />
            <FTec l="Responsable" v={f.responsable} />
            <FTec l="Meta" v={`${meta ?? "—"} (${f.sentido === "menor" ? "menor es mejor" : "mayor es mejor"})`} />
          </div>
          {d?.anual?.observacion && (
            <div className="mt-2 rounded-md bg-white p-2">
              <span className="font-semibold text-foreground">Análisis:</span> {d.anual.observacion}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function FTec({ l, v, full }: { l: string; v: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <span className="font-semibold text-foreground">{l}: </span>
      <span className="text-muted-foreground">{v}</span>
    </div>
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
