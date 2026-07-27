"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Search, Pencil, LayoutDashboard, CalendarDays, TableProperties, MapPin } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { createClient } from "@/lib/supabase-client"
import { fetchAllRows } from "@/lib/fetch-all-rows"
import { procesarNovedadRetiro } from "@/lib/retiro-actions"
import { sincronizarBorradorAusentismo } from "@/lib/ausentismos-actions"
import { AttendanceDailyDashboard } from "@/components/attendance-daily-dashboard"
import { AttendanceHistoricalDashboard } from "@/components/attendance-historical-dashboard"
import VisorUbicaciones from "@/components/visor-ubicaciones"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface AttendanceRecord {
  id: number
  fecha: string
  nombre: string
  identificacion: string
  puesto: string
  asistencia: string | null
}

const ABSENCE_TYPES = [
  { code: "13- Incapacidad por enfermedad general al 100%", label: "Incapacidad por enfermedad general al 100%" },
  { code: "14- Incapacidad por enfermedad general al 50", label: "Incapacidad por enfermedad general al 50%" },
  // Codigo 15: misma familia de incapacidad por enfermedad general
  // (66% - ingreso). Se mantiene el `code` exacto que ya usa
  // `personnel-notices.tsx` para que el valor escrito en BD coincida
  // bit a bit y los filtros del resto del sistema lo reconozcan.
  { code: "15- Incapacidad por enfermedad general al 66%- ingreso", label: "Incapacidad por enfermedad general al 66% - Ingreso" },
  { code: "31- Vacaciones disfrutadas", label: "Vacaciones disfrutadas" },
  { code: "38- Licencia no remunerada- Deducción", label: "Licencia no remunerada - Deducción" },
  { code: "Descanso", label: "Descanso" },
]

const NOTICE_OPTIONS = [
  "38- Licencia no remunerada- Deducción",
  "13- Incapacidad por enfermedad general al 100%",
  "14- Incapacidad por enfermedad general al 50",
  // Codigo 15: misma familia de incapacidades por enfermedad general
  // (66% - ingreso). Se mantiene la cadena exacta usada en
  // personnel-notices.tsx para que el valor escrito en BD coincida bit
  // a bit con los demas modulos (filtros de FNJ en nomina, dashboards,
  // exportes, etc.).
  "15- Incapacidad por enfermedad general al 66%- ingreso",
  "16- Incapacidad por enfermedad profesional",
  "20- Licencia maternidad/paternidad",
  "21- Licencia por luto",
  "22- Licencia remunerada",
  "31- Vacaciones disfrutadas",
  "Retiro",
  "Descanso",
  // Compensatorio del domingo anterior. Se replica con la MISMA cadena
  // exacta que usa `personnel-notices.tsx` para que al editar una
  // novedad desde el visor de asistencia el valor en BD quede
  // identico al que registraria el modulo de Novedades de Personal,
  // y los filtros aguas abajo (nomina, dashboards, exportes) la
  // reconozcan sin tratamiento adicional.
  "Descanso compensatorio domingo anterior",
]

