"use server"

import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type { GestionCambioRow } from "@/lib/sst-evidencia-types"

async function resolveEmpresaId(fromClient?: number | null): Promise<number | null> {
  if (fromClient && !Number.isNaN(fromClient)) return fromClient
  return await getCurrentEmpresaIdForInsert()
}

export async function listGestionCambio(empresaIdFromClient?: number | null): Promise<GestionCambioRow[]> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  if (!empresaId) return []
  const { data, error } = await supabase
    .from("sst_gestion_cambio")
    .select("*")
    .eq("idempresa", empresaId)
    .order("fecha_reporte", { ascending: false })
  if (error) {
    console.error("[v0] listGestionCambio:", error.message)
    return []
  }
  return (data ?? []) as GestionCambioRow[]
}

export async function saveGestionCambio(
  row: Partial<GestionCambioRow>,
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const { error } = await supabase.from("sst_gestion_cambio").insert([{ ...row, idempresa: empresaId }])
  return error ? { success: false, message: error.message } : { success: true }
}

export async function updateGestionCambio(
  id: number,
  patch: Partial<GestionCambioRow>,
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("sst_gestion_cambio").update(patch).eq("id", id)
  return error ? { success: false, message: error.message } : { success: true }
}
