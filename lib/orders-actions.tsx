"use server"

import { createClient } from "@/lib/supabase-client"
import { getColombiaDateTime, getColombiaDate, getColombiaTime, dateInputToColombiaDate } from "@/lib/date-utils"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import { getCurrentUser, getUserProfile } from "@/lib/auth-actions"
import { getCurrentEmpresaId } from "@/lib/company-filter"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { revalidatePath } from "next/cache"
import { generateAndUploadLoadOrderPDF } from "./pdf-actions" // Added for generateLoadOrder

/**
 * Obtiene los IDs de empresa accesibles para el usuario actual desde perfil_acceso_empresas
 */
async function getUserAccessibleEmpresas(): Promise<number[]> {
  const supabase = await createClient()
  try {
    // Get current user
    const user = await getCurrentUser()
    if (!user) {
      console.warn("[v0] No authenticated user found, using default empresa filter")
      return [1] // Fallback
    }

    // Get user profile to get profile_id
    const profile = await getUserProfile(user.id)
    if (!profile || !profile.id) {
      console.warn("[v0] No profile found for user, using default empresa filter")
      return [1] // Fallback
    }

    console.log("[v0] Fetching accessible empresas for profile:", profile.id)

    // Query perfil_acceso_empresas to get all empresa_id for this profile
    const { data: accesoData, error } = await supabase
      .from("perfil_acceso_empresas")
      .select("empresa_id")
      .eq("profile_id", profile.id)

    if (error) {
      console.error("[v0] Error fetching accessible empresas:", error)
      return [1] // Fallback
    }

    const empresaIds = accesoData?.map((item: any) => item.empresa_id) || []
    console.log("[v0] User accessible empresas:", empresaIds)

    // Return empresaIds if available, otherwise fallback to current empresa
    if (empresaIds.length === 0) {
      const empresaId = await getCurrentEmpresaIdForInsert()
      return [empresaId]
    }

    return empresaIds
  } catch (error) {
    console.error("[v0] Error in getUserAccessibleEmpresas:", error)
    const empresaId = await getCurrentEmpresaIdForInsert()
    return [empresaId] // Fallback
  }
}

/**
 * Obtiene los owners accesibles para el usuario actual desde perfil_acceso_owners
 */
async function getUserAccessibleOwners(): Promise<string[]> {
  const supabase = await createClient()
  try {
    // Get current user
    const user = await getCurrentUser()
    if (!user) {
      console.warn("[v0] No authenticated user found, no owner filter")
      return []
    }

    // Get user profile to get profile_id
    const profile = await getUserProfile(user.id)
    if (!profile || !profile.id) {
      console.warn("[v0] No profile found for user, no owner filter")
      return []
    }

    console.log("[v0] Fetching accessible owners for profile:", profile.id)

    // Query perfil_acceso_owners to get all owner names for this profile
    const { data: accesoData, error } = await supabase
      .from("perfil_acceso_owners")
      .select("owner")
      .eq("profile_id", profile.id)

    if (error) {
      console.error("[v0] Error fetching accessible owners:", error)
      return []
    }

    const ownerNames = accesoData?.map((item: any) => item.owner) || []
    console.log("[v0] User accessible owners:", ownerNames)

    return ownerNames
  } catch (error) {
    console.error("[v0] Error in getUserAccessibleOwners:", error)
    return []
  }
}

/**
 * Obtiene las empresas accesibles con sus nombres desde empresas_permisos
 * para mostrar en el selector de "Bodega"
 */
export async function getAccessibleEmpresesFromPermisos(): Promise<Array<{ id: number; nombre: string }>> {
  const supabase = await createClient()
  try {
    // Get accessible empresa IDs
    const accessibleEmpresas = await getUserAccessibleEmpresas()

    console.log("[v0] Fetching empresas_permisos for accessible IDs:", accessibleEmpresas)

    // Query empresas_permisos to get empresa info
    const { data: empresasData, error } = await supabase
      .from("empresas_permisos")
      .select("id, nombre")
      .in("id", accessibleEmpresas)
      .order("nombre", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching empresas_permisos:", error)
      return []
    }

    console.log("[v0] Fetched empresas from permisos:", empresasData)
    return empresasData || []
  } catch (error) {
    console.error("[v0] Error in getAccessibleEmpresesFromPermisos:", error)
    return []
  }
}

