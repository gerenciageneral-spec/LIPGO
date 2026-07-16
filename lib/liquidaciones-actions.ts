"use server"

// Submódulo Liquidaciones: reporte de las personas RETIRADAS (headcount.estado
// Inactivo) con sus novedades de nómina pendientes (desde pagonomina, hasta su
// fecha de retiro) para pagarles la liquidación. Además maneja el ESTADO de la
// liquidación (pendiente/liquidada) y el SOPORTE adjunto, en la tabla
// liquidaciones_retiro. El detalle de novedades se calcula en vivo; el estado y
// el soporte se persisten.

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export type EstadoLiquidacion = "pendiente" | "liquidada"

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
  idempresa: number | null
  fecha_retiro: string | null
  dias: number
  total: number
  estado: EstadoLiquidacion
  soporte_url: string | null
  soporte_nombre: string | null
  novedades: LiquidacionNovedad[]
}

// NOTA: aunque todos son empleados de LIP, están ASIGNADOS a clientes distintos;
// headcount.idempresa = el cliente/operación. El reporte se mantiene separado por
// cliente → filtra por la empresa (cliente) del selector global.
export async function getLiquidaciones(
  idempresa: number,
  fechaInicio?: string | null,
  fechaFin?: string | null,
): Promise<{ success: boolean; data: LiquidacionPersona[]; message?: string }> {
  if (!idempresa) return { success: false, data: [], message: "Selecciona una empresa." }
  try {
    const admin: any = await getSupabaseAdmin()

    // 1) Retirados (estado Inactivo) de la empresa/cliente seleccionado.
    const { data: retirados, error: rErr } = await admin
      .from("headcount")
      .select("identificacion, nombre, fecha_retiro, idempresa")
      .eq("idempresa", idempresa)
      .ilike("estado", "inactivo")
    if (rErr) return { success: false, data: [], message: rErr.message }
    if (!retirados || retirados.length === 0) return { success: true, data: [] }

    // pagonomina cruza por NOMBRE; indexamos por nombre.
    const infoPorNombre = new Map<string, { identificacion: string; fecha_retiro: string | null; idempresa: number | null }>()
    const nombres: string[] = []
    for (const r of retirados) {
      const nombre = String(r.nombre || "").trim()
      if (!nombre) continue
      infoPorNombre.set(nombre, {
        identificacion: r.identificacion,
        fecha_retiro: r.fecha_retiro ?? null,
        idempresa: r.idempresa ?? null,
      })
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
      let q = admin.from("pagonomina").select(cols).in("persona", nombres)
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

    // 3) Estado/soporte guardado por persona (tabla liquidaciones_retiro).
    const estadoPorCedula = new Map<string, { estado: EstadoLiquidacion; soporte_url: string | null; soporte_nombre: string | null }>()
    const { data: estados } = await admin
      .from("liquidaciones_retiro")
      .select("identificacion, estado, soporte_url, soporte_nombre")
      .eq("idempresa", idempresa)
    for (const e of estados || []) {
      estadoPorCedula.set(String(e.identificacion || "").trim(), {
        estado: e.estado === "liquidada" ? "liquidada" : "pendiente",
        soporte_url: e.soporte_url ?? null,
        soporte_nombre: e.soporte_nombre ?? null,
      })
    }

    // 4) Agrupar por persona; nunca contar días posteriores a la fecha de retiro.
    const porPersona = new Map<string, LiquidacionPersona>()
    for (const [nombre, info] of infoPorNombre) {
      const est = estadoPorCedula.get(String(info.identificacion || "").trim())
      porPersona.set(nombre, {
        persona: nombre,
        identificacion: info.identificacion,
        idempresa: info.idempresa,
        fecha_retiro: info.fecha_retiro,
        dias: 0,
        total: 0,
        estado: est?.estado ?? "pendiente",
        soporte_url: est?.soporte_url ?? null,
        soporte_nombre: est?.soporte_nombre ?? null,
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

    // Orden: pendientes primero, luego por fecha de retiro más reciente.
    const data = Array.from(porPersona.values()).sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === "pendiente" ? -1 : 1
      return String(b.fecha_retiro || "").localeCompare(String(a.fecha_retiro || ""))
    })
    return { success: true, data }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al cargar las liquidaciones." }
  }
}

// Marca la liquidación de una persona como 'liquidada' o 'pendiente' (upsert).
export async function guardarEstadoLiquidacion(payload: {
  idempresa: number | null
  identificacion: string
  persona: string
  fecha_retiro: string | null
  total: number
  estado: EstadoLiquidacion
}): Promise<{ success: boolean; message?: string }> {
  if (!payload?.identificacion) return { success: false, message: "Datos incompletos." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await admin.from("liquidaciones_retiro").upsert(
      {
        idempresa: payload.idempresa,
        identificacion: payload.identificacion,
        persona: payload.persona,
        fecha_retiro: payload.fecha_retiro,
        total_liquidado: payload.total,
        estado: payload.estado,
        fecha_liquidacion: payload.estado === "liquidada" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "idempresa,identificacion" },
    )
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar el estado." }
  }
}

// Sube el soporte de liquidación (PDF/imagen) a Storage y guarda la URL.
export async function subirSoporteLiquidacion(
  formData: FormData,
): Promise<{ success: boolean; url?: string; message?: string }> {
  try {
    const file = formData.get("file") as File | null
    const idempresa = Number(formData.get("idempresa"))
    const identificacion = String(formData.get("identificacion") || "").trim()
    const persona = String(formData.get("persona") || "")
    const fecha_retiro = (formData.get("fecha_retiro") as string) || null
    if (!file || !idempresa || !identificacion) return { success: false, message: "Faltan datos o archivo." }

    const admin: any = await getSupabaseAdmin()
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase()
    const filePath = `liquidaciones/${identificacion}_${Date.now()}.${ext}`

    const { error: upErr } = await admin.storage.from("archivos").upload(filePath, file, { upsert: true })
    if (upErr) return { success: false, message: upErr.message }

    const { data: urlData } = admin.storage.from("archivos").getPublicUrl(filePath)
    const url = urlData?.publicUrl as string

    const { error: dbErr } = await admin.from("liquidaciones_retiro").upsert(
      {
        idempresa,
        identificacion,
        persona,
        fecha_retiro,
        soporte_url: url,
        soporte_nombre: file.name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "idempresa,identificacion" },
    )
    if (dbErr) return { success: false, message: dbErr.message }

    return { success: true, url }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al subir el soporte." }
  }
}
