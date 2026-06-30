"use server"

import { createClient } from "@/lib/supabase-client"
import { generateAndUploadProductionEntryPDF } from "@/lib/pdf-actions"
import { getCurrentEmpresaIdForInsert, getCurrentUsuarioForInsert } from "@/lib/user-context"

export async function getQRRegistrationData() {
  const supabase = await createClient()

  try {
    // Fetch locations (codigo)
    const { data: locations, error: locationsError } = await supabase
      .from("locations")
      .select("id, codigo, bodega")
      .eq("activo", true)
      .order("codigo", { ascending: true })

    if (locationsError) throw locationsError

    // Fetch bodegas (almacenes)
    const { data: bodegas, error: bodegasError } = await supabase
      .from("bodegas")
      .select("idbodega, nombrebodega")
      .eq("activo", true)
      .order("nombrebodega", { ascending: true })

    if (bodegasError) throw bodegasError

    // Fetch productos
    const { data: productos, error: productosError } = await supabase
      .from("productos")
      .select("id, nombre, codigo, vidautildias")
      .eq("activo", true)
      .order("nombre", { ascending: true })

    if (productosError) throw productosError

    return {
      success: true,
      locations: locations || [],
      bodegas: bodegas || [],
      productos: productos || [],
    }
  } catch (error) {
    console.error("Error fetching QR registration data:", error)
    return {
      success: false,
      error: "Failed to fetch data",
      locations: [],
      bodegas: [],
      productos: [],
    }
  }
}

export async function getBodegaByLocation(locationCodigo: string) {
  const supabase = await createClient()

  try {
    // Get the bodega ID from the location
    const { data: location, error: locationError } = await supabase
      .from("locations")
      .select("bodega")
      .eq("codigo", locationCodigo)
      .eq("activo", true)
      .single()

    if (locationError) throw locationError

    if (!location || !location.bodega) {
      return { success: false, bodega: null }
    }

    // Get the bodega name
    const { data: bodega, error: bodegaError } = await supabase
      .from("bodegas")
      .select("nombrebodega")
      .eq("idbodega", location.bodega)
      .single()

    if (bodegaError) throw bodegaError

    return { success: true, bodega: bodega?.nombrebodega || null }
  } catch (error) {
    console.error("Error fetching bodega by location:", error)
    return { success: false, bodega: null }
  }
}

export async function checkQRInUse(qrId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase.from("qrestibacabecera").select("id, idproducto").eq("id", qrId).single()

    if (error) {
      // If not found, QR is available
      if (error.code === "PGRST116") {
        return { success: true, inUse: false }
      }
      throw error
    }

    // Check if idproducto is not null or empty
    const isInUse = data && data.idproducto != null && data.idproducto !== ""

    return {
      success: true,
      inUse: isInUse,
      data: data,
    }
  } catch (error) {
    console.error("Error checking QR in use:", error)
    return {
      success: false,
      error: "Error al verificar el código QR",
      inUse: false,
    }
  }
}

