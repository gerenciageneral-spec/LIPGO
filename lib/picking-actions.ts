"use server"

import { createClient } from "@/lib/supabase-client"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getColombiaDateTime, getColombiaTime } from "@/lib/date-utils"
import { getCurrentEmpresaIdForInsert, getCurrentEmpresaId } from "@/lib/company-filter"

export interface PendingLoadOrder {
  id: number
  ordendecargue: string
  cliente: string
  placa: string
  conductor: string
  fechaorden?: string
  fechacargue?: string
  iniciocargue?: string
  fotospicking?: string | null
  doccargue?: string | null // Added doccargue field to check if PDF already generated
  horapicking?: string | null // Added horapicking field to check if picking already done
  /**
   * Personal asignado a la orden (string CSV con los nombres
   * concatenados). Lo usamos como "marcador" del paso de asignacion
   * en la nueva secuencia: PDF -> Personal -> Fotos. Si esta vacio o
   * null significa que aun no se asigno personal.
   */
  auxiliares?: string | null
  /**
   * Hora en que se cerro la orden. Antes se escribia al asignar
   * personal pero ahora la responsabilidad es del cargue de fotos
   * (ultimo paso del nuevo flujo). Lo exponemos para poder deshabilitar
   * acciones cuando la orden ya esta cerrada.
   */
  fincargue?: string | null
  /**
   * ¿Se factura este cargue? Se decide en Picking. Encendido por defecto
   * (`null`/`true`); se DESMARCA cuando el personal que carga NO es de LIP (el
   * vehículo trae los suyos) → `false` = ese cargue no aparece en Gestión de Facturas.
   */
  facturar?: boolean | null
}

export interface PersonnelEmployee {
  id: number
  nombreempleado: string
}

export interface PickingItem {
  id: number
  nombreproducto: string
  lote: string
  location: string
  cantidad: number
  stock_disp?: number
  stock_restante?: number
  status?: string
  codproducto?: string
  /**
   * true cuando ese producto/lote/location tiene existencias en estibas con QR.
   * Solo alimenta un AVISO en la UI: descontar sin escanear deja la salida sin
   * `qrestiba` y el stock intacto en la estiba, pero no se impide.
   */
  tieneStockQR?: boolean
}

export interface QRPalletInfo {
  idqr: number
  codproducto: string
  nombreproducto: string
  lote: string
  location: string
  stock_total: number
}

// ---------------------------------------------------------------------------
// Inventario en estibas con QR
// ---------------------------------------------------------------------------

/** Clave normalizada producto|lote|location para cruzar contra las estibas. */
function claveQR(cod: unknown, lote: unknown, loc: unknown): string {
  return [cod, lote, loc]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .join("|")
}

/**
 * Devuelve las claves producto|lote|location que TIENEN stock en estibas
 * identificadas con QR.
 *
 * Para que sirve: si el stock de una linea de picking vive en estibas con QR y
 * se descuenta SIN escanear, la salida queda sin `qrestiba` y el inventario por
 * estiba no se mueve — o sea, la estiba conserva un stock que fisicamente ya
 * salio. Ese descuadre es el que este chequeo evita.
 *
 * FALLA-ABIERTO a proposito: si la consulta a la vista falla, se devuelve un
 * set vacio y el picking NO se bloquea. Bloquear toda la operacion por un fallo
 * de lectura seria peor que el descuadre que se intenta prevenir; queda el log
 * para diagnosticarlo.
 */
async function clavesConStockQR(
  supabase: any,
  filas: { codproducto?: string | null; lote?: string | null; location?: string | null }[],
): Promise<Set<string>> {
  const codigos = Array.from(
    new Set(filas.map((f) => String(f.codproducto ?? "").trim()).filter(Boolean)),
  )
  if (codigos.length === 0) return new Set()

  const { data, error } = await supabase
    .from("view_inventario_por_estiba")
    .select("codproducto, lote, location, stock_total")
    .in("codproducto", codigos)

  if (error) {
    console.error("[v0] Error consultando inventario por estiba:", error)
    return new Set()
  }

  const claves = new Set<string>()
  for (const r of data || []) {
    if ((Number(r.stock_total) || 0) <= 0) continue
    claves.add(claveQR(r.codproducto, r.lote, r.location))
  }
  return claves
}

