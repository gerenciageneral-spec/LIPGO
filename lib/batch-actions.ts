"use server"

import { createClient } from "@/lib/supabase-client"
import { generateAndUploadBatchAssignmentPDF } from "@/lib/pdf-actions"
import { getColombiaDate, getColombiaISO, getColombiaTime } from "@/lib/date-utils"
import { getCurrentUserContext } from "@/lib/company-filter"

export interface LoadOrder {
  id: number
  ordendecargue: string
  placa: string | null
}

export interface OrderProduct {
  id: number // This is the detalleoc id
  idorden: number
  producto: string
  cantidad: number
  cliente: string
}

export interface InventoryLot {
  codproducto: string
  nombreproducto: string
  lote: string
  location: string
  stock_actual: number
}

export interface BatchApprovalData {
  ordendecargue: string
  allocations: {
    cliente: string
    producto: string
    lote: string
    location: string
    cantidad: number
    // Cuando es true, el registro en invtrans se marca con status "Lote alterno".
    esAlterno?: boolean
  }[]
}

export interface BatchHistoryRecord {
  id: number
  fecha: string
  cliente: string
  producto: string
  lote: string
  location: string
  cantidad: number
  ordendecargue: string
  pdf: string | null // Added pdf field
}

export interface UpdateBatchHistoryData {
  id: number
  cliente: string
  producto: string
  lote: string
  location: string
  cantidad: number
  ordendecargue: string
}

export async function getAvailableLoadOrders(selectedEmpresaId?: number | null): Promise<LoadOrder[]> {
  try {
    // Use selectedEmpresaId if provided, otherwise fall back to current user's empresa_id
    let currentEmpresaId = selectedEmpresaId
    if (!currentEmpresaId) {
      const { empresaId } = await getCurrentUserContext()
      currentEmpresaId = empresaId || 1
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("cabeceraoc")
      .select("id, ordendecargue, placa")
      .is("horalote", null)
      .eq("idempresa", currentEmpresaId) // Filter by empresa_id from session
      .neq("tipooperacion", "Tolva") // Exclude orders with tipooperacion = "Tolva"
      .neq("tipooperacion", "proyeccion") // Exclude orders with tipooperacion = "proyeccion"
      .order("id", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching available load orders:", error)
      return []
    }

    return data || []
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return []
  }
}

export async function getOrderProducts(orderId: number): Promise<OrderProduct[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("detalleoc")
      .select("id, idorden, producto, cantidad, cliente")
      .eq("idorden", orderId)
      .order("cliente", { ascending: true })
      .order("producto", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching order products:", error)
      return []
    }

    return data || []
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return []
  }
}

