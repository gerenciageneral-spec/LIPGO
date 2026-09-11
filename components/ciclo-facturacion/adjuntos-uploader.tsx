"use client"

// Sube uno o varios archivos (imagen/PDF) a una etapa del Ciclo de
// Facturación y registra el evento correspondiente. Mismo patrón probado en
// components/gestion-facturas.tsx: inputs ocultos con `sr-only` (no
// `display:none` -- en iOS a veces no dispara `change` tras la cámara) +
// botones que disparan `input.click()`, comprime la imagen si pesa mucho
// antes de subir.

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Camera, ImagePlus, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { compressImageIfNeeded } from "@/lib/image-compress"
import { registrarEventoCiclo, type EtapaDocumento } from "@/lib/ciclo-facturacion-actions"

interface AdjuntosUploaderProps {
  prefacturaId: number
  evento: EtapaDocumento
  usuario: string
  label: string
  onDone: () => void
}

export function AdjuntosUploader({ prefacturaId, evento, usuario, label, onDone }: AdjuntosUploaderProps) {
  const { toast } = useToast()
  const [subiendo, setSubiendo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const subirArchivos = async (files: File[]) => {
    if (!files.length) return
    setSubiendo(true)
    try {
      const archivos: { url: string; nombre: string }[] = []
      for (const file of files) {
        const fileToUpload = await compressImageIfNeeded(file)
        const fd = new FormData()
        fd.append("file", fileToUpload)
        fd.append("prefacturaId", String(prefacturaId))
        fd.append("evento", evento)
        const res = await fetch("/api/ciclo-facturacion-upload", { method: "POST", body: fd })
        let result: { success?: boolean; url?: string; nombre?: string; error?: string } = {}
        try {
          result = await res.json()
        } catch {
          result = { success: false, error: `Error ${res.status} al subir el archivo` }
        }
        if (!result.success) {
          toast({ title: "Error al subir", description: result.error || file.name, variant: "destructive" })
          continue
        }
        archivos.push({ url: result.url!, nombre: result.nombre || file.name })
      }
      if (archivos.length === 0) return

      const r = await registrarEventoCiclo(prefacturaId, evento, archivos, usuario)
      if (r.success) {
        toast({ title: "Listo", description: `${archivos.length} archivo(s) registrado(s).` })
        onDone()
      } else {
        toast({ title: "No se pudo registrar", description: r.message, variant: "destructive" })
      }
    } finally {
      setSubiendo(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ""
    subirArchivos(files)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="sr-only" aria-hidden="true" tabIndex={-1} onChange={handleChange} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-hidden="true" tabIndex={-1} onChange={handleChange} />
      <Button size="sm" variant="outline" disabled={subiendo} onClick={() => fileInputRef.current?.click()}>
        {subiendo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />}
        {label}
      </Button>
      <Button size="sm" variant="outline" disabled={subiendo} onClick={() => cameraInputRef.current?.click()}>
        <Camera className="mr-1.5 h-3.5 w-3.5" />
        Cámara
      </Button>
    </div>
  )
}
