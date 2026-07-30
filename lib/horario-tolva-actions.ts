"use server"

/**
 * Server actions del "Horario de Tolva" (Turno 1 / Turno 2), botón dedicado en
 * Programación de turnos. Es un horario COMPARTIDO por (fecha, empresa, turno)
 * — no por persona — independiente del horaentradaprogramada/horasalidaprogramada
 * normal de cada colaborador (que sigue siendo para asistencia/horas extra).
 * "Liquidación Tolva del día" lee esta ventana para clasificar los ingresos de
 * producción aprobados por turno (ver lib/liquidacion-tolva-actions.ts).
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export interface VentanaTurno {
  horaInicio: string | null // "HH:MM"
  horaFin: string | null
}

export interface HorarioTolvaDia {
  fecha: string
  idempresa: number
  turno1: VentanaTurno
  turno2: VentanaTurno
}

/** Lee el horario de Tolva configurado para una fecha+empresa. */
export async function getHorarioTolva(
  idempresa: number,
  fecha: string,
): Promise<{ success: boolean; data?: HorarioTolvaDia; message?: string }> {
  if (!idempresa || !fecha) return { success: false, message: "Empresa y fecha son requeridas." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { data, error } = await admin
      .from("horario_tolva")
      .select("turno, hora_inicio, hora_fin")
      .eq("idempresa", idempresa)
      .eq("fecha", fecha)
    if (error) return { success: false, message: error.message }

    const porTurno = new Map<number, VentanaTurno>()
    for (const r of data || []) {
      porTurno.set(Number(r.turno), {
        horaInicio: r.hora_inicio ? String(r.hora_inicio).slice(0, 5) : null,
        horaFin: r.hora_fin ? String(r.hora_fin).slice(0, 5) : null,
      })
    }
    return {
      success: true,
      data: {
        fecha,
        idempresa,
        turno1: porTurno.get(1) || { horaInicio: null, horaFin: null },
        turno2: porTurno.get(2) || { horaInicio: null, horaFin: null },
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al leer el horario de Tolva." }
  }
}

/** Guarda (upsert) el horario de Turno 1/Turno 2 para una fecha+empresa. */
export async function guardarHorarioTolva(
  idempresa: number,
  fecha: string,
  turno1: VentanaTurno,
  turno2: VentanaTurno,
): Promise<{ success: boolean; message?: string }> {
  if (!idempresa || !fecha) return { success: false, message: "Empresa y fecha son requeridas." }
  try {
    const admin: any = await getSupabaseAdmin()
    const registros: any[] = []
    if (turno1.horaInicio && turno1.horaFin) {
      registros.push({
        fecha,
        idempresa,
        turno: 1,
        hora_inicio: turno1.horaInicio,
        hora_fin: turno1.horaFin,
        actualizado_en: new Date().toISOString(),
      })
    }
    if (turno2.horaInicio && turno2.horaFin) {
      registros.push({
        fecha,
        idempresa,
        turno: 2,
        hora_inicio: turno2.horaInicio,
        hora_fin: turno2.horaFin,
        actualizado_en: new Date().toISOString(),
      })
    }
    if (registros.length === 0) return { success: false, message: "Define al menos un turno con hora de inicio y fin." }

    const { error } = await admin.from("horario_tolva").upsert(registros, { onConflict: "fecha,idempresa,turno" })
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar el horario de Tolva." }
  }
}
