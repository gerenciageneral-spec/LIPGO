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
import { useAuth } from "@/components/auth-provider"
import {
  getEntrevistas,
  createEntrevista,
  updateEntrevista,
  deleteEntrevista,
  type Entrevista,
  type ExperienciaLaboral,
} from "@/lib/entrevistas-actions"
import { getHojasVida, type HojaDeVida } from "@/lib/hojas-vida-actions"
import {
  Plus,
  Trash2,
  Eye,
  Pencil,
  Search,
  FileCheck,
  Loader2,
  X,
} from "lucide-react"

const CONCEPTO_BADGE: Record<Entrevista["concepto_final"], string> = {
  apto: "bg-green-100 text-green-800",
  no_apto: "bg-red-100 text-red-800",
  aplazado: "bg-yellow-100 text-yellow-800",
}

const CONCEPTO_LABEL: Record<Entrevista["concepto_final"], string> = {
  apto: "Apto",
  no_apto: "No apto",
  aplazado: "Aplazado",
}

const emptyExperiencia = (): ExperienciaLaboral => ({
  empresa: "",
  cargo: "",
  fecha_inicio: "",
  fecha_fin: "",
  motivo_retiro: "",
  funciones: "",
  jefe_nombre: "",
  jefe_telefono: "",
})

const initialForm = {
  nombre_candidato: "",
  cedula: "",
  correo: "",
  telefono: "",
  edad: "",
  fecha_nacimiento: "",
  lugar_nacimiento: "",
  procedencia: "",
  direccion: "",
  contacto_emergencia_nombre: "",
  contacto_emergencia_parentesco: "",
  contacto_emergencia_telefono: "",
  sabe_leer_escribir: "Sí",
  talla_pantalon: "",
  talla_camisa: "",
  institucion_educativa: "",
  nivel_educativo: "",
  ano_ingreso: "",
  ano_finalizacion: "",
  observaciones: "",
  concepto_final: "aplazado" as Entrevista["concepto_final"],
  entrevistador: "",
  fecha_entrevista: "",
}

