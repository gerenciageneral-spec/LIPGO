"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/components/auth-provider"
import { Clock, AlertTriangle, CheckCircle2, Check, X, History, Wrench, SlidersHorizontal } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ExtraHoursRecord {
  id: number
  fecha: string
  nombre: string
  identificacion: string
  puesto: string | null
  hed: number | null
  hedf: number | null
  hen: number | null
  hef: number | null
  hn: number | null
  horaentradaprogramada: string | null
  horasalidaprogramada: string | null
  horaingreso: string | null
  horasalida: string | null
  aprobado: string | boolean | null
  // Campos calculados en el servidor tras el cruce con solicitud_horas_extras
  totalEjecutadas: number
  cantidadProgramada: number
  programada: boolean
}

// Fecha de hoy en zona horaria de Colombia, formato YYYY-MM-DD.
function hoyColombia(): string {
  const colombiaDate = new Date().toLocaleString("en-US", {
    timeZone: "America/Bogota",
  })
  return new Date(colombiaDate).toISOString().split("T")[0]
}

// Opciones de valor para el ajuste manual: 1, 2 o 3 (jornada base 7h vigente
// desde el 16-jul-2026; antes era 0.66/2.66 con jornada 7.3333h).
const OPCIONES_AJUSTE: number[] = [1, 2, 3]

