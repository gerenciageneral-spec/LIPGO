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

    const texto = armarMensaje(cfg.mensaje, ctx, cfg.urlEncuesta)
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
