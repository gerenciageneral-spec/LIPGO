import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

/**
 * Sube la evidencia PDF de entrega de Dotación / EPP.
 *
 * Antes usaba `@vercel/blob.put`, que exige la variable de entorno
 * `BLOB_READ_WRITE_TOKEN`. Ese token no está configurado en este proyecto, así
 * que `put` lanzaba y el `catch` devolvía el "Upload failed" genérico que veía
 * el usuario — sin decir nunca cuál era el problema real.
 *
 * La convención del sistema es Supabase Storage, bucket `archivos`. Este
 * endpoint era de los últimos que quedaban con Vercel Blob; el mismo cambio ya
 * se hizo en `gestion-facturas/upload-comprobante`, `upload-signature` y
 * `upload-pdf`, cada uno tras reportarse el mismo síntoma.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 })
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Solo se permiten archivos PDF" }, { status: 400 })
    }

    const supabase = await getSupabaseAdmin()

    // El nombre original se normaliza: espacios, tildes y demás caracteres
    // rompen la ruta del bucket y dejan una URL que después no abre.
    // `\p{Diacritic}` quita los acentos que `NFD` acaba de separar.
    const nombreLimpio = file.name
      .replace(/\.pdf$/i, "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\w-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60)
    const filePath = `epp/${Date.now()}-${nombreLimpio || "evidencia"}.pdf`

    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from("archivos")
      .upload(filePath, bytes, { contentType: "application/pdf", upsert: true })

    if (uploadError) {
      // Se devuelve el motivo REAL. El "Upload failed" genérico anterior es lo
      // que hizo que este problema durara: el error de storage nunca llegaba a
      // la pantalla, ni distinguía falta de permisos de bucket inexistente.
      console.error("[v0] epp/upload storage error:", uploadError)
      return NextResponse.json(
        { error: uploadError.message || "Error al subir el archivo" },
        { status: 500 },
      )
    }

    const { data: pub } = supabase.storage.from("archivos").getPublicUrl(filePath)

    return NextResponse.json({ url: pub?.publicUrl || "", pathname: filePath })
  } catch (error: any) {
    console.error("[v0] epp/upload fatal:", error)
    return NextResponse.json(
      { error: error?.message || "Error al subir el archivo" },
      { status: 500 },
    )
  }
}