export async function getOrders(selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  try {
    // Get all empresas accessible to the user from perfil_acceso_empresas
    const accessibleEmpresas = await getUserAccessibleEmpresas()
    
    // Get all owners accessible to the user from perfil_acceso_owners
    const accessibleOwners = await getUserAccessibleOwners()

    console.log("[v0] Filtering orders by empresas:", accessibleEmpresas, "selectedEmpresaId:", selectedEmpresaId, "and owners:", accessibleOwners)

    let query = supabase.from("pedidoscabecera").select("*").order("idpedido", { ascending: false })

    // If a specific empresa is selected, filter by that empresa only (if user has access)
    if (selectedEmpresaId && accessibleEmpresas.includes(selectedEmpresaId)) {
      query = query.eq("id_empresa", selectedEmpresaId)
    } else {
      // Otherwise filter by all accessible empresas
      query = query.in("id_empresa", accessibleEmpresas)
    }

    // Filter by accessible owners in empresafactura field (if user has owner permissions)
    if (accessibleOwners.length > 0) {
      query = query.in("empresafactura", accessibleOwners)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching orders:", error)
      return { success: false, message: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al cargar pedidos" }
  }
}

export async function getAllOrders() {
  const supabase = await createClient()
  try {
    // Get all empresas accessible to the user from perfil_acceso_empresas
    const accessibleEmpresas = await getUserAccessibleEmpresas()
    
    // Get all owners accessible to the user from perfil_acceso_owners
    const accessibleOwners = await getUserAccessibleOwners()

    console.log("[v0] getAllOrders - Filtering by empresas:", accessibleEmpresas, "and owners:", accessibleOwners)

    let query = supabase.from("pedidoscabecera").select("*").order("idpedido", { ascending: false })

    // Filter by accessible empresas
    query = query.in("id_empresa", accessibleEmpresas)

    // Filter by accessible owners in empresafactura field (if user has owner permissions)
    if (accessibleOwners.length > 0) {
      query = query.in("empresafactura", accessibleOwners)
    }

    // Exclude orders with tipooperacion = "proyeccion"
    query = query.neq("tipooperacion", "proyeccion")

    const { data, error } = await query

    if (error) {
      console.error("Error fetching all orders:", error)
      return { success: false, message: error.message }
    }

    console.log("[v0] getAllOrders - Found", data?.length || 0, "orders for empresas:", accessibleEmpresas)
    return { success: true, data }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al cargar pedidos" }
  }
}

export async function getOrderDetails(idpedido: number) {
  const supabase = await createClient()
  try {
    const { data: details, error } = await supabase
      .from("pedidosdetalle")
      .select("*")
      .eq("idpedido", idpedido)
      .or("estado.is.null,estado.eq.,estado.eq.parcial")
      .order("transid", { ascending: true })

    if (error) {
      console.error("Error fetching order details:", error)
      return { success: false, message: error.message }
    }

    if (!details || details.length === 0) {
      return { success: true, data: [] }
    }

    const productNames = [...new Set(details.map((item: any) => item.producto).filter(Boolean))]

    const { data: products, error: productsError } = await supabase
      .from("productos")
      .select("id, nombre, peso_unitkg")
      .in("nombre", productNames)

    if (productsError) {
      console.error("Error fetching product IDs:", productsError)
      return { success: false, message: productsError.message }
    }

    const productIdMap = new Map(products?.map((p: any) => [p.nombre, p.id]) || [])
    const productWeightMap = new Map(products?.map((p: any) => [p.nombre, p.peso_unitkg]) || [])

    const mappedData = details.map((item: any) => ({
      ...item,
      idproducto: productIdMap.get(item.producto) || null,
      peso_unitkg: productWeightMap.get(item.producto) || 0,
    }))

    return { success: true, data: mappedData }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al cargar detalles" }
  }
}

export async function updateOrder(idpedido: number, data: any) {
  const supabase = await createClient()
  try {
    const { error } = await supabase.from("pedidoscabecera").update(data).eq("idpedido", idpedido)

    if (error) {
      console.error("Error updating order:", error)
      return { success: false, message: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al actualizar pedido" }
  }
}

export async function deleteOrder(idpedido: number) {
  const supabase = await createClient()
  try {
    // Check if ocargue is null or empty
    const { data: order, error: fetchError } = await supabase
      .from("pedidoscabecera")
      .select("ocargue")
      .eq("idpedido", idpedido)
      .single()

    if (fetchError) {
      return { success: false, message: "Error al verificar el estado del pedido" }
    }

    if (order.ocargue && order.ocargue.trim() !== "") {
      return {
        success: false,
        message: "No se puede eliminar el pedido porque ya tiene O.Cargue asignada.",
      }
    }

    // Delete details first (if no cascade)
    const { error: detailsError } = await supabase.from("pedidosdetalle").delete().eq("idpedido", idpedido)

    if (detailsError) {
      return { success: false, message: "Error al eliminar detalles del pedido" }
    }

    // Delete header
    const { error: headerError } = await supabase.from("pedidoscabecera").delete().eq("idpedido", idpedido)

    if (headerError) {
      return { success: false, message: "Error al eliminar cabecera del pedido" }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al eliminar pedido" }
  }
}

export async function updateOrderDetails(idpedido: number, products: any[]) {
  const supabase = await createClient()
  try {
    console.log("[v0] Server: Fetching existing details for order:", idpedido)

    // Get existing detail transids for this order
    const { data: existingDetails, error: fetchError } = await supabase
      .from("pedidosdetalle")
      .select("transid")
      .eq("idpedido", idpedido)

    if (fetchError) {
      console.error("[v0] Server: Error fetching existing details:", fetchError)
      return { success: false, message: "Error al consultar detalles existentes" }
    }

    const existingTransIds = existingDetails?.map((d) => d.transid) || []
    console.log("[v0] Server: Existing transIds:", existingTransIds)

    // Separate products into updates and inserts
    const productsToUpdate = products.filter((p) => p.transid && existingTransIds.includes(p.transid))
    const productsToInsert = products.filter((p) => !p.transid)

    console.log("[v0] Server: Products to update:", productsToUpdate.length)
    console.log("[v0] Server: Products to insert:", productsToInsert.length)

    // Update existing lines
    for (const product of productsToUpdate) {
      const updateData = {
        producto: product.producto,
        unidades: product.cantidad,
        precio_und: product.precioUnitario,
        total_linea: product.totalLinea,
        iva: product.descuentoIVA,
        descuentopp: product.descuentoPP,
        subtotal: product.subtotal,
        peso: product.peso,
        categoria: product.categoria,
      }

      console.log("[v0] Server: Updating line with transid:", product.transid)
      const { error: updateError } = await supabase
        .from("pedidosdetalle")
        .update(updateData)
        .eq("transid", product.transid)

      if (updateError) {
        console.error("[v0] Server: Error updating line:", updateError)
        return { success: false, message: `Error al actualizar línea con transid ${product.transid}` }
      }
    }

    // Insert new lines
    if (productsToInsert.length > 0) {
      console.log("[v0] Server: Inserting new lines...")
      const { data: lastDetail } = await supabase
        .from("pedidosdetalle")
        .select("transid")
        .order("transid", { ascending: false })
        .limit(1)
        .single()

      let nextTransId = 1
      if (lastDetail) {
        nextTransId = (lastDetail.transid || 0) + 1
      }

      console.log("[v0] Server: Next transId will be:", nextTransId)

      const detailsToInsert = productsToInsert.map((product, index) => ({
        transid: nextTransId + index,
        idpedido: idpedido,
        id_empresa: 1,
        producto: product.producto,
        unidades: product.cantidad,
        precio_und: product.precioUnitario,
        total_linea: product.totalLinea,
        iva: product.descuentoIVA,
        descuentopp: product.descuentoPP,
        subtotal: product.subtotal,
        peso: product.peso,
        categoria: product.categoria,
      }))

      const { error: insertError } = await supabase.from("pedidosdetalle").insert(detailsToInsert)

      if (insertError) {
        console.error("[v0] Server: Error inserting lines:", insertError)
        return { success: false, message: "Error al insertar nuevas líneas" }
      }
      console.log("[v0] Server: Lines inserted successfully")
    }

    // Delete lines that were removed (exist in DB but not in current products)
    const currentTransIds = products.filter((p) => p.transid).map((p) => p.transid)
    const transIdsToDelete = existingTransIds.filter((id) => !currentTransIds.includes(id))

    console.log("[v0] Server: TransIds to delete:", transIdsToDelete)

    if (transIdsToDelete.length > 0) {
      const { error: deleteError } = await supabase.from("pedidosdetalle").delete().in("transid", transIdsToDelete)

      if (deleteError) {
        console.error("[v0] Server: Error deleting lines:", deleteError)
        return { success: false, message: "Error al eliminar líneas" }
      }
      console.log("[v0] Server: Lines deleted successfully")
    }

    return { success: true }
  } catch (error) {
    console.error("[v0] Server: Unexpected error:", error)
    return { success: false, message: "Error inesperado al actualizar detalles" }
  }
}

export async function approveOrder(idpedido: number, approvalCode: string) {
  const supabase = await createClient()

  try {
    // Validate approval code against usuariocartera table
    console.log("[v0] Validating approval code against usuariocartera table")
    
    const { data: usuario, error: validationError } = await supabase
      .from("usuariocartera")
      .select("id, nombre, contra")
      .eq("contra", approvalCode)
      .single()

    if (validationError || !usuario) {
      console.error("[v0] Invalid approval code:", validationError)
      return { success: false, message: "Código de aprobación incorrecto" }
    }

    // Check if order exists and is not already approved
    const { data: order, error: fetchError } = await supabase
      .from("pedidoscabecera")
      .select("aprobado")
      .eq("idpedido", idpedido)
      .single()

    if (fetchError) {
      return { success: false, message: "Error al verificar el estado del pedido" }
    }

    if (order.aprobado === "si") {
      return { success: false, message: "El pedido ya está aprobado" }
    }

    const { error: updateError } = await supabase
      .from("pedidoscabecera")
      .update({
        aprobado: "si",
        estado: "aprobado",
        revisiongerencia: usuario.nombre,
      })
      .eq("idpedido", idpedido)

    if (updateError) {
      console.error("Error approving order:", updateError)
      return { success: false, message: "Error al aprobar el pedido" }
    }

    const { error: trasladoError } = await supabase.from("traslados").update({ estado: "aprobado" }).eq("id", idpedido)

    // Don't fail the approval if traslado doesn't exist (not all orders are traslados)
    if (trasladoError) {
      console.log("[v0] Traslado not found or error updating:", trasladoError)
    }

    return { success: true, message: "Pedido aprobado correctamente" }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al aprobar pedido" }
  }
}

export async function updateOrderPDFUrl(idpedido: number, pdfUrl: string) {
  const supabase = await createClient()
  try {
    const { error } = await supabase.from("pedidoscabecera").update({ pdfpedido: pdfUrl }).eq("idpedido", idpedido)

    if (error) {
      console.error("Error updating PDF URL:", error)
      return { success: false, message: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al actualizar URL del PDF" }
  }
}

export async function getOrderFiltersData() {
  const supabase = await createClient()
  try {
    console.log("[v0] Fetching order filters data")

    // Get all empresas accessible to the user from perfil_acceso_empresas
    const accessibleEmpresas = await getUserAccessibleEmpresas()
    
    // Get all owners accessible to the user from perfil_acceso_owners
    const accessibleOwners = await getUserAccessibleOwners()

    let query = supabase
      .from("pedidoscabecera")
      .select("pedido, orden_de_compra, estado, destino, cliente, vendedor")
      .eq("aprobado", "si")
      .order("pedido", { ascending: false })

    // Filter by accessible empresas
    query = query.in("id_empresa", accessibleEmpresas)

    // Filter by accessible owners in empresafactura field (if user has owner permissions)
    if (accessibleOwners.length > 0) {
      query = query.in("empresafactura", accessibleOwners)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching order filters data:", error)
      return { success: false, message: error.message }
    }

    console.log("[v0] Raw order filters data:", data)

    const filteredData = data?.filter((order) => order.estado !== "entregado") || []

    console.log("[v0] Filtered order data (excluding entregado):", filteredData)

    const pedidoNumbers = [
      ...new Set(filteredData.map((order) => order.pedido).filter((p) => p && p.trim() !== "")),
    ].sort()

    const ordenCompraValues = [
      ...new Set(filteredData.map((order) => order.orden_de_compra).filter((oc) => oc && oc.trim() !== "")),
    ].sort()

    const ciudades = [...new Set(filteredData.map((order) => order.destino).filter((d) => d && d.trim() !== ""))].sort()

    const vendedores = [
      ...new Set(filteredData.map((order) => order.vendedor).filter((v) => v && v.trim() !== "")),
    ].sort()

    console.log("[v0] Pedido numbers:", pedidoNumbers)
    console.log("[v0] Orden compra values:", ordenCompraValues)
    console.log("[v0] Ciudades:", ciudades)
    console.log("[v0] Vendedores:", vendedores)

    return {
      success: true,
      data: {
        pedidoNumbers,
        ordenCompraValues,
        ciudades,
        vendedores,
      },
    }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, message: "Error inesperado al cargar datos de filtros" }
  }
}

export async function generateLoadOrder(orderData: {
  selectedOrderIds: number[]
  sinVehiculo?: boolean
  vehiculo: string
  nombreConductor: string
  fechaEntrega: string
  fechaOrdenCargue: string
  tipoTransporte: string
  productsList: Array<{
    producto: string
    cantidad: number
    toneladas: number
    cliente: string
    destino: string
    idpedido?: number
  }>
  totalWeight: number
  observaciones?: string
  detailUpdates: Array<{
    transid: number
    idpedido: number
    unidadescargadas: number
    estado: "cerrado" | "parcial"
  }>
  tipoOperacion?: string
  idempresaSeleccionada?: number // Optional: warehouse/bodega ID selected by user
}) {
  const supabase = await createClient()

  try {
    console.log("[v0] Generating load order with data:", orderData)

    // Get current session empresa ID, or use selected warehouse ID if provided
    let sessionEmpresaId = await getCurrentEmpresaId()
    
    // If a specific warehouse/bodega is selected, use that ID instead
    if (orderData.idempresaSeleccionada) {
      sessionEmpresaId = orderData.idempresaSeleccionada
      console.log("[v0] Using selected bodega ID:", sessionEmpresaId)
    }
    
    if (!sessionEmpresaId) {
      console.error("[v0] Could not get empresa ID")
      return { success: false, message: "Error al obtener la empresa" }
    }

    console.log("[v0] Using empresa ID for order:", sessionEmpresaId)

    console.log("[v0] Attempting to fetch indicativo for empresa ID:", sessionEmpresaId)

    const { data: indicativoData, error: indicativoError } = await supabase
      .from("indicativo")
      .select("id, indicativo")
      .eq("id", sessionEmpresaId)
      .maybeSingle()

    console.log("[v0] Indicativo query result - data:", indicativoData, "error:", indicativoError)

    let indicativo = "IND" // Default fallback value

    if (indicativoError) {
      console.error("[v0] Error fetching indicativo:", indicativoError.message)
      console.log("[v0] Using default indicativo due to error:", indicativo)
    } else if (!indicativoData) {
      console.warn("[v0] No indicativo record found with ID:", sessionEmpresaId)
      console.log("[v0] Using default indicativo (no record found):", indicativo)
    } else if (!indicativoData.indicativo) {
      console.warn("[v0] Indicativo record found but indicativo field is null/empty for ID:", sessionEmpresaId)
      console.log("[v0] Using default indicativo (empty indicativo field):", indicativo)
    } else {
      indicativo = indicativoData.indicativo
      console.log("[v0] Successfully found indicativo from indicativo table:", indicativo)
    }
    // </CHANGE>

    let telefono = ""
    let horapesoinicial = null
    let horallegada = null

    if (!orderData.sinVehiculo && orderData.vehiculo) {
      const { data: vehicleData, error: vehicleError } = await supabase
        .from("citasvehiculos")
        .select("telefono, horapesoinicial, horallegada")
        .eq("placa", orderData.vehiculo)
        .is("estatus", null)
        .maybeSingle()

      if (vehicleError) {
        console.error("[v0] Error fetching vehicle data:", vehicleError)
        return { success: false, message: "Error al obtener datos del vehículo" }
      }

      if (vehicleData) {
        telefono = vehicleData.telefono
        horapesoinicial = vehicleData.horapesoinicial
        horallegada = vehicleData.horallegada
        console.log(
          "[v0] Vehicle data - phone:",
          telefono,
          "horapesoinicial:",
          horapesoinicial,
          "horallegada:",
          horallegada,
        )
      } else {
        console.warn("[v0] No vehicle data found for placa:", orderData.vehiculo)
      }
    }

    const { data: lastHeader, error: lastHeaderError } = await supabase
      .from("cabeceraoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastHeaderError) {
      console.error("[v0] Error fetching last header ID:", lastHeaderError)
      return { success: false, message: "Error al obtener último ID de cabecera" }
    }

    const nextId = lastHeader ? (lastHeader.id || 0) + 1 : 1
    console.log("[v0] Next ID will be:", nextId)

    const colombiaTime = await getColombiaDateTime()
    const year = colombiaTime.getFullYear()
    const month = String(colombiaTime.getMonth() + 1).padStart(2, "0")
    const day = String(colombiaTime.getDate()).padStart(2, "0")
    const orderCode = `${indicativo}${year}${month}${day}${nextId}`

    console.log("[v0] Generated order code:", orderCode)

    const currentDate = await getColombiaDate()
    const currentTime = await getColombiaTime()

    const fechaCargue = orderData.fechaOrdenCargue ? await dateInputToColombiaDate(orderData.fechaOrdenCargue) : null
    const fechaEntrega = orderData.fechaEntrega ? await dateInputToColombiaDate(orderData.fechaEntrega) : null

    const { error: headerInsertError } = await supabase.from("cabeceraoc").insert({
      id: nextId,
      idempresa: sessionEmpresaId, // Use empresa ID from session
      ordendecargue: orderCode,
      fechaorden: currentDate,
      fechacargue: fechaCargue,
      placa: orderData.sinVehiculo ? null : orderData.vehiculo,
      conductor: orderData.sinVehiculo ? null : orderData.nombreConductor,
      celular: orderData.sinVehiculo ? null : telefono,
      transporte: orderData.sinVehiculo ? null : orderData.tipoTransporte,
      tipooperacion: "Cargue", // Changed from "Descargue" to "Cargue" for load orders
      pesoorden: orderData.totalWeight,
      horaorden: currentTime,
      observaciones: orderData.observaciones || "",
      pesajeinicial: horapesoinicial, // From citasvehiculos.horapesoinicial
      horavehiculo: horallegada, // From citasvehiculos.horallegada
    })

    if (headerInsertError) {
      console.error("[v0] Error inserting cabeceraoc:", headerInsertError)
      return { success: false, message: `Error al crear cabecera: ${headerInsertError.message}` }
    }

    console.log("[v0] Cabeceraoc inserted successfully")

    const detailUpdateResult = await updatePedidoDetalleStatus(orderData.detailUpdates, orderCode)

    if (!detailUpdateResult.success) {
      return { success: false, message: detailUpdateResult.message }
    }

    console.log("[v0] Updated pedidosdetalle with unidadescargadas and estado")

    const uniqueOrderIds = [...new Set(orderData.detailUpdates.map((u) => u.idpedido))]

    for (const idpedido of uniqueOrderIds) {
      const statusUpdateResult = await checkAndUpdatePedidoCabeceraStatus(idpedido)
      if (!statusUpdateResult.success) {
        console.error(`Error updating status for order ${idpedido}:`, statusUpdateResult.message)
      }
    }

    console.log("[v0] Updated pedidoscabecera estados")

    const { data: ordersData, error: ordersError } = await supabase
      .from("pedidoscabecera")
      .select("cliente, destino")
      .in("idpedido", orderData.selectedOrderIds)

    if (ordersError) {
      console.error("[v0] Error fetching orders data:", ordersError)
    }

    const updatePromises = orderData.selectedOrderIds.map((idpedido) =>
      supabase
        .from("pedidoscabecera")
        .update({
          fechaordencargue: currentDate,
          fechadeentrega: fechaEntrega,
          transporte: orderData.tipoTransporte,
          vehiculo: orderData.vehiculo,
          ocargue: orderCode,
        })
        .eq("idpedido", idpedido),
    )

    const updateResults = await Promise.all(updatePromises)
    const failedUpdates = updateResults.filter((result) => result.error)

    if (failedUpdates.length > 0) {
      console.error("[v0] Some orders failed to update:", failedUpdates)
      return { success: false, message: "Error al actualizar algunos pedidos" }
    }

    console.log("[v0] Updated", orderData.selectedOrderIds.length, "orders successfully")

    const { data: lastDetail, error: lastDetailError } = await supabase
      .from("detalleoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDetailError) {
      console.error("[v0] Error fetching last detail ID:", lastDetailError)
      return { success: false, message: "Error al obtener último ID de detalle" }
    }

    let nextDetailId = lastDetail ? (lastDetail.id || 0) + 1 : 1
    console.log("[v0] Next detail ID will be:", nextDetailId)

    const detailsToInsert = orderData.productsList
      .filter((product) => product.cantidad > 0)
      .map((product) => ({
        id: nextDetailId++,
        idorden: nextId,
        numeroorden: orderData.numeroOrden || orderCode,
        producto: product.producto,
        cantidad: product.cantidad,
        toneladas: product.toneladas,
        cliente: product.cliente,
      }))

    console.log("[v0] Inserting", detailsToInsert.length, "detail records (excluding zero quantities)")

    const { error: detailsInsertError } = await supabase.from("detalleoc").insert(detailsToInsert)

    if (detailsInsertError) {
      console.error("[v0] Error insertingdetalleoc:", detailsInsertError)
      return { success: false, message: `Error al crear detalles: ${detailsInsertError.message}` }
    }

    console.log("[v0] Detalleoc inserted successfully")

    if (!orderData.sinVehiculo && orderData.vehiculo) {
      const { error: vehicleUpdateError } = await supabase
        .from("citasvehiculos")
        .update({
          estatus: "Procesado",
          ocargue: orderCode,
        })
        .eq("placa", orderData.vehiculo)
        .is("estatus", null)

      if (vehicleUpdateError) {
        console.error("[v0] Error updating vehicle status and ocargue:", vehicleUpdateError)
      } else {
        console.log("[v0] Vehicle status updated to Procesado and ocargue set to:", orderCode)
      }
    }

    // Generate PDF and upload it
    const pdfResult = await generateAndUploadLoadOrderPDF({
      orderId: nextId,
      orderCode,
      empresaId: sessionEmpresaId,
      fecha: `${currentDate} ${currentTime}`,
      placa: orderData.vehiculo,
      conductor: orderData.nombreConductor,
      transporte: orderData.tipoTransporte,
      destino: ordersData?.[0]?.destino || "",
      observaciones: orderData.observaciones || "",
      productsList: orderData.productsList.map((product) => ({
        cliente: product.cliente,
        destino: product.destino,
        producto: product.producto,
        cantidad: product.cantidad,
        pesoKgs: product.toneladas * 1000,
        lote: "",
        novedad: "",
      })),
      totalUnidades: orderData.productsList.reduce((sum, p) => sum + p.cantidad, 0),
      totalPesoKgs: orderData.totalWeight * 1000,
    })

    if (!pdfResult.success) {
      console.error("Failed to generate and upload PDF:", pdfResult.message)
      // Decide if this should prevent the order creation or just log an error
      // For now, we'll log and proceed
    } else {
      console.log("PDF generated and uploaded successfully:", pdfResult.url)
      // Update cabeceraoc with the PDF URL if needed and if the PDF generation was successful
      await supabase.from("cabeceraoc").update({ pdfoc: pdfResult.url }).eq("id", nextId)
    }

    revalidatePath("/dashboard/orders") // Revalidate path after successful creation

    return {
      success: true,
      message: "Orden de cargue generada exitosamente",
      orderId: nextId,
      orderData: {
        orderCode,
        empresaId: sessionEmpresaId,
        fecha: `${currentDate} ${currentTime}`,
        placa: orderData.vehiculo,
        conductor: orderData.nombreConductor,
        transporte: orderData.tipoTransporte,
        destino: ordersData?.[0]?.destino || "",
        observaciones: orderData.observaciones || "",
        productsList: orderData.productsList.map((product) => ({
          cliente: product.cliente,
          destino: product.destino,
          producto: product.producto,
          cantidad: product.cantidad,
          pesoKgs: product.toneladas * 1000,
          lote: "",
          novedad: "",
        })),
        totalUnidades: orderData.productsList.reduce((sum, p) => sum + p.cantidad, 0),
        totalPesoKgs: orderData.totalWeight * 1000,
      },
    }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, message: "Error inesperado al generar orden de cargue" }
  }
}

export async function getOrderCodeForSelectedOrders(selectedOrderIds: number[]) {
  const supabase = await createClient()

  try {
    const { data: lastOrder, error } = await supabase
      .from("pedidoscabecera")
      .select("ocargue")
      .in("idpedido", selectedOrderIds)
      .not("ocargue", "is", null)
      .order("fechaordencargue", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error("[v0] Error fetching order code:", error)
      return { success: false, message: error.message }
    }

    if (!lastOrder || !lastOrder.ocargue) {
      return {
        success: false,
        message: "No se encontró orden de cargue. Debe generar primero la orden de cargue antes de generar el PDF",
      }
    }

    return { success: true, orderCode: lastOrder.ocargue }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, message: "Error inesperado al obtener código de orden" }
  }
}

export async function updateLoadOrderPDFUrl(orderId: number, pdfUrl: string) {
  const supabase = await createClient()
  try {
    const { error } = await supabase.from("cabeceraoc").update({ pdfoc: pdfUrl }).eq("id", orderId)

    if (error) {
      console.error("Error updating PDF URL in cabeceraoc:", error)
      return { success: false, message: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al actualizar URL del PDF" }
  }
}

export async function updateLoadOrderFechaCargue(orderId: number, fechaCargue: string) {
  const supabase = await createClient()
  try {
    const fechaCargueFormatted = await dateInputToColombiaDate(fechaCargue)

    const { error } = await supabase.from("cabeceraoc").update({ fechacargue: fechaCargueFormatted }).eq("id", orderId)

    if (error) {
      console.error("Error updating fechacargue in cabeceraoc:", error)
      return { success: false, message: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al actualizar fecha de cargue" }
  }
}

export async function getLoadOrders(statusFilter: "pendiente" | "finalizada" | "todas" = "todas", onlyWithoutBatch: boolean = false, selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  try {
    // Use selectedEmpresaId if provided, otherwise fall back to current user's empresa_id
    const empresaId = selectedEmpresaId ?? await getCurrentEmpresaIdForInsert()

    let query = supabase
      .from("cabeceraoc")
      .select("*, idempresa")
      .eq("idempresa", empresaId) // Filter by empresa ID
      .in("tipooperacion", ["Cargue", "Descargue", "Distribucion"]) // Only show Cargue, Descargue and Distribucion operations
      .order("id", { ascending: false })

    // Only apply horalote NULL filter when explicitly requested (e.g., from Asignación de Lotes)
    if (onlyWithoutBatch) {
      query = query.is("horalote", null)
    }

    if (statusFilter === "pendiente") {
      query = query.or("status.is.null,status.eq.")
    } else if (statusFilter === "finalizada") {
      query = query.eq("status", "finalizado")
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching load orders:", error)
      return { success: false, message: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al cargar órdenes de cargue" }
  }
}

export async function getLoadOrdersForBascula() {
  const supabase = await createClient()
  try {
    const empresaId = await getCurrentEmpresaIdForInsert()

    const { data, error } = await supabase
      .from("cabeceraoc")
      .select(
        "id, ordendecargue, placa, pesajeinicial, pesajefinal, pesovascula, tiquetebascula, fechaorden, fechacargue, pesoorden",
      )
      .eq("idempresa", empresaId) // Filter by empresa from session
      .neq("tipooperacion", "Tolva") // Exclude Tolva operations
      .is("pesajefinal", null)
      .not("placa", "is", null)
      .neq("placa", "")
      .order("id", { ascending: false })

    if (error) {
      console.error("Error fetching load orders for bascula:", error)
      return { success: false, message: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error("Error in getLoadOrdersForBascula:", error)
    return { success: false, message: "Error inesperado al cargar órdenes de cargue" }
  }
}

export async function updateBasculaData(orderData: {
  orderId: number
  pesajeinicial?: string
  pesajefinal?: string
  pesovascula?: number
  tiquetebascula?: string
}) {
  const supabase = await createClient()
  try {
    const updateData: any = {}

    if (orderData.pesajeinicial) updateData.pesajeinicial = orderData.pesajeinicial
    if (orderData.pesajefinal) {
      updateData.pesajefinal = orderData.pesajefinal
      // When pesajefinal is set, also set status to "finalizado"
      updateData.status = "finalizado"
    }
    if (orderData.pesovascula !== undefined) updateData.pesovascula = orderData.pesovascula
    if (orderData.tiquetebascula) updateData.tiquetebascula = orderData.tiquetebascula

    const { error } = await supabase.from("cabeceraoc").update(updateData).eq("id", orderData.orderId)

    if (error) {
      console.error("Error updating bascula data:", error)
      return { success: false, message: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al actualizar datos de báscula" }
  }
}

export async function getVehiclesForSanitaryRegistry() {
  const supabase = await createClient()
  try {
    const empresaId = await getCurrentEmpresaIdForInsert()

    const { data, error } = await supabase
      .from("cabeceraoc")
      .select("id, placa, ordendecargue, conductor, tipoproducto")
      .eq("idempresa", empresaId)
      .is("horasanitario", null)
      .order("id", { ascending: false })

    if (error) {
      console.error("Error fetching vehicles for sanitary registry:", error)
      return { success: false, message: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al cargar vehículos" }
  }
}

export async function uploadSanitaryPhoto(file: File, ordenCargue: string) {
  try {
    console.log("[v0] uploadSanitaryPhoto - Starting upload for order:", ordenCargue)
    console.log("[v0] uploadSanitaryPhoto - File name:", file.name, "size:", file.size, "type:", file.type)

    const supabase = await getSupabaseAdmin()

    // Generate filename based on order code
    const fileExtension = file.name.split(".").pop()
    const fileName = `${ordenCargue}_${Date.now()}.${fileExtension}`
    const filePath = `registrosanitario/${fileName}`

    console.log("[v0] uploadSanitaryPhoto - Uploading to path:", filePath)

    // Upload file directly to Supabase Storage in the 'archivos' bucket
    const { data, error } = await supabase.storage.from("archivos").upload(filePath, file, {
      contentType: file.type,
      upsert: true, // Replace if exists
    })

    if (error) {
      console.error("[v0] uploadSanitaryPhoto - Error uploading photo:", error)
      return { success: false, message: error.message, url: null }
    }

    console.log("[v0] uploadSanitaryPhoto - Upload successful, getting public URL")

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("archivos").getPublicUrl(filePath)

    console.log("[v0] uploadSanitaryPhoto - Photo uploaded successfully. Public URL:", publicUrl)
    return { success: true, message: "Foto subida exitosamente", url: publicUrl }
  } catch (error) {
    console.error("[v0] uploadSanitaryPhoto - Unexpected error:", error)
    return { success: false, message: "Error inesperado al subir foto", url: null }
  }
}

export async function registerSanitaryVerification(data: {
  ordencargue: string
  placa: string
  conductor: string
  producto: string
  carpas: string
  limpieza: string
  olores: string
  plastico: string
  fumigacion: string
  plaguicida: string
  observaciones: string
  fumigador: string
  auxiliar: string
  foto?: string | null
  vehicleId?: number
  aprobacion?: string
  isVehicleOnly?: boolean
  citasVehiculosId?: number
}) {
  const supabase = await createClient()
  try {
    console.log("[v0] Registering sanitary verification:", data)

    const { data: maxIdData, error: maxIdError } = await supabase
      .from("registrosanitario")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)

    if (maxIdError) {
      console.error("Error fetching max ID:", maxIdError)
      return { success: false, message: maxIdError.message }
    }

    const nextId = maxIdData && maxIdData.length > 0 ? maxIdData[0].id + 1 : 1

    const colombiaTime = await getColombiaDateTime()
    const fechaForDB = colombiaTime.toISOString().split("T")[0] // YYYY-MM-DD for date type
    const horaForDB = colombiaTime.toTimeString().split(" ")[0] // HH:MM:SS for time type
    const fechaDisplay = colombiaTime.toLocaleDateString("es-CO") // For PDF display

    console.log("[v0] Generating PDF for sanitary registry...")
    const { generateAndUploadSanitaryRegistryPDF } = await import("@/lib/pdf-actions")

    const pdfResult = await generateAndUploadSanitaryRegistryPDF({
      id: nextId,
      ordencargue: data.isVehicleOnly ? null : data.ordencargue,
      placa: data.placa,
      conductor: data.conductor,
      producto: data.producto,
      carpas: data.carpas,
      limpieza: data.limpieza,
      olores: data.olores,
      plastico: data.plastico,
      fumigacion: data.fumigacion,
      plaguicida: data.plaguicida,
      observaciones: data.observaciones,
      fumigador: data.fumigador,
      auxiliar: data.auxiliar,
      fecha: fechaDisplay,
      hora: horaForDB,
      aprobacion: data.aprobacion || "aprobado",
      isVehicleOnly: data.isVehicleOnly,
    })

    let pdfUrl: string | null = null
    if (pdfResult.success && pdfResult.url) {
      pdfUrl = pdfResult.url
      console.log("[v0] PDF generated successfully:", pdfUrl)
    } else {
      console.error("[v0] Failed to generate PDF:", pdfResult.error)
    }

    const empresaId = await getCurrentEmpresaIdForInsert()

    console.log("[v0] registerSanitaryVerification - Saving to database with foto URL:", data.foto)
    console.log("[v0] registerSanitaryVerification - PDF URL:", pdfUrl)

    const { error: insertError } = await supabase.from("registrosanitario").insert({
      id: nextId,
      idempresa: empresaId, // Use dynamic empresa ID
      ordencargue: data.isVehicleOnly ? null : data.ordencargue,
      placa: data.placa,
      conductor: data.conductor,
      producto: data.producto,
      carpas: data.carpas,
      limpieza: data.limpieza,
      olores: data.olores,
      plastico: data.plastico,
      fumigacion: data.fumigacion,
      plaguicida: data.plaguicida,
      observaciones: data.observaciones,
      fumigador: data.fumigador,
      auxiliar: data.auxiliar,
      foto: data.foto || null,
      aprobacion: data.aprobacion || "aprobado",
      pdf: pdfUrl,
      fecha: fechaForDB, // date type: YYYY-MM-DD
      horaregistro: horaForDB, // time type: HH:MM:SS
    })

    if (insertError) {
      console.error("Error inserting sanitary registry:", insertError)
      return { success: false, message: insertError.message }
    }

    console.log("[v0] Sanitary verification registered successfully with ID:", nextId)

    if (data.isVehicleOnly && data.citasVehiculosId) {
      // Update citasvehiculos table with horaregistro
      console.log("[v0] Updating horaregistro for citasvehiculos ID:", data.citasVehiculosId, "with time:", horaForDB)

      const { error: updateError } = await supabase
        .from("citasvehiculos")
        .update({ horaregistro: horaForDB })
        .eq("id", data.citasVehiculosId)

      if (updateError) {
        console.error("Error updating horaregistro in citasvehiculos:", updateError)
      } else {
        console.log("[v0] horaregistro updated successfully in citasvehiculos")
      }
    } else if (data.vehicleId) {
      // Original logic for orders with orden de cargue
      if (data.aprobacion === "rechazado") {
        console.log("[v0] Updating status to 'Registro sanitario rechazado' for vehicle ID:", data.vehicleId)

        const { error: updateError } = await supabase
          .from("cabeceraoc")
          .update({ status: "Registro sanitario rechazado" })
          .eq("id", data.vehicleId)

        if (updateError) {
          console.error("Error updating status:", updateError)
        } else {
          console.log("[v0] Status updated successfully")
        }
      } else {
        console.log("[v0] Updating horasanitario for vehicle ID:", data.vehicleId, "with time:", horaForDB)

        const { error: updateError } = await supabase
          .from("cabeceraoc")
          .update({ horasanitario: horaForDB })
          .eq("id", data.vehicleId)

        if (updateError) {
          console.error("Error updating horasanitario:", updateError)
        } else {
          console.log("[v0] horasanitario updated successfully")
        }
      }
    }

    return {
      success: true,
      message:
        data.aprobacion === "rechazado"
          ? "Inspección rechazada exitosamente"
          : "Registro sanitario guardado exitosamente",
    }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al registrar verificación sanitaria" }
  }
}

export async function updatePedidoDetalleStatus(
  updates: Array<{
    transid: number
    unidadescargadas: number
    estado: "cerrado" | "parcial"
  }>,
  orderCode?: string,
) {
  const supabase = await createClient()
  try {
    const updatePromises = updates.map((update) => {
      const updateData: {
        unidadescargadas: number
        estado: "cerrado" | "parcial"
        ocargue?: string
      } = {
        unidadescargadas: update.unidadescargadas,
        estado: update.estado,
      }

      if (orderCode) {
        updateData.ocargue = orderCode
      }

      return supabase.from("pedidosdetalle").update(updateData).eq("transid", update.transid)
    })

    const results = await Promise.all(updatePromises)
    const failedUpdates = results.filter((result) => result.error)

    if (failedUpdates.length > 0) {
      console.error("Error updating pedidosdetalle:", failedUpdates)
      return { success: false, message: "Error al actualizar detalles de pedido" }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al actualizar detalles" }
  }
}

export async function checkAndUpdatePedidoCabeceraStatus(idpedido: number) {
  const supabase = await createClient()
  try {
    // Get all lines for this order
    const { data: allLines, error: linesError } = await supabase
      .from("pedidosdetalle")
      .select("estado")
      .eq("idpedido", idpedido)

    if (linesError) {
      console.error("Error fetching order lines:", linesError)
      return { success: false, message: "Error al verificar líneas del pedido" }
    }

    if (!allLines || allLines.length === 0) {
      return { success: true }
    }

    // Check if all lines are closed
    const allClosed = allLines.every((line) => line.estado === "cerrado")

    // Check if at least one line is partial
    const hasPartial = allLines.some((line) => line.estado === "parcial")

    let newEstado: string | null = null

    if (allClosed) {
      newEstado = "entregado"
    } else if (hasPartial) {
      newEstado = "parcial"
    }

    // Update pedidoscabecera estado if needed
    if (newEstado) {
      const { error: updateError } = await supabase
        .from("pedidoscabecera")
        .update({ estado: newEstado })
        .eq("idpedido", idpedido)

      if (updateError) {
        console.error("Error updating pedidoscabecera:", updateError)
        return { success: false, message: "Error al actualizar estado del pedido" }
      }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al actualizar estado del pedido" }
  }
}

export async function getSanitaryRegistryHistory(selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  
  try {
  // Use selectedEmpresaId if provided, otherwise fall back to current user's empresa_id
  const empresaId = selectedEmpresaId ?? await getCurrentEmpresaIdForInsert()
  
  console.log("[v0] getSanitaryRegistryHistory - Filtering by empresaId:", empresaId)

    const { data, error } = await supabase
      .from("registrosanitario")
      .select("*")
      .eq("idempresa", empresaId)
      .order("id", { ascending: true })

    if (error) {
      console.error("Error fetching sanitary registry history:", error)
      return { success: false, data: [], error: error.message }
    }

    console.log("[v0] getSanitaryRegistryHistory - Found", data?.length || 0, "records for empresa", empresaId)
    return { success: true, data: data || [] }
  } catch (error) {
    console.error("Error in getSanitaryRegistryHistory:", error)
    return { success: false, data: [], error: "Error al cargar el historial" }
  }
}

export async function getEstadosFilter() {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase.from("pedidoscabecera").select("estado").order("estado", { ascending: true })

    if (error) {
      console.error("Error fetching estados:", error)
      return { success: false, message: error.message }
    }

    // Get unique estados and filter out null/empty values
    const uniqueEstados = [
      ...new Set(data?.map((row) => row.estado).filter((estado) => estado && estado.trim() !== "")),
    ].sort()

    return { success: true, data: uniqueEstados }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al cargar estados" }
  }
}

export async function getClientesFilter() {
  const supabase = await createClient()
  try {
    const empresaId = await getCurrentEmpresaIdForInsert()

    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre")
      .eq("id_empresa", empresaId) // Apply empresa filter
      .order("nombre", { ascending: true })

    if (error) {
      console.error("Error fetching clientes:", error)
      return { success: false, message: error.message, data: null }
    }

    return {
      success: true,
      data: data || [],
      clientesMap: new Map(data?.map((c) => [c.nombre, c.id]) || []),
    }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al cargar clientes", data: null }
  }
}

export async function getVendedoresFilter() {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase.from("vendedores").select("nombre").order("nombre", { ascending: true })

    if (error) {
      console.error("Error fetching vendedores:", error)
      return { success: false, message: error.message, data: null }
    }

    const vendedores = data?.map((v) => v.nombre).filter((nombre) => nombre && nombre.trim() !== "") || []

    return { success: true, data: vendedores }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al cargar vendedores", data: null }
  }
}

export async function getDestinosFilter() {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase.from("destinos").select("nombre").order("nombre", { ascending: true })

    if (error) {
      console.error("Error fetching destinos:", error)
      return { success: false, message: error.message, data: null }
    }

    const destinos = data?.map((d) => d.nombre).filter((nombre) => nombre && nombre.trim() !== "") || []

    return { success: true, data: destinos }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al cargar destinos", data: null }
  }
}

export async function annulOrder(idpedido: number, password: string, observaciones?: string) {
  const supabase = await createClient()

  console.log("[v0] Annul order attempt:", { idpedido, password })

  // Validate password
  if (password !== "LIP123456") {
    console.log("[v0] Password validation failed")
    return { success: false, message: "Contraseña incorrecta" }
  }

  try {
    // Verify order conditions
    const { data: order, error: fetchError } = await supabase
      .from("pedidoscabecera")
      .select("aprobado, ocargue, estado")
      .eq("idpedido", idpedido)
      .single()

    console.log("[v0] Order data fetched:", order)

    if (fetchError) {
      console.error("[v0] Fetch error:", fetchError)
      return { success: false, message: "Error al verificar el pedido" }
    }

    if (order.aprobado?.toLowerCase() !== "si") {
      console.log("[v0] Order not approved:", order.aprobado)
      return { success: false, message: "Solo se pueden anular pedidos aprobados" }
    }

    if (order.ocargue && order.ocargue.trim() !== "") {
      console.log("[v0] Order has ocargue:", order.ocargue)
      return { success: false, message: "No se puede anular un pedido con O.Cargue asignada" }
    }

    const { error: updateError } = await supabase
      .from("pedidoscabecera")
      .update({
        estado: "anulado",
        observaciones: observaciones || "",
      })
      .eq("idpedido", idpedido)

    if (updateError) {
      console.error("[v0] Update error:", updateError)
      return { success: false, message: "Error al anular el pedido" }
    }

    console.log("[v0] Order successfully annulled")
    return { success: true, message: "Pedido anulado exitosamente" }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, message: "Error inesperado al anular pedido" }
  }
}

export async function closePendingOrder(idpedido: number, password: string, observaciones?: string) {
  const supabase = await createClient()

  // Validate password
  if (password !== "LIP123456") {
    return { success: false, message: "Contraseña incorrecta" }
  }

  try {
    // Verify order conditions
    const { data: order, error: fetchError } = await supabase
      .from("pedidoscabecera")
      .select("estado")
      .eq("idpedido", idpedido)
      .single()

    if (fetchError) {
      return { success: false, message: "Error al verificar el pedido" }
    }

    if (order.estado?.toLowerCase() !== "parcial") {
      return { success: false, message: "Solo se pueden cerrar pedidos con estado parcial" }
    }

    const { error: updateError } = await supabase
      .from("pedidoscabecera")
      .update({
        estado: "entrega parcial",
        observaciones: observaciones || "",
      })
      .eq("idpedido", idpedido)

    if (updateError) {
      return { success: false, message: "Error al cerrar el pedido" }
    }

    return { success: true, message: "Pedido cerrado exitosamente" }
  } catch (error) {
    return { success: false, message: "Error inesperado al cerrar pedido" }
  }
}

export async function deleteLoadOrder(orderId: number) {
  const supabase = await createClient()
  try {
    console.log("[v0] Starting deleteLoadOrder for orderId:", orderId)

    // Step 1: Get the order to be deleted to get ordendecargue
    const { data: orderToDelete, error: fetchError } = await supabase
      .from("cabeceraoc")
      .select("ordendecargue")
      .eq("id", orderId)
      .single()

    if (fetchError) {
      console.error("[v0] Error fetching order to delete:", fetchError)
      return { success: false, message: "Error al obtener la orden de cargue" }
    }

    if (!orderToDelete) {
      return { success: false, message: "Orden de cargue no encontrada" }
    }

    const ordenDeCargue = orderToDelete.ordendecargue
    console.log("[v0] Order to delete has ordendecargue:", ordenDeCargue)

    // Step 2: Delete all associated lines in detalleoc where idorden = orderId
    const { error: detailsDeleteError } = await supabase.from("detalleoc").delete().eq("idorden", orderId)

    if (detailsDeleteError) {
      console.error("[v0] Error deletingdetalleoc:", detailsDeleteError)
      return { success: false, message: "Error al eliminar detalles de la orden" }
    }

    console.log("[v0] Deleteddetalleoc records for order:", orderId)

    // Step 3: Delete the line from cabeceraoc
    const { error: headerDeleteError } = await supabase.from("cabeceraoc").delete().eq("id", orderId)

    if (headerDeleteError) {
      console.error("[v0] Error deleting cabeceraoc:", headerDeleteError)
      return { success: false, message: "Error al eliminar cabecera de la orden" }
    }

    console.log("[v0] Deleted cabeceraoc record for order:", orderId)

    // Step 4: Clear fields in pedidoscabecera where ocargue matches ordenDeCargue
    const { error: pedidosUpdateError } = await supabase
      .from("pedidoscabecera")
      .update({
        ocargue: null,
        estado: null,
        vehiculo: null,
        transporte: null,
        fechaordencargue: null,
        fechadeentrega: null,
      })
      .eq("ocargue", ordenDeCargue)

    if (pedidosUpdateError) {
      console.error("[v0] Error updating pedidoscabecera:", pedidosUpdateError)
      return { success: false, message: "Error al actualizar pedidos relacionados" }
    }

    console.log("[v0] Cleared fields in pedidoscabecera for ocargue:", ordenDeCargue)

    const { error: pedidosDetalleUpdateError } = await supabase
      .from("pedidosdetalle")
      .update({
        ocargue: null,
        unidades_cargadas: null,
        unidadescargadas: null,
        estado: null,
      })
      .eq("ocargue", ordenDeCargue)

    if (pedidosDetalleUpdateError) {
      console.error("[v0] Error updating pedidosdetalle:", pedidosDetalleUpdateError)
      return { success: false, message: "Error al actualizar detalles de pedidos relacionados" }
    }

    console.log("[v0] Cleared fields in pedidos detalle for ocargue:", ordenDeCargue)

    const { error: citasUpdateError } = await supabase
      .from("citasvehiculos")
      .update({
        ocargue: null,
        estatus: null,
      })
      .eq("ocargue", ordenDeCargue)

    if (citasUpdateError) {
      console.error("[v0] Error updating citasvehiculos:", citasUpdateError)
      return { success: false, message: "Error al actualizar citas de vehículos relacionadas" }
    }

    console.log("[v0] Cleared fields in citasvehiculos for ocargue:", ordenDeCargue)

    revalidatePath("/dashboard/orders/load-orders")

    return { success: true, message: "Orden de cargue eliminada exitosamente" }
  } catch (error) {
    console.error("[v0] Error deleting load order:", error)
    return { success: false, message: "Error inesperado al eliminar la orden de cargue" }
  }
}

// New function to verify cartera password and get username
export async function verifyCarteraPassword(password: string) {
  const supabase = await createClient()
  try {
    console.log("[v0] Verifying cartera password")

    const { data, error } = await supabase
      .from("usuariocartera")
      .select("nombre, contra")
      .eq("contra", password)
      .single()

    if (error || !data) {
      console.error("[v0] Invalid cartera password:", error)
      return { success: false, message: "Contraseña de cartera inválida" }
    }

    return { success: true, nombre: data.nombre, message: "Contraseña válida" }
  } catch (error) {
    console.error("[v0] Error verifying cartera password:", error)
    return { success: false, message: "Error al verificar contraseña" }
  }
}

// New function to update pedido with revisioncartera
export async function approveCartera(idpedido: number, nombreCartera: string) {
  const supabase = await createClient()
  try {
    console.log("[v0] Approving cartera for pedido:", idpedido, "with nombre:", nombreCartera)

    const { error } = await supabase
      .from("pedidoscabecera")
      .update({ revisioncartera: nombreCartera })
      .eq("idpedido", idpedido)

    if (error) {
      console.error("[v0] Error updating revisioncartera:", error)
      return { success: false, message: "Error al actualizar aprobación de cartera" }
    }

    return { success: true, message: "Aprobación de cartera registrada exitosamente" }
  } catch (error) {
    console.error("[v0] Error approving cartera:", error)
    return { success: false, message: "Error inesperado al aprobar cartera" }
  }
}

export async function addProductsToOrder(idpedido: number, productsToInsert: any[]) {
  const supabase = await createClient()
  try {
    const empresaId = await getCurrentEmpresaIdForInsert()

    // Fetch the last transid to correctly generate new ones
    const { data: lastDetail } = await supabase
      .from("pedidosdetalle")
      .select("transid")
      .order("transid", { ascending: false })
      .limit(1)
      .maybeSingle()

    let nextTransId = 1
    if (lastDetail) {
      nextTransId = (lastDetail.transid || 0) + 1
    }

    const detailsToInsert = productsToInsert.map((product, index) => ({
      transid: nextTransId + index,
      idpedido: idpedido,
      id_empresa: empresaId, // Use dynamic empresa ID
      producto: product.producto,
      unidades: product.cantidad,
      precio_und: product.precioUnitario,
      total_linea: product.totalLinea,
      iva: product.descuentoIVA,
      descuentopp: product.descuentoPP,
      subtotal: product.subtotal,
      peso: product.peso,
      categoria: product.categoria,
    }))

    const { error: insertError } = await supabase.from("pedidosdetalle").insert(detailsToInsert)

    if (insertError) {
      console.error("Error inserting new products:", insertError)
      return { success: false, message: "Error al agregar nuevos productos al pedido" }
    }

    revalidatePath(`/dashboard/orders/${idpedido}`)

    return { success: true, message: "Productos agregados exitosamente" }
  } catch (error) {
    console.error("Unexpected error in addProductsToOrder:", error)
    return { success: false, message: "Error inesperado al agregar productos al pedido" }
  }
}

export async function generateUnloadOrder(orderData: {
  fechaDescargue: string
  placa: string
  transporte: string
  tiquete: string
  numeroOrden: string
  pesoBascula: number
  lineas: Array<{
    id: string
    producto?: { id: number; nombre: string; peso_unitkg: number; pesobruto?: number }
    cantidad: number
    pesoBrutoTotal?: number
  }>
  pesoTotalOrden: number
  pesoBrutoTotalOrden?: number
}) {
  const supabase = await createClient()

  try {
    console.log("[v0] Generating unload order with data:", orderData)

    // Get current session empresa ID
    const sessionEmpresaId = await getCurrentEmpresaId()

    if (!sessionEmpresaId) {
      console.error("[v0] Could not get session empresa ID")
      return { success: false, message: "Error al obtener la empresa de la sesión" }
    }

    console.log("[v0] Using empresa ID from session:", sessionEmpresaId)

    // Get indicativo
    const { data: indicativoData, error: indicativoError } = await supabase
      .from("indicativo")
      .select("id, indicativo")
      .eq("id", sessionEmpresaId)
      .maybeSingle()

    let indicativo = "IND" // Default fallback value

    if (indicativoError) {
      console.error("[v0] Error fetching indicativo:", indicativoError.message)
    } else if (!indicativoData) {
      console.warn("[v0] No indicativo record found with ID:", sessionEmpresaId)
    } else if (!indicativoData.indicativo) {
      console.warn("[v0] Indicativo record found but indicativo field is null/empty")
    } else {
      indicativo = indicativoData.indicativo
      console.log("[v0] Successfully found indicativo:", indicativo)
    }

    // Get next ID
    const { data: lastHeader, error: lastHeaderError } = await supabase
      .from("cabeceraoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastHeaderError) {
      console.error("[v0] Error fetching last header ID:", lastHeaderError)
      return { success: false, message: "Error al obtener último ID de cabecera" }
    }

    const nextId = lastHeader ? (lastHeader.id || 0) + 1 : 1
    console.log("[v0] Next ID will be:", nextId)

    // Generate order code
    const colombiaTime = await getColombiaDateTime()
    const year = colombiaTime.getFullYear()
    const month = String(colombiaTime.getMonth() + 1).padStart(2, "0")
    const day = String(colombiaTime.getDate()).padStart(2, "0")
    const orderCode = `${indicativo}${year}${month}${day}${nextId}`

    console.log("[v0] Generated order code:", orderCode)

    const currentDate = await getColombiaDate()
    const currentTime = await getColombiaTime()
    const fechaDescargueFormatted = await dateInputToColombiaDate(orderData.fechaDescargue)

    // Insert into cabeceraoc with tipooperacion = "Descargue"
    const { error: headerInsertError } = await supabase.from("cabeceraoc").insert({
      id: nextId,
      idempresa: sessionEmpresaId,
      ordendecargue: orderData.numeroOrden || orderCode,
      fechaorden: currentDate,
      placa: orderData.placa,
      transporte: orderData.transporte,
      tiquetebascula: orderData.tiquete,
      tipooperacion: "Descargue",
      pesoorden: orderData.pesoTotalOrden / 1000, // Divide by 1000 as per requirements
      horaorden: currentTime,
      horalote: currentTime,
      horavehiculo: currentTime,
      fechacargue: fechaDescargueFormatted,
      pesovascula: orderData.pesoBascula,
    })

    if (headerInsertError) {
      console.error("[v0] Error inserting cabeceraoc:", headerInsertError)
      return { success: false, message: `Error al crear cabecera: ${headerInsertError.message}` }
    }

    console.log("[v0] Cabeceraoc inserted successfully")

    // Get next detail ID
    const { data: lastDetail, error: lastDetailError } = await supabase
      .from("detalleoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDetailError) {
      console.error("[v0] Error fetching last detail ID:", lastDetailError)
      return { success: false, message: "Error al obtener último ID de detalle" }
    }

    let nextDetailId = lastDetail ? (lastDetail.id || 0) + 1 : 1
    console.log("[v0] Next detail ID will be:", nextDetailId)

    // Insert detail lines
    const detailsToInsert = orderData.lineas
      .filter((line) => line.cantidad > 0 && line.producto)
      .map((line) => ({
        id: nextDetailId++,
        idorden: nextId,
        numeroorden: orderData.numeroOrden || orderCode,
        producto: line.producto!.nombre,
        cantidad: line.cantidad,
        toneladas: (line.cantidad * line.producto!.peso_unitkg) / 1000,
        cliente: "",
      }))

    console.log("[v0] Inserting", detailsToInsert.length, "detail records")

    if (detailsToInsert.length > 0) {
      const { error: detailsInsertError } = await supabase.from("detalleoc").insert(detailsToInsert)

      if (detailsInsertError) {
        console.error("[v0] Error inserting detalleoc:", detailsInsertError)
        return { success: false, message: `Error al crear detalles: ${detailsInsertError.message}` }
      }

      console.log("[v0] Detalleoc inserted successfully")
    }

    // Generate PDF and upload it
    const pdfResult = await generateAndUploadUnloadOrderPDF({
      orderId: nextId,
      orderCode,
      empresaId: sessionEmpresaId,
      fecha: `${currentDate} ${currentTime}`,
      placa: orderData.placa,
      transporte: orderData.transporte,
      productsList: orderData.lineas
        .filter((line) => line.cantidad > 0 && line.producto)
        .map((line) => ({
          producto: line.producto!.nombre,
          cantidad: line.cantidad,
          pesoKgs: line.cantidad * line.producto!.peso_unitkg,
          pesoBrutoKgs: line.pesoBrutoTotal || 0,
        })),
      totalPesoKgs: orderData.pesoTotalOrden,
      totalPesoBrutoKgs: orderData.pesoBrutoTotalOrden || 0,
    })

    if (!pdfResult.success) {
      console.error("Failed to generate and upload PDF:", pdfResult.message)
    } else {
      console.log("PDF generated and uploaded successfully:", pdfResult.url)
      // Update cabeceraoc with the PDF URL
      await supabase.from("cabeceraoc").update({ pdfoc: pdfResult.url }).eq("id", nextId)
    }

    revalidatePath("/dashboard/orders")

    return {
      success: true,
      message: "Orden de descargue generada exitosamente",
      orderId: nextId,
      orderCode,
    }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, message: "Error inesperado al generar orden de descargue" }
  }
}

export async function generateDistributionOrder(orderData: {
  fechaDistribucion: string
  placa: string
  transporte: string
  tiquete: string
  numeroOrden: string
  pesoBascula: number
  lineas: Array<{
    id: string
    producto?: { id: number; nombre: string; peso_unitkg: number; pesobruto?: number }
    cantidad: number
    pesoBrutoTotal?: number
  }>
  pesoTotalOrden: number
  pesoBrutoTotalOrden?: number
}) {
  const supabase = await createClient()

  try {
    console.log("[v0] Generating distribution order with data:", orderData)

    // Get current session empresa ID
    const sessionEmpresaId = await getCurrentEmpresaId()

    if (!sessionEmpresaId) {
      console.error("[v0] Could not get session empresa ID")
      return { success: false, message: "Error al obtener la empresa de la sesión" }
    }

    console.log("[v0] Using empresa ID from session:", sessionEmpresaId)

    // Get indicativo
    const { data: indicativoData, error: indicativoError } = await supabase
      .from("indicativo")
      .select("id, indicativo")
      .eq("id", sessionEmpresaId)
      .maybeSingle()

    let indicativo = "IND" // Default fallback value

    if (indicativoError) {
      console.error("[v0] Error fetching indicativo:", indicativoError.message)
    } else if (!indicativoData) {
      console.warn("[v0] No indicativo record found with ID:", sessionEmpresaId)
    } else if (!indicativoData.indicativo) {
      console.warn("[v0] Indicativo record found but indicativo field is null/empty")
    } else {
      indicativo = indicativoData.indicativo
      console.log("[v0] Successfully found indicativo:", indicativo)
    }

    // Get next ID
    const { data: lastHeader, error: lastHeaderError } = await supabase
      .from("cabeceraoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastHeaderError) {
      console.error("[v0] Error fetching last header ID:", lastHeaderError)
      return { success: false, message: "Error al obtener último ID de cabecera" }
    }

    const nextId = lastHeader ? (lastHeader.id || 0) + 1 : 1
    console.log("[v0] Next ID will be:", nextId)

    // Generate order code
    const colombiaTime = await getColombiaDateTime()
    const year = colombiaTime.getFullYear()
    const month = String(colombiaTime.getMonth() + 1).padStart(2, "0")
    const day = String(colombiaTime.getDate()).padStart(2, "0")
    const orderCode = `${indicativo}${year}${month}${day}${nextId}`

    console.log("[v0] Generated order code:", orderCode)

    const currentDate = await getColombiaDate()
    const currentTime = await getColombiaTime()
    const fechaDistribucionFormatted = await dateInputToColombiaDate(orderData.fechaDistribucion)

    // Insert into cabeceraoc with tipooperacion = "Distribución"
    // El usuario ahora ingresa pesoBascula directamente en TONELADAS desde el UI,
    // por lo que ya no se divide por 1000 al persistir.
    const pesoBasculaTons = orderData.pesoBascula
    
    const { error: headerInsertError } = await supabase.from("cabeceraoc").insert({
      id: nextId,
      idempresa: sessionEmpresaId,
      ordendecargue: orderData.numeroOrden || orderCode,
      fechaorden: currentDate,
      placa: orderData.placa,
      transporte: orderData.transporte,
      tiquetebascula: orderData.tiquete,
      tipooperacion: "Distribucion",
      pesoorden: pesoBasculaTons, // ya en toneladas
      horaorden: currentTime,
      horalote: currentTime,
      horavehiculo: currentTime,
      fechacargue: fechaDistribucionFormatted,
      pesovascula: pesoBasculaTons, // ya en toneladas
    })

    if (headerInsertError) {
      console.error("[v0] Error inserting cabeceraoc:", headerInsertError)
      return { success: false, message: `Error al crear cabecera: ${headerInsertError.message}` }
    }

    console.log("[v0] Cabeceraoc inserted successfully")

    // Get next detail ID
    const { data: lastDetail, error: lastDetailError } = await supabase
      .from("detalleoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDetailError) {
      console.error("[v0] Error fetching last detail ID:", lastDetailError)
      return { success: false, message: "Error al obtener último ID de detalle" }
    }

    let nextDetailId = lastDetail ? (lastDetail.id || 0) + 1 : 1
    console.log("[v0] Next detail ID will be:", nextDetailId)

    // Insert detail lines
    const detailsToInsert = orderData.lineas
      .filter((line) => line.cantidad > 0 && line.producto)
      .map((line) => ({
        id: nextDetailId++,
        idorden: nextId,
        numeroorden: orderData.numeroOrden || orderCode,
        producto: line.producto!.nombre,
        cantidad: line.cantidad,
        toneladas: (line.cantidad * line.producto!.peso_unitkg) / 1000,
        cliente: "",
      }))

    console.log("[v0] Inserting", detailsToInsert.length, "detail records")

    if (detailsToInsert.length > 0) {
      const { error: detailsInsertError } = await supabase.from("detalleoc").insert(detailsToInsert)

      if (detailsInsertError) {
        console.error("[v0] Error inserting detalleoc:", detailsInsertError)
        return { success: false, message: `Error al crear detalles: ${detailsInsertError.message}` }
      }

      console.log("[v0] Detalleoc inserted successfully")
    }

    // Update citasvehiculos estatus to "Procesado" for the selected vehicle
    const { error: vehicleUpdateError } = await supabase
      .from("citasvehiculos")
      .update({ estatus: "Procesado" })
      .eq("placa", orderData.placa)
      .eq("idempresa", sessionEmpresaId)
      .is("estatus", null)

    if (vehicleUpdateError) {
      console.error("[v0] Error updating vehicle status:", vehicleUpdateError)
      // Don't fail the order creation, just log the error
    } else {
      console.log("[v0] Vehicle status updated to Procesado for placa:", orderData.placa)
    }

    revalidatePath("/dashboard/orders")

    return {
      success: true,
      message: "Orden de distribución generada exitosamente",
      orderId: nextId,
      orderCode,
    }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, message: "Error inesperado al generar orden de distribución" }
  }
}

async function generateAndUploadUnloadOrderPDF(data: {
  orderId: number
  orderCode: string
  empresaId: number
  fecha: string
  placa: string
  transporte: string
  productsList: Array<{ producto: string; cantidad: number; pesoKgs: number; pesoBrutoKgs: number }>
  totalPesoKgs: number
  totalPesoBrutoKgs: number
}) {
  try {
    const doc = new jsPDF()

    // Header - Title
    doc.setFontSize(16)
    doc.setTextColor(44, 82, 130)
    doc.setFont(undefined, "bold")
    doc.text("ORDEN DE DESCARGUE", 105, 15, { align: "center" })

    // Order information header
    let y = 25
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.setFont(undefined, "normal")

    // Orden
    doc.setFillColor(44, 82, 130)
    doc.setTextColor(255, 255, 255)
    doc.rect(15, y, 40, 6, "F")
    doc.text("Orden", 17, y + 4)

    doc.setFillColor(224, 224, 224)
    doc.setTextColor(0, 0, 0)
    doc.rect(55, y, 55, 6, "F")
    doc.text(data.orderCode, 57, y + 4)

    doc.setFillColor(44, 82, 130)
    doc.setTextColor(255, 255, 255)
    doc.rect(110, y, 40, 6, "F")
    doc.text("Fecha", 112, y + 4)

    doc.setFillColor(224, 224, 224)
    doc.setTextColor(0, 0, 0)
    doc.rect(150, y, 45, 6, "F")
    doc.text(data.fecha, 152, y + 4)

    // Placa
    y += 8
    doc.setFillColor(44, 82, 130)
    doc.setTextColor(255, 255, 255)
    doc.rect(15, y, 40, 6, "F")
    doc.text("Placa", 17, y + 4)

    doc.setFillColor(224, 224, 224)
    doc.setTextColor(0, 0, 0)
    doc.rect(55, y, 55, 6, "F")
    doc.text(data.placa, 57, y + 4)

    doc.setFillColor(44, 82, 130)
    doc.setTextColor(255, 255, 255)
    doc.rect(110, y, 40, 6, "F")
    doc.text("Transporte", 112, y + 4)

    doc.setFillColor(224, 224, 224)
    doc.setTextColor(0, 0, 0)
    doc.rect(150, y, 45, 6, "F")
    doc.text(data.transporte, 152, y + 4)

    // Products table header
    y += 12
    doc.setFillColor(100, 100, 100)
    doc.setTextColor(255, 255, 255)
    doc.rect(15, y, 75, 6, "F")
    doc.rect(90, y, 25, 6, "F")
    doc.rect(115, y, 40, 6, "F")
    doc.rect(155, y, 40, 6, "F")

    doc.setFontSize(9)
    doc.setFont(undefined, "bold")
    doc.text("Producto", 17, y + 4)
    doc.text("Cantidad", 102, y + 4, { align: "center" })
    doc.text("Peso (Kg)", 135, y + 4, { align: "center" })
    doc.text("P. Bruto (Kg)", 175, y + 4, { align: "center" })

    // Products table body
    y += 7
    doc.setFontSize(8)
    doc.setFont(undefined, "normal")
    doc.setTextColor(0, 0, 0)
    doc.setDrawColor(200, 200, 200)

    data.productsList.forEach((item) => {
      if (y > 270) {
        doc.addPage()
        y = 15
      }

      doc.rect(15, y, 75, 6, "S")
      doc.rect(90, y, 25, 6, "S")
      doc.rect(115, y, 40, 6, "S")
      doc.rect(155, y, 40, 6, "S")

      doc.text(item.producto.substring(0, 40), 17, y + 4)
      doc.text(String(item.cantidad), 102, y + 4, { align: "center" })
      doc.text(item.pesoKgs.toFixed(2), 135, y + 4, { align: "center" })
      doc.text(item.pesoBrutoKgs.toFixed(2), 175, y + 4, { align: "center" })

      y += 6
    })

    // Add empty rows for consistency
    const minRows = 8
    const currentRows = data.productsList.length
    if (currentRows < minRows) {
      for (let i = 0; i < minRows - currentRows; i++) {
        if (y > 270) {
          doc.addPage()
          y = 15
        }
        doc.rect(15, y, 75, 6, "S")
        doc.rect(90, y, 25, 6, "S")
        doc.rect(115, y, 40, 6, "S")
        doc.rect(155, y, 40, 6, "S")
        y += 6
      }
    }

    // Totals row
    y += 2
    doc.setFillColor(44, 82, 130)
    doc.setTextColor(255, 255, 255)
    doc.rect(15, y, 75, 6, "F")
    doc.setFontSize(9)
    doc.setFont(undefined, "bold")
    doc.text("TOTALES", 17, y + 4)

    doc.setFillColor(255, 255, 255)
    doc.setTextColor(0, 0, 0)
    doc.rect(90, y, 25, 6, "FD")
    doc.text(String(data.productsList.length), 102, y + 4, { align: "center" })

    doc.setFillColor(255, 255, 255)
    doc.rect(115, y, 40, 6, "FD")
    doc.text(data.totalPesoKgs.toFixed(2), 135, y + 4, { align: "center" })

    doc.setFillColor(255, 255, 255)
    doc.rect(155, y, 40, 6, "FD")
    doc.text(data.totalPesoBrutoKgs.toFixed(2), 175, y + 4, { align: "center" })

    console.log("[v0] PDF generated, creating blob...")

    // Generate PDF blob
    const pdfBlob = doc.output("blob")
    const fileName = `${data.orderCode}.pdf`

    console.log("[v0] Uploading PDF to Supabase storage...")

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("archivos")
      .upload(`doccargue/${fileName}`, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      })

    if (uploadError) {
      console.error("[v0] Error uploading unload order PDF:", uploadError)
      return { success: false, message: "Error al cargar PDF" }
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("archivos").getPublicUrl(`doccargue/${fileName}`)

    console.log("[v0] Unload order PDF uploaded successfully:", publicUrl)

    return { success: true, url: publicUrl }
  } catch (error) {
    console.error("[v0] Error generating PDF:", error)
    return { success: false, message: "Error al generar PDF" }
  }
}


export async function createSanitaryRegister(data: any) {
  const supabase = await createClient()
  try {
    const empresaId = await getCurrentEmpresaIdForInsert()

    // Fetch the last ID to correctly generate new ones
    const { data: maxIdData, error: maxIdError } = await supabase
      .from("registrosanitario")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)

    if (maxIdError) {
      console.error("Error fetching max ID for sanitary registry:", maxIdError)
      return { success: false, message: maxIdError.message }
    }

    const nextId = maxIdData && maxIdData.length > 0 ? maxIdData[0].id + 1 : 1

    const { error: insertError } = await supabase.from("registrosanitario").insert({
      id: nextId,
      idempresa: empresaId, // Use dynamic empresa ID
      ordencargue: data.isVehicleOnly ? null : data.ordencargue,
      placa: data.placa,
      conductor: data.conductor,
      producto: data.producto,
      carpas: data.carpas,
      limpieza: data.limpieza,
      olores: data.olores,
      plastico: data.plastico,
      fumigacion: data.fumigacion,
      plaguicida: data.plaguicida,
      observaciones: data.observaciones,
      fumigador: data.fumigador,
      auxiliar: data.auxiliar,
      foto: data.foto || null,
      aprobacion: data.aprobacion || "aprobado",
      fecha: data.fecha, // Assuming data.fecha is already in YYYY-MM-DD format
      horaregistro: data.hora, // Assuming data.hora is already in HH:MM:SS format
    })

    if (insertError) {
      console.error("Error inserting sanitary registry:", insertError)
      return { success: false, message: insertError.message }
    }

    console.log("[v0] Sanitary verification registered successfully with ID:", nextId)
    return {
      success: true,
      message: "Registro sanitario creado exitosamente",
      id: nextId,
    }
  } catch (error) {
    console.error("Unexpected error in createSanitaryRegister:", error)
    return { success: false, message: "Error inesperado al crear registro sanitario" }
  }
}

export async function saveTolva(tolvaData: {
  fechaFabricacion: string
  lote: string
  empleados: Array<{ id: number; nombreempleado: string }>
  productos: Array<{
    id: string
    producto?: { id: number; nombre: string; peso_unitkg: number }
    cantidad: number
  }>
}) {
  const supabase = await createClient()

  try {
    console.log("[v0] Tolva: Saving tolva with data:", tolvaData)

    // Get current empresa ID
    const empresaId = await getCurrentEmpresaId()

    if (!empresaId) {
      console.error("[v0] Could not get session empresa ID")
      return { success: false, message: "Error al obtener la empresa de la sesión" }
    }

    // Get next ID for cabeceraoc
    const { data: lastHeader, error: lastHeaderError } = await supabase
      .from("cabeceraoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastHeaderError) {
      console.error("[v0] Error fetching last header ID:", lastHeaderError)
      return { success: false, message: "Error al obtener último ID de cabecera" }
    }

    const nextId = lastHeader ? (lastHeader.id || 0) + 1 : 1

    // Get Colombia date
    const colombiaDate = await getColombiaDate()
    
    // Get current time in HH:MM:SS format
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, "0")
    const minutes = String(now.getMinutes()).padStart(2, "0")
    const seconds = String(now.getSeconds()).padStart(2, "0")
    const timeOnlyStr = `${hours}:${minutes}:${seconds}`

    // Calculate total weight
    const pesoTotal = tolvaData.productos.reduce((sum, line) => {
      if (line.producto && line.cantidad > 0) {
        return sum + line.cantidad * line.producto.peso_unitkg
      }
      return sum
    }, 0)

    // Format employee names as comma-separated string
    const empleadosStr = tolvaData.empleados.map((e) => e.nombreempleado).join(", ")

    // Determinar tipooperacion segun el dia de la semana de la fecha
    // de fabricacion: si cae en domingo se marca como "Tolva f"
    // (festivo / fin de semana), de lo contrario "Tolva". La fecha
    // viene como "YYYY-MM-DD" — la construimos con `new Date(y, m-1, d)`
    // para evitar el desfase de un dia que produce `new Date("YYYY-MM-DD")`
    // al interpretarse como UTC (un domingo en Bogota podria leerse
    // como sabado en UTC y al reves).
    let tipoOperacionTolva: "Tolva" | "Tolva f" = "Tolva"
    if (typeof tolvaData.fechaFabricacion === "string") {
      const parts = tolvaData.fechaFabricacion.split("-")
      if (parts.length === 3) {
        const y = Number(parts[0])
        const m = Number(parts[1])
        const d = Number(parts[2])
        if (
          Number.isFinite(y) &&
          Number.isFinite(m) &&
          Number.isFinite(d)
        ) {
          // getDay(): 0 = domingo, 1 = lunes, ..., 6 = sabado.
          const dow = new Date(y, m - 1, d).getDay()
          if (dow === 0) {
            tipoOperacionTolva = "Tolva f"
          }
        }
      }
    }
    console.log(
      "[v0] Tolva tipooperacion para fecha",
      tolvaData.fechaFabricacion,
      "=",
      tipoOperacionTolva,
    )

    // Insert into cabeceraoc
    const { error: headerInsertError } = await supabase.from("cabeceraoc").insert({
      id: nextId,
      idempresa: empresaId,
      ordendecargue: `Tolva${nextId}`,
      fechaorden: tolvaData.fechaFabricacion,
      tipooperacion: tipoOperacionTolva,
      auxiliares: empleadosStr,
      status: "finalizado",
      pesoorden: pesoTotal / 1000,
      pesovascula: pesoTotal / 1000,
      fechacargue: tolvaData.fechaFabricacion,
      fincargue: timeOnlyStr,
      horalote: timeOnlyStr,
    })

    if (headerInsertError) {
      console.error("[v0] Error inserting cabeceraoc:", headerInsertError)
      return { success: false, message: `Error al crear cabecera: ${headerInsertError.message}` }
    }

    console.log("[v0] Tolva cabeceraoc inserted successfully with ID:", nextId)

    // Get next ID for detalleoc
    const { data: lastDetail, error: lastDetailError } = await supabase
      .from("detalleoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDetailError) {
      console.error("[v0] Error fetching last detail ID:", lastDetailError)
      return { success: false, message: "Error al obtener último ID de detalle" }
    }

    let nextDetailId = lastDetail ? (lastDetail.id || 0) + 1 : 1
    console.log("[v0] Next detail ID will be:", nextDetailId)

    // Insert detail lines into detalleoc
    const detailsToInsert = tolvaData.productos
      .filter((line) => line.cantidad > 0 && line.producto)
      .map((line) => ({
        id: nextDetailId++,
        idorden: nextId,
        numeroorden: `Tolva${nextId}`,
        producto: line.producto!.nombre,
        cantidad: line.cantidad,
        toneladas: (line.cantidad * line.producto!.peso_unitkg) / 1000,
      }))

    console.log("[v0] Inserting", detailsToInsert.length, "detail records")

    if (detailsToInsert.length > 0) {
      const { error: detailsInsertError } = await supabase.from("detalleoc").insert(detailsToInsert)

      if (detailsInsertError) {
        console.error("[v0] Error inserting detalleoc:", detailsInsertError)
        return { success: false, message: `Error al crear detalles: ${detailsInsertError.message}` }
      }

      console.log("[v0] Detalleoc inserted successfully")
    }

    revalidatePath("/dashboard/production")

    return {
      success: true,
      message: "Tolva registrada exitosamente",
      id: nextId,
    }
  } catch (error) {
    console.error("[v0] Error saving tolva:", error)
    return { success: false, message: "Error inesperado al guardar tolva" }
  }
}

export async function saveProyecciones(proyeccionData: {
  fechaFabricacion: string
  productos: Array<{
    id: string
    producto?: { id: number; nombre: string; peso_unitkg: number }
    cantidad: number
  }>
  empleados?: Array<{ nombre: string }>
  /**
   * Empresa seleccionada en la UI (selector del header). Si viene
   * definida, tiene prioridad sobre la empresa por defecto del perfil
   * del usuario. Antes la proyeccion siempre se guardaba con
   * `getCurrentEmpresaId()` (perfil) y los usuarios multi-empresa
   * terminaban grabando en la empresa equivocada al cambiar de
   * empresa en la UI. Mismo patron que `saveOrder` usa con
   * `idempresaSeleccionada`.
   */
  idempresaSeleccionada?: number
}) {
  const supabase = await createClient()

  try {
    console.log("[v0] Proyecciones: Saving proyeccion with data:", proyeccionData)

    // Prioridad: empresa seleccionada en la UI > empresa del perfil.
    // Validamos que sea un numero finito > 0 antes de aceptarla — asi
    // un 0/NaN accidental del cliente no rompe la insercion.
    const empresaSeleccionada =
      typeof proyeccionData.idempresaSeleccionada === "number" &&
      Number.isFinite(proyeccionData.idempresaSeleccionada) &&
      proyeccionData.idempresaSeleccionada > 0
        ? proyeccionData.idempresaSeleccionada
        : null

    const empresaId = empresaSeleccionada ?? (await getCurrentEmpresaId())

    if (!empresaId) {
      console.error("[v0] Could not get session empresa ID")
      return { success: false, message: "Error al obtener la empresa de la sesión" }
    }

    console.log(
      "[v0] Proyecciones: using empresaId",
      empresaId,
      "(seleccionada:",
      empresaSeleccionada,
      ")",
    )

    // Get next ID for cabeceraoc
    const { data: lastHeader, error: lastHeaderError } = await supabase
      .from("cabeceraoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastHeaderError) {
      console.error("[v0] Error fetching last header ID:", lastHeaderError)
      return { success: false, message: "Error al obtener último ID de cabecera" }
    }

    const nextId = lastHeader ? (lastHeader.id || 0) + 1 : 1

    // Get Colombia date and time
    const colombiaDate = await getColombiaDate()
    const colombiaDateTimeRaw = await getColombiaDateTime()
    
    // Ensure colombiaDateTime is a string before calling split
    const colombiaDateTimeStr = typeof colombiaDateTimeRaw === "string" ? colombiaDateTimeRaw : JSON.stringify(colombiaDateTimeRaw)
    
    // Extract just the time portion (HH:MM:SS) from colombiaDateTime
    const colombiaTimeOnly = colombiaDateTimeStr.split("T")[1]?.split(".")[0] || "00:00:00"

    // Calculate total weight (kg) - allow negative values for adjustments/returns
    const pesoTotalKg = proyeccionData.productos.reduce((sum, line) => {
      if (line.producto && line.cantidad !== 0) {
        return sum + line.cantidad * line.producto.peso_unitkg
      }
      return sum
    }, 0)

    // Format auxiliares from empleados
    const auxiliares = proyeccionData.empleados
      ?.map((emp) => {
        // Use nombreempleado field from Employee interface
        const nombreCompleto = emp.nombreempleado || emp.nombre || ""
        return nombreCompleto
      })
      .filter((name) => name.length > 0) // Remove empty strings
      .join(",") || ""

    // Insert into cabeceraoc with proyecciones-specific data
    const { error: headerInsertError } = await supabase.from("cabeceraoc").insert({
      id: nextId,
      idempresa: empresaId,
      ordendecargue: `proyeccion${nextId}`,
      fechaorden: colombiaDate,
      tipooperacion: "proyeccion",
      pesoorden: pesoTotalKg / 1000,
      pesovascula: pesoTotalKg / 1000,
      status: "finalizado",
      fechacargue: proyeccionData.fechaFabricacion,
      fincargue: colombiaTimeOnly,
      pesajefinal: colombiaTimeOnly,
      auxiliares: auxiliares,
    })

    if (headerInsertError) {
      console.error("[v0] Error inserting cabeceraoc for proyeccion:", headerInsertError)
      return { success: false, message: `Error al crear proyección: ${headerInsertError.message}` }
    }

    console.log("[v0] Proyecciones cabeceraoc inserted successfully with ID:", nextId)

    revalidatePath("/dashboard/operations")

    return {
      success: true,
      message: "Proyección registrada exitosamente",
      id: nextId,
    }
  } catch (error) {
    console.error("[v0] Error saving proyeccion:", error)
    return { success: false, message: "Error inesperado al guardar proyección" }
  }
}

export async function updateTolva(
  tolvaId: number,
  tolvaData: {
    fechaFabricacion: string
    lote: string
    empleados: Array<{ id: number; nombreempleado: string }>
    productos: Array<{
      id: string
      producto?: { id: number; nombre: string; peso_unitkg: number }
      cantidad: number
    }>
  },
) {
  const supabase = await createClient()

  try {
    console.log("[v0] Tolva: Updating tolva ID", tolvaId, "with data:", tolvaData)

    // Calculate total weight
    const pesoTotal = tolvaData.productos.reduce((sum, line) => {
      if (line.producto && line.cantidad > 0) {
        return sum + line.cantidad * line.producto.peso_unitkg
      }
      return sum
    }, 0)

    // Format employee names as comma-separated string
    const empleadosStr = tolvaData.empleados.map((e) => e.nombreempleado).join(", ")

    // Update cabeceraoc
    const { error: headerUpdateError } = await supabase
      .from("cabeceraoc")
      .update({
        auxiliares: empleadosStr,
        pesoorden: pesoTotal / 1000,
        pesovascula: pesoTotal / 1000,
      })
      .eq("id", tolvaId)

    if (headerUpdateError) {
      console.error("[v0] Error updating cabeceraoc:", headerUpdateError)
      return { success: false, message: `Error al actualizar cabecera: ${headerUpdateError.message}` }
    }

    console.log("[v0] Tolva cabeceraoc updated successfully")

    // Delete existing details
    const { error: deleteError } = await supabase.from("detalleoc").delete().eq("idorden", tolvaId)

    if (deleteError) {
      console.error("[v0] Error deleting old details:", deleteError)
      return { success: false, message: `Error al eliminar detalles antiguos: ${deleteError.message}` }
    }

    // Get next detail ID
    const { data: lastDetail, error: lastDetailError } = await supabase
      .from("detalleoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDetailError) {
      console.error("[v0] Error fetching last detail ID:", lastDetailError)
      return { success: false, message: "Error al obtener último ID de detalle" }
    }

    let nextDetailId = lastDetail ? (lastDetail.id || 0) + 1 : 1

    // Insert new detail lines
    const detailsToInsert = tolvaData.productos
      .filter((line) => line.cantidad > 0 && line.producto)
      .map((line) => ({
        id: nextDetailId++,
        idorden: tolvaId,
        numeroorden: `Tolva${tolvaId}`,
        producto: line.producto!.nombre,
        cantidad: line.cantidad,
        toneladas: (line.cantidad * line.producto!.peso_unitkg) / 1000,
      }))

    console.log("[v0] Inserting", detailsToInsert.length, "new detail records")

    if (detailsToInsert.length > 0) {
      const { error: detailsInsertError } = await supabase.from("detalleoc").insert(detailsToInsert)

      if (detailsInsertError) {
        console.error("[v0] Error inserting detalleoc:", detailsInsertError)
        return { success: false, message: `Error al crear detalles: ${detailsInsertError.message}` }
      }

      console.log("[v0] Detalleoc inserted successfully")
    }

    revalidatePath("/dashboard/production")

    return {
      success: true,
      message: "Tolva actualizada exitosamente",
    }
  } catch (error) {
    console.error("[v0] Error updating tolva:", error)
    return { success: false, message: "Error inesperado al actualizar tolva" }
  }
}

export async function updateOrderInitioCargue(orderId: number) {
  const supabase = await createClient()

  try {
    console.log("[v0] updateOrderInitioCargue: Starting for order ID:", orderId)

    // Get current time in Colombia
    const colombiaTime = await getColombiaTime()

    console.log("[v0] updateOrderInitioCargue: Colombia time obtained:", colombiaTime)

    // Update cabeceraoc with current time
    const { error: updateError, data: updateData } = await supabase
      .from("cabeceraoc")
      .update({ iniciocargue: colombiaTime })
      .eq("id", orderId)

    console.log("[v0] updateOrderInitioCargue: Update response - data:", updateData, "error:", updateError)

    if (updateError) {
      console.error("[v0] updateOrderInitioCargue: Error updating iniciocargue:", updateError)
      return { success: false, message: "Error al registrar hora de inicio" }
    }

    console.log("[v0] updateOrderInitioCargue: Iniciocargue updated successfully")

    return { success: true, message: "Hora de inicio registrada" }
  } catch (error) {
    console.error("[v0] updateOrderInitioCargue: Exception occurred:", error)
    return { success: false, message: "Error inesperado" }
  }
}

export async function closeOrderWithInvoice(
  idpedido: number,
  factura: string,
  unitsReceived: { transid: number; unidadesRecibidas: number }[],
) {
  const supabase = await createClient()
  try {
    // Get Colombia date
    const colombiaDate = await getColombiaDate()

    // Update pedidosdetalle for each product line
    for (const item of unitsReceived) {
      const { error: detailError } = await supabase
        .from("pedidosdetalle")
        .update({
          unidadescargadas: item.unidadesRecibidas,
          estado: "entregado",
        })
        .eq("transid", item.transid)

      if (detailError) {
        console.error("[v0] Error updating pedidosdetalle:", detailError)
        return {
          success: false,
          message: `Error al actualizar producto: ${detailError.message}`,
        }
      }
    }

    // Update pedidoscabecera
    const { error: headerError } = await supabase
      .from("pedidoscabecera")
      .update({
        ocargue: factura,
        factura: factura,
        fechadeentrega: colombiaDate,
      })
      .eq("idpedido", idpedido)

    if (headerError) {
      console.error("[v0] Error updating pedidoscabecera:", headerError)
      return {
        success: false,
        message: `Error al actualizar cabecera: ${headerError.message}`,
      }
    }

    return {
      success: true,
      message: "Cierre con factura registrado exitosamente",
    }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return {
      success: false,
      message: "Error inesperado al cerrar con factura",
    }
  }
}

export async function updateLoadOrder(orderId: number, data: Record<string, any>) {
  const supabase = await createClient()
  try {
    // Format fechacargue if it exists in the data
    if (data.fechacargue) {
      data.fechacargue = await dateInputToColombiaDate(data.fechacargue)
    }

    const { error } = await supabase.from("cabeceraoc").update(data).eq("id", orderId)

    if (error) {
      console.error("Error updating load order in cabeceraoc:", error)
      return { success: false, message: error.message }
    }

    return { success: true, message: "Orden actualizada exitosamente" }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { success: false, message: "Error inesperado al actualizar orden de cargue" }
  }
}
