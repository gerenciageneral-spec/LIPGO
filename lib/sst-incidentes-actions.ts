"use server"

import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type { IncidenteRow, IncidenteAccionRow } from "@/lib/sst-evidencia-types"

async function resolveEmpresaId(fromClient?: number | null): Promise<number | null> {
  if (fromClient && !Number.isNaN(fromClient)) return fromClient
  return await getCurrentEmpresaIdForInsert()
}

export async function listIncidentes(empresaIdFromClient?: number | null): Promise<IncidenteRow[]> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  if (!empresaId) return []
  const { data, error } = await supabase
    .from("sst_incidentes")
    .select("*")
    .eq("idempresa", empresaId)
    .order("fecha_evento", { ascending: false })
  if (error) {
    console.error("[v0] listIncidentes:", error.message)
    return []
  }
  return (data ?? []) as IncidenteRow[]
}

// Guarda el incidente y, si vienen, sus acciones (plan F/M/I). Devuelve el id creado.
export async function saveIncidente(
  row: Partial<IncidenteRow>,
  acciones: Partial<IncidenteAccionRow>[] = [],
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; message?: string }> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const { data, error } = await supabase
    .from("sst_incidentes")
    .insert([{ ...row, idempresa: empresaId }])
    .select("id")
    .single()
  if (error) {
    console.error("[v0] saveIncidente:", error.message)
    return { success: false, message: error.message }
  }
  const incidenteId = (data as any)?.id as number
  const validas = acciones.filter((a) => a.plan && a.plan.trim())
  if (incidenteId && validas.length) {
    const payload = validas.map((a) => ({ ...a, incidente_id: incidenteId, idempresa: empresaId }))
    const { error: e2 } = await supabase.from("sst_incidente_acciones").insert(payload)
    if (e2) console.error("[v0] saveIncidente acciones:", e2.message)
  }
  return { success: true, id: incidenteId }
}

export async function updateIncidente(
  id: number,
  patch: Partial<IncidenteRow>,
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("sst_incidentes").update(patch).eq("id", id)
  return error ? { success: false, message: error.message } : { success: true }
}

export async function listAcciones(incidenteId: number): Promise<IncidenteAccionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("sst_incidente_acciones")
    .select("*")
    .eq("incidente_id", incidenteId)
    .order("id")
  if (error) {
    console.error("[v0] listAcciones:", error.message)
    return []
  }
  return (data ?? []) as IncidenteAccionRow[]
}
