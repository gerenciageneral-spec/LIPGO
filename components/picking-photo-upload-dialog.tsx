"use client"

// Diálogo compartido de "cerrar con fotos" (cargue/descargue/distribución).
// Extraído tal cual de components/picking.tsx (mismo comportamiento, mismo
// endpoint /api/upload-picking-photos) para que Picking y Centro de
// Coordinación usen exactamente el mismo código, sin duplicar cámara ni
// compresión.

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const canvas = document.createElement("canvas")
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(file)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file)
              return
            }
            const compressedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now(),
            })
            resolve(compressedFile)
          },
          "image/jpeg",
          quality,
        )
      }
      img.onerror = () => resolve(file)
      img.src = e.target?.result as string
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

const compressImages = async (files: File[], maxWidth = 1200, quality = 0.7): Promise<File[]> => {
  return Promise.all(files.map((file) => compressImage(file, maxWidth, quality)))
}

interface PickingPhotoUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: number
  orderLabel: string
  title?: string
  description?: string
  onUploaded: () => void | Promise<void>
}

export function PickingPhotoUploadDialog({
  open,
  onOpenChange,
  orderId,
  orderLabel,
  title = "Cargar Fotos de Picking",
  description = "Seleccione hasta 30 fotos del proceso de picking. Puede usar la cámara de su dispositivo móvil o seleccionar archivos.",
  onUploaded,
}: PickingPhotoUploadDialogProps) {
  const { toast } = useToast()
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([])
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])

    if (files.length + selectedPhotos.length > 30) {
      toast({
        title: "Error",
        description: "Máximo 30 fotos permitidas",
        variant: "destructive",
      })
      return
    }

    const newPreviewUrls = files.map((file) => URL.createObjectURL(file))
    setPhotoPreviewUrls([...photoPreviewUrls, ...newPreviewUrls])
    setSelectedPhotos([...selectedPhotos, ...files])
  }

  const handleRemovePhoto = (index: number) => {
    const newPhotos = selectedPhotos.filter((_, i) => i !== index)
    const newPreviews = photoPreviewUrls.filter((_, i) => i !== index)

    URL.revokeObjectURL(photoPreviewUrls[index])

    setSelectedPhotos(newPhotos)
    setPhotoPreviewUrls(newPreviews)
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && uploadingPhotos) return
    if (!nextOpen) {
      photoPreviewUrls.forEach((url) => URL.revokeObjectURL(url))
      setSelectedPhotos([])
      setPhotoPreviewUrls([])
    }
    onOpenChange(nextOpen)
  }

  const handleSavePhotos = async () => {
    if (selectedPhotos.length === 0) {
      toast({
        title: "Error",
        description: "Debe seleccionar al menos una foto",
        variant: "destructive",
      })
      return
    }

    setUploadingPhotos(true)

    try {
      toast({
        title: "Optimizando fotos",
        description: `Procesando ${selectedPhotos.length} foto(s)...`,
      })
      const photosToUpload = await compressImages(selectedPhotos, 1280, 0.6)

      const orderIdStr = orderId.toString()
      const urls: string[] = []
      for (let i = 0; i < photosToUpload.length; i++) {
        const photo = photosToUpload[i]
        toast({
          title: "Subiendo fotos",
          description: `Subiendo ${i + 1} de ${photosToUpload.length}...`,
        })
        const fd = new FormData()
        fd.append("orderId", orderIdStr)
        fd.append("mode", "append")
        fd.append("files", photo)
        const res = await fetch("/api/upload-picking-photos", {
          method: "POST",
          body: fd,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.success || !Array.isArray(data?.urls)) {
          throw new Error(data?.error || data?.details || `Error subiendo la foto ${i + 1}. Intenta nuevamente.`)
        }
        urls.push(...data.urls)
      }

      const finalizeFd = new FormData()
      finalizeFd.append("orderId", orderIdStr)
      finalizeFd.append("mode", "finalize")
      finalizeFd.append("urls", JSON.stringify(urls))
      const finalizeRes = await fetch("/api/upload-picking-photos", {
        method: "POST",
        body: finalizeFd,
      })
      const finalizeData = await finalizeRes.json().catch(() => ({}))
      if (!finalizeRes.ok || !finalizeData?.success) {
        throw new Error(finalizeData?.error || finalizeData?.details || "No se pudo cerrar la orden tras subir las fotos")
      }

      toast({
        title: "Éxito",
        description: `${urls.length} foto(s) cargadas exitosamente`,
      })

      photoPreviewUrls.forEach((url) => URL.revokeObjectURL(url))
      setSelectedPhotos([])
      setPhotoPreviewUrls([])
      onOpenChange(false)
      await onUploaded()
    } catch (error: any) {
      console.error("[v0] Error saving photos:", error)
      toast({
        title: "Error",
        description: error?.message || "Error al guardar las fotos",
        variant: "destructive",
      })
    } finally {
      setUploadingPhotos(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {title} - {orderLabel}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="photo-upload" className="cursor-pointer">
              <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                <Upload className="h-4 w-4" />
                <span>Seleccionar Fotos</span>
              </div>
            </Label>
            <Input
              id="photo-upload"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoChange}
            />
            <span className="text-sm text-muted-foreground">{selectedPhotos.length} / 30 fotos seleccionadas</span>
          </div>

          {photoPreviewUrls.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {photoPreviewUrls.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url || "/placeholder.svg"}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-32 object-cover rounded-md border"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemovePhoto(index)}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleDialogOpenChange(false)} disabled={uploadingPhotos}>
            Cancelar
          </Button>
          <Button onClick={handleSavePhotos} disabled={uploadingPhotos || selectedPhotos.length === 0}>
            {uploadingPhotos ? "Guardando..." : "Guardar Fotos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
