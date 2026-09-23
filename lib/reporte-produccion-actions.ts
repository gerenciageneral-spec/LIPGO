"use server"

// ---------------------------------------------------------------------------
// ENVÍO DEL CIERRE DIARIO DE PRODUCCIÓN
//
// Calcula las cifras del día, arma el PDF y lo manda por WhatsApp adjunto a la
// plantilla `resumen_produccion_dia`.
//
// LA EMPRESA ESTÁ FIJA EN 1 POR AHORA. Las cifras de producción NO están
// segmentadas por empresa --ninguna consulta del dashboard filtra por
// `idempresa`-- así que generar un PDF "por empresa" daría cuatro archivos con
// los mismos números y solo cambiaría el horario de tolva. Se manda uno solo,
// y cuando la producción se pueda atribuir por empresa se abre aquí.
// ---------------------------------------------------------------------------

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { construirPdfResumenProduccion } from "@/lib/resumen-produccion-pdf"
import { getResumenProduccionDia } from "@/lib/resumen-produccion-dia"
import { enviarPlantilla, getPlantillasDeMeta, subirArchivoAMeta } from "@/lib/whatsapp-actions"
import { utcDateStr } from "@/lib/paros-produccion"

const PLANTILLA = "resumen_produccion_dia"
const EMPRESA = 1
const EMPRESA_NOMBRE = "Harinera Indupan"

function fmtFecha(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

/**
 * La línea de resumen que va en el cuerpo del mensaje.
 *
 * El PDF trae el detalle; esto es lo que se lee sin abrirlo, en la
 * notificación del teléfono. Por eso son cuatro cifras y no diez.
 */
function armarResumen(r: Awaited<ReturnType<typeof getResumenProduccionDia>>["data"]): string {
  if (!r) return "Sin datos"
  const partes = [
    `${Math.round(r.totalBultos).toLocaleString("es-CO")} bultos`,
    `${r.cumplimientoPct.toFixed(0)}% de la meta`,
    `OEE ${r.oee.toFixed(0)}%`,
  ]
  if (r.parosTotal > 0) {
    const h = Math.floor(r.parosMinutos / 60)
    const m = Math.round(r.parosMinutos % 60)
    partes.push(`${r.parosTotal} paros (${h > 0 ? `${h}h ${m}m` : `${m}m`})`)
  }
  return partes.join(" · ")
}

/** El PDF del día, para descargarlo desde la pantalla. */
export async function getPdfResumenProduccion(
  fecha?: string,
): Promise<{ success: boolean; pdf?: string; nombre?: string; message?: string }> {
  try {
    const sb: any = await getSupabaseAdmin()
    const dia = fecha || utcDateStr()
    const r = await getResumenProduccionDia(sb, EMPRESA, dia)
    if (!r.success || !r.data) return { success: false, message: r.message }

    const buffer = await construirPdfResumenProduccion(r.data, EMPRESA_NOMBRE)
    return {
      success: true,
      // Base64 porque un server action no puede devolver un Buffer crudo.
      pdf: Buffer.from(buffer).toString("base64"),
      nombre: `Cierre produccion ${dia}.pdf`,
    }
  } catch (e: any) {
    console.error("[v0] getPdfResumenProduccion:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo generar el PDF." }
  }
}

/** Las cifras del día, para la vista previa de la pantalla. */
export async function getCifrasProduccionDia(fecha?: string) {
  const sb: any = await getSupabaseAdmin()
  return getResumenProduccionDia(sb, EMPRESA, fecha || utcDateStr())
}

/**
 * Manda el cierre del día por WhatsApp.
 *
 * NUNCA LANZA: la va a llamar una tarea programada, y un fallo hacia afuera
 * dejaría el error solo en los registros de Vercel, donde nadie mira.
 */
export async function enviarResumenProduccion(payload: {
  telefono: string
  fecha?: string
}): Promise<{ success: boolean; message?: string }> {
  try {
    const sb: any = await getSupabaseAdmin()
    const dia = payload.fecha || utcDateStr()

    // --- 1) Las cifras -----------------------------------------------------
    const r = await getResumenProduccionDia(sb, EMPRESA, dia)
    if (!r.success || !r.data) {
      return { success: false, message: r.message ?? "No se pudieron calcular las cifras." }
    }

    // Un día sin producción no se manda: el mensaje se cobra igual y un PDF en
    // ceros no informa nada que no diga su ausencia.
    if (r.data.totalBultos === 0) {
      return { success: false, message: `El ${fmtFecha(dia)} no registra producción.` }
    }

    // --- 2) La plantilla ---------------------------------------------------
    // El idioma y el formato de las variables se leen de Meta: `en`, `es` y
    // `es_CO` son plantillas distintas y mandar el equivocado falla con un
    // error que no dice cuál es el problema.
    const meta = await getPlantillasDeMeta()
    if (!meta.success) {
      return { success: false, message: `No se pudo consultar a Meta: ${meta.message ?? ""}` }
    }
    const propia = meta.data?.find((t) => t.nombre === PLANTILLA && t.estado === "APPROVED")
    if (!propia) {
      const otra = meta.data?.find((t) => t.nombre === PLANTILLA)
      return {
        success: false,
        message: otra
          ? `La plantilla "${PLANTILLA}" está en estado ${otra.estado} en Meta, no aprobada.`
          : `No existe una plantilla llamada "${PLANTILLA}" en Meta.`,
      }
    }

    // --- 3) El PDF ---------------------------------------------------------
    const buffer = await construirPdfResumenProduccion(r.data, EMPRESA_NOMBRE)
    const subida = await subirArchivoAMeta(Buffer.from(buffer), "application/pdf")
    if (!subida.success || !subida.mediaId) {
      return { success: false, message: subida.message ?? "No se pudo subir el PDF." }
    }

    // --- 4) El envío -------------------------------------------------------
    const body = [fmtFecha(dia), armarResumen(r.data)]
    const nombresBody =
      propia.conNombre
        ? propia.varsBody.length === body.length
          ? propia.varsBody
          : ["fecha", "resumen"]
        : undefined

    const env = await enviarPlantilla({
      empresaId: EMPRESA,
      telefono: payload.telefono,
      plantilla: PLANTILLA,
      idioma: propia.idioma,
      headerDocId: subida.mediaId,
      headerDocNombre: `Cierre produccion ${dia}.pdf`,
      body,
      nombresBody,
      origen: "produccion:cierre_dia",
    })

    if (!env.success) return { success: false, message: env.message }
    return { success: true }
  } catch (e: any) {
    console.error("[v0] enviarResumenProduccion:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo enviar el resumen." }
  }
}
