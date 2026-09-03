"use client"

// Pieza reutilizable de soportes documentales. Se inserta en cualquier submenú.
// Sube al repositorio central (bucket "archivos" + tabla soportes_documentales),
// CONSERVANDO el historial (el anterior queda como "histórico" y el nuevo "vigente").
//
// Uso:
//   <SoportesDocumentales
//     norma="SST 0312" modulo="Matriz de Estándares"
//     referenciaTipo="estandar" referenciaId={item.numeral} referenciaDesc={item.item}
//     onUploaded={(url) => ...}  // opcional: refleja el último en la columna del módulo
//   />

import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Upload, ExternalLink, FileText, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { listSoportes, subirYRegistrarSoporte, eliminarSoporte } from "@/lib/soportes-actions"
import type { SoporteRow } from "@/lib/soportes-types"

const T = { navy: "#0D3B6E", teal: "#00B4CC", ok: "#1E8449", grey: "#8896a5" }

export function SoportesDocumentales({
  norma,
  modulo,
  referenciaTipo,
  referenciaId,
  referenciaDesc,
  empresaId,
  onUploaded,
}: {
  norma: string
  modulo: string
  referenciaTipo: string
  referenciaId: string | number
  referenciaDesc?: string | null
  empresaId?: number | null
  onUploaded?: (url: string) => void
}) {
  const { toast } = useToast()
  const refId = String(referenciaId)
  const [rows, setRows] = useState<SoporteRow[]>([])
  const [subiendo, setSubiendo] = useState(false)
  // Soporte que se esta quitando, con el motivo que hay que escribir.
  const [porQuitar, setPorQuitar] = useState<SoporteRow | null>(null)
  const [motivo, setMotivo] = useState("")
  const [quitando, setQuitando] = useState(false)

  async function cargar() {
    setRows(await listSoportes(referenciaTipo, refId, empresaId ?? null))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenciaTipo, refId, empresaId])

  async function onFile(file: File) {
    // Aviso temprano si el archivo supera el límite del Server Action (50MB).
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "Archivo muy grande",
        description: "El máximo es 50 MB. Comprime el documento o súbelo por partes.",
      })
      return
    }
    setSubiendo(true)
    try {
      const res = await subirYRegistrarSoporte(
        file,
        { norma, modulo, referenciaTipo, referenciaId: refId, referenciaDesc: referenciaDesc ?? null },
        empresaId ?? null,
      )
      if (res.success && res.url) {
        toast({ title: "Soporte cargado", description: "Se guardó como evidencia (se conserva el historial)." })
        onUploaded?.(res.url)
        cargar()
      } else {
        toast({ title: "Error al subir", description: res.message || "No se pudo subir el archivo." })
      }
    } catch (e: any) {
      // Falla-seguro: sin esto, un error del Server Action (p. ej. tamaño) dejaba
      // el botón "Subiendo..." colgado para siempre.
      console.error("[soportes] onFile:", e?.message ?? e)
      toast({
        title: "Error al subir",
        description: "No se pudo subir el archivo (revisa el tamaño/conexión e inténtalo de nuevo).",
      })
    } finally {
      setSubiendo(false)
    }
  }

  async function confirmarQuitar() {
    if (!porQuitar) return
    setQuitando(true)
    try {
      const res = await eliminarSoporte(porQuitar.id, motivo)
      if (res.success) {
        toast({
          title: "Soporte retirado",
          description: "Deja de aparecer como evidencia. El archivo se conserva y se puede revertir.",
        })
        setPorQuitar(null)
        setMotivo("")
        cargar()
        // Se avisa hacia arriba con cadena vacia: el modulo que muestre el
        // ultimo soporte en una columna tiene que enterarse de que ya no esta.
        onUploaded?.("")
      } else {
        toast({ title: "No se pudo quitar", description: res.message })
      }
    } catch (e: any) {
      console.error("[soportes] confirmarQuitar:", e?.message ?? e)
      toast({ title: "No se pudo quitar", description: "Inténtalo de nuevo." })
    } finally {
      setQuitando(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <label
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
        style={{ color: T.navy }}
      >
        {subiendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {subiendo ? "Subiendo..." : "Subir soporte"}
        <input
          type="file"
          className="hidden"
          disabled={subiendo}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ""
          }}
        />
      </label>

      {rows.length > 0 ? (
        <ul className="space-y-0.5">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
              <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
              <a
                href={r.archivo_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
                style={{ color: T.teal }}
              >
                {r.archivo_nombre ?? "archivo"} <ExternalLink className="h-3 w-3" />
              </a>
              <span className="text-[10px] text-muted-foreground">{(r.created_at ?? "").slice(0, 10)}</span>
              <span
                className="rounded px-1 text-[10px] text-white"
                style={{ backgroundColor: r.vigente ? T.ok : T.grey }}
              >
                {r.vigente ? "vigente" : "histórico"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPorQuitar(r)
                  setMotivo("")
                }}
                title="Quitar este soporte del repositorio"
                aria-label={`Quitar ${r.archivo_nombre ?? "soporte"}`}
                className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">Sin soportes aún.</p>
      )}

      {/* Quitar un soporte pide confirmacion Y motivo. Esto es evidencia de un
          SG-SST que se audita: un archivo que desaparece sin explicacion es
          peor que uno retirado con su razon escrita. */}
      <Dialog open={!!porQuitar} onOpenChange={(o) => !o && setPorQuitar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Quitar soporte
            </DialogTitle>
            <DialogDescription>
              {porQuitar?.archivo_nombre ?? "Este archivo"} dejará de aparecer como evidencia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              El archivo <strong>no se borra</strong>: se conserva y la eliminación se puede
              revertir. Deja de mostrarse aquí, en el Repositorio de Soportes y en el Repositorio
              Universal.
            </p>
            {porQuitar?.vigente && rows.filter((r) => r.id !== porQuitar.id).length > 0 && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                Es el soporte vigente. Al quitarlo, el anterior vuelve a quedar como vigente.
              </p>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium">Motivo *</label>
              <Input
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Se subió al estándar equivocado"
              />
              <p className="text-[11px] text-muted-foreground">
                Queda guardado con la fecha. Dentro de un año es lo único que explica por qué no
                está.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => setPorQuitar(null)} disabled={quitando}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarQuitar}
              disabled={quitando || !motivo.trim()}
              className="gap-1.5"
            >
              {quitando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Quitar soporte
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default SoportesDocumentales
