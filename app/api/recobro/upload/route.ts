import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

// Sube los soportes del recobro de incapacidades al bucket `archivos`, en la
// carpeta `recobro/{id}/`. `tipo` distingue el correo a EPS/ARL (radicado) del
// comprobante de pago. Devuelve la URL pública para persistirla en
// ausentismosst.soporte_radicado_url / soporte_pago_url.
// Mismo patrón que /api/capacitaciones/upload-evidencia.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const id = (formData.get("id") as string | null) || "sin-id"
    const tipo = (formData.get("tipo") as string | null) || "soporte"
    if (!file) {
      return NextResponse.json({ success: false, error: "Archivo requerido" }, { status: 400 })
    }

    const supabaseAdmin = await getSupabaseAdmin()
    const timestamp = Date.now()
    const safeName = (file.name || "soporte")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "")
    const filePath = `recobro/${id}/${tipo}-${timestamp}_${safeName}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from("archivos")
      .upload(filePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      console.error("[v0] recobro upload error:", uploadError)
      return NextResponse.json(
        { success: false, error: uploadError.message || "Error al subir" },
        { status: 500 },
      )
    }

    const { data: urlData } = supabaseAdmin.storage.from("archivos").getPublicUrl(filePath)
    return NextResponse.json({ success: true, url: urlData.publicUrl })
  } catch (err: any) {
    console.error("[v0] recobro upload exception:", err)
    return NextResponse.json(
      { success: false, error: err?.message || "Error inesperado" },
      { status: 500 },
    )
  }
}
