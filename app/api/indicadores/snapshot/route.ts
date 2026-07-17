import { type NextRequest, NextResponse } from "next/server"
import { snapshotIndicadoresHistorico } from "@/lib/sig-actions"

// Congela la serie histórica de indicadores del BSC.
//  - POST /api/indicadores/snapshot            → mes actual
//  - POST /api/indicadores/snapshot?anio=2026&mes=6   → un mes puntual
//  - POST /api/indicadores/snapshot?anio=2026&backfill=1  → ene..mes actual del año
// Pensado para un cron mensual (o backfill manual). LIP (100).
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const anio = Number(searchParams.get("anio")) || now.getFullYear()
    const backfill = searchParams.get("backfill") === "1"
    const mesParam = Number(searchParams.get("mes"))

    const hastaMes = anio === now.getFullYear() ? now.getMonth() + 1 : 12
    const meses = backfill
      ? Array.from({ length: hastaMes }, (_, i) => i + 1)
      : [mesParam && mesParam >= 1 && mesParam <= 12 ? mesParam : now.getMonth() + 1]

    const resultados: { mes: number; count: number; error?: string }[] = []
    for (const mes of meses) {
      const r = await snapshotIndicadoresHistorico(anio, mes)
      resultados.push({ mes, count: r.count, error: r.error })
    }
    return NextResponse.json({ success: true, anio, resultados })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Error" }, { status: 500 })
  }
}
