/**
 * Generador de PDF de Evaluacion de Desempeno.
 *
 * Reutilizable tanto desde el formulario (tras guardar) como desde el historial
 * (al regenerar el PDF de una evaluacion pasada).
 *
 * IMPORTANTE: Se EXCLUYE intencionalmente la seccion de Decisiones (P13-P16)
 * del PDF por decision de negocio.
 */

export interface EvaluacionPdfData {
  colaboradorNombre: string
  colaboradorCargo: string | null
  fecha: Date
  // Calificaciones P1-P12 (estrellas 1-5)
  p1_seguridad_normas: number
  p2_seguridad_conducta: number
  p3_productividad_metas: number
  p4_productividad_ritmo: number
  p5_calidad_mercancia: number
  p6_calidad_precision: number
  p7_disciplina_puntualidad: number
  p8_disciplina_asistencia: number
  p9_disciplina_instrucciones: number
  p10_actitud_equipo: number
  p11_actitud_disposicion: number
  p12_actitud_proactividad: number
  // Cierre
  comentarios_adicionales?: string | null
  firma_coordinador?: string | null
  // Resumen
  puntaje_total: number
  porcentaje_riesgo: number
}

export async function generarPdfEvaluacion(data: EvaluacionPdfData): Promise<void> {
  // jsPDF es client-side, se carga dinamicamente
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 10

  // Logo corporativo (misma fuente que los otros PDFs del sistema)
  try {
    const logoImg = new Image()
    logoImg.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      logoImg.onload = () => resolve()
      logoImg.onerror = () => reject()
      logoImg.src =
        "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/LipGoBG%281%29-QiKwXNpJQ5VF7HlbOfUvlPsKCYCkAU.png"
    })
    doc.addImage(logoImg, "PNG", 10, 5, 20, 20)
  } catch {
    // continuar sin logo si la imagen no se pudo cargar
  }

  // Titulo y fecha
  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.text("EVALUACION DE DESEMPENO", 35, 14)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-CO")} ${new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`,
    35,
    20,
  )
  y = 30

  // Cabecera con datos del colaborador
  doc.setFillColor(240, 240, 245)
  doc.rect(10, y, pageWidth - 20, 16, "F")
  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  doc.text("INFORMACION DEL COLABORADOR", 12, y + 4)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(`Nombre: ${data.colaboradorNombre || "-"}`, 12, y + 9)
  doc.text(`Cargo: ${data.colaboradorCargo || "-"}`, 12, y + 13)
  doc.text(
    `Fecha evaluacion: ${data.fecha.toLocaleDateString("es-CO")}`,
    pageWidth - 70,
    y + 9,
  )
  y += 20

  // Dibuja una pregunta con estrellas y puntaje
  const drawQuestionRow = (label: string, score: number) => {
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(0, 0, 0)
    const labelLines = doc.splitTextToSize(label, pageWidth - 80)
    doc.text(labelLines, 12, y + 4)
    const starsX = pageWidth - 60
    const filled = "*".repeat(score)
    const empty = "-".repeat(5 - score)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(217, 119, 6) // ambar
    doc.text(filled, starsX, y + 4)
    const filledWidth = doc.getTextWidth(filled)
    doc.setTextColor(200, 200, 200)
    doc.text(empty, starsX + filledWidth, y + 4)
    doc.setTextColor(0, 0, 0)
    doc.setFont("helvetica", "normal")
    doc.text(`${score}/5`, pageWidth - 20, y + 4, { align: "right" })
    y += Math.max(5, labelLines.length * 3.5 + 1.5)
  }

  // Titulo de seccion con fondo indigo
  const drawSectionTitle = (title: string) => {
    doc.setFillColor(79, 70, 229)
    doc.rect(10, y, pageWidth - 20, 6, "F")
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(255, 255, 255)
    doc.text(title, 12, y + 4)
    doc.setTextColor(0, 0, 0)
    y += 8
  }

  // SECCION 1 - SEGURIDAD
  drawSectionTitle("1. SEGURIDAD")
  drawQuestionRow("Cumplimiento de normas de seguridad", data.p1_seguridad_normas)
  drawQuestionRow("Conducta segura en el puesto", data.p2_seguridad_conducta)

  // SECCION 2 - PRODUCTIVIDAD
  drawSectionTitle("2. PRODUCTIVIDAD")
  drawQuestionRow("Cumplimiento de metas", data.p3_productividad_metas)
  drawQuestionRow("Ritmo de trabajo", data.p4_productividad_ritmo)

  // SECCION 3 - CALIDAD
  drawSectionTitle("3. CALIDAD")
  drawQuestionRow("Cuidado de la mercancia", data.p5_calidad_mercancia)
  drawQuestionRow("Precision en la ejecucion de tareas", data.p6_calidad_precision)

  // SECCION 4 - DISCIPLINA
  drawSectionTitle("4. DISCIPLINA")
  drawQuestionRow("Puntualidad", data.p7_disciplina_puntualidad)
  drawQuestionRow("Asistencia", data.p8_disciplina_asistencia)
  drawQuestionRow("Seguimiento de instrucciones", data.p9_disciplina_instrucciones)

  // SECCION 5 - ACTITUD
  drawSectionTitle("5. ACTITUD")
  drawQuestionRow("Trabajo en equipo", data.p10_actitud_equipo)
  drawQuestionRow("Disposicion al trabajo", data.p11_actitud_disposicion)
  drawQuestionRow("Proactividad", data.p12_actitud_proactividad)

  // NOTA: La seccion 6 (Decisiones P13-P16) se excluye intencionalmente.

  // Resumen global
  y += 4
  doc.setFillColor(240, 240, 245)
  doc.rect(10, y, pageWidth - 20, 16, "F")
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("RESULTADO GLOBAL", 12, y + 5)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(`Puntaje total: ${data.puntaje_total} / 60`, 12, y + 10)
  doc.text(`Porcentaje de riesgo: ${data.porcentaje_riesgo}%`, 12, y + 14)
  const riesgoColor: [number, number, number] =
    data.porcentaje_riesgo >= 60
      ? [220, 38, 38]
      : data.porcentaje_riesgo >= 30
        ? [217, 119, 6]
        : [22, 163, 74]
  doc.setFillColor(...riesgoColor)
  doc.circle(pageWidth - 20, y + 8, 3, "F")
  y += 20

  // Comentarios adicionales (opcional)
  if (data.comentarios_adicionales && data.comentarios_adicionales.trim() !== "") {
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.text("COMENTARIOS ADICIONALES", 10, y)
    y += 5
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    const comentLines = doc.splitTextToSize(data.comentarios_adicionales, pageWidth - 20)
    doc.text(comentLines, 10, y)
    y += comentLines.length * 4 + 4
  }

  // Firma (opcional)
  if (data.firma_coordinador) {
    if (y > 240) {
      doc.addPage()
      y = 15
    }
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.text("FIRMA DEL COORDINADOR", 10, y)
    y += 4
    try {
      const img = new Image()
      img.crossOrigin = "anonymous"
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject()
        img.src = data.firma_coordinador as string
      })
      doc.addImage(img, "PNG", 10, y, 50, 22)
      y += 24
    } catch {
      doc.setFontSize(8)
      doc.setFont("helvetica", "italic")
      doc.text("(Firma no disponible)", 10, y + 4)
      y += 6
    }
  }

  // Footer
  doc.setFontSize(6)
  doc.setTextColor(128, 128, 128)
  doc.text(
    `Evaluacion de desempeno - ${data.colaboradorNombre || ""}`,
    pageWidth / 2,
    290,
    { align: "center" },
  )

  // Descarga con nombre consistente
  const safeName = (data.colaboradorNombre || "colaborador")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase()
  const dateStr = data.fecha.toISOString().slice(0, 10)
  doc.save(`evaluacion_${safeName}_${dateStr}.pdf`)
}