export async function savePalletRegistration(data: {
  id: string
  idproducto: number
  nombreproducto: string
  fecha: string
  hora: string
  operador: string
  semana: number
  bodega: string
  lotes: Array<{
    lote: string
    cantidad: string
  }>
  codproducto: string
  localizacion: string
}) {
  const supabase = await createClient()

  try {
    const qrCheck = await checkQRInUse(data.id)

    if (!qrCheck.success) {
      return {
        success: false,
        error: qrCheck.error || "Error al verificar el código QR",
      }
    }

    if (qrCheck.inUse) {
      return {
        success: false,
        error: "Este código QR ya está en uso y no puede ser sobrescrito",
      }
    }

    const { data: productoData, error: productoError } = await supabase
      .from("productos")
      .select("vidautildias")
      .eq("id", data.idproducto)
      .single()

    if (productoError) {
      console.error("Error fetching product vidautildias:", productoError)
      throw productoError
    }

    let fechaVencimiento: string | null = null
    if (productoData && productoData.vidautildias) {
      const today = new Date()
      today.setDate(today.getDate() + productoData.vidautildias)
      fechaVencimiento = today.toISOString().split("T")[0] // Format: YYYY-MM-DD
    }

    const empresaId = await getCurrentEmpresaIdForInsert()

    const { error: cabeceraError } = await supabase
      .from("qrestibacabecera")
      .update({
        idempresa: empresaId,
        idproducto: data.idproducto,
        nombreproducto: data.nombreproducto,
        fecha: data.fecha,
        hora: data.hora,
        operador: data.operador,
        semana: data.semana,
        bodega: data.bodega,
      })
      .eq("id", data.id)

    if (cabeceraError) {
      console.error("Error updating qrestibacabecera:", cabeceraError)
      throw cabeceraError
    }

    const { data: lastRecords, error: lastIdError } = await supabase
      .from("qrestibadetalle")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)

    let nextId = 1
    if (!lastIdError && lastRecords && lastRecords.length > 0) {
      nextId = lastRecords[0].id + 1
    }

    const detalleRecords = data.lotes.map((lote, index) => ({
      id: nextId + index,
      idqr: data.id,
      codproducto: data.codproducto,
      nombreproducto: data.nombreproducto,
      lote: lote.lote,
      cantidad: Number.parseFloat(lote.cantidad),
      location: data.localizacion,
      fechavenc: fechaVencimiento,
      tipomov: "entrada",
    }))

    const { error: detalleError } = await supabase.from("qrestibadetalle").insert(detalleRecords)

    if (detalleError) {
      console.error("Error inserting qrestibadetalle:", detalleError)
      throw detalleError
    }

    const productionData = {
      fecha: data.fecha,
      hora: data.hora,
      products: data.lotes.map((lote) => ({
        producto: data.nombreproducto,
        codigo_producto: data.codproducto,
        lote: lote.lote,
        cantidad: Number.parseFloat(lote.cantidad),
        observaciones: null,
        fechavencimiento: fechaVencimiento,
        fechaproduccion: data.fecha,
      })),
      totalLineas: data.lotes.length,
    }

    const pdfResult = await generateAndUploadProductionEntryPDF(productionData)

    if (!pdfResult.success) {
      console.error("Error generating PDF:", pdfResult.error)
      throw new Error("Error al generar el PDF")
    }

    const pdfUrl = pdfResult.url || ""

    const { data: lastInvtransRecords, error: lastInvtransError } = await supabase
      .from("invtrans")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)

    let nextInvtransId = 1
    if (!lastInvtransError && lastInvtransRecords && lastInvtransRecords.length > 0) {
      nextInvtransId = lastInvtransRecords[0].id + 1
    }

    const usuario = await getCurrentUsuarioForInsert()

    const invtransRecords = data.lotes.map((lote, index) => ({
      id: nextInvtransId + index,
      idempresa: empresaId,
      idproducto: data.idproducto,
      nombreproducto: data.nombreproducto,
      lote: lote.lote,
      location: data.localizacion,
      cantidad: Number.parseFloat(lote.cantidad),
      tipomov: "Salida",
      status: null,
      origen: "ingreso producción qr",
      creado: new Date().toISOString(),
      creadopor: usuario,
      codproducto: data.codproducto,
      fechaprod: data.fecha,
      almacen: data.bodega,
      pdf: pdfUrl,
      fechavencimiento: fechaVencimiento,
    }))

    const { error: invtransError } = await supabase.from("invtrans").insert(invtransRecords)

    if (invtransError) {
      console.error("Error inserting invtrans:", invtransError)
      throw invtransError
    }

    return {
      success: true,
      message: "Estiba registrada correctamente",
      pdfUrl: pdfUrl,
    }
  } catch (error) {
    console.error("Error saving pallet registration:", error)
    return {
      success: false,
      error: "Error al registrar la estiba",
    }
  }
}

