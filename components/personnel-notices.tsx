"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { CalendarIcon, CheckCircle2, AlertCircle } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

const NOTICE_OPTIONS = [
  "38- Licencia no remunerada- Deducción",
  "13- Incapacidad por enfermedad general al 100%",
  "14- Incapacidad por enfermedad general al 50",
  "15- Incapacidad por enfermedad general al 66%- ingreso",
  "16- Incapacidad por enfermedad profesional",
  "20- Licencia maternidad/paternidad",
  "21- Licencia por luto",
  "22- Licencia remunerada",
  "31- Vacaciones disfrutadas",
  "Retiro",
  "Descanso",
  "Descanso compensatorio domingo anterior",
]

interface PersonnelRecord {
  id: number
  nombre: string
  identificacion: string
  fecha: string
  asistencia: string | null
}

export default function PersonnelNotices() {
  const { selectedEmpresaId } = useAuth()
  const [records, setRecords] = useState<PersonnelRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [dateRange, setDateRange] = useState<{ startDate?: Date; endDate?: Date }>({})
  const [useDateRange, setUseDateRange] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  // IDs de registros que ya fueron guardados en este ciclo. Sirven
  // como fuente de verdad para mostrar la marca de "Novedad
  // registrada" en la tabla — separada de `record.asistencia` (que
  // ya puede tener un valor "tentativo" antes de guardar).
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (selectedEmpresaId) {
      loadRecords()
    }
  }, [selectedEmpresaId, selectedDate])

  const loadRecords = async () => {
    try {
      setLoading(true)
      const dateParam = selectedDate ? selectedDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
      const response = await fetch(`/api/personnel-notices?empresaId=${selectedEmpresaId}&date=${dateParam}`)
      const data = await response.json()

      if (response.ok) {
        setRecords(data.data || [])
        // Cada vez que recargamos limpiamos el set de IDs guardados:
        // la nueva consulta ya excluye filas que tienen `asistencia`
        // o `puesto` no nulos, asi que cualquier fila visible aqui
        // todavia esta "pendiente".
        setSavedIds(new Set())
      } else {
        setMessage({ type: "error", text: data.error || "Error al cargar registros" })
      }
    } catch (error) {
      console.error("Error loading records:", error)
      setMessage({ type: "error", text: "Error al cargar registros" })
    } finally {
      setLoading(false)
    }
  }

  const handleNoticeChange = (recordId: number, notice: string) => {
    setRecords((prev) => prev.map((record) => (record.id === recordId ? { ...record, asistencia: notice } : record)))
  }

  const handleSaveAll = async () => {
    try {
      setSaving(true)
      setMessage(null)

      // Filter records that have a notice selected
      const recordsToSave = records.filter((record) => record.asistencia)

      if (recordsToSave.length === 0) {
        setMessage({ type: "error", text: "No hay novedades para guardar" })
        return
      }

      // Validate date range if enabled
      if (useDateRange) {
        if (!dateRange.startDate || !dateRange.endDate) {
          setMessage({ type: "error", text: "Debe seleccionar un rango de fechas completo" })
          return
        }
        if (dateRange.endDate < dateRange.startDate) {
          setMessage({ type: "error", text: "La fecha final debe ser mayor a la fecha inicial" })
          return
        }
      }

      const response = await fetch("/api/personnel-notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: recordsToSave,
          dateRange: useDateRange
            ? {
                startDate: dateRange.startDate?.toISOString().split("T")[0],
                endDate: dateRange.endDate?.toISOString().split("T")[0],
              }
            : null,
          empresaId: selectedEmpresaId,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: "success", text: data.message || "Novedades guardadas exitosamente" })
        // Marcamos los registros recien guardados para que la tabla
        // los muestre con badge verde "Novedad registrada" y el
        // select deshabilitado. Conservamos las filas en pantalla
        // (no recargamos automaticamente) para que el usuario pueda
        // verificar visualmente que su accion quedo aplicada. Si
        // mueve la fecha o presiona alguna accion que dispare
        // `loadRecords`, esos IDs ya no apareceran en la respuesta
        // del GET (porque tienen `asistencia` no nula) y el set se
        // vacia.
        setSavedIds((prev) => {
          const next = new Set(prev)
          recordsToSave.forEach((r) => next.add(r.id))
          return next
        })
        // Limpiamos el rango de fechas si se uso, pero no recargamos.
        if (useDateRange) {
          setDateRange({})
          setUseDateRange(false)
        }
      } else {
        setMessage({ type: "error", text: data.error || "Error al guardar novedades" })
      }
    } catch (error) {
      console.error("Error saving notices:", error)
      setMessage({ type: "error", text: "Error al guardar novedades" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Cargando registros...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Novedades de Personal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <Alert variant={message.type === "error" ? "destructive" : "default"}>
              {message.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <label htmlFor="selectDate" className="text-sm font-medium">
                Seleccionar fecha:
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    {selectedDate ? format(selectedDate, "PP", { locale: es }) : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => setSelectedDate(date)}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2 border-l pl-4">
              <input
                type="checkbox"
                id="useDateRange"
                checked={useDateRange}
                onChange={(e) => setUseDateRange(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="useDateRange" className="text-sm font-medium">
                Aplicar rango de fechas para futuras novedades
              </label>
            </div>

            {useDateRange && (
              <div className="flex items-center gap-2 w-full">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.startDate ? format(dateRange.startDate, "PP", { locale: es }) : "Fecha inicio"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateRange.startDate}
                      onSelect={(date) => setDateRange((prev) => ({ ...prev, startDate: date }))}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>

                <span className="text-sm">hasta</span>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.endDate ? format(dateRange.endDate, "PP", { locale: es }) : "Fecha fin"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateRange.endDate}
                      onSelect={(date) => setDateRange((prev) => ({ ...prev, endDate: date }))}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {records.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay registros de personal sin asignar para la fecha seleccionada
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Identificación</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Novedad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => {
                    // Una fila se considera "registrada" cuando su id
                    // esta en `savedIds`. Marcamos toda la fila con
                    // un fondo verde tenue, mostramos un badge a la
                    // izquierda del nombre y deshabilitamos el select
                    // para evitar ediciones accidentales sobre algo
                    // que ya quedo persistido.
                    const isSaved = savedIds.has(record.id)
                    return (
                      <TableRow
                        key={record.id}
                        className={isSaved ? "bg-green-50 hover:bg-green-50" : undefined}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isSaved && (
                              <Badge className="gap-1 bg-green-600 text-white hover:bg-green-600">
                                <CheckCircle2 className="h-3 w-3" />
                                Registrada
                              </Badge>
                            )}
                            <span>{record.nombre}</span>
                          </div>
                        </TableCell>
                        <TableCell>{record.identificacion}</TableCell>
                        <TableCell>{record.fecha}</TableCell>
                        <TableCell>
                          <Select
                            value={record.asistencia || ""}
                            onValueChange={(value) => handleNoticeChange(record.id, value)}
                            disabled={isSaved}
                          >
                            <SelectTrigger className="w-[300px]">
                              <SelectValue placeholder="Seleccionar novedad" />
                            </SelectTrigger>
                            <SelectContent>
                              {NOTICE_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              <div className="flex justify-end gap-2">
                {/* Si el usuario quiere "limpiar" el listado y volver
                    a traer los pendientes (sin las filas ya marcadas
                    como registradas) puede recargar manualmente. */}
                {savedIds.size > 0 && (
                  <Button variant="outline" onClick={loadRecords} disabled={saving}>
                    Actualizar listado
                  </Button>
                )}
                <Button
                  onClick={handleSaveAll}
                  disabled={
                    saving ||
                    // Solo permitimos guardar si hay al menos una fila
                    // pendiente con novedad seleccionada (no contamos
                    // las que ya estan marcadas como registradas).
                    records.every((r) => !r.asistencia || savedIds.has(r.id))
                  }
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
