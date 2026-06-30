/**
 * Generador del documento de evidencia de Inducción (soporte ISO).
 *
 * Produce un PDF con:
 *  - Encabezado tipo formato ISO: logo LIP a la izquierda, título al
 *    centro y código SST-FOR-30 a la derecha.
 *  - Datos de la inducción y del trabajador (tema, documento).
 *  - Resultado de la evaluación (puntaje y aprobado/no aprobado).
 *  - Nombre y firma digital registrada del trabajador al pie.
 *
 * Devuelve un Blob para poder subirlo al storage y persistir su URL.
 */

const LOGO_LIP_URL =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/logo%20LIP-Cjl9Gzi9Ag9HfUljKHndRgJpqxQm2j.png"

const CODIGO_DOCUMENTO = "SST-FOR-30"

export interface InduccionPdfData {
  tema: string
  codigoSig?: string | null
  trabajadorNombre: string
  trabajadorDocumento: string | null
  puntaje: number
  total: number
  aprobado: boolean
  fecha: Date
  firmaUrl?: string | null
}

// Carga una imagen remota como elemento <img> para jsPDF.addImage.
// Incluye un timeout para que una URL inalcanzable o que nunca dispara
// onload/onerror (mixed content, CORS, etc.) no deje colgada la generación
// del documento: en ese caso se resuelve como null y el PDF se genera igual.
async function loadImage(url: string, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      const timer = setTimeout(() => resolve(null), timeoutMs)
      img.onload = () => {
        clearTimeout(timer)
        resolve(img)
      }
      img.onerror = () => {
        clearTimeout(timer)
        resolve(null)
      }
      img.src = url
    })
  } catch {
    return null
  }
}

// Reescala y comprime una imagen a un data URL JPEG. Las firmas suelen llegar
// como PNG de alta resolución; al incrustarlas tal cual, jsPDF las codifica sin
// compresión y el PDF puede superar el límite de subida (~4.5MB de la función
// serverless), provocando "Request Entity Too Large". Aquí las pasamos por un
// canvas con fondo blanco (la firma es trazo oscuro) a un ancho máximo y las
// codificamos como JPEG, reduciendo el peso drásticamente.
function compressImage(img: HTMLImageElement, maxWidth = 600, quality = 0.8): string | null {
  try {
    const ratio = img.width > 0 ? Math.min(1, maxWidth / img.width) : 1
    const w = Math.max(1, Math.round((img.width || maxWidth) * ratio))
    const h = Math.max(1, Math.round((img.height || maxWidth / 2) * ratio))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    // Fondo blanco para evitar que la transparencia del PNG quede negra en JPEG.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL("image/jpeg", quality)
  } catch (e) {
    console.error("[v0] pdf-induccion: compressImage falló", e)
    return null
  }
}

