"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import {
  getExamenesMedicos,
  deleteExamenMedico,
  type ExamenMedico,
} from "@/lib/examenes-medicos-actions"
import { getEntrevistas, type Entrevista } from "@/lib/entrevistas-actions"
import { Plus, Trash2, Eye, Download, Search, Stethoscope, Loader2 } from "lucide-react"

export default function ExamenesMedicos() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [examenes, setExamenes] = useState<ExamenMedico[]>([])
  const [aptos, setAptos] = useState<Entrevista[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Empleado seleccionado (entrevista APTA) y datos del examen.
  const [empleado, setEmpleado] = useState<Entrevista | null>(null)
  const [empleadoSearch, setEmpleadoSearch] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [tipoExamen, setTipoExamen] = useState("")
  const [resultado, setResultado] = useState("")
  const [fechaExamen, setFechaExamen] = useState("")
  const [observaciones, setObservaciones] = useState("")

  const loadData = async () => {
    setLoading(true)
    const [exRes, entRes] = await Promise.all([
      getExamenesMedicos(selectedEmpresaId),
      getEntrevistas(selectedEmpresaId),
    ])
    setExamenes(exRes.success ? exRes.data : [])
    // Solo empleados que aprobaron la entrevista (concepto apto).
    setAptos(entRes.success ? entRes.data.filter((e) => e.concepto_final === "apto") : [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const resetForm = () => {
    setEmpleado(null)
    setEmpleadoSearch("")
    setFile(null)
    setTipoExamen("")
    setResultado("")
    setFechaExamen("")
    setObservaciones("")
  }

  // Empleados aptos que coinciden con la busqueda (por cedula o nombre).
  const empleadosFiltrados = useMemo(() => {
    const q = empleadoSearch.trim().toLowerCase()
    if (!q) return aptos.slice(0, 25)
    return aptos
      .filter(
        (e) =>
          e.nombre_candidato.toLowerCase().includes(q) ||
          (e.cedula?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 25)
  }, [aptos, empleadoSearch])

  const handleUpload = async () => {
    if (!empleado) {
      toast({ title: "Falta el empleado", description: "Selecciona un empleado apto." })
      return
    }
    if (!file) {
      toast({ title: "Falta el documento", description: "Adjunta el examen médico." })
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      if (selectedEmpresaId) fd.append("empresaId", String(selectedEmpresaId))
      fd.append("entrevista_id", empleado.id)
      fd.append("hoja_vida_id", empleado.hoja_vida_id || "")
      fd.append("cedula", empleado.cedula || "")
      fd.append("nombre", empleado.nombre_candidato)
      fd.append("tipo_examen", tipoExamen)
      fd.append("resultado", resultado)
      fd.append("fecha_examen", fechaExamen)
      fd.append("observaciones", observaciones)
      fd.append("file", file)

      const res = await fetch("/api/examenes-medicos/upload", { method: "POST", body: fd })
      const json = await res.json()

      if (!res.ok) {
        toast({ title: "Error", description: json.error || "No se pudo subir el examen médico." })
        return
      }

      toast({ title: "Examen médico guardado" })
      setOpen(false)
      resetForm()
      loadData()
    } catch (err) {
      toast({ title: "Error", description: "Ocurrió un error al subir el archivo." })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este examen médico? Esta acción no se puede deshacer.")) return
    const result = await deleteExamenMedico(id)
    if (result.success) {
      toast({ title: "Examen médico eliminado" })
      loadData()
    } else {
      toast({ title: "Error", description: result.message || "No se pudo eliminar." })
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return examenes
    return examenes.filter(
      (e) =>
        e.nombre.toLowerCase().includes(q) || (e.cedula?.toLowerCase().includes(q) ?? false),
    )
  }, [examenes, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" />
            Exámenes Médicos
          </h1>
          <p className="text-sm text-muted-foreground">
            Carga el examen médico de los empleados que aprobaron la entrevista.
          </p>
        </div>

        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) resetForm()
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Cargar examen médico
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Nuevo examen médico</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Selector de empleado apto (desde entrevistas con concepto apto) */}
              <div className="space-y-1.5">
                <Label>
                  Empleado apto (cédula o nombre) <span className="text-destructive">*</span>
                </Label>
                {empleado ? (
                  <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                    <div className="text-sm">
                      <span className="font-medium text-foreground">{empleado.nombre_candidato}</span>
                      <span className="text-muted-foreground"> · {empleado.cedula || "sin cédula"}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEmpleado(null)
                        setEmpleadoSearch("")
                      }}
                    >
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar empleado apto por cédula o nombre..."
                        value={empleadoSearch}
                        onChange={(e) => setEmpleadoSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                      {empleadosFiltrados.length === 0 ? (
                        <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                          No hay empleados aptos que coincidan.
                        </p>
                      ) : (
                        empleadosFiltrados.map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setEmpleado(e)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <span>
                              <span className="font-medium text-foreground">{e.nombre_candidato}</span>
                              <span className="text-muted-foreground"> · {e.cedula || "sin cédula"}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tipo_examen">Tipo de examen</Label>
                  <Input
                    id="tipo_examen"
                    placeholder="Ingreso, periódico, egreso..."
                    value={tipoExamen}
                    onChange={(e) => setTipoExamen(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="resultado">Resultado</Label>
                  <Input
                    id="resultado"
                    placeholder="Apto, apto con restricciones..."
                    value={resultado}
                    onChange={(e) => setResultado(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fecha_examen">Fecha del examen</Label>
                <Input
                  id="fecha_examen"
                  type="date"
                  value={fechaExamen}
                  onChange={(e) => setFechaExamen(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea
                  id="observaciones"
                  rows={2}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="file">
                  Documento del examen médico <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
                  Cancelar
                </Button>
                <Button onClick={handleUpload} disabled={uploading}>
                  {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {uploading ? "Subiendo..." : "Guardar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o cédula..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Cédula</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No hay exámenes médicos registrados.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.nombre}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.cedula || "—"}</TableCell>
                  <TableCell className="text-sm">{e.tipo_examen || "—"}</TableCell>
                  <TableCell className="text-sm">{e.resultado || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.fecha_examen || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" asChild title="Ver documento">
                        <a href={e.archivo_url} target="_blank" rel="noopener noreferrer">
                          <Eye className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild title="Descargar">
                        <a href={e.archivo_url} download={e.archivo_nombre || undefined}>
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(e.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
