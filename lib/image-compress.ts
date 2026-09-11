// Comprime una imagen ANTES de subirla, si pesa demasiado. Mismo motivo/mismo
// umbral que ya usa `components/gestion-facturas.tsx` (compressImageIfNeeded):
// las cámaras de celular producen JPEGs de 5-12 MB y las rutas Serverless de
// Vercel imponen ~4.5 MB de límite de body -- sin esto, esas fotos fallaban en
// silencio con 413/timeout. No se toca el archivo original de gestión de
// facturas (ya probado en producción); esta es una copia para el módulo nuevo.
export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file
  if (file.size <= 1.2 * 1024 * 1024) return file

  try {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new window.Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error("No se pudo decodificar la imagen"))
      i.src = dataUrl
    })

    const MAX_SIDE = 1600
    const ratio = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
    const targetW = Math.round(img.width * ratio)
    const targetH = Math.round(img.height * ratio)

    const canvas = document.createElement("canvas")
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, targetW, targetH)

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85))
    if (!blob) return file
    if (blob.size >= file.size) return file

    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto"
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() })
  } catch (err) {
    console.error("[ciclo-facturacion] compressImageIfNeeded fallback to original:", err)
    return file
  }
}
