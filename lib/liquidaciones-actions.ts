"use server"

// Submódulo Liquidaciones: reporte de las personas RETIRADAS (headcount.estado
// Inactivo) con sus novedades de nómina pendientes (desde pagonomina, hasta su
// fecha de retiro) para pagarles la liquidación. Solo LECTURA. Es un reporte de
// novedades, no un cálculo de finiquito legal.

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export interface LiquidacionNovedad {
  fecha: string
  actividad_registrada: string | null
  novedad_reportada: string | null
  base_dia: number
  hed: number
  hedf: number
  hen: number
  hef: number
  hn: number
  pago_domingo: number
  recargodominical: number
  total_liquidado_dia: number
}

export interface LiquidacionPersona {
  persona: string
  identificacion: string
  fecha_retiro: string | null
  dias: number
  total: number
  novedades: LiquidacionNovedad[]
}

export async function getLiquidaciones(
  idempresa: number,
  fechaInicio?: string | null,
  fechaFin?: string | null,
): Promise<{ success: boolean; data: LiquidacionPersona[]; message?: string }> {
  if (!idempresa) return { success: false, data: [], message: "Selecciona una empresa." }
  try {
    const admin: any = await getSupabaseAdmin()

    // 1) Retirados de la empresa (estado Inactivo, case-insensitive).
    const { data: retirados, error: rErr } = await admin
      .from("headcount")
      .select("identificacion, nombre, fecha_retiro")
      .eq("idempresa", idempresa)
      .ilike("estado", "inactivo")
    if (rErr) return { success: false, data: [], message: rErr.message }
    if (!retirados || retirados.length === 0) return { success: true, data: [] }

    // pagonomina cruza por NOMBRE; indexamos por nombre.
    const infoPorNombre = new Map<string, { identificacion: string; fecha_retiro: string | null }>()
    const nombres: string[] = []
    for (const r of retirados) {
      const nombre = String(r.nombre || "").trim()
      if (!nombre) continue
      infoPorNombre.set(nombre, { identificacion: r.identificacion, fecha_retiro: r.fecha_retiro ?? null })
      nombres.push(nombre)
    }
    if (nombres.length === 0) return { success: true, data: [] }

    // 2) Novedades desde pagonomina (paginado; PostgREST corta en 1000 filas).
    const cols =
      "fecha, persona, actividad_registrada, novedad_reportada, base_dia, hed, hedf, hen, hef, hn, pago_domingo, recargodominical, total_liquidado_dia"
    let all: any[] = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    while (hasMore) {
      let q = admin
        .from("pagonomina")
        .select(cols)
        .eq("idempresaliquidacion", idempresa)
        .in("persona", nombres)
      if (fechaInicio) q = q.gte("fecha", fechaInicio)
      if (fechaFin) q = q.lte("fecha", fechaFin)
      const { data, error } = await q.order("fecha", { ascending: false }).range(offset, offset + pageSize - 1)
      if (error) return { success: false, data: [], message: error.message }
      if (!data || data.length === 0) {
        hasMore = false
      } else {
        all = all.concat(data)
        if (data.length < pageSize) hasMore = false
        else offset += pageSize
      }
    }

    // 3) Agrupar por persona; nunca contar días posteriores a la fecha de retiro.
    const porPersona = new Map<string, LiquidacionPersona>()
    // Sembrar todos los retirados (aunque no tengan novedades en el rango).
    for (const [nombre, info] of infoPorNombre) {
      porPersona.set(nombre, {
        persona: nombre,
        identificacion: info.identificacion,
        fecha_retiro: info.fecha_retiro,
        dias: 0,
        total: 0,
        novedades: [],
      })
    }
    for (const row of all) {
      const nombre = String(row.persona || "").trim()
      const acc = porPersona.get(nombre)
      if (!acc) continue
      if (acc.fecha_retiro && String(row.fecha) > acc.fecha_retiro) continue
      const nov: LiquidacionNovedad = {
        fecha: row.fecha,
        actividad_registrada: row.actividad_registrada ?? null,
        novedad_reportada: row.novedad_reportada ?? null,
        base_dia: Number(row.base_dia || 0),
        hed: Number(row.hed || 0),
        hedf: Number(row.hedf || 0),
        hen: Number(row.hen || 0),
        hef: Number(row.hef || 0),
        hn: Number(row.hn || 0),
        pago_domingo: Number(row.pago_domingo || 0),
        recargodominical: Number(row.recargodominical || 0),
        total_liquidado_dia: Number(row.total_liquidado_dia || 0),
      }
      acc.novedades.push(nov)
      acc.dias += 1
      acc.total += nov.total_liquidado_dia
    }

    // Orden: fecha de retiro más reciente primero.
    const data = Array.from(porPersona.values()).sort((a, b) =>
      String(b.fecha_retiro || "").localeCompare(String(a.fecha_retiro || "")),
    )
    return { success: true, data }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al cargar las liquidaciones." }
  }
}
