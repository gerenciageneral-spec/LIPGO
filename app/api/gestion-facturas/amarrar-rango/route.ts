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

    // UPDATE directo por FILTROS (no por lista de ids): un SELECT previo se topa en
    // 1000 filas y dejaba el resto del rango sin amarrar/deshacer en silencio. El
    // UPDATE por filtros afecta TODAS las filas que cumplen y `count: "exact"` devuelve
    // el total real actualizado, sin el tope de 1000 de las lecturas.
    if (undo) {
      // DESHACER: revierte las órdenes cerradas CON factura Siigo del rango a "Factura solicitada".
      const { count, error: updError } = await supabase
        .from("cabeceraoc")
        .update({ facturasiigo: null, estadofactura: "CF - Factura solicitada" }, { count: "exact" })
        .eq("idempresa", idempresa)
        .eq("estadofactura", "CF - Cerrado")
        .not("facturasiigo", "is", null)
        .gte("fechacargue", desde)
        .lte("fechacargue", hasta)
      if (updError) return NextResponse.json({ success: false, error: updError.message }, { status: 500 })
      if (!count) return NextResponse.json({ success: true, count: 0, message: "No hay órdenes amarradas en ese rango." })
      return NextResponse.json({ success: true, count })
    }

    // AMARRAR: órdenes "CF - Factura solicitada" del rango → factura Siigo + cerrar.
    const { count, error: updError } = await supabase
      .from("cabeceraoc")
      .update({ facturasiigo, estadofactura: "CF - Cerrado" }, { count: "exact" })
      .eq("idempresa", idempresa)
      .eq("estadofactura", "CF - Factura solicitada")
      .gte("fechacargue", desde)
      .lte("fechacargue", hasta)

    if (updError) return NextResponse.json({ success: false, error: updError.message }, { status: 500 })
    if (!count) {
      return NextResponse.json({ success: true, count: 0, message: "No hay órdenes 'Factura solicitada' en ese rango." })
    }

    return NextResponse.json({ success: true, count })
  } catch (error) {
    console.error("Error en amarrar-rango:", error)
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 })
  }
}
