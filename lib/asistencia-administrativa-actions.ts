"use server"

// Submódulo "Asistencia Administrativa" (Relaciones Laborales y Ausentismo):
// permite a Gestión Humana registrar o corregir asistencia/novedades para
// CUALQUIER fecha (pasada o futura) -- algo que ningún otro flujo permite hoy
// (Registro de Asistencia y Tabla Asistencia solo escriben el día de hoy;
// Novedades de Personal y el Visor solo pueden UPDATE de filas que ya
// existan, nunca crean una fila donde no hay ninguna).
//
// Disparador real: 7 personas operativas activas de Head Count con CERO
// filas en `registroasistencia` durante agosto-2026 -- nadie registró su
// turno ese mes, así que `pagonomina`/`archivoplano` nunca tuvieron nada que
// exportar a Siigo para ellas. El mismo mecanismo sirve, hacia adelante,
// para llevar la asistencia diaria del personal ADMINISTRATIVO
// (headcount.admin=true), que hoy no pasa por ningún flujo de turnos.
//
// Por qué basta con escribir bien `registroasistencia`: el calendario de
// `pagonomina` se construye sobre `lista_empleados` = DISTINCT nombre_auxiliar
// (cabeceraoc) UNION DISTINCT registroasistencia.nombre (ver
// scripts/pagonomina_reemplazo.sql, CTE `lista_empleados`). Quien no tenga
// NINGUNA fila en `registroasistencia` no existe para la vista -- no es que
// sus días paguen $0, es que no entran al UNION. En cuanto tenga una sola
// fila, pagonomina/archivoplano la calculan igual que a cualquier operativo,
// sin tocar esas vistas.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { procesarNovedadRetiro } from "@/lib/retiro-actions"
import { sincronizarBorradorAusentismo } from "@/lib/ausentismos-actions"
import {
  NOVEDADES_DIA,
  ESPECIALIDADES_OPTIONS,
  PUESTO_ADMINISTRATIVO,
  horasTurnoParaEspecialidad,
  type NovedadDia,
} from "@/lib/asistencia-catalogos"

export interface PersonaAsistenciaAdmin {
  identificacion: string
  nombre: string
  cargo: string | null
  estado: string | null
  admin: boolean
}

/** Personal operativo Y administrativo del proyecto activo (mismo criterio que app/api/headcount/route.ts). */
export async function getPersonasAsistenciaAdministrativa(
  empresaId: number,
): Promise<{ success: boolean; data: PersonaAsistenciaAdmin[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    // Dos consultas separadas (mismo patrón ya probado en
    // app/api/headcount/route.ts) en vez de un solo .or() con and/or
    // anidados -- más verboso, pero evita inventar sintaxis PostgREST no
    // probada en este repo.
    const cols = "identificacion, nombre, cargo, estado, admin, idempresa"
    const [operativos, administrativos] = await Promise.all([
      admin.from("headcount").select(cols).eq("idempresa", empresaId).not("admin", "is", true),
      admin.from("headcount").select(cols).eq("admin", true).or(`idempresa.eq.${empresaId},idempresa.is.null`),
    ])
    if (operativos.error) return { success: false, data: [], message: operativos.error.message }
    if (administrativos.error) return { success: false, data: [], message: administrativos.error.message }
    const data = [...(operativos.data || []), ...(administrativos.data || [])]

    const personas = (data || [])
      .filter((h: any) => {
        const nombre = String(h.nombre || "").trim()
        return nombre && !/prueba/i.test(nombre) && !/sin auxiliar/i.test(nombre)
      })
      .map((h: any) => ({
        identificacion: String(h.identificacion || "").trim(),
        nombre: String(h.nombre || "").trim(),
        cargo: h.cargo ?? null,
        estado: h.estado ?? null,
        admin: h.admin === true,
      }))
      .sort((a: PersonaAsistenciaAdmin, b: PersonaAsistenciaAdmin) => {
        const aActivo = String(a.estado || "").toUpperCase() === "ACTIVO"
        const bActivo = String(b.estado || "").toUpperCase() === "ACTIVO"
        if (aActivo !== bActivo) return aActivo ? -1 : 1
        return a.nombre.localeCompare(b.nombre)
      })
    return { success: true, data: personas }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al cargar el personal." }
  }
}

export interface FilaHistorialAsistencia {
  id: number
  fecha: string
  puesto: string | null
  asistencia: string | null
  especialidad: boolean
  horasturno: number | null
}

/** Historial de UNA persona (no de toda la empresa). Por defecto, últimos 90 días. */
export async function getHistorialAsistenciaPersona(
  empresaId: number,
  identificacion: string,
  desde?: string,
  hasta?: string,
): Promise<{ success: boolean; data: FilaHistorialAsistencia[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const hastaReal = hasta || new Date().toISOString().slice(0, 10)
    const desdeReal = desde || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data, error } = await admin
      .from("registroasistencia")
      .select("id, fecha, puesto, asistencia, especialidad, horasturno")
      .eq("idempresa", empresaId)
      .eq("identificacion", identificacion)
      .gte("fecha", desdeReal)
      .lte("fecha", hastaReal)
      .order("fecha", { ascending: false })
    if (error) return { success: false, data: [], message: error.message }
    return { success: true, data: data || [] }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al cargar el historial." }
  }
}