export async function searchPalletByQR(qrCode: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("view_inventario_por_estiba")
    .select("codproducto, nombreproducto, lote, location, stock_total")
    .eq("idqr", qrCode)

  if (error) {
    console.error("[v0] Error searching pallet by QR:", error)
    return { success: false, data: null, message: error.message }
  }

  if (!data || data.length === 0) {
    return { success: false, data: null, message: "No se encontró información para este código QR" }
  }

  return {
    success: true,
    data: data.map((item) => ({
      idqr: Number.parseInt(qrCode),
      ...item,
    })),
    message: "Información de estiba encontrada",
  }
}

export async function registerQRPickingMovements(
  qrMovements: Array<{
    idqr: number
    codproducto: string
    nombreproducto: string
    lote: string
    cantidad: number
    location: string
  }>,
) {
  const supabase = await createClient()

  try {
    // Insert records into qrestibadetalle
    const detailRecords = qrMovements.map((movement) => ({
      idqr: movement.idqr,
      codproducto: movement.codproducto,
      nombreproducto: movement.nombreproducto,
      lote: movement.lote,
      cantidad: movement.cantidad,
      location: movement.location,
      tipomov: "salida",
    }))

    const { error } = await supabase.from("qrestibadetalle").insert(detailRecords)

    if (error) {
      console.error("[v0] Error registering QR picking movements:", error)
      return { success: false, message: error.message }
    }

    console.log("[v0] QR picking movements registered successfully")
    return { success: true, message: "Movimientos de QR registrados exitosamente" }
  } catch (error: any) {
    console.error("[v0] Error in registerQRPickingMovements:", error)
    return { success: false, message: error.message || "Error al registrar movimientos de QR" }
  }
}

export async function getPendingLoadOrders(selectedEmpresaId?: number | null) {
  const supabase = await createClient()

  const empresaId = selectedEmpresaId || await getCurrentEmpresaId()

  if (!empresaId) {
    console.error("[v0] No empresa ID found for current user")
    return { success: false, data: [], message: "No se encontró información de empresa" }
  }

  const { data, error } = await supabase
    .from("cabeceraoc")
    .select(
      "id, ordendecargue, placa, conductor, fechaorden, fechacargue, iniciocargue, fotospicking, doccargue, horapicking, auxiliares, fincargue, facturar",
    )
    .eq("idempresa", empresaId) // Filter by empresa from session
    .eq("tipooperacion", "Cargue") // Only show Cargue operations
    .is("fincargue", null) // Solo pendientes; al finalizar el proceso desaparece (igual que todas)
    .not("horalote", "is", null)
    .order("ordendecargue", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching pending load orders:", error)
    return { success: false, data: [], message: error.message }
  }

  // Get unique clientes from detalleoc for each order
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

  return { success: true, data: ordersWithClients, message: "Órdenes cargadas exitosamente" }
}

export async function getLoadOrderProducts(orderId: number, ordenCargue: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("invtrans")
    .select("nombreproducto, location, lote, cantidad")
    .eq("ocargue", ordenCargue)
    .order("nombreproducto", { ascending: true })

  if (error) {
    console.error("[v0] Error fetching load order products:", error)
    return { success: false, data: [], message: error.message }
  }

  return { success: true, data: data || [], message: "Productos cargados exitosamente" }
}

export async function getCarguDescarguePersonnel(empresaId?: number | null) {
  const supabase = await createClient()

  let finalEmpresaId = empresaId
  if (!finalEmpresaId) {
    finalEmpresaId = await getCurrentEmpresaId()
  }

  const colombiaDate = await getColombiaDateTime()
  const todayDate = colombiaDate.toLocaleDateString("en-CA") // Format: YYYY-MM-DD

  // Personal disponible para Picking / Packing del dia.
  //
  // Fuente directa: `registroasistencia`. Anteriormente se leia de
  // `asignacionpersonal`, pero en la practica esa tabla no se esta
  // poblando para todos los flujos (lo que dejaba a Picking sin
  // personal disponible). `registroasistencia` SI se escribe siempre
  // que el supervisor guarda turnos en "Tabla Asistencia / Registro
  // de Asistencia".
  //
  // Filtros:
  //   1) `fecha = hoy (Bogota)`.
  //   2) `puesto IN (...)` con los puestos operativos que pueden
  //      apoyar el alistamiento, segun requerimiento de negocio.
  //   3) Se excluyen filas que tienen `asistencia` (codigo de novedad)
  //      porque corresponden a Ausentes; un Ausente no debe aparecer
  //      como personal disponible aun si quedo un `puesto` historico.
  //
  // Mapeo de columnas para mantener el contrato `{ id, nombreempleado }`
  // que el componente Picking ya consume:
  //   - `id`             <- `registroasistencia.id`
  //   - `nombreempleado` <- `registroasistencia.nombre`
  const PUESTOS_PICKING = [
    "Cargue/Descargue",
    "Auxiliar Mixto",
    "Tolva Bulto",
    "Tolva Planchador",
  ]

  let query = supabase
    .from("registroasistencia")
    .select("id, nombre")
    .in("puesto", PUESTOS_PICKING)
    .eq("fecha", todayDate)
    .is("asistencia", null) // Excluye Ausentes con codigo de novedad
    .order("nombre", { ascending: true })

  if (finalEmpresaId) {
    query = query.eq("idempresa", finalEmpresaId)
  }

  const { data, error } = await query

  if (error) {
    console.error("[v0] Error fetching personnel:", error)
    return { success: false, data: [], message: error.message }
  }

  // Adaptamos el shape al contrato esperado por el componente
  // (`nombreempleado` en vez de `nombre`).
  const mapped = (data ?? []).map((r) => ({
    id: r.id,
    nombreempleado: r.nombre,
  }))

  return {
    success: true,
    data: mapped,
    message: "Personal cargado exitosamente",
  }
}