export function AttendanceViewer() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([])
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null)
  const [editingNotice, setEditingNotice] = useState<string | null>(null)
  const [editingSaving, setEditingSaving] = useState(false)
  const [activeView, setActiveView] = useState<"table" | "daily" | "historical" | "tracking">("table")
  
  // Filters
  const [filterStartDate, setFilterStartDate] = useState("")
  const [filterEndDate, setFilterEndDate] = useState("")
  const [filterName, setFilterName] = useState("")

  // Statistics
  const [totalTurns, setTotalTurns] = useState(0)
  const [attendanceTurns, setAttendanceTurns] = useState(0)
  const [absences, setAbsences] = useState(0)
  const [absenceDetails, setAbsenceDetails] = useState<{ code: string; label: string; count: number }[]>([])

  useEffect(() => {
    loadData()
  }, [selectedEmpresaId])

  const loadData = async () => {
    if (!selectedEmpresaId) return
    
    setLoading(true)
    console.log("[v0] Loading attendance records for empresa_id:", selectedEmpresaId)
    
    try {
      const supabase = await createClient()
      // Paginado: registroasistencia supera 1000 filas por empresa en ~1 mes; sin
      // paginar, la tabla, las estadísticas y el filtro por rango se calculaban solo
      // sobre los ~1000 días más recientes. Orden estable (fecha desc, id desc).
      let data: any[]
      try {
        data = await fetchAllRows((from, to) =>
          supabase
            .from("registroasistencia")
            .select("id, fecha, nombre, identificacion, puesto, asistencia")
            .eq("idempresa", selectedEmpresaId)
            .order("fecha", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        )
      } catch (err: any) {
        console.error("[v0] Error loading attendance records:", err?.message || err)
        return
      }

      console.log("[v0] Attendance records loaded:", data.length)
      setRecords(data || [])
      applyFilters(data || [])
    } catch (error) {
      console.error("[v0] Error loading attendance:", error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = (dataToFilter: AttendanceRecord[]) => {
    let filtered = dataToFilter

    // Filter by date range
    if (filterStartDate) {
      const startDate = new Date(filterStartDate)
      filtered = filtered.filter((record) => new Date(record.fecha) >= startDate)
    }

    if (filterEndDate) {
      const endDate = new Date(filterEndDate)
      endDate.setDate(endDate.getDate() + 1)
      filtered = filtered.filter((record) => new Date(record.fecha) < endDate)
    }

    // Filter by name
    if (filterName) {
      filtered = filtered.filter((record) =>
        record.nombre.toLowerCase().includes(filterName.toLowerCase())
      )
    }

    setFilteredRecords(filtered)

    // Calculate statistics
    calculateStatistics(filtered)
  }

  const calculateStatistics = (dataToAnalyze: AttendanceRecord[]) => {
    const total = dataToAnalyze.length
    const withPosition = dataToAnalyze.filter((r) => r.puesto !== null).length
    const withAbsence = dataToAnalyze.filter((r) => r.asistencia !== null).length
    const unreported = dataToAnalyze.filter((r) => r.puesto === null && r.asistencia === null).length

    setTotalTurns(total)
    setAttendanceTurns(withPosition)
    setAbsences(withAbsence)

    // Calculate absence details
    const absenceCount: Record<string, number> = {}
    ABSENCE_TYPES.forEach((type) => {
      absenceCount[type.code] = dataToAnalyze.filter((r) => r.asistencia === type.code).length
    })

    const details = [
      ...ABSENCE_TYPES.map((type) => ({
        code: type.code,
        label: type.label,
        count: absenceCount[type.code] || 0,
      })),
      {
        code: "unreported",
        label: "Novedad No Reportada",
        count: unreported,
      },
    ]

    setAbsenceDetails(details)
  }

  useEffect(() => {
    applyFilters(records)
  }, [filterStartDate, filterEndDate, filterName])

  const handleEditNotice = (record: AttendanceRecord) => {
    setEditingRecord(record)
    setEditingNotice(record.asistencia || "")
    setEditDialogOpen(true)
  }

  const handleSaveNotice = async () => {
    if (!editingRecord || editingNotice === null) return

    setEditingSaving(true)
    try {
      const supabase = await createClient()
      const { error } = await supabase
        .from("registroasistencia")
        .update({ asistencia: editingNotice || null })
        .eq("id", editingRecord.id)

      if (error) {
        console.error("[v0] Error updating notice:", error)
        toast({
          title: "Error",
          description: "No se pudo actualizar la novedad",
          variant: "destructive",
        })
        return
      }

      // Update local records
      const updatedRecords = records.map((r) =>
        r.id === editingRecord.id ? { ...r, asistencia: editingNotice } : r
      )
      setRecords(updatedRecords)
      applyFilters(updatedRecords)

      // Efecto automático: si la novedad es "Retiro", dar de baja al trabajador
      // (Inactivo + fecha de retiro + fuera del plano). No bloquea el guardado.
      let bajaAplicada = false
      if (String(editingNotice || "").toLowerCase().includes("retiro")) {
        const r = await procesarNovedadRetiro({
          identificacion: editingRecord.identificacion,
          fecha: editingRecord.fecha,
          asistencia: editingNotice,
        })
        bajaAplicada = !!r.aplicado
      }

      // Puente automático: reconcilia el borrador de ausentismo de esta persona
      // (incapacidad EG/AT o licencia → crea/actualiza borrador; si la novedad se
      // cambió a algo que no es ausentismo, limpia el borrador huérfano). No bloquea.
      if (selectedEmpresaId && editingRecord.identificacion && editingRecord.fecha) {
        try {
          await sincronizarBorradorAusentismo(selectedEmpresaId, editingRecord.identificacion, editingRecord.fecha)
        } catch (e) {
          console.error("[v0] sincronizarBorradorAusentismo:", e)
        }
      }

      toast({
        title: "Éxito",
        description: bajaAplicada
          ? "Retiro registrado: trabajador dado de baja (Inactivo) y retirado del plano."
          : "Novedad actualizada correctamente",
      })

      setEditDialogOpen(false)
      setEditingRecord(null)
      setEditingNotice(null)
    } catch (error) {
      console.error("[v0] Error saving notice:", error)
      toast({
        title: "Error",
        description: "Ocurrió un error al guardar",
        variant: "destructive",
      })
    } finally {
      setEditingSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* View Tabs */}
      <div className="flex items-center gap-2 border-b pb-3">
        <Button
          variant={activeView === "table" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveView("table")}
          className="gap-2"
        >
          <TableProperties className="h-4 w-4" />
          Registros
        </Button>
        <Button
          variant={activeView === "daily" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveView("daily")}
          className="gap-2"
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard Diario
        </Button>
        <Button
          variant={activeView === "historical" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveView("historical")}
          className="gap-2"
        >
          <CalendarDays className="h-4 w-4" />
          Dashboard Historico
        </Button>
        <Button
          variant={activeView === "tracking" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveView("tracking")}
          className="gap-2"
        >
          <MapPin className="h-4 w-4" />
          Seguimiento a Conexiones
        </Button>
      </div>

      {/* Dashboard Views */}
      {activeView === "daily" && <AttendanceDailyDashboard />}
      {activeView === "historical" && <AttendanceHistoricalDashboard />}
      {activeView === "tracking" && <VisorUbicaciones />}

      {/* Table View */}
      {activeView === "table" && <>
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Turnos Totales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTurns}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Turnos Asistencia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{attendanceTurns}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Ausentismos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{absences}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Detalle de Ausentismo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs">
              {absenceDetails.map((detail) => (
                <div key={detail.code} className="flex justify-between">
                  <span>{detail.label}:</span>
                  <span className="font-semibold">{detail.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Buscar registros de asistencia</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Fecha Inicio</label>
              <Input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Fecha Fin</label>
              <Input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Nombre</label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar persona..."
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>Registros de Asistencia</CardTitle>
          <CardDescription>Total: {filteredRecords.length} registros</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay registros disponibles</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Identificación</TableHead>
                    <TableHead>Puesto</TableHead>
                    <TableHead>Novedad</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        {(() => {
                          const [year, month, day] = record.fecha.split("-").map(Number)
                          const date = new Date(year, month - 1, day)
                          return date.toLocaleDateString("es-CO")
                        })()}
                      </TableCell>
                      <TableCell>{record.nombre}</TableCell>
                      <TableCell>{record.identificacion}</TableCell>
                      <TableCell>{record.puesto || "-"}</TableCell>
                      <TableCell>
                        {record.puesto === null && record.asistencia === null ? (
                          <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                            NOVEDAD NO REPORTADA
                          </span>
                        ) : record.asistencia ? (
                          <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
                            {record.asistencia}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditNotice(record)}
                          className="gap-1"
                        >
                          <Pencil className="h-3 w-3" />
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      </>}

      {/* Edit Notice Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Novedad</DialogTitle>
            <DialogDescription>
              {editingRecord && `${editingRecord.nombre} - ${editingRecord.fecha}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Novedad</label>
              <Select value={editingNotice || ""} onValueChange={setEditingNotice}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar novedad..." />
                </SelectTrigger>
                <SelectContent>
                  {NOTICE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={editingSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveNotice}
              disabled={editingSaving}
              className="gap-1"
            >
              {editingSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingSaving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
