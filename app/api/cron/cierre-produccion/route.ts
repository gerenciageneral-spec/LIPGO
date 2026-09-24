import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { enviarCierreATodos } from "@/lib/reporte-produccion-actions"
import { utcDateStr } from "@/lib/paros-produccion"

// CIERRE DIARIO DE PRODUCCIÓN — envío automático.
//
// Corre a las 20:00 de Colombia (01:00 UTC del día siguiente, ver vercel.json)
// y manda el PDF del cierre a los destinatarios configurados.
//
// LA HORA VIVE EN DOS SITIOS, Y ES A PROPÓSITO. `vercel.json` decide CUÁNDO
// corre; `cierre_produccion_config.hora_envio` decide si el cron acepta
// mandar. Parece redundante, pero es lo que evita que un despliegue con el
// cron mal programado suelte el reporte a las 3 de la mañana: si las dos no
// coinciden, no se manda nada y queda escrito por qué.
//
// FALLA CERRADO SIN `CRON_SECRET`, igual que el cron de anexos: este endpoint
// manda mensajes que se cobran, así que sin forma de comprobar quién llama, no
// corre.

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron/cierre-produccion] CRON_SECRET no configurado -- no corre (falla cerrado).")
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const sb: any = await getSupabaseAdmin()

    const { data: cfg, error } = await sb
      .from("cierre_produccion_config")
      .select("activo, hora_envio")
      .eq("id", 1)
      .maybeSingle()

    if (error || !cfg) {
      return NextResponse.json({
        ok: true,
        omitido: "Sin configuración. ¿Falta correr scripts/197?",
      })
    }

    if (!cfg.activo) {
      return NextResponse.json({ ok: true, omitido: "El envío automático está desactivado." })
    }

    /*
     * ¿Es la hora configurada?
     *
     * Se compara solo la HORA, no los minutos: Vercel no garantiza el minuto
     * exacto en que dispara un cron, y exigir coincidencia al minuto haría que
     * algunos días no saliera nada.
     */
    const ahora = new Date().toLocaleTimeString("en-GB", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    const horaAhora = Number(ahora.slice(0, 2))
    const horaCfg = Number(String(cfg.hora_envio ?? "20:00").slice(0, 2))

    if (horaAhora !== horaCfg) {
      return NextResponse.json({
        ok: true,
        omitido: `No es la hora configurada (son las ${ahora}, está puesto a las ${String(cfg.hora_envio).slice(0, 5)}). Revisa que vercel.json y la configuración coincidan.`,
      })
    }

    // El día de HOY en Colombia. El cron corre a la 1 UTC, que ya es el día
    // siguiente: sin esto, se mandaría el cierre de un día sin producción.
    const dia = utcDateStr()
    const r = await enviarCierreATodos({ fecha: dia, origen: "automatico" })

    return NextResponse.json({
      ok: true,
      fecha: dia,
      enviados: r.enviados,
      fallidos: r.fallidos,
      ...(r.message ? { message: r.message } : {}),
    })
  } catch (e: any) {
    console.error("[cron/cierre-produccion]", e?.message ?? e)
    // 200 a propósito: un 500 hace que Vercel reintente, y cada reintento
    // podría mandar mensajes de nuevo.
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" })
  }
}