// Campo de texto reutilizable.
function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default function Entrevistas() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [entrevistas, setEntrevistas] = useState<Entrevista[]>([])
  const [hojas, setHojas] = useState<HojaDeVida[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState<Entrevista | null>(null)
  // Si esta definido, el dialogo edita esa entrevista en vez de crear una nueva.
  const [editingId, setEditingId] = useState<string | null>(null)

  // Candidato seleccionado (solo hojas de vida aceptadas).
  const [candidato, setCandidato] = useState<HojaDeVida | null>(null)
  const [candidatoSearch, setCandidatoSearch] = useState("")
  const [form, setForm] = useState({ ...initialForm })
  const [experiencias, setExperiencias] = useState<ExperienciaLaboral[]>([emptyExperiencia()])

  const setField = (k: keyof typeof initialForm, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const loadData = async () => {
    setLoading(true)
    const [entRes, hvRes] = await Promise.all([
      getEntrevistas(selectedEmpresaId),
      getHojasVida(selectedEmpresaId),
    ])
    setEntrevistas(entRes.success ? entRes.data : [])
    // Solo hojas de vida ACEPTADAS pueden entrevistarse.
    setHojas(hvRes.success ? hvRes.data.filter((h) => h.estado === "aceptado") : [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const resetForm = () => {
    setCandidato(null)
    setCandidatoSearch("")
    setForm({ ...initialForm })
    setExperiencias([emptyExperiencia()])
    setEditingId(null)
  }

  // Carga una entrevista existente en el formulario para editarla.
  const handleEdit = (e: Entrevista) => {
    setEditingId(e.id)
    // Candidato vinculado (puede no existir ya en hojas de vida; reconstruimos
    // uno minimo a partir de los datos guardados para mostrar el encabezado).
    const hoja = hojas.find((h) => h.id === e.hoja_vida_id)
    setCandidato(
      hoja ||
        ({
          id: e.hoja_vida_id || "",
          nombre_candidato: e.nombre_candidato,
          cedula: e.cedula,
        } as HojaDeVida),
    )
    setForm({
      nombre_candidato: e.nombre_candidato || "",
      cedula: e.cedula || "",
      correo: e.correo || "",
      telefono: e.telefono || "",
      edad: e.edad || "",
      fecha_nacimiento: e.fecha_nacimiento || "",
      lugar_nacimiento: e.lugar_nacimiento || "",
      procedencia: e.procedencia || "",
      direccion: e.direccion || "",
      contacto_emergencia_nombre: e.contacto_emergencia_nombre || "",
      contacto_emergencia_parentesco: e.contacto_emergencia_parentesco || "",
      contacto_emergencia_telefono: e.contacto_emergencia_telefono || "",
      sabe_leer_escribir: e.sabe_leer_escribir || "Sí",
      talla_pantalon: e.talla_pantalon || "",
      talla_camisa: e.talla_camisa || "",
      institucion_educativa: e.institucion_educativa || "",
      nivel_educativo: e.nivel_educativo || "",
      ano_ingreso: e.ano_ingreso || "",
      ano_finalizacion: e.ano_finalizacion || "",
      observaciones: e.observaciones || "",
      concepto_final: e.concepto_final,
      entrevistador: e.entrevistador || "",
      fecha_entrevista: e.fecha_entrevista || "",
    })
    setExperiencias(
      e.experiencia_laboral && e.experiencia_laboral.length > 0
        ? e.experiencia_laboral.map((x) => ({ ...emptyExperiencia(), ...x }))
        : [emptyExperiencia()],
    )
    setOpen(true)
  }

  // Al elegir candidato, prellenamos los datos disponibles desde la hoja de vida.
  const selectCandidato = (h: HojaDeVida) => {
    setCandidato(h)
    setForm((prev) => ({
      ...prev,
      nombre_candidato: h.nombre_candidato,
      cedula: h.cedula || "",
      correo: h.correo || "",
      telefono: h.telefono || "",
    }))
  }

  // Hojas de vida aceptadas que coinciden con la busqueda (cedula o nombre).
  const candidatosFiltrados = useMemo(() => {
    const q = candidatoSearch.trim().toLowerCase()
    if (!q) return hojas.slice(0, 25)
    return hojas
      .filter(
        (h) =>
          h.nombre_candidato.toLowerCase().includes(q) ||
          (h.cedula?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 25)
  }, [hojas, candidatoSearch])

  const updateExperiencia = (idx: number, k: keyof ExperienciaLaboral, v: string) =>
    setExperiencias((prev) => prev.map((e, i) => (i === idx ? { ...e, [k]: v } : e)))

  const addExperiencia = () => setExperiencias((prev) => [...prev, emptyExperiencia()])
  const removeExperiencia = (idx: number) =>
    setExperiencias((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))

  const handleSave = async () => {
    if (!candidato) {
      toast({ title: "Falta el candidato", description: "Selecciona una hoja de vida aceptada." })
      return
    }
    if (!form.nombre_candidato.trim()) {
      toast({ title: "Falta el nombre", description: "El nombre del candidato es obligatorio." })
      return
    }

    setSaving(true)
    try {
      // Descartamos filas de experiencia totalmente vacias.
      const experienciaLimpia = experiencias.filter(
        (e) => e.empresa.trim() || e.cargo.trim() || e.funciones.trim(),
      )
      const payload = {
        ...form,
        hoja_vida_id: candidato.id || null,
        experiencia_laboral: experienciaLimpia,
        fecha_entrevista: form.fecha_entrevista || null,
      }
      const result = editingId
        ? await updateEntrevista(editingId, payload)
        : await createEntrevista(payload, selectedEmpresaId)

      if (result.success) {
        toast({ title: editingId ? "Entrevista actualizada" : "Entrevista guardada" })
        setOpen(false)
        resetForm()
        loadData()
      } else {
        toast({ title: "Error", description: result.message || "No se pudo guardar la entrevista." })
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "No se pudo guardar la entrevista." })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta entrevista? Esta acción no se puede deshacer.")) return
    const result = await deleteEntrevista(id)
    if (result.success) {
      toast({ title: "Entrevista eliminada" })
      loadData()
    } else {
      toast({ title: "Error", description: result.message || "No se pudo eliminar." })
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entrevistas
    return entrevistas.filter(
      (e) =>
        e.nombre_candidato.toLowerCase().includes(q) ||
        (e.cedula?.toLowerCase().includes(q) ?? false),
    )
  }, [entrevistas, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileCheck className="h-6 w-6 text-primary" />
            Entrevistas
          </h1>
          <p className="text-sm text-muted-foreground">
            Registra entrevistas estructuradas para candidatos con hoja de vida aceptada.
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
              Nueva entrevista
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-3xl max-h-[90vh] overflow-y-auto"
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar entrevista" : "Nueva entrevista"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Selector de candidato (solo hojas de vida aceptadas) */}
              <div className="space-y-1.5">
                <Label>
                  Candidato (cédula o nombre) <span className="text-destructive">*</span>
                </Label>
                {candidato ? (
                  <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                    <div className="text-sm">
                      <span className="font-medium text-foreground">{candidato.nombre_candidato}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {candidato.cedula || "sin cédula"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCandidato(null)
                        setCandidatoSearch("")
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
                        placeholder="Buscar por cédula o nombre..."
                        value={candidatoSearch}
                        onChange={(e) => setCandidatoSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                      {candidatosFiltrados.length === 0 ? (
                        <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                          No hay hojas de vida aceptadas que coincidan.
                        </p>
                      ) : (
                        candidatosFiltrados.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => selectCandidato(h)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <span>
                              <span className="font-medium text-foreground">{h.nombre_candidato}</span>
                              <span className="text-muted-foreground">
                                {" "}
                                · {h.cedula || "sin cédula"}
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Datos de la entrevista */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Datos de la entrevista</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Entrevistador" value={form.entrevistador} onChange={(v) => setField("entrevistador", v)} />
                  <Field label="Fecha de entrevista" type="date" value={form.fecha_entrevista} onChange={(v) => setField("fecha_entrevista", v)} />
                </div>
              </section>

              {/* Datos personales */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Datos personales</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Nombre del candidato" required value={form.nombre_candidato} onChange={(v) => setField("nombre_candidato", v)} />
                  <Field label="Cédula" value={form.cedula} onChange={(v) => setField("cedula", v)} />
                  <Field label="Correo" value={form.correo} onChange={(v) => setField("correo", v)} />
                  <Field label="Teléfono" value={form.telefono} onChange={(v) => setField("telefono", v)} />
                  <Field label="Edad" value={form.edad} onChange={(v) => setField("edad", v)} />
                  <Field label="Fecha de nacimiento" value={form.fecha_nacimiento} onChange={(v) => setField("fecha_nacimiento", v)} />
                  <Field label="Lugar de nacimiento" value={form.lugar_nacimiento} onChange={(v) => setField("lugar_nacimiento", v)} />
                  <Field label="Procedencia" value={form.procedencia} onChange={(v) => setField("procedencia", v)} />
                  <Field label="Dirección" value={form.direccion} onChange={(v) => setField("direccion", v)} />
                  <div className="space-y-1.5">
                    <Label>¿Sabe leer y escribir?</Label>
                    <Select value={form.sabe_leer_escribir} onValueChange={(v) => setField("sabe_leer_escribir", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Sí">Sí</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Field label="Talla pantalón" value={form.talla_pantalon} onChange={(v) => setField("talla_pantalon", v)} />
                  <Field label="Talla camisa" value={form.talla_camisa} onChange={(v) => setField("talla_camisa", v)} />
                </div>
              </section>

              {/* Contacto de emergencia */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Contacto de emergencia</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Nombre" value={form.contacto_emergencia_nombre} onChange={(v) => setField("contacto_emergencia_nombre", v)} />
                  <Field label="Parentesco" value={form.contacto_emergencia_parentesco} onChange={(v) => setField("contacto_emergencia_parentesco", v)} />
                  <Field label="Teléfono" value={form.contacto_emergencia_telefono} onChange={(v) => setField("contacto_emergencia_telefono", v)} />
                </div>
              </section>

              {/* Educacion */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Educación</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Institución educativa" value={form.institucion_educativa} onChange={(v) => setField("institucion_educativa", v)} />
                  <Field label="Nivel educativo" value={form.nivel_educativo} onChange={(v) => setField("nivel_educativo", v)} />
                  <Field label="Año de ingreso" value={form.ano_ingreso} onChange={(v) => setField("ano_ingreso", v)} />
                  <Field label="Año de finalización" value={form.ano_finalizacion} onChange={(v) => setField("ano_finalizacion", v)} />
                </div>
              </section>

              {/* Experiencia laboral */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Experiencia laboral</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addExperiencia}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Agregar
                  </Button>
                </div>
                {experiencias.map((exp, idx) => (
                  <div key={idx} className="space-y-3 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Experiencia {idx + 1}
                      </span>
                      {experiencias.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeExperiencia(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Empresa</Label>
                        <Input value={exp.empresa} onChange={(e) => updateExperiencia(idx, "empresa", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Cargo</Label>
                        <Input value={exp.cargo} onChange={(e) => updateExperiencia(idx, "cargo", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Fecha inicio</Label>
                        <Input value={exp.fecha_inicio} onChange={(e) => updateExperiencia(idx, "fecha_inicio", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Fecha fin</Label>
                        <Input value={exp.fecha_fin} onChange={(e) => updateExperiencia(idx, "fecha_fin", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Jefe inmediato</Label>
                        <Input value={exp.jefe_nombre} onChange={(e) => updateExperiencia(idx, "jefe_nombre", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Teléfono jefe</Label>
                        <Input value={exp.jefe_telefono} onChange={(e) => updateExperiencia(idx, "jefe_telefono", e.target.value)} />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Motivo de retiro</Label>
                        <Input value={exp.motivo_retiro} onChange={(e) => updateExperiencia(idx, "motivo_retiro", e.target.value)} />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Funciones</Label>
                        <Textarea
                          rows={2}
                          value={exp.funciones}
                          onChange={(e) => updateExperiencia(idx, "funciones", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </section>

              {/* Concepto del entrevistador */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Concepto del entrevistador</h3>
                <div className="space-y-1.5">
                  <Label>Observaciones</Label>
                  <Textarea
                    rows={4}
                    value={form.observaciones}
                    onChange={(e) => setField("observaciones", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:max-w-xs">
                  <Label>Concepto final</Label>
                  <Select
                    value={form.concepto_final}
                    onValueChange={(v) => setField("concepto_final", v as Entrevista["concepto_final"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apto">Apto</SelectItem>
                      <SelectItem value="no_apto">No apto</SelectItem>
                      <SelectItem value="aplazado">Aplazado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saving
                    ? "Guardando..."
                    : editingId
                      ? "Actualizar entrevista"
                      : "Guardar entrevista"}
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
              <TableHead>Candidato</TableHead>
              <TableHead>Cédula</TableHead>
              <TableHead>Entrevistador</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No hay entrevistas registradas.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.nombre_candidato}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.cedula || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.entrevistador || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.fecha_entrevista || "—"}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${CONCEPTO_BADGE[e.concepto_final]}`}
                    >
                      {CONCEPTO_LABEL[e.concepto_final]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setViewing(e)} title="Ver detalle">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleEdit(e)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
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

      {/* Dialogo de detalle (solo lectura) */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Entrevista — {viewing?.nombre_candidato}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-5 text-sm">
              <DetailGroup title="Datos personales">
                <Detail label="Cédula" value={viewing.cedula} />
                <Detail label="Correo" value={viewing.correo} />
                <Detail label="Teléfono" value={viewing.telefono} />
                <Detail label="Edad" value={viewing.edad} />
                <Detail label="Fecha de nacimiento" value={viewing.fecha_nacimiento} />
                <Detail label="Lugar de nacimiento" value={viewing.lugar_nacimiento} />
                <Detail label="Procedencia" value={viewing.procedencia} />
                <Detail label="Dirección" value={viewing.direccion} />
                <Detail label="¿Sabe leer y escribir?" value={viewing.sabe_leer_escribir} />
                <Detail label="Talla pantalón" value={viewing.talla_pantalon} />
                <Detail label="Talla camisa" value={viewing.talla_camisa} />
              </DetailGroup>

              <DetailGroup title="Contacto de emergencia">
                <Detail label="Nombre" value={viewing.contacto_emergencia_nombre} />
                <Detail label="Parentesco" value={viewing.contacto_emergencia_parentesco} />
                <Detail label="Teléfono" value={viewing.contacto_emergencia_telefono} />
              </DetailGroup>

              <DetailGroup title="Educación">
                <Detail label="Institución" value={viewing.institucion_educativa} />
                <Detail label="Nivel educativo" value={viewing.nivel_educativo} />
                <Detail label="Año de ingreso" value={viewing.ano_ingreso} />
                <Detail label="Año de finalización" value={viewing.ano_finalizacion} />
              </DetailGroup>

              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Experiencia laboral</h4>
                {viewing.experiencia_laboral.length === 0 ? (
                  <p className="text-muted-foreground">Sin experiencia registrada.</p>
                ) : (
                  viewing.experiencia_laboral.map((exp, i) => (
                    <div key={i} className="rounded-md border border-border p-3">
                      <p className="font-medium text-foreground">
                        {exp.empresa || "—"} {exp.cargo ? `· ${exp.cargo}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {exp.fecha_inicio} {exp.fecha_fin ? `– ${exp.fecha_fin}` : ""}
                      </p>
                      {exp.funciones && <p className="mt-1 text-muted-foreground">{exp.funciones}</p>}
                      {exp.motivo_retiro && (
                        <p className="mt-1 text-muted-foreground">
                          <span className="font-medium">Motivo retiro:</span> {exp.motivo_retiro}
                        </p>
                      )}
                      {(exp.jefe_nombre || exp.jefe_telefono) && (
                        <p className="mt-1 text-muted-foreground">
                          <span className="font-medium">Jefe:</span> {exp.jefe_nombre} {exp.jefe_telefono}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Concepto del entrevistador</h4>
                {viewing.observaciones && (
                  <p className="text-muted-foreground leading-relaxed">{viewing.observaciones}</p>
                )}
                <span
                  className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${CONCEPTO_BADGE[viewing.concepto_final]}`}
                >
                  {CONCEPTO_LABEL[viewing.concepto_final]}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-foreground">{title}</h4>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground">{value || "—"}</span>
    </div>
  )
}
