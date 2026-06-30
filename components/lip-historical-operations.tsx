"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Loader2, ChevronLeft, ChevronRight, RefreshCw, TrendingUp, TrendingDown,
  Truck, Target, Users, TicketCheck, ArrowUpRight, ArrowDownRight, Minus,
  AlertTriangle, Trophy, BarChart3,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Area, AreaChart, ComposedChart, ReferenceLine, Cell, PieChart, Pie,
} from "recharts"

interface MetaDiaRecord {
  fecha: string; idempresa: number; tipo_producto: string; tipooperacion: string
  total_viajes: number; total_toneladas: number; meta_dia: number
}
interface ToneladaDiaRecord {
  fecha: string; operador: string; proyecto_id: number; tipo_producto: string
  tipooperacion: string; cantidad_auxiliares: number; toneladas_producto: number
}

const COLORS = {
  primary: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  cyan: "#06b6d4",
  slate: "#64748b",
  indigo: "#6366f1",
}
const PIE_COLORS = [COLORS.primary, COLORS.emerald, COLORS.amber, COLORS.rose, COLORS.violet, COLORS.cyan]
const BAR_PAIRS: [string, string][] = [["#3b82f6", "#93c5fd"], ["#10b981", "#6ee7b7"], ["#f59e0b", "#fcd34d"], ["#f43f5e", "#fda4af"]]

