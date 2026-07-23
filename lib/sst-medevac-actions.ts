"use server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type { MedevacRow } from "@/lib/sst-evidencia-types"

// Nota: se usa el cliente admin (service role) en el servidor porque la tabla
// sst_medevac tiene RLS activo; el acceso al módulo ya lo controla PermissionGuard
// (permiso sst_medevac). El filtro por proyecto lo da el selector global.

async function resolveEmpresaId(fromClient?: number | null): Promise<number | null> {
  if (fromClient && !Number.isNaN(fromClient)) return fromClient
  return await getCurrentEmpresaIdForInsert()
}

export async function listMedevac(empresaIdFromClient?: number | null): Promise<MedevacRow[]> {
  const supabase: any = await getSupabaseAdmin()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const q = supabase.from("sst_medevac").select("*").order("nombres", { ascending: true })
  // SST transversal (LIP): se listan TODOS los registros MEDEVAC sin filtrar por
  // el ID del cliente; la info de SST es la misma para todos los proyectos.
  void empresaId
  const { data, error } = await q
  if (error) {
    console.error("[v0] listMedevac:", error.message)
    return []
  }
  return (data ?? []) as MedevacRow[]
}

export async function saveMedevac(
  row: Partial<MedevacRow>,
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; message?: string }> {
  const supabase: any = await getSupabaseAdmin()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const { error } = await supabase.from("sst_medevac").insert([{ ...row, idempresa: row.idempresa ?? empresaId }])
  return error ? { success: false, message: error.message } : { success: true }
}

export async function deleteMedevac(id: number): Promise<{ success: boolean; message?: string }> {
  const supabase: any = await getSupabaseAdmin()
  const { error } = await supabase.from("sst_medevac").delete().eq("id", id)
  return error ? { success: false, message: error.message } : { success: true }
}

// Autorrelleno: busca al colaborador en el head count / carpeta de Trabajadores
// (tabla headcount) por N° de documento. Valida contra el proyecto del selector:
// si se pasa empresaId, solo lo encuentra si pertenece a ese proyecto.
export async function buscarColaboradorMedevac(
  documento: string,
  empresaId?: number | null,
): Promise<{ found: boolean; data?: any; message?: string }> {
  const doc = String(documento || "").trim()
  if (!doc) return { found: false }
  const supabase: any = await getSupabaseAdmin()
  let q = supabase
    .from("headcount")
    .select("identificacion, nombre, cargo, celular, afiliacion_eps, afiliacion_arl, idempresa, estado")
    .eq("identificacion", doc)
  if (empresaId) q = q.eq("idempresa", empresaId)
  const { data, error } = await q.limit(1)
  if (error) return { found: false, message: error.message }
  if (!data || !data.length) {
    return { found: false, message: empresaId ? "No está en el head count de este proyecto" : "No se encontró en el head count" }
  }
  const p = data[0]
  return {
    found: true,
    data: {
      nombres: p.nombre ?? "",
      cargo: p.cargo ?? "",
      celular: p.celular ?? "",
      eps: p.afiliacion_eps ?? "",
      arl: p.afiliacion_arl ?? "",
      idempresa: p.idempresa,
      estado: p.estado ?? "",
    },
  }
}