export async function getPalletDataByQR(qrId: string) {
  const supabase = await createClient()

  try {
    // Fetch cabecera data
    const { data: cabecera, error: cabeceraError } = await supabase
      .from("qrestibacabecera")
      .select("*")
      .eq("id", qrId)
      .single()

    if (cabeceraError) {
      console.error("Error fetching qrestibacabecera:", cabeceraError)
      return {
        success: false,
        error: "No se encontró información para este código QR",
        data: null,
      }
    }

    // Fetch detalle data
    const { data: detalle, error: detalleError } = await supabase
      .from("qrestibadetalle")
      .select("*")
      .eq("idqr", qrId)
      .order("id", { ascending: true })

    if (detalleError) {
      console.error("Error fetching qrestibadetalle:", detalleError)
      return {
        success: false,
        error: "Error al cargar los detalles de la estiba",
        data: null,
      }
    }

    return {
      success: true,
      data: {
        cabecera,
        detalle: detalle || [],
      },
    }
  } catch (error) {
    console.error("Error fetching pallet data:", error)
    return {
      success: false,
      error: "Error al buscar la información de la estiba",
      data: null,
    }
  }
}

export async function getInventoryByPallet(filters: {
  producto?: string
  lote?: string
  location?: string
}) {
  const supabase = await createClient()

  try {
    let query = supabase
      .from("view_inventario_por_estiba")
      .select("idqr, codproducto, nombreproducto, lote, location, stock_total")
      .order("idqr", { ascending: true })

    // Apply filters
    if (filters.producto && filters.producto !== "all") {
      query = query.eq("nombreproducto", filters.producto)
    }

    if (filters.lote && filters.lote !== "all") {
      query = query.eq("lote", filters.lote)
    }

    if (filters.location && filters.location !== "all") {
      query = query.eq("location", filters.location)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching inventory by pallet:", error)
      throw error
    }

    return {
      success: true,
      data: data || [],
    }
  } catch (error) {
    console.error("Error in getInventoryByPallet:", error)
    return {
      success: false,
      error: "Error al obtener el inventario por estiba",
      data: [],
    }
  }
}

export async function getProductosForPalletFilter() {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from("view_inventario_por_estiba")
      .select("nombreproducto")
      .order("nombreproducto", { ascending: true })

    if (error) throw error

    // Get unique product names
    const uniqueProducts = Array.from(new Set(data?.map((item) => item.nombreproducto) || []))

    return uniqueProducts.map((nombre) => ({ nombre }))
  } catch (error) {
    console.error("Error fetching productos for filter:", error)
    return []
  }
}

export async function getLotesForPalletFilter() {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from("view_inventario_por_estiba")
      .select("lote")
      .order("lote", { ascending: true })

    if (error) throw error

    // Get unique lotes
    const uniqueLotes = Array.from(new Set(data?.map((item) => item.lote) || []))

    return uniqueLotes.map((lote) => ({ lote }))
  } catch (error) {
    console.error("Error fetching lotes for filter:", error)
    return []
  }
}

export async function getLocationsForPalletFilter() {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from("view_inventario_por_estiba")
      .select("location")
      .order("location", { ascending: true })

    if (error) throw error

    // Get unique locations
    const uniqueLocations = Array.from(new Set(data?.map((item) => item.location) || []))

    return uniqueLocations.map((location) => ({ location }))
  } catch (error) {
    console.error("Error fetching locations for filter:", error)
    return []
  }
}

