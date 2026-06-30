"use server"

import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type { ActividadRow, ComiteMiembroRow } from "@/lib/sst-evidencia-types"

async function resolveEmpresaId(fromClient?: number | null): Promise<number | null> {
  if (fromClient && !Number.isNaN(fromClient)) return fromClient
  return await getCurrentEmpresaIdForInsert()
}

export async function listActividades(empresaIdFromClient?: number | null): Promise<ActividadRow[]> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  if (!empresaId) return []
  const { data, error } = await supabase
    .from("sst_actividades")
    .select("*")
    .eq("idempresa", empresaId)
    .order("fecha", { ascending: false })
  if (error) {
    console.error("[v0] listActividades:", error.message)
    return []
  }
  return (data ?? []) as ActividadRow[]
}

export async function saveActividad(
  row: Partial<ActividadRow>,
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const { error } = await supabase.from("sst_actividades").insert([{ ...row, idempresa: empresaId }])
  return error ? { success: false, message: error.message } : { success: true }
}

export async function listComiteMiembros(
  comite: string,
  empresaIdFromClient?: number | null,
): Promise<ComiteMiembroRow[]> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  if (!empresaId) return []
  const { data, error } = await supabase
    .from("sst_comite_miembros")
    .select("*")
    .eq("idempresa", empresaId)
    .eq("comite", comite)
    .order("id")
  if (error) {
    console.error("[v0] listComiteMiembros:", error.message)
    return []
  }
  return (data ?? []) as ComiteMiembroRow[]
}

export async function saveComiteMiembro(
  row: Partial<ComiteMiembroRow>,
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const { error } = await supabase.from("sst_comite_miembros").insert([{ ...row, idempresa: empresaId }])
  return error ? { success: false, message: error.message } : { success: true }
}
