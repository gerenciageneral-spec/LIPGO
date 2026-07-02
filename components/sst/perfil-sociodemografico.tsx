"use client"

// Perfil Sociodemográfico (SST-FOR-32). Censo + análisis SG-SST / ISO 45001 / 0312.
// Filtra por el selector global (proyecto) y por estado (activos/retirados).
// Lee sst_perfil_sociodemografico.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Kpi } from "@/components/sst/sst-form-ui"
import { listPerfilSociodemografico } from "@/lib/sst-perfil-actions"
import type { PerfilSociodemograficoRow } from "@/lib/sst-evidencia-types"
import { Users, Loader2 } from "lucide-react"
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts"

const COLORS = ["#0D3B6E", "#00B4CC", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6", "#F97316", "#64748B"]
const T = (v: any) => String(v ?? "").trim()

function conteo(rows: PerfilSociodemograficoRow[], fn: (r: PerfilSociodemograficoRow) => string): { name: string; value: number }[] {
  const m: Record<string, number> = {}
  for (const r of rows) {
    const k = fn(r) || "(sin dato)"
    m[k] = (m[k] || 0) + 1
  }
  return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

const rangoEdad = (e: number | null) => {
  const n = Number(e) || 0
  if (!n) return "(sin dato)"
  if (n <= 25) return "18–25"
  if (n <= 35) return "26–35"
  if (n <= 45) return "36–45"
  if (n <= 55) return "46–55"
  return "56+"
}
const antiguedadAnios = (r: PerfilSociodemograficoRow): number | null => {
  const s = T(r.fecha_ingreso)
  const m = /(\d{4})/.exec(s.length <= 5 ? "20" + s.slice(-2) : s) // heurística año
  const y = m ? Number(m[1]) : null
  if (!y || y < 2000 || y > 2100) return null
  return Math.max(0, 2026 - y)
}

// Columnas de la tabla detallada (todo el contexto) + exportación CSV.
const COLS: { k: keyof PerfilSociodemograficoRow | "_nombre"; l: string }[] = [
  { k: "documento", l: "Documento" }, { k: "_nombre", l: "Nombre" }, { k: "edad", l: "Edad" }, { k: "sexo", l: "Sexo" },
  { k: "centro_trabajo", l: "Centro" }, { k: "cargo", l: "Cargo" }, { k: "turno", l: "Turno" }, { k: "fecha_ingreso", l: "Ingreso" },
  { k: "eps", l: "EPS" }, { k: "afp", l: "AFP" }, { k: "arl", l: "ARL" },
  { k: "nivel_escolaridad", l: "Escolaridad" }, { k: "estado_civil", l: "Estado civil" }, { k: "grupo_etnico", l: "Grupo étnico" },
  { k: "cabeza_familia", l: "Cabeza fam." }, { k: "num_hijos", l: "Hijos" }, { k: "personas_hogar", l: "Personas hogar" }, { k: "ingresos_familiares", l: "Ingresos" },
  { k: "tipo_vivienda", l: "Vivienda" }, { k: "zona", l: "Zona" }, { k: "estrato", l: "Estrato" }, { k: "transporte", l: "Transporte" },
  { k: "municipio_residencia", l: "Municipio" }, { k: "depto_nacimiento", l: "Depto nac." },
  { k: "consume_alcohol", l: "Alcohol" }, { k: "actividad_fisica", l: "Act. física" }, { k: "fumador", l: "Fumador" }, { k: "estado", l: "Estado" },
]
const celda = (r: PerfilSociodemograficoRow, k: string) => (k === "_nombre" ? `${T(r.nombres)} ${T(r.apellidos)}`.trim() : T((r as any)[k]))

// Filtros: uno por cada COLUMNA (su texto genera las opciones). Arriba solo Mes/Año.
// Un filtro es dropdown si tiene pocos valores; si son muchos (nombre/documento…),
// es campo de texto (contiene).
const MESES = [
  ["01", "Enero"], ["02", "Febrero"], ["03", "Marzo"], ["04", "Abril"], ["05", "Mayo"], ["06", "Junio"],
  ["07", "Julio"], ["08", "Agosto"], ["09", "Septiembre"], ["10", "Octubre"], ["11", "Noviembre"], ["12", "Diciembre"],
]
// Fecha de ingreso: se asume D/M/A (formato Colombia).
const ingParts = (r: PerfilSociodemograficoRow) => {
  const p = T(r.fecha_ingreso).split(/[/\-.]/).map((x) => x.trim()).filter(Boolean)
  if (p.length < 3) return { anio: "", mes: "" }
  let y = p[2]; if (y.length === 2) y = "20" + y
  const mNum = Number(p[1])
  return { anio: /^\d{4}$/.test(y) ? y : "", mes: mNum >= 1 && mNum <= 12 ? String(mNum).padStart(2, "0") : "" }
}

export function PerfilSociodemografico({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const [rows, setRows] = useState<PerfilSociodemograficoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState<"activo" | "retirado" | "todos">("activo")
  const [tab, setTab] = useState("analisis")
  const [filtros, setFiltros] = useState<Record<string, string>>({}) // por columna
  const [mesF, setMesF] = useState("")
  const [anioF, setAnioF] = useState("")

  async function cargar() {
    setLoading(true)
    setRows(await listPerfilSociodemografico(empresaId))
    setLoading(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const base = useMemo(() => rows.filter((r) => estado === "todos" || (r.estado ?? "activo") === estado), [rows, estado])
  // Opciones (valores presentes) por CADA columna.
  const opciones = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    COLS.forEach((c) => (m[String(c.k)] = new Set()))
    base.forEach((r) => COLS.forEach((c) => { const v = celda(r, String(c.k)); if (v) m[String(c.k)].add(v) }))
    return m
  }, [base])
  // ¿dropdown (pocas opciones) o campo de texto "contiene" (muchas)?
  const esSelect = (k: string) => (opciones[k]?.size ?? 0) <= 25
  const anios = useMemo(() => {
    const s = new Set<string>()
    base.forEach((r) => { const a = ingParts(r).anio; if (a) s.add(a) })
    return Array.from(s).sort().reverse()
  }, [base])
  // Tabla: base + Mes/Año (ingreso) + filtro por cada columna.
  const filtradas = useMemo(() => {
    return base.filter((r) => {
      const ing = ingParts(r)
      if (anioF && ing.anio !== anioF) return false
      if (mesF && ing.mes !== mesF) return false
      for (const c of COLS) {
        const fv = filtros[String(c.k)]
        if (!fv) continue
        const cell = celda(r, String(c.k))
        if (esSelect(String(c.k))) { if (cell !== fv) return false }
        else if (!cell.toLowerCase().includes(fv.toLowerCase())) return false
      }
      return true
    })
  }, [base, filtros, mesF, anioF, opciones])
  const activos = Object.values(filtros).filter(Boolean).length + (mesF ? 1 : 0) + (anioF ? 1 : 0)
  // Tarjetas de análisis EN VIVO según los filtros aplicados.
  const kpisF = useMemo(() => {
    const n = filtradas.length
    const pct = (x: number) => (n ? Math.round((100 * x) / n) : 0)
    const cnt = (fn: (r: PerfilSociodemograficoRow) => boolean) => filtradas.filter(fn).length
    const edades = filtradas.map((r) => Number(r.edad) || 0).filter(Boolean)
    const edad = edades.length ? Math.round(edades.reduce((a, b) => a + b, 0) / edades.length) : 0
    const ants = filtradas.map(antiguedadAnios).filter((x): x is number => x !== null)
    const ant = ants.length ? (ants.reduce((a, b) => a + b, 0) / ants.length).toFixed(1) : "0"
    const moda = (fn: (r: PerfilSociodemograficoRow) => string) => { const c = conteo(filtradas, fn); return c.length && c[0].name !== "(sin dato)" ? `${c[0].name}` : "—" }
    return {
      n, pctTotal: base.length ? Math.round((100 * n) / base.length) : 0, edad, ant,
      masc: pct(cnt((r) => /^m/i.test(T(r.sexo)))), fem: pct(cnt((r) => /^f/i.test(T(r.sexo)))),
      cabeza: pct(cnt((r) => /^s/i.test(T(r.cabeza_familia)))), fuma: pct(cnt((r) => /^s/i.test(T(r.fumador)))),
      activ: pct(cnt((r) => /^s/i.test(T(r.actividad_fisica)))),
      escolaridad: moda((r) => T(r.nivel_escolaridad)), estrato: moda((r) => T(r.estrato)), cargo: moda((r) => T(r.cargo)),
    }
  }, [filtradas, base])
  const edadPromF = kpisF.edad

  function exportarCSV() {
    const head = COLS.map((c) => `"${c.l}"`).join(";")
    const body = filtradas.map((r) => COLS.map((c) => `"${String(celda(r, c.k as string)).replace(/"/g, "'")}"`).join(";")).join("\n")
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8;" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `perfil-sociodemografico-${estado}.csv`
    a.click()
  }

  const kpis = useMemo(() => {
    const n = base.length
    const edades = base.map((r) => Number(r.edad) || 0).filter(Boolean)
    const edadProm = edades.length ? Math.round(edades.reduce((a, b) => a + b, 0) / edades.length) : 0
    const h = base.filter((r) => /^m/i.test(T(r.sexo))).length
    const muj = base.filter((r) => /^f/i.test(T(r.sexo))).length
    const cabeza = base.filter((r) => /^s/i.test(T(r.cabeza_familia))).length
    const ants = base.map(antiguedadAnios).filter((x): x is number => x !== null)
    const antProm = ants.length ? (ants.reduce((a, b) => a + b, 0) / ants.length).toFixed(1) : "0"
    const fuma = base.filter((r) => /^s/i.test(T(r.fumador))).length
    const activo = base.filter((r) => /^s/i.test(T(r.actividad_fisica))).length
    const pct = (x: number) => (n ? Math.round((100 * x) / n) : 0)
    return { n, edadProm, hPct: pct(h), mujPct: pct(muj), cabezaPct: pct(cabeza), antProm, fumaPct: pct(fuma), activoPct: pct(activo) }
  }, [base])

  const fmtEmpresa = empresaId ? "" : " · consolidado (todos los proyectos)"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
          <Users className="h-5 w-5" /> Perfil Sociodemográfico (SST-FOR-32){fmtEmpresa}
        </h2>
        <Badge variant="outline">ISO 45001 · Res. 0312 — caracterización de la población trabajadora</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["activo", "retirado", "todos"] as const).map((e) => (
          <Button key={e} size="sm" variant={estado === e ? "default" : "outline"} onClick={() => setEstado(e)}
            style={estado === e ? { background: SST_TOKENS.navy, color: "white" } : undefined}>
            {e === "activo" ? "Activos" : e === "retirado" ? "Retirados" : "Todos"}
          </Button>
        ))}
        {loading && <Loader2 className="h-4 w-4 animate-spin" style={{ color: SST_TOKENS.teal }} />}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <Kpi t="Colaboradores" v={kpis.n} />
        <Kpi t="Edad promedio" v={`${kpis.edadProm}`} />
        <Kpi t="Masculino" v={`${kpis.hPct}%`} c={SST_TOKENS.navy} />
        <Kpi t="Femenino" v={`${kpis.mujPct}%`} c={SST_TOKENS.teal} />
        <Kpi t="Cabeza de familia" v={`${kpis.cabezaPct}%`} />
        <Kpi t="Antigüedad prom." v={`${kpis.antProm} a`} />
        <Kpi t="Actividad física" v={`${kpis.activoPct}%`} c={SST_TOKENS.ok} />
        <Kpi t="Fumadores" v={`${kpis.fumaPct}%`} c={kpis.fumaPct > 20 ? SST_TOKENS.warn : SST_TOKENS.ok} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="analisis">Análisis (dashboards)</TabsTrigger>
          <TabsTrigger value="listado">Tabla / Análisis detallado</TabsTrigger>
        </TabsList>

        <TabsContent value="analisis" className="pt-3">
          {base.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Sin registros para este filtro.</Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Torta titulo="Sexo" data={conteo(base, (r) => T(r.sexo))} />
              <Barra titulo="Rango de edad" data={conteo(base, (r) => rangoEdad(r.edad))} orden={["18–25", "26–35", "36–45", "46–55", "56+"]} />
              <Barra titulo="Nivel de escolaridad" data={conteo(base, (r) => T(r.nivel_escolaridad))} />
              <Torta titulo="Estado civil" data={conteo(base, (r) => T(r.estado_civil))} />
              <Barra titulo="Estrato de servicios públicos" data={conteo(base, (r) => T(r.estrato))} />
              <Torta titulo="Turno de trabajo" data={conteo(base, (r) => T(r.turno))} />
              <Barra titulo="Grupo étnico" data={conteo(base, (r) => T(r.grupo_etnico))} />
              <Torta titulo="Tipo de vivienda" data={conteo(base, (r) => T(r.tipo_vivienda))} />
              <Torta titulo="Zona de residencia" data={conteo(base, (r) => T(r.zona))} />
              <Barra titulo="Transporte al trabajo" data={conteo(base, (r) => T(r.transporte))} />
              <Barra titulo="EPS" data={conteo(base, (r) => T(r.eps)).slice(0, 8)} />
              <Barra titulo="Hábitos (Sí)" data={[
                { name: "Actividad física", value: base.filter((r) => /^s/i.test(T(r.actividad_fisica))).length },
                { name: "Consume alcohol", value: base.filter((r) => /^s/i.test(T(r.consume_alcohol))).length },
                { name: "Fumador", value: base.filter((r) => /^s/i.test(T(r.fumador))).length },
                { name: "Cabeza de familia", value: base.filter((r) => /^s/i.test(T(r.cabeza_familia))).length },
              ]} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="listado" className="space-y-3 pt-3">
          {/* Tarjetas de análisis EN VIVO — reflejan los filtros aplicados */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Kpi t={`Filtrados (${kpisF.pctTotal}% del total)`} v={`${kpisF.n}`} />
            <Kpi t="Edad promedio" v={`${kpisF.edad}`} />
            <Kpi t="Antigüedad prom." v={`${kpisF.ant} a`} />
            <Kpi t="Masculino / Fem." v={`${kpisF.masc}/${kpisF.fem}%`} c={SST_TOKENS.navy} />
            <Kpi t="Cabeza de familia" v={`${kpisF.cabeza}%`} />
            <Kpi t="Act. física / Fuma" v={`${kpisF.activ}/${kpisF.fuma}%`} c={kpisF.fuma > 20 ? SST_TOKENS.warn : SST_TOKENS.ok} />
            <TarjetaTexto t="Escolaridad predominante" v={kpisF.escolaridad} />
            <TarjetaTexto t="Estrato predominante" v={kpisF.estrato} />
            <TarjetaTexto t="Cargo predominante" v={kpisF.cargo} />
          </div>

          {/* Arriba SOLO Mes y Año (de ingreso). Los demás filtros van en cada columna. */}
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <label className="mr-1 text-[10px] uppercase text-muted-foreground">Año ingreso</label>
              <select value={anioF} onChange={(e) => setAnioF(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
                <option value="">Todos</option>
                {anios.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
            <div>
              <label className="mr-1 text-[10px] uppercase text-muted-foreground">Mes ingreso</label>
              <select value={mesF} onChange={(e) => setMesF(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
                <option value="">Todos</option>
                {MESES.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
              </select>
            </div>
            <Badge variant="outline">{filtradas.length} de {base.length} · edad prom. {edadPromF}</Badge>
            {activos > 0 && (
              <Button size="sm" variant="ghost" onClick={() => { setFiltros({}); setMesF(""); setAnioF("") }}>Limpiar filtros</Button>
            )}
            <Button size="sm" variant="outline" onClick={exportarCSV} disabled={filtradas.length === 0}>Exportar CSV</Button>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  {COLS.map((c) => (<th key={c.k as string} className="whitespace-nowrap px-2 pt-2 text-left">{c.l}</th>))}
                </tr>
                <tr style={{ background: SST_TOKENS.navy }}>
                  {COLS.map((c) => {
                    const k = String(c.k)
                    return (
                      <th key={k} className="px-2 pb-2 align-top font-normal">
                        {esSelect(k) ? (
                          <select
                            value={filtros[k] ?? ""}
                            onChange={(e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))}
                            className="h-7 w-full min-w-[90px] rounded border bg-background px-1 text-[11px] text-foreground"
                            title={`Filtrar por ${c.l}`}
                          >
                            <option value="">Todos</option>
                            {Array.from(opciones[k] ?? []).sort().map((o) => (<option key={o} value={o}>{o}</option>))}
                          </select>
                        ) : (
                          <input
                            value={filtros[k] ?? ""}
                            onChange={(e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))}
                            placeholder="filtrar…"
                            className="h-7 w-full min-w-[90px] rounded border bg-background px-1 text-[11px] text-foreground"
                          />
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((r, i) => (
                  <tr key={r.id ?? i} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    {COLS.map((c) => (
                      <td key={c.k as string} className="whitespace-nowrap p-2">
                        {c.k === "estado" ? (
                          <Badge style={{ background: (r.estado ?? "activo") === "retirado" ? SST_TOKENS.grey : SST_TOKENS.ok, color: "white" }}>{r.estado ?? "activo"}</Badge>
                        ) : (
                          celda(r, c.k as string)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr><td colSpan={COLS.length} className="p-6 text-center text-muted-foreground">Sin colaboradores para estos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TarjetaTexto({ t, v }: { t: string; v: string }) {
  return (
    <Card className="p-4">
      <div className="truncate text-base font-bold" style={{ color: SST_TOKENS.navy }} title={v}>{v}</div>
      <div className="text-xs text-muted-foreground">{t}</div>
    </Card>
  )
}

function Torta({ titulo, data }: { titulo: string; data: { name: string; value: number }[] }) {
  return (
    <Card className="p-3">
      <h3 className="mb-1 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>{titulo}</h3>
      <ResponsiveContainer width="100%" height={210}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e: any) => `${e.name}: ${e.value}`} labelLine={false} fontSize={10}>
            {data.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  )
}

function Barra({ titulo, data, orden }: { titulo: string; data: { name: string; value: number }[]; orden?: string[] }) {
  const d = orden ? [...data].sort((a, b) => orden.indexOf(a.name) - orden.indexOf(b.name)) : data
  return (
    <Card className="p-3">
      <h3 className="mb-1 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>{titulo}</h3>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={d} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={120} />
          <Tooltip />
          <Bar dataKey="value" name="Colaboradores" fill={SST_TOKENS.navy} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

export default PerfilSociodemografico
