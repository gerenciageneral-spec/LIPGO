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
  let q = supabase.from("sst_medevac").select("*").order("nombres", { ascending: true })
  // Con selector global: filtra por proyecto. Sin selección: consolidado.
  if (empresaId) q = q.eq("idempresa", empresaId)
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