function DeltaBadge({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  if (previous === 0 && current === 0) return null
  const delta = previous === 0 ? 100 : ((current - previous) / previous) * 100
  const isUp = delta > 0
  const isNeutral = Math.abs(delta) < 0.5
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isNeutral ? "bg-muted text-muted-foreground" : isUp ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
      {isNeutral ? <Minus className="h-2.5 w-2.5" /> : isUp ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {isNeutral ? "0%" : `${isUp ? "+" : ""}${delta.toFixed(1)}%`}{suffix}
    </span>
  )
}

export function LipHistoricalOperations() {
  const { selectedEmpresaId } = useAuth()
  const [metaDia, setMetaDia] = useState<MetaDiaRecord[]>([])
  const [metaPrev, setMetaPrev] = useState<MetaDiaRecord[]>([])
  const [tonDia, setTonDia] = useState<ToneladaDiaRecord[]>([])
  const [tonPrev, setTonPrev] = useState<ToneladaDiaRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
  })
  const [filterProducto, setFilterProducto] = useState("all")
  const [filterOperacion, setFilterOperacion] = useState("all")

  const normalizeMeta = (rows: any[]): MetaDiaRecord[] =>
    (rows || []).map((r: any) => ({
      fecha: r["Fecha"] || r.fecha || "",
      idempresa: Number(r["IdEmpresa"] || r.idempresa || 0),
      tipo_producto: r["Tipo de Producto"] || r.tipo_producto || "",
      tipooperacion: r["Tipo de Operacion"] || r.tipooperacion || "",
      total_viajes: Number(r["Total Viajes/Tickets"] || r.total_viajes || 0),
      total_toneladas: Number(r["Total Toneladas Procesadas"] || r.total_toneladas || 0),
      meta_dia: Number(r["Meta Dia"] || r.meta_dia || 0),
    }))

  const normalizeTon = (rows: any[]): ToneladaDiaRecord[] =>
    (rows || []).map((r: any) => ({
      fecha: r["Fecha"] || r.fecha || "",
      operador: r["Operador"] || r.operador || "",
      proyecto_id: r["ID Proyecto"] || r.proyecto_id || 0,
      tipo_producto: r["Tipo de Producto"] || r.tipo_producto || "",
      tipooperacion: r["Tipo de Operacion"] || r.tipooperacion || "",
      cantidad_auxiliares: Number(r["Cantidad Auxiliares en Operacion"] || r.cantidad_auxiliares || 0),
      toneladas_producto: Number(r["Toneladas Cargadas"] || r.toneladas_producto || 0),
    }))

  const loadData = async (monthOverride?: string) => {
    if (!selectedEmpresaId) return
    setLoading(true)
    try {
      const m = monthOverride || currentMonth
      const res = await fetch(`/api/lip-dashboard?empresaId=${selectedEmpresaId}&mode=monthly&month=${m}`)
      const json = await res.json()
      setMetaDia(normalizeMeta(json.metaDia))
      setMetaPrev(normalizeMeta(json.metaDiaPrev))
      setTonDia(normalizeTon(json.toneladasDia))
      setTonPrev(normalizeTon(json.toneladasDiaPrev))
    } catch (e) {
      console.error("[v0] LIP historical error:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [selectedEmpresaId])

  const navigateMonth = (dir: number) => {
    const [y, m] = currentMonth.split("-").map(Number)
    const d = new Date(y, m - 1 + dir, 1)
    const nm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    setCurrentMonth(nm)
    loadData(nm)
  }

  const monthLabel = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number)
    return new Date(y, m - 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" })
  }, [currentMonth])

  // Filtered data
  const fMeta = useMemo(() => metaDia.filter(r => (filterProducto === "all" || r.tipo_producto === filterProducto) && (filterOperacion === "all" || r.tipooperacion === filterOperacion)), [metaDia, filterProducto, filterOperacion])
  const fTon = useMemo(() => tonDia.filter(r => (filterProducto === "all" || r.tipo_producto === filterProducto) && (filterOperacion === "all" || r.tipooperacion === filterOperacion)), [tonDia, filterProducto, filterOperacion])
  const fMetaPrev = useMemo(() => metaPrev.filter(r => (filterProducto === "all" || r.tipo_producto === filterProducto) && (filterOperacion === "all" || r.tipooperacion === filterOperacion)), [metaPrev, filterProducto, filterOperacion])
  const fTonPrev = useMemo(() => tonPrev.filter(r => (filterProducto === "all" || r.tipo_producto === filterProducto) && (filterOperacion === "all" || r.tipooperacion === filterOperacion)), [tonPrev, filterProducto, filterOperacion])

  const productos = useMemo(() => [...new Set(metaDia.map(r => r.tipo_producto))].filter(Boolean), [metaDia])
  const operaciones = useMemo(() => [...new Set(metaDia.map(r => r.tipooperacion))].filter(Boolean), [metaDia])

  // --- KPIs ---
  const totalTon = useMemo(() => fMeta.reduce((s, r) => s + (Number(r.total_toneladas) || 0), 0), [fMeta])
  const totalMeta = useMemo(() => fMeta.reduce((s, r) => s + (Number(r.meta_dia) || 0), 0), [fMeta])
  const avgCumplimiento = useMemo(() => totalMeta === 0 ? 0 : Math.round((totalTon / totalMeta) * 100), [totalTon, totalMeta])
  const totalOperaciones = useMemo(() => fMeta.reduce((s, r) => s + (Number(r.total_viajes) || 0), 0), [fMeta])
  const totalOperadores = useMemo(() => new Set(fTon.map(r => r.operador)).size, [fTon])
  const diasActivos = useMemo(() => new Set(fMeta.map(r => r.fecha)).size, [fMeta])

  const prevTon = useMemo(() => fMetaPrev.reduce((s, r) => s + (Number(r.total_toneladas) || 0), 0), [fMetaPrev])
  const prevMeta = useMemo(() => fMetaPrev.reduce((s, r) => s + (Number(r.meta_dia) || 0), 0), [fMetaPrev])
  const prevCumplimiento = useMemo(() => prevMeta === 0 ? 0 : Math.round((prevTon / prevMeta) * 100), [prevTon, prevMeta])
  const prevOperaciones = useMemo(() => fMetaPrev.reduce((s, r) => s + (Number(r.total_viajes) || 0), 0), [fMetaPrev])
  const prevOperadores = useMemo(() => new Set(fTonPrev.map(r => r.operador)).size, [fTonPrev])

  // --- Daily cumplimiento trend ---
  const dailyCumplimiento = useMemo(() => {
    const byDate: Record<string, { fecha: string; tons: number; meta: number }> = {}
    fMeta.forEach(r => {
      if (!byDate[r.fecha]) byDate[r.fecha] = { fecha: r.fecha, tons: 0, meta: 0 }
      byDate[r.fecha].tons += Number(r.total_toneladas) || 0
      byDate[r.fecha].meta += Number(r.meta_dia) || 0
    })
    return Object.values(byDate).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(d => ({
      fecha: d.fecha.slice(5),
      cumplimiento: d.meta > 0 ? Math.round((d.tons / d.meta) * 100) : 0,
      toneladas: +d.tons.toFixed(2),
      meta: +d.meta.toFixed(2),
    }))
  }, [fMeta])

  // --- Daily volume stacked by product ---
  const dailyVolumeByProduct = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {}
    fMeta.forEach(r => {
      if (!byDate[r.fecha]) byDate[r.fecha] = {}
      byDate[r.fecha][r.tipo_producto] = (byDate[r.fecha][r.tipo_producto] || 0) + (Number(r.total_toneladas) || 0)
    })
    const allProducts = [...new Set(fMeta.map(r => r.tipo_producto))].filter(Boolean)
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, prods]) => {
      const entry: Record<string, any> = { fecha: fecha.slice(5) }
      allProducts.forEach(p => { entry[p] = +(prods[p] || 0).toFixed(2) })
      return entry
    })
  }, [fMeta])
  const allProductKeys = useMemo(() => [...new Set(fMeta.map(r => r.tipo_producto))].filter(Boolean), [fMeta])

  // --- Cumplimiento by Tipo de Operacion AND Tipo de Producto (grouped bars) ---
  const cumplimientoByOpAndProduct = useMemo(() => {
    // Group: operacion > producto > { tons, meta }
    const groups: Record<string, Record<string, { tons: number; meta: number }>> = {}
    metaDia.forEach(r => {
      const op = r.tipooperacion || "N/A"
      const prod = r.tipo_producto || "N/A"
      if (!groups[op]) groups[op] = {}
      if (!groups[op][prod]) groups[op][prod] = { tons: 0, meta: 0 }
      groups[op][prod].tons += Number(r.total_toneladas) || 0
      groups[op][prod].meta += Number(r.meta_dia) || 0
    })
    // Build chart data: one bar group per operacion, bars for each producto (actual + meta)
    const allProds = [...new Set(metaDia.map(r => r.tipo_producto))].filter(Boolean)
    const chartData = Object.entries(groups).map(([op, prods]) => {
      const entry: Record<string, any> = { operacion: op }
      allProds.forEach(p => {
        const d = prods[p] || { tons: 0, meta: 0 }
        entry[`${p}_real`] = +d.tons.toFixed(2)
        entry[`${p}_meta`] = +d.meta.toFixed(2)
        entry[`${p}_cumpl`] = d.meta > 0 ? Math.round((d.tons / d.meta) * 100) : 0
      })
      return entry
    })
    return { data: chartData, products: allProds }
  }, [metaDia])

  // --- Cumplimiento by operation type (daily lines) ---
  const cumplimientoByOp = useMemo(() => {
    const ops = [...new Set(fMeta.map(r => r.tipooperacion))].filter(Boolean)
    const byDate: Record<string, Record<string, { tons: number; meta: number }>> = {}
    fMeta.forEach(r => {
      if (!byDate[r.fecha]) byDate[r.fecha] = {}
      if (!byDate[r.fecha][r.tipooperacion]) byDate[r.fecha][r.tipooperacion] = { tons: 0, meta: 0 }
      byDate[r.fecha][r.tipooperacion].tons += Number(r.total_toneladas) || 0
      byDate[r.fecha][r.tipooperacion].meta += Number(r.meta_dia) || 0
    })
    const chartData = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, opData]) => {
      const entry: Record<string, any> = { fecha: fecha.slice(5) }
      ops.forEach(op => {
        const d = opData[op]
        entry[op] = d && d.meta > 0 ? Math.round((d.tons / d.meta) * 100) : 0
      })
      return entry
    })
    return { data: chartData, ops }
  }, [fMeta])

  // --- Tonnage by operation (pie) ---
  const opPie = useMemo(() => {
    const groups: Record<string, number> = {}
    fMeta.forEach(r => { groups[r.tipooperacion] = (groups[r.tipooperacion] || 0) + (Number(r.total_toneladas) || 0) })
    return Object.entries(groups).map(([name, value]) => ({ name, value: +value.toFixed(2) }))
  }, [fMeta])

  // --- Operator rankings using SUM of Toneladas Cargadas from operaciones_desglosadas ---
  const operatorStats = useMemo(() => {
    // Use ALL tonDia (not filtered by operacion) to get total per operator
    const source = filterProducto === "all" ? tonDia : tonDia.filter(r => r.tipo_producto === filterProducto)
    const ops: Record<string, { operador: string; operaciones: number; toneladas: number; dias: Set<string>; tiposOp: Set<string> }> = {}
    source.forEach(r => {
      const k = r.operador
      if (!ops[k]) ops[k] = { operador: k, operaciones: 0, toneladas: 0, dias: new Set(), tiposOp: new Set() }
      ops[k].operaciones += 1
      ops[k].toneladas += Number(r.toneladas_producto) || 0
      ops[k].dias.add(r.fecha)
      ops[k].tiposOp.add(r.tipooperacion)
    })
    return Object.values(ops)
      .map(o => ({ operador: o.operador, operaciones: o.operaciones, toneladas: +o.toneladas.toFixed(2), dias: o.dias.size, promedio: +(o.toneladas / Math.max(o.dias.size, 1)).toFixed(2), tiposOp: [...o.tiposOp].join(", ") }))
      .sort((a, b) => b.toneladas - a.toneladas)
  }, [tonDia, filterProducto])

  const top5 = useMemo(() => operatorStats.slice(0, 5), [operatorStats])
  const bottom5 = useMemo(() => operatorStats.length > 5 ? operatorStats.slice(-5).reverse() : [], [operatorStats])
  const maxStatTon = useMemo(() => Math.max(...operatorStats.map(o => o.toneladas), 1), [operatorStats])

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Historico Mensual</h2>
          <p className="text-sm text-muted-foreground capitalize">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterProducto} onValueChange={setFilterProducto}>
            <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue placeholder="Producto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los Productos</SelectItem>
              {productos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterOperacion} onValueChange={setFilterOperacion}>
            <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Operacion" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las Ops.</SelectItem>
              {operaciones.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs font-medium capitalize w-32 text-center">{monthLabel}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData()} className="h-8"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* KPI Cards - 6 cards including Meta del Mes */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { title: "Toneladas Mes", value: totalTon.toFixed(1), prev: prevTon, icon: Truck, color: "text-blue-500", bg: "bg-blue-500/10", subtitle: `Meta: ${totalMeta.toFixed(1)} ton` },
          { title: "Meta del Mes", value: totalMeta.toFixed(1), prev: prevMeta, icon: Target, color: "text-indigo-500", bg: "bg-indigo-500/10", subtitle: `Faltan: ${Math.max(totalMeta - totalTon, 0).toFixed(1)} ton` },
          { title: "Cumplimiento", value: `${avgCumplimiento}%`, prev: prevCumplimiento, icon: Target, color: avgCumplimiento >= 100 ? "text-emerald-500" : avgCumplimiento >= 80 ? "text-amber-500" : "text-rose-500", bg: avgCumplimiento >= 100 ? "bg-emerald-500/10" : avgCumplimiento >= 80 ? "bg-amber-500/10" : "bg-rose-500/10", isCumplimiento: true, subtitle: `${totalTon.toFixed(1)} / ${totalMeta.toFixed(1)}` },
          { title: "Total Operaciones", value: totalOperaciones.toString(), prev: prevOperaciones, icon: TicketCheck, color: "text-cyan-500", bg: "bg-cyan-500/10" },
          { title: "Operadores", value: totalOperadores.toString(), prev: prevOperadores, icon: Users, color: "text-violet-500", bg: "bg-violet-500/10" },
          { title: "Dias Activos", value: diasActivos.toString(), prev: 0, icon: BarChart3, color: "text-slate-500", bg: "bg-slate-500/10" },
        ].map((kpi, i) => (
          <Card key={i} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{kpi.title}</p>
                  <p className="text-2xl font-bold tracking-tight">{kpi.value}</p>
                  {(kpi as any).subtitle && <p className="text-[10px] text-muted-foreground">{(kpi as any).subtitle}</p>}
                  {kpi.prev !== 0 && (
                    <DeltaBadge
                      current={(kpi as any).isCumplimiento ? avgCumplimiento : Number(kpi.value.replace("%", "").replace(",", ""))}
                      previous={kpi.prev}
                      suffix=" vs mes ant."
                    />
                  )}
                </div>
                <div className={`${kpi.bg} ${kpi.color} p-2 rounded-xl`}>
                  <kpi.icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cumplimiento general progress bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Cumplimiento General del Mes</p>
            <Badge variant={avgCumplimiento >= 100 ? "default" : avgCumplimiento >= 80 ? "secondary" : "destructive"} className="text-xs">
              {totalTon.toFixed(1)} / {totalMeta.toFixed(1)} ton ({avgCumplimiento}%)
            </Badge>
          </div>
          <div className="w-full bg-muted rounded-full h-4 relative overflow-hidden">
            <div
              className="h-4 rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(avgCumplimiento, 100)}%`,
                backgroundColor: avgCumplimiento >= 100 ? COLORS.emerald : avgCumplimiento >= 80 ? COLORS.amber : COLORS.rose,
              }}
            />
            {/* 100% marker */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/30" style={{ left: "100%" }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">0 ton</span>
            <span className="text-[10px] text-muted-foreground">{totalMeta.toFixed(1)} ton (Meta)</span>
          </div>
        </CardContent>
      </Card>

      {/* Cumplimiento: Bars for toneladas + Line for meta */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Toneladas Diarias vs Meta</CardTitle>
            <CardDescription className="text-xs">Barras = toneladas reales, Linea = meta diaria. Verde si supera la meta, rojo si no.</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyCumplimiento.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dailyCumplimiento} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v: number, name: string) => {
                      if (name === "toneladas") return [`${v.toFixed(2)} ton`, "Toneladas"]
                      if (name === "meta") return [`${v.toFixed(2)} ton`, "Meta Dia"]
                      return [`${v}%`, "Cumplimiento"]
                    }}
                    labelFormatter={(label) => `Dia: ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} formatter={(val: string) => val === "toneladas" ? "Toneladas Reales" : val === "meta" ? "Meta Dia" : val} />
                  <Bar dataKey="toneladas" barSize={16} radius={[3, 3, 0, 0]} name="toneladas">
                    {dailyCumplimiento.map((entry, i) => (
                      <Cell
                        key={`bar-${i}`}
                        fill={entry.toneladas >= entry.meta ? COLORS.emerald : COLORS.rose}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="meta"
                    stroke={COLORS.amber}
                    strokeWidth={2.5}
                    strokeDasharray="6 3"
                    dot={{ r: 3, fill: COLORS.amber, stroke: "#fff", strokeWidth: 1.5 }}
                    name="meta"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground text-center py-12">Sin datos</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Volumen Diario por Producto</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyVolumeByProduct.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dailyVolumeByProduct} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {allProductKeys.map((pk, i) => (
                    <Area key={pk} type="monotone" dataKey={pk} stackId="1" stroke={PIE_COLORS[i % PIE_COLORS.length]} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={0.4} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground text-center py-12">Sin datos</p>}
          </CardContent>
        </Card>
      </div>

      {/* NEW: Cumplimiento by Tipo de Operacion y Tipo de Producto - grouped bars */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Cumplimiento por Tipo de Operacion y Producto</CardTitle>
          <CardDescription className="text-xs">Toneladas reales vs meta del mes por cada combinacion</CardDescription>
        </CardHeader>
        <CardContent>
          {cumplimientoByOpAndProduct.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cumplimientoByOpAndProduct.data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="operacion" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(value: number, name: string) => {
                    const label = name.endsWith("_real") ? `${name.replace("_real", "")} (Real)` : name.endsWith("_meta") ? `${name.replace("_meta", "")} (Meta)` : name
                    return [`${value.toFixed(2)} ton`, label]
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10 }}
                  formatter={(value: string) => {
                    return value.endsWith("_real") ? `${value.replace("_real", "")} (Real)` : value.endsWith("_meta") ? `${value.replace("_meta", "")} (Meta)` : value
                  }}
                />
                {cumplimientoByOpAndProduct.products.map((p, i) => (
                  <Bar key={`${p}_meta`} dataKey={`${p}_meta`} fill={BAR_PAIRS[i % BAR_PAIRS.length][1]} barSize={30} radius={[2, 2, 0, 0]} />
                ))}
                {cumplimientoByOpAndProduct.products.map((p, i) => (
                  <Bar key={`${p}_real`} dataKey={`${p}_real`} fill={BAR_PAIRS[i % BAR_PAIRS.length][0]} barSize={30} radius={[2, 2, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-muted-foreground text-center py-12">Sin datos</p>}
          {/* Summary badges below the chart */}
          {cumplimientoByOpAndProduct.data.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3 justify-center">
              {cumplimientoByOpAndProduct.data.map((row, ri) => (
                cumplimientoByOpAndProduct.products.map((p, pi) => {
                  const cumpl = (row as any)[`${p}_cumpl`] || 0
                  return (
                    <Badge key={`${ri}-${pi}`} variant={cumpl >= 100 ? "default" : "secondary"} className="text-[10px] gap-1">
                      {row.operacion} / {p}: <span className="font-bold">{cumpl}%</span>
                    </Badge>
                  )
                })
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cumplimiento by operation + Op Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Cumplimiento Diario por Tipo de Operacion</CardTitle>
          </CardHeader>
          <CardContent>
            {cumplimientoByOp.data.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={cumplimientoByOp.data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ReferenceLine y={100} stroke="#10b981" strokeDasharray="5 5" />
                  <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [`${v}%`, ""]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {cumplimientoByOp.ops.map((op, i) => (
                    <Line key={op} type="monotone" dataKey={op} stroke={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground text-center py-12">Sin datos</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Toneladas por Operacion</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {opPie.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={opPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 9 }}>
                      {opPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v.toFixed(2)} ton`, ""]} contentStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-1 justify-center">
                  {opPie.map((p, i) => (
                    <span key={i} className="flex items-center gap-1 text-[10px]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />{p.name}: {p.value.toFixed(1)} ton
                    </span>
                  ))}
                </div>
              </>
            ) : <p className="text-xs text-muted-foreground text-center py-12">Sin datos</p>}
          </CardContent>
        </Card>
      </div>

      {/* Top 5 + Bottom 5 Operators */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-emerald-200 dark:border-emerald-900/40">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm font-semibold">Top 5 Operadores del Mes</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {top5.length > 0 ? top5.map((op, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold ${i === 0 ? "bg-amber-500 text-white" : i === 1 ? "bg-slate-400 text-white" : i === 2 ? "bg-orange-400 text-white" : "bg-muted text-muted-foreground"}`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{op.operador}</p>
                  <p className="text-[9px] text-muted-foreground">{op.tiposOp}</p>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                    <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${(op.toneladas / maxStatTon) * 100}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold">{op.toneladas} ton</p>
                  <p className="text-[9px] text-muted-foreground">{op.dias}d | ~{op.promedio}/d</p>
                </div>
              </div>
            )) : <p className="text-xs text-muted-foreground text-center py-6">Sin datos</p>}
          </CardContent>
        </Card>

        <Card className="border-rose-200 dark:border-rose-900/40">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <CardTitle className="text-sm font-semibold text-rose-600 dark:text-rose-400">Operadores con Menor Rendimiento</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {bottom5.length > 0 ? bottom5.map((op, i) => (
              <div key={i} className="flex items-center gap-3 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{op.operador}</p>
                  <p className="text-[9px] text-muted-foreground">{op.tiposOp}</p>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                    <div className="h-1.5 rounded-full bg-rose-500 transition-all" style={{ width: `${(op.toneladas / maxStatTon) * 100}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="destructive" className="text-[10px]">{op.toneladas} ton</Badge>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{op.dias}d | ~{op.promedio}/d</p>
                </div>
              </div>
            )) : <p className="text-xs text-muted-foreground text-center py-6">Todos los operadores rinden bien</p>}
          </CardContent>
        </Card>
      </div>

      {/* Full Operator Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Detalle Completo de Operadores</CardTitle>
          <CardDescription className="text-xs">{operatorStats.length} operadores en el mes - Toneladas basadas en sumatoria de Toneladas Cargadas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] w-8">#</TableHead>
                  <TableHead className="text-[11px]">Operador</TableHead>
                  <TableHead className="text-[11px]">Operaciones</TableHead>
                  <TableHead className="text-[11px] text-center">Dias</TableHead>
                  <TableHead className="text-[11px] text-center">Total Ops.</TableHead>
                  <TableHead className="text-[11px] text-right">Toneladas</TableHead>
                  <TableHead className="text-[11px] text-right">Promedio/Dia</TableHead>
                  <TableHead className="text-[11px] w-[130px]">Rendimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operatorStats.length > 0 ? operatorStats.map((op, i) => (
                  <TableRow key={i} className="hover:bg-muted/50">
                    <TableCell className="text-xs font-semibold text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium">{op.operador}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{op.tiposOp}</TableCell>
                    <TableCell className="text-xs text-center">{op.dias}</TableCell>
                    <TableCell className="text-xs text-center">{op.operaciones}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">{op.toneladas}</TableCell>
                    <TableCell className="text-xs text-right">{op.promedio}</TableCell>
                    <TableCell>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" style={{
                          width: `${Math.min((op.toneladas / maxStatTon) * 100, 100)}%`,
                          backgroundColor: op.toneladas / maxStatTon > 0.7 ? COLORS.emerald : op.toneladas / maxStatTon > 0.4 ? COLORS.amber : COLORS.rose,
                        }} />
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">Sin datos de operadores</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
