"use server"

import { createClient } from "@/lib/supabase-client"
import { getCurrentUserContext } from "@/lib/user-context"

export interface ViewPickingOrder {
  id: number
  ordendecargue: string
  fechaorden: string | null
  fechacargue: string | null
  pesoorden: number | null
  iniciocargue: string | null
  fincargue: string | null
  auxiliares: string | null
  doccargue: string | null
  fotospicking: string | null
}

export async function getViewPickingOrders(selectedEmpresaId?: number | null) {
  try {
    const supabase = await createClient()
    // Use selectedEmpresaId if provided, otherwise fall back to current user's empresa_id
    let empresaId = selectedEmpresaId
    if (!empresaId) {
      const context = await getCurrentUserContext()
      empresaId = context.empresaId
    }

    const { data, error } = await supabase
      .from("cabeceraoc")
      .select(
        "id, ordendecargue, fechaorden, fechacargue, pesoorden, iniciocargue, fincargue, auxiliares, doccargue, fotospicking",
      )
      .eq("idempresa", empresaId)
      .neq("tipooperacion", "Tolva")
      .order("id", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching picking orders:", error)
      return { success: false, data: [], message: error.message }
    }

    return { success: true, data: data || [], message: "Órdenes cargadas exitosamente" }
  } catch (error: any) {
    console.error("[v0] Error in getViewPickingOrders:", error)
    return { success: false, data: [], message: error.message || "Error al cargar las órdenes" }
  }
}
