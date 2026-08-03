import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase-server"
import { subirFotoAsistencia } from "@/lib/asistencia-foto"

// "" y NULL se usan indistintamente en registroasistencia.asistencia segun el
// flujo que escribio la fila; ambos significan "sin novedad".
function hasValue(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== ""
}

/**
 * POST /api/attendance/register-departure
 *
 * Registra la HORA DE SALIDA de una persona en `registroasistencia` para el
 * dia actual (zona horaria America/Bogota). Actualiza `horasalida` (columna
 * `time` en Postgres) en el registro de hoy que coincide con la
 * `identificacion` recibida y la empresa activa.
 *
 * Reglas:
 *  - Si no hay registro del dia para esa identificacion -> 404 con mensaje
 *    explicito (la persona debe haber entrado primero).
 *  - Si ya tenia `horasalida` registrada, igual la sobrescribimos: la nueva
 *    salida es la mas reciente (politica simple y predecible para el
 *    operador).
 *  - La hora se calcula UNA vez en formato 24h "HH:MM:SS" desde el server,
 *    no desde el cliente, para evitar discrepancias por reloj local.
 */
export async function POST(request: Request) {
  try {
    const { identificacion, idempresa, foto } = await request.json()

    if (!identificacion || !idempresa) {
      return NextResponse.json(
        { success: false, message: "Datos incompletos: se requiere identificacion e idempresa" },
        { status: 400 },
      )
    }

    const supabase = createServerClient()

    // Fecha y hora actuales en zona horaria de Colombia. Usamos `en-CA`
    // para fecha porque produce directamente "YYYY-MM-DD" (formato `date`
    // de Postgres) y `en-GB` con hour12:false para HH:MM:SS (formato
    // `time`). Asi evitamos parseo manual de partes.
    const now = new Date()
    const fecha = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now)
    const horasalida = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now)

    // Pre-check: traemos el registro de hoy para esta identificacion.
    // Tres ramas posibles:
    //   1) No existe -> 404 ("primero debe registrar entrada").
    //   2) Existe y ya tiene `horasalida` -> 409 (idempotencia diaria:
    //      una sola salida por persona por dia).
    //   3) Existe sin `horasalida` -> seguimos al UPDATE.
    const { data: existing, error: lookupError } = await supabase
      .from("registroasistencia")
      .select("id, horasalida, asistencia")
      .eq("idempresa", idempresa)
      .eq("identificacion", identificacion.trim())
      .eq("fecha", fecha)
      .limit(1)

    if (lookupError) {
      console.error("[v0] Error looking up registroasistencia:", lookupError)
      return NextResponse.json(
        { success: false, message: "Error al verificar el registro de hoy" },
        { status: 500 },
      )
    }

    if (!existing || existing.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No se encontro registro de ingreso para esta identificacion el dia de hoy",
        },
        { status: 404 },
      )
    }

    // Novedad registrada hoy (p.ej. asignada DESPUES del ingreso): no se
    // permite registrar salida de asistencia normal el mismo dia.
    if (hasValue(existing[0].asistencia)) {
      return NextResponse.json(
        {
          success: false,
          message: `Este documento tiene una novedad registrada hoy ("${existing[0].asistencia}") y no puede marcar salida`,
        },
        { status: 409 },
      )
    }

    if (existing[0].horasalida) {
      return NextResponse.json(
        {
          success: false,
          message: `Ya se registró la salida de este documento hoy a las ${existing[0].horasalida}`,
        },
        { status: 409 },
      )
    }

    // UPDATE puntual por id (mas seguro que filtrar de nuevo por el
    // triple compuesto, evita sobrescribir filas duplicadas si
    // existieran). Devolvemos las filas afectadas para confirmar.
    const { data, error } = await supabase
      .from("registroasistencia")
      .update({ horasalida })
      .eq("id", existing[0].id)
      .select("id, identificacion, nombre, horaingreso, horasalida")

    if (error) {
      console.error("[v0] Error registering departure:", error)
      return NextResponse.json(
        { success: false, message: "Error al registrar la salida" },
        { status: 500 },
      )
    }

    // Foto de SALIDA (cámara) — update SEPARADO y best-effort: si falla (p.ej. la
    // columna aún no existe) NO rompe el registro de salida ya persistido.
    try {
      const fotoSalidaUrl = await subirFotoAsistencia(foto, identificacion, "salida")
      if (fotoSalidaUrl) {
        await supabase.from("registroasistencia").update({ foto_salida: fotoSalidaUrl }).eq("id", existing[0].id)
      }
    } catch (fe) {
      console.error("[v0] Error guardando foto_salida:", fe)
    }

    return NextResponse.json(
      {
        success: true,
        message: `Salida registrada a las ${horasalida}`,
        data: data[0],
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] Error in POST /api/attendance/register-departure:", error)
    return NextResponse.json(
      { success: false, message: "Error al procesar la solicitud" },
      { status: 500 },
    )
  }
}
