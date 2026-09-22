"use server"

// ---------------------------------------------------------------------------
// ENCUESTA PÚBLICA DEL CONDUCTOR
//
// El conductor abre un enlace desde el WhatsApp de fin de cargue y califica.
// La respuesta entra a `sig_satisfaccion` con `tipo = 'conductor'`, la MISMA
// tabla que ya alimenta el KPI de Satisfacción y PQRSF.
//
// LA PÁGINA ES PÚBLICA: no hay sesión ni permiso. Eso obliga a dos cosas.
//
//  1. EL ENLACE NO PUEDE LLEVAR EL id DE LA ORDEN. Con `/encuesta/4451`
//     cualquiera podría recorrer 4450, 4449... y ver quién condujo qué. Se usa
//     un token opaco derivado de la orden.
//
//  2. LA PÁGINA DEVUELVE LO MÍNIMO. Nombre de pila y placa, para que el
//     conductor confirme que es su cargue. Ni el cliente, ni el peso, ni los
//     auxiliares: nada que no necesite para calificar.
//
// SE GUARDA EN `ref_orden`, NO EN UNA COLUMNA PROPIA. Esa columna ya la creó
// scripts/sig/33 para el kiosko, junto con el índice único que impide calificar
// dos veces el mismo cargue. Con una columna aparte habría dos índices únicos
// vigilando por separado, y el mismo cargue calificado en kiosko y por WhatsApp
// contaría dos veces en el indicador.
//
// `ref_orden` guarda `cabeceraoc.ordendecargue` --el código, no el id--, que es
// lo que ya escribe el kiosko.
// ---------------------------------------------------------------------------

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import crypto from "crypto"

/**
 * Token del enlace.
 *
 * HMAC de la orden con el secreto del servidor. No es cifrado --el id no viaja
 * dentro-- sino una firma: para encontrar la orden se busca cuál produce ese
 * token. Así el enlace no se puede fabricar ni recorrer.
 *
 * Se usa `WHATSAPP_APP_SECRET` porque ya existe y no sale del servidor. Si
 * faltara, se cae a una constante: la encuesta no es información sensible, y es
 * preferible que funcione a que quede muerta sin decir por qué.
 */
function secreto(): string {
  return process.env.WHATSAPP_APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "lipgo-encuesta"
}

function tokenDeOrden(ordenId: number): string {
  return crypto
    .createHmac("sha256", secreto())
    .update(`encuesta:${ordenId}`)
    .digest("hex")
    .slice(0, 24)
}

/** Token público para el enlace de una orden. */
export async function getTokenEncuesta(ordenId: number): Promise<string> {
  return tokenDeOrden(ordenId)
}

export interface DatosEncuesta {
  /** Nombre de pila, para saludar. */
  conductor: string | null
  placa: string | null
  /** true = ya calificó esta orden. */
  yaRespondida: boolean
}

/** Lo que identifica la orden en `sig_satisfaccion.ref_orden`. */
type OrdenEncontrada = { id: number; refOrden: string }

/**
 * Datos mínimos para pintar la encuesta.
 *
 * Busca la orden cuyo token coincide. Se acota a las órdenes CERRADAS de los
 * últimos 30 días: no tiene sentido calificar un cargue que no ha terminado, y
 * acotar reduce cuánto hay que recorrer.
 */
export async function getEncuestaPorToken(
  token: string,
): Promise<{ success: boolean; data?: DatosEncuesta; orden?: OrdenEncontrada; message?: string }> {
  if (!token || token.length !== 24) return { success: false, message: "El enlace no es válido." }

  try {
    const sb: any = await getSupabaseAdmin()
    const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

    const { data: ordenes } = await sb
      .from("cabeceraoc")
      .select("id, ordendecargue, conductor, placa, fechacargue")
      .gte("fechacargue", hace30)
      .not("fincargue", "is", null)
      .order("id", { ascending: false })
      .limit(5000)

    const orden = (ordenes ?? []).find((o: any) => tokenDeOrden(Number(o.id)) === token)
    if (!orden) {
      return {
        success: false,
        message: "Este enlace ya no está disponible. Las encuestas se pueden responder hasta 30 días después del cargue.",
      }
    }

    // Sin código de orden no hay nada que escribir en `ref_orden`, y sin eso la
    // respuesta entraría sin el candado que impide calificar dos veces.
    const refOrden = String(orden.ordendecargue ?? "").trim()
    if (!refOrden) {
      return { success: false, message: "Este cargue no se puede calificar." }
    }

    const { data: ya } = await sb
      .from("sig_satisfaccion")
      .select("id")
      .eq("ref_orden", refOrden)
      .maybeSingle()

    return {
      success: true,
      orden: { id: Number(orden.id), refOrden },
      data: {
        // Solo el primer nombre: basta para saludar y evita mostrar el nombre
        // completo de una persona en una página sin autenticación.
        conductor: String(orden.conductor ?? "").trim().split(/\s+/)[0] || null,
        placa: orden.placa ?? null,
        yaRespondida: !!ya,
      },
    }
  } catch (e: any) {
    console.error("[v0] getEncuestaPorToken:", e?.message ?? e)
    return { success: false, message: "No se pudo abrir la encuesta." }
  }
}

