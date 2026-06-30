"use server"

import { createClient } from "@/lib/supabase-client"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"

export interface HojaDeVida {
  id: string
  idempresa: number
  nombre_candidato: string
  cedula: string | null
  cargo_aspirado: string | null
  correo: string | null
  telefono: string | null
  notas: string | null
  archivo_url: string
  archivo_nombre: string
  archivo_tipo: string | null
  archivo_tamano: number | null
  estado: "pendiente" | "aceptado" | "rechazado"
  created_at: string
}

// Lista las hojas de vida de la empresa seleccionada (o la de sesion).
export async function getHojasVida(selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  const empresaId = selectedEmpresaId || (await getCurrentEmpresaIdForInsert())

  const { data, error } = await supabase
    .from("hojas_de_vida")
    .select("*")
    .eq("idempresa", empresaId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching hojas_de_vida:", error)
    return { success: false, data: [] as HojaDeVida[], message: error.message }
  }

  return { success: true, data: (data || []) as HojaDeVida[] }
}

// Marca una hoja de vida como aceptada, rechazada o pendiente.
export async function updateEstadoHojaVida(
  id: string,
  estado: "pendiente" | "aceptado" | "rechazado",
) {
  const supabase = await createClient()
  const { error } = await supabase.from("hojas_de_vida").update({ estado }).eq("id", id)

  if (error) {
    console.error("[v0] Error updating estado hoja_de_vida:", error)
    return { success: false, message: error.message }
  }

  return { success: true }
}

// Elimina una hoja de vida (archivo en Supabase Storage + metadatos).
export async function deleteHojaVida(id: string) {
  const supabase = await createClient()

  const { data: current } = await supabase
    .from("hojas_de_vida")
    .select("archivo_url")
    .eq("id", id)
    .maybeSingle()

  // Borramos primero el archivo del bucket "archivos" (si falla no
  // interrumpimos el borrado del registro). Derivamos la ruta interna a
  // partir de la URL publica de Supabase Storage.
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
      console.error("[v0] Error eliminando archivo de Storage:", err?.message || err)
    }
  }

  const { error } = await supabase.from("hojas_de_vida").delete().eq("id", id)

  if (error) {
    console.error("[v0] Error deleting hoja_de_vida:", error)
    return { success: false, message: error.message }
  }

  return { success: true }
}
