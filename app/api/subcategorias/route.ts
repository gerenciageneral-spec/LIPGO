export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { fetchSubcategorias } from "@/lib/config-actions"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const result = await fetchSubcategorias()
    return NextResponse.json(result)
  } catch (error) {
    console.error("[API] Error fetching subcategorias:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
