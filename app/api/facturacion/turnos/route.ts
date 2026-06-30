import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/client"
import { getCurrentEmpresaIdForInsert } from "@/lib/company-filter"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const selectedEmpresaId = searchParams.get("empresaId")
    
    const supabase = await createClient()
    const empresaId = selectedEmpresaId ? parseInt(selectedEmpresaId, 10) : await getCurrentEmpresaIdForInsert()

    console.log("[v0] Facturacion Turnos API: Filtering by empresaId:", empresaId)

    const { data, error } = await supabase
      .from("facturacionturnos")
      .select("id, fecha, nombre, puesto, hed, tarifaturno, tarifahoraextra, valorextra, facturacion_total, costo_total, utilidad, idempresa")
      .eq("idempresa", empresaId)
      .order("fecha", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching facturacion turnos:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("[v0] Facturacion Turnos API: Returning", data?.length || 0, "records for empresa", empresaId)
    return NextResponse.json(data || [])
  } catch (error) {
    console.error("[v0] Unexpected error in facturacion turnos API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
