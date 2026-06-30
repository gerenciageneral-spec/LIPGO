import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-client"

export async function GET() {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from("empresas_permisos")
      .select("id, nombre")
      .order("nombre", { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("[v0] Error fetching empresas_permisos:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch empresas_permisos" }, { status: 500 })
  }
}
