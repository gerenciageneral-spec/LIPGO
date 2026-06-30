"use server"

// Calificación del servicio por el CONDUCTOR (en caliente, al fin de cargue).
// Fuente de verdad: LIPgo. Las calificaciones se guardan en sig_satisfaccion
// (tipo='conductor', canal='kiosko') para que alimenten DIRECTO el indicador
// del BSC (IND-G-02) por proyecto y gerencial. La habilitación = órdenes con
// fincargue marcado (servicio finalizado).

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { SIG_CLIENTES_LIP } from "@/lib/sig-types"
import { EMOJI_A_CALIF, type CargueCalificable, type AnalisisCalificacion } from "@/lib/calificacion-conductor"

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
const satDe = (cals: number[]) =>
  cals.length ? Math.round((cals.reduce((a, b) => a + b, 0) / cals.length / 5) * 1000) / 10 : 0

export async function getAnalisisCalificacionConductor(
  empresaId?: number | null,
  desde?: string | null,
  hasta?: string | null,
): Promise<{ success: boolean; data?: AnalisisCalificacion; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const clientes: number[] = empresaId ? [empresaId] : SIG_CLIENTES_LIP
    const nombres: Record<number, string> = {}
    {
      const { data: emps } = await supabase.from("empresas").select("id,nombre").in("id", clientes)
      for (const e of emps ?? []) nombres[e.id] = e.nombre
    }

    // Cargues finalizados (fincargue marcado) = habilitados para calificar.
    let q = supabase
      .from("cabeceraoc")
      .select("idempresa,ordendecargue,fechaorden,conductor,placa,fincargue")
      .in("idempresa", clientes)
      .not("fincargue", "is", null)
      .limit(10000)
    if (desde) q = q.gte("fechaorden", desde)
    if (hasta) q = q.lte("fechaorden", hasta)
    const { data: cargues, error } = await q
    if (error) return { success: false, error: error.message }

    // Datos del conductor: vienen del registro del vehículo (citasvehiculos),
    // vinculados a la orden por `ocargue`. Fuente de verdad del conductor/placa.
    const { data: citas } = await supabase
      .from("citasvehiculos")
      .select("ocargue,nombreconductor,placa")
      .in("idempresa", clientes)
    const citaPorOc: Record<string, { conductor?: string | null; placa?: string | null }> = {}
    for (const c of citas ?? []) if (c.ocargue) citaPorOc[String(c.ocargue)] = { conductor: c.nombreconductor, placa: c.placa }

    // Calificaciones ya registradas (por orden).
    const { data: califs } = await supabase
      .from("sig_satisfaccion")
      .select("ref_orden,calificacion")
      .eq("tipo", "conductor")
      .not("ref_orden", "is", null)
      .in("proyecto_id", clientes)
    const calPorOrden: Record<string, number> = {}
    for (const c of califs ?? []) if (c.ref_orden) calPorOrden[String(c.ref_orden)] = Number(c.calificacion) || 0

    const filas: CargueCalificable[] = (cargues ?? []).map((r: any) => {
      const cita = citaPorOc[String(r.ordendecargue)] || {}
      return {
        ref_orden: String(r.ordendecargue),
        proyecto_id: r.idempresa,
        proyecto: nombres[r.idempresa] || `Empresa ${r.idempresa}`,
        conductor: r.conductor || cita.conductor || null,
        placa: r.placa || cita.placa || null,
        fecha: r.fechaorden,
        calificacion: calPorOrden[String(r.ordendecargue)] ?? null,
      }
    })

    const calificadas = filas.filter((f) => f.calificacion != null)
    const cals = calificadas.map((f) => f.calificacion as number)
    const feliz = cals.filter((c) => c >= 4).length
    const regular = cals.filter((c) => c === 3).length
    const mala = cals.filter((c) => c <= 2).length

    // Por proyecto (cuando se ven todos).
    const proyMap: Record<number, { cals: number[]; fin: number }> = {}
    for (const f of filas) {
      proyMap[f.proyecto_id] = proyMap[f.proyecto_id] || { cals: [], fin: 0 }
      proyMap[f.proyecto_id].fin++
      if (f.calificacion != null) proyMap[f.proyecto_id].cals.push(f.calificacion)
    }
    const porProyecto = Object.entries(proyMap)
      .map(([id, v]) => ({
        proyecto: nombres[Number(id)] || `Empresa ${id}`,
        satisfaccion: satDe(v.cals),
        calificados: v.cals.length,
        cobertura: pct(v.cals.length, v.fin),
      }))
      .sort((a, b) => b.satisfaccion - a.satisfaccion)

    // Por mes (de las calificadas).
    const mesMap: Record<string, number[]> = {}
    for (const f of calificadas) {
      const k = String(f.fecha || "").slice(0, 7)
      if (!k) continue
      mesMap[k] = mesMap[k] || []
      mesMap[k].push(f.calificacion as number)
    }
    const porMes = Object.entries(mesMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([mes, v]) => ({ mes, satisfaccion: satDe(v), n: v.length }))

    const pendientes = filas
      .filter((f) => f.calificacion == null)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
      .slice(0, 300)

    return {
      success: true,
      data: {
        resumen: {
          finalizados: filas.length,
          calificados: calificadas.length,
          pendientes: filas.length - calificadas.length,
          cobertura: pct(calificadas.length, filas.length),
          satisfaccion: satDe(cals),
          feliz,
          regular,
          mala,
        },
        pendientes,
        porProyecto,
        porMes,
        verTodos: !empresaId,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function registrarCalificacionConductor(input: {
  proyectoId: number
  refOrden: string
  placa?: string | null
  conductor?: string | null
  emoji: "feliz" | "regular" | "mala"
  comentario?: string | null
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!input.proyectoId) return { success: false, error: "Falta el proyecto" }
    if (!input.refOrden) return { success: false, error: "Falta la orden de cargue" }
    const supabase: any = await getSupabaseAdmin()
    const hoy = new Date().toISOString().slice(0, 10)
    const fila = {
      proyecto_id: input.proyectoId,
      tipo: "conductor",
      fecha: hoy,
      encuestado: input.conductor || input.placa || "Conductor",
      placa: input.placa || null,
      ref_orden: input.refOrden,
      calificacion: EMOJI_A_CALIF[input.emoji],
      recomendaria: input.emoji === "feliz",
      comentario: input.comentario || null,
      canal: "kiosko",
      activo: true,
    }
    // Una calificación por orden (puede recalificarse). Upsert MANUAL por
    // ref_orden: el índice único es PARCIAL, así que ON CONFLICT no aplica.
    const { data: existente } = await supabase
      .from("sig_satisfaccion")
      .select("id")
      .eq("ref_orden", input.refOrden)
      .maybeSingle()
    const { error } = existente?.id
      ? await supabase.from("sig_satisfaccion").update(fila).eq("id", existente.id)
      : await supabase.from("sig_satisfaccion").insert(fila)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}
