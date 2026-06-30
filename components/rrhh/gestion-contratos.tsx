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
  getContratos,
  createContrato,
  updateContrato,
  deleteContrato,
  getColaboradoresFromHeadcount as getColaboradores,
} from "@/lib/rrhh-actions"
import { Trash2, Edit2, Plus, Download } from "lucide-react"
import { useAuth } from "@/components/auth-provider"

interface Colaborador {
  id: string
  nombre: string
  identificacion: string
}

interface Contrato {
  id: string
  colaborador_id: string
  fecha_inicio: string
  fecha_fin: string
  fechaenvio: string
  fechafirma: string
  tipo_contrato: string
  cargo: string
  salario_base: number
  estado: string
  url_documento: string
  causaretiro?: string | null
  created_at?: string | null
}

const ESTADOS_CONTRATO = [
  { value: "creado", label: "Creado", color: "bg-blue-100 text-blue-800" },
  { value: "enviado", label: "Enviado", color: "bg-yellow-100 text-yellow-800" },
  { value: "firmado", label: "Firmado", color: "bg-green-100 text-green-800" },
  { value: "rechazado", label: "Rechazado", color: "bg-red-100 text-red-800" },
]

const TIPO_CONTRATO_LABELS: Record<string, string> = {
  indefinido: "Indefinido",
  a_termino_fijo: "A Termino Fijo",
  temporal: "Temporal",
  prueba: "Periodo de Prueba",
  obra_labor: "Obra Labor",
}

const formatCreatedAt = (iso?: string | null) => {
  if (!iso) return "-"
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso))
}

