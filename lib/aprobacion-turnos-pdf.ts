// Contenido del PDF de "Aprobación de Turnos / Horas Extra" (módulo Operación
// LIP > Aprobar Turnos). SIN "use server": es una función isomórfica -- la
// usa el componente en el navegador (components/aprobar-turnos.tsx) Y los
// scripts de corrección retroactiva en Node. Única fuente de verdad del
// contenido/formato del documento: cualquier cambio de formato se hace aquí
// una sola vez y aplica tanto a lo nuevo como a lo que se reescriba.

export interface SolicitudTurnoPdfInput {
  puesto: string
  fecharequerida: string
  cantidad: number
  nombresolicitante: string
  firmasolicitante: string | null
  tipo: string | null
}

export interface EmpresaPdfInput {
  nombre: string
  nit: string | null
  direccion: string | null
}

/** Una solicitud es de tipo "Turnos" cuando su campo `tipo` es "Turnos" (o está vacío, el default de la UI). */
export function esTipoTurnos(s: { tipo: string | null | undefined }): boolean {
  return (s.tipo || "Turnos").trim().toLowerCase() === "turnos"
}

function tiposDelLote(aprobadas: { tipo: string | null | undefined }[]): Set<"turnos" | "horas_extra"> {
  return new Set(aprobadas.map((s) => (esTipoTurnos(s) ? "turnos" : "horas_extra")))
}

/**
 * Título del documento según el tipo REAL de las solicitudes aprobadas en
 * este lote -- una aprobación de Horas Extra ya no dice "TURNOS". Si el lote
 * mezcla ambos tipos (raro: en la práctica se piden y aprueban por separado),
 * el título lo dice explícitamente en vez de esconder uno.
 */
export function tituloAprobacionDe(aprobadas: { tipo: string | null | undefined }[]): string {
  const tipos = tiposDelLote(aprobadas)
  if (tipos.size > 1) return "APROBACIÓN DE TURNOS Y HORAS EXTRAS"
  return tipos.has("horas_extra") ? "APROBACIÓN HORAS EXTRAS" : "APROBACIÓN DE TURNOS"
}

/** Mismo criterio que `tituloAprobacionDe`, para el label del total al final de la tabla. */
export function labelTotalDe(aprobadas: { tipo: string | null | undefined }[]): string {
  const tipos = tiposDelLote(aprobadas)
  if (tipos.size > 1) return "Total de solicitudes aprobadas"
  return tipos.has("horas_extra") ? "Total de horas extra aprobadas" : "Total de turnos aprobados"
}

export interface ConstruirPdfAprobacionParams {
  empresaData: EmpresaPdfInput
  aprobadas: SolicitudTurnoPdfInput[]
  /** Nombre de quien aprobó -- se usa tal cual para "Aprobado por:" y para el nombre bajo la firma del aprobador. */
  nombreAprobador: string
  firmaAprobadorUrl: string | null
  personnel: string[]
  /**
   * Convierte una URL de firma en un data URI que jsPDF pueda dibujar con
   * `addImage`. Difiere entre navegador (canvas, ver `loadImage` en
   * aprobar-turnos.tsx) y Node (fetch + base64) -- es la ÚNICA pieza que no
   * puede ser 100% compartida entre ambos entornos.
   */
  cargarImagenDataUri: (url: string) => Promise<string>
}

/** Construye el PDF y devuelve sus bytes crudos (ArrayBuffer) -- el caller decide si lo envuelve en Blob (navegador) o Buffer (Node/subida a storage). */
export async function construirPdfAprobacionTurnos(params: ConstruirPdfAprobacionParams): Promise<ArrayBuffer> {
  const { empresaData, aprobadas, nombreAprobador, firmaAprobadorUrl, personnel, cargarImagenDataUri } = params

  const { default: jsPDF } = await import("jspdf")
  const { default: autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF()

  // Header
  doc.setFontSize(16)
  doc.setTextColor(200, 16, 46)
  doc.setFont(undefined as unknown as string, "bold")
  doc.text(empresaData.nombre, 105, 20, { align: "center" })

  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.setFont(undefined as unknown as string, "normal")
  doc.text(`NIT: ${empresaData.nit || ""}`, 105, 27, { align: "center" })
  doc.text(empresaData.direccion || "", 105, 33, { align: "center" })

  const tituloAprobacion = tituloAprobacionDe(aprobadas)
  doc.setFontSize(14)
  doc.setFont(undefined as unknown as string, "bold")
  doc.text(tituloAprobacion, 105, 45, { align: "center" })

  // Solicitante info
  const solicitante = aprobadas[0]?.nombresolicitante || ""
  const firmasolicitanteUrl = aprobadas[0]?.firmasolicitante

  doc.setFontSize(11)
  doc.setFont(undefined as unknown as string, "normal")
  doc.text(`Solicitante: ${solicitante}`, 20, 58)
  doc.text(`Aprobado por: ${nombreAprobador || ""}`, 20, 65)

  // Table with details
  const tableData = aprobadas.map((s) => [s.puesto, s.fecharequerida, s.cantidad.toString()])

  autoTable(doc, {
    startY: 73,
    head: [["Puesto", "Fecha de Servicio", "Cantidad"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [44, 82, 130] },
    styles: { fontSize: 10 },
  })

  let currentY = (doc as any).lastAutoTable.finalY + 10

  // Total
  const totalCantidad = aprobadas.reduce((sum, s) => sum + Number(s.cantidad), 0)
  const labelTotal = labelTotalDe(aprobadas)
  doc.setFont(undefined as unknown as string, "bold")
  doc.text(`${labelTotal}: ${totalCantidad}`, 20, currentY)

  // Personnel section
  if (personnel.length > 0) {
    currentY += 15
    doc.setFontSize(12)
    doc.setFont(undefined as unknown as string, "bold")
    doc.text("PERSONAL PROGRAMADO", 20, currentY)

    currentY += 5
    const personnelTableData = personnel.map((nombre, index) => [(index + 1).toString(), nombre])

    autoTable(doc, {
      startY: currentY,
      head: [["#", "Nombre"]],
      body: personnelTableData,
      theme: "striped",
      headStyles: { fillColor: [44, 82, 130] },
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: "auto" },
      },
    })

    currentY = (doc as any).lastAutoTable.finalY + 10
  }

  const finalY = currentY

  // Signatures section
  let sigY = finalY + 20
  doc.setFont(undefined as unknown as string, "normal")

  // Firma solicitante
  doc.text("Firma Solicitante:", 30, sigY)
  if (firmasolicitanteUrl) {
    try {
      const imgSolicitante = await cargarImagenDataUri(firmasolicitanteUrl)
      doc.addImage(imgSolicitante, "PNG", 30, sigY + 5, 60, 30)
    } catch (e) {
      doc.text("[Firma no disponible]", 30, sigY + 15)
    }
  }
  doc.text(solicitante, 30, sigY + 40)
  doc.line(30, sigY + 37, 90, sigY + 37)

  // Firma aprobador
  doc.text("Firma Aprobador:", 120, sigY)
  if (firmaAprobadorUrl) {
    try {
      const imgAprobador = await cargarImagenDataUri(firmaAprobadorUrl)
      doc.addImage(imgAprobador, "PNG", 120, sigY + 5, 60, 30)
    } catch (e) {
      doc.text("[Firma no disponible]", 120, sigY + 15)
    }
  }
  doc.line(120, sigY + 37, 180, sigY + 37)
  doc.text(nombreAprobador || "", 120, sigY + 42)

  return doc.output("arraybuffer")
}
