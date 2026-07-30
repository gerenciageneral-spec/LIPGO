"use server"

import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaId } from "@/lib/company-filter"

export async function getBasculaHistory(selectedEmpresaId?: number | null) {
  try {
    const supabase = await createClient()
    // Use selectedEmpresaId if provided, otherwise fall back to current user's empresa_id
    const empresaId = selectedEmpresaId ?? await getCurrentEmpresaId()

    let query = supabase
      .from("cabeceraoc")
      .select(
        "id, ordendecargue, fechaorden, fechacargue, placa, transporte, tiquetebascula, pesoorden, pesovascula",
      )
      // Las proyecciones (tipooperacion="proyeccion") son estimados de
      // producción/pedidos, no pasan por báscula real: no pertenecen a este
      // historial.
      .neq("tipooperacion", "proyeccion")
      .order("fechaorden", { ascending: false })

    // Aplicar filtro de empresa
    if (empresaId) {
      query = query.eq("idempresa", empresaId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error loading bascula history:", error)
      return { success: false, error: error.message, data: [] }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[v0] Error in getBasculaHistory:", error)
    return { success: false, error: "Error al cargar el historial de báscula", data: [] }
  }
}

/**
 * Retrieves the product + lote + cantidad detail lines for a given
 * loading order (ocargue), so the Báscula screens can display what's
 * physically loaded on the truck. Data comes from `invtrans`.
 *
 * Columns: nombreproducto, lote, cantidad (matching the request).
 */
export async function getOrderProductDetails(
  ocargue: string,
  selectedEmpresaId?: number | null,
) {
  try {
    if (!ocargue) {
      return { success: false, error: "Orden de cargue vacía", data: [] }
    }

    const supabase = await createClient()
    const empresaId = selectedEmpresaId ?? (await getCurrentEmpresaId())

    let query = supabase
      .from("invtrans")
      .select("nombreproducto, lote, cantidad")
      .eq("ocargue", ocargue)

    if (empresaId) {
      query = query.eq("idempresa", empresaId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error loading order product details:", error)
      return { success: false, error: error.message, data: [] }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[v0] Error in getOrderProductDetails:", error)
    return {
      success: false,
      error: "Error al cargar el detalle de productos",
      data: [],
    }
  }
}

export async function updateBasculaRecord(
  id: number,
  pesovascula: number,
  tiquetebascula: string,
  // Opcional para mantener compatibilidad con llamadas existentes. Si se
  // envia, se persiste el nuevo transporte en cabeceraoc junto con el
  // peso y el tiquete.
  transporte?: string,
) {
  try {
    const supabase = await createClient()

    const updatePayload: Record<string, unknown> = { pesovascula, tiquetebascula }
    if (transporte !== undefined) {
      updatePayload.transporte = transporte
    }

    const { error } = await supabase
      .from("cabeceraoc")
      .update(updatePayload)
      .eq("id", id)

    if (error) {
      console.error("[v0] Error updating bascula record:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("[v0] Error in updateBasculaRecord:", error)
    return { success: false, error: "Error al actualizar el registro de báscula" }
  }
}
