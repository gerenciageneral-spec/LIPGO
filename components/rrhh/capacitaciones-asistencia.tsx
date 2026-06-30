"use client"

import React from "react"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
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
  getCapacitacionesAsistencia,
  createCapacitacionAsistencia,
  updateCapacitacionAsistencia,
  deleteCapacitacionAsistencia,
  getCapacitaciones,
  getColaboradoresFromHeadcount,
} from "@/lib/rrhh-actions"
import {
  Trash2,
  Edit2,
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSignature,
  Users,
  Search,
  ArrowLeft,
  ArrowRight,
} from "lucide-react"
import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/rrhh/signature-pad"
import { useAuth } from "@/components/auth-provider"

interface Colaborador {
  id: string
  nombre: string
  identificacion: string
}

interface Capacitacion {
  id: string
  tema: string
  fecha: string
}

interface CapacitacionAsistencia {
  id: string
  capacitacion_id: string
  colaborador_id: string
  asistio: boolean
  resultado: string
  observaciones: string
  // URL publica de la imagen de la firma del colaborador, almacenada
  // en el bucket `archivos/firmas/`. Es opcional: cuando se edita un
  // registro antiguo puede venir null.
  firmaurl: string | null
}

export default function CapacitacionesAsistencia() {
  const [asistencias, setAsistencias] = useState<CapacitacionAsistencia[]>([])
  const [capacitaciones, setCapacitaciones] = useState<Capacitacion[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    capacitacion_id: "",
    colaborador_id: "",
    asistio: true,
    resultado: "",
    observaciones: "",
    firmaurl: "",
  })
  // Ref al pad de firma para poder leer el blob al guardar y para
  // limpiarlo al cambiar de modo crear/editar.
  const signatureRef = useRef<SignaturePadHandle | null>(null)
  // Estado de subida de la firma al bucket `archivos/firmas/`.
  // Mientras esta en true bloqueamos el submit para no guardar antes
  // de obtener la URL publica.
  const [submitting, setSubmitting] = useState(false)

  // ----- Registro masivo (planilla) -----
  // Estado del dialogo de registro masivo. El flujo tiene dos pasos:
  //   step "select"  -> elige capacitacion y selecciona N colaboradores
  //   step "sign"    -> aparece una planilla con un pad de firma por
  //                     colaborador y se guardan todos de una sola vez
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkStep, setBulkStep] = useState<"select" | "sign">("select")
  const [bulkCapacitacionId, setBulkCapacitacionId] = useState("")
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(
    new Set(),
  )
  const [bulkSearch, setBulkSearch] = useState("")
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  // Refs para los pads de firma de cada colaborador en el step "sign".
  // Usamos un objeto plano indexado por `identificacion` porque cada
  // pad necesita un handle independiente para leer su blob al guardar.
  const bulkSignaturesRef = useRef<Record<string, SignaturePadHandle | null>>(
    {},
  )
  // Por colaborador guardamos si "asistio" y observaciones opcionales.
  // Default: todos asistieron, sin observaciones.
  const [bulkRows, setBulkRows] = useState<
    Record<string, { asistio: boolean; resultado: string }>
  >({})

  const { toast } = useToast()
  // Empresa actualmente seleccionada en el filtro dinamico de la
  // barra superior. La usamos para acotar el listado de colaboradores
  // (headcount) tanto en Registro de Asistencia individual como en
  // Registro Masivo: si el usuario cambia de empresa, debemos volver
  // a consultar `headcount` filtrando por esa empresa para que las
  // listas de colaboradores reflejen el contexto activo.
  const { selectedEmpresaId } = useAuth()

  const loadData = async () => {
    setLoading(true)
    const [asistenciasResult, capacitacionesResult, colaboradoresResult] =
      await Promise.all([
        getCapacitacionesAsistencia(undefined, selectedEmpresaId ?? null),
        // Filtramos las capacitaciones por la empresa seleccionada para
        // que el desplegable de "Capacitación" (registro individual y
        // masivo) solo muestre las de la empresa de la sesion actual.
        getCapacitaciones(selectedEmpresaId ?? null),
        // Pasamos `selectedEmpresaId` para que el server action filtre
        // headcount por empresa elegida en el filtro dinamico. Si es
        // null, el action cae al empresa_id de la sesion como antes.
        getColaboradoresFromHeadcount(selectedEmpresaId ?? null),
      ])

    if (asistenciasResult.success) {
      setAsistencias(asistenciasResult.data)
    }
    if (capacitacionesResult.success) {
      setCapacitaciones(capacitacionesResult.data)
    }
    if (colaboradoresResult.success) {
      setColaboradores(colaboradoresResult.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // Recargamos el headcount (y el resto del payload) cada vez que
    // cambia la empresa elegida en el filtro dinamico. Sin este efecto
    // el listado de colaboradores quedaba pegado a la empresa de la
    // sesion inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.capacitacion_id || !formData.colaborador_id) {
      toast({
        title: "Error",
        description: "Capacitación y colaborador son requeridos",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      // Si el usuario dibujo una firma nueva en el pad, la subimos al
      // bucket `archivos/firmas/` y reemplazamos `firmaurl`. Si esta
      // editando un registro y NO toco el pad, conservamos la URL
      // anterior (formData.firmaurl).
      let firmaurl = formData.firmaurl
      if (signatureRef.current && !signatureRef.current.isEmpty()) {
        const blob = await signatureRef.current.toBlob()
        if (blob) {
          const fd = new FormData()
          fd.append("file", blob, "firma.png")
          const res = await fetch("/api/capacitaciones/upload-firma", {
            method: "POST",
            body: fd,
          })
          const data = await res.json()
          if (!res.ok || !data?.url) {
            throw new Error(data?.error || "No se pudo subir la firma")
          }
          firmaurl = data.url
        }
      }

      // Enviamos null para no guardar cadena vacia en la DB cuando no
      // hay firma.
      const payload = { ...formData, firmaurl: firmaurl || null }

      if (editingId) {
        const result = await updateCapacitacionAsistencia(editingId, payload)
        if (result.success) {
          toast({ title: "Éxito", description: "Asistencia actualizada" })
          loadData()
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
        const result = await createCapacitacionAsistencia(payload, selectedEmpresaId ?? null)
        if (result.success) {
          toast({ title: "Éxito", description: "Asistencia registrada" })
          loadData()
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
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Error al guardar la asistencia",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (asistencia: CapacitacionAsistencia) => {
    setFormData({
      capacitacion_id: asistencia.capacitacion_id,
      colaborador_id: asistencia.colaborador_id,
      asistio: asistencia.asistio,
      resultado: asistencia.resultado,
      observaciones: asistencia.observaciones,
      firmaurl: asistencia.firmaurl ?? "",
    })
    setEditingId(asistencia.id)
    setOpen(true)
    // Limpiamos el pad para que no quede el trazo del registro
    // anterior; la firma persistida se muestra como preview aparte.
    signatureRef.current?.clear()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de que desea eliminar este registro?")) return

    const result = await deleteCapacitacionAsistencia(id)
    if (result.success) {
      toast({ title: "Éxito", description: "Registro eliminado" })
      loadData()
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
      capacitacion_id: "",
      colaborador_id: "",
      asistio: true,
      resultado: "",
      observaciones: "",
      firmaurl: "",
    })
    setEditingId(null)
    signatureRef.current?.clear()
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm()
    }
    setOpen(newOpen)
  }

  // ---- Handlers registro masivo ----

  // Reset completo del wizard masivo. Se invoca al cerrar el dialogo.
  const resetBulk = () => {
    setBulkStep("select")
    setBulkCapacitacionId("")
    setBulkSelectedIds(new Set())
    setBulkSearch("")
    setBulkRows({})
    bulkSignaturesRef.current = {}
  }

  const handleBulkOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetBulk()
    setBulkOpen(newOpen)
  }

  // Toggle de seleccion en el step "select".
  const toggleBulkSelected = (identificacion: string) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(identificacion)) next.delete(identificacion)
      else next.add(identificacion)
      return next
    })
  }

  // Avanzar al step de firma. Inicializa los rows con valores por
  // defecto (asistio=true, resultado=""). Validamos que se haya
  // elegido capacitacion y al menos un colaborador.
  const goToSignStep = () => {
    if (!bulkCapacitacionId) {
      toast({
        title: "Error",
        description: "Selecciona una capacitación",
        variant: "destructive",
      })
      return
    }
    if (bulkSelectedIds.size === 0) {
      toast({
        title: "Error",
        description: "Selecciona al menos un colaborador",
        variant: "destructive",
      })
      return
    }
    const initial: Record<string, { asistio: boolean; resultado: string }> = {}
    bulkSelectedIds.forEach((id) => {
      initial[id] = { asistio: true, resultado: "" }
    })
    setBulkRows(initial)
    bulkSignaturesRef.current = {}
    setBulkStep("sign")
  }

  // Guarda en bloque todos los registros: por cada colaborador
  // seleccionado sube su firma (si firmo) y crea el registro de
  // asistencia. Un fallo individual NO aborta los demas: acumulamos
  // resultados y mostramos un resumen al final.
  const handleBulkSubmit = async () => {
    // Validacion dura: la planilla solo se guarda si TODOS los
    // colaboradores seleccionados tienen firma. Recorremos los pads
    // antes de empezar a subir nada, asi evitamos crear registros
    // parciales si falta alguien por firmar. Construimos la lista de
    // nombres faltantes para que el toast indique exactamente quienes
    // son y el supervisor pueda completarlas.
    const ids = Array.from(bulkSelectedIds)

    // Validacion dura #1: resultado obligatorio. Cada colaborador
    // seleccionado debe tener un resultado (Aprobado / Reprobado /
    // Pendiente) elegido en el select. Si el row aun no se inicializo
    // (caso defensivo) tambien lo consideramos sin resultado.
    const sinResultado: string[] = []
    for (const identificacion of ids) {
      const row = bulkRows[identificacion]
      if (!row || !row.resultado) {
        const colab = colaboradores.find(
          (c) => c.identificacion === identificacion,
        )
        sinResultado.push(colab?.nombre || identificacion)
      }
    }
    if (sinResultado.length > 0) {
      toast({
        title: "Falta seleccionar resultado",
        description: `Falta(n) ${sinResultado.length} resultado(s): ${sinResultado
          .slice(0, 5)
          .join(", ")}${sinResultado.length > 5 ? "…" : ""}`,
        variant: "destructive",
      })
      return
    }

    // Validacion dura #2: firma obligatoria por cada colaborador.
    const sinFirma: string[] = []
    for (const identificacion of ids) {
      const pad = bulkSignaturesRef.current[identificacion]
      if (!pad || pad.isEmpty()) {
        const colab = colaboradores.find(
          (c) => c.identificacion === identificacion,
        )
        sinFirma.push(colab?.nombre || identificacion)
      }
    }
    if (sinFirma.length > 0) {
      toast({
        title: "Faltan firmas",
        description: `Falta(n) ${sinFirma.length} firma(s): ${sinFirma
          .slice(0, 5)
          .join(", ")}${sinFirma.length > 5 ? "…" : ""}`,
        variant: "destructive",
      })
      return
    }

    setBulkSubmitting(true)
    let okCount = 0
    let failCount = 0
    try {
      for (const identificacion of ids) {
        try {
          const pad = bulkSignaturesRef.current[identificacion]
          let firmaurl: string | null = null
          // En este punto ya validamos arriba que todos los pads
          // tienen firma; aun asi mantenemos el guard porque el ref
          // podria mutar entre la validacion y la subida si el
          // componente se re-renderiza (defensivo).
          if (pad && !pad.isEmpty()) {
            const blob = await pad.toBlob()
            if (blob) {
              const fd = new FormData()
              fd.append("file", blob, "firma.png")
              const res = await fetch("/api/capacitaciones/upload-firma", {
                method: "POST",
                body: fd,
              })
              const data = await res.json()
              if (!res.ok || !data?.url) {
                throw new Error(data?.error || "No se pudo subir la firma")
              }
              firmaurl = data.url
            }
          }

          const row = bulkRows[identificacion] || {
            asistio: true,
            resultado: "",
          }
          const result = await createCapacitacionAsistencia(
            {
              capacitacion_id: bulkCapacitacionId,
              colaborador_id: identificacion,
              asistio: row.asistio,
              resultado: row.resultado,
              observaciones: "",
              firmaurl,
            },
            selectedEmpresaId ?? null,
          )
          if (result.success) okCount++
          else failCount++
        } catch (err) {
          console.error("[v0] bulk row error", identificacion, err)
          failCount++
        }
      }

      const partes: string[] = []
      if (okCount) partes.push(`${okCount} registrada(s)`)
      if (failCount) partes.push(`${failCount} con error`)
      toast({
        title: failCount ? "Registro masivo finalizado con errores" : "Éxito",
        description: partes.join(" · ") || "Sin cambios",
        variant: failCount ? "destructive" : "default",
      })
      await loadData()
      if (!failCount) {
        setBulkOpen(false)
        resetBulk()
      }
    } finally {
      setBulkSubmitting(false)
    }
  }

  // Lista filtrada por busqueda + ya registrados ocultos. Memo manual
  // pero el costo es bajo; useMemo es opcional aqui.
  const colaboradoresFiltrados = colaboradores.filter((c) => {
    const q = bulkSearch.trim().toLowerCase()
    if (!q) return true
    return (
      c.nombre.toLowerCase().includes(q) ||
      String(c.identificacion).includes(q)
    )
  })

  // IDs de colaboradores que ya tienen asistencia registrada para la
  // capacitacion seleccionada, para deshabilitar su checkbox y evitar
  // duplicados.
  const yaRegistradosSet = new Set(
    asistencias
      .filter((a) => a.capacitacion_id === bulkCapacitacionId)
      .map((a) => a.colaborador_id),
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Asistencia a Capacitaciones</h2>
        <div className="flex gap-2">
          {/* Boton de registro masivo: abre un wizard de 2 pasos
              donde el usuario selecciona varios colaboradores y
              luego firma una planilla con todos. */}
          <Button
            variant="outline"
            className="gap-2 bg-transparent"
            onClick={() => setBulkOpen(true)}
          >
            <Users className="w-4 h-4" />
            Registro Masivo
          </Button>
          <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Registrar Asistencia
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar Asistencia" : "Registrar Asistencia"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="capacitacion_id">Capacitación *</Label>
                  <select
                    id="capacitacion_id"
                    value={formData.capacitacion_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        capacitacion_id: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  >
                    <option value="">Seleccionar capacitación</option>
                    {capacitaciones.map((cap) => (
                      <option key={cap.id} value={cap.id}>
                        {cap.tema} ({cap.fecha})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="colaborador_id">Colaborador *</Label>
                  <select
                    id="colaborador_id"
                    value={formData.colaborador_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        colaborador_id: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  >
                    <option value="">Seleccionar colaborador</option>
                    {colaboradores.map((col) => (
                      <option key={col.id} value={col.identificacion}>
                        {col.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="asistio">¿Asistió?</Label>
                  <select
                    id="asistio"
                    value={formData.asistio ? "true" : "false"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        asistio: e.target.value === "true",
                      })
                    }
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="resultado">Resultado</Label>
                  <select
                    id="resultado"
                    value={formData.resultado}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        resultado: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Seleccionar resultado</option>
                    <option value="aprobado">Aprobado</option>
                    <option value="reprobado">Reprobado</option>
                    <option value="pendiente">Pendiente</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="observaciones">Observaciones</Label>
                  <textarea
                    id="observaciones"
                    value={formData.observaciones}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        observaciones: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-md"
                    rows={3}
                  />
                </div>
                {/* Firma del colaborador. Se dibuja en un canvas y al
                    guardar se sube como PNG al bucket
                    `archivos/firmas/`; la URL publica termina en
                    `capacitaciones_asistencia.firmaurl`. Si el
                    registro ya tenia firma previa la mostramos como
                    preview para que el usuario sepa que quedara
                    intacta a menos que vuelva a firmar. */}
                <div className="col-span-2">
                  <Label>Firma del colaborador</Label>
                  <SignaturePad ref={signatureRef} />
                  {editingId && formData.firmaurl ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <FileSignature className="w-3.5 h-3.5" />
                      <span>Firma actual:</span>
                      <a
                        href={formData.firmaurl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        ver
                      </a>
                      <span>(se conserva si no firma de nuevo)</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : editingId ? (
                    "Actualizar"
                  ) : (
                    "Registrar"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* ===== Dialogo de registro masivo ===== */}
      <Dialog open={bulkOpen} onOpenChange={handleBulkOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {bulkStep === "select"
                ? "Registro Masivo - Seleccionar colaboradores"
                : "Registro Masivo - Planilla de firmas"}
            </DialogTitle>
          </DialogHeader>

          {bulkStep === "select" ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="bulk_capacitacion">Capacitación *</Label>
                <select
                  id="bulk_capacitacion"
                  value={bulkCapacitacionId}
                  onChange={(e) => setBulkCapacitacionId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Seleccionar capacitación</option>
                  {capacitaciones.map((cap) => (
                    <option key={cap.id} value={cap.id}>
                      {cap.tema} ({cap.fecha})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="bulk_search">Buscar colaborador</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="bulk_search"
                    type="text"
                    placeholder="Buscar por nombre o cédula..."
                    value={bulkSearch}
                    onChange={(e) => setBulkSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border rounded-md"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {bulkSelectedIds.size} seleccionado(s) de{" "}
                  {colaboradoresFiltrados.length} mostrado(s)
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const next = new Set(bulkSelectedIds)
                      colaboradoresFiltrados.forEach((c) => {
                        if (!yaRegistradosSet.has(c.identificacion)) {
                          next.add(c.identificacion)
                        }
                      })
                      setBulkSelectedIds(next)
                    }}
                  >
                    Seleccionar todos
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkSelectedIds(new Set())}
                  >
                    Limpiar
                  </Button>
                </div>
              </div>

              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Cédula</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {colaboradoresFiltrados.map((c) => {
                      const yaRegistrado = yaRegistradosSet.has(
                        c.identificacion,
                      )
                      const checked = bulkSelectedIds.has(c.identificacion)
                      return (
                        <TableRow
                          key={c.id}
                          className={
                            yaRegistrado
                              ? "opacity-50"
                              : "cursor-pointer hover:bg-muted/50"
                          }
                          onClick={() => {
                            if (!yaRegistrado)
                              toggleBulkSelected(c.identificacion)
                          }}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={yaRegistrado}
                              onChange={() =>
                                toggleBulkSelected(c.identificacion)
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {c.identificacion}
                          </TableCell>
                          <TableCell>{c.nombre}</TableCell>
                          <TableCell>
                            {yaRegistrado ? (
                              <span className="text-xs text-muted-foreground">
                                Ya registrado
                              </span>
                            ) : (
                              <span className="text-xs text-green-600">
                                Disponible
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleBulkOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={goToSignStep}>
                  Continuar a firmas
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Step "sign": planilla con un row por colaborador,
                  cada row tiene su propio SignaturePad. */}
              <div className="text-sm text-muted-foreground">
                Cada colaborador debe firmar en su recuadro. Al guardar se
                registrará la asistencia y la firma de todos a la vez.
              </div>

              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-2">
                {Array.from(bulkSelectedIds).map((identificacion, idx) => {
                  const colab = colaboradores.find(
                    (c) => c.identificacion === identificacion,
                  )
                  const row = bulkRows[identificacion] || {
                    asistio: true,
                    resultado: "",
                  }
                  return (
                    <div
                      key={identificacion}
                      className="border rounded-lg p-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start"
                    >
                      <div className="space-y-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs text-muted-foreground">
                            #{idx + 1}
                          </span>
                          <span className="font-medium">
                            {colab?.nombre || "(sin nombre)"}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            CC {identificacion}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 items-center text-sm">
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={row.asistio}
                              onChange={(e) =>
                                setBulkRows({
                                  ...bulkRows,
                                  [identificacion]: {
                                    ...row,
                                    asistio: e.target.checked,
                                  },
                                })
                              }
                            />
                            Asistió
                          </label>
                          <select
                            value={row.resultado}
                            onChange={(e) =>
                              setBulkRows({
                                ...bulkRows,
                                [identificacion]: {
                                  ...row,
                                  resultado: e.target.value,
                                },
                              })
                            }
                            className="px-2 py-1 border rounded text-sm"
                          >
                            <option value="">Resultado…</option>
                            <option value="aprobado">Aprobado</option>
                            <option value="reprobado">Reprobado</option>
                            <option value="pendiente">Pendiente</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Firma</Label>
                        <SignaturePad
                          ref={(el) => {
                            bulkSignaturesRef.current[identificacion] = el
                          }}
                          height={120}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-between gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBulkStep("select")}
                  disabled={bulkSubmitting}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Volver
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleBulkOpenChange(false)}
                    disabled={bulkSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={handleBulkSubmit}
                    disabled={bulkSubmitting}
                  >
                    {bulkSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Guardando {bulkSelectedIds.size}…
                      </>
                    ) : (
                      <>Guardar {bulkSelectedIds.size} registros</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="text-center py-8">Cargando...</div>
      ) : asistencias.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No hay registros de asistencia
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capacitación</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Asistencia</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Observaciones</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead className="w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {asistencias.map((asistencia) => {
                const capacitacion = capacitaciones.find(
                  (c) => c.id === asistencia.capacitacion_id,
                )
                const colaborador = colaboradores.find(
                  (c) => c.identificacion === asistencia.colaborador_id,
                )
                return (
                  <TableRow key={asistencia.id}>
                    <TableCell className="font-medium">
                      {capacitacion?.tema || "-"}
                    </TableCell>
                    <TableCell>
                      {colaborador?.nombre || "-"}
                    </TableCell>
                    <TableCell>
                      {asistencia.asistio ? (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          Sí
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-600">
                          <XCircle className="w-4 h-4" />
                          No
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          asistencia.resultado === "aprobado"
                            ? "bg-green-100 text-green-800"
                            : asistencia.resultado === "reprobado"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {asistencia.resultado || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {asistencia.observaciones || "-"}
                    </TableCell>
                    <TableCell>
                      {asistencia.firmaurl ? (
                        <a
                          href={asistencia.firmaurl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver firma"
                        >
                          {/* Vista miniatura de la firma. Usamos
                              <img> nativo porque es una URL de
                              Supabase Storage variable y next/image
                              requiere whitelisting de dominios. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asistencia.firmaurl}
                            alt="Firma"
                            className="h-10 w-20 object-contain border rounded bg-white"
                          />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(asistencia)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(asistencia.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
