import { type NextRequest, NextResponse } from "next/server"
import { snapshotIndicadoresHistorico } from "@/lib/sig-actions"

// GET → lo invoca el CRON de Vercel (día 1 de cada mes): congela el mes que
// ACABA DE CERRAR (el mes anterior al día 1 en que corre), no el mes que
// apenas empieza -- si no, cada snapshot mensual queda con 0-1 día de datos,
// congelado para siempre (bug real encontrado 2026-09-04: mayo-sep quedaron
// planos en casi cero en la tendencia de todos los indicadores del BSC).
// Si hay CRON_SECRET configurado, exige el header Authorization: Bearer <secret>
// (Vercel lo envía automáticamente). Sin CRON_SECRET, queda abierto.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "no autorizado" }, { status: 401 })
  }
  const now = new Date()
  const mesAnterior = now.getMonth() === 0 ? 12 : now.getMonth()
  const anioMesAnterior = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const r = await snapshotIndicadoresHistorico(anioMesAnterior, mesAnterior)
  return NextResponse.json({ success: r.success, periodo: `${anioMesAnterior}-${mesAnterior}`, count: r.count, error: r.error })
}

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