export async function getInventoryForProduct(
  productName: string,
  selectedEmpresaId?: number | null,
): Promise<InventoryLot[]> {
  try {
    // Usa la empresa seleccionada en el selector superior; si no hay,
    // cae a la empresa del perfil del usuario actual.
    let currentEmpresaId = selectedEmpresaId
    if (!currentEmpresaId) {
      const { empresaId } = await getCurrentUserContext()
      currentEmpresaId = empresaId || 1
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("saldoinvdetalle")
      .select("codproducto, nombreproducto, lote, location, stock_actual")
      .eq("nombreproducto", productName)
      .eq("idempresa", currentEmpresaId)
      .gt("stock_actual", 0)
      .order("lote", { ascending: true })
      .order("codproducto", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching inventory for product:", error)
      return []
    }

    return data || []
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return []
  }
}

export async function approveBatchAllocation(data: BatchApprovalData, selectedEmpresaId?: number | null) {
  const supabase = await createClient()

  try {
    const { empresaId, usuario } = await getCurrentUserContext()
    // Usa la empresa seleccionada en el selector superior; si no hay,
    // cae a la empresa del perfil del usuario actual.
    const currentEmpresaId = selectedEmpresaId || empresaId || 1
    const currentUsuario = usuario || "admin" // Fallback to "admin" if not found

    // Get the last id from historicolotes to generate the next consecutive ID
    const { data: lastRecord, error: lastRecordError } = await supabase
      .from("historicolotes")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .single()

    let nextId = 1
    if (lastRecordError && lastRecordError.code !== "PGRST116") {
      console.error("[v0] Error fetching last historicolotes ID:", lastRecordError)
      throw new Error("Error al generar ID para historial de lotes")
    }

    if (lastRecord) {
      nextId = (lastRecord.id || 0) + 1
    }

    // Get current date
    const currentDate = await getColombiaDate()

    // Prepare records to insert
    const recordsToInsert = data.allocations.map((allocation, index) => ({
      id: nextId + index,
      idempresa: currentEmpresaId,
      cliente: allocation.cliente,
      producto: allocation.producto,
      lote: allocation.lote,
      location: allocation.location,
      cantidad: allocation.cantidad,
      ordendecargue: data.ordendecargue,
      fecha: currentDate,
      aprobadopor: currentUsuario,
    }))

    // Insert all records
    const { error: insertError } = await supabase.from("historicolotes").insert(recordsToInsert)

    if (insertError) {
      console.error("[v0] Error inserting into historicolotes:", insertError)
      throw new Error("Error al registrar la aprobación de lotes")
    }

    // Group allocations by producto, lote, location (summing quantities across all clients)
    const groupedAllocations = new Map<
      string,
      {
        producto: string
        lote: string
        location: string
        cantidad: number
        esAlterno: boolean
      }
    >()

    data.allocations.forEach((allocation) => {
      const esAlterno = allocation.esAlterno === true
      // Se separan los lotes alternos para que conserven su propio status en invtrans.
      const key = `${allocation.producto}_${allocation.lote}_${allocation.location}_${esAlterno ? "ALT" : "STD"}`
      if (groupedAllocations.has(key)) {
        const existing = groupedAllocations.get(key)!
        existing.cantidad += allocation.cantidad
      } else {
        groupedAllocations.set(key, {
          producto: allocation.producto,
          lote: allocation.lote,
          location: allocation.location,
          cantidad: allocation.cantidad,
          esAlterno,
        })
      }
    })

    // Get product details (codproducto and idproducto) from saldoinvdetalle
    const productNames = Array.from(new Set(data.allocations.map((a) => a.producto)))
    const { data: productDetails, error: productDetailsError } = await supabase
      .from("saldoinvdetalle")
      .select("nombreproducto, codproducto, idproducto")
      .in("nombreproducto", productNames)
      .eq("idempresa", currentEmpresaId)

    if (productDetailsError) {
      console.error("[v0] Error fetching product details:", productDetailsError)
      throw new Error("Error al obtener detalles de productos")
    }

    // Create a map for quick lookup
    const productMap = new Map(
      productDetails?.map((p) => [p.nombreproducto, { codproducto: p.codproducto, idproducto: p.idproducto }]) || [],
    )

    // Get the last id from invtrans to generate the next consecutive ID
    const { data: lastInvtransRecord, error: lastInvtransError } = await supabase
      .from("invtrans")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .single()

    let nextInvtransId = 1
    if (lastInvtransError && lastInvtransError.code !== "PGRST116") {
      console.error("[v0] Error fetching last invtrans ID:", lastInvtransError)
      throw new Error("Error al generar ID para invtrans")
    }

    if (lastInvtransRecord) {
      nextInvtransId = (lastInvtransRecord.id || 0) + 1
    }

    // Prepare invtrans records
    const currentTimestamp = await getColombiaISO()
    const invtransRecords = Array.from(groupedAllocations.values()).map((group, index) => {
      const productInfo = productMap.get(group.producto)

      return {
        id: nextInvtransId + index,
        idempresa: currentEmpresaId,
        codproducto: productInfo?.codproducto || "",
        idproducto: productInfo?.idproducto || 0,
        nombreproducto: group.producto,
        lote: group.lote,
        location: group.location,
        cantidad: group.cantidad,
        tipomov: "Salida",
        status: group.esAlterno ? "Lote alterno" : "por descontar",
        origen: "orden de cargue",
        ocargue: data.ordendecargue,
        creado: currentTimestamp,
        creadopor: currentUsuario,
      }
    })

    // Insert into invtrans
    const { error: invtransInsertError } = await supabase.from("invtrans").insert(invtransRecords)

    if (invtransInsertError) {
      console.error("[v0] Error inserting into invtrans:", invtransInsertError)
      throw new Error("Error al registrar en invtrans")
    }

    console.log("[v0] Updating horalote for order:", data.ordendecargue)
    const currentTime = await getColombiaTime()
    console.log("[v0] Current time obtained:", currentTime)

    const { error: updateHoraloteError } = await supabase
      .from("cabeceraoc")
      .update({ horalote: currentTime })
      .eq("ordendecargue", data.ordendecargue)

    if (updateHoraloteError) {
      console.error("[v0] Error updating horalote in cabeceraoc:", updateHoraloteError)
      throw new Error("Error al actualizar la hora del lote en la orden de cargue")
    }

    console.log("[v0] Horalote updated successfully:", currentTime)

    // Get fecha and hora for PDF generation
    const fechaActual = await getColombiaDate()
    const horaActual = currentTime // Use the same time we just saved

    // Get product codes for PDF
    const allocationsWithCodes = await Promise.all(
      data.allocations.map(async (allocation) => {
        const { data: productData } = await supabase
          .from("saldoinvdetalle")
          .select("codproducto")
          .eq("nombreproducto", allocation.producto)
          .eq("idempresa", currentEmpresaId)
          .limit(1)
          .single()

        return {
          ...allocation,
          codigo: productData?.codproducto || "",
        }
      }),
    )

    const pdfData = {
      fecha: fechaActual,
      hora: horaActual,
      allocations: allocationsWithCodes,
      totalAsignaciones: data.allocations.length,
    }

    const pdfResult = await generateAndUploadBatchAssignmentPDF(pdfData, data.ordendecargue)

    if (!pdfResult.success) {
      console.error("[v0] Error generating PDF:", pdfResult.error)
      // Don't throw error, just log it - the batch was already approved
    }

    if (pdfResult.success && pdfResult.url) {
      const recordIds = recordsToInsert.map((r) => r.id)
      const { error: updatePdfError } = await supabase
        .from("historicolotes")
        .update({ pdf: pdfResult.url })
        .in("id", recordIds)

      if (updatePdfError) {
        console.error("[v0] Error updating PDF URL in historicolotes:", updatePdfError)
      }
    }

    return {
      success: true,
      recordsInserted: recordsToInsert.length,
      invtransRecordsInserted: invtransRecords.length,
      pdfUrl: pdfResult.url || null,
    }
  } catch (error) {
    console.error("[v0] Error in approveBatchAllocation:", error)
    throw error
  }
}

export async function getBatchHistory(selectedEmpresaId?: number | null): Promise<BatchHistoryRecord[]> {
  try {
    const { empresaId } = await getCurrentUserContext()
    const currentEmpresaId = selectedEmpresaId || empresaId || 1

    const supabase = await createClient()
    
    // Fetch in batches of 1000 to bypass Supabase default limit
    const batchSize = 1000
    const maxRecords = 6000
    const allRecords: BatchHistoryRecord[] = []

    for (let offset = 0; offset < maxRecords; offset += batchSize) {
      const { data, error } = await supabase
        .from("historicolotes")
        .select("id, fecha, cliente, producto, lote, location, cantidad, ordendecargue, pdf")
        .eq("idempresa", currentEmpresaId)
        .order("fecha", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + batchSize - 1)

      if (error) {
        console.error("[v0] Error fetching batch history:", error)
        break
      }

      if (!data || data.length === 0) {
        break // No more records
      }

      allRecords.push(...data)

      // If we got fewer records than batch size, we've reached the end
      if (data.length < batchSize) {
        break
      }
    }

    console.log("[v0] Total batch history records fetched:", allRecords.length)
    return allRecords
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return []
  }
}

export async function getBatchHistoryFilters(selectedEmpresaId?: number | null) {
  try {
    const { empresaId } = await getCurrentUserContext()
    const currentEmpresaId = selectedEmpresaId || empresaId || 1

    const supabase = await createClient()

    // Get clientes from clientes table filtered by id_empresa
    const { data: clientesData } = await supabase
      .from("clientes")
      .select("nombre")
      .eq("id_empresa", currentEmpresaId)
      .eq("activo", true)
      .order("nombre", { ascending: true })

    // Get unique productos - filter by empresa
    const { data: productosData } = await supabase
      .from("historicolotes")
      .select("producto")
      .eq("idempresa", currentEmpresaId)
      .order("producto")

    const clientes = (clientesData?.map((item) => item.nombre).filter(Boolean) || []) as string[]
    const productos = Array.from(new Set(productosData?.map((item) => item.producto).filter(Boolean))) as string[]

    return {
      clientes,
      productos,
    }
  } catch (error) {
    console.error("[v0] Error fetching batch history filters:", error)
    return {
      clientes: [],
      productos: [],
    }
  }
}

export async function updateBatchHistoryRecord(data: UpdateBatchHistoryData) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from("historicolotes")
      .update({
        cliente: data.cliente,
        producto: data.producto,
        lote: data.lote,
        location: data.location,
        cantidad: data.cantidad,
        ordendecargue: data.ordendecargue,
      })
      .eq("id", data.id)

    if (error) {
      console.error("[v0] Error updating batch history record:", error)
      return {
        success: false,
        message: "Error al actualizar el registro",
      }
    }

    return {
      success: true,
      message: "Registro actualizado exitosamente",
    }
  } catch (error) {
    console.error("[v0] Unexpected error updating batch history:", error)
    return {
      success: false,
      message: "Error inesperado al actualizar el registro",
    }
  }
}

