"use server"

import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type { IpevrRow } from "@/lib/sst-evidencia-types"

async function resolveEmpresaId(fromClient?: number | null): Promise<number | null> {
  if (fromClient && !Number.isNaN(fromClient)) return fromClient
  return await getCurrentEmpresaIdForInsert()
}

export async function listIpevr(empresaIdFromClient?: number | null): Promise<IpevrRow[]> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  if (!empresaId) return []
  const { data, error } = await supabase
    .from("sst_ipevr")
    .select("*")
    .eq("idempresa", empresaId)
    .order("id", { ascending: false })
  if (error) {
    console.error("[v0] listIpevr:", error.message)
    return []
  }
  return (data ?? []) as IpevrRow[]
}

// NP, NR, interpretacion y aceptabilidad los calcula Supabase (columnas generadas + trigger).
export async function saveIpevr(
  row: Partial<IpevrRow>,
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const { error } = await supabase.from("sst_ipevr").insert([{ ...row, idempresa: empresaId }])
  return error ? { success: false, message: error.message } : { success: true }
}
