"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { getAntecedentes, deleteAntecedente, sincronizarAntecedentesDesdeHeadcount, type Antecedente } from "@/lib/antecedentes-actions"
import { getHojasVida, type HojaDeVida } from "@/lib/hojas-vida-actions"
import { Plus, Trash2, Eye, Download, Search, ShieldCheck, Loader2, Check, Users } from "lucide-react"

// Acceso a los 3 tipos de certificado de forma uniforme.
const TIPOS = [
  { key: "policia", label: "Policía" },
  { key: "procuraduria", label: "Procuraduría" },
  { key: "contraloria", label: "Contraloría" },
] as const

export default function Antecedentes() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [antecedentes, setAntecedentes] = useState<Antecedente[]>([])
  const [hojas, setHojas] = useState<HojaDeVida[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Candidato seleccionado (desde una hoja de vida) y archivos.
  const [candidato, setCandidato] = useState<HojaDeVida | null>(null)
  const [candidatoSearch, setCandidatoSearch] = useState("")
  const [policia, setPolicia] = useState<File | null>(null)
  const [procuraduria, setProcuraduria] = useState<File | null>(null)
  const [contraloria, setContraloria] = useState<File | null>(null)

  const loadData = async () => {
    setLoading(true)
    const [antRes, hvRes] = await Promise.all([
      getAntecedentes(selectedEmpresaId),
      getHojasVida(selectedEmpresaId),
    ])
    setAntecedentes(antRes.success ? antRes.data : [])
    setHojas(hvRes.success ? hvRes.data : [])
    setLoading(false)
  }

  const handleSync = async () => {
    setSyncing(true)
    const res = await sincronizarAntecedentesDesdeHeadcount(selectedEmpresaId)
    setSyncing(false)
    if (res.success) {
      toast({
        title: "Sincronizado con Head Count",
        description: `${res.creadas} traído(s), ${res.actualizadas} actualizado(s).`,
      })
      loadData()
    } else {
      toast({ title: "No se pudo sincronizar", description: res.message })
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const resetForm = () => {
    setCandidato(null)
    setCandidatoSearch("")
    setPolicia(null)
    setProcuraduria(null)
    setContraloria(null)
  }

  // Hojas de vida que coinciden con la busqueda (por cedula o nombre).
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

  const handleUpload = async () => {
    if (!candidato) {
      toast({ title: "Falta el candidato", description: "Selecciona una hoja de vida." })
      return
    }
    if (!policia && !procuraduria && !contraloria) {
      toast({ title: "Faltan archivos", description: "Adjunta al menos un certificado." })
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      if (selectedEmpresaId) fd.append("empresaId", String(selectedEmpresaId))
      fd.append("hoja_vida_id", candidato.id)
      fd.append("cedula", candidato.cedula || "")
      fd.append("nombre", candidato.nombre_candidato)
      if (policia) fd.append("policia", policia)
      if (procuraduria) fd.append("procuraduria", procuraduria)
      if (contraloria) fd.append("contraloria", contraloria)

      const res = await fetch("/api/antecedentes/upload", { method: "POST", body: fd })
      const json = await res.json()

      if (!res.ok) {
        toast({ title: "Error", description: json.error || "No se pudieron subir los antecedentes." })
        return
      }

      toast({ title: "Antecedentes guardados" })
      setOpen(false)
      resetForm()
      loadData()
    } catch (err) {
      toast({ title: "Error", description: "Ocurrió un error al subir los archivos." })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este registro de antecedentes? Esta acción no se puede deshacer.")) return
    const result = await deleteAntecedente(id)
    if (result.success) {
      toast({ title: "Antecedentes eliminados" })
      loadData()
    } else {
      toast({ title: "Error", description: result.message || "No se pudo eliminar." })
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return antecedentes
    return antecedentes.filter(
      (a) =>
        a.nombre.toLowerCase().includes(q) || (a.cedula?.toLowerCase().includes(q) ?? false),
    )
  }, [antecedentes, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Antecedentes
          </h1>
          <p className="text-sm text-muted-foreground">
            Carga los certificados de Policía, Procuraduría y Contraloría por candidato.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleSync} disabled={syncing} title="Trae los antecedentes ya cargados en Head Count">
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
              Cargar antecedentes
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Nuevos antecedentes</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Selector de candidato por cedula o nombre (desde hojas de vida) */}
              <div className="space-y-1.5">
                <Label>
                  Candidato (cédula o nombre) <span className="text-destructive">*</span>
                </Label>
                {candidato ? (
                  <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                    <div className="text-sm">
                      <span className="font-medium text-foreground">{candidato.nombre_candidato}</span>
                      <span className="text-muted-foreground"> · {candidato.cedula || "sin cédula"}</span>
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
                          No hay hojas de vida que coincidan.
                        </p>
                      ) : (
                        candidatosFiltrados.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => setCandidato(h)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <span>
                              <span className="font-medium text-foreground">{h.nombre_candidato}</span>
                              <span className="text-muted-foreground"> · {h.cedula || "sin cédula"}</span>
                            </span>
                            <Check className="h-4 w-4 opacity-0" />
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 3 archivos de antecedentes */}
              <div className="space-y-1.5">
                <Label htmlFor="policia">Certificado de Policía</Label>
                <Input
                  id="policia"
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setPolicia(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="procuraduria">Certificado de Procuraduría</Label>
                <Input
                  id="procuraduria"
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setProcuraduria(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contraloria">Certificado de Contraloría</Label>
                <Input
                  id="contraloria"
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setContraloria(e.target.files?.[0] ?? null)}
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
              <TableHead>Policía</TableHead>
              <TableHead>Procuraduría</TableHead>
              <TableHead>Contraloría</TableHead>
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
                  No hay antecedentes registrados.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => {
                const archivos: Record<string, { url: string | null; nombre: string | null }> = {
                  policia: { url: a.policia_url, nombre: a.policia_nombre },
                  procuraduria: { url: a.procuraduria_url, nombre: a.procuraduria_nombre },
                  contraloria: { url: a.contraloria_url, nombre: a.contraloria_nombre },
                }
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.nombre}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.cedula || "—"}</TableCell>
                    {TIPOS.map((t) => {
                      const archivo = archivos[t.key]
                      return (
                        <TableCell key={t.key}>
                          {archivo.url ? (
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" asChild title={`Ver ${t.label}`}>
                                <a href={archivo.url} target="_blank" rel="noopener noreferrer">
                                  <Eye className="h-4 w-4" />
                                </a>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                title={`Descargar ${t.label}`}
                              >
                                <a href={archivo.url} download={archivo.nombre || undefined}>
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )
                    })}
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(a.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