export interface RespuestaEncuesta {
  token: string
  /** 1 a 5. Es la que alimenta el indicador. */
  calificacion: number
  /** Aspectos, opcionales. */
  oportunidad?: number | null
  comunicacion?: number | null
  recomendaria?: boolean | null
  comentario?: string | null
}

/** Guarda la respuesta del conductor. */
export async function guardarEncuestaConductor(
  r: RespuestaEncuesta,
): Promise<{ success: boolean; message?: string }> {
  const cal = Number(r.calificacion)
  if (!Number.isFinite(cal) || cal < 1 || cal > 5) {
    return { success: false, message: "Selecciona una calificación." }
  }

  const buscado = await getEncuestaPorToken(r.token)
  if (!buscado.success || !buscado.orden) {
    return { success: false, message: buscado.message ?? "El enlace no es válido." }
  }
  if (buscado.data?.yaRespondida) {
    return { success: false, message: "Esta encuesta ya fue respondida. Gracias." }
  }

  try {
    const sb: any = await getSupabaseAdmin()

    // Se relee la orden para tomar el proyecto: el KPI agrupa por `proyecto_id`,
    // así que sin él la respuesta se guardaría pero no contaría en ningún
    // indicador.
    const { data: orden } = await sb
      .from("cabeceraoc")
      .select("id, idempresa, conductor, placa, ordendecargue")
      .eq("id", buscado.orden.id)
      .maybeSingle()
    if (!orden) return { success: false, message: "No se encontró el cargue." }

    const limpiar = (v: unknown, max = 500) =>
      String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null

    const { error } = await sb.from("sig_satisfaccion").insert({
      proyecto_id: Number(orden.idempresa),
      tipo: "conductor",
      fecha: new Date().toISOString().slice(0, 10),
      encuestado: limpiar(orden.conductor, 120) ?? limpiar(orden.placa, 20),
      calificacion: cal,
      oportunidad: r.oportunidad ?? null,
      comunicacion: r.comunicacion ?? null,
      recomendaria: r.recomendaria ?? null,
      comentario: limpiar(r.comentario),
      // `canal` distingue de dónde vino la respuesta. Aquí la escribió el
      // conductor en su celular; 'kiosko' es el dispositivo de LIP en sitio y
      // 'telefonico'/'presencial' son las que transcribe alguien de LIP. Es la
      // diferencia entre lo que dijo el conductor y lo que alguien interpretó.
      canal: "encuesta_conductor",
      responsable: null,
      // El KPI filtra por activo = true.
      activo: true,
      // La misma columna que usa el kiosko, y por tanto el mismo índice único:
      // un cargue no se puede calificar dos veces, venga de donde venga.
      ref_orden: buscado.orden.refOrden,
      placa: limpiar(orden.placa, 20),
    })

    if (error) {
      const msg = String(error.message ?? "")
      // El índice único por orden puede rechazarlo si alguien envió dos veces
      // seguidas. No es un error que deba ver el conductor.
      if (msg.includes("uq_sig_satisfaccion_ref_orden")) {
        return { success: false, message: "Esta encuesta ya fue respondida. Gracias." }
      }
      // La tabla la crea sig/15 y la columna sig/33. Decir cuál falta ahorra
      // rastrear un "column does not exist" hasta el script correcto.
      if (/ref_orden|sig_satisfaccion/i.test(msg)) {
        return {
          success: false,
          message:
            "Falta correr scripts/sig/15_satisfaccion_pqrsf.sql y scripts/sig/33_calificacion_conductor.sql.",
        }
      }
      return { success: false, message: msg }
    }

    return { success: true }
  } catch (e: any) {
    console.error("[v0] guardarEncuestaConductor:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo guardar la respuesta." }
  }
}
