"use client"

// Submódulo "Asistencia Administrativa" (Relaciones Laborales y Ausentismo):
// permite registrar/corregir asistencia y novedades para CUALQUIER fecha
// (pasada o futura), para personal operativo (tapar huecos de captura) y
// administrativo (headcount.admin=true, sin flujo de turnos propio). Ver
// lib/asistencia-administrativa-actions.ts para el porqué de fondo.

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CalendarIcon, Search, Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  getPersonasAsistenciaAdministrativa,
  getHistorialAsistenciaPersona,
  upsertAsistenciaDia,
  type PersonaAsistenciaAdmin,
  type FilaHistorialAsistencia,
} from "@/lib/asistencia-administrativa-actions"
import { NOVEDADES_DIA, OPERACIONES_OPTIONS, ESPECIALIDADES_OPTIONS } from "@/lib/asistencia-catalogos"

const toISO = (d: Date) => d.toISOString().slice(0, 10)

export default function AsistenciaAdministrativa() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()

  const [personas, setPersonas] = useState<PersonaAsistenciaAdmin[]>([])
  const [loadingPersonas, setLoadingPersonas] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  // Por defecto solo Administrativos: es el caso de uso más frecuente de este
  // módulo (el personal operativo normal ya se ve en Tabla Asistencia). "Todos"
  // sigue disponible para el backfill de operativos sin captura.
  const [filtroTipo, setFiltroTipo] = useState<"administrativos" | "operativos" | "todos">("administrativos")
  const [seleccionada, setSeleccionada] = useState<PersonaAsistenciaAdmin | null>(null)

  const [historial, setHistorial] = useState<FilaHistorialAsistencia[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  const [tipo, setTipo] = useState<"TRABAJADO" | "NOVEDAD">("TRABAJADO")
  const [puesto, setPuesto] = useState<string>("")
  const [novedad, setNovedad] = useState<string>("")
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(new Date())
  const [fechaFin, setFechaFin] = useState<Date | undefined>(undefined)
  const [usarRango, setUsarRango] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!selectedEmpresaId) return
    setLoadingPersonas(true)
    getPersonasAsistenciaAdministrativa(selectedEmpresaId)
      .then((r) => {
        if (r.success) setPersonas(r.data)
        else toast({ title: "Error", description: r.message, variant: "destructive" })
      })
      .finally(() => setLoadingPersonas(false))
  }, [selectedEmpresaId, toast])

  const cargarHistorial = (identificacion: string) => {
    if (!selectedEmpresaId) return
    setLoadingHistorial(true)
    getHistorialAsistenciaPersona(selectedEmpresaId, identificacion)
      .then((r) => {
        if (r.success) setHistorial(r.data)
        else toast({ title: "Error", description: r.message, variant: "destructive" })
      })
      .finally(() => setLoadingHistorial(false))
  }

  const seleccionarPersona = (p: PersonaAsistenciaAdmin) => {
    setSeleccionada(p)
    setBusqueda("")
    setPuesto("")
    setNovedad("")
    setTipo("TRABAJADO")
    cargarHistorial(p.identificacion)
  }

  const esRetiro = tipo === "NOVEDAD" && novedad.toLowerCase().includes("retiro")

  const resultadosBusqueda = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return personas
      .filter((p) => filtroTipo === "todos" || (filtroTipo === "administrativos" ? p.admin : !p.admin))
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.identificacion.includes(q))
      .slice(0, 50)
  }, [busqueda, personas, filtroTipo])

  const handleGuardar = async () => {
    if (!seleccionada || !selectedEmpresaId || !fechaInicio) return
    if (tipo === "NOVEDAD" && !novedad) {
      toast({ title: "Falta la novedad", description: "Selecciona qué novedad aplicar.", variant: "destructive" })
      return
    }
    if (tipo === "TRABAJADO" && !seleccionada.admin && !puesto) {
      toast({ title: "Falta el puesto", description: "Selecciona qué puesto trabajó ese día.", variant: "destructive" })
      return
    }
    setGuardando(true)
    const r = await upsertAsistenciaDia({
      empresaId: selectedEmpresaId,
      identificacion: seleccionada.identificacion,
      nombre: seleccionada.nombre,
      fechaInicio: toISO(fechaInicio),
      fechaFin: usarRango && fechaFin && !esRetiro ? toISO(fechaFin) : undefined,
      tipo,
      novedad: tipo === "NOVEDAD" ? (novedad as any) : undefined,
      puesto: tipo === "TRABAJADO" ? puesto : undefined,
      esAdministrativo: seleccionada.admin,
    })
    setGuardando(false)
    if (!r.success) {
      toast({ title: "Error", description: r.message, variant: "destructive" })
      return
    }
    toast({ title: "Guardado", description: `${r.diasAfectados ?? 0} día(s) actualizado(s).` })
    if (r.diasOmitidos?.length) {
      toast({
        title: "Días omitidos (multi-turno)",
        description: `Corrígelos aparte desde Tabla Asistencia/Visor: ${r.diasOmitidos.join(", ")}`,
        variant: "destructive",
      })
    }
    cargarHistorial(seleccionada.identificacion)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Asistencia Administrativa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Registra o corrige asistencia y novedades para cualquier fecha (pasada o futura) — para personal
              operativo sin captura, o para personal administrativo, que no pasa por Tabla Asistencia.
            </AlertDescription>
          </Alert>

          {/* Selector de persona */}
          <div className="space-y-2">
            <Label>Persona</Label>
            {seleccionada ? (
              <div className="flex items-center gap-2 rounded-md border border-border p-2">
                <span className="font-medium">{seleccionada.nombre}</span>
                <span className="text-sm text-muted-foreground">{seleccionada.identificacion}</span>
                <Badge variant={seleccionada.admin ? "secondary" : "outline"}>
                  {seleccionada.admin ? "Administrativo" : "Operativo"}
                </Badge>
                <Badge className={String(seleccionada.estado).toUpperCase() === "ACTIVO" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                  {seleccionada.estado || "—"}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => setSeleccionada(null)}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={filtroTipo === "administrativos" ? "default" : "outline"}
                    onClick={() => setFiltroTipo("administrativos")}
                  >
                    Administrativos
                  </Button>
                  <Button
                    size="sm"
                    variant={filtroTipo === "operativos" ? "default" : "outline"}
                    onClick={() => setFiltroTipo("operativos")}
                  >
                    Operativos
                  </Button>
                  <Button size="sm" variant={filtroTipo === "todos" ? "default" : "outline"} onClick={() => setFiltroTipo("todos")}>
                    Todos
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder={loadingPersonas ? "Cargando personal..." : "Filtrar por nombre o cédula (opcional)..."}
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    disabled={loadingPersonas}
                  />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                  {loadingPersonas ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </div>
                  ) : resultadosBusqueda.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Sin personal {filtroTipo === "administrativos" ? "administrativo" : filtroTipo === "operativos" ? "operativo" : ""} que coincida.
                    </p>
                  ) : (
                    resultadosBusqueda.map((p) => (
                      <button
                        key={p.identificacion}
                        className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                        onClick={() => seleccionarPersona(p)}
                      >
                        <span className="flex-1">{p.nombre}</span>
                        <span className="text-xs text-muted-foreground">{p.identificacion}</span>
                        <Badge variant={p.admin ? "secondary" : "outline"} className="text-xs">
                          {p.admin ? "Admin" : "Operativo"}
                        </Badge>
                        <Badge className={`text-xs ${String(p.estado).toUpperCase() === "ACTIVO" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                          {p.estado || "—"}
                        </Badge>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {seleccionada && (
            <>
              {/* Fecha o rango */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">Fecha:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        {fechaInicio ? format(fechaInicio, "PP", { locale: es }) : "Seleccionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={fechaInicio} onSelect={setFechaInicio} locale={es} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center gap-2 border-l pl-3">
                  <input
                    type="checkbox"
                    id="usarRango"
                    checked={usarRango}
                    disabled={esRetiro}
                    onChange={(e) => setUsarRango(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="usarRango" className={esRetiro ? "text-sm text-muted-foreground" : "text-sm"}>
                    Aplicar a un rango de fechas{esRetiro ? " (no disponible para Retiro)" : ""}
                  </Label>
                </div>
                {usarRango && !esRetiro && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">hasta</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          {fechaFin ? format(fechaFin, "PP", { locale: es }) : "Fecha fin"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={fechaFin} onSelect={setFechaFin} locale={es} />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>

              {/* Tipo de registro */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">Tipo de registro</Label>
                  <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRABAJADO">Trabajado normal</SelectItem>
                      <SelectItem value="NOVEDAD">Novedad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {tipo === "TRABAJADO" && !seleccionada.admin && (
                  <div className="space-y-1">
                    <Label className="text-sm">Puesto</Label>
                    <Select value={puesto} onValueChange={setPuesto}>
                      <SelectTrigger className="w-[260px]">
                        <SelectValue placeholder="Seleccionar puesto" />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERACIONES_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                        {ESPECIALIDADES_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {tipo === "TRABAJADO" && seleccionada.admin && (
                  <p className="text-sm text-muted-foreground pb-2">Día de salario normal (sin puesto operativo).</p>
                )}

                {tipo === "NOVEDAD" && (
                  <div className="space-y-1">
                    <Label className="text-sm">Novedad</Label>
                    <Select value={novedad} onValueChange={setNovedad}>
                      <SelectTrigger className="w-[320px]">
                        <SelectValue placeholder="Seleccionar novedad" />
                      </SelectTrigger>
                      <SelectContent>
                        {NOVEDADES_DIA.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button onClick={handleGuardar} disabled={guardando}>
                  {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Guardar
                </Button>
              </div>

              {/* Historial */}
              <div className="space-y-2">
                <Label className="text-sm">Historial (últimos 90 días)</Label>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Puesto</TableHead>
                        <TableHead>Novedad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingHistorial ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                          </TableCell>
                        </TableRow>
                      ) : historial.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                            Sin registros en los últimos 90 días.
                          </TableCell>
                        </TableRow>
                      ) : (
                        historial.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell>{h.fecha}</TableCell>
                            <TableCell>{h.puesto || "—"}</TableCell>
                            <TableCell>{h.asistencia || "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