// Botón + popover para ajustar manualmente un campo de hora extra
// (HED, HEDF, HEN o HN) con un valor entre 1 y 3.
function AjusteManualButton({
  disabled,
  onApply,
}: {
  disabled?: boolean
  onApply: (campo: "hed" | "hedf" | "hen" | "hn", valor: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [campo, setCampo] = useState<"hed" | "hedf" | "hen" | "hn">("hed")
  const [valor, setValor] = useState<number>(1)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1" disabled={disabled}>
          <SlidersHorizontal className="h-3 w-3" />
          Ajustar HED
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3" align="end">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Campo</Label>
          <Select value={campo} onValueChange={(v) => setCampo(v as typeof campo)}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hed">HED</SelectItem>
              <SelectItem value="hedf">HEDF</SelectItem>
              <SelectItem value="hen">HEN</SelectItem>
              <SelectItem value="hn">HN</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Valor (1 - 3)</Label>
          <Select
            value={String(valor)}
            onValueChange={(v) => setValor(Number(v))}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPCIONES_AJUSTE.map((o) => (
                <SelectItem key={o} value={String(o)}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            onApply(campo, valor)
            setOpen(false)
          }}
        >
          Aplicar
        </Button>
      </PopoverContent>
    </Popover>
  )
}

interface ExtraHoursAssignmentProps {
  // Acceso directo: navega al módulo "Aprobar Turnos" abriéndolo en la
  // vista "Ver historial". Lo provee main-content.
  onNavigateToAprobarTurnosHistorial?: () => void
}

export function ExtraHoursAssignment({
  onNavigateToAprobarTurnosHistorial,
}: ExtraHoursAssignmentProps) {
  const [records, setRecords] = useState<ExtraHoursRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [fecha, setFecha] = useState<string>(hoyColombia())
  // Id del registro que está siendo actualizado, para deshabilitar sus
  // botones mientras se hace el PATCH.
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    if (selectedEmpresaId) {
      loadRecords()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId, fecha])

  const loadRecords = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `/api/extra-hours?empresaId=${selectedEmpresaId}&fecha=${fecha}`,
      )

      if (!response.ok) {
        throw new Error("Error al cargar registros")
      }

      const data = await response.json()
      setRecords(data.registros || [])
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los registros",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Marca un registro como "aprobado" o "rechazado" persistiendo el
  // valor en el campo `aprobado` de la tabla registroasistencia vía
  // PATCH /api/extra-hours. Hace update optimista del estado local.
  const actualizarAprobado = async (
    id: number,
    estado: "aprobado" | "rechazado",
  ) => {
    try {
      setUpdatingId(id)
      // Al RECHAZAR ponemos en cero todos los campos de horas extra
      // (HED, HEDF, HEN, HEF, HN) además de marcar el estado, para que
      // ese registro no compute horas extra.
      const payload: Record<string, unknown> = { id, aprobado: estado }
      if (estado === "rechazado") {
        payload.hed = 0
        payload.hedf = 0
        payload.hen = 0
        payload.hef = 0
        payload.hn = 0
      }
      const response = await fetch("/api/extra-hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error("Error al actualizar")
      }
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                aprobado: estado,
                ...(estado === "rechazado"
                  ? { hed: 0, hedf: 0, hen: 0, hef: 0, hn: 0 }
                  : {}),
              }
            : r,
        ),
      )
      toast({
        title: estado === "aprobado" ? "Hora extra aprobada" : "Hora extra rechazada",
        description:
          estado === "aprobado"
            ? "El registro se marcó como aprobado."
            : "El registro se marcó como rechazado y sus horas extra quedaron en cero.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado",
        variant: "destructive",
      })
    } finally {
      setUpdatingId(null)
    }
  }

  // Determina si un campo de hora extra tiene un valor real (no
  // null/""/0). Espejo del helper usado en el servidor.
  const tieneValor = (valor: number | null) => {
    if (valor === null || valor === undefined) return false
    return Number(valor) !== 0
  }

  // "Ajustar": reemplaza en registroasistencia el valor de la hora
  // extra EJECUTADA (el campo HED/HEDF/HEN/HEF/HN que tenga valor) por
  // la CANTIDAD PROGRAMADA, y marca el registro como "aprobado". Si hay
  // más de un campo con valor, se ajusta el primero no vacío y los
  // demás se dejan sin cambios.
  const ajustarAProgramada = async (record: ExtraHoursRecord) => {
    if (record.cantidadProgramada <= 0) return
    const campos: (keyof ExtraHoursRecord)[] = ["hed", "hedf", "hen", "hef", "hn"]
    const campoObjetivo = campos.find((c) => tieneValor(record[c] as number | null))

    if (!campoObjetivo) {
      toast({
        title: "Sin horas que ajustar",
        description: "Este registro no tiene un valor de hora extra para ajustar.",
        variant: "destructive",
      })
      return
    }

    try {
      setUpdatingId(record.id)
      const response = await fetch("/api/extra-hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: record.id,
          [campoObjetivo]: record.cantidadProgramada,
          aprobado: "aprobado",
        }),
      })
      if (!response.ok) {
        throw new Error("Error al ajustar")
      }
      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? { ...r, [campoObjetivo]: record.cantidadProgramada, aprobado: "aprobado" }
            : r,
        ),
      )
      toast({
        title: "Hora extra ajustada",
        description: `Se ajustó ${campoObjetivo.toUpperCase()} a ${record.cantidadProgramada} (programada) y se aprobó el registro.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo ajustar el registro",
        variant: "destructive",
      })
    } finally {
      setUpdatingId(null)
    }
  }

  // Ajuste manual: aplica un valor (entre 1 y 3) a uno de los
  // campos de hora extra (HED, HEDF, HEN, HN) del registro indicado y
  // lo persiste en registroasistencia.
  const ajustarManual = async (
    id: number,
    campo: "hed" | "hedf" | "hen" | "hn",
    valor: number,
  ) => {
    try {
      setUpdatingId(id)
      const response = await fetch("/api/extra-hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [campo]: valor }),
      })
      if (!response.ok) {
        throw new Error("Error al ajustar")
      }
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [campo]: valor } : r)),
      )
      toast({
        title: "Valor ajustado",
        description: `Se ajustó ${campo.toUpperCase()} a ${valor.toFixed(2)}.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo ajustar el valor",
        variant: "destructive",
      })
    } finally {
      setUpdatingId(null)
    }
  }

  // Normaliza el valor de `aprobado` (puede venir como string o boolean)
  // a una de tres etiquetas conocidas.
  const estadoAprobacion = (
    v: string | boolean | null,
  ): "aprobado" | "rechazado" | "pendiente" => {
    if (v === true) return "aprobado"
    if (v === false) return "rechazado"
    const texto = String(v ?? "").trim().toLowerCase()
    if (texto === "aprobado" || texto === "true" || texto === "si") return "aprobado"
    if (texto === "rechazado" || texto === "false" || texto === "no") return "rechazado"
    return "pendiente"
  }

  const formatNum = (v: number | null) =>
    v === null || v === undefined || Number(v) === 0 ? "-" : Number(v).toFixed(2)

  const formatHora = (v: string | null) => (v ? v : "-")

  const noProgramadas = records.filter((r) => !r.programada).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6" />
          <h2 className="text-2xl font-bold text-balance">Aprobación horas Éxtra</h2>
        </div>
        <div className="flex items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="fecha-he">Fecha</Label>
            <Input
              id="fecha-he"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-44"
            />
          </div>
          {onNavigateToAprobarTurnosHistorial && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={onNavigateToAprobarTurnosHistorial}
            >
              <History className="h-4 w-4" />
              Ver historial de Aprobar Turnos
            </Button>
          )}
        </div>
      </div>

      {/* Aviso resumen cuando hay horas extra ejecutadas sin programación */}
      {!loading && noProgramadas > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {noProgramadas} registro(s) con horas extra no programadas. Revisa
            las filas marcadas en rojo.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Especialidades del día</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Cargando registros...</p>
          ) : records.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No hay registros de especialidades para la fecha seleccionada
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Identificación</TableHead>
                    <TableHead>Puesto</TableHead>
                    <TableHead className="text-center">Entrada prog.</TableHead>
                    <TableHead className="text-center">Ingreso</TableHead>
                    <TableHead className="text-center">Salida</TableHead>
                    <TableHead className="text-center">Salida prog.</TableHead>
                    <TableHead className="text-center">HED</TableHead>
                    <TableHead className="text-center">HEDF</TableHead>
                    <TableHead className="text-center">HEN</TableHead>
                    <TableHead className="text-center">HEF</TableHead>
                    <TableHead className="text-center">HN</TableHead>
                    <TableHead className="text-center">Solicitado por el cliente</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-center">Aprobación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow
                      key={record.id}
                      className={!record.programada ? "bg-destructive/5" : undefined}
                    >
                      <TableCell className="whitespace-nowrap">{record.fecha}</TableCell>
                      <TableCell className="font-medium">{record.nombre}</TableCell>
                      <TableCell>{record.identificacion}</TableCell>
                      <TableCell>{record.puesto || "-"}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        {formatHora(record.horaentradaprogramada)}
                      </TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        {formatHora(record.horaingreso)}
                      </TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        {formatHora(record.horasalida)}
                      </TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        {formatHora(record.horasalidaprogramada)}
                      </TableCell>
                      <TableCell className="text-center">{formatNum(record.hed)}</TableCell>
                      <TableCell className="text-center">{formatNum(record.hedf)}</TableCell>
                      <TableCell className="text-center">{formatNum(record.hen)}</TableCell>
                      <TableCell className="text-center">{formatNum(record.hef)}</TableCell>
                      <TableCell className="text-center">{formatNum(record.hn)}</TableCell>
                      <TableCell className="text-center">
                        {record.cantidadProgramada > 0 ? record.cantidadProgramada : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {record.programada ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Programada
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Hora extra no programada
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const estado = estadoAprobacion(record.aprobado)
                          // Una vez aprobado, no se permiten más cambios:
                          // se deshabilitan todos los botones de la fila.
                          const bloqueado =
                            updatingId === record.id || estado === "aprobado"
                          return (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant={estado === "aprobado" ? "default" : "outline"}
                                className="h-8 gap-1"
                                disabled={bloqueado}
                                onClick={() => actualizarAprobado(record.id, "aprobado")}
                              >
                                <Check className="h-3 w-3" />
                                Aprobar
                              </Button>
                              <Button
                                size="sm"
                                variant={estado === "rechazado" ? "destructive" : "outline"}
                                className="h-8 gap-1"
                                disabled={bloqueado}
                                onClick={() => actualizarAprobado(record.id, "rechazado")}
                              >
                                <X className="h-3 w-3" />
                                Rechazar
                              </Button>
                              {record.cantidadProgramada > 0 && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-8 gap-1"
                                  disabled={bloqueado}
                                  onClick={() => ajustarAProgramada(record)}
                                  title="Reemplaza la hora extra ejecutada por la cantidad programada y aprueba"
                                >
                                  <Wrench className="h-3 w-3" />
                                  Ajustar
                                </Button>
                              )}
                              <AjusteManualButton
                                disabled={bloqueado}
                                onApply={(campo, valor) =>
                                  ajustarManual(record.id, campo, valor)
                                }
                              />
                            </div>
                          )
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
