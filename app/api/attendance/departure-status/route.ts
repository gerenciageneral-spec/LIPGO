import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase-server"

// "" y NULL se usan indistintamente en registroasistencia segun el flujo que
// escribio la fila; ambos significan "sin valor".
function hasValue(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== ""
}

/**
 * POST /api/attendance/departure-status
 *
 * ¿Este documento puede marcar salida hoy? Solo consulta, no escribe nada.
 *
 * Existe para que la pantalla de registro avise ANTES de encender la camara.
 * Sin esto, a quien no tiene entrada se le tomaba la foto, se subia y recien
 * despues el servidor lo rechazaba: el operador esperaba de gusto y el motivo
 * llegaba tarde, con fila de gente atras.
 *
 * NO reemplaza la validacion de `/api/attendance/register-departure`, que es la
 * frontera real y vuelve a comprobar todo. Esta es solo la cortesia de avisar
 * temprano; nadie puede saltarse la otra llamando directo al endpoint.
 *
 * Devuelve siempre 200 con `puedeSalir`, incluso cuando la respuesta es que no:
 * para quien pregunta, "no puede" es una respuesta valida, no un error.
 */
export async function POST(request: Request) {
  try {
    const { identificacion, idempresa } = await request.json()

    if (!identificacion || !idempresa) {
      return NextResponse.json(
        {
          puedeSalir: false,
          motivo: "datos_incompletos",
          message: "Datos incompletos: se requiere identificacion e idempresa",
        },
        { status: 400 },
      )
    }

    const supabase = createServerClient()

    // "YYYY-MM-DD" en hora de Colombia, que es el formato `date` de Postgres.
    const fecha = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())

    // Todas las filas del dia, no una: un puesto de doble jornada tiene dos
    // (columna `turno`, ver lib/programacion-turnos-actions.ts) y mirar solo la
    // primera podria rechazar una salida legitima del otro turno.
    const { data: registrosHoy, error } = await supabase
      .from("registroasistencia")
      .select("id, horaingreso, horasalida, asistencia, turno")
      .eq("idempresa", idempresa)
      .eq("identificacion", String(identificacion).trim())
      .eq("fecha", fecha)
      .order("turno", { ascending: true, nullsFirst: true })

    if (error) {
      console.error("[v0] Error en departure-status:", error)
      // Ante un fallo de consulta se deja pasar: el endpoint de salida vuelve a
      // validar de todos modos. Bloquear aqui por un problema de red dejaria a
      // gente que si trabajo sin poder marcar su salida.
      return NextResponse.json({ puedeSalir: true, motivo: "sin_verificar" }, { status: 200 })
    }

    if (!registrosHoy || registrosHoy.length === 0) {
      return NextResponse.json(
        {
          puedeSalir: false,
          motivo: "sin_registro",
          message:
            "Este documento no tiene registro de hoy. Debe marcar la entrada antes de poder marcar la salida.",
        },
        { status: 200 },
      )
    }

    // Que exista la fila no significa que la persona haya llegado: las de un
    // turno programado nacen con `horaingreso` en null y solo se llenan cuando
    // marca entrada.
    const conIngreso = registrosHoy.filter((r) => hasValue(r.horaingreso as string | null))

    if (conIngreso.length === 0) {
      return NextResponse.json(
        {
          puedeSalir: false,
          motivo: "sin_entrada",
          message:
            "Este documento está programado para hoy pero no ha marcado entrada. Debe registrar la entrada antes de la salida.",
        },
        { status: 200 },
      )
    }

    const pendiente = conIngreso.find((r) => !r.horasalida)

    if (!pendiente) {
      const ultima = conIngreso[conIngreso.length - 1]
      return NextResponse.json(
        {
          puedeSalir: false,
          motivo: "ya_salio",
          message: `Ya se registró la salida de este documento hoy a las ${ultima.horasalida}`,
        },
        { status: 200 },
      )
    }

    if (hasValue(pendiente.asistencia as string | null)) {
      return NextResponse.json(
        {
          puedeSalir: false,
          motivo: "novedad",
          message: `Este documento tiene una novedad registrada hoy ("${pendiente.asistencia}") y no puede marcar salida`,
        },
        { status: 200 },
      )
    }

    return NextResponse.json(
      { puedeSalir: true, motivo: "ok", horaingreso: pendiente.horaingreso },
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] Error in POST /api/attendance/departure-status:", error)
    // Mismo criterio que arriba: no bloquear por un fallo inesperado de esta
    // consulta, que es solo un aviso temprano.
    return NextResponse.json({ puedeSalir: true, motivo: "sin_verificar" }, { status: 200 })
  }
}
