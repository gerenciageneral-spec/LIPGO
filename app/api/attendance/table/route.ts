import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { createServerClient } from "@/lib/supabase-server"

// Forzamos render dinamico para que Next NO cachee la respuesta entre
// requests. Esta tabla cambia varias veces durante el dia (registros
// nuevos de asistencia, novedades, asignacion de turnos) y un cache
// stale mostraria personas como "Procesado" cuando ya no lo estan,
// que es exactamente el sintoma que estamos corrigiendo.
export const dynamic = "force-dynamic"
export const revalidate = 0

// Considera null, undefined y string vacio/whitespace como "sin valor".
// `registroasistencia.puesto` y `.asistencia` son strings nulables; en
// la practica algunos flujos guardan "" en vez de NULL al limpiar la
// fila, por lo que tratamos ambos casos como "no asignado" para que la
// regla de "Procesado" sea coherente.
function hasValue(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== ""
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const empresaId = searchParams.get("empresaId")
    const fechaParam = searchParams.get("fecha")

    if (!empresaId) {
      return NextResponse.json({ error: "empresaId is required" }, { status: 400 })
    }

    const supabaseAdmin = await getSupabaseAdmin()
    const supabase = createServerClient()

    // Get today's date in Colombia timezone (format: YYYY-MM-DD)
    const hoyColombia = new Date()
      .toLocaleString("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .split(",")[0]

    // `fecha` es opcional: filtro para ver días anteriores desde la Tabla de
    // Asistencia. Sin el parámetro (o vacío) se mantiene el comportamiento de
    // siempre: hoy en Colombia.
    const colombiaDate = fechaParam && fechaParam.trim() ? fechaParam.trim() : hoyColombia

    console.log("[v0] Fetching attendance table for date:", colombiaDate, "empresa:", empresaId)

    // Get all active people from headcount
    const { data: headcountData, error: headcountError } = await supabaseAdmin
      .from("headcount")
      .select("identificacion, nombre")
      .eq("idempresa", empresaId)
      .eq("estado", "Activo")
      .order("nombre", { ascending: true })

    if (headcountError) {
      console.error("[v0] Error fetching headcount:", headcountError)
      return NextResponse.json({ error: "Error al obtener el listado de personal" }, { status: 500 })
    }

    // Get today's attendance records
    // `foto_ingreso` se lee tambien de aqui, no solo de `registroasistencia`:
    // cuando la persona marca ANTES de que el supervisor le asigne turno, esta
    // es la unica fila que existe y por tanto la unica que tiene la foto.
    const { data: attendanceData, error: attendanceError } = await supabaseAdmin
      .from("asistencia")
      .select("identificacion, hora, foto_ingreso")
      .eq("idempresa", empresaId)
      .eq("fecha", colombiaDate)

    if (attendanceError) {
      console.error("[v0] Error fetching attendance:", attendanceError)
      return NextResponse.json({ error: "Error al obtener la asistencia" }, { status: 500 })
    }

    // Traemos `puesto` y `asistencia` por persona para decidir si la
    // fila del dia esta realmente "procesada". La regla es ESTRICTA:
    //
    //   - Presente (con `hora` en la tabla `asistencia`):
    //       procesado <=> existe fila en `registroasistencia` con
    //       `puesto` o `asistencia` no vacios. Una fila completamente
    //       en blanco NO cuenta.
    //
    //   - Ausente (sin `hora` en la tabla `asistencia`):
    //       procesado <=> existe fila en `registroasistencia` cuyo
    //       `asistencia` (codigo de novedad) no esta vacio. Tener
    //       `puesto` con valor pero `asistencia` vacio NO cuenta: ese
    //       caso significa que aun falta asignar la novedad al Ausente.
    //
    // Asi, los Ausentes sin codigo de novedad quedan accionables y el
    // supervisor puede asignar la novedad desde el checkbox Novedad o
    // desde el modulo "Novedades de Personal".
    // Ademas de `puesto` y `asistencia` (regla de "Programado"),
    // traemos `horasalida` para mostrarla junto a "Hora de Llegada".
    // `horasalida` vive en `registroasistencia` (la tabla `asistencia`
    // solo tiene `hora` de ingreso), por eso se proyecta desde aqui.
    // Ademas de `puesto`, `asistencia` y `horasalida`, traemos
    // `horaentradaprogramada` para poder mostrarla junto a la hora de
    // llegada y decidir en cliente si una persona llego tarde.
    //
    // IMPORTANTE: la query incluye `nombre` y filtra por `idempresa`
    // porque el match con `headcount` se hace por la triple llave
    // (idempresa, identificacion, nombre). Antes faltaba `idempresa`
    // y el `shiftMap` se llenaba con filas de otras empresas que
    // tuvieran la misma identificacion, produciendo el sintoma de
    // "Hora Programada" vacia cuando una fila sin programada pisaba
    // al match correcto.
    const { data: assignedShifts, error: shiftsError } = await supabaseAdmin
      .from("registroasistencia")
      .select(
        "identificacion, nombre, puesto, asistencia, horasalida, horaentradaprogramada, foto_ingreso, foto_salida, horafinauto",
      )
      .eq("fecha", colombiaDate)
      .eq("idempresa", empresaId)

    if (shiftsError) {
      console.error("[v0] Error fetching assigned shifts:", shiftsError)
    }

    // Map "identificacion|nombre-normalizado" -> { puesto, ... }.
    // Llave compuesta para que el match con headcount sea exacto por
    // identificacion + nombre (la empresa ya quedo filtrada en la
    // query). Normalizamos a minusculas y trim para tolerar
    // variaciones legacy de espacios/mayusculas.
    const normalizeName = (n: string | null) =>
      (n ?? "").trim().toLowerCase()
    const shiftKey = (identificacion: string, nombre: string | null) =>
      `${(identificacion ?? "").trim()}|${normalizeName(nombre)}`

    const shiftMap = new Map<
      string,
      {
        puesto: string | null
        asistencia: string | null
        horasalida: string | null
        horaentradaprogramada: string | null
        foto_ingreso: string | null
        foto_salida: string | null
        horafinauto: boolean | null
      }
    >()
    for (const s of assignedShifts ?? []) {
      // Si llegan duplicados, preferimos conservar la fila que tenga
      // `horaentradaprogramada` con valor: asi la columna "Hora
      // Programada" no se queda vacia por una fila parcial creada
      // antes (p.ej. una novedad que dejo el campo en null).
      const key = shiftKey(s.identificacion, s.nombre)
      const existing = shiftMap.get(key)
      if (
        existing &&
        hasValue(existing.horaentradaprogramada) &&
        !hasValue(s.horaentradaprogramada)
      ) {
        continue
      }
      shiftMap.set(key, {
        puesto: s.puesto,
        asistencia: s.asistencia,
        horasalida: s.horasalida,
        horaentradaprogramada: s.horaentradaprogramada,
        foto_ingreso: (s as any).foto_ingreso ?? null,
        foto_salida: (s as any).foto_salida ?? null,
        horafinauto: (s as any).horafinauto ?? null,
      })
    }

    // Create a map of identificacion -> { hora, foto } (de llegada).
    const attendanceMap = new Map<string, { hora: string | null; foto: string | null }>()
    attendanceData?.forEach((record) => {
      attendanceMap.set(record.identificacion, {
        hora: record.hora ?? null,
        foto: (record as any).foto_ingreso ?? null,
      })
    })

    const tableData = headcountData?.map((person) => {
      const marcacion = attendanceMap.get(person.identificacion)
      const hora = marcacion?.hora || null
      const isPresent = hasValue(hora)
      // Lookup por llave compuesta (identificacion + nombre normalizado)
      // — ver comentario donde se construye `shiftMap` arriba.
      const shift = shiftMap.get(shiftKey(person.identificacion, person.nombre))
      // Regla detallada arriba; usamos `hasValue` para tratar null y
      // string vacio por igual y evitar falsos "Procesado".
      const alreadyAssigned = shift
        ? isPresent
          ? hasValue(shift.puesto) || hasValue(shift.asistencia)
          : hasValue(shift.asistencia)
        : false
      // `horaSalida` se expone como string | null para que el front
      // pueda renderizar "-" cuando todavia no se ha marcado la salida.
      const horaSalida = hasValue(shift?.horasalida)
        ? (shift!.horasalida as string)
        : null
      // `puesto` y `asistencia` (codigo de novedad) tambien se exponen
      // como string | null para mostrarse en columnas dedicadas. Ambos
      // pueden venir vacios cuando la persona aun no ha sido procesada
      // o cuando la fila esta a la espera de cierre de novedad.
      const puesto = hasValue(shift?.puesto) ? (shift!.puesto as string) : null
      const asistencia = hasValue(shift?.asistencia)
        ? (shift!.asistencia as string)
        : null
      // Hora programada de entrada (puede ser "HH:MM" o "HH:MM:SS"
      // segun como fue grabada por el modulo de Programacion de Turnos
      // y Asistencia). El cliente la compara con `horaLlegada` para
      // pintar la badge "Llegada tarde".
      const horaProgramada = hasValue(shift?.horaentradaprogramada)
        ? (shift!.horaentradaprogramada as string)
        : null
      return {
        identificacion: person.identificacion,
        nombre: person.nombre,
        horaProgramada,
        horaLlegada: hora,
        horaSalida,
        puesto,
        asistencia,
        alreadyAssigned,
        // Manda la de `registroasistencia` si existe; si no, la de la marcacion.
        // Sin este respaldo, quien marca antes de que le asignen turno aparece
        // con hora de llegada pero sin foto — el sintoma reportado.
        fotoIngreso: shift?.foto_ingreso ?? marcacion?.foto ?? null,
        fotoSalida: shift?.foto_salida ?? null,
        // true si la salida la cerró el cron de las 11pm (scripts/cron_cerrar_
        // asistencia_sin_salida.sql), no la persona.
        horaFinAuto: shift?.horafinauto === true,
      }
    })

    console.log("[v0] Attendance table data:", tableData?.length, "records")

    return NextResponse.json({ data: tableData })
  } catch (error) {
    console.error("[v0] Error in GET /api/attendance/table:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
