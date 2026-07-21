"use server"

import { createClient } from "@/lib/supabase-client"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import { getColombiaDateTime } from "@/lib/inventory-actions"
import {
  getCarguDescarguePersonnel as _getCarguDescarguePersonnel,
  assignPersonnelToOrder as _assignPersonnelToOrder,
  savePickingPhotos as _savePickingPhotos,
} from "@/lib/picking-actions"

export interface PendingLoadOrder {
  id: number
  ordendecargue: string
  cliente: string
  placa: string
  conductor: string
  fechaorden?: string
  fechacargue?: string
  iniciocargue?: string
  /**
   * Personal asignado a la orden. Marca el paso intermedio del nuevo
   * flujo (PDF -> Personal -> Fotos) y se usa para habilitar el
   * boton "Cargar fotos" solo cuando ya hay personal asignado.
   */
  auxiliares?: string | null
  /**
   * Hora en que la orden quedo cerrada. En el nuevo flujo se escribe
   * al subir las fotos (no al asignar personal como antes), por lo
   * que la presencia de este campo indica orden completada.
   */
  fincargue?: string | null
  tipooperacion?: string
  /**
   * Solo para órdenes de DISTRIBUCIÓN: indica si esa distribución se factura.
   * Se decide en Packing (a veces el conductor va solo, sin auxiliares, y no hay
   * servicio de distribución que cobrar). `false` = NO se factura (solo el cargue);
   * `null`/`true` = SÍ se factura (por defecto encendido).
   */
  facturar?: boolean | null
}

export interface PackingItem {
  id: number
  producto: string
  cantidad: number
}

export type { PersonnelEmployee } from "@/lib/picking-actions"

export async function getPendingUnloadOrders(selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  const empresaId = selectedEmpresaId || await getCurrentEmpresaIdForInsert()

  console.log("[v0] getPendingUnloadOrders: empresaId =", empresaId)

  const { data, error } = await supabase
    .from("cabeceraoc")
    .select(
      "id, ordendecargue, placa, conductor, fechaorden, fechacargue, iniciocargue, tipooperacion, auxiliares, fincargue",
    )
    .eq("idempresa", empresaId) // 1) Filter by empresa session
    .eq("tipooperacion", "Descargue") // 2) Filter only by Descargue (Distribucion is handled separately)
    .is("fincargue", null) // 3) Filter by fincargue NULL or empty
    .order("ordendecargue", { ascending: false })

  console.log("[v0] getPendingUnloadOrders: Found", data?.length || 0, "orders")
  console.log("[v0] getPendingUnloadOrders: Sample data:", data?.slice(0, 2))

  if (error) {
    console.error("[v0] Error fetching pending unload orders:", error)
    return { success: false, data: [], message: error.message }
  }

  const ordersWithClients = await Promise.all(
    (data || []).map(async (order) => {
      const { data: detailData } = await supabase
        .from("detalleoc")
        .select("cliente")
        .eq("idorden", order.id)
        .limit(1)
        .single()

      return {
        ...order,
        cliente: detailData?.cliente || "Sin cliente",
      }
    }),
  )

  return { success: true, data: ordersWithClients, message: "Órdenes de descargue cargadas exitosamente" }
}

export async function getDistributionOrders(selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  const empresaId = selectedEmpresaId || await getCurrentEmpresaIdForInsert()

  const { data, error } = await supabase
    .from("cabeceraoc")
    .select(
      "id, ordendecargue, placa, conductor, fechaorden, fechacargue, iniciocargue, auxiliares, fincargue, tipooperacion, facturar",
    )
    .eq("idempresa", empresaId) // 1) Filter by empresa session
    .eq("tipooperacion", "Distribucion") // 2) Filter by Distribucion
    .is("fincargue", null) // 3) Filter by fincargue NULL or empty
    .order("ordendecargue", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching distribution orders:", error)
    return { success: false, data: [], message: error.message }
  }

  const ordersWithClients = await Promise.all(
    (data || []).map(async (order) => {
      const { data: detailData } = await supabase
        .from("detalleoc")
        .select("cliente")
        .eq("idorden", order.id)
        .limit(1)
        .single()

      return {
        ...order,
        cliente: detailData?.cliente || "Sin cliente",
      }
    }),
  )

  return { success: true, data: ordersWithClients, message: "Órdenes de distribución cargadas exitosamente" }
}

// Marca si una orden se factura o no. Lo deciden la operación:
//   · CARGUE en Picking → se desmarca si el personal de carga NO es de LIP.
//   · DISTRIBUCIÓN en Packing → se desmarca si el conductor va solo (sin auxiliares).
// `false` → la orden no aparece en Gestión de Facturas (no se cobra).
export async function setFacturarOrden(orderId: number, facturar: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from("cabeceraoc").update({ facturar }).eq("id", orderId)
  if (error) {
    console.error("[v0] Error updating facturar:", error)
    return { success: false, message: error.message }
  }
  return { success: true, message: facturar ? "Orden marcada para facturar" : "Orden excluida de facturación" }
}

export async function getPackingItems(ordendecargue: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("detalleoc")
    .select("id, producto, cantidad")
    .eq("numeroorden", ordendecargue)
    .order("producto", { ascending: true })

  if (error) {
    console.error("[v0] Error fetching packing items:", error)
    return { success: false, data: [], message: error.message }
  }

  return { success: true, data: data || [], message: "Productos cargados exitosamente" }
}

