import { type NextRequest, NextResponse } from "next/server"
import { checkModulePermission } from "@/lib/permissions-actions"
import { fetchReportePdf, type TipoReportePdf } from "@/lib/compliance"

export const maxDuration = 300

// Descarga del PDF de Compliance (Completo / Resumido / Analista básico) para un
// idDatoConsultado. Se pide con Bearer server-side y se reenvía el binario al
// cliente (patrón de app/api/file/route.ts). El token nunca sale del servidor.
export async function GET(request: NextRequest) {
  try {
    if (!(await checkModulePermission("Antecedentes"))) {
      return NextResponse.json({ error: "No tienes permiso" }, { status: 403 })
    }

    const id = request.nextUrl.searchParams.get("id")
    const tipoRaw = (request.nextUrl.searchParams.get("tipo") || "completo") as TipoReportePdf
    const tipo: TipoReportePdf = ["completo", "resumido", "analista"].includes(tipoRaw) ? tipoRaw : "completo"
    if (!id) {
      return NextResponse.json({ error: "Falta el id del dato consultado" }, { status: 400 })
    }

    const res = await fetchReportePdf(id, tipo)
    if (!res.ok || !res.body) {
      return NextResponse.json({ error: `No se pudo obtener el PDF (HTTP ${res.status})` }, { status: 502 })
    }

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-cache",
        "Content-Disposition": `attachment; filename="antecedentes-${id}-${tipo}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("[v0] Error en GET /api/antecedentes/reporte-pdf:", error?.message)
    return NextResponse.json({ error: error?.message || "Error al descargar el PDF" }, { status: 502 })
  }
}
