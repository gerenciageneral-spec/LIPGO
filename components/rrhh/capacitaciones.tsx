"use client"

import React from "react"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import {
  getCapacitaciones,
  createCapacitacion,
  updateCapacitacion,
  deleteCapacitacion,
  generarPlanillaAsistenciaCapacitacion,
  getAsistenciaCapacitacionesResumen,
} from "@/lib/rrhh-actions"
import {
  Trash2,
  Edit2,
  Plus,
  Upload,
  FileText,
  Loader2,
  ClipboardList,
  Users,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"

interface Capacitacion {
  id: string
  tema: string
  categoria: string
  fecha: string
  // Fecha fin opcional: permite definir un rango cuando la capacitacion
  // se extiende por varios dias. Mapea a la columna `fecha_fin` (date)
  // en la tabla `capacitaciones`.
  fecha_fin: string | null
  duracion_horas: number
  instructor: string
  cliente_aplica: string
  sede: string
  // URL publica del archivo de evidencia subido al bucket
  // `archivos/capacitaciones/`. Se persiste en la columna
  // `urlcapacitacion`.
  urlcapacitacion: string | null
  // Empresa (de `empresas_permisos`) bajo la que se registra la
  // capacitacion. Se persiste en la columna `idempresa`.
  idempresa: number | null
  created_at: string
}

export default function Capacitaciones() {
  const { selectedEmpresaId } = useAuth()
  const [capacitaciones, setCapacitaciones] = useState<Capacitacion[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    tema: "",
    categoria: "",
    fecha: "",
    fecha_fin: "",
    duracion_horas: "",
    instructor: "",
    cliente_aplica: "",
    sede: "",
    urlcapacitacion: "",
    // Empresa seleccionada para esta capacitacion. Persistido como
    // entero en `capacitaciones.idempresa`. Lo guardamos como string
    // en el state para que el componente <Select> de shadcn lo
    // maneje sin convertirlo en cada render.
    idempresa: "",
  })
  // Lista de empresas para el selector. Se carga una sola vez al
  // abrirse el dialog (lazy) consumiendo `/api/empresas`, que ya
  // expone `id` y `nombre` desde la tabla `empresas_permisos`.
  const [empresas, setEmpresas] = useState<{ id: number; nombre: string }[]>([])
  const [empresasLoading, setEmpresasLoading] = useState(false)
  // Estado de carga del archivo de evidencia. Cuando esta en true
  // bloqueamos el boton "Crear/Actualizar" para que el usuario no
  // guarde antes de que termine la subida y la URL se asigne al
  // formulario.
  const [uploadingEvidencia, setUploadingEvidencia] = useState(false)
  // ID de la capacitacion cuya planilla se esta generando. Lo
  // usamos para mostrar un spinner solo en la fila correcta y
  // bloquear ese boton mientras se descarga el PDF.
  const [downloadingPlanillaId, setDownloadingPlanillaId] = useState<
    string | null
  >(null)
  // Estado del dialogo donde el usuario llena los campos del
  // encabezado SST-FO-11 que NO viven en la tabla `capacitaciones`
  // (hora inicial, hora final, objetivo y cedula del instructor).
  // Cuando `planillaTarget` esta seteado, el dialogo aparece para
  // esa capacitacion; al confirmar se dispara la descarga real.
  const [planillaTarget, setPlanillaTarget] = useState<{
    id: string
    instructor: string
  } | null>(null)
  const [planillaForm, setPlanillaForm] = useState({
    horaInicial: "",
    horaFinal: "",
    objetivo: "",
    cedulaInstructor: "",
    tipo: "Capacitacion" as
      | "Charla"
      | "Capacitacion"
      | "Entrenamiento"
      | "Otro",
    modalidad: "Interna" as "Interna" | "Externa",
  })
  // Resumen para mostrar "asistentes / headcount" en cada fila y
  // habilitar/deshabilitar la descarga de la planilla. El headcount
  // total excluye nombres con "AUXILIAR" o "PRUEBA".
  const [headcountTotal, setHeadcountTotal] = useState(0)
  const [asistenciaPorCapacitacion, setAsistenciaPorCapacitacion] =
    useState<Record<string, number>>({})
  const { toast } = useToast()

  const loadCapacitaciones = async () => {
    setLoading(true)
    // Las capacitaciones se muestran para todos los proyectos: el
    // backend ignora `selectedEmpresaId` en la lectura (ver
    // getCapacitaciones en lib/rrhh-actions.ts). Lo seguimos pasando
    // por compatibilidad de firma, pero ya no condiciona el listado.
    const [result, resumen] = await Promise.all([
      getCapacitaciones(selectedEmpresaId),
      getAsistenciaCapacitacionesResumen(selectedEmpresaId ?? null),
    ])
    if (result.success) {
      setCapacitaciones(result.data)
    } else {
      toast({
        title: "Error",
        description: "Error al cargar capacitaciones",
        variant: "destructive",
      })
    }
    if (resumen.success) {
      setHeadcountTotal(resumen.headcountTotal)
      setAsistenciaPorCapacitacion(resumen.asistenciaPorCapacitacion)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Antes el efecto solo cargaba cuando habia `selectedEmpresaId`;
    // ahora la lista es global, asi que disparamos la carga al
    // montar y volvemos a cargar si cambia la empresa (por si el
    // usuario crea una capacitacion asociada a otra empresa y vuelve
    // al modulo, queremos refrescar).
    loadCapacitaciones()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.tema || !formData.fecha) {
      toast({
        title: "Error",
        description: "Tema y fecha son requeridos",
        variant: "destructive",
      })
      return
    }
    if (!formData.idempresa) {
      toast({
        title: "Empresa requerida",
        description: "Selecciona la empresa en la que se hara la capacitacion",
        variant: "destructive",
      })
      return
    }

    const dataToSave = {
      ...formData,
      // Enviamos null en lugar de cadena vacia para campos opcionales
      // de tipo date / text en la base de datos: asi evitamos errores
      // de tipo y dejamos los registros consistentes.
      fecha_fin: formData.fecha_fin || null,
      urlcapacitacion: formData.urlcapacitacion || null,
      duracion_horas: formData.duracion_horas
        ? Number(formData.duracion_horas)
        : null,
      // Convertimos `idempresa` a numero para que coincida con el
      // tipo `bigint`/`integer` de la columna en la base de datos.
      idempresa: Number(formData.idempresa),
    }

    if (editingId) {
      const result = await updateCapacitacion(editingId, dataToSave)
      if (result.success) {
        toast({ title: "Éxito", description: "Capacitación actualizada" })
        loadCapacitaciones()
        setOpen(false)
        resetForm()
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } else {
      const result = await createCapacitacion(dataToSave, selectedEmpresaId)
      if (result.success) {
        toast({ title: "Éxito", description: "Capacitación creada" })
        loadCapacitaciones()
        setOpen(false)
        resetForm()
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    }
  }

  const handleEdit = (capacitacion: Capacitacion) => {
    setFormData({
      tema: capacitacion.tema,
      categoria: capacitacion.categoria,
      fecha: capacitacion.fecha,
      fecha_fin: capacitacion.fecha_fin ?? "",
      duracion_horas: capacitacion.duracion_horas?.toString() || "",
      instructor: capacitacion.instructor,
      cliente_aplica: capacitacion.cliente_aplica,
      sede: capacitacion.sede,
      urlcapacitacion: capacitacion.urlcapacitacion ?? "",
      idempresa: capacitacion.idempresa != null ? String(capacitacion.idempresa) : "",
    })
    setEditingId(capacitacion.id)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de que desea eliminar esta capacitación?"))
      return

    const result = await deleteCapacitacion(id)
    if (result.success) {
      toast({ title: "Éxito", description: "Capacitación eliminada" })
      loadCapacitaciones()
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      })
    }
  }

  const resetForm = () => {
    setFormData({
      tema: "",
      categoria: "",
      fecha: "",
      fecha_fin: "",
      duracion_horas: "",
      instructor: "",
      cliente_aplica: "",
      sede: "",
      urlcapacitacion: "",
      idempresa: "",
    })
    setEditingId(null)
  }

  // Sube el archivo seleccionado al bucket `archivos/capacitaciones/`
  // a traves del endpoint /api/capacitaciones/upload-evidencia y
  // guarda la URL publica resultante en `formData.urlcapacitacion`,
  // que es lo que despues se persistira en la columna del registro.
  const handleEvidenciaChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingEvidencia(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/capacitaciones/upload-evidencia", {
        method: "POST",
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "No se pudo subir la evidencia")
      }
      setFormData((prev) => ({ ...prev, urlcapacitacion: data.url }))
      toast({ title: "Evidencia subida", description: file.name })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Error al subir la evidencia",
        variant: "destructive",
      })
    } finally {
      setUploadingEvidencia(false)
      // Limpia el input para que volver a seleccionar el mismo
      // archivo dispare el evento `change` otra vez.
      e.target.value = ""
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm()
    } else if (empresas.length === 0 && !empresasLoading) {
      // Cargamos las empresas la primera vez que se abre el dialog.
      // Lo hacemos lazy para no pegarle al endpoint en cada render.
      setEmpresasLoading(true)
      fetch("/api/empresas")
        .then((r) => r.json())
        .then((res) => {
          if (res?.success && Array.isArray(res.data)) {
            setEmpresas(res.data)
          }
        })
        .catch((err) => {
          console.error("[v0] error cargando empresas_permisos", err)
        })
        .finally(() => setEmpresasLoading(false))
    }
    setOpen(newOpen)
  }

  // Abre el dialogo de "datos manuales del encabezado". El usuario
  // debe llenar hora inicial, hora final, objetivo y cedula del
  // instructor antes de generar la planilla SST-FO-11.
  const handleAbrirPlanilla = (capacitacion: {
    id: string
    instructor?: string | null
    planilla?: string | null
  }) => {
    // Si la planilla ya fue generada y almacenada, solo la consultamos
    // (abrimos su URL) sin volver a generar el PDF.
    if (capacitacion.planilla) {
      window.open(capacitacion.planilla, "_blank", "noopener,noreferrer")
      return
    }
    setPlanillaForm({
      horaInicial: "",
      horaFinal: "",
      objetivo: "",
      cedulaInstructor: "",
      tipo: "Capacitacion",
      modalidad: "Interna",
    })
    setPlanillaTarget({
      id: capacitacion.id,
      instructor: capacitacion.instructor || "",
    })
  }

  // Genera y descarga la planilla con los datos diligenciados.
  const handleDescargarPlanilla = async () => {
    if (!planillaTarget) return
    setDownloadingPlanillaId(planillaTarget.id)
    try {
      const result = await generarPlanillaAsistenciaCapacitacion(
        planillaTarget.id,
        planillaForm,
        selectedEmpresaId ?? null,
      )
      if (!result.success || !result.base64) {
        throw new Error(result.error || "No se pudo generar la planilla")
      }
      const binary = atob(result.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = result.fileName || "Planilla_Asistencia.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setPlanillaTarget(null)
      // Refrescamos el listado para que la planilla recien almacenada
      // (campo `planilla`) quede disponible y la proxima vez solo se
      // consulte sin regenerar.
      loadCapacitaciones()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Error al descargar la planilla",
        variant: "destructive",
      })
    } finally {
      setDownloadingPlanillaId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Capacitaciones</h2>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nueva Capacitación
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar Capacitación" : "Nueva Capacitación"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Selector de empresa: las opciones vienen de
                    `empresas_permisos` via /api/empresas y al guardar
                    persistimos el `id` numerico en la columna
                    `idempresa` de la tabla `capacitaciones`. */}
                <div className="col-span-2">
                  <Label htmlFor="idempresa">Empresa *</Label>
                  <Select
                    value={formData.idempresa}
                    onValueChange={(value) =>
                      setFormData({ ...formData, idempresa: value })
                    }
                  >
                    <SelectTrigger id="idempresa">
                      <SelectValue
                        placeholder={
                          empresasLoading
                            ? "Cargando empresas..."
                            : "Selecciona una empresa"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {empresas.map((emp) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>
                          {emp.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="tema">Tema *</Label>
                  <Input
                    id="tema"
                    value={formData.tema}
                    onChange={(e) =>
                      setFormData({ ...formData, tema: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="categoria">Categoría</Label>
                  <Input
                    id="categoria"
                    value={formData.categoria}
                    onChange={(e) =>
                      setFormData({ ...formData, categoria: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="fecha">Fecha *</Label>
                  <Input
                    id="fecha"
                    type="date"
                    value={formData.fecha}
                    onChange={(e) =>
                      setFormData({ ...formData, fecha: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="fecha_fin">Fecha fin</Label>
                  <Input
                    id="fecha_fin"
                    type="date"
                    value={formData.fecha_fin}
                    min={formData.fecha || undefined}
                    onChange={(e) =>
                      setFormData({ ...formData, fecha_fin: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="duracion_horas">Duraci��n (Horas)</Label>
                  <Input
                    id="duracion_horas"
                    type="number"
                    step="0.5"
                    value={formData.duracion_horas}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        duracion_horas: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="instructor">Instructor</Label>
                  <Input
                    id="instructor"
                    value={formData.instructor}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        instructor: e.target.value,
                      })
                    }
                  />
                </div>
                {/* Evidencia: subimos al bucket archivos/capacitaciones
                    a traves del endpoint y guardamos la URL publica
                    en `urlcapacitacion`. Aceptamos imagenes y los
                    documentos mas comunes (PDF / Office). */}
                <div className="col-span-2">
                  <Label htmlFor="evidencia">Evidencia (archivo o imagen)</Label>
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <Input
                      id="evidencia"
                      type="file"
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                      onChange={handleEvidenciaChange}
                      disabled={uploadingEvidencia}
                      className="cursor-pointer"
                    />
                    {uploadingEvidencia ? (
                      <span className="inline-flex items-center text-xs text-muted-foreground gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Subiendo...
                      </span>
                    ) : formData.urlcapacitacion ? (
                      <a
                        href={formData.urlcapacitacion}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Ver evidencia actual
                      </a>
                    ) : (
                      <span className="inline-flex items-center text-xs text-muted-foreground gap-1.5">
                        <Upload className="w-3.5 h-3.5" />
                        Sin evidencia
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={uploadingEvidencia}>
                  {editingId ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando...</div>
      ) : capacitaciones.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No hay capacitaciones registradas
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tema</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Fecha fin</TableHead>
                <TableHead>Duración (Horas)</TableHead>
                <TableHead>Instructor</TableHead>
                <TableHead>Cliente Aplica</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Evidencia</TableHead>
                <TableHead>Asistencia</TableHead>
                <TableHead className="w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {capacitaciones.map((capacitacion) => (
                <TableRow key={capacitacion.id}>
                  <TableCell className="font-medium">
                    {capacitacion.tema}
                  </TableCell>
                  <TableCell>{capacitacion.categoria || "-"}</TableCell>
                  <TableCell>{capacitacion.fecha}</TableCell>
                  <TableCell>{capacitacion.fecha_fin || "-"}</TableCell>
                  <TableCell>{capacitacion.duracion_horas || "-"}</TableCell>
                  <TableCell>{capacitacion.instructor || "-"}</TableCell>
                  <TableCell>{capacitacion.cliente_aplica || "-"}</TableCell>
                  <TableCell>{capacitacion.sede || "-"}</TableCell>
                  <TableCell>
                    {capacitacion.urlcapacitacion ? (
                      <a
                        href={capacitacion.urlcapacitacion}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <FileText className="w-4 h-4" />
                        Ver
                      </a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* Conteo "asistentes / headcount". El headcount
                        excluye nombres con AUXILIAR / PRUEBA. Usamos
                        verde cuando esta completo (todos firmaron) y
                        ambar cuando aun falta gente. */}
                    {(() => {
                      const asistentes =
                        asistenciaPorCapacitacion[capacitacion.id] || 0
                      const completo =
                        headcountTotal > 0 && asistentes >= headcountTotal
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            completo
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          <Users className="w-3 h-3" />
                          {asistentes} / {headcountTotal}
                        </span>
                      )
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {/* Descarga la planilla PDF con la lista de
                          asistentes y la firma de cada colaborador.
                          La descarga se permite siempre, sin importar
                          cuantos colaboradores hayan registrado
                          asistencia: el badge de la columna
                          "Asistencia" sigue mostrando el progreso
                          (ambar/verde) como referencia visual.
                          Mostramos un spinner solo en la fila que
                          esta generando para no bloquear el resto de
                          la tabla. */}
                      {(() => {
                        const generando =
                          downloadingPlanillaId === capacitacion.id
                        const planillaLista = Boolean(capacitacion.planilla)
                        return (
                          <Button
                            variant="outline"
                            size="sm"
                            title={
                              planillaLista
                                ? "Ver planilla de asistencia"
                                : "Generar planilla de asistencia"
                            }
                            disabled={generando}
                            onClick={() => handleAbrirPlanilla(capacitacion)}
                          >
                            {generando ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : planillaLista ? (
                              <FileText className="w-4 h-4" />
                            ) : (
                              <ClipboardList className="w-4 h-4" />
                            )}
                          </Button>
                        )
                      })()}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(capacitacion)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(capacitacion.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialogo para capturar los datos manuales del encabezado
          SST-FO-11 (hora inicial, hora final, objetivo, cedula del
          instructor, tipo y modalidad). Solo se monta cuando hay un
          target seleccionado para evitar montar/desmontar el form
          en cada render. */}
      <Dialog
        open={!!planillaTarget}
        onOpenChange={(o) => !o && setPlanillaTarget(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Datos para la planilla de asistencia</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="hora_inicial">Hora inicial</Label>
              <Input
                id="hora_inicial"
                type="time"
                value={planillaForm.horaInicial}
                onChange={(e) =>
                  setPlanillaForm({
                    ...planillaForm,
                    horaInicial: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="hora_final">Hora final</Label>
              <Input
                id="hora_final"
                type="time"
                value={planillaForm.horaFinal}
                onChange={(e) =>
                  setPlanillaForm({
                    ...planillaForm,
                    horaFinal: e.target.value,
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="objetivo">Objetivo</Label>
              <textarea
                id="objetivo"
                value={planillaForm.objetivo}
                onChange={(e) =>
                  setPlanillaForm({
                    ...planillaForm,
                    objetivo: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border rounded-md"
                rows={3}
              />
            </div>
            <div className="col-span-2">
              <Label>Capacitador</Label>
              <Input value={planillaTarget?.instructor || ""} disabled />
            </div>
            <div className="col-span-2">
              <Label htmlFor="cedula_instructor">
                C.C. del capacitador
              </Label>
              <Input
                id="cedula_instructor"
                value={planillaForm.cedulaInstructor}
                onChange={(e) =>
                  setPlanillaForm({
                    ...planillaForm,
                    cedulaInstructor: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="tipo">Tipo</Label>
              <select
                id="tipo"
                value={planillaForm.tipo}
                onChange={(e) =>
                  setPlanillaForm({
                    ...planillaForm,
                    tipo: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value="Charla">Charla</option>
                <option value="Capacitacion">Capacitacion</option>
                <option value="Entrenamiento">Entrenamiento</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div>
              <Label htmlFor="modalidad">Modalidad</Label>
              <select
                id="modalidad"
                value={planillaForm.modalidad}
                onChange={(e) =>
                  setPlanillaForm({
                    ...planillaForm,
                    modalidad: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value="Interna">Interna</option>
                <option value="Externa">Externa</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => setPlanillaTarget(null)}
              disabled={downloadingPlanillaId === planillaTarget?.id}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDescargarPlanilla}
              disabled={downloadingPlanillaId === planillaTarget?.id}
            >
              {downloadingPlanillaId === planillaTarget?.id ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                "Descargar PDF"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
