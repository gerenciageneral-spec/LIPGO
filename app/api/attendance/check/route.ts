import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase-server"

// "" y NULL se usan indistintamente en registroasistencia.asistencia segun el
// flujo que escribio la fila (mismo criterio que attendance/table y
// asistencia-alerts): ambos significan "sin novedad".
function hasValue(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== ""
}

export async function POST(request: Request) {
  try {
    const { identificacion, idempresa } = await request.json()

    if (!identificacion) {
      return NextResponse.json({ error: "Identificación es requerida" }, { status: 400 })
    }

    const supabase = createServerClient()

    // Check if person exists in headcount and get their status
    const { data: person, error } = await supabase
      .from("headcount")
      .select("identificacion, nombre, estado")
      .eq("identificacion", identificacion)
      .maybeSingle()

    if (error) {
      console.error("[v0] Error checking headcount:", error)
      return NextResponse.json({ error: "Error al verificar el registro" }, { status: 500 })
    }

    if (!person || person.estado !== "Activo") {
      return NextResponse.json(
        {
          success: false,
          message: "Este documento no existe o está inactivo",
        },
        { status: 200 },
      )
    }

    // Si ya tiene una NOVEDAD registrada hoy (incapacidad, licencia,
    // vacaciones, permiso, etc. — registroasistencia.asistencia), no se le
    // permite marcar asistencia normal ese dia: seria contradictorio pagar/
    // reportar la novedad Y la asistencia el mismo dia. Solo se valida cuando
    // el cliente manda `idempresa` (necesario para escopar correctamente);
    // sin ella no se bloquea, para no romper llamadas viejas del cliente.
    if (idempresa) {
      const fecha = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())

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
          { status: 200 },
        )
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Bienvenido ${person.nombre}`,
        person,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] Error in POST /api/attendance/check:", error)
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 })
  }
}
