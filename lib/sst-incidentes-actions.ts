"use server"

import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type { IncidenteRow, IncidenteAccionRow, IncidenteTestigoRow } from "@/lib/sst-evidencia-types"

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
    // SST transversal (LIP): se listan TODAS las investigaciones AT sin filtrar
    // por el ID del cliente (misma info para todos los proyectos).
    .order("fecha_evento", { ascending: false })
  if (error) {
    console.error("[v0] listIncidentes:", error.message)
    return []
  }
  return (data ?? []) as IncidenteRow[]
}

// Guarda el incidente con sus acciones (plan F/M/I) y testigos. Devuelve el id creado.
export async function saveIncidente(
  row: Partial<IncidenteRow>,
  acciones: Partial<IncidenteAccionRow>[] = [],
  empresaIdFromClient?: number | null,
  testigos: Partial<IncidenteTestigoRow>[] = [],
): Promise<{ success: boolean; id?: number; message?: string }> {
  const supabase: any = await createClient()
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
  const testValidos = testigos.filter((t) => (t.nombre && t.nombre.trim()) || (t.documento && t.documento.trim()))
  if (incidenteId && testValidos.length) {
    const payloadT = testValidos.map((t) => ({
      nombre: t.nombre ?? null,
      documento: t.documento ?? null,
      version: t.version ?? null,
      cargo: t.cargo ?? null,
      incidente_id: incidenteId,
      idempresa: empresaId,
    }))
    const { error: e3 } = await supabase.from("sst_incidente_testigos").insert(payloadT)
    if (e3) console.error("[v0] saveIncidente testigos:", e3.message)
  }
  return { success: true, id: incidenteId }
}

export async function listTestigos(incidenteId: number): Promise<IncidenteTestigoRow[]> {
  const supabase: any = await createClient()
  const { data, error } = await supabase
    .from("sst_incidente_testigos")
    .select("*")
    .eq("incidente_id", incidenteId)
    .order("id")
  if (error) {
    console.error("[v0] listTestigos:", error.message)
    return []
  }
  return (data ?? []) as IncidenteTestigoRow[]
}

export async function updateIncidente(
  id: number,
  patch: Partial<IncidenteRow>,
): Promise<{ success: boolean; message?: string }> {
  const supabase: any = await createClient()
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
