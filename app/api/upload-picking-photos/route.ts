import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getColombiaTime } from "@/lib/date-utils"

// Subimos un solo archivo (o pocos) por request para evitar el limite
// duro de ~4.5MB por body en Vercel serverless. Cuando un movil envia
// varias fotos pesadas en un mismo POST, el body total se sale del
// limite y la peticion ni siquiera entra a la funcion: por eso a los
// usuarios "se les queda pegado" el dialog. Con este endpoint el
// cliente puede llamar varias veces (1 a 1) y al final disparar
// `finalize` para cerrar la orden.
//
// Modos:
//  - mode = "append" (default): solo sube los archivos del request y
//    devuelve sus URLs. NO actualiza `cabeceraoc`.
//  - mode = "finalize": NO sube archivos. Recibe la lista completa
//    de URLs ya subidas y actualiza `cabeceraoc.fotospicking` y
//    `fincargue` para cerrar la orden.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const orderId = formData.get("orderId") as string
    const mode = (formData.get("mode") as string) || "append"

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "orderId requerido" },
        { status: 400 },
      )
    }

    const supabaseAdmin = await getSupabaseAdmin()

    if (mode === "finalize") {
      const urlsRaw = formData.get("urls") as string
      let urls: string[] = []
      try {
        urls = JSON.parse(urlsRaw || "[]")
      } catch {
        return NextResponse.json(
          { success: false, error: "urls inválido" },
          { status: 400 },
        )
      }
      if (!Array.isArray(urls) || urls.length === 0) {
        return NextResponse.json(
          { success: false, error: "Debe enviar al menos una URL" },
          { status: 400 },
        )
      }

      const fincargue = await getColombiaTime()
      const { error: updateError } = await supabaseAdmin
        .from("cabeceraoc")
        .update({
          fotospicking: JSON.stringify(urls),
          fincargue,
        })
        .eq("id", Number.parseInt(orderId))

      if (updateError) {
        console.error("[v0] Error updating fotospicking:", updateError)
        return NextResponse.json(
          {
            success: false,
            error: "URLs guardadas pero falló al actualizar la orden",
            details: updateError.message,
          },
          { status: 500 },
        )
      }

      return NextResponse.json({ success: true, count: urls.length })
    }

    // mode = "append": subir archivos enviados en este request.
    const files: File[] = []
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File) {
        files.push(value)
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se enviaron archivos" },
        { status: 400 },
      )
    }

    // Validacion defensiva: si llegan archivos individualmente muy
    // grandes (>8MB), los rechazamos con un error claro en lugar de
    // dejar que el upstream se cuelgue.
    const tooBig = files.find((f) => f.size > 8 * 1024 * 1024)
    if (tooBig) {
      return NextResponse.json(
        {
          success: false,
          error: `La foto "${tooBig.name}" pesa más de 8MB. Reduce su tamaño antes de subir.`,
        },
        { status: 413 },
      )
    }

    const urls: string[] = []
    for (let index = 0; index < files.length; index++) {
      const file = files[index]
      const timestamp = Date.now()
      const extension = (file.name.split(".").pop() || "jpg").toLowerCase()
      const filename = `picking_${orderId}_${timestamp}_${index}_${Math.random()
        .toString(36)
        .slice(2, 8)}.${extension}`
      const filePath = `fotospicking/${filename}`

      const { error } = await supabaseAdmin.storage
        .from("archivos")
        .upload(filePath, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        })

      if (error) {
        console.error("[v0] Supabase upload error:", filePath, error)
        return NextResponse.json(
          {
            success: false,
            error: `Error al subir ${file.name}: ${error.message}`,
          },
          { status: 500 },
        )
      }

      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from("archivos").getPublicUrl(filePath)
      urls.push(publicUrl)
    }

    return NextResponse.json({ success: true, urls, count: urls.length })
  } catch (error) {
    console.error("[v0] Upload error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Upload failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

// Aumentamos el body limit del runtime nodejs al maximo razonable.
// El verdadero cuello de botella esta en el cliente subiendo de a 1.
export const runtime = "nodejs"
export const maxDuration = 60
