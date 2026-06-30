import { NextResponse } from "next/server"
import { getCurrentEmpresaData } from "@/lib/user-context"

export async function GET() {
  try {
    const empresaData = await getCurrentEmpresaData()
    return NextResponse.json(empresaData)
  } catch (error) {
    console.error("[v0] Error fetching empresa data:", error)
    return NextResponse.json(
      { nit: "890.204.199", direccion: "Dirección vía 40 # 67B-63", nombre: "LA INSUPERABLE" },
      { status: 500 },
    )
  }
}