export async function annulBatchAssignment(ordenCargue: string) {
  try {
    const supabase = await createClient()

    const { error: deleteError } = await supabase.from("historicolotes").delete().eq("ordendecargue", ordenCargue)

    if (deleteError) {
      console.error("[v0] Error deleting from historicolotes:", deleteError)
      return {
        success: false,
        message: "Error al eliminar las asignaciones de lotes",
      }
    }

    const { error: deleteInvtransError } = await supabase.from("invtrans").delete().eq("ocargue", ordenCargue)

    if (deleteInvtransError) {
      console.error("[v0] Error deleting from invtrans:", deleteInvtransError)
      return {
        success: false,
        message: "Error al eliminar las transacciones de inventario",
      }
    }

    const { error: updateError } = await supabase
      .from("cabeceraoc")
      .update({ horalote: null })
      .eq("ordendecargue", ordenCargue)

    if (updateError) {
      console.error("[v0] Error clearing horalote in cabeceraoc:", updateError)
      return {
        success: false,
        message: "Error al actualizar la orden de cargue",
      }
    }

    return {
      success: true,
      message: "Asignaciones de lotes anuladas exitosamente",
    }
  } catch (error) {
    console.error("[v0] Unexpected error annulling batch assignment:", error)
    return {
      success: false,
      message: "Error inesperado al anular las asignaciones",
    }
  }
}

export async function getOrdenesForAnnulment(): Promise<string[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("historicolotes")
      .select("ordendecargue")
      .order("ordendecargue", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching ordenes de cargue:", error)
      return []
    }

    // Get unique values
    const uniqueOrdenes = Array.from(new Set(data?.map((item) => item.ordendecargue).filter(Boolean))) as string[]
    return uniqueOrdenes
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return []
  }
}
