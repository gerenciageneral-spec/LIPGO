"use server"

// ---------------------------------------------------------------------------
// NOTIFICACIÓN AL CONDUCTOR
//
// Dos avisos automáticos por WhatsApp:
//   · muelle_asignado    — al asignarle un muelle al vehículo
//   · cargue_finalizado  — al cerrar la orden, con la encuesta
//
// TRES GUARDAS, EN ESTE ORDEN:
//   1. El evento tiene que estar ACTIVO.
//   2. La empresa tiene que estar en la lista de habilitadas.
//   3. Si hay `telefono_prueba`, el aviso se DESVÍA ahí.
//
// UN FALLO DEL AVISO NO PUEDE ROMPER LA OPERACIÓN. Asignar un muelle y cerrar
// una orden son acciones críticas: si WhatsApp está caído o el token caducó,
// eso no puede impedir que el coordinador trabaje. Por eso todo va envuelto en
// try/catch y `notificarConductor` nunca lanza.
// ---------------------------------------------------------------------------

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUsuarioForInsert } from "@/lib/user-context"
import { enviarAvisoEstandar, normalizarTelefono } from "@/lib/whatsapp-actions"
import { getTokenEncuesta } from "@/lib/encuesta-conductor-actions"
import type {
  ConfigConductor,
  ContextoOrden,
  EventoConductor,
  ResultadoAviso,
} from "@/lib/notificacion-conductor-tipos"

function faltaTabla(msg: string | undefined): boolean {
  const m = String(msg ?? "").toLowerCase()
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation")
}

function mapear(r: any): ConfigConductor {
  return {
    id: Number(r.id),
    evento: r.evento,
    nombre: r.nombre,
    activo: r.activo === true,
    mensaje: r.mensaje ?? "",
    titulo: r.titulo ?? "LIP Logística",
    urlEncuesta: r.url_encuesta ?? null,
    empresas: Array.isArray(r.empresas) ? r.empresas.map(Number) : [],
    telefonoPrueba: r.telefono_prueba ?? null,
    actualizadoPor: r.actualizado_por ?? null,
  }
}

/** Configuración de los dos eventos. */
export async function getConfigConductor(): Promise<{
  success: boolean
  data?: ConfigConductor[]
  faltaMigracion?: boolean
  message?: string
}> {
  try {
    const sb: any = await getSupabaseAdmin()
    const { data, error } = await sb
      .from("notificaciones_conductor_config")
      .select("*")
      .order("evento", { ascending: true })
    if (error) {
      if (faltaTabla(error.message)) return { success: true, data: [], faltaMigracion: true }
      return { success: false, message: error.message }
    }
    return { success: true, data: (data ?? []).map(mapear) }
  } catch (e: any) {
    return { success: false, message: e?.message || "No se pudo leer la configuración." }
  }
}

/** Guarda la configuración de un evento. */
export async function guardarConfigConductor(payload: {
  evento: EventoConductor
  activo: boolean
  mensaje: string
  titulo: string
  urlEncuesta?: string | null
  empresas: number[]
  telefonoPrueba?: string | null
}): Promise<{ success: boolean; message?: string }> {
  try {
    if (!payload.mensaje?.trim()) return { success: false, message: "El mensaje no puede estar vacío." }

    // Activar sin empresas habilitadas no enviaría nada y parecería roto.
    if (payload.activo && payload.empresas.length === 0) {
      return {
        success: false,
        message: "Selecciona al menos una empresa antes de activar el aviso.",
      }
    }

    // El desvío de pruebas se normaliza igual que cualquier destino: un número
    // mal escrito acá haría fallar TODOS los avisos del evento.
    let telefonoPrueba: string | null = null
    if (payload.telefonoPrueba?.trim()) {
      telefonoPrueba = await normalizarTelefono(payload.telefonoPrueba)
      if (!telefonoPrueba) {
        return { success: false, message: "El teléfono de pruebas no es un número válido." }
      }
    }

    const sb: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert().catch(() => null)
    const { error } = await sb
      .from("notificaciones_conductor_config")
      .update({
        activo: payload.activo,
        mensaje: payload.mensaje.trim(),
        titulo: payload.titulo?.trim() || "LIP Logística",
        url_encuesta: payload.urlEncuesta?.trim() || null,
        empresas: payload.empresas,
        telefono_prueba: telefonoPrueba,
        actualizado_por: usuario,
        updated_at: new Date().toISOString(),
      })
      .eq("evento", payload.evento)
    if (error) {
      if (faltaTabla(error.message)) {
        return { success: false, message: "Falta correr scripts/182_notificacion_conductor.sql." }
      }
      return { success: false, message: error.message }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "No se pudo guardar." }
  }
}