export async function generarPdfInduccion(
  data: InduccionPdfData,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 12

  // ---- Encabezado tipo formato ISO (3 celdas) ----
  const headerY = 12
  const headerH = 22
  const logoCellW = 48
  const codeCellW = 46
  const centerCellW = pageWidth - marginX * 2 - logoCellW - codeCellW

  // Marco exterior y divisiones.
  doc.setDrawColor(120, 120, 120)
  doc.setLineWidth(0.3)
  doc.rect(marginX, headerY, logoCellW, headerH)
  doc.rect(marginX + logoCellW, headerY, centerCellW, headerH)
  doc.rect(marginX + logoCellW + centerCellW, headerY, codeCellW, headerH)

  // Logo LIP en la celda izquierda.
  const logo = await loadImage(LOGO_LIP_URL)
  let logoOk = false
  if (logo) {
    // El logo es apaisado (~2.5:1); lo ajustamos dentro de la celda.
    const w = 42
    const h = 16
    try {
      doc.addImage(logo, "PNG", marginX + (logoCellW - w) / 2, headerY + (headerH - h) / 2, w, h)
      logoOk = true
    } catch (e) {
      console.error("[v0] pdf-induccion: addImage logo falló", e)
    }
  }
  if (!logoOk) {
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("LIP", marginX + logoCellW / 2, headerY + headerH / 2 + 2, { align: "center" })
  }

  // Título central.
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(20, 20, 20)
  doc.text(
    "REGISTRO DE INDUCCIÓN Y EVALUACIÓN",
    marginX + logoCellW + centerCellW / 2,
    headerY + headerH / 2,
    { align: "center", maxWidth: centerCellW - 6 },
  )

  // Código del documento (derecha).
  const codeX = marginX + logoCellW + centerCellW
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text("Código:", codeX + codeCellW / 2, headerY + 8, { align: "center" })
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text(CODIGO_DOCUMENTO, codeX + codeCellW / 2, headerY + 15, { align: "center" })

  let y = headerY + headerH + 10

  // ---- Datos de la inducción ----
  doc.setTextColor(0, 0, 0)
  doc.setFillColor(240, 240, 245)
  doc.rect(marginX, y, pageWidth - marginX * 2, 7, "F")
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("DATOS DE LA INDUCCIÓN", marginX + 2, y + 5)
  y += 12

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  const labelVal = (label: string, value: string) => {
    doc.setFont("helvetica", "bold")
    doc.text(label, marginX + 2, y)
    const labelW = doc.getTextWidth(label) + 2
    doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(value || "-", pageWidth - marginX * 2 - labelW - 4)
    doc.text(lines, marginX + 2 + labelW, y)
    y += Math.max(7, lines.length * 5 + 2)
  }

  labelVal("Tema: ", data.tema)
  if (data.codigoSig) labelVal("Código SIG: ", data.codigoSig)
  labelVal(
    "Fecha: ",
    data.fecha.toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" }),
  )

  y += 4

  // ---- Datos del trabajador y resultado ----
  doc.setFillColor(240, 240, 245)
  doc.rect(marginX, y, pageWidth - marginX * 2, 7, "F")
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("TRABAJADOR Y RESULTADO", marginX + 2, y + 5)
  y += 12

  doc.setFontSize(10)
  labelVal("Nombre del trabajador: ", data.trabajadorNombre)
  labelVal("Documento: ", data.trabajadorDocumento || "-")
  labelVal("Puntaje: ", `${data.puntaje} / ${data.total}`)

  // Resultado con color.
  doc.setFont("helvetica", "bold")
  doc.text("Resultado: ", marginX + 2, y)
  const resLabelW = doc.getTextWidth("Resultado: ") + 2
  if (data.aprobado) doc.setTextColor(22, 163, 74)
  else doc.setTextColor(220, 38, 38)
  doc.text(data.aprobado ? "APROBADO" : "NO APROBADO", marginX + 2 + resLabelW, y)
  doc.setTextColor(0, 0, 0)
  y += 16

  // ---- Firma del trabajador al pie ----
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("FIRMA DEL TRABAJADOR", marginX + 2, y)
  y += 4

  const firma = data.firmaUrl ? await loadImage(data.firmaUrl) : null
  let firmaOk = false
  if (firma) {
    try {
      // Comprimimos la firma a JPEG para mantener el PDF liviano; si la
      // compresión falla, caemos a incrustar el PNG original.
      const firmaJpeg = compressImage(firma)
      if (firmaJpeg) {
        doc.addImage(firmaJpeg, "JPEG", marginX + 2, y, 55, 24)
      } else {
        doc.addImage(firma, "PNG", marginX + 2, y, 55, 24)
      }
      firmaOk = true
    } catch (e) {
      console.error("[v0] pdf-induccion: addImage firma falló", e)
    }
  }
  y += firmaOk ? 26 : 24
  // Línea de firma + nombre.
  doc.setLineWidth(0.3)
  doc.line(marginX + 2, y, marginX + 75, y)
  y += 4
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(data.trabajadorNombre, marginX + 2, y)
  if (data.trabajadorDocumento) {
    y += 4
    doc.text(`C.C. ${data.trabajadorDocumento}`, marginX + 2, y)
  }

  // Footer ISO.
  doc.setFontSize(6)
  doc.setTextColor(128, 128, 128)
  doc.text(
    `Documento controlado - ${CODIGO_DOCUMENTO} - Progressive Integral Logistics (LIP)`,
    pageWidth / 2,
    290,
    { align: "center" },
  )

  return doc.output("blob")
}