export async function confirmPacking(orderId: number) {
  console.log("[v0] Confirming packing for order:", orderId)

  // No database operations - just return success to update local state
  return { success: true, message: "Packing confirmado exitosamente" }
}

export async function generatePackingPDF(
  orderId: number,
  ordenDescargue: string,
  cliente: string,
  placa: string,
  conductor?: string | null,
) {
  try {
    if (!ordenDescargue || !cliente || !placa) {
      console.error("[v0] Missing required parameters for PDF generation:", {
        ordenDescargue,
        cliente,
        placa,
        conductor,
      })
      return { success: false, error: "Faltan parámetros requeridos para generar el PDF" }
    }

    console.log("[v0] Starting packing PDF generation for order:", ordenDescargue)

    const supabase = await createClient()
    const supabaseAdmin = await getSupabaseAdmin()

    // Get products from detalleoc
    const productsResult = await getPackingItems(ordenDescargue)
    if (!productsResult.success) {
      return { success: false, error: "Error al cargar los productos" }
    }

    // Dynamic import to avoid build issues with fflate/Worker
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")

    const doc = new jsPDF({ format: "letter" }) as any

    // Header
    doc.setFontSize(18)
    doc.setFont(undefined, "bold")
    doc.text("ORDEN DE PACKING", 105, 20, { align: "center" })

    // Date and time
    const colombiaTime = await getColombiaDateTime()
    // getColombiaDateTime (inventory-actions) devuelve string; se conserva el
    // comportamiento actual (cast type-only, runtime idéntico).
    const fechaHora = (colombiaTime as any).toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })

    doc.setFontSize(10)
    doc.setFont(undefined, "normal")
    doc.text(`Fecha y Hora: ${fechaHora}`, 15, 35)

    // Order info section
    let y = 45
    doc.setFillColor(44, 82, 130)
    doc.setTextColor(255, 255, 255)
    doc.rect(15, y, 180, 30, "F")

    doc.setFontSize(10)
    doc.setFont(undefined, "bold")
    doc.text("Orden de Descargue:", 20, y + 7)
    doc.setFont(undefined, "normal")
    doc.text(String(ordenDescargue || ""), 80, y + 7)

    doc.setFont(undefined, "bold")
    doc.text("Cliente:", 20, y + 14)
    doc.setFont(undefined, "normal")
    doc.text(String(cliente || ""), 80, y + 14)

    doc.setFont(undefined, "bold")
    doc.text("Placa:", 20, y + 21)
    doc.setFont(undefined, "normal")
    doc.text(String(placa || ""), 80, y + 21)

    doc.setFont(undefined, "bold")
    doc.text("Conductor:", 110, y + 21)
    doc.setFont(undefined, "normal")
    doc.text(String(conductor || ""), 145, y + 21)

    // Products table
    y = 80
    doc.setTextColor(0, 0, 0)

    const tableData = productsResult.data.map((product: any) => [
      String(product.producto || ""),
      String(product.cantidad || 0),
    ])

    autoTable(doc, {
      startY: y,
      head: [["Producto", "Cantidad"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [44, 82, 130],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 10,
      },
      bodyStyles: {
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 140 },
        1: { cellWidth: 40, halign: "center" },
      },
      margin: { left: 15, right: 15 },
    })

    // Footer
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(7)
    doc.text("Generado por LipGo V3.0", 105, 270, { align: "center" })

    console.log("[v0] Packing PDF generated, creating blob...")

    // Generate PDF blob
    const pdfBlob = doc.output("blob")
    const fileName = `packing_${ordenDescargue}_${Date.now()}.pdf`

    console.log("[v0] Uploading PDF to storage...")

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("archivos")
      .upload(`doccargue/${fileName}`, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      })

    if (uploadError) {
      console.error("[v0] Error uploading packing PDF:", uploadError)
      return { success: false, error: uploadError.message }
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("archivos").getPublicUrl(`doccargue/${fileName}`)

    console.log("[v0] Packing PDF uploaded successfully:", publicUrl)

    // Update cabeceraoc with PDF URL
    const { error: updateError } = await supabase.from("cabeceraoc").update({ doccargue: publicUrl }).eq("id", orderId)

    if (updateError) {
      console.error("[v0] Error updating cabeceraoc with PDF URL:", updateError)
      return { success: false, error: updateError.message }
    }

    return { success: true, pdfUrl: publicUrl }
  } catch (error) {
    console.error("[v0] Error generating packing PDF:", error)
    return { success: false, error: error instanceof Error ? error.message : "Error desconocido" }
  }
}

export async function getCarguDescarguePersonnel(empresaId?: number | null) {
  return await _getCarguDescarguePersonnel(empresaId)
}

export async function assignPersonnelToOrder(
  orderId: number,
  orderNumber: string,
  selectedPersonnel: number[],
  password: string,
  observaciones: string,
) {
  return await (_assignPersonnelToOrder as any)(orderId, orderNumber, selectedPersonnel, password, observaciones)
}

export async function savePickingPhotos(orderId: number, photoUrls: string[]) {
  return await _savePickingPhotos(orderId, photoUrls)
}
