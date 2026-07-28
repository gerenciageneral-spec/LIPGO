"use server"

// Metas de toneladas por proyecto (Financiera › Tarifas › Metas). Referencia de
// productividad: lo mínimo que cada trabajador debe mover/día para "ganarse" la base.
// Alimenta el módulo Revisión de nómina (solo indicador; no cambia la liquidación).
// Tabla: meta_toneladas_proyecto (ver scripts/create_meta_toneladas_proyecto.sql).

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export interface MetaToneladas {
  idempresa: number
  proyecto: string
  toneladasMes: number
  diasOperacion: number
  hc: number
  // derivados
  toneladasDia: number
  metaTonTrabajadorDia: number
}

const num = (v: any) => Number(v || 0)

/** Deriva ton/día y meta/trabajador desde los inputs (local; no es server action). */
function derivarMeta(toneladasMes: number, diasOperacion: number, hc: number) {
  const toneladasDia = diasOperacion > 0 ? toneladasMes / diasOperacion : 0
  const metaTonTrabajadorDia = hc > 0 ? toneladasDia / hc : 0
  return { toneladasDia, metaTonTrabajadorDia }
}

function rowToMeta(r: any): MetaToneladas {
  const toneladasMes = num(r.toneladas_mes)
  const diasOperacion = num(r.dias_operacion) || 24.7
  const hc = Number(r.hc) || 0
  const { toneladasDia, metaTonTrabajadorDia } = derivarMeta(toneladasMes, diasOperacion, hc)
  return {
    idempresa: Number(r.idempresa),
    proyecto: String(r.proyecto || "").trim(),
    toneladasMes,
    diasOperacion,
    hc,
    toneladasDia,
    metaTonTrabajadorDia,
  }
}

/** Lista las metas por proyecto (ordenadas por idempresa). */
export async function getMetasToneladas(): Promise<{ success: boolean; data: MetaToneladas[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { data, error } = await admin
      .from("meta_toneladas_proyecto")
      .select("*")
      .order("idempresa", { ascending: true })
    if (error) return { success: false, data: [], message: error.message }
    return { success: true, data: (data || []).map(rowToMeta) }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al leer las metas." }
  }
}

/** Guarda (upsert por idempresa) una meta de proyecto. */
export async function guardarMetaToneladas(m: {
  idempresa: number
  proyecto: string
  toneladasMes: number
  diasOperacion: number
  hc: number
}): Promise<{ success: boolean; message?: string }> {
  if (!m?.idempresa) return { success: false, message: "Proyecto (idempresa) inválido." }
  if (!(m.hc > 0)) return { success: false, message: "El head count (HC) debe ser mayor que 0." }
  if (!(m.diasOperacion > 0)) return { success: false, message: "Los días de operación deben ser mayores que 0." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await admin.from("meta_toneladas_proyecto").upsert(
      {
        idempresa: m.idempresa,
        proyecto: m.proyecto,
        toneladas_mes: m.toneladasMes,
        dias_operacion: m.diasOperacion,
        hc: m.hc,
        actualizado_at: new Date().toISOString(),
      },
      { onConflict: "idempresa" },
    )
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar la meta." }
  }
}

/** Elimina la meta de un proyecto. */
export async function eliminarMetaToneladas(idempresa: number): Promise<{ success: boolean; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await admin.from("meta_toneladas_proyecto").delete().eq("idempresa", idempresa)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al eliminar la meta." }
  }
}
