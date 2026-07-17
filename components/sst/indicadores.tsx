"use client"

// Indicadores del SG-SST (Resolución 0312 · Dec. 1072). Tablero de tarjetas
// (valor/meta/semáforo/tendencia) que al tocarse abren la VISTA 3D del indicador.
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
import { FICHAS, MESES, enMeta, type Ficha } from "@/components/sst/indicador-detalle"
import { IndicadorModal3D } from "@/components/sst/indicador-modal-3d"
import { TrendingDown, TrendingUp, Minus } from "lucide-react"
import { LineChart, Line, ReferenceLine, ResponsiveContainer } from "recharts"

const REG_TIPOS: [string, string][] = FICHAS.map((f) => [f.tipo, f.nombre])

export function IndicadoresSST({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [rows, setRows] = useState<IndicadorRow[]>([])
  const [tab, setTab] = useState("tablero")
  const [anio, setAnio] = useState<string>("")
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
            <select className="rounded-md border border-input bg-background px-2 py-1" value={anio} onChange={(e) => setAnio(e.target.value)}>
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
                <Grid>
                  {medicion.map((f) => (
                    <TarjetaIndicador key={f.tipo} f={f} d={datos[f.tipo]} anio={anio} onVer={() => setVerTipo(f.tipo)} />
                  ))}
                </Grid>
              </Seccion>
              <Seccion titulo="Gestión del SG-SST">
                <Grid>
                  {gestion.map((f) => (
                    <TarjetaIndicador key={f.tipo} f={f} d={datos[f.tipo]} anio={anio} onVer={() => setVerTipo(f.tipo)} />
                  ))}
                </Grid>
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

      {verTipo && anio && <IndicadorModal3D tipo={verTipo} anio={anio} onClose={() => setVerTipo(null)} />}
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
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
}

function TarjetaIndicador({
  f,
  d,
  anio,
  onVer,
}: {
  f: Ficha
  d: { anual: IndicadorRow | null; prev: IndicadorRow | null; mens: (number | null)[] }
  anio: string
  onVer: () => void
}) {
  const valor = d?.anual?.valor ?? null
  const meta = d?.anual?.meta ?? null
  const ok = enMeta(valor, meta, f.sentido)
  const prev = d?.prev?.valor ?? null
  const delta = valor != null && prev != null ? Math.round((valor - prev) * 10) / 10 : null
  const mejora = delta == null ? null : f.sentido === "menor" ? delta < 0 : delta > 0
  const color = ok == null ? SST_TOKENS.grey : ok ? SST_TOKENS.ok : SST_TOKENS.bad
  const chart = d?.mens.map((v, i) => ({ mes: MESES[i], valor: v }))

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg">
      <button type="button" onClick={onVer} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {f.numeral && (
              <span className="mr-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: SST_TOKENS.navy }}>
                {f.numeral}
              </span>
            )}
            <span className="text-sm font-semibold text-foreground">{f.nombre}</span>
          </div>
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
        <div className="mt-2 h-9">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
              {meta != null && <ReferenceLine y={meta} stroke={SST_TOKENS.bad} strokeDasharray="3 3" />}
              <Line type="monotone" dataKey="valor" stroke={SST_TOKENS.navy} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          {delta != null ? (
            <span className="flex items-center gap-1" style={{ color: mejora ? SST_TOKENS.ok : delta === 0 ? SST_TOKENS.ink : SST_TOKENS.bad }}>
              {mejora ? <TrendingDown className="h-3 w-3" /> : delta === 0 ? <Minus className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
              {delta > 0 ? "+" : ""}
              {delta} vs {Number(anio) - 1}
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
