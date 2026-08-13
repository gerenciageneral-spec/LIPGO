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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import {
  getDotacionEPP,
  createDotacionEPP,
  updateDotacionEPP,
  deleteDotacionEPP,
  getColaboradoresFromHeadcount,
} from "@/lib/rrhh-actions"
import { Trash2, Edit2, Plus, Paperclip, ExternalLink, Loader2 } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
// Cliente de navegador: sube el PDF directo a Supabase con la URL firmada que
// emite /api/epp/upload, sin pasar por la función serverless y su tope de 4,5 MB.
import { supabase } from "@/lib/supabase"

interface Colaborador {
  id: string
  nombre: string
  identificacion: string
}

interface DotacionEPP {
  id: string
  colaborador_id: string
  fecha_entrega: string
  tipo_item: string
  talla: string
  tallapant: string
  cantidad: number
  estado: string
  observaciones: string
  evidenciaepp?: string | null
}

export default function DotacionEPP() {
  const { selectedEmpresaId } = useAuth()
  const [dotaciones, setDotaciones] = useState<DotacionEPP[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [evidenciaPathname, setEvidenciaPathname] = useState<string>("")
  const [formData, setFormData] = useState({
    colaborador_id: "",
    fecha_entrega: "",
    tipo_item: "",
    talla: "",
    tallapant: "",
    cantidad: "1",
    estado: "entregado",
    observaciones: "",
  })
  const { toast } = useToast()

  const loadData = async () => {
    setLoading(true)
    const [dotacionesResult, colaboradoresResult] = await Promise.all([
      getDotacionEPP(selectedEmpresaId),
      getColaboradoresFromHeadcount(selectedEmpresaId),
    ])

    if (dotacionesResult.success) {
      setDotaciones(dotacionesResult.data)
    }
    if (colaboradoresResult.success) {
      setColaboradores(colaboradoresResult.data)
    }
    setLoading(false)
  }

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
  }

  useEffect(() => {
    if (selectedEmpresaId) {
      loadData()
    }
  }, [selectedEmpresaId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.colaborador_id || !formData.fecha_entrega) {
      toast({
        title: "Error",
        description: "Colaborador y fecha de entrega son requeridos",
        variant: "destructive",
      })
      return
    }

    const dataToSave = {
      ...formData,
      cantidad: Number(formData.cantidad),
      evidenciaepp: evidenciaPathname || null,
    }

    if (editingId) {
      const result = await updateDotacionEPP(editingId, dataToSave)
      if (result.success) {
        toast({ title: "Éxito", description: "Dotación actualizada" })
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
      const result = await createDotacionEPP(dataToSave, selectedEmpresaId)
      if (result.success) {
        toast({ title: "Éxito", description: "Dotación creada" })
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
  }

  const handleEdit = (dotacion: DotacionEPP) => {
    setFormData({
      colaborador_id: dotacion.colaborador_id,
      fecha_entrega: dotacion.fecha_entrega,
      tipo_item: dotacion.tipo_item,
      talla: dotacion.talla || "",
      tallapant: dotacion.tallapant || "",
      cantidad: dotacion.cantidad.toString(),
      estado: dotacion.estado,
      observaciones: dotacion.observaciones,
    })
    setEvidenciaPathname(dotacion.evidenciaepp || "")
    setEditingId(dotacion.id)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de que desea eliminar esta dotación?")) return

    const result = await deleteDotacionEPP(id)
    if (result.success) {
      toast({ title: "Éxito", description: "Dotación eliminada" })
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
      colaborador_id: "",
      fecha_entrega: "",
      tipo_item: "",
      talla: "",
      tallapant: "",
      cantidad: "1",
      estado: "entregado",
      observaciones: "",
    })
    setEvidenciaPathname("")
    setEditingId(null)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== "application/pdf") {
      toast({ title: "Error", description: "Solo se permiten archivos PDF", variant: "destructive" })
      return
    }
    // Tope de seguridad, muy por encima de lo que pesa una evidencia normal.
    // El límite real lo pone el bucket de Supabase (`file_size_limit`); esto
    // solo evita que alguien arrastre un archivo enorme por error y espere.
    const MAX_MB = 50
    if (file.size > MAX_MB * 1024 * 1024) {
      toast({
        title: "El archivo es muy pesado",
        description: `Pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_MB} MB.`,
        variant: "destructive",
      })
      e.target.value = ""
      return
    }
    setUploadingFile(true)
    try {
      // 1) El servidor emite una URL FIRMADA. El archivo NO viaja en esta
      //    petición: solo el nombre.
      //
      //    Antes el PDF se mandaba dentro de la petición a la función
      //    serverless, cuyo cuerpo se corta alrededor de 4,5 MB — un límite de
      //    la plataforma, no configurable. Un PDF escaneado lo pasa fácil, y
      //    cuando pasaba, el archivo ni llegaba al servidor: la respuesta no era
      //    JSON y el error salía como un genérico sin causa.
      const resFirma = await fetch("/api/epp/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: file.name }),
      })
      const cuerpoFirma = await resFirma.text()
      let firma: any = null
      try {
        firma = cuerpoFirma ? JSON.parse(cuerpoFirma) : null
      } catch {
        firma = null
      }

      if (!resFirma.ok || !firma?.token || !firma?.path) {
        console.error("[v0] epp upload firma:", resFirma.status, cuerpoFirma)
        toast({
          title: `No se pudo preparar la subida (${resFirma.status})`,
          description: firma?.error || cuerpoFirma.slice(0, 200) || "Respuesta inesperada del servidor.",
          variant: "destructive",
        })
        return
      }

      // 2) El archivo va del navegador DIRECTO a Supabase Storage. El tope de la
      //    función serverless deja de aplicar; el único límite es el del bucket.
      const { error: errSubida } = await supabase.storage
        .from("archivos")
        .uploadToSignedUrl(firma.path, firma.token, file, {
          contentType: "application/pdf",
        })

      if (errSubida) {
        console.error("[v0] epp upload a Supabase:", errSubida)
        toast({
          title: "Error al subir el archivo",
          description: errSubida.message || "El almacenamiento rechazó el archivo.",
          variant: "destructive",
        })
        return
      }

      setEvidenciaPathname(firma.url)
      toast({ title: "Archivo subido", description: "El PDF fue cargado correctamente" })
    } catch (err: any) {
      // Aquí solo deberían llegar fallos de red reales.
      console.error("[v0] epp upload excepción:", err)
      toast({
        title: "Error de conexión",
        description: err?.message || "No se pudo contactar al servidor.",
        variant: "destructive",
      })
    } finally {
      setUploadingFile(false)
      e.target.value = ""
    }
  }

  const calculateDiasParaRenovar = (fechaEntrega: string): number => {
    // La dotación de EPP se renueva cada 4 meses: la fecha de renovación es
    // la fecha de entrega + 4 meses, y los días para renovar son los que
    // faltan desde hoy hasta esa fecha (negativo = renovación vencida).
    const entrega = new Date(fechaEntrega)
    const fechaRenovacion = new Date(entrega)
    fechaRenovacion.setMonth(fechaRenovacion.getMonth() + 4)
    const hoy = new Date()
    return Math.ceil(
      (fechaRenovacion.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24),
    )
  }

  const getColorForDias = (dias: number): string => {
    if (dias <= 10) return "bg-red-100 text-red-800"
    if (dias <= 20) return "bg-yellow-100 text-yellow-800"
    return "bg-green-100 text-green-800"
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Dotación de EPP</h2>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nuevo Registro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar Dotación" : "Nueva Dotación"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                  <Label htmlFor="fecha_entrega">Fecha Entrega *</Label>
                  <Input
                    id="fecha_entrega"
                    type="date"
                    value={formData.fecha_entrega}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        fecha_entrega: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="tipo_item">Tipo de Item</Label>
                  <select
                    id="tipo_item"
                    value={formData.tipo_item}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tipo_item: e.target.value,
                        talla: "",
                        tallapant: "",
                      })
                    }
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Seleccionar tipo</option>
                    <option value="dotacion_completa">Dotacion Completa</option>
                    <option value="camisa">Camisa</option>
                    <option value="pantalon">Pantalon</option>
                    <option value="guantes">Guantes</option>
                    <option value="botas">Botas</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                {(formData.tipo_item === "dotacion_completa" || formData.tipo_item === "camisa") && (
                  <div>
                    <Label htmlFor="talla">Talla Camisa</Label>
                    <select
                      id="talla"
                      value={formData.talla}
                      onChange={(e) =>
                        setFormData({ ...formData, talla: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="">Seleccionar talla</option>
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                    </select>
                  </div>
                )}
                {(formData.tipo_item === "dotacion_completa" || formData.tipo_item === "pantalon") && (
                  <div>
                    <Label htmlFor="tallapant">Talla Pantalon</Label>
                    <Input
                      id="tallapant"
                      type="number"
                      placeholder="Ej: 32"
                      value={formData.tallapant}
                      onChange={(e) =>
                        setFormData({ ...formData, tallapant: e.target.value })
                      }
                    />
                  </div>
                )}
                {!["dotacion_completa", "camisa", "pantalon"].includes(formData.tipo_item) && formData.tipo_item && (
                  <div>
                    <Label htmlFor="talla">Talla</Label>
                    <Input
                      id="talla"
                      value={formData.talla}
                      onChange={(e) =>
                        setFormData({ ...formData, talla: e.target.value })
                      }
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="cantidad">Cantidad</Label>
                  <Input
                    id="cantidad"
                    type="number"
                    min="1"
                    value={formData.cantidad}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        cantidad: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="estado">Estado</Label>
                  <select
                    id="estado"
                    value={formData.estado}
                    onChange={(e) =>
                      setFormData({ ...formData, estado: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="entregado">Entregado</option>
                    <option value="devuelto">Devuelto</option>
                    <option value="dañado">Dañado</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <Label>Evidencia (PDF)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border rounded-md text-sm hover:bg-muted transition-colors">
                      {uploadingFile ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Paperclip className="w-4 h-4" />
                      )}
                      {uploadingFile ? "Subiendo..." : evidenciaPathname ? "Cambiar PDF" : "Adjuntar PDF"}
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={uploadingFile}
                      />
                    </label>
                    {evidenciaPathname && (
                      <a
                        href={evidenciaPathname}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Ver adjunto
                      </a>
                    )}
                    {evidenciaPathname && (
                      <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {evidenciaPathname.split("/").pop()}
                      </span>
                    )}
                  </div>
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
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingId ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando...</div>
      ) : dotaciones.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No hay dotaciones registradas
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Tipo de Item</TableHead>
                <TableHead>Talla Camisa</TableHead>
                <TableHead>Talla Pantalon</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Fecha Entrega</TableHead>
                <TableHead>Días para Renovar</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dotaciones.map((dotacion) => {
                const colaborador = colaboradores.find(
                  (c) => c.identificacion === dotacion.colaborador_id,
                )
                return (
                  <TableRow key={dotacion.id}>
                    <TableCell className="font-medium">
                      {colaborador?.nombre || "-"}
                    </TableCell>
                    <TableCell>{dotacion.tipo_item || "-"}</TableCell>
                    <TableCell>{dotacion.talla || "-"}</TableCell>
                    <TableCell>{dotacion.tallapant || "-"}</TableCell>
                    <TableCell>{dotacion.cantidad}</TableCell>
                    <TableCell>{dotacion.fecha_entrega}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getColorForDias(calculateDiasParaRenovar(dotacion.fecha_entrega))}`}
                      >
                        {calculateDiasParaRenovar(dotacion.fecha_entrega)} días
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          dotacion.estado === "entregado"
                            ? "bg-green-100 text-green-800"
                            : dotacion.estado === "devuelto"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {dotacion.estado}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {dotacion.evidenciaepp && (
                          <a
                            href={dotacion.evidenciaepp}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="sm" title="Ver evidencia PDF">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(dotacion)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(dotacion.id)}
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
