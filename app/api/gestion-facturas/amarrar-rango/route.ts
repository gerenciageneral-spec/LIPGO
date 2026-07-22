import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

// Amarra UNA factura de Siigo a TODAS las órdenes "CF - Factura solicitada" de una
// empresa dentro de un rango de fechas (una factura de Siigo cubre varios días/solicitudes).
// Les fija `facturasiigo` (la misma URL) y cierra su estado a "CF - Cerrado".
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { idempresa, facturasiigo, desde, hasta, undo } = body as {
      idempresa?: number
      facturasiigo?: string
      desde?: string
      hasta?: string
      undo?: boolean
    }

    if (!idempresa) return NextResponse.json({ success: false, error: "idempresa es requerido" }, { status: 400 })
    if (!desde || !hasta) return NextResponse.json({ success: false, error: "Rango de fechas requerido (desde y hasta)" }, { status: 400 })
    if (!undo && !facturasiigo) return NextResponse.json({ success: false, error: "Primero sube la factura de Siigo" }, { status: 400 })

    const supabase = await getSupabaseAdmin()

    if (undo) {
      // DESHACER: revierte las órdenes cerradas CON factura Siigo del rango a "Factura solicitada".
      const { data: objetivo, error: selError } = await supabase
        .from("cabeceraoc")
        .select("id")
        .eq("idempresa", idempresa)
        .eq("estadofactura", "CF - Cerrado")
        .not("facturasiigo", "is", null)
        .gte("fechacargue", desde)
        .lte("fechacargue", hasta)
      if (selError) return NextResponse.json({ success: false, error: selError.message }, { status: 500 })
      const ids = (objetivo || []).map((o: any) => o.id)
      if (ids.length === 0) return NextResponse.json({ success: true, count: 0, message: "No hay órdenes amarradas en ese rango." })
      const { error: updError } = await supabase
        .from("cabeceraoc")
        .update({ facturasiigo: null, estadofactura: "CF - Factura solicitada" })
        .in("id", ids)
      if (updError) return NextResponse.json({ success: false, error: updError.message }, { status: 500 })
      return NextResponse.json({ success: true, count: ids.length })
    }

    // AMARRAR: órdenes "CF - Factura solicitada" del rango → factura Siigo + cerrar.
    const { data: objetivo, error: selError } = await supabase
      .from("cabeceraoc")
      .select("id, ordendecargue")
      .eq("idempresa", idempresa)
      .eq("estadofactura", "CF - Factura solicitada")
      .gte("fechacargue", desde)
      .lte("fechacargue", hasta)

    if (selError) return NextResponse.json({ success: false, error: selError.message }, { status: 500 })

    const ids = (objetivo || []).map((o: any) => o.id)
    if (ids.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No hay órdenes 'Factura solicitada' en ese rango." })
    }

    const { error: updError } = await supabase
      .from("cabeceraoc")
      .update({ facturasiigo, estadofactura: "CF - Cerrado" })
      .in("id", ids)

    if (updError) return NextResponse.json({ success: false, error: updError.message }, { status: 500 })

    return NextResponse.json({ success: true, count: ids.length })
  } catch (error) {
    console.error("Error en amarrar-rango:", error)
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 })
  }
}
