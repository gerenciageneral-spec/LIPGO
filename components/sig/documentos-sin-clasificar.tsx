"use client"

// Traer al mapa los documentos que ya existían en el SGI.
//
// El script 58 dejó a propósito en null el `proceso_id` de los documentos que
// ya estaban cargados: adivinar a qué proceso pertenece cada uno por parecido
// de texto sería inventar clasificación documental. La decisión la toma una
// persona, y este es el lugar donde la toma.
//
// Los documentos no se copian ni se mueven: se clasifican. Siguen siendo los
// mismos del Listado Maestro.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { FolderInput, Loader2, Search } from "lucide-react"
import {
  clasificarDocumentos,
  getDocumentosSinClasificar,
  type DocumentoSinClasificar,
} from "@/lib/mapa-procesos-actions"
import { CATEGORIAS, type CategoriaDoc } from "@/lib/mapa-procesos-tipos"

export function DocumentosSinClasificar({
  procesoId,
  procesoNombre,
  abierto,
  onCerrar,
  onCambio,
}: {
  procesoId: string
  procesoNombre: string
  abierto: boolean
  onCerrar: () => void
  onCambio?: () => void
}) {
  const { toast } = useToast()
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [docs, setDocs] = useState<DocumentoSinClasificar[]>([])
  const [buscar, setBuscar] = useState("")
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [categoria, setCategoria] = useState<CategoriaDoc>("formato")

  const cargar = useCallback(async () => {
    setCargando(true)
    const res = await getDocumentosSinClasificar()
    if (res.success && res.data) setDocs(res.data)
    else if (!res.success) toast({ title: "No se pudo leer", description: res.message, variant: "destructive" })
    setSel(new Set())
    setBuscar("")
    setCargando(false)
  }, [toast])

  useEffect(() => {
    if (abierto) cargar()
  }, [abierto, cargar])

  const filtrados = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    if (!t) return docs
    return docs.filter(
      (d) =>
        d.codigo.toLowerCase().includes(t) ||
        d.nombre.toLowerCase().includes(t) ||
        (d.procesoTexto ?? "").toLowerCase().includes(t),
    )
  }, [docs, buscar])

  function alternar(id: string) {
    setSel((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  async function asignar() {
    if (sel.size === 0) return
    setGuardando(true)
    const res = await clasificarDocumentos(Array.from(sel), procesoId, categoria)
    setGuardando(false)
    if (!res.success) {
      toast({ title: "No se pudo asignar", description: res.message, variant: "destructive" })
      return
    }
    toast({
      title: `${res.data} documento(s) asignado(s)`,
      description: `Ya aparecen en ${procesoNombre}.`,
    })
    onCambio?.()
    onCerrar()
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-5 w-5" />
            Traer documentos existentes
          </DialogTitle>
          <DialogDescription>
            Documentos del SGI que todavía no están en ningún proceso del mapa. Los que elijas
            quedarán en <span className="font-medium">{procesoNombre}</span>.
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : docs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No quedan documentos sin clasificar.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por código, nombre o proceso…"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                className="h-9 pl-7 text-sm"
              />
            </div>

            <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
              {filtrados.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  No hay documentos que coincidan.
                </p>
              ) : (
                filtrados.map((d) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-start gap-2 p-2 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={sel.has(d.id)}
                      onChange={() => alternar(d.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-medium">{d.codigo}</span>
                        {d.version && (
                          <span className="rounded bg-muted px-1 text-[10px]">v{d.version}</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{d.nombre}</span>
                      {/* El `proceso` de texto libre que ya traía. Es una pista
                          para decidir, no una asignación automática. */}
                      {d.procesoTexto && (
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          Proceso declarado: {d.procesoTexto}
                        </span>
                      )}
                    </span>
                  </label>
                ))
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">¿En cuál lista van?</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIAS.map((c) => (
                  <Button
                    key={c.id}
                    size="sm"
                    variant={categoria === c.id ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setCategoria(c.id)}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {CATEGORIAS.find((c) => c.id === categoria)?.ayuda}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {sel.size > 0 ? `${sel.size} seleccionado(s)` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCerrar} disabled={guardando}>
              Cerrar
            </Button>
            <Button onClick={asignar} disabled={sel.size === 0 || guardando} className="gap-1.5">
              {guardando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderInput className="h-4 w-4" />
              )}
              Traer ({sel.size})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default DocumentosSinClasificar
