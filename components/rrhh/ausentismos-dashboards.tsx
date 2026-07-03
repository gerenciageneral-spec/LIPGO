"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"
import {
  Activity,
  CalendarDays,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Building2,
  HeartPulse,
} from "lucide-react"
import type { Ausentismo } from "@/lib/ausentismos-actions"

// Paleta acotada (azul = EG, naranja = AT, teal, rojo = revisión SST, slate).
const COLOR_EG = "#2563eb"
const COLOR_AT = "#f97316"
const COLOR_TEAL = "#0d9488"
const COLOR_RED = "#dc2626"
const COLOR_SLATE = "#64748b"
const BAR_PALETTE = [COLOR_EG, COLOR_TEAL, COLOR_AT, COLOR_SLATE, COLOR_RED]

const MES_ORDER = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

function mesIndex(m?: string | null) {
  const i = MES_ORDER.indexOf((m || "").trim().toLowerCase())
  return i === -1 ? 99 : i
}

const num = (v: number | null | undefined) => (typeof v === "number" && !Number.isNaN(v) ? v : 0)

const fmtCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v || 0)

const fmtNum = (v: number) => new Intl.NumberFormat("es-CO").format(v || 0)

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "text-foreground",
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  accent?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className={`h-5 w-5 ${accent}`} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className={`text-xl font-semibold ${accent}`}>{value}</p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function ChartCard({
  title,
  children,
  empty,
}: {
  title: string
  children: React.ReactNode
  empty: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Sin datos
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Dashboard 1: Resumen (datos más relevantes)                         */
/* ------------------------------------------------------------------ */
export function AusentismosResumen({ items }: { items: Ausentismo[] }) {
  const data = useMemo(() => {
    const totalCasos = items.length
    const totalDias = items.reduce((s, a) => s + num(a.total_dias_incapacidad), 0)
    const casosEG = items.filter((a) => a.tipo_evento === "EG").length
    const casosAT = items.filter((a) => a.tipo_evento === "AT").length
    const casosSST = items.filter((a) => a.requiere_revision_sst).length
    const promedioDias = totalCasos ? totalDias / totalCasos : 0

    // Por tipo (pie)
    const porTipo = [
      { name: "Enfermedad General", value: casosEG, fill: COLOR_EG },
      { name: "Accidente de Trabajo", value: casosAT, fill: COLOR_AT },
    ].filter((d) => d.value > 0)

    // Días por mes (bar)
    const mesMap = new Map<string, number>()
    for (const a of items) {
      const key = a.mes?.trim() || "Sin mes"
      mesMap.set(key, (mesMap.get(key) || 0) + num(a.total_dias_incapacidad))
    }
    const porMes = Array.from(mesMap.entries())
      .map(([mes, dias]) => ({ mes, dias }))
      .sort((x, y) => mesIndex(x.mes) - mesIndex(y.mes))

    // Top diagnósticos por días (horizontal bar)
    const diagMap = new Map<string, { dias: number; desc: string }>()
    for (const a of items) {
      const cod = a.codigo_diagnostico?.trim()
      if (!cod) continue
      const cur = diagMap.get(cod) || { dias: 0, desc: a.descripcion_diagnostico || "" }
      cur.dias += num(a.total_dias_incapacidad)
      diagMap.set(cod, cur)
    }
    const topDiag = Array.from(diagMap.entries())
      .map(([cod, v]) => ({ label: cod, dias: v.dias, desc: v.desc, esM: cod.toUpperCase().startsWith("M") }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 8)

    // Casos por centro de trabajo (bar)
    const centroMap = new Map<string, number>()
    for (const a of items) {
      const key = a.centro_trabajo?.trim() || "Sin centro"
      centroMap.set(key, (centroMap.get(key) || 0) + 1)
    }
    const porCentro = Array.from(centroMap.entries())
      .map(([centro, casos]) => ({ centro, casos }))
      .sort((a, b) => b.casos - a.casos)

    return { totalCasos, totalDias, casosEG, casosAT, casosSST, promedioDias, porTipo, porMes, topDiag, porCentro }
  }, [items])

  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border text-sm text-muted-foreground">
        No hay ausentismos para mostrar con los filtros actuales.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Total de casos" value={fmtNum(data.totalCasos)} icon={Activity} />
        <KpiCard
          label="Días de ausentismo"
          value={fmtNum(data.totalDias)}
          sub={`Promedio ${data.promedioDias.toFixed(1)} días/caso`}
          icon={CalendarDays}
        />
        <KpiCard
          label="Enfermedad General"
          value={fmtNum(data.casosEG)}
          sub="EG"
          icon={HeartPulse}
          accent="text-blue-600"
        />
        <KpiCard
          label="Accidente de Trabajo"
          value={fmtNum(data.casosAT)}
          sub="AT"
          icon={TrendingUp}
          accent="text-orange-600"
        />
        <KpiCard
          label="Revisión SST"
          value={fmtNum(data.casosSST)}
          sub="Diagnósticos código M"
          icon={AlertTriangle}
          accent="text-red-600"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Días de ausentismo por mes" empty={data.porMes.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.porMes}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${fmtNum(v)} días`, "Días"]} />
              <Bar dataKey="dias" name="Días" fill={COLOR_EG} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribución por tipo de evento" empty={data.porTipo.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.porTipo}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                label={({ value }) => fmtNum(value as number)}
              >
                {data.porTipo.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [`${fmtNum(v)} casos`]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top diagnósticos por días de incapacidad" empty={data.topDiag.length === 0}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.topDiag} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={64} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => [`${fmtNum(v)} días`, "Días"]}
                labelFormatter={(label) => {
                  const d = data.topDiag.find((x) => x.label === label)
                  return d?.desc ? `${label} — ${d.desc}` : String(label)
                }}
              />
              <Bar dataKey="dias" name="Días" radius={[0, 4, 4, 0]}>
                {data.topDiag.map((entry, i) => (
                  <Cell key={i} fill={entry.esM ? COLOR_RED : COLOR_TEAL} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Casos por centro de trabajo" empty={data.porCentro.length === 0}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.porCentro} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="centro" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${fmtNum(v)} casos`, "Casos"]} />
              <Bar dataKey="casos" name="Casos" radius={[0, 4, 4, 0]}>
                {data.porCentro.map((_, i) => (
                  <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dashboard 2: Costos del ausentismo                                  */
/* ------------------------------------------------------------------ */
export function AusentismosCostos({ items }: { items: Ausentismo[] }) {
  const data = useMemo(() => {
    const costoEmpresa = items.reduce((s, a) => s + num(a.costos_empresa), 0)
    const costoEps = items.reduce((s, a) => s + num(a.costos_eps), 0)
    const costoTotal = items.reduce(
      (s, a) => s + (num(a.total_salario_pagado) || num(a.costos_empresa) + num(a.costos_eps)),
      0,
    )
    const totalDias = items.reduce((s, a) => s + num(a.total_dias_incapacidad), 0)
    const costoPorDia = totalDias ? costoTotal / totalDias : 0
    const costoPorCaso = items.length ? costoTotal / items.length : 0

    const costoDe = (a: Ausentismo) =>
      num(a.total_salario_pagado) || num(a.costos_empresa) + num(a.costos_eps)

    // Costo empresa vs EPS por mes (stacked)
    const mesMap = new Map<string, { empresa: number; eps: number }>()
    for (const a of items) {
      const key = a.mes?.trim() || "Sin mes"
      const cur = mesMap.get(key) || { empresa: 0, eps: 0 }
      cur.empresa += num(a.costos_empresa)
      cur.eps += num(a.costos_eps)
      mesMap.set(key, cur)
    }
    const porMes = Array.from(mesMap.entries())
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((x, y) => mesIndex(x.mes) - mesIndex(y.mes))

    // Costo por centro de trabajo
    const centroMap = new Map<string, number>()
    for (const a of items) {
      const key = a.centro_trabajo?.trim() || "Sin centro"
      centroMap.set(key, (centroMap.get(key) || 0) + costoDe(a))
    }
    const porCentro = Array.from(centroMap.entries())
      .map(([centro, costo]) => ({ centro, costo }))
      .sort((a, b) => b.costo - a.costo)

    // Costo por tipo (pie)
    let costoEG = 0
    let costoAT = 0
    for (const a of items) {
      if (a.tipo_evento === "AT") costoAT += costoDe(a)
      else costoEG += costoDe(a)
    }
    const porTipo = [
      { name: "Enfermedad General", value: costoEG, fill: COLOR_EG },
      { name: "Accidente de Trabajo", value: costoAT, fill: COLOR_AT },
    ].filter((d) => d.value > 0)

    // Top diagnósticos por costo
    const diagMap = new Map<string, { costo: number; desc: string }>()
    for (const a of items) {
      const cod = a.codigo_diagnostico?.trim()
      if (!cod) continue
      const cur = diagMap.get(cod) || { costo: 0, desc: a.descripcion_diagnostico || "" }
      cur.costo += costoDe(a)
      diagMap.set(cod, cur)
    }
    const topDiag = Array.from(diagMap.entries())
      .map(([cod, v]) => ({ label: cod, costo: v.costo, desc: v.desc }))
      .filter((d) => d.costo > 0)
      .sort((a, b) => b.costo - a.costo)
      .slice(0, 8)

    return {
      costoEmpresa,
      costoEps,
      costoTotal,
      costoPorDia,
      costoPorCaso,
      porMes,
      porCentro,
      porTipo,
      topDiag,
    }
  }, [items])

  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border text-sm text-muted-foreground">
        No hay ausentismos para calcular costos con los filtros actuales.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="Costo total"
          value={fmtCOP(data.costoTotal)}
          icon={DollarSign}
          accent="text-foreground"
        />
        <KpiCard
          label="Asumido por empresa"
          value={fmtCOP(data.costoEmpresa)}
          icon={Building2}
          accent="text-blue-600"
        />
        <KpiCard
          label="Asumido por EPS/ARL"
          value={fmtCOP(data.costoEps)}
          icon={HeartPulse}
          accent="text-teal-600"
        />
        <KpiCard label="Costo por día" value={fmtCOP(data.costoPorDia)} icon={CalendarDays} />
        <KpiCard label="Costo por caso" value={fmtCOP(data.costoPorCaso)} icon={Activity} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Costo por mes (empresa vs EPS/ARL)" empty={data.porMes.length === 0}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.porMes}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`} />
              <Tooltip formatter={(v: number, n) => [fmtCOP(v), n === "empresa" ? "Empresa" : "EPS/ARL"]} />
              <Legend />
              <Bar dataKey="empresa" name="Empresa" stackId="c" fill={COLOR_EG} />
              <Bar dataKey="eps" name="EPS/ARL" stackId="c" fill={COLOR_TEAL} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Costo por tipo de evento" empty={data.porTipo.length === 0}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data.porTipo}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
              >
                {data.porTipo.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [fmtCOP(v)]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Costo por centro de trabajo" empty={data.porCentro.length === 0}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.porCentro} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`} />
              <YAxis type="category" dataKey="centro" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [fmtCOP(v), "Costo"]} />
              <Bar dataKey="costo" name="Costo" radius={[0, 4, 4, 0]}>
                {data.porCentro.map((_, i) => (
                  <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top diagnósticos por costo" empty={data.topDiag.length === 0}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.topDiag} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`} />
              <YAxis type="category" dataKey="label" width={64} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => [fmtCOP(v), "Costo"]}
                labelFormatter={(label) => {
                  const d = data.topDiag.find((x) => x.label === label)
                  return d?.desc ? `${label} — ${d.desc}` : String(label)
                }}
              />
              <Bar dataKey="costo" name="Costo" fill={COLOR_AT} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
