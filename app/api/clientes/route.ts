export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { fetchClientes } from "@/lib/config-actions"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const result = await fetchClientes()
    return NextResponse.json(result)
  } catch (error) {
    console.error("[API] Error fetching clientes:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
