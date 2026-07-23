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
import { Loader2, Upload, ExternalLink, FileText } from "lucide-react"
import { listSoportes, subirYRegistrarSoporte } from "@/lib/soportes-actions"
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">Sin soportes aún.</p>
      )}
    </div>
  )
}

export default SoportesDocumentales
