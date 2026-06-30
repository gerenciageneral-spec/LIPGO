"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Users, UserCheck, UserX, Clock, RefreshCw, CalendarDays, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/components/auth-provider"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadialBarChart,
  RadialBar,
  LineChart,
  Line,
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

interface MiniRecord {
  fecha: string
  puesto: string | null
  asistencia: string | null
}

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

const OVERTIME_LABELS: Record<string, string> = {
  hed: "HED",
  hedf: "HEDF",
  hen: "HEN",
  hef: "HEF",
  hn: "HN",
}

const OVERTIME_COLORS: Record<string, string> = {
  hed: "hsl(200, 70%, 50%)",
  hedf: "hsl(160, 60%, 45%)",
  hen: "hsl(270, 55%, 55%)",
  hef: "hsl(350, 65%, 55%)",
  hn: "hsl(45, 80%, 50%)",
}

function DeltaBadge({ current, previous, suffix = "", invert = false }: { current: number; previous: number; suffix?: string; invert?: boolean }) {
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

export function AttendanceDailyDashboard() {
  const { selectedEmpresaId } = useAuth()
  const [data, setData] = useState<DashboardRecord[]>([])
  const [prevData, setPrevData] = useState<DashboardRecord[]>([])
  const [last7Data, setLast7Data] = useState<MiniRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [todayDate, setTodayDate] = useState("")
  const [prevDate, setPrevDate] = useState("")
  const [selectedDate, setSelectedDate] = useState("")

  const getTodayColombia = () => {
    return new Date()
      .toLocaleString("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .split(",")[0]
  }

  const loadData = async (dateOverride?: string) => {
	if (!selectedEmpresaId) return
	setLoading(true)
	try {
	const dateParam = dateOverride !== undefined ? dateOverride : selectedDate || ""
	const url = `/api/attendance/dashboard?empresaId=${selectedEmpresaId}&mode=daily${dateParam ? `&date=${dateParam}` : ""}`
      const res = await fetch(url)
      const json = await res.json()
      setData(json.data || [])
      setPrevData(json.prevData || [])
      setLast7Data(json.last7Data || [])
      setTodayDate(json.date || "")
      setPrevDate(json.prevDate || "")
    } catch (e) {
      console.error("Error loading daily dashboard:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
	loadData()
	}, [selectedEmpresaId])

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate)
    loadData(newDate)
  }

  const handleGoToToday = () => {
    setSelectedDate("")
    loadData("")
  }

  const isToday = !selectedDate || selectedDate === getTodayColombia()

  // Current day stats
  const stats = useMemo(() => {
    const totalTurnos = data.length
    const asistencias = data.filter((r) => r.puesto !== null && !r.asistencia).length
    const ausentismos = data.filter((r) => r.asistencia !== null).length
    const sinReportar = data.filter((r) => r.puesto === null && !r.asistencia).length
    const porcentajeAsistencia = totalTurnos > 0 ? Math.round((asistencias / totalTurnos) * 100) : 0
    const totalHE = data.reduce((s, r) => s + (r.hed || 0) + (r.hedf || 0) + (r.hen || 0) + (r.hef || 0) + (r.hn || 0), 0)
    return { totalTurnos, asistencias, ausentismos, sinReportar, porcentajeAsistencia, totalHE }
  }, [data])

  // Previous day stats
  const prevStats = useMemo(() => {
    const totalTurnos = prevData.length
    const asistencias = prevData.filter((r) => r.puesto !== null && !r.asistencia).length
    const ausentismos = prevData.filter((r) => r.asistencia !== null).length
    const porcentajeAsistencia = totalTurnos > 0 ? Math.round((asistencias / totalTurnos) * 100) : 0
    const totalHE = prevData.reduce((s, r) => s + (r.hed || 0) + (r.hedf || 0) + (r.hen || 0) + (r.hef || 0) + (r.hn || 0), 0)
    return { totalTurnos, asistencias, ausentismos, porcentajeAsistencia, totalHE }
  }, [prevData])

  // Last 7 days mini-trend for sparkline
  const last7Trend = useMemo(() => {
    const map: Record<string, { date: string; turnos: number; asistencias: number }> = {}
    last7Data.forEach((r) => {
      if (!map[r.fecha]) map[r.fecha] = { date: r.fecha, turnos: 0, asistencias: 0 }
      map[r.fecha].turnos += 1
      if (r.puesto !== null && !r.asistencia) map[r.fecha].asistencias += 1
    })
    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        label: d.date.split("-")[2],
        pct: d.turnos > 0 ? Math.round((d.asistencias / d.turnos) * 100) : 0,
      }))
  }, [last7Data])

  // Top 3 most absent people (from last7 data grouped by person)
  const topAbsentees = useMemo(() => {
    // Use current day + last7 data combined for broader context
    const allAbsenceData = [...last7Data.filter(r => r.asistencia !== null)]
    const map: Record<string, { nombre: string; faltas: number; motivos: Set<string> }> = {}
    // Also include current day data for names
    const allData = [...data.filter(r => r.asistencia !== null)]
    const combinedNames: Record<string, string> = {}
    data.forEach(r => { combinedNames[r.identificacion] = r.nombre })

    allAbsenceData.forEach((r) => {
      // We don't have nombre in last7Data, so we'll also use full data
    })

    // Use the full current month approach: count absences from the full dataset
    const absentMap: Record<string, { nombre: string; faltas: number; motivos: string[] }> = {}
    allData.forEach((r) => {
      const key = r.identificacion || r.nombre || "Desconocido"
      const rec = data.find(d => d.identificacion === key || d.nombre === key)
      const nombre = rec?.nombre || key
      if (!absentMap[key]) absentMap[key] = { nombre, faltas: 0, motivos: [] }
      absentMap[key].faltas += 1
      if (r.asistencia && !absentMap[key].motivos.includes(r.asistencia)) {
        absentMap[key].motivos.push(r.asistencia)
      }
    })

    return Object.values(absentMap)
      .sort((a, b) => b.faltas - a.faltas)
      .slice(0, 5)
  }, [data, last7Data])

  // Overtime by position
  const overtimeByPosition = useMemo(() => {
    const map: Record<string, { puesto: string; hed: number; hedf: number; hen: number; hef: number; hn: number; count: number }> = {}
    data.forEach((r) => {
      const puesto = r.puesto || "Sin asignar"
      if (!map[puesto]) map[puesto] = { puesto, hed: 0, hedf: 0, hen: 0, hef: 0, hn: 0, count: 0 }
      map[puesto].hed += r.hed || 0
      map[puesto].hedf += r.hedf || 0
      map[puesto].hen += r.hen || 0
      map[puesto].hef += r.hef || 0
      map[puesto].hn += r.hn || 0
      map[puesto].count += 1
    })
    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [data])

  // Distribution pie
  const distributionPie = useMemo(() => {
    const result = []
    if (stats.asistencias > 0) result.push({ name: "Asistencia", value: stats.asistencias, fill: "hsl(160, 60%, 45%)" })
    if (stats.ausentismos > 0) result.push({ name: "Ausentismo", value: stats.ausentismos, fill: "hsl(350, 65%, 55%)" })
    if (stats.sinReportar > 0) result.push({ name: "Sin Reportar", value: stats.sinReportar, fill: "hsl(45, 80%, 50%)" })
    return result
  }, [stats])

  // Overtime totals
  const overtimeTotals = useMemo(() => {
    const totals = { hed: 0, hedf: 0, hen: 0, hef: 0, hn: 0 }
    data.forEach((r) => {
      totals.hed += r.hed || 0
      totals.hedf += r.hedf || 0
      totals.hen += r.hen || 0
      totals.hef += r.hef || 0
      totals.hn += r.hn || 0
    })
    return Object.entries(totals).map(([key, value]) => ({
      name: OVERTIME_LABELS[key],
      value: Number(value.toFixed(1)),
      fill: OVERTIME_COLORS[key],
    }))
  }, [data])

  // People by puesto
  const peopleByPuesto = useMemo(() => {
    const map: Record<string, number> = {}
    data.forEach((r) => {
      const puesto = r.puesto || "Sin asignar"
      map[puesto] = (map[puesto] || 0) + 1
    })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [data])

  // Absence breakdown
  const absenceBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    data.forEach((r) => {
      if (r.asistencia) {
        const shortLabel = r.asistencia.length > 30 ? r.asistencia.substring(0, 30) + "..." : r.asistencia
        map[shortLabel] = (map[shortLabel] || 0) + 1
      }
    })
    return Object.entries(map)
      .map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.value - a.value)
  }, [data])

  // Gauge data
  const gaugeData = useMemo(() => [
    { name: "Asistencia", value: stats.porcentajeAsistencia, fill: stats.porcentajeAsistencia >= 80 ? "hsl(160, 60%, 45%)" : stats.porcentajeAsistencia >= 50 ? "hsl(45, 80%, 50%)" : "hsl(350, 65%, 55%)" },
  ], [stats.porcentajeAsistencia])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ""
    const [y, m, d] = dateStr.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
  }

  const formatShortDate = (dateStr: string) => {
    if (!dateStr) return ""
    const [y, m, d] = dateStr.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short" })
  }

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
          <h2 className="text-xl font-bold text-foreground">Dashboard {isToday ? "del Dia" : ""}</h2>
          <p className="text-sm text-muted-foreground capitalize">{formatDate(todayDate)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="h-8 w-40 text-xs"
              max={getTodayColombia()}
            />
          </div>
          {!isToday && (
            <Button variant="outline" size="sm" onClick={handleGoToToday} className="gap-1 text-xs h-8">
              Hoy
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => loadData()} className="gap-1 h-8">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* KPI Cards with comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Turnos Programados</p>
                <p className="text-3xl font-bold mt-1">{stats.totalTurnos}</p>
                <div className="mt-1.5">
                  <DeltaBadge current={stats.totalTurnos} previous={prevStats.totalTurnos} />
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">vs {formatShortDate(prevDate)}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Asistencias</p>
                <p className="text-3xl font-bold mt-1">{stats.asistencias}</p>
                <div className="mt-1.5">
                  <DeltaBadge current={stats.asistencias} previous={prevStats.asistencias} />
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">vs {formatShortDate(prevDate)}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                <UserCheck className="h-4 w-4 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ausentismos</p>
                <p className="text-3xl font-bold mt-1">{stats.ausentismos}</p>
                <div className="mt-1.5">
                  <DeltaBadge current={stats.ausentismos} previous={prevStats.ausentismos} invert />
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">vs {formatShortDate(prevDate)}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                <UserX className="h-4 w-4 text-rose-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">% Asistencia</p>
                <p className="text-3xl font-bold mt-1">{stats.porcentajeAsistencia}%</p>
                <div className="mt-1.5">
                  <DeltaBadge current={stats.porcentajeAsistencia} previous={prevStats.porcentajeAsistencia} suffix="%" />
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">vs {formatShortDate(prevDate)}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-violet-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Horas Extra</p>
                <p className="text-3xl font-bold mt-1">{stats.totalHE.toFixed(1)}</p>
                <div className="mt-1.5">
                  <DeltaBadge current={Math.round(stats.totalHE * 10) / 10} previous={Math.round(prevStats.totalHE * 10) / 10} />
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">vs {formatShortDate(prevDate)}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert: Top absentees + 7-day Sparkline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top absentees alert */}
        <Card className="border-rose-500/30 bg-rose-500/[0.03]">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <CardTitle className="text-sm text-rose-700 dark:text-rose-400">Alerta de Ausentismo del Dia</CardTitle>
            </div>
            <CardDescription className="text-xs">Personas con faltas registradas hoy</CardDescription>
          </CardHeader>
          <CardContent>
            {topAbsentees.length > 0 ? (
              <div className="space-y-2.5">
                {topAbsentees.map((person, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-background border">
                    <div className="flex items-center gap-3">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-rose-500 text-white" : i === 1 ? "bg-rose-400 text-white" : i === 2 ? "bg-rose-300 text-white" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-tight">{person.nombre}</p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                          {person.motivos.join(", ")}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
                      {person.faltas} {person.faltas === 1 ? "falta" : "faltas"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-emerald-600 font-medium">
                Sin ausentismos registrados hoy
              </div>
            )}
          </CardContent>
        </Card>

        {/* 7-day trend sparkline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendencia de Asistencia - Ultimos 7 Dias</CardTitle>
            <CardDescription className="text-xs">Porcentaje de asistencia diaria</CardDescription>
          </CardHeader>
          <CardContent>
            {last7Trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={last7Trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    labelFormatter={(v) => `Dia ${v}`}
                    formatter={(val: number) => [`${val}%`, "% Asistencia"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="pct"
                    name="% Asistencia"
                    stroke="hsl(200, 70%, 50%)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "hsl(200, 70%, 50%)" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                Sin datos suficientes
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row: Attendance Gauge + Distribution Pie + Overtime Totals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Radial Gauge */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Porcentaje de Asistencia</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="relative h-48 w-48">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="70%"
                  outerRadius="100%"
                  barSize={16}
                  data={gaugeData}
                  startAngle={180}
                  endAngle={0}
                >
                  <RadialBar background dataKey="value" cornerRadius={10} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold">{stats.porcentajeAsistencia}%</span>
                <span className="text-xs text-muted-foreground">del total</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribucion del Dia</CardTitle>
          </CardHeader>
          <CardContent>
            {distributionPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={distributionPie}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {distributionPie.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Sin datos para hoy
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overtime Totals */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Horas Extra del Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={overtimeTotals} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={45} />
                <Tooltip formatter={(val: number) => val.toFixed(1)} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                  {overtimeTotals.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row: People by position + Absence breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Personal por Puesto</CardTitle>
          </CardHeader>
          <CardContent>
            {peopleByPuesto.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={peopleByPuesto} margin={{ bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(200, 70%, 50%)" radius={[6, 6, 0, 0]} barSize={28} name="Personas" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">Sin datos</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Detalle de Ausentismos</CardTitle>
          </CardHeader>
          <CardContent>
            {absenceBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={absenceBreakdown}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ value }) => `${value}`}
                  >
                    {absenceBreakdown.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">Sin ausentismos registrados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Overtime by Position Detail Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Resumen de Horas Extra por Puesto</CardTitle>
        </CardHeader>
        <CardContent>
          {overtimeByPosition.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Puesto</th>
                    <th className="text-center py-2 px-3 font-medium text-muted-foreground">Personas</th>
                    <th className="text-center py-2 px-3 font-medium text-blue-500">HED</th>
                    <th className="text-center py-2 px-3 font-medium text-emerald-500">HEDF</th>
                    <th className="text-center py-2 px-3 font-medium text-purple-500">HEN</th>
                    <th className="text-center py-2 px-3 font-medium text-rose-500">HEF</th>
                    <th className="text-center py-2 px-3 font-medium text-amber-500">HN</th>
                    <th className="text-center py-2 px-3 font-medium text-foreground">Total HE</th>
                  </tr>
                </thead>
                <tbody>
                  {overtimeByPosition.map((row, i) => {
                    const totalHE = row.hed + row.hedf + row.hen + row.hef + row.hn
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 font-medium">{row.puesto}</td>
                        <td className="py-2 px-3 text-center">{row.count}</td>
                        <td className="py-2 px-3 text-center">{row.hed > 0 ? row.hed.toFixed(1) : "-"}</td>
                        <td className="py-2 px-3 text-center">{row.hedf > 0 ? row.hedf.toFixed(1) : "-"}</td>
                        <td className="py-2 px-3 text-center">{row.hen > 0 ? row.hen.toFixed(1) : "-"}</td>
                        <td className="py-2 px-3 text-center">{row.hef > 0 ? row.hef.toFixed(1) : "-"}</td>
                        <td className="py-2 px-3 text-center">{row.hn > 0 ? row.hn.toFixed(1) : "-"}</td>
                        <td className="py-2 px-3 text-center font-bold">{totalHE > 0 ? totalHE.toFixed(1) : "-"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">Sin datos disponibles</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
