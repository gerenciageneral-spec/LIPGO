import { getSupabaseAdmin } from "@/lib/supabase-admin"

// Sube una foto (dataURL JPEG desde la cámara del módulo de asistencia) al bucket
// "archivos" y devuelve su URL pública. Falla-seguro: si no hay foto o falla la
// subida, devuelve null y NO rompe el registro de asistencia.
export async function subirFotoAsistencia(
  dataUrl: string | null | undefined,
  identificacion: string,
  tipo: "ingreso" | "salida",
): Promise<string | null> {
  try {
    if (!dataUrl || !dataUrl.startsWith("data:image")) return null
    const base64 = dataUrl.split(",")[1]
    if (!base64) return null
    const bytes = Buffer.from(base64, "base64")
    const supabase: any = await getSupabaseAdmin()
    const safeId = String(identificacion).replace(/[^\w-]/g, "")
    const path = `asistencia/${safeId}/${tipo}_${Date.now()}.jpg`
    const { error } = await supabase.storage
      .from("archivos")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true })
    if (error) {
      console.error("[v0] Error subiendo foto de asistencia:", error.message)
      return null
    }
    const { data } = supabase.storage.from("archivos").getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch (e: any) {
    console.error("[v0] Excepción subiendo foto de asistencia:", e?.message || e)
    return null
  }
}