export interface UpsertAsistenciaInput {
  empresaId: number
  identificacion: string
  nombre: string
  fechaInicio: string // YYYY-MM-DD
  fechaFin?: string // default = fechaInicio (día único)
  tipo: "TRABAJADO" | "NOVEDAD"
  novedad?: NovedadDia // requerido si tipo === "NOVEDAD"
  puesto?: string // requerido si tipo === "TRABAJADO" y esAdministrativo=false
  esAdministrativo: boolean
}

function listaFechas(desde: string, hasta: string): string[] {
  const out: string[] = []
  let cur = new Date(`${desde}T00:00:00Z`)
  const fin = new Date(`${hasta}T00:00:00Z`)
  while (cur.getTime() <= fin.getTime()) {
    out.push(cur.toISOString().slice(0, 10))
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000)
  }
  return out
}

/**
 * Upsert central: por cada fecha del rango, busca fila existente por
 * (idempresa, identificacion, fecha) -> UPDATE si existe, o acumula para
 * INSERT en bloque SIN fijar `id` si no existe (la secuencia de Postgres lo
 * asigna -- mismo patrón que lib/vacaciones-actions.ts `aprobarSolicitudVacaciones`).
 * Sin restricción de "solo futuro" ni "solo hoy", a diferencia de todos los
 * demás flujos que escriben `registroasistencia`.
 */
export async function upsertAsistenciaDia(
  input: UpsertAsistenciaInput,
): Promise<{ success: boolean; diasAfectados?: number; diasOmitidos?: string[]; message?: string }> {
  const { empresaId, identificacion, nombre, tipo, esAdministrativo } = input
  if (!empresaId || !identificacion || !nombre || !input.fechaInicio) {
    return { success: false, message: "Datos incompletos." }
  }
  if (tipo === "NOVEDAD" && !input.novedad) {
    return { success: false, message: "Falta seleccionar la novedad." }
  }
  if (tipo === "TRABAJADO" && !esAdministrativo && !input.puesto) {
    return { success: false, message: "Falta seleccionar el puesto." }
  }

  const esRetiro = tipo === "NOVEDAD" && String(input.novedad || "").toLowerCase().includes("retiro")
  // Salvaguarda defensiva: "Retiro" nunca aplica a un rango (ambigüedad de
  // cuál fecha queda como fecha_retiro final) -- la UI ya lo impide, esto
  // blinda la server action si se llama de otro lado.
  let fechaFin = input.fechaFin || input.fechaInicio
  if (esRetiro) fechaFin = input.fechaInicio
  const fechas = listaFechas(input.fechaInicio, fechaFin)

  try {
    const admin: any = await getSupabaseAdmin()

    let filaBase: Record<string, any>
    if (tipo === "NOVEDAD") {
      filaBase = { asistencia: input.novedad, puesto: null, horasturno: null, especialidad: false }
    } else if (esAdministrativo) {
      filaBase = { asistencia: null, puesto: PUESTO_ADMINISTRATIVO, horasturno: null, especialidad: false }
    } else {
      const esEspecialidad = (ESPECIALIDADES_OPTIONS as readonly string[]).includes(input.puesto!)
      filaBase = {
        asistencia: null,
        puesto: input.puesto,
        especialidad: esEspecialidad,
        horasturno: esEspecialidad ? horasTurnoParaEspecialidad(input.puesto) : null,
      }
    }

    const { data: existentes, error: exErr } = await admin
      .from("registroasistencia")
      .select("id, fecha")
      .eq("idempresa", empresaId)
      .eq("identificacion", identificacion)
      .in("fecha", fechas)
    if (exErr) return { success: false, message: exErr.message }

    const filasPorFecha = new Map<string, number[]>()
    for (const r of existentes || []) {
      const f = String(r.fecha).slice(0, 10)
      const arr = filasPorFecha.get(f) || []
      arr.push(r.id)
      filasPorFecha.set(f, arr)
    }

    const diasOmitidos: string[] = []
    const nuevos: any[] = []
    let diasAfectados = 0

    for (const fecha of fechas) {
      const ids = filasPorFecha.get(fecha)
      if (ids && ids.length > 1) {
        // Multi-turno (columna `turno`): no se decide por cuál fila -- se
        // omite y se corrige aparte desde Tabla Asistencia/Visor.
        diasOmitidos.push(fecha)
        continue
      }
      if (ids && ids.length === 1) {
        const { error } = await admin.from("registroasistencia").update(filaBase).eq("id", ids[0])
        if (error) return { success: false, message: error.message }
      } else {
        nuevos.push({ idempresa: empresaId, fecha, nombre, identificacion, ...filaBase })
      }
      diasAfectados++
    }

    if (nuevos.length > 0) {
      const { error: insErr } = await admin.from("registroasistencia").insert(nuevos)
      if (insErr) return { success: false, message: insErr.message }
    }

    if (esRetiro) {
      await procesarNovedadRetiro({
        identificacion,
        fecha: input.fechaInicio,
        asistencia: input.novedad,
        idempresa: empresaId,
      })
    }

    // Reconciliar borradores de ausentismo (mismo patrón que
    // app/api/personnel-notices/route.ts): basta con los dos extremos del
    // rango, la ventana de sincronización ya cubre ±31/180 días.
    const refFechas = Array.from(new Set([input.fechaInicio, fechaFin]))
    await Promise.all(refFechas.map((f) => sincronizarBorradorAusentismo(empresaId, identificacion, f)))

    return { success: true, diasAfectados, diasOmitidos: diasOmitidos.length ? diasOmitidos : undefined }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar la asistencia." }
  }
}

export { NOVEDADES_DIA }
export type { NovedadDia }