export async function assignPersonnelToOrder(
  orderId: number,
  employeeNames: string[],
  auxiliaresText: string,
  currentUserName: string,
  orderData: PendingLoadOrder,
) {
  const supabase = await createClient()
  const supabaseAdmin = await getSupabaseAdmin()

  // Join employee names with commas
  const auxiliares = employeeNames.join(",")

  // En el nuevo flujo, la asignacion de personal NO cierra la orden.
  // El cierre (fincargue) lo dispara el paso final de cargue de
  // fotos. Aqui solo persistimos el listado de auxiliares para que
  // sirva de "checkpoint" entre PDF -> Personal -> Fotos.
  const { error } = await supabase
    .from("cabeceraoc")
    .update({
      auxiliares,
    })
    .eq("id", orderId)

  if (error) {
    console.error("[v0] Error assigning personnel:", error)
    return { success: false, message: error.message }
  }

  const { data: orderInfo, error: fetchError } = await supabase
    .from("cabeceraoc")
    .select("doccargue, fotospicking")
    .eq("id", orderId)
    .single()

  if (fetchError || !orderInfo?.doccargue) {
    console.error("[v0] Error fetching PDF URL or PDF doesn't exist:", fetchError)
    return { success: true, message: "Personal asignado exitosamente (PDF no actualizado)" }
  }

  try {
    // Dynamic import to avoid build issues with fflate/Worker
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")
    
    const doc = new jsPDF({ format: "letter" }) as any

    // Get products from invtrans
    const { data: products, error: productsError } = await supabase
      .from("invtrans")
      .select("nombreproducto, location, lote, cantidad")
      .eq("ocargue", orderData.ordendecargue)
      .order("nombreproducto", { ascending: true })

    if (productsError) {
      console.error("[v0] Error fetching products for PDF:", productsError)
      return { success: true, message: "Personal asignado exitosamente (PDF no actualizado)" }
    }

    // Header
    doc.setFontSize(18)
    doc.setFont(undefined, "bold")
    doc.text("ORDEN DE PICKING", 105, 20, { align: "center" })

    // Date and time
    const colombiaTime = await getColombiaDateTime()
    const fechaHora = colombiaTime.toLocaleString("es-CO", {
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
    doc.text("Orden de Cargue:", 20, y + 7)
    doc.setFont(undefined, "normal")
    doc.text(String(orderData.ordendecargue || ""), 70, y + 7)

    doc.setFont(undefined, "bold")
    doc.text("Cliente:", 20, y + 14)
    doc.setFont(undefined, "normal")
    doc.text(String(orderData.cliente || ""), 70, y + 14)

    doc.setFont(undefined, "bold")
    doc.text("Placa:", 20, y + 21)
    doc.setFont(undefined, "normal")
    doc.text(String(orderData.placa || ""), 70, y + 21)

    doc.setFont(undefined, "bold")
    doc.text("Conductor:", 110, y + 21)
    doc.setFont(undefined, "normal")
    doc.text(String(orderData.conductor || ""), 145, y + 21)

    // Products table
    y = 80
    doc.setTextColor(0, 0, 0)

    const tableData = (products || []).map((product: any) => [
      String(product.nombreproducto || ""),
      String(product.location || ""),
      String(product.lote || ""),
      String(product.cantidad || 0),
    ])

    autoTable(doc, {
      startY: y,
      head: [["Producto", "Location", "Lote", "Cantidad"]],
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
        0: { cellWidth: 80 },
        1: { cellWidth: 35 },
        2: { cellWidth: 35 },
        3: { cellWidth: 30, halign: "center" },
      },
      margin: { left: 15, right: 15 },
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10

    doc.setFillColor(44, 82, 130)
    doc.setTextColor(255, 255, 255)

    const auxiliaresList = auxiliares.split(",")
    const auxiliaresHeight = 20 + auxiliaresList.length * 5

    doc.rect(15, finalY, 180, auxiliaresHeight, "F")

    doc.setFontSize(10)
    doc.setFont(undefined, "bold")
    doc.text("Auxiliares:", 20, finalY + 7)
    doc.setFont(undefined, "normal")

    auxiliaresList.forEach((aux, index) => {
      doc.text(aux.trim(), 70, finalY + 7 + index * 5)
    })

    doc.setFont(undefined, "bold")
    doc.text("Usuario:", 20, finalY + 12 + auxiliaresList.length * 5)
    doc.setFont(undefined, "normal")
    doc.text(String(currentUserName || ""), 70, finalY + 12 + auxiliaresList.length * 5)

    // Footer on first page
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(7)
    doc.text("Generado por LipGo V3.0", 105, 270, { align: "center" })

    if (orderInfo.fotospicking) {
      try {
        const photoUrls = JSON.parse(orderInfo.fotospicking) as string[]

        if (photoUrls && photoUrls.length > 0) {
          // Add new page for photos
          doc.addPage()

          // Title for photo evidence
          doc.setTextColor(0, 0, 0)
          doc.setFontSize(16)
          doc.setFont(undefined, "bold")
          doc.text("Evidencias fotográficas", 105, 20, { align: "center" })

          // Grid configuration: 4 columns x 5 rows = 20 photos per page
          const cols = 4
          const rows = 5
          const photosPerPage = cols * rows
          const photoWidth = 45 // Width of each photo
          const photoHeight = 45 // Height of each photo
          const marginX = 15
          const marginY = 35
          const gapX = 5
          const gapY = 5

          for (let i = 0; i < photoUrls.length; i++) {
            const pageIndex = Math.floor(i / photosPerPage)
            const photoIndexInPage = i % photosPerPage

            // Add new page if needed (not for first photo page)
            if (photoIndexInPage === 0 && i > 0) {
              doc.addPage()
              doc.setTextColor(0, 0, 0)
              doc.setFontSize(16)
              doc.setFont(undefined, "bold")
              doc.text("Evidencias fotográficas (cont.)", 105, 20, { align: "center" })
            }

            const col = photoIndexInPage % cols
            const row = Math.floor(photoIndexInPage / cols)

            const x = marginX + col * (photoWidth + gapX)
            const y = marginY + row * (photoHeight + gapY)

            try {
              console.log("[v0] Loading image", i + 1, "from URL:", photoUrls[i])
              const base64Image = await urlToBase64(photoUrls[i])
              doc.addImage(base64Image, "JPEG", x, y, photoWidth, photoHeight)
              console.log("[v0] Successfully added image", i + 1, "to PDF")
            } catch (imgError) {
              console.error(`[v0] Error adding image ${i + 1} to PDF:`, imgError)
              // Draw placeholder rectangle if image fails
              doc.setDrawColor(200, 200, 200)
              doc.rect(x, y, photoWidth, photoHeight)
              doc.setFontSize(8)
              doc.setTextColor(150, 150, 150)
              doc.text("Imagen no disponible", x + photoWidth / 2, y + photoHeight / 2, { align: "center" })
            }
          }

          console.log(
            `[v0] Added ${photoUrls.length} photos to PDF across ${Math.ceil(photoUrls.length / photosPerPage)} page(s)`,
          )
        }
      } catch (photoError) {
        console.error("[v0] Error processing photos for PDF:", photoError)
        // Continue without photos if there's an error
      }
    }

    // Generate PDF blob
    const pdfBlob = doc.output("blob")
    const fileName = `picking_${orderData.ordendecargue}_${Date.now()}.pdf`

    // Upload new PDF (overwrite)
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("archivos")
      .upload(`doccargue/${fileName}`, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      })

    if (uploadError) {
      console.error("[v0] Error uploading updated PDF:", uploadError)
      return { success: true, message: "Personal asignado exitosamente (PDF no actualizado)" }
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("archivos").getPublicUrl(`doccargue/${fileName}`)

    // Update doccargue with new PDF URL
    const { error: updatePdfError } = await supabase
      .from("cabeceraoc")
      .update({ doccargue: publicUrl })
      .eq("id", orderId)

    if (updatePdfError) {
      console.error("[v0] Error updating PDF URL:", updatePdfError)
    }

    console.log("[v0] PDF updated with auxiliares information and photo evidence")
  } catch (pdfError) {
    console.error("[v0] Error updating PDF:", pdfError)
    // Don't fail the whole operation if PDF update fails
  }

  return { success: true, message: "Personal asignado exitosamente y PDF actualizado" }
}

export async function getPickingItems(ordenCargue: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("invtrans")
    .select("id, nombreproducto, lote, location, cantidad, status, codproducto")
    .eq("ocargue", ordenCargue)
    .order("nombreproducto", { ascending: true })

  if (error) {
    console.error("[v0] Error fetching picking items:", error)
    return { success: false, data: [], alternos: [], message: error.message }
  }

  const empresaId = await getCurrentEmpresaIdForInsert()

  // Helper para enriquecer cada fila con su stock disponible.
  const withStock = async (item: any) => {
    const { data: stockData } = await supabase
      .from("saldoinvdetalle")
      .select("stock_disp")
      .eq("nombreproducto", item.nombreproducto)
      .eq("lote", item.lote)
      .eq("location", item.location)
      .eq("idempresa", empresaId)
      .maybeSingle()

    const stock_disp = stockData?.stock_disp || 0
    return { ...item, stock_disp, stock_restante: stock_disp - item.cantidad }
  }

  // Las filas con status "Lote alterno" NO se muestran en la lista normal de
  // picking; se devuelven aparte para usarlas solo cuando falte inventario.
  const normalRows = (data || []).filter((r) => r.status !== "Lote alterno")
  const alternoRows = (data || []).filter((r) => r.status === "Lote alterno")

  const itemsWithStock = await Promise.all(normalRows.map(withStock))
  const alternosWithStock = await Promise.all(alternoRows.map(withStock))

  // `tieneStockQR`: esa combinacion producto/lote/location tiene existencias en
  // estibas identificadas. La UI lo usa solo para AVISAR: el picking sin QR
  // sigue permitido (ver `clavesConStockQR` y la nota en `confirmPicking`).
  const conQR = await clavesConStockQR(supabase, [...itemsWithStock, ...alternosWithStock])
  const marcar = (item: any) => ({
    ...item,
    tieneStockQR: conQR.has(claveQR(item.codproducto, item.lote, item.location)),
  })

  return {
    success: true,
    data: itemsWithStock.map(marcar),
    alternos: alternosWithStock.map(marcar),
    message: "Productos cargados exitosamente",
  }
}

export async function generatePickingPDF(
  orderId: number,
  ordenCargue: string,
  cliente: string,
  placa: string,
  conductor: string,
) {
  try {
    if (!ordenCargue || !cliente || !placa || !conductor) {
      console.error("[v0] Missing required parameters for PDF generation:", {
        ordenCargue,
        cliente,
        placa,
        conductor,
      })
      return { success: false, error: "Faltan parámetros requeridos para generar el PDF" }
    }

    console.log("[v0] Starting picking PDF generation for order:", ordenCargue)

    const supabase = await createClient()
    const supabaseAdmin = await getSupabaseAdmin()

    // Get products from invtrans
    const productsResult = await getLoadOrderProducts(orderId, ordenCargue)
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
    doc.text("ORDEN DE PICKING", 105, 20, { align: "center" })

    // Date and time
    const colombiaTime = await getColombiaDateTime()
    const fechaHora = colombiaTime.toLocaleString("es-CO", {
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
    doc.text("Orden de Cargue:", 20, y + 7)
    doc.setFont(undefined, "normal")
    doc.text(String(ordenCargue || ""), 70, y + 7)

    doc.setFont(undefined, "bold")
    doc.text("Cliente:", 20, y + 14)
    doc.setFont(undefined, "normal")
    doc.text(String(cliente || ""), 70, y + 14)

    doc.setFont(undefined, "bold")
    doc.text("Placa:", 20, y + 21)
    doc.setFont(undefined, "normal")
    doc.text(String(placa || ""), 70, y + 21)

    doc.setFont(undefined, "bold")
    doc.text("Conductor:", 110, y + 21)
    doc.setFont(undefined, "normal")
    doc.text(String(conductor || ""), 145, y + 21)

    // Products table
    y = 80
    doc.setTextColor(0, 0, 0)

    const tableData = productsResult.data.map((product: any) => [
      String(product.nombreproducto || ""),
      String(product.location || ""),
      String(product.lote || ""),
      String(product.cantidad || 0),
    ])

    autoTable(doc, {
      startY: y,
      head: [["Producto", "Location", "Lote", "Cantidad"]],
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
        0: { cellWidth: 80 },
        1: { cellWidth: 35 },
        2: { cellWidth: 35 },
        3: { cellWidth: 30, halign: "center" },
      },
      margin: { left: 15, right: 15 },
    })

    // Footer
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(7)
    doc.text("Generado por LipGo V3.0", 105, 270, { align: "center" })

    console.log("[v0] Picking PDF generated, creating blob...")

    // Generate PDF blob
    const pdfBlob = doc.output("blob")
    const fileName = `picking_${ordenCargue}_${Date.now()}.pdf`

    console.log("[v0] Uploading PDF to storage...")

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("archivos")
      .upload(`doccargue/${fileName}`, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      })

    if (uploadError) {
      console.error("[v0] Error uploading picking PDF:", uploadError)
      return { success: false, error: uploadError.message }
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("archivos").getPublicUrl(`doccargue/${fileName}`)

    console.log("[v0] Picking PDF uploaded successfully:", publicUrl)

    const currentTime = await getColombiaTime()

    const { error: updateError } = await supabase
      .from("cabeceraoc")
      .update({
        iniciocargue: currentTime,
        doccargue: publicUrl,
      })
      .eq("id", orderId)

    if (updateError) {
      console.error("[v0] Error updating cabeceraoc:", updateError)
      // Don't fail the whole operation if the update fails
    }

    console.log("[v0] Updated iniciocargue to:", currentTime)
    console.log("[v0] Updated doccargue to:", publicUrl)

    return {
      success: true,
      url: publicUrl,
      message: "PDF de picking generado exitosamente",
    }
  } catch (error) {
    console.error("[v0] Error generating picking PDF:", error)
    return { success: false, error: "Error al generar el PDF de picking" }
  }
}

export async function confirmPicking(
  orderId: number,
  ordenCargue: string,
  items: {
    id: number
    cantidad: number
    // Si el item se verificó por QR, contiene una entrada por cada
    // estiba (QR) escaneada con la cantidad descontada de cada una y las
    // averías reportadas en esa estiba.
    qrScans?: { idqr: number; cantidad: number; averias?: number }[]
    // Estibas escaneadas desde el inventario marcado como "Lote alterno".
    // Cada una indica de qué fila de invtrans alterna proviene (alternoId).
    alternoScans?: { idqr: number; cantidad: number; averias?: number; alternoId: number }[]
    // Modo SIMPLE (sin QR): averías reportadas sobre el lote principal.
    averias?: number
    // Modo SIMPLE (sin QR): selecciones de lote alterno con su cantidad y averías.
    alternoSimple?: { alternoId: number; cantidad: number; averias?: number }[]
  }[],
) {
  const supabase = await createClient()

  // Helper: inserta una ENTRADA con status "Averia" copiando los datos de una
  // fila de invtrans existente, con la cantidad de averías indicada.
  const insertAveriaForRow = async (rowId: number, averias: number) => {
    if (!averias || averias <= 0) return
    const { data: row, error } = await supabase.from("invtrans").select("*").eq("id", rowId).single()
    if (error || !row) {
      console.error("[v0] Error fetching invtrans row for averia:", error)
      throw error || new Error("No se encontró la línea de invtrans para registrar la avería")
    }
    const { id: _id, ...rest } = row as Record<string, any>
    const { error: insErr } = await supabase
      .from("invtrans")
      .insert([{ ...rest, cantidad: averias, tipomov: "Entrada", status: "Averia" }])
    if (insErr) {
      console.error("[v0] Error inserting averia row:", insErr)
      throw insErr
    }
  }

  // Helper: divide una fila de invtrans (original/alterna) en una línea
  // aprobada por cada estiba escaneada y, por cada avería reportada, crea
  // una ENTRADA con status "Averia". Finalmente elimina la fila original.
  const splitRowByScans = async (
    rowId: number,
    scans: { idqr: number; cantidad: number; averias?: number }[],
  ) => {
    const { data: originalRow, error: fetchError } = await supabase
      .from("invtrans")
      .select("*")
      .eq("id", rowId)
      .single()

    if (fetchError || !originalRow) {
      console.error("[v0] Error fetching invtrans row to split:", fetchError)
      throw fetchError || new Error("No se encontró la línea de invtrans a dividir")
    }

    const { id: _id, ...rest } = originalRow as Record<string, any>

    // Salida aprobada por estiba: la cantidad es el total escaneado (incluye
    // lo que luego se descuenta como avería, según la regla de negocio).
    const salidaRows = scans.map((scan) => ({
      ...rest,
      cantidad: scan.cantidad,
      qrestiba: scan.idqr,
      tipomov: "Salida",
      status: "aprobado",
    }))

    // Entradas por avería: una por cada estiba con averías > 0.
    const averiaRows = scans
      .filter((scan) => (scan.averias || 0) > 0)
      .map((scan) => ({
        ...rest,
        cantidad: scan.averias,
        qrestiba: scan.idqr,
        tipomov: "Entrada",
        status: "Averia",
      }))

    const rowsToInsert = [...salidaRows, ...averiaRows]
    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("invtrans").insert(rowsToInsert)
      if (insertError) {
        console.error("[v0] Error inserting split invtrans rows:", insertError)
        throw insertError
      }
    }

    const { error: deleteError } = await supabase.from("invtrans").delete().eq("id", rowId)
    if (deleteError) {
      console.error("[v0] Error deleting original invtrans row:", deleteError)
      throw deleteError
    }
  }

  try {
    // NOTA: aqui existio un BLOQUEO que rechazaba la confirmacion cuando una
    // linea se descontaba sin QR y su stock vivia en estibas identificadas. Se
    // retiro por decision de operacion: el picking sin QR vuelve a permitirse
    // aunque el producto tenga estibas con QR.
    //
    // El riesgo que cubria sigue existiendo: esa salida queda sin `qrestiba` y
    // el inventario por estiba no se mueve, asi que la estiba conserva un stock
    // que fisicamente ya salio. Lo que queda es el AVISO en la UI
    // (`tieneStockQR`), que informa pero no impide.

    for (const item of items) {
      const hasNormal = !!(item.qrScans && item.qrScans.length > 0)
      const hasQRAlterno = !!(item.alternoScans && item.alternoScans.length > 0)
      const hasSimpleAlterno = !!(item.alternoSimple && item.alternoSimple.length > 0)

      if (hasNormal) {
        // VERIFICACIÓN POR QR: reemplazamos la línea original por una línea de
        // salida aprobada por cada QR escaneado (+ entradas por avería).
        await splitRowByScans(item.id, item.qrScans!)
      } else if (hasQRAlterno) {
        // Sólo se usó lote alterno por QR (sin estibas normales): la línea
        // original se cubre completamente con el alterno, por lo que se elimina.
        const { error: deleteError } = await supabase.from("invtrans").delete().eq("id", item.id)
        if (deleteError) {
          console.error("[v0] Error deleting original invtrans row (alterno-only):", deleteError)
          throw deleteError
        }
      } else {
        // VERIFICACIÓN SIMPLE (sin QR): se aprueba la línea con la cantidad
        // escogida (salida) y, si hubo averías sobre el lote principal, se
        // registra una ENTRADA con status "Averia".
        const { error: updateError } = await supabase
          .from("invtrans")
          .update({
            cantidad: item.cantidad,
            status: "aprobado",
          })
          .eq("id", item.id)

        if (updateError) {
          console.error("[v0] Error updating invtrans:", updateError)
          throw updateError
        }

        await insertAveriaForRow(item.id, item.averias || 0)
      }

      // LOTE ALTERNO POR QR: cada fila alterna se divide igual que la normal
      // (estibas aprobadas + averías) y se elimina la fila alterna original.
      if (hasQRAlterno) {
        const byAlternoId = new Map<number, { idqr: number; cantidad: number; averias?: number }[]>()
        for (const scan of item.alternoScans!) {
          const list = byAlternoId.get(scan.alternoId) || []
          list.push({ idqr: scan.idqr, cantidad: scan.cantidad, averias: scan.averias })
          byAlternoId.set(scan.alternoId, list)
        }
        for (const [alternoId, scans] of byAlternoId) {
          await splitRowByScans(alternoId, scans)
        }
      }

      // LOTE ALTERNO SIMPLE (sin QR): cada selección aprueba la fila alterna
      // con la cantidad usada (salida) y registra su entrada por avería.
      if (hasSimpleAlterno) {
        for (const sel of item.alternoSimple!) {
          const { error: updErr } = await supabase
            .from("invtrans")
            .update({ cantidad: sel.cantidad, status: "aprobado", tipomov: "Salida" })
            .eq("id", sel.alternoId)
          if (updErr) {
            console.error("[v0] Error approving simple alterno row:", updErr)
            throw updErr
          }
          await insertAveriaForRow(sel.alternoId, sel.averias || 0)
        }
      }
    }

    // Register horapicking only when confirming
    const currentTime = await getColombiaTime()
    const { error: horaError } = await supabase
      .from("cabeceraoc")
      .update({ horapicking: currentTime })
      .eq("id", orderId)

    if (horaError) {
      console.error("[v0] Error registering horapicking on confirm:", horaError)
      throw horaError
    }

    console.log("[v0] Picking confirmed successfully for order:", ordenCargue, "with horapicking:", currentTime)

    return { success: true, message: "Picking confirmado exitosamente" }
  } catch (error: any) {
    console.error("[v0] Error confirming picking:", error)
    return { success: false, message: error.message || "Error al confirmar el picking" }
  }
}

export async function savePickingPhotos(orderId: number, photoUrls: string[]) {
  const supabase = await createClient()

  // Create JSON array of strings
  const photosJson = JSON.stringify(photoUrls)

  const { error } = await supabase.from("cabeceraoc").update({ fotospicking: photosJson }).eq("id", orderId)

  if (error) {
    console.error("[v0] Error saving picking photos:", error)
    return { success: false, message: error.message }
  }

  return { success: true, message: "Fotos guardadas exitosamente" }
}

export async function registerHoraPicking(orderId: number) {
  const supabase = await createClient()
  const currentTime = await getColombiaTime()

  const { error } = await supabase.from("cabeceraoc").update({ horapicking: currentTime }).eq("id", orderId)

  if (error) {
    console.error("[v0] Error registering horapicking:", error)
    return { success: false, message: error.message }
  }

  return { success: true, message: "Hora de picking registrada exitosamente" }
}

/**
 * Pausa el proceso de cargue de una orden. Crea una nueva linea en la tabla
 * `pausas` con el numero de orden, la hora de inicio del paro (hora Colombia)
 * y activo = true. Solo deberia llamarse cuando la orden ya tiene iniciocargue.
 */
export async function pausarOrden(ordenCargue: string) {
  const supabase = await createClient()
  const inicio = await getColombiaTime()

  const { error } = await supabase.from("pausas").insert([
    {
      ordendecargue: ordenCargue,
      inicio,
      activo: true,
    },
  ])

  if (error) {
    console.error("[v0] Error al pausar la orden:", error)
    return { success: false, message: error.message }
  }

  return { success: true, message: "Cargue pausado" }
}

/**
 * Reanuda el proceso de cargue de una orden. Busca la linea de pausa activa
 * (activo = true y sin fin) de la orden y le escribe la hora de fin del paro.
 */
export async function reanudarOrden(ordenCargue: string) {
  const supabase = await createClient()
  const fin = await getColombiaTime()

  // Buscar la pausa activa de la orden (la mas reciente que aun no tiene fin).
  const { data: pausa, error: findError } = await supabase
    .from("pausas")
    .select("id")
    .eq("ordendecargue", ordenCargue)
    .eq("activo", true)
    .is("fin", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findError) {
    console.error("[v0] Error al buscar la pausa activa:", findError)
    return { success: false, message: findError.message }
  }

  if (!pausa) {
    return { success: false, message: "No se encontró una pausa activa para esta orden" }
  }

  const { error: updateError } = await supabase.from("pausas").update({ fin }).eq("id", pausa.id)

  if (updateError) {
    console.error("[v0] Error al reanudar la orden:", updateError)
    return { success: false, message: updateError.message }
  }

  return { success: true, message: "Cargue reanudado" }
}

/**
 * Devuelve los numeros de orden (ordendecargue) que tienen una pausa activa
 * (activo = true y aun sin fin). Sirve para que la UI muestre "Reanudar" en
 * vez de "Pausar" en esas ordenes.
 */
export async function getOrdenesPausadas(): Promise<string[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("pausas")
    .select("ordendecargue")
    .eq("activo", true)
    .is("fin", null)

  if (error) {
    console.error("[v0] Error al obtener ordenes pausadas:", error)
    return []
  }

  return (data || []).map((p: { ordendecargue: string }) => p.ordendecargue)
}

async function urlToBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error("[v0] Error converting URL to base64:", error)
    throw error
  }
}
