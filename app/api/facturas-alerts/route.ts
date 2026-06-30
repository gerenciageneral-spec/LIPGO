import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const empresaId = searchParams.get("empresaId")

    if (!empresaId) {
      return NextResponse.json({ alerts: [], count: 0 })
    }

    const supabase = await createClient()

    // Get count of all pending orders (estadofactura is null means "Pendiente por procesar")
    const { count, error: countError } = await supabase
      .from("cabeceraoc")
      .select("id", { count: "exact", head: true })
      .eq("idempresa", parseInt(empresaId, 10))
      .is("estadofactura", null)
      .neq("tipooperacion", "proyeccion")

    if (countError) {
      console.error("[v0] Error counting pending facturas:", countError)
      return NextResponse.json({ alerts: [], count: 0 })
    }

    // Get first 5 pending orders for display (estadofactura is null)
    const { data, error } = await supabase
      .from("cabeceraoc")
      .select("id, ordendecargue, placa, transporte, tipooperacion, fechaorden")
      .eq("idempresa", parseInt(empresaId, 10))
      .is("estadofactura", null)
      .neq("tipooperacion", "proyeccion")
      .order("id", { ascending: false })
      .limit(5)

    if (error) {
      console.error("[v0] Error fetching pending facturas:", error)
      return NextResponse.json({ alerts: [], count: 0 })
    }

    return NextResponse.json({ 
      alerts: data || [], 
      count: count || 0 
    })
  } catch (error) {
    console.error("[v0] Error in facturas-alerts:", error)
    return NextResponse.json({ alerts: [], count: 0 }, { status: 500 })
  }
}
