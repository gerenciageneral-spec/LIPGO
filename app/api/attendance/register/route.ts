import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase-server"
import { subirFotoAsistencia } from "@/lib/asistencia-foto"

// "" y NULL se usan indistintamente en registroasistencia.asistencia segun el
// flujo que escribio la fila; ambos significan "sin novedad".
function hasValue(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== ""
}

export async function POST(request: Request) {
  try {
    const { identificacion, idempresa, foto } = await request.json()

    if (!identificacion || !idempresa) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 })
    }

    const supabase = createServerClient()

    const now = new Date()

    // Get date in Colombia timezone (YYYY-MM-DD format)
    const dateFormatter = new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    const dateParts = dateFormatter.formatToParts(now)
    const year = dateParts.find((p) => p.type === "year")?.value
    const month = dateParts.find((p) => p.type === "month")?.value
    const day = dateParts.find((p) => p.type === "day")?.value
    const fecha = `${year}-${month}-${day}`

    // Get time in Colombia timezone (HH:MM:SS format)
    const timeFormatter = new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    const timeParts = timeFormatter.formatToParts(now)
    const hour = timeParts.find((p) => p.type === "hour")?.value
    const minute = timeParts.find((p) => p.type === "minute")?.value
    const second = timeParts.find((p) => p.type === "second")?.value
    const hora = `${hour}:${minute}:${second}`

    // Bloqueo por NOVEDAD del dia (incapacidad, licencia, vacaciones, etc. en
    // registroasistencia.asistencia). Defensa adicional: el cliente ya corta
    // el flujo en /api/attendance/check, pero este endpoint es la fuente de
    // verdad del INSERT y no debe confiar solo en el paso previo del cliente.
    const { data: novedadHoy, error: novedadError } = await supabase
      .from("registroasistencia")
      .select("asistencia")
      .eq("idempresa", idempresa)
      .eq("identificacion", identificacion)
      .eq("fecha", fecha)
      .limit(1)
      .maybeSingle()

    if (novedadError) {
      console.error("[v0] Error checking novedad del dia:", novedadError)
    } else if (novedadHoy && hasValue(novedadHoy.asistencia)) {
      return NextResponse.json(
        {
          success: false,
          message: `Este documento tiene una novedad registrada hoy ("${novedadHoy.asistencia}") y no puede marcar asistencia`,
        },
        { status: 409 },
      )
    }

    // Idempotencia diaria: una persona solo puede registrar UNA entrada
    // por dia. Antes del INSERT consultamos si ya existe registro
    // (idempresa, identificacion, fecha) en `asistencia`. Si existe,
    // devolvemos un 409 con mensaje claro para que el cliente lo
    // muestre tal cual. NOTA: el ideal seria una UNIQUE constraint en
    // BD; este check de aplicacion previene la mayoria de los casos
    // pero no es atomico contra carreras de inserts simultaneos.
    const { data: existing, error: checkError } = await supabase
      .from("asistencia")
      .select("id, hora")
      .eq("idempresa", idempresa)
      .eq("identificacion", identificacion)
      .eq("fecha", fecha)
      .limit(1)

    if (checkError) {
      console.error("[v0] Error checking existing attendance:", checkError)
      return NextResponse.json(
        { success: false, message: "Error al verificar la asistencia" },
        { status: 500 },
      )
    }

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Ya se registró la asistencia de este documento hoy a las ${existing[0].hora}`,
        },
        { status: 409 },
      )
    }

    // Register attendance (tabla `asistencia` es la fuente de verdad
    // del INGRESO del dia: cada persona aparece aqui una sola vez por
    // dia con su hora de llegada).
    const { data, error } = await supabase
      .from("asistencia")
      .insert({
        idempresa,
        identificacion,
        fecha,
        hora,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error registering attendance:", error)
      return NextResponse.json(
        { success: false, message: "Error al registrar la asistencia" },
        { status: 500 },
      )
    }

    // Sincronizar `horaingreso` en `registroasistencia`:
    //
    // Si para hoy ya existe una fila en `registroasistencia` para esta
    // identificacion + empresa (creada por Tabla Asistencia al asignar
    // turno / novedad, o por flujos previos), actualizamos su
    // `horaingreso` con la hora recien capturada. Esto mantiene
    // sincronizada la columna "Hora de Llegada" de la tabla de Registro
    // de Asistencia con la hora real marcada en este endpoint.
    //
    // Si la fila NO existe (el supervisor aun no ha procesado a esa
    // persona en Tabla Asistencia) NO la creamos aqui: este endpoint
    // solo registra el evento de ingreso. La fila de
    // `registroasistencia` se creara cuando el supervisor asigne turno
    // o novedad, y en ese momento ya podra tomar la `hora` desde
    // `asistencia` via el flujo de la tabla.
    //
    // El UPDATE es best-effort: si falla por cualquier motivo, NO
    // bloqueamos la respuesta 200 del registro de ingreso (la fuente
    // de verdad ya quedo persistida en `asistencia`). Solo lo logueamos
    // para diagnostico.
    // Foto de INGRESO (cámara del módulo). Falla-seguro: no bloquea el registro.
    const fotoIngresoUrl = await subirFotoAsistencia(foto, identificacion, "ingreso")

    try {
      const { data: existingShift, error: shiftLookupError } = await supabase
        .from("registroasistencia")
        .select("id")
        .eq("idempresa", idempresa)
        .eq("identificacion", identificacion)
        .eq("fecha", fecha)
        .limit(1)

      if (shiftLookupError) {
        console.error(
          "[v0] Error looking up registroasistencia for horaingreso sync:",
          shiftLookupError,
        )
      } else if (existingShift && existingShift.length > 0) {
        // Foto de ingreso en update SEPARADO best-effort (no rompe la sync de hora
        // si la columna aún no existe).
        if (fotoIngresoUrl) {
          try {
            await supabase.from("registroasistencia").update({ foto_ingreso: fotoIngresoUrl }).eq("id", existingShift[0].id)
          } catch (fe) {
            console.error("[v0] Error guardando foto_ingreso:", fe)
          }
        }
        const { error: shiftUpdateError } = await supabase
          .from("registroasistencia")
          .update({ horaingreso: hora })
          .eq("id", existingShift[0].id)

        if (shiftUpdateError) {
          console.error(
            "[v0] Error updating registroasistencia.horaingreso:",
            shiftUpdateError,
          )
        }
      }
    } catch (syncErr) {
      console.error(
        "[v0] Unexpected error syncing registroasistencia.horaingreso:",
        syncErr,
      )
    }

    return NextResponse.json({ success: true, data }, { status: 200 })
  } catch (error) {
    console.error("[v0] Error in POST /api/attendance/register:", error)
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 })
  }
}
