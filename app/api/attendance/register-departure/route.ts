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
 *  - Si hay registro del dia pero SIN `horaingreso` -> 409. Que exista la fila
 *    no significa que la persona haya llegado: "Programacion de turnos"
 *    precrea las filas del dia con `horaingreso` en null (ver
 *    lib/programacion-turnos-actions.ts). Sin esta regla, a un programado que
 *    nunca marco entrada se le podia registrar salida, y quedaba una fila con
 *    salida y sin ingreso que rompe el calculo de horas y de horas extra.
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

    // Misma regla que en la entrada: la foto es obligatoria para marcar y este
    // endpoint es la frontera real, no el cliente.
    if (typeof foto !== "string" || !foto.startsWith("data:image")) {
      return NextResponse.json(
        { success: false, message: "No se puede registrar la salida sin la foto de la cámara." },
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

    // Pre-check: traemos los registros de hoy para esta identificacion.
    // Cuatro ramas posibles:
    //   1) No existe fila -> 404 ("primero debe registrar entrada").
    //   2) Existe pero NINGUNA tiene `horaingreso` -> 409 (esta programado,
    //      pero no ha llegado).
    //   3) Existe con ingreso y ya tiene `horasalida` -> 409 (idempotencia
    //      diaria: una sola salida por persona por dia).
    //   4) Existe con ingreso y sin `horasalida` -> seguimos al UPDATE.
    //
    // Se traen TODAS las filas del dia y no `.limit(1)`: un puesto de doble
    // jornada tiene dos filas el mismo dia (columna `turno` 1 y 2, ver
    // lib/programacion-turnos-actions.ts) y sin ORDER BY cual llegaba primero
    // era arbitrario. Con una sola fila se podia estar mirando la del turno que
    // no marco y rechazar una salida legitima.
    const { data: registrosHoy, error: lookupError } = await supabase
      .from("registroasistencia")
      .select("id, horaingreso, horasalida, asistencia, turno")
      .eq("idempresa", idempresa)
      .eq("identificacion", identificacion.trim())
      .eq("fecha", fecha)
      .order("turno", { ascending: true, nullsFirst: true })

    if (lookupError) {
      console.error("[v0] Error looking up registroasistencia:", lookupError)
      return NextResponse.json(
        { success: false, message: "Error al verificar el registro de hoy" },
        { status: 500 },
      )
    }

    if (!registrosHoy || registrosHoy.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No se encontro registro de ingreso para esta identificacion el dia de hoy",
        },
        { status: 404 },
      )
    }

    // SIN ENTRADA NO HAY SALIDA. Que exista la fila no basta: la de un turno
    // programado nace vacia y solo se llena cuando la persona marca ingreso.
    const conIngreso = registrosHoy.filter((r) => hasValue(r.horaingreso as string | null))

    if (conIngreso.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Este documento no tiene entrada registrada hoy. Debe marcar la entrada antes de poder marcar la salida.",
        },
        { status: 409 },
      )
    }

    // De aqui en adelante se trabaja sobre la fila que SI tiene ingreso: la
    // primera sin salida, y si todas ya salieron, la ultima, para que el
    // mensaje de "ya registro salida" muestre una hora real.
    const existing = conIngreso.find((r) => !r.horasalida) ?? conIngreso[conIngreso.length - 1]

    // Novedad registrada hoy (p.ej. asignada DESPUES del ingreso): no se
    // permite registrar salida de asistencia normal el mismo dia.
    if (hasValue(existing.asistencia)) {
      return NextResponse.json(
        {
          success: false,
          message: `Este documento tiene una novedad registrada hoy ("${existing.asistencia}") y no puede marcar salida`,
        },
        { status: 409 },
      )
    }

    if (existing.horasalida) {
      return NextResponse.json(
        {
          success: false,
          message: `Ya se registró la salida de este documento hoy a las ${existing.horasalida}`,
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
      .eq("id", existing.id)
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
        await supabase.from("registroasistencia").update({ foto_salida: fotoSalidaUrl }).eq("id", existing.id)
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