/**
 * Traslado ENTRE ESTIBAS (por código QR / campo qrestiba).
 *
 * Funciona igual que el traslado entre localizaciones, pero el movimiento se
 * controla por el campo `qrestiba`:
 *  - SALIDA de la estiba origen (qrestiba = originQrId)
 *  - ENTRADA en la estiba destino (qrestiba = destQrId)
 *
 * Además de invtrans, se registran los movimientos en `qrestibadetalle` para
 * que la vista `view_inventario_por_estiba` actualice los saldos de cada
 * estiba. Devuelve los payloads de las etiquetas a imprimir:
 *  - Etiqueta de la estiba DESTINO con su nuevo saldo (conserva su QR).
 *  - Etiqueta de la estiba ORIGEN con el remanente, solo si quedó > 0
 *    (conserva su QR original).
 */
export interface PalletTransferLabel {
  idqr: number
  reimpresion: true
  producto: number | null
  bodega: number | null
  localizacion: number | null
  lote: number | string
  bultos_procesados: number
  tipo_empaque: "Estiba"
}

export async function registerPalletTransfer(params: {
  originQrId: number
  destQrId: number
  codproducto: string
  nombreproducto: string
  lote: string
  cantidad: number
}): Promise<{ success: boolean; message: string; labels: PalletTransferLabel[] }> {
  const supabase = await createClient()

  try {
    const { originQrId, destQrId, codproducto, nombreproducto, lote, cantidad } = params

    if (!originQrId || !destQrId) {
      return { success: false, message: "Debe indicar la estiba origen y destino", labels: [] }
    }
    if (originQrId === destQrId) {
      return { success: false, message: "La estiba origen y destino deben ser diferentes", labels: [] }
    }
    if (!cantidad || cantidad <= 0) {
      return { success: false, message: "La cantidad debe ser mayor a 0", labels: [] }
    }

    // --- Validar saldo en la estiba origen para este producto + lote ---
    const { data: originRow, error: originErr } = await supabase
      .from("view_inventario_por_estiba")
      .select("idqr, location, nombreproducto, lote, stock_total")
      .eq("idqr", originQrId)
      .eq("nombreproducto", nombreproducto)
      .eq("lote", lote)
      .maybeSingle()

    if (originErr) {
      console.error("[v0] Error fetching origin pallet:", originErr)
      return { success: false, message: "Error al validar la estiba origen", labels: [] }
    }

    const originStock = originRow?.stock_total || 0
    const originLocation = originRow?.location || ""

    if (originStock <= 0) {
      return { success: false, message: "La estiba origen no tiene inventario para este producto/lote", labels: [] }
    }
    if (cantidad > originStock) {
      return {
        success: false,
        message: `No puede trasladar más del disponible en la estiba origen (${originStock})`,
        labels: [],
      }
    }

    // --- Datos de la estiba destino (ubicación + saldo existente del producto/lote) ---
    const { data: destAll, error: destErr } = await supabase
      .from("view_inventario_por_estiba")
      .select("idqr, location, nombreproducto, lote, stock_total")
      .eq("idqr", destQrId)

    if (destErr) {
      console.error("[v0] Error fetching destination pallet:", destErr)
      return { success: false, message: "Error al validar la estiba destino", labels: [] }
    }
    if (!destAll || destAll.length === 0) {
      return { success: false, message: "No se encontró la estiba destino (QR sin inventario asociado)", labels: [] }
    }

    const destLocation = destAll[0].location
    const destExistingStock =
      destAll.find((r) => r.nombreproducto === nombreproducto && r.lote === lote)?.stock_total || 0

    const empresaId = await getCurrentEmpresaIdForInsert()
    const usuario = await getCurrentUsuarioForInsert()
    const now = new Date().toISOString()

    // id del producto (para invtrans.idproducto)
    const { data: prod } = await supabase.from("productos").select("id").eq("codigo", codproducto).maybeSingle()
    const idproducto = prod?.id ?? null

    // --- invtrans: SALIDA (origen) + ENTRADA (destino), control por qrestiba ---
    const { data: lastInv, error: lastInvErr } = await supabase
      .from("invtrans")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastInvErr) {
      console.error("[v0] Error fetching last invtrans id:", lastInvErr)
      return { success: false, message: "Error al generar ID de movimiento", labels: [] }
    }

    const nextId = (lastInv?.id || 0) + 1

    const invRows = [
      {
        id: nextId,
        idempresa: empresaId,
        codproducto,
        idproducto,
        nombreproducto,
        lote,
        location: originLocation,
        almacen: originLocation,
        cantidad,
        tipomov: "Salida",
        status: "aprobado",
        origen: "traslado entre estibas",
        qrestiba: originQrId,
        creado: now,
        creadopor: usuario,
      },
      {
        id: nextId + 1,
        idempresa: empresaId,
        codproducto,
        idproducto,
        nombreproducto,
        lote,
        location: destLocation,
        almacen: destLocation,
        cantidad,
        tipomov: "Entrada",
        status: "aprobado",
        origen: "traslado entre estibas",
        qrestiba: destQrId,
        creado: now,
        creadopor: usuario,
      },
    ]

    const { error: invInsertErr } = await supabase.from("invtrans").insert(invRows)
    if (invInsertErr) {
      console.error("[v0] Error inserting invtrans for pallet transfer:", invInsertErr)
      return { success: false, message: "Error al registrar el movimiento: " + invInsertErr.message, labels: [] }
    }

    // --- qrestibadetalle: salida de la estiba origen + entrada a la destino ---
    // Esto actualiza los saldos de cada estiba en view_inventario_por_estiba.
    const detalleRows = [
      {
        idqr: originQrId,
        codproducto,
        nombreproducto,
        lote,
        cantidad,
        location: originLocation,
        tipomov: "salida",
      },
      {
        idqr: destQrId,
        codproducto,
        nombreproducto,
        lote,
        cantidad,
        location: destLocation,
        tipomov: "entrada",
      },
    ]

    const { error: detInsertErr } = await supabase.from("qrestibadetalle").insert(detalleRows)
    if (detInsertErr) {
      console.error("[v0] Error inserting qrestibadetalle for pallet transfer:", detInsertErr)
      return { success: false, message: "Error al actualizar el saldo de las estibas: " + detInsertErr.message, labels: [] }
    }

    // --- Construir etiquetas (resolver location código -> id + bodega) ---
    const resolveLoc = async (codigo: string) => {
      const { data } = await supabase
        .from("locations")
        .select("id, bodega")
        .eq("codigo", codigo)
        .eq("activo", true)
        .maybeSingle()
      return data
    }

    const loteNum = Number.parseInt(lote)
    const loteValue = Number.isNaN(loteNum) ? lote : loteNum

    const labels: PalletTransferLabel[] = []

    // Etiqueta de la estiba DESTINO con el nuevo saldo del producto/lote.
    const destLocRow = await resolveLoc(destLocation)
    labels.push({
      idqr: destQrId,
      reimpresion: true,
      producto: idproducto,
      bodega: destLocRow?.bodega ?? null,
      localizacion: destLocRow?.id ?? null,
      lote: loteValue,
      bultos_procesados: destExistingStock + cantidad,
      tipo_empaque: "Estiba",
    })

    // Etiqueta de la estiba ORIGEN con el remanente (solo si quedó algo).
    const remnant = originStock - cantidad
    if (remnant > 0) {
      const originLocRow = await resolveLoc(originLocation)
      labels.push({
        idqr: originQrId,
        reimpresion: true,
        producto: idproducto,
        bodega: originLocRow?.bodega ?? null,
        localizacion: originLocRow?.id ?? null,
        lote: loteValue,
        bultos_procesados: remnant,
        tipo_empaque: "Estiba",
      })
    }

    return { success: true, message: "Traslado entre estibas registrado exitosamente", labels }
  } catch (error) {
    console.error("[v0] Unexpected error in registerPalletTransfer:", error)
    return { success: false, message: "Error inesperado al registrar el traslado entre estibas", labels: [] }
  }
}
