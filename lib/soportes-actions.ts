"use server"

// Repositorio central de soportes documentales. Sube al bucket "archivos" y
// registra el archivo en soportes_documentales (append-only: conserva el historial).

import { createClient } from "@/lib/supabase-client"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type { SoporteRow, SoporteMeta } from "@/lib/soportes-types"

async function resolveEmpresaId(fromClient?: number | null): Promise<number | null> {
  if (fromClient && !Number.isNaN(fromClient)) return fromClient
  return await getCurrentEmpresaIdForInsert()
}
const safe = (s: string) => (s || "").replace(/[^a-zA-Z0-9._-]/g, "_")

// Lista el historial de soportes de una referencia (último primero).
export async function listSoportes(
  referenciaTipo: string,
  referenciaId: string,
  empresaIdFromClient?: number | null,
): Promise<SoporteRow[]> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  if (!empresaId) return []
  const { data, error } = await supabase
    .from("soportes_documentales")
    .select("*")
    // SST transversal (LIP): no se filtra por el ID del cliente.
    .eq("referencia_tipo", referenciaTipo)
    .eq("referencia_id", referenciaId)
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[v0] listSoportes:", error.message)
    return []
  }
  return (data ?? []) as SoporteRow[]
}

// Lista todos los soportes de un módulo (para el repositorio/auditoría).
export async function listSoportesByModulo(
  modulo: string,
  empresaIdFromClient?: number | null,
): Promise<SoporteRow[]> {
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  if (!empresaId) return []
  const { data, error } = await supabase
    .from("soportes_documentales")
    .select("*")
    // SST transversal (LIP): no se filtra por el ID del cliente.
    .eq("modulo", modulo)
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[v0] listSoportesByModulo:", error.message)
    return []
  }
  return (data ?? []) as SoporteRow[]
}

// Sube el archivo y lo registra. Marca los anteriores de la misma referencia
// como histórico (vigente=false) y deja el nuevo como vigente.
export async function subirYRegistrarSoporte(
  file: File,
  meta: SoporteMeta,
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; url?: string; id?: number; message?: string }> {
  try {
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    if (!empresaId) return { success: false, message: "No se pudo resolver la empresa." }

    const supabaseAdmin = await getSupabaseAdmin()
    const ext = file.name.split(".").pop() || "bin"
    const fileName = `${safe(meta.referenciaTipo)}_${safe(meta.referenciaId)}_${Date.now()}.${ext}`
    const filePath = `soportes/${safe(meta.modulo)}/${fileName}`
    const up = await supabaseAdmin.storage
      .from("archivos")
      .upload(filePath, file, { contentType: file.type || undefined, upsert: true })
    if (up.error) {
      console.error("[v0] subirYRegistrarSoporte upload:", up.error.message)
      return { success: false, message: up.error.message }
    }
    const { data: urlData } = supabaseAdmin.storage.from("archivos").getPublicUrl(filePath)
    const url = urlData.publicUrl

    const supabase = await createClient()
    await supabase
      .from("soportes_documentales")
      .update({ vigente: false })
      // SST transversal (LIP): la vigencia se maneja a nivel LIP, no por cliente.
      .eq("referencia_tipo", meta.referenciaTipo)
      .eq("referencia_id", meta.referenciaId)

    const ins = await supabase
      .from("soportes_documentales")
      .insert([
        {
          idempresa: empresaId,
          norma: meta.norma,
          modulo: meta.modulo,
          referencia_tipo: meta.referenciaTipo,
          referencia_id: meta.referenciaId,
          referencia_desc: meta.referenciaDesc ?? null,
          archivo_url: url,
          archivo_nombre: file.name,
          tipo_archivo: file.type || ext,
          tamano: file.size,
          subido_por: meta.subidoPor ?? null,
          observacion: meta.observacion ?? null,
          vigente: true,
        },
      ])
      .select("id")
      .single()
    if (ins.error) {
      console.error("[v0] subirYRegistrarSoporte insert:", ins.error.message)
      return { success: false, message: ins.error.message }
    }
    return { success: true, url, id: (ins.data as any)?.id }
  } catch (e: any) {
    console.error("[v0] subirYRegistrarSoporte:", e?.message ?? e)
    return { success: false, message: e?.message ?? "Error inesperado al subir el soporte." }
  }
}

// Marca un soporte como histórico (no borra el archivo; conserva la trazabilidad).
export async function anularSoporte(id: number): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("soportes_documentales").update({ vigente: false }).eq("id", id)
  return error ? { success: false, message: error.message } : { success: true }
}