export default function GestionContratos() {
  const { selectedEmpresaId } = useAuth()
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [updatingEstado, setUpdatingEstado] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    colaborador_id: "",
    fecha_inicio: "",
    fecha_fin: "",
    fechaenvio: "",
    fechafirma: "",
    tipo_contrato: "indefinido",
    cargo: "",
    salario_base: "",
    estado: "creado",
    url_documento: "",
    causaretiro: "",
  })
  const { toast } = useToast()

  const loadData = async () => {
    setLoading(true)
    const [contratosResult, colaboradoresResult] = await Promise.all([
      getContratos(selectedEmpresaId),
      getColaboradores(selectedEmpresaId),
    ])
    if (contratosResult.success) setContratos(contratosResult.data)
    if (colaboradoresResult.success) setColaboradores(colaboradoresResult.data)
    setLoading(false)
  }

  useEffect(() => {
    if (selectedEmpresaId) {
      loadData()
    }
  }, [selectedEmpresaId])

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  
  // Validate: No new contracts on Sundays
  if (!editingId) {
    const today = new Date()
    const colombiaTime = new Date(today.toLocaleString("en-US", { timeZone: "America/Bogota" }))
    if (colombiaTime.getDay() === 0) {
      toast({ title: "Error", description: "No se pueden crear nuevos contratos los domingos", variant: "destructive" })
      return
    }
  }
  
  if (!formData.colaborador_id || !formData.fecha_inicio) {
  toast({ title: "Error", description: "Colaborador y fecha de inicio son requeridos", variant: "destructive" })
  return
  }
  const result = editingId
  ? await updateContrato(editingId, formData)
  : await createContrato(formData)

    if (result.success) {
      toast({ title: "Exito", description: editingId ? "Contrato actualizado" : "Contrato creado" })
      loadData()
      setOpen(false)
      resetForm()
    } else {
      toast({ title: "Error", description: (result as any).message, variant: "destructive" })
    }
  }

  const handleEdit = (contrato: Contrato) => {
    setFormData({
      colaborador_id: contrato.colaborador_id,
      fecha_inicio: contrato.fecha_inicio || "",
      fecha_fin: contrato.fecha_fin || "",
      fechaenvio: contrato.fechaenvio || "",
      fechafirma: contrato.fechafirma || "",
      tipo_contrato: contrato.tipo_contrato,
      cargo: contrato.cargo || "",
      salario_base: contrato.salario_base?.toString() || "",
      estado: contrato.estado,
      url_documento: contrato.url_documento || "",
      causaretiro: contrato.causaretiro || "",
    })
    setEditingId(contrato.id)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Esta seguro de que desea eliminar este contrato?")) return
    const result = await deleteContrato(id)
    if (result.success) {
      toast({ title: "Exito", description: "Contrato eliminado" })
      loadData()
    } else {
      toast({ title: "Error", description: (result as any).message, variant: "destructive" })
    }
  }

  const handleEstadoChange = async (id: string, nuevoEstado: string) => {
    setUpdatingEstado(id)
    const result = await updateContrato(id, { estado: nuevoEstado })
    if (result.success) {
      setContratos(prev => prev.map(c => c.id === id ? { ...c, estado: nuevoEstado } : c))
    } else {
      toast({ title: "Error", description: "No se pudo actualizar el estado", variant: "destructive" })
    }
    setUpdatingEstado(null)
  }

  const resetForm = () => {
    setFormData({
      colaborador_id: "",
      fecha_inicio: "",
      fecha_fin: "",
      fechaenvio: "",
      fechafirma: "",
      tipo_contrato: "indefinido",
      cargo: "",
      salario_base: "",
      estado: "creado",
      url_documento: "",
      causaretiro: "",
    })
    setEditingId(null)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetForm()
    setOpen(newOpen)
  }

  const getEstadoStyle = (estado: string) =>
    ESTADOS_CONTRATO.find(e => e.value === estado)?.color ?? "bg-gray-100 text-gray-800"

  const getEstadoLabel = (estado: string) =>
    ESTADOS_CONTRATO.find(e => e.value === estado)?.label ?? estado

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gestion de Contratos</h2>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nuevo Contrato
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Contrato" : "Nuevo Contrato"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Colaborador */}
                <div>
                  <Label htmlFor="colaborador_id">Colaborador *</Label>
                  <select
                    id="colaborador_id"
                    value={formData.colaborador_id}
                    onChange={(e) => setFormData({ ...formData, colaborador_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  >
                    <option value="">Seleccionar colaborador</option>
                    {colaboradores.map((col) => (
                      <option key={col.id} value={col.identificacion}>{col.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Tipo contrato */}
                <div>
                  <Label htmlFor="tipo_contrato">Tipo de Contrato *</Label>
                  <select
                    id="tipo_contrato"
                    value={formData.tipo_contrato}
                    onChange={(e) => setFormData({
                      ...formData,
                      tipo_contrato: e.target.value,
                      fecha_fin: e.target.value === "indefinido" ? "" : formData.fecha_fin,
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  >
                    <option value="indefinido">Indefinido</option>
                    <option value="a_termino_fijo">A Termino Fijo</option>
                    <option value="temporal">Temporal</option>
                    <option value="prueba">Periodo de Prueba</option>
                    <option value="obra_labor">Obra Labor</option>
                  </select>
                </div>

                {/* Fecha Inicio */}
                <div>
                  <Label htmlFor="fecha_inicio">Fecha Inicio *</Label>
                  <Input
                    id="fecha_inicio"
                    type="date"
                    value={formData.fecha_inicio}
                    onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
                    required
                  />
                </div>

                {/* Fecha Fin - solo si no es indefinido */}
                {formData.tipo_contrato !== "indefinido" && (
                  <div>
                    <Label htmlFor="fecha_fin">Fecha Fin</Label>
                    <Input
                      id="fecha_fin"
                      type="date"
                      value={formData.fecha_fin}
                      onChange={(e) => setFormData({ ...formData, fecha_fin: e.target.value })}
                    />
                  </div>
                )}

                {/* Fecha Envio */}
                <div>
                  <Label htmlFor="fechaenvio">Fecha de Envio</Label>
                  <Input
                    id="fechaenvio"
                    type="date"
                    value={formData.fechaenvio}
                    onChange={(e) => setFormData({ ...formData, fechaenvio: e.target.value })}
                  />
                </div>

                {/* Fecha Firma */}
                <div>
                  <Label htmlFor="fechafirma">Fecha de Firma</Label>
                  <Input
                    id="fechafirma"
                    type="date"
                    value={formData.fechafirma}
                    onChange={(e) => setFormData({ ...formData, fechafirma: e.target.value })}
                  />
                </div>

                {/* Cargo */}
                <div>
                  <Label htmlFor="cargo">Cargo</Label>
                  <Input
                    id="cargo"
                    value={formData.cargo}
                    onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                  />
                </div>

                {/* Salario */}
                <div>
                  <Label htmlFor="salario_base">Salario Base</Label>
                  <Input
                    id="salario_base"
                    type="number"
                    value={formData.salario_base}
                    onChange={(e) => setFormData({ ...formData, salario_base: e.target.value })}
                  />
                </div>

                {/* Estado */}
                <div>
                  <Label htmlFor="estado">Estado del Contrato</Label>
                  <select
                    id="estado"
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    {ESTADOS_CONTRATO.map(e => (
                      <option key={e.value} value={e.value}>{e.label}</option>
                    ))}
                  </select>
                </div>

                {/* Fecha de creacion - solo lectura al editar */}
                {editingId && (
                  <div>
                    <Label className="text-muted-foreground">Fecha de Creacion</Label>
                    <Input
                      value={formatCreatedAt(contratos.find(c => c.id === editingId)?.created_at)}
                      readOnly
                      disabled
                      className="bg-muted text-muted-foreground cursor-not-allowed"
                    />
                  </div>
                )}

                {/* Causa de retiro - solo visible al editar */}
                {editingId && (
                  <div>
                    <Label htmlFor="causaretiro">Causa de Retiro</Label>
                    <select
                      id="causaretiro"
                      value={formData.causaretiro}
                      onChange={(e) => setFormData({ ...formData, causaretiro: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="">Sin registrar</option>
                      <option value="renuncia">Renuncia</option>
                      <option value="justa_causa">Justa Causa</option>
                      <option value="periodo_de_prueba">Periodo de Prueba</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
                <Button type="submit">{editingId ? "Actualizar" : "Crear"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando...</div>
      ) : contratos.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No hay contratos registrados</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Tipo Contrato</TableHead>
                <TableHead>Fecha Inicio</TableHead>
                <TableHead>Fecha Fin</TableHead>
                <TableHead>Fecha Envio</TableHead>
                <TableHead>Fecha Firma</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Causa Retiro</TableHead>
                <TableHead>Fecha Creacion</TableHead>
                <TableHead className="w-36">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contratos.map((contrato) => {
                const colaborador = colaboradores.find(c => c.identificacion === contrato.colaborador_id)
                return (
                  <TableRow key={contrato.id}>
                    <TableCell className="font-medium">{colaborador?.nombre || "-"}</TableCell>
                    <TableCell>{contrato.cargo || "-"}</TableCell>
                    <TableCell>{TIPO_CONTRATO_LABELS[contrato.tipo_contrato] ?? contrato.tipo_contrato}</TableCell>
                    <TableCell>{contrato.fecha_inicio || "-"}</TableCell>
                    <TableCell>{contrato.fecha_fin || "-"}</TableCell>
                    <TableCell>{contrato.fechaenvio || "-"}</TableCell>
                    <TableCell>{contrato.fechafirma || "-"}</TableCell>
                    <TableCell>
                      <select
                        value={contrato.estado}
                        onChange={(e) => handleEstadoChange(contrato.id, e.target.value)}
                        disabled={updatingEstado === contrato.id}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${getEstadoStyle(contrato.estado)}`}
                      >
                        {ESTADOS_CONTRATO.map(e => (
                          <option key={e.value} value={e.value}>{e.label}</option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-xs">
                      {contrato.causaretiro
                        ? { renuncia: "Renuncia", justa_causa: "Justa Causa", periodo_de_prueba: "Periodo de Prueba" }[contrato.causaretiro] ?? contrato.causaretiro
                        : "-"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatCreatedAt(contrato.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {contrato.url_documento && (
                          <a href={contrato.url_documento} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm">
                              <Download className="w-4 h-4" />
                            </Button>
                          </a>
                        )}
                        <Button variant="outline" size="sm" onClick={() => handleEdit(contrato)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(contrato.id)}>
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
