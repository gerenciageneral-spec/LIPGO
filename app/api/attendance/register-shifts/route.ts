import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase-server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const supabaseAdmin = await getSupabaseAdmin()
    const body = await request.json()
    const { shifts, empresaId } = body

    console.log("[v0] Shifts received:", JSON.stringify(shifts, null, 2))

    if (!shifts || !Array.isArray(shifts) || shifts.length === 0) {
      return NextResponse.json({ error: "No hay turnos para registrar" }, { status: 400 })
    }

    if (!empresaId) {
      return NextResponse.json({ error: "ID de empresa es requerido" }, { status: 400 })
    }

    // Obtener la fecha actual de Colombia
    const colombiaDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())

    // Hora actual de Colombia en formato HH:MM:SS para la columna `horaingreso`
    // (tipo `time` en Postgres). Se calcula UNA vez al recibir el request, no
    // por cada shift, para que todos los registros de un mismo lote tengan
    // la misma hora canonica de llegada (es lo coherente cuando un
    // supervisor registra varias asistencias juntas en el mismo POST).
    const colombiaTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date())

    // Separamos los shifts segun su tipo:
    //   - novedadShifts: marcan a un Ausente como "pendiente de novedad".
    //     Su unica accion sobre `registroasistencia` es DEJAR `puesto`
    //     en null en la fila del dia, sin tocar el resto (asistencia,
    //     horaingreso, etc.). Si la fila no existe aun, se crea con
    //     puesto=null y SIN horaingreso (porque el Ausente no llego).
    //   - otherShifts: registran turno de Operaciones / Especialidades,
    //     que sigue el flujo clasico de "insert con datos completos".
    const novedadShifts = shifts.filter((s: any) => s.type === "novedad")
    const otherShifts = shifts.filter((s: any) => s.type !== "novedad")

    const identificaciones = shifts.map((s: any) => s.identificacion)

    // Traemos las filas existentes del dia. Las necesitamos para:
    //   - Decidir si una novedad hace UPDATE (fila existe) o INSERT.
    //   - Bloquear / reciclar para turnos de otherShifts.
    const { data: existingAssignments } = await supabaseAdmin
      .from("registroasistencia")
      .select("id, identificacion, puesto, asistencia")
      .eq("fecha", colombiaDate)
      .in("identificacion", identificaciones)

    const existingByIdent = new Map<
      string,
      { id: number; puesto: string | null; asistencia: string | null }
    >()
    for (const a of existingAssignments ?? []) {
      existingByIdent.set(a.identificacion, {
        id: a.id,
        puesto: a.puesto,
        asistencia: a.asistencia,
      })
    }

    // ────────────────────────────────────────────────────────────────
    // Path NOVEDAD
    // ────────────────────────────────────────────────────────────────
    // Comportamiento: "tomar el registro actual de la persona del dia
    // y borrar el contenido de `puesto` para que quede null y listo
    // para registrarle novedad" (modulo "Novedades de Personal" cierra
    // el codigo en `asistencia`).
    //
    // Esta es una operacion idempotente: si la fila ya tiene puesto en
    // null o si asistencia ya tiene codigo, NO hacemos nada (la fila
    // ya esta en el estado deseado o ya esta cerrada).
    const idsParaLimpiarPuesto: number[] = []
    const novedadInsertRows: Record<string, unknown>[] = []
    for (const shift of novedadShifts) {
      const row = existingByIdent.get(shift.identificacion)
      if (row) {
        // Si la novedad ya esta cerrada con codigo, respetamos esa fila.
        if (row.asistencia !== null && row.asistencia !== undefined) continue
        // Si ya tiene puesto en null, la fila ya esta lista; nada que tocar.
        if (row.puesto === null) continue
        idsParaLimpiarPuesto.push(row.id)
      } else {
        // No hay fila para la persona hoy; creamos una con puesto=null
        // y SIN horaingreso (no llego), lista para que la novedad sea
        // asignada en el modulo de Novedades de Personal.
        novedadInsertRows.push({
          fecha: colombiaDate,
          nombre: shift.nombre,
          identificacion: shift.identificacion,
          puesto: null,
          idempresa: empresaId,
          especialidad: false,
          horasturno: null,
        })
      }
    }

    if (idsParaLimpiarPuesto.length > 0) {
      console.log(
        "[v0] Clearing `puesto` for novedad rows:",
        idsParaLimpiarPuesto,
      )
      const { error: clearError } = await supabaseAdmin
        .from("registroasistencia")
        .update({ puesto: null, horasturno: null, especialidad: false })
        .in("id", idsParaLimpiarPuesto)
      if (clearError) {
        console.error(
          "[v0] Error clearing `puesto` for novedad rows:",
          clearError,
        )
        return NextResponse.json(
          { error: "No se pudo preparar el registro para novedad" },
          { status: 500 },
        )
      }
    }

    if (novedadInsertRows.length > 0) {
      console.log(
        "[v0] Inserting placeholder rows for novedad:",
        novedadInsertRows.length,
      )
      const { error: novedadInsError } = await supabaseAdmin
        .from("registroasistencia")
        .insert(novedadInsertRows)
      if (novedadInsError) {
        console.error(
          "[v0] Error inserting placeholder rows for novedad:",
          novedadInsError,
        )
        return NextResponse.json(
          { error: "No se pudo crear el registro de novedad" },
          { status: 500 },
        )
      }
    }

    // ────────────────────────────────────────────────────────────────
    // Path OPERACIONES / ESPECIALIDADES
    // ────────────────────────────────────────────────────────────────
    // Mantiene el contrato anterior: no se permite reasignar una fila
    // ya procesada; las filas vacias se borran y se reinsertan limpias.
    const otherIds = otherShifts.map((s: any) => s.identificacion)
    const procesadas = (existingAssignments ?? []).filter((a) => {
      if (!otherIds.includes(a.identificacion)) return false
      return a.puesto !== null || a.asistencia !== null
    })
    if (procesadas.length > 0) {
      const alreadyAssignedIds = procesadas
        .map((a) => a.identificacion)
        .join(", ")
      return NextResponse.json(
        {
          error: `Las siguientes identificaciones ya tienen asignación hoy: ${alreadyAssignedIds}`,
        },
        { status: 400 },
      )
    }

    const idsVacios = (existingAssignments ?? [])
      .filter(
        (a) =>
          otherIds.includes(a.identificacion) &&
          a.puesto === null &&
          a.asistencia === null,
      )
      .map((a) => a.id)
    if (idsVacios.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from("registroasistencia")
        .delete()
        .in("id", idsVacios)
      if (deleteError) {
        console.error("[v0] Error clearing empty rows:", deleteError)
        return NextResponse.json(
          { error: "No se pudieron limpiar registros previos sin procesar" },
          { status: 500 },
        )
      }
    }

    // `horasturno` se calcula a partir del puesto cuando el turno es de
    // especialidad: "Salvado" trabaja jornada extendida de 10h, las
    // demas especialidades cumplen 8h. Para Operaciones dejamos null
    // para no contaminar el campo con un valor que no aplica.
    const horasTurnoParaEspecialidad = (puesto: string | null | undefined) => {
      if (!puesto) return 8
      return puesto.trim().toLowerCase() === "salvado" ? 10 : 8
    }

    const records = otherShifts.map((shift: any) => ({
      fecha: colombiaDate,
      // `horaingreso` solo aplica para Presentes (Operaciones/Especialidades).
      horaingreso: colombiaTime,
      nombre: shift.nombre,
      identificacion: shift.identificacion,
      puesto: shift.puesto || null,
      idempresa: empresaId,
      especialidad: shift.type === "especialidades",
      horasturno:
        shift.type === "especialidades"
          ? horasTurnoParaEspecialidad(shift.puesto)
          : null,
    }))

    let data: unknown[] = []
    if (records.length > 0) {
      console.log("[v0] Records to insert:", JSON.stringify(records, null, 2))
      const { data: insertedData, error } = await supabaseAdmin
        .from("registroasistencia")
        .insert(records)
        .select()

      if (error) {
        console.error("[v0] Error inserting shift records:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      data = insertedData ?? []
    }

    const operacionesAssignments = shifts.filter((shift: any) => shift.type === "operaciones" && shift.puesto)

    if (operacionesAssignments.length > 0) {
      // Get the last ID from asignacionpersonal
      const { data: lastRecord } = await supabaseAdmin
        .from("asignacionpersonal")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextId = lastRecord ? lastRecord.id + 1 : 1

      // Prepare assignments with sequential IDs
      const assignmentsWithIds = operacionesAssignments.map((shift: any, index: number) => ({
        id: nextId + index,
        fecha: colombiaDate,
        idempleado: shift.identificacion,
        nombreempleado: shift.nombre,
        asignacion: shift.puesto,
        idempresa: empresaId,
      }))

      const { error: asignacionError } = await supabaseAdmin.from("asignacionpersonal").insert(assignmentsWithIds)

      if (asignacionError) {
        console.error("[v0] Error inserting asignacionpersonal records:", asignacionError)
        // Don't fail the whole operation, just log the error
      }
    }

    // Total procesado = inserts/updates de Novedad + inserts de
    // Operaciones/Especialidades. Reportamos un solo numero al cliente
    // para que el toast del front-end sea consistente con lo que el
    // usuario marco, no solo con lo que se inserto en `records`.
    const totalProcesados =
      records.length + idsParaLimpiarPuesto.length + novedadInsertRows.length

    return NextResponse.json({
      success: true,
      message: `${totalProcesados} turno(s) registrado(s) exitosamente`,
      data,
    })
  } catch (error) {
    console.error("[v0] Error in POST /api/attendance/register-shifts:", error)
    return NextResponse.json({ error: "Error al registrar los turnos" }, { status: 500 })
  }
}