/** Reemplaza los marcadores del mensaje con los datos de la orden. */
function armarMensaje(plantilla: string, ctx: ContextoOrden, urlEncuesta: string | null): string {
  return String(plantilla ?? "")
    .replace(/\{conductor\}/gi, ctx.conductor ?? "")
    .replace(/\{muelle\}/gi, ctx.muelle != null ? String(ctx.muelle) : "")
    .replace(/\{placa\}/gi, ctx.placa ?? "")
    .replace(/\{orden\}/gi, ctx.ordenDeCargue ?? "")
    .replace(/\{cliente\}/gi, ctx.cliente ?? "")
    .replace(/\{encuesta\}/gi, urlEncuesta ?? "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

/**
 * Envía el aviso al conductor. NUNCA lanza.
 *
 * Se llama desde las acciones que asignan muelle y cierran orden. Si algo
 * falla, devuelve `enviado: false` con el motivo y la operación sigue: nadie
 * debe quedarse sin poder cerrar una orden porque WhatsApp no respondió.
 */
/**
 * Dominio donde vive la encuesta pública.
 *
 * El enlace va en un WhatsApp a un conductor, así que tiene que ser una
 * dirección estable y presentable. Por eso el dominio propio es lo primero y no
 * depende de que alguien recuerde configurar una variable: si faltara, el
 * mensaje saldría con el enlace roto y nadie se enteraría hasta ver el
 * indicador vacío.
 *
 * `VERCEL_URL` queda de respaldo para las vistas previas de despliegue, donde
 * el dominio propio todavía no apunta a ese código. No sirve como principal:
 * cambia en cada despliegue, y un enlace así moriría al siguiente.
 */
function dominioPublico(): string {
  const configurado = String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim()
  if (configurado) return configurado.replace(/\/+$/, "")

  const vercel = String(process.env.VERCEL_URL ?? "").trim()
  if (vercel && process.env.VERCEL_ENV !== "production") {
    return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
  }

  return "https://www.lipgo.app"
}

/**
 * Un enlace de encuesta REAL, de la última orden cerrada.
 *
 * La pantalla de configuración no puede mostrar "el enlace": hay uno distinto
 * por cada orden y se arma al enviar. Sin poder abrir uno, no hay forma de
 * comprobar que la encuesta responde antes de activar el aviso --y el primero
 * en descubrirlo sería un conductor con un enlace roto.
 */
export async function getEnlaceEncuestaEjemplo(): Promise<{
  success: boolean
  url?: string
  orden?: string
  message?: string
}> {
  try {
    const sb: any = await getSupabaseAdmin()
    const { data, error } = await sb
      .from("cabeceraoc")
      .select("id, ordendecargue, fechacargue")
      .not("fincargue", "is", null)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return { success: false, message: error.message }
    if (!data) {
      return { success: false, message: "Todavía no hay ninguna orden de cargue cerrada." }
    }

    const token = await getTokenEncuesta(Number(data.id))
    return {
      success: true,
      url: `${dominioPublico()}/encuesta/${token}`,
      orden: String(data.ordendecargue ?? data.id),
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "No se pudo armar el enlace." }
  }
}

export async function notificarConductor(
  evento: EventoConductor,
  ordenId: number,
): Promise<ResultadoAviso> {
  try {
    const sb: any = await getSupabaseAdmin()

    // --- 1) ¿Está activo? --------------------------------------------------
    const { data: cfgRow, error: errCfg } = await sb
      .from("notificaciones_conductor_config")
      .select("*")
      .eq("evento", evento)
      .maybeSingle()
    if (errCfg || !cfgRow) {
      return { enviado: false, motivo: "Sin configuración para este evento." }
    }
    const cfg = mapear(cfgRow)
    if (!cfg.activo) return { enviado: false, motivo: "El aviso está desactivado." }

    // --- 2) Los datos de la orden -----------------------------------------
    const { data: orden } = await sb
      .from("cabeceraoc")
      // `celular` es el telefono del conductor. Se escribe al crear la orden
      // desde `citasvehiculos.telefono`, pero hasta hoy NINGUN codigo lo leia:
      // su tasa real de llenado esta sin verificar, de ahi el respaldo de abajo.
      .select("id, idempresa, conductor, placa, ordendecargue, cliente, muelle, celular")
      .eq("id", ordenId)
      .maybeSingle()
    if (!orden) return { enviado: false, motivo: "No se encontró la orden." }

    const empresaId = Number(orden.idempresa)
    if (!cfg.empresas.includes(empresaId)) {
      return { enviado: false, motivo: `El aviso no está habilitado para la empresa ${empresaId}.` }
    }

    // --- 3) Una sola vez por orden y evento --------------------------------
    // Reasignar muelle o volver a guardar una orden cerrada dispararía el mismo
    // aviso otra vez: dos mensajes iguales al conductor y dos cobros.
    const { data: ya } = await sb
      .from("notificaciones_conductor_enviadas")
      .select("id")
      .eq("orden_id", ordenId)
      .eq("evento", evento)
      .maybeSingle()
    if (ya) return { enviado: false, motivo: "Ya se había avisado de este evento." }

    const ctx: ContextoOrden = {
      ordenId,
      empresaId,
      conductor: orden.conductor ?? null,
      placa: orden.placa ?? null,
      ordenDeCargue: orden.ordendecargue ?? null,
      cliente: orden.cliente ?? null,
      muelle: orden.muelle == null ? null : Number(orden.muelle),
      telefonoConductor: orden.celular ?? null,
    }

    // Respaldo: si la orden no trae telefono, se busca en `citasvehiculos`, que
    // es de donde salio originalmente. Se cruza por la orden de cargue y, si no,
    // por placa. Esa tabla NO tiene unico por `ocargue` --hay duplicados-- asi
    // que se toma la fila mas reciente.
    if (!ctx.telefonoConductor && (ctx.ordenDeCargue || ctx.placa)) {
      try {
        let q = sb
          .from("citasvehiculos")
          .select("telefono, nombreconductor, id")
          .order("id", { ascending: false })
          .limit(1)
        q = ctx.ordenDeCargue
          ? q.eq("ocargue", ctx.ordenDeCargue)
          : q.eq("placa", ctx.placa)
        const { data: cita } = await q.maybeSingle()
        if (cita?.telefono) ctx.telefonoConductor = String(cita.telefono)
        if (!ctx.conductor && cita?.nombreconductor) ctx.conductor = cita.nombreconductor
      } catch (e: any) {
        console.error("[v0] notificarConductor citasvehiculos:", e?.message ?? e)
      }
    }

    // --- 4) A qué número ---------------------------------------------------
    // El desvío de pruebas manda sobre todo lo demás: mientras tenga valor,
    // ninguna persona externa recibe nada.
    let destino = cfg.telefonoPrueba
    if (!destino) {
      // Sin desvío, va al conductor real.
      destino = ctx.telefonoConductor
      if (!destino) {
        return {
          enviado: false,
          motivo: "La orden no tiene teléfono del conductor y no hay número de pruebas configurado.",
        }
      }
    }

    // El enlace de la encuesta se arma POR ORDEN: lleva un token propio para
    // que la respuesta quede atada a ese cargue y para que nadie pueda recorrer
    // los enlaces de otras órdenes.
    //
    // Si `url_encuesta` ya es una URL completa (un formulario externo), se
    // respeta tal cual: quien configuró eso lo hizo a propósito.
    let urlEncuesta = cfg.urlEncuesta
    if (evento === "cargue_finalizado") {
      const propia = String(cfg.urlEncuesta ?? "").trim()
      // 'forms.gle/PENDIENTE' fue el marcador que sembró la primera versión del
      // script 182. Parece una URL externa y por eso le ganaría a la encuesta
      // propia, pero no abre nada: se ignora como si el campo estuviera vacío.
      const esMarcadorMuerto = propia === "https://forms.gle/PENDIENTE"
      const esExterna =
        !esMarcadorMuerto && /^https?:\/\//i.test(propia) && !propia.includes("/encuesta/")
      if (!esExterna) {
        const token = await getTokenEncuesta(ordenId)
        urlEncuesta = `${dominioPublico()}/encuesta/${token}`
      }
    }

    const texto = armarMensaje(cfg.mensaje, ctx, urlEncuesta)
    if (!texto) return { enviado: false, motivo: "El mensaje quedó vacío." }

    const r = await enviarAvisoEstandar({
      telefono: destino,
      nombreReporte: cfg.titulo,
      usuario: ctx.conductor || "conductor",
      contenido: texto,
      empresaId,
      origen: `conductor:${evento}`,
      nombre: ctx.conductor,
    })

    // Se registra aunque falle: un intento fallido también cuenta como "ya se
    // intentó", y evita que un reintento automático inunde al conductor.
    try {
      await sb.from("notificaciones_conductor_enviadas").insert({
        orden_id: ordenId,
        evento,
        telefono: destino,
      })
    } catch {
      // El índice único puede rechazarlo si dos llamadas corrieron a la vez.
      // No es un error: significa que otra ya lo registró.
    }

    if (!r.success) return { enviado: false, motivo: r.message, telefono: destino }
    return { enviado: true, telefono: destino }
  } catch (e: any) {
    // Nunca se propaga: asignar muelle y cerrar orden tienen que funcionar
    // aunque la mensajería esté caída.
    console.error("[v0] notificarConductor:", e?.message ?? e)
    return { enviado: false, motivo: e?.message || "Error al notificar." }
  }
}
