"use server"

import { createClient } from "@/lib/supabase-client"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"

export interface ExamenMedico {
  id: string
  idempresa: number
  entrevista_id: string | null
  hoja_vida_id: string | null
  cedula: string | null
  nombre: string
  tipo_examen: string | null
  resultado: string | null
  fecha_examen: string | null
  observaciones: string | null
  archivo_url: string
  archivo_nombre: string
  created_at: string
}

// Lista los examenes medicos de la empresa seleccionada (o la de sesion).
export async function getExamenesMedicos(selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  const empresaId = selectedEmpresaId || (await getCurrentEmpresaIdForInsert())

  const { data, error } = await supabase
    .from("examenes_medicos")
    .select("*")
    .eq("idempresa", empresaId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching examenes_medicos:", error)
    return { success: false, data: [] as ExamenMedico[], message: error.message }
  }

  return { success: true, data: (data || []) as ExamenMedico[] }
}

// Elimina un examen medico (archivo en Storage + registro).
export async function deleteExamenMedico(id: string) {
  const supabase = await createClient()

  const { data: current } = await supabase
    .from("examenes_medicos")
    .select("archivo_url")
    .eq("id", id)
    .maybeSingle()

  if (current?.archivo_url) {
    try {
      const marker = "/object/public/archivos/"
      const idx = current.archivo_url.indexOf(marker)
      if (idx !== -1) {
        const filePath = decodeURIComponent(current.archivo_url.slice(idx + marker.length))
        const supabaseAdmin = await getSupabaseAdmin()
        await supabaseAdmin.storage.from("archivos").remove([filePath])
      }
    } catch (err: any) {
      console.error("[v0] Error eliminando archivo de examen medico:", err?.message || err)
    }
  }

  const { error } = await supabase.from("examenes_medicos").delete().eq("id", id)

  if (error) {
    console.error("[v0] Error deleting examen_medico:", error)
    return { success: false, message: error.message }
  }

  return { success: true }
}
