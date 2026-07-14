"use server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert, getCurrentUsuarioForInsert } from "@/lib/user-context"

export interface ParoComentario {
  id: string
  idempresa: number
  fecha: string
  inicio: string
  fin: string | null
  minutos: number | null
  motivo: string | null
  categoria: string | null
  reportado_por: string | null
  created_at: string
}

// Comentarios de paro guardados de un día (por empresa).
export async function getParos(selectedEmpresaId: number | null | undefined, fecha: string) {
  const admin: any = await getSupabaseAdmin()
  const empresaId = selectedEmpresaId || (await getCurrentEmpresaIdForInsert())
  if (!empresaId || !fecha) return { success: true, data: [] as ParoComentario[] }
  const { data, error } = await admin
    .from("paros_produccion")
    .select("*")
    .eq("idempresa", empresaId)
    .eq("fecha", fecha)
    .order("inicio", { ascending: true })
  if (error) return { success: false, data: [] as ParoComentario[], message: error.message }
  return { success: true, data: (data || []) as ParoComentario[] }
}

// Guarda/actualiza el motivo de una franja de paro (upsert por empresa+fecha+inicio).
export async function guardarParo(payload: {
  empresaId?: number | null
  fecha: string
  inicio: string
  fin?: string | null
  minutos?: number | null
  motivo: string
  categoria?: string | null
}) {
  const admin: any = await getSupabaseAdmin()
  const empresaId = payload.empresaId || (await getCurrentEmpresaIdForInsert())
  if (!empresaId) return { success: false, message: "Sin empresa seleccionada." }
  if (!payload.fecha || !payload.inicio) return { success: false, message: "Falta la franja de paro." }
  const motivo = (payload.motivo || "").trim()
  if (!motivo) return { success: false, message: "Escribe el motivo del paro." }

  const usuario = await getCurrentUsuarioForInsert()
  const row = {
    idempresa: empresaId,
    fecha: payload.fecha,
    inicio: payload.inicio,
    fin: payload.fin ?? null,
    minutos: payload.minutos ?? null,
    motivo,
    categoria: payload.categoria ?? null,
    reportado_por: usuario,
    updated_at: new Date().toISOString(),
  }
  const { data: exist } = await admin
    .from("paros_produccion")
    .select("id")
    .eq("idempresa", empresaId)
    .eq("fecha", payload.fecha)
    .eq("inicio", payload.inicio)
    .limit(1)
  const id = exist?.[0]?.id
  if (id) {
    const { error } = await admin.from("paros_produccion").update(row).eq("id", id)
    if (error) return { success: false, message: error.message }
  } else {
    const { error } = await admin.from("paros_produccion").insert(row)
    if (error) return { success: false, message: error.message }
  }
  return { success: true }
}

// Elimina el comentario de una franja (vuelve a "sin comentar").
export async function eliminarParo(payload: { empresaId?: number | null; fecha: string; inicio: string }) {
  const admin: any = await getSupabaseAdmin()
  const empresaId = payload.empresaId || (await getCurrentEmpresaIdForInsert())
  if (!empresaId) return { success: false, message: "Sin empresa seleccionada." }
  const { error } = await admin
    .from("paros_produccion")
    .delete()
    .eq("idempresa", empresaId)
    .eq("fecha", payload.fecha)
    .eq("inicio", payload.inicio)
  if (error) return { success: false, message: error.message }
  return { success: true }
}
