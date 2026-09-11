import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdminAsSystem } from "@/lib/supabase-admin"
import { registrarEventoCiclo } from "@/lib/ciclo-facturacion-actions"
import { ownerDePrefactura } from "@/lib/ciclo-facturacion-shared"
import { construirPdfAnexoFacturacion } from "@/lib/anexo-facturacion-pdf"

/**
 * CRON DIARIO -- envía automáticamente el anexo (evento `anexo_enviado`) de
 * las prefacturas YA APROBADAS por una persona (estado='aprobada') que están
 * esperando su anexo (estado_ciclo='pendiente_anexo').
 *
 * Corre TODOS LOS DÍAS (ver vercel.json), pero cada proyecto tiene su propia
 * frecuencia configurable desde la app (tabla `condiciones_envio_anexo`,
 * panel "Frecuencia de envío de anexos" en Ciclo de Facturación) -- diario o
 * un día fijo de la semana. Sin config guardada, el default es semanal-lunes.
 *
 * Lo único que automatiza es la GENERACIÓN Y ENVÍO DEL DOCUMENTO (mismo
 * cálculo/agrupación que ya existe, a partir del `soporte` congelado de la
 * prefactura) -- los NÚMEROS de la prefactura los sigue creando y aprobando
 * una persona en Cuadro de Control; esto no toca esa parte.
 */

const DIA_SEMANA_DEFAULT = 1 // lunes

function diaSemanaColombiaHoy(): number {
  const ahora = new Date()
  const colombia = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }))
  return colombia.getDay()
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron/anexos-pendientes] CRON_SECRET no configurado -- el cron no puede correr (falla cerrado).")
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const resultados: { procesadas: number; omitidas: number; noLeToca: number; errores: { id: number; error: string }[] } = {
    procesadas: 0,
    omitidas: 0,
    noLeToca: 0,
    errores: [],
  }

  try {
    const sb: any = await getSupabaseAdminAsSystem()
    const hoy = diaSemanaColombiaHoy()

    const { data: condiciones } = await sb.from("condiciones_envio_anexo").select("idempresa, frecuencia, dia_semana")
    const condicionPorEmpresa = new Map<number, { frecuencia: string; dia_semana: number | null }>()
    for (const c of condiciones || []) condicionPorEmpresa.set(c.idempresa, c)

    const { data: candidatas, error: errCand } = await sb
      .from("prefacturas")
      .select("id, idempresa, proyecto, periodo_desde, periodo_hasta, soporte, lineas")
      .eq("estado", "aprobada")
      .eq("estado_ciclo", "pendiente_anexo")

    if (errCand) {
      return NextResponse.json({ error: errCand.message }, { status: 500 })
    }

    for (const p of candidatas || []) {
      try {
        const cond = condicionPorEmpresa.get(p.idempresa)
        const frecuencia = cond?.frecuencia || "semanal"
        const diaSemana = cond ? cond.dia_semana : DIA_SEMANA_DEFAULT
        const leToca = frecuencia === "diario" || diaSemana === hoy
        if (!leToca) {
          resultados.noLeToca++
          continue
        }

        if (!p.soporte?.length) {
          resultados.omitidas++
          continue
        }

        const { owner } = ownerDePrefactura(p.lineas)
        const { data: empresa } = await sb.from("empresas_permisos").select("nombre, nit, direccion").eq("id", p.idempresa).maybeSingle()

        const buffer = await construirPdfAnexoFacturacion({
          empresaProyecto: { nombre: empresa?.nombre || p.proyecto || `Empresa ${p.idempresa}`, nit: empresa?.nit ?? null, direccion: empresa?.direccion ?? null },
          proyecto: p.proyecto || "",
          owner,
          periodoDesde: p.periodo_desde,
          periodoHasta: p.periodo_hasta,
          soporte: p.soporte,
        })

        const path = `ciclo_facturacion/anexo_enviado/prefactura_${p.id}_${Date.now()}.pdf`
        const { error: errUpload } = await sb.storage.from("archivos").upload(path, Buffer.from(buffer), {
          contentType: "application/pdf",
          upsert: true,
        })
        if (errUpload) throw new Error(`Storage: ${errUpload.message}`)

        const { data: pub } = sb.storage.from("archivos").getPublicUrl(path)
        const nombre = `Anexo_${owner}_${p.id}.pdf`.replace(/[^a-zA-Z0-9_.-]+/g, "_")

        const r = await registrarEventoCiclo(p.id, "anexo_enviado", [{ url: pub.publicUrl, nombre }], "sistema (cron diario)")
        if (!r.success) throw new Error(r.message || "registrarEventoCiclo falló")

        resultados.procesadas++
      } catch (e: any) {
        resultados.errores.push({ id: p.id, error: e?.message || String(e) })
      }
    }

    return NextResponse.json(resultados)
  } catch (error: any) {
    console.error("[cron/anexos-pendientes] error fatal:", error)
    return NextResponse.json({ error: error?.message || "Error inesperado", ...resultados }, { status: 500 })
  }
}
