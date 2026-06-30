"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentEmpresaId } from "@/lib/company-filter"

export async function savePreoperacional(formData: Record<string, unknown>, selectedEmpresaId?: number | null) {
  try {
    const supabase = await createClient()
    const empresaId = selectedEmpresaId || await getCurrentEmpresaId()

    // Get current date/time in Colombia timezone
    const colombiaDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) // YYYY-MM-DD format

    // Log de diagnostico: confirmamos que la firma esta llegando al
    // server action. Si llega vacia, el problema es upstream (upload
    // del componente). Si llega bien pero no se persiste, el problema
    // es el insert (columna mal escrita, RLS, etc.). Solo logueamos
    // un booleano + el largo para no exponer la URL completa.
    const firmaIn = (formData as any).firma
    console.log(
      "[v0] savePreoperacional firma recibida:",
      typeof firmaIn,
      firmaIn ? String(firmaIn).length : 0,
    )

    const payload = {
      ...formData,
      fecha: colombiaDate,
      idempresa: empresaId,
    }
    const { data, error } = await supabase
      .from("inspecciones_montacargas")
      .insert([payload])
      .select("id, firma")
      .single()

    if (error) {
      console.error("[v0] Error saving preoperacional:", error)
      return { success: false, error: error.message }
    }

    // Confirmamos en el log que el campo `firma` quedo persistido en
    // la fila recien creada. Si aqui sale null/empty pero firmaIn era
    // truthy, hay un mismatch de columna.
    console.log("[v0] savePreoperacional insertado id:", data?.id, "firma len:", data?.firma ? String(data.firma).length : 0)

    return { success: true }
  } catch (error) {
    console.error("[v0] Unexpected error in savePreoperacional:", error)
    return { success: false, error: "Error inesperado al guardar" }
  }
}

export async function getPreoperacionalHistory(selectedEmpresaId?: number | null) {
  try {
    const supabase = await createClient()
    const empresaId = selectedEmpresaId || await getCurrentEmpresaId()

    const { data, error } = await supabase
      .from("inspecciones_montacargas")
      .select("*")
      .eq("idempresa", empresaId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching preoperacional history:", error)
      return { success: false, error: error.message, data: [] }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[v0] Unexpected error in getPreoperacionalHistory:", error)
    return { success: false, error: "Error al cargar historial", data: [] }
  }
}

export async function getPreoperacionalDashboardData(
  selectedEmpresaId?: number | null,
  dateFrom?: string,
  dateTo?: string
) {
  try {
    const supabase = await createClient()
    const empresaId = selectedEmpresaId || await getCurrentEmpresaId()

    let query = supabase
      .from("inspecciones_montacargas")
      .select("*")
      .eq("idempresa", empresaId)
      .order("fecha", { ascending: true })

    if (dateFrom) {
      query = query.gte("fecha", dateFrom)
    }
    if (dateTo) {
      query = query.lte("fecha", dateTo)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching preoperacional dashboard data:", error)
      return { success: false, error: error.message, data: [] }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[v0] Unexpected error in getPreoperacionalDashboardData:", error)
    return { success: false, error: "Error al cargar datos del dashboard", data: [] }
  }
}
