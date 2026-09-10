"use client"

// Documentos de un proceso del mapa, en tres listas: Formatos, Información
// documentada y Registros.
//
// Escribe en `sig_documentos`, el mismo maestro del Listado Maestro del
// Dashboard SIG: lo que se cargue acá también sale allá.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react"
import {
  eliminarDocumentoProceso,
  getDocumentosDeProceso,
  guardarDocumentoProceso,
  subirArchivoDocumento,
} from "@/lib/mapa-procesos-actions"
import {
  CATEGORIAS,
  MAX_MB_DOCUMENTO,
  type CategoriaDoc,
  type DocumentoProceso,
} from "@/lib/mapa-procesos-tipos"

interface Borrador {
  id?: string
  categoria: CategoriaDoc
  codigo: string
  nombre: string
  version: string
  archivoUrl: string | null
  archivoNombre: string | null
}

const nuevoBorrador = (categoria: CategoriaDoc): Borrador => ({
  categoria,
  codigo: "",
  nombre: "",
  version: "1",
  archivoUrl: null,
  archivoNombre: null,
})

export function DocumentosProceso({
  procesoId,
  procesoNombre,
  onCambio,
}: {
  procesoId: string
  procesoNombre: string
  /** Avisa al mapa para refrescar el contador del proceso. */
  onCambio?: () => void
}) {
  const { toast } = useToast()
  const [docs, setDocs] = useState<DocumentoProceso[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<CategoriaDoc>("formato")

  const [editando, setEditando] = useState<Borrador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [porEliminar, setPorEliminar] = useState<DocumentoProceso | null>(null)
  const [motivo, setMotivo] = useState("")

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    const res = await getDocumentosDeProceso(procesoId)
    if (res.success && res.data) setDocs(res.data)
    else setError(res.message ?? "No se pudieron leer los documentos.")
    setCargando(false)
  }, [procesoId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const porCategoria = useMemo(() => {
    const m: Record<CategoriaDoc, DocumentoProceso[]> = { formato: [], informacion: [], registro: [] }
    for (const d of docs) if (d.categoria && m[d.categoria]) m[d.categoria].push(d)
    return m
  }, [docs])

  const subirArchivo = async (file: File) => {
    if (!editando) return
    setSubiendo(true)
    const res = await subirArchivoDocumento(file, procesoId, editando.categoria)
    setSubiendo(false)
    if (!res.success || !res.data) {
      toast({ title: "No se pudo subir", description: res.message, variant: "destructive" })
      return
    }
    setEditando({ ...editando, archivoUrl: res.data.url, archivoNombre: res.data.nombre })
    toast({ title: "Archivo cargado", description: res.data.nombre })
  }

  const guardar = async () => {
    if (!editando) return
    setGuardando(true)
    const res = await guardarDocumentoProceso({
      id: editando.id,
      procesoId,
      categoria: editando.categoria,
      codigo: editando.codigo,
      nombre: editando.nombre,
      version: editando.version,
      archivoUrl: editando.archivoUrl,
      archivoNombre: editando.archivoNombre,
    })
    setGuardando(false)
    if (!res.success) {
      toast({ title: "No se pudo guardar", description: res.message, variant: "destructive" })
      return
    }
    toast({
      title: editando.id ? "Documento actualizado" : "Documento agregado",
      description: "También aparece en el Listado Maestro del Dashboard SIG.",
    })
    setEditando(null)
    cargar()
    onCambio?.()
  }

  const confirmarEliminar = async () => {
    if (!porEliminar) return
    const res = await eliminarDocumentoProceso(porEliminar.id, motivo)
    if (!res.success) {
      toast({ title: "No se pudo quitar", description: res.message, variant: "destructive" })
      return
    }
    toast({ title: "Documento retirado", description: "El archivo se conserva; solo deja de listarse." })
    setPorEliminar(null)
    setMotivo("")
    cargar()
    onCambio?.()
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as CategoriaDoc)}>
        <TabsList className="grid w-full grid-cols-3">
          {CATEGORIAS.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className="text-[11px] sm:text-xs">
              {c.label}
              {porCategoria[c.id].length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px]">
                  {porCategoria[c.id].length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIAS.map((c) => (
          <TabsContent key={c.id} value={c.id} className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">{c.ayuda}</p>

            <Button size="sm" className="w-full gap-1.5" onClick={() => setEditando(nuevoBorrador(c.id))}>
              <Plus className="h-3.5 w-3.5" />
              Agregar {c.label.toLowerCase()}
            </Button>

            {cargando ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : porCategoria[c.id].length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Todavía no hay documentos en esta lista.
              </p>
            ) : (
              <ul className="space-y-2">
                {porCategoria[c.id].map((d) => (
                  <li key={d.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] font-medium">{d.codigo}</span>
                          <Badge variant="outline" className="text-[10px]">
                            v{d.version}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-sm font-medium leading-snug">{d.nombre}</p>
                        {d.archivoUrl ? (
                          <a
                            href={d.archivoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                          >
                            <FileText className="h-3 w-3" />
                            {d.archivoNombre ?? "documento"}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted-foreground">Sin archivo adjunto.</p>
                        )}
                      </div>
                      <div className="flex flex-none gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Editar"
                          onClick={() =>
                            setEditando({
                              id: d.id,
                              categoria: (d.categoria ?? c.id) as CategoriaDoc,
                              codigo: d.codigo,
                              nombre: d.nombre,
                              version: d.version,
                              archivoUrl: d.archivoUrl,
                              archivoNombre: d.archivoNombre,
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          title="Quitar del listado"
                          onClick={() => {
                            setPorEliminar(d)
                            setMotivo("")
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Alta y edición */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editando?.id ? "Editar documento" : "Agregar documento"}
            </DialogTitle>
            <DialogDescription>
              {CATEGORIAS.find((c) => c.id === editando?.categoria)?.label} · {procesoNombre}
            </DialogDescription>
          </DialogHeader>

          {editando && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Código *</Label>
                  <Input
                    value={editando.codigo}
                    onChange={(e) => setEditando({ ...editando, codigo: e.target.value })}
                    placeholder="Ej. SGI-FOR-01"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Versión *</Label>
                  <Input
                    value={editando.version}
                    onChange={(e) => setEditando({ ...editando, version: e.target.value })}
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Nombre del documento *</Label>
                <Input
                  value={editando.nombre}
                  onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                  placeholder="Ej. Procedimiento de control de documentos"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Documento adjunto</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="doc-archivo"
                    type="file"
                    className="sr-only"
                    disabled={subiendo}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) subirArchivo(f)
                      e.target.value = ""
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={subiendo}
                    onClick={() => document.getElementById("doc-archivo")?.click()}
                    className="gap-1.5"
                  >
                    {subiendo ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {editando.archivoUrl ? "Reemplazar" : "Adjuntar"}
                  </Button>
                  {editando.archivoUrl && (
                    <a
                      href={editando.archivoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                    >
                      <Download className="h-3 w-3" />
                      {editando.archivoNombre ?? "documento"}
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Máximo {MAX_MB_DOCUMENTO} MB. Se puede guardar sin archivo y adjuntarlo después.
                </p>
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button variant="outline" onClick={() => setEditando(null)} disabled={guardando}>
                  Cancelar
                </Button>
                <Button
                  onClick={guardar}
                  disabled={
                    guardando ||
                    subiendo ||
                    !editando.codigo.trim() ||
                    !editando.nombre.trim() ||
                    !editando.version.trim()
                  }
                >
                  {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Retirar del listado */}
      <Dialog open={!!porEliminar} onOpenChange={(o) => !o && setPorEliminar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Quitar del listado
            </DialogTitle>
            <DialogDescription>
              {porEliminar?.codigo} · {porEliminar?.nombre}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              El archivo <strong>no se borra</strong>: el documento deja de listarse aquí y en el
              Listado Maestro, y queda registrado por qué.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Motivo *</Label>
              <Input
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Se reemplazó por la versión 3"
              />
              <p className="text-[11px] text-muted-foreground">
                Esto es información documentada de un sistema que se audita: dentro de un año, el
                motivo es lo único que explica por qué no está.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => setPorEliminar(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarEliminar} disabled={!motivo.trim()}>
              Quitar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default DocumentosProceso
