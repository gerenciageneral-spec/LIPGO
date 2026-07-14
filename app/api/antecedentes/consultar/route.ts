import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert, getCurrentUsuarioForInsert } from "@/lib/user-context"
import { checkModulePermission } from "@/lib/permissions-actions"
import { consultarConsolidada, getScoreRiesgo, fetchReportePdf } from "@/lib/compliance"

// La consulta consolidada de Compliance puede tardar (timeout del servicio hasta
// 420 s). Damos el máximo que permita el plan de Vercel.
export const maxDuration = 300

// CONSULTAR ANTECEDENTES: token -> consulta consolidada (todos los resultados)
// -> score de riesgo -> descarga del PDF Completo (se guarda en Storage) y se
// persiste la consulta en `antecedentes_consultas`. Todo server-side: las
// credenciales/token de Compliance nunca llegan al navegador.
export async function POST(request: NextRequest) {
  try {
    if (!(await checkModulePermission("Antecedentes"))) {
      return NextResponse.json({ error: "No tienes permiso para consultar antecedentes" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))

    // Código de acceso que protege la investigación (validación autoritativa).
    const codigo = String(body?.codigo || "")
    const expected = process.env.COMPLIANCE_ACCESS_CODE
    if (!expected || codigo !== expected) {
      return NextResponse.json({ error: "Código de acceso incorrecto." }, { status: 403 })
    }

    const cedula = String(body?.cedula || "").trim()
    const nombre = String(body?.nombre || "").trim()
    const tipoDocumento = String(body?.tipoDocumento || "cc").trim() || "cc"
    const hojaVidaId = body?.hojaVidaId ? String(body.hojaVidaId) : null
    if (!cedula) {
      return NextResponse.json({ error: "Debes escribir el número de documento" }, { status: 400 })
    }

    const empresaIdRaw = body?.empresaId ? Number(body.empresaId) : NaN
    const empresaId = !Number.isNaN(empresaIdRaw) ? empresaIdRaw : await getCurrentEmpresaIdForInsert()
    const usuario = await getCurrentUsuarioForInsert()

    // 1) Consulta consolidada (soloRiesgo=false = todos los resultados).
    const consolidado = await consultarConsolidada({ tipoDocumento, datoConsultar: cedula, codigoPais: "COL", nombre: nombre || undefined })

    // 2) Score de riesgo (informativo; null si falla).
    const score = consolidado?.idDatoConsultado ? await getScoreRiesgo(consolidado.idDatoConsultado) : null

    // 3) Persistir: PDF Completo a Storage + fila en antecedentes_consultas.
    // Si algo del guardado falla, igual devolvemos el resultado al usuario.
    let pdfUrl: string | null = null
    let guardado = false
    let avisoGuardado: string | null = null
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      const folderKey = cedula.replace(/[^\w.\-]+/g, "_")

      if (consolidado?.idDatoConsultado) {
        const pdfRes = await fetchReportePdf(consolidado.idDatoConsultado, "completo")
        if (pdfRes.ok) {
          const bytes = new Uint8Array(await pdfRes.arrayBuffer())
          const filePath = `antecedentes/consultas/${empresaId}/${folderKey}/${consolidado.idDatoConsultado}-${Date.now()}.pdf`
          const { error: upErr } = await supabaseAdmin.storage
            .from("archivos")
            .upload(filePath, bytes, { contentType: "application/pdf", upsert: true })
          if (!upErr) {
            pdfUrl = supabaseAdmin.storage.from("archivos").getPublicUrl(filePath).data.publicUrl
          }
        }
      }

      const { error: insErr } = await supabaseAdmin.from("antecedentes_consultas").insert({
        idempresa: empresaId,
        hoja_vida_id: hojaVidaId,
        cedula,
        tipo_documento: tipoDocumento,
        nombre: consolidado?.nombre || nombre || null,
        id_dato_consultado: consolidado?.idDatoConsultado ?? null,
        id_consulta: consolidado?.idConsulta ?? null,
        presenta_riesgo: consolidado?.presentaRiesgo ?? null,
        pep: consolidado?.pep ?? null,
        is_menor_edad: consolidado?.isMenorEdad ?? null,
        total_fuentes_consultadas: consolidado?.totalFuentesConsultadas ?? null,
        total_fuentes_con_error: consolidado?.totalFuentesConError ?? null,
        score_riesgo: score?.scoreRiesgo ?? null,
        ro: score?.["%RO"] ?? null,
        laft: score?.["%LAFT"] ?? null,
        rr: score?.["%RR"] ?? null,
        mostrar_score: score?.mostrarScore ?? null,
        resultado_json: consolidado ?? null,
        pdf_url: pdfUrl,
        consultado_por: usuario,
      })
      if (insErr) avisoGuardado = "La consulta se realizó, pero no se pudo guardar el historial."
      else guardado = true
    } catch (persistErr: any) {
      console.error("[v0] antecedentes/consultar persistencia:", persistErr?.message)
      avisoGuardado = "La consulta se realizó, pero no se pudo guardar el historial."
    }

    return NextResponse.json({ success: true, consolidado, score, pdfUrl, guardado, aviso: avisoGuardado })
  } catch (error: any) {
    console.error("[v0] Error en POST /api/antecedentes/consultar:", error?.message)
    return NextResponse.json({ error: error?.message || "No se pudo consultar antecedentes" }, { status: 502 })
  }
}
