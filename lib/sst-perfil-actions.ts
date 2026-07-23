"use server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type { PerfilSociodemograficoRow } from "@/lib/sst-evidencia-types"

// Cliente admin server-side (la tabla tiene RLS; el acceso lo controla PermissionGuard).
async function resolveEmpresaId(fromClient?: number | null): Promise<number | null> {
  if (fromClient && !Number.isNaN(fromClient)) return fromClient
  return await getCurrentEmpresaIdForInsert()
}

export async function listPerfilSociodemografico(
  empresaIdFromClient?: number | null,
): Promise<PerfilSociodemograficoRow[]> {
  const supabase: any = await getSupabaseAdmin()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  let q = supabase.from("sst_perfil_sociodemografico").select("*").order("apellidos", { ascending: true })
  // SST transversal (LIP): se lista TODO el perfil sociodemográfico sin filtrar
  // por el ID del cliente; la info de SST es la misma para todos los proyectos.
  void empresaId
  const { data, error } = await q
  if (error) {
    console.error("[v0] listPerfilSociodemografico:", error.message)
    return []
  }
  return (data ?? []) as PerfilSociodemograficoRow[]
}
