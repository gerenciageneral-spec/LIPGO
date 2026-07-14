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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getHojasVida,
  deleteHojaVida,
  updateEstadoHojaVida,
  sincronizarHojasVidaDesdeHeadcount,
  type HojaDeVida,
} from "@/lib/hojas-vida-actions"
import { Plus, Trash2, Eye, Download, Search, FileText, Loader2, Check, X, Users } from "lucide-react"

const ESTADO_BADGE: Record<HojaDeVida["estado"], string> = {
  aceptado: "bg-green-100 text-green-800",
  rechazado: "bg-red-100 text-red-800",
  pendiente: "bg-yellow-100 text-yellow-800",
}

const ESTADO_LABEL: Record<HojaDeVida["estado"], string> = {
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  pendiente: "Pendiente",
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export default function HojasDeVida() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [hojas, setHojas] = useState<HojaDeVida[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [estadoFiltro, setEstadoFiltro] = useState<"todos" | HojaDeVida["estado"]>("todos")
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Formulario de carga.
  const [form, setForm] = useState({
    nombre_candidato: "",
    cedula: "",
    cargo_aspirado: "",
    correo: "",
    telefono: "",
    notas: "",
  })
  const [file, setFile] = useState<File | null>(null)

  const loadData = async () => {
    setLoading(true)
    const result = await getHojasVida(selectedEmpresaId)
    setHojas(result.success ? result.data : [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const resetForm = () => {
    setForm({ nombre_candidato: "", cedula: "", cargo_aspirado: "", correo: "", telefono: "", notas: "" })
    setFile(null)
  }

  // Trae al Banco las hojas de vida que los colaboradores YA tienen cargadas en
  // Head Count (datos + documento), sin re-subir. Idempotente por cédula.
  const handleSync = async () => {
    setSyncing(true)
    const res = await sincronizarHojasVidaDesdeHeadcount(selectedEmpresaId)
    setSyncing(false)
    if (res.success) {
      toast({
        title: "Sincronizado con Head Count",
        description: `${res.creadas} traída(s), ${res.actualizadas} actualizada(s).`,
      })
      loadData()
    } else {
      toast({ title: "No se pudo sincronizar", description: res.message })
    }
  }

  const handleUpload = async () => {
    if (!form.nombre_candidato.trim()) {
      toast({ title: "Falta el nombre", description: "Ingresa el nombre del candidato." })
      return
    }
    if (!file) {
      toast({ title: "Falta el archivo", description: "Adjunta la hoja de vida." })
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      // Empresa seleccionada dinamicamente desde la parte superior.
      if (selectedEmpresaId) fd.append("empresaId", String(selectedEmpresaId))
      fd.append("nombre_candidato", form.nombre_candidato)
      fd.append("cedula", form.cedula)
      fd.append("cargo_aspirado", form.cargo_aspirado)
      fd.append("correo", form.correo)
      fd.append("telefono", form.telefono)
      fd.append("notas", form.notas)

      const res = await fetch("/api/hojas-vida/upload", { method: "POST", body: fd })
      const json = await res.json()

      if (!res.ok) {
        toast({ title: "Error", description: json.error || "No se pudo subir la hoja de vida." })
        return
      }

      toast({ title: "Hoja de vida guardada" })
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
    if (!confirm("¿Eliminar esta hoja de vida? Esta acción no se puede deshacer.")) return
    const result = await deleteHojaVida(id)
    if (result.success) {
      toast({ title: "Hoja de vida eliminada" })
      loadData()
    } else {
      toast({ title: "Error", description: result.message || "No se pudo eliminar." })
    }
  }

  const handleEstado = async (id: string, estado: HojaDeVida["estado"]) => {
    // Optimista: reflejamos el cambio de inmediato y revertimos si falla.
    setHojas((prev) => prev.map((h) => (h.id === id ? { ...h, estado } : h)))
    const result = await updateEstadoHojaVida(id, estado)
    if (result.success) {
      toast({ title: estado === "aceptado" ? "Hoja de vida aceptada" : estado === "rechazado" ? "Hoja de vida rechazada" : "Marcada como pendiente" })
    } else {
      toast({ title: "Error", description: result.message || "No se pudo actualizar el estado." })
      loadData()
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return hojas.filter((h) => {
      const matchEstado = estadoFiltro === "todos" || h.estado === estadoFiltro
      if (!matchEstado) return false
      if (!q) return true
      return (
        h.nombre_candidato.toLowerCase().includes(q) ||
        (h.cedula?.toLowerCase().includes(q) ?? false) ||
        (h.cargo_aspirado?.toLowerCase().includes(q) ?? false) ||
        (h.correo?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [hojas, search, estadoFiltro])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Banco de Hojas de Vida
          </h1>
          <p className="text-sm text-muted-foreground">
            Guarda, visualiza y descarga las hojas de vida de los candidatos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleSync} disabled={syncing} title="Trae las hojas de vida ya cargadas en Head Count">
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
          Sincronizar desde Head Count
        </Button>
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
              Agregar hoja de vida
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-lg"
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Nueva hoja de vida</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nombre_candidato">
                  Nombre del candidato <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="nombre_candidato"
                  value={form.nombre_candidato}
                  onChange={(e) => setForm({ ...form, nombre_candidato: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cedula">Cédula</Label>
                  <Input
                    id="cedula"
                    value={form.cedula}
                    onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cargo_aspirado">Cargo aspirado</Label>
                  <Input
                    id="cargo_aspirado"
                    value={form.cargo_aspirado}
                    onChange={(e) => setForm({ ...form, cargo_aspirado: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input
                    id="telefono"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="correo">Correo electrónico</Label>
                <Input
                  id="correo"
                  type="email"
                  value={form.correo}
                  onChange={(e) => setForm({ ...form, correo: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notas">Notas</Label>
                <Textarea
                  id="notas"
                  rows={3}
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="archivo">
                  Archivo (PDF, Word, imagen) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="archivo"
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && (
                  <p className="text-xs text-muted-foreground">
                    {file.name} · {formatBytes(file.size)}
                  </p>
                )}
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
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, cédula, cargo o correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={estadoFiltro} onValueChange={(v) => setEstadoFiltro(v as typeof estadoFiltro)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="aceptado">Aceptado</SelectItem>
            <SelectItem value="rechazado">Rechazado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidato</TableHead>
              <TableHead>Cargo aspirado</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Archivo</TableHead>
              <TableHead>Antecedentes</TableHead>
              <TableHead>Estado</TableHead>
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
                  No hay hojas de vida registradas.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.nombre_candidato}</TableCell>
                  <TableCell>{h.cargo_aspirado || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {h.correo || "—"}
                    {h.telefono ? <div>{h.telefono}</div> : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="block max-w-[180px] truncate" title={h.archivo_nombre}>
                      {h.archivo_nombre}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(h.archivo_tamano)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {h.antecedentes_url ? (
                      <div className="space-y-1">
                        <a
                          href={h.antecedentes_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" /> Ver PDF
                        </a>
                        <div className="flex items-center gap-1.5">
                          {h.antecedentes_estado && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                              style={{ background: h.antecedentes_estado === "aceptado" ? "#16a34a" : "#dc2626" }}
                            >
                              {h.antecedentes_estado === "aceptado" ? "Aceptado" : "Rechazado"}
                            </span>
                          )}
                          {typeof h.antecedentes_score === "number" && (
                            <span
                              className="font-mono text-[10px]"
                              style={{ color: h.antecedentes_score <= 50 ? "#dc2626" : h.antecedentes_score <= 84 ? "#f59e0b" : "#16a34a" }}
                            >
                              score {h.antecedentes_score}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${ESTADO_BADGE[h.estado]}`}
                    >
                      {ESTADO_LABEL[h.estado]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEstado(h.id, "aceptado")}
                        disabled={h.estado === "aceptado"}
                        title="Marcar como aceptado"
                        className="text-green-700 hover:text-green-800"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEstado(h.id, "rechazado")}
                        disabled={h.estado === "rechazado"}
                        title="Marcar como rechazado"
                        className="text-red-700 hover:text-red-800"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" asChild title="Visualizar">
                        <a href={h.archivo_url} target="_blank" rel="noopener noreferrer">
                          <Eye className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild title="Descargar">
                        <a href={h.archivo_url} download={h.archivo_nombre}>
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(h.id)}
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
