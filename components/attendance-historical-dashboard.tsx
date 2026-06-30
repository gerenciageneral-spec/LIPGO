"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, TrendingUp, TrendingDown, Minus, CalendarDays, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Award } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-provider"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
} from "recharts"

interface DashboardRecord {
  id: number
  fecha: string
  nombre: string
  identificacion: string
  puesto: string | null
  asistencia: string | null
  hed: number | null
  hedf: number | null
  hen: number | null
  hef: number | null
  hn: number | null
  especialidad: string | null
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const COLORS = [
  "hsl(160, 60%, 45%)",
  "hsl(200, 70%, 50%)",
  "hsl(30, 80%, 55%)",
  "hsl(350, 65%, 55%)",
  "hsl(270, 55%, 55%)",
  "hsl(45, 80%, 50%)",
  "hsl(180, 50%, 45%)",
  "hsl(320, 60%, 50%)",
]

function DeltaBadge({ current, previous, suffix = "", invert = false }: { current: number; previous: number; suffix?: string; invert?: boolean }) {
  if (previous === 0 && current === 0) return null
  const diff = current - previous
  const isPositive = invert ? diff < 0 : diff > 0
  const isNeutral = diff === 0

  if (isNeutral) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
        <Minus className="h-2.5 w-2.5" /> Igual
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${isPositive ? "text-emerald-700 bg-emerald-500/10" : "text-rose-700 bg-rose-500/10"}`}>
      {isPositive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {diff > 0 ? "+" : ""}{diff}{suffix}
    </span>
  )
}

export function AttendanceHistoricalDashboard() {
  const { selectedEmpresaId } = useAuth()
  const [data, setData] = useState<DashboardRecord[]>([])
  const [prevMonthData, setPrevMonthData] = useState<DashboardRecord[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

  const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`

  const getPrevMonthStr = () => {
    let pm = selectedMonth - 1
    let py = selectedYear
    if (pm === 0) { pm = 12; py -= 1 }
    return `${py}-${String(pm).padStart(2, "0")}`
  }

  const loadData = async () => {
    if (!selectedEmpresaId) return
    setLoading(true)
    try {
      const prevMonthStr = getPrevMonthStr()
      const [currentRes, prevRes] = await Promise.all([
        fetch(`/api/attendance/dashboard?empresaId=${selectedEmpresaId}&mode=monthly&month=${monthStr}`),
        fetch(`/api/attendance/dashboard?empresaId=${selectedEmpresaId}&mode=monthly&month=${prevMonthStr}`),
      ])
      const currentJson = await currentRes.json()
      const prevJson = await prevRes.json()
      setData(currentJson.data || [])
      setPrevMonthData(prevJson.data || [])
    } catch (e) {
      console.error("Error loading historical dashboard:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedEmpresaId, monthStr])

  const goToPrevMonth = () => {
    if (selectedMonth === 1) { setSelectedYear(selectedYear - 1); setSelectedMonth(12) }
    else { setSelectedMonth(selectedMonth - 1) }
  }

  const goToNextMonth = () => {
    if (selectedMonth === 12) { setSelectedYear(selectedYear + 1); setSelectedMonth(1) }
    else { setSelectedMonth(selectedMonth + 1) }
  }

  // Current month summary
  const summary = useMemo(() => {
    const total = data.length
    const asistencias = data.filter((r) => r.puesto !== null && !r.asistencia).length
    const ausentismos = data.filter((r) => r.asistencia !== null).length
    const sinReportar = data.filter((r) => r.puesto === null && !r.asistencia).length
    const pctAsistencia = total > 0 ? Math.round((asistencias / total) * 100) : 0
    const uniquePersons = new Set(data.map((r) => r.identificacion)).size
    const totalHED = data.reduce((s, r) => s + (r.hed || 0), 0)
    const totalHEDF = data.reduce((s, r) => s + (r.hedf || 0), 0)
    const totalHEN = data.reduce((s, r) => s + (r.hen || 0), 0)
    const totalHEF = data.reduce((s, r) => s + (r.hef || 0), 0)
    const totalHN = data.reduce((s, r) => s + (r.hn || 0), 0)
    const totalHE = totalHED + totalHEDF + totalHEN + totalHEF + totalHN
    return { total, asistencias, ausentismos, sinReportar, pctAsistencia, uniquePersons, totalHED, totalHEDF, totalHEN, totalHEF, totalHN, totalHE }
  }, [data])

  // Previous month summary for comparison
  const prevSummary = useMemo(() => {
    const total = prevMonthData.length
    const asistencias = prevMonthData.filter((r) => r.puesto !== null && !r.asistencia).length
    const ausentismos = prevMonthData.filter((r) => r.asistencia !== null).length
    const pctAsistencia = total > 0 ? Math.round((asistencias / total) * 100) : 0
    const uniquePersons = new Set(prevMonthData.map((r) => r.identificacion)).size
    const totalHE = prevMonthData.reduce((s, r) => s + (r.hed || 0) + (r.hedf || 0) + (r.hen || 0) + (r.hef || 0) + (r.hn || 0), 0)
    return { total, asistencias, ausentismos, pctAsistencia, uniquePersons, totalHE }
  }, [prevMonthData])

  const prevMonthLabel = useMemo(() => {
    let pm = selectedMonth - 1
    if (pm === 0) pm = 12
    return MONTH_NAMES[pm - 1]?.substring(0, 3)
  }, [selectedMonth])

  // Top absentees of the month
  const topAbsentees = useMemo(() => {
    const map: Record<string, { nombre: string; faltas: number; motivos: string[] }> = {}
    data.forEach((r) => {
      if (r.asistencia) {
        const key = r.identificacion || r.nombre
        if (!map[key]) map[key] = { nombre: r.nombre, faltas: 0, motivos: [] }
        map[key].faltas += 1
        if (!map[key].motivos.includes(r.asistencia)) map[key].motivos.push(r.asistencia)
      }
    })
    return Object.values(map).sort((a, b) => b.faltas - a.faltas).slice(0, 5)
  }, [data])

  // Top overtime earners of the month
  const topOvertimePersons = useMemo(() => {
    const map: Record<string, { nombre: string; totalHE: number }> = {}
    data.forEach((r) => {
      const he = (r.hed || 0) + (r.hedf || 0) + (r.hen || 0) + (r.hef || 0) + (r.hn || 0)
      if (he > 0) {
        const key = r.identificacion || r.nombre
        if (!map[key]) map[key] = { nombre: r.nombre, totalHE: 0 }
        map[key].totalHE += he
      }
    })
    return Object.values(map).sort((a, b) => b.totalHE - a.totalHE).slice(0, 5)
  }, [data])

  // Daily trend data
  const dailyTrend = useMemo(() => {
    const map: Record<string, { date: string; turnos: number; asistencias: number; ausentismos: number }> = {}
    data.forEach((r) => {
      const d = r.fecha
      if (!map[d]) map[d] = { date: d, turnos: 0, asistencias: 0, ausentismos: 0 }
      map[d].turnos += 1
      if (r.puesto !== null && !r.asistencia) map[d].asistencias += 1
      if (r.asistencia !== null) map[d].ausentismos += 1
    })
    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        label: d.date.split("-")[2],
        pctAsistencia: d.turnos > 0 ? Math.round((d.asistencias / d.turnos) * 100) : 0,
      }))
  }, [data])

  // Overtime daily trend
  const overtimeTrend = useMemo(() => {
    const map: Record<string, { date: string; hed: number; hedf: number; hen: number; hef: number; hn: number }> = {}
    data.forEach((r) => {
      const d = r.fecha
      if (!map[d]) map[d] = { date: d, hed: 0, hedf: 0, hen: 0, hef: 0, hn: 0 }
      map[d].hed += r.hed || 0
      map[d].hedf += r.hedf || 0
      map[d].hen += r.hen || 0
      map[d].hef += r.hef || 0
      map[d].hn += r.hn || 0
    })
    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        label: d.date.split("-")[2],
        hed: Number(d.hed.toFixed(1)),
        hedf: Number(d.hedf.toFixed(1)),
        hen: Number(d.hen.toFixed(1)),
        hef: Number(d.hef.toFixed(1)),
        hn: Number(d.hn.toFixed(1)),
      }))
  }, [data])

  // Absence type breakdown
  const absenceTypes = useMemo(() => {
    const map: Record<string, number> = {}
    data.forEach((r) => {
      if (r.asistencia) {
        const label = r.asistencia.length > 35 ? r.asistencia.substring(0, 35) + "..." : r.asistencia
        map[label] = (map[label] || 0) + 1
      }
    })
    return Object.entries(map)
      .map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.value - a.value)
  }, [data])

  // Top positions
  const topPositions = useMemo(() => {
    const map: Record<string, { turnos: number; asistencias: number }> = {}
    data.forEach((r) => {
      const puesto = r.puesto || "Sin asignar"
      if (!map[puesto]) map[puesto] = { turnos: 0, asistencias: 0 }
      map[puesto].turnos += 1
      if (r.puesto !== null && !r.asistencia) map[puesto].asistencias += 1
    })
    return Object.entries(map)
      .map(([name, val]) => ({ name, turnos: val.turnos, asistencias: val.asistencias, pct: val.turnos > 0 ? Math.round((val.asistencias / val.turnos) * 100) : 0 }))
      .sort((a, b) => b.turnos - a.turnos)
      .slice(0, 10)
  }, [data])

  // Overtime by position
  const overtimeByPuesto = useMemo(() => {
    const map: Record<string, { hed: number; hedf: number; hen: number; hef: number; hn: number }> = {}
    data.forEach((r) => {
      const puesto = r.puesto || "Sin asignar"
      if (!map[puesto]) map[puesto] = { hed: 0, hedf: 0, hen: 0, hef: 0, hn: 0 }
      map[puesto].hed += r.hed || 0
      map[puesto].hedf += r.hedf || 0
      map[puesto].hen += r.hen || 0
      map[puesto].hef += r.hef || 0
      map[puesto].hn += r.hn || 0
    })
    return Object.entries(map)
      .map(([name, val]) => ({
        name: name.length > 20 ? name.substring(0, 20) + "..." : name,
        ...val,
        total: Number((val.hed + val.hedf + val.hen + val.hef + val.hn).toFixed(1)),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Dashboard Historico</h2>
          <p className="text-sm text-muted-foreground">Resumen mensual con comparativo vs mes anterior</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-card min-w-[180px] justify-center">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</span>
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-2 ml-1 h-8">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* KPI Cards with month-over-month comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Turnos</p>
            <p className="text-2xl font-bold mt-1">{summary.total.toLocaleString()}</p>
            <div className="mt-1"><DeltaBadge current={summary.total} previous={prevSummary.total} /></div>
            <p className="text-[9px] text-muted-foreground mt-0.5">vs {prevMonthLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Asistencias</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{summary.asistencias.toLocaleString()}</p>
            <div className="mt-1"><DeltaBadge current={summary.asistencias} previous={prevSummary.asistencias} /></div>
            <p className="text-[9px] text-muted-foreground mt-0.5">vs {prevMonthLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ausentismos</p>
            <p className="text-2xl font-bold mt-1 text-rose-600">{summary.ausentismos.toLocaleString()}</p>
            <div className="mt-1"><DeltaBadge current={summary.ausentismos} previous={prevSummary.ausentismos} invert /></div>
            <p className="text-[9px] text-muted-foreground mt-0.5">vs {prevMonthLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">% Asistencia</p>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-2xl font-bold">{summary.pctAsistencia}%</p>
            </div>
            <div className="mt-1"><DeltaBadge current={summary.pctAsistencia} previous={prevSummary.pctAsistencia} suffix="%" /></div>
            <p className="text-[9px] text-muted-foreground mt-0.5">vs {prevMonthLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Personas</p>
            <p className="text-2xl font-bold mt-1">{summary.uniquePersons}</p>
            <div className="mt-1"><DeltaBadge current={summary.uniquePersons} previous={prevSummary.uniquePersons} /></div>
            <p className="text-[9px] text-muted-foreground mt-0.5">vs {prevMonthLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total HE</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{summary.totalHE.toFixed(1)}</p>
            <div className="mt-1"><DeltaBadge current={Math.round(summary.totalHE)} previous={Math.round(prevSummary.totalHE)} /></div>
            <p className="text-[9px] text-muted-foreground mt-0.5">vs {prevMonthLabel}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Row: Top Absentees + Top Overtime */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top absentees alert */}
        <Card className="border-rose-500/30 bg-rose-500/[0.03]">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <CardTitle className="text-sm text-rose-700 dark:text-rose-400">Top 5 Personas con Mas Faltas</CardTitle>
            </div>
            <CardDescription className="text-xs">Ranking de ausentismo del mes</CardDescription>
          </CardHeader>
          <CardContent>
            {topAbsentees.length > 0 ? (
              <div className="space-y-2">
                {topAbsentees.map((person, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-background border">
                    <div className="flex items-center gap-3">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-rose-500 text-white" : i === 1 ? "bg-rose-400 text-white" : i === 2 ? "bg-rose-300 text-white" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-tight">{person.nombre}</p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                          {person.motivos.slice(0, 2).join(", ")}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
                      {person.faltas} faltas
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-emerald-600 font-medium">Sin ausentismos este mes</div>
            )}
          </CardContent>
        </Card>

        {/* Top overtime earners */}
        <Card className="border-blue-500/30 bg-blue-500/[0.03]">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-sm text-blue-700 dark:text-blue-400">Top 5 Personas con Mas Horas Extra</CardTitle>
            </div>
            <CardDescription className="text-xs">Ranking de horas extra del mes</CardDescription>
          </CardHeader>
          <CardContent>
            {topOvertimePersons.length > 0 ? (
              <div className="space-y-2">
                {topOvertimePersons.map((person, i) => {
                  const maxHE = topOvertimePersons[0]?.totalHE || 1
                  const barWidth = Math.max(10, (person.totalHE / maxHE) * 100)
                  return (
                    <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-background border">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-blue-500 text-white" : i === 1 ? "bg-blue-400 text-white" : i === 2 ? "bg-blue-300 text-white" : "bg-muted text-muted-foreground"}`}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight truncate">{person.nombre}</p>
                          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${barWidth}%` }} />
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full ml-3 shrink-0">
                        {person.totalHE.toFixed(1)} hrs
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-muted-foreground">Sin horas extra este mes</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendencia Diaria de Asistencia</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailyTrend}>
                  <defs>
                    <linearGradient id="gradAsistH" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(160, 60%, 45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(160, 60%, 45%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradAusentH" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(350, 65%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(350, 65%, 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(v) => `Dia ${v}`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="asistencias" name="Asistencias" stroke="hsl(160, 60%, 45%)" fill="url(#gradAsistH)" strokeWidth={2} />
                  <Area type="monotone" dataKey="ausentismos" name="Ausentismos" stroke="hsl(350, 65%, 55%)" fill="url(#gradAusentH)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Sin datos para este mes</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">% Asistencia Diaria</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip labelFormatter={(v) => `Dia ${v}`} formatter={(val: number) => `${val}%`} />
                  <Bar dataKey="pctAsistencia" name="% Asistencia" fill="hsl(200, 70%, 50%)" radius={[4, 4, 0, 0]} barSize={14} opacity={0.5} />
                  <Line type="monotone" dataKey="pctAsistencia" name="Tendencia" stroke="hsl(200, 70%, 50%)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Sin datos</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Overtime Trend + Absence Types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendencia Horas Extra por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            {overtimeTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={overtimeTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(v) => `Dia ${v}`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="hed" name="HED" stroke="hsl(200, 70%, 50%)" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="hedf" name="HEDF" stroke="hsl(160, 60%, 45%)" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="hen" name="HEN" stroke="hsl(270, 55%, 55%)" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="hef" name="HEF" stroke="hsl(350, 65%, 55%)" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="hn" name="HN" stroke="hsl(45, 80%, 50%)" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Sin datos</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tipos de Ausentismo</CardTitle>
          </CardHeader>
          <CardContent>
            {absenceTypes.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={absenceTypes} cx="50%" cy="50%" innerRadius={45} outerRadius={90} paddingAngle={3} dataKey="value" label={({ value }) => value}>
                    {absenceTypes.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Sin ausentismos</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Positions + Overtime by Position */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Asistencia por Puesto</CardTitle>
          </CardHeader>
          <CardContent>
            {topPositions.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={topPositions} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="asistencias" name="Asistencias" fill="hsl(160, 60%, 45%)" radius={[0, 4, 4, 0]} barSize={14} />
                  <Bar dataKey="turnos" name="Turnos" fill="hsl(200, 70%, 50%)" radius={[0, 4, 4, 0]} barSize={14} opacity={0.4} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">Sin datos</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Horas Extra por Puesto</CardTitle>
          </CardHeader>
          <CardContent>
            {overtimeByPuesto.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={overtimeByPuesto} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="hed" name="HED" stackId="a" fill="hsl(200, 70%, 50%)" />
                  <Bar dataKey="hedf" name="HEDF" stackId="a" fill="hsl(160, 60%, 45%)" />
                  <Bar dataKey="hen" name="HEN" stackId="a" fill="hsl(270, 55%, 55%)" />
                  <Bar dataKey="hef" name="HEF" stackId="a" fill="hsl(350, 65%, 55%)" />
                  <Bar dataKey="hn" name="HN" stackId="a" fill="hsl(45, 80%, 50%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">Sin datos</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Overtime Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "HED", value: summary.totalHED, color: "text-blue-600" },
          { label: "HEDF", value: summary.totalHEDF, color: "text-emerald-600" },
          { label: "HEN", value: summary.totalHEN, color: "text-purple-600" },
          { label: "HEF", value: summary.totalHEF, color: "text-rose-600" },
          { label: "HN", value: summary.totalHN, color: "text-amber-600" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-[11px] font-medium text-muted-foreground uppercase">{item.label}</p>
              <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value.toFixed(1)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
