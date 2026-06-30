import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

// Endpoint para subir la firma del colaborador al registrar
// asistencia a una capacitacion. La imagen se guarda en el bucket
// `archivos` dentro de la carpeta `firmas/` y la URL publica
// resultante se persiste en `capacitaciones_asistencia.firmaurl`.
// Sigue el mismo patron que /api/capacitaciones/upload-evidencia.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json(
        { success: false, error: "Archivo requerido" },
        { status: 400 },
      )
    }

    const supabaseAdmin = await getSupabaseAdmin()
    const timestamp = Date.now()
    // Si la firma viene del canvas vendra como `firma.png`; si el
    // usuario sube un archivo, normalizamos el nombre.
    const safeName = (file.name || "firma.png")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "")
    const filePath = `firmas/${timestamp}_${safeName}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from("archivos")
      .upload(filePath, file, {
        contentType: file.type || "image/png",
        upsert: false,
      })

    if (uploadError) {
      console.error("[v0] firma upload error:", uploadError)
      return NextResponse.json(
        { success: false, error: uploadError.message || "Error al subir" },
        { status: 500 },
      )
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("archivos")
      .getPublicUrl(filePath)

    return NextResponse.json({ success: true, url: urlData.publicUrl })
  } catch (err: any) {
    console.error("[v0] firma upload exception:", err)
    return NextResponse.json(
      { success: false, error: err?.message || "Error inesperado" },
      { status: 500 },
    )
  }
}
