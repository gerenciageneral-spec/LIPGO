"use server"

// Genera la FICHA TÉCNICA de un indicador en PDF (soporte de auditoría 0312/ISO).
// Recibe los datos ya calculados (ficha + serie + valores) — no consulta nada.
// Layout limpio A4 vertical con pdf-lib (sin binarios nativos, corre en serverless).

interface FichaPDF {
  ficha: {
    codigo: string
    nombre: string
    area?: string | null
    numeral?: string | null
    definicion?: string | null
    formula?: string | null
    interpretacion?: string | null
    fuente?: string | null
    periodicidad?: string | null
    responsable?: string | null
    unidad?: string | null
    meta: number | null
    sentido: "menor" | "mayor"
  }
  serie: { etiqueta: string; valor: number | null }[]
  actual: number | null
  anterior?: number | null
  periodo?: string
  periodoAnterior?: string
  analisis?: string | null
}

export async function generarFichaIndicadorPDF(
  datos: FichaPDF,
): Promise<{ success: boolean; base64?: string; fileName?: string; error?: string }> {
  try {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib")
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595.28, 841.89]) // A4
    const reg = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const { width, height } = page.getSize()
    const margin = 48
    const cw = width - margin * 2
    const navy = rgb(0.05, 0.15, 0.29)
    const ink = rgb(0.1, 0.15, 0.2)
    const grey = rgb(0.42, 0.48, 0.55)
    const f = datos.ficha
    const sanit = (s: string) => String(s ?? "").replace(/[^\x00-\xff]/g, (c) => ({ "–": "-", "—": "-", "«": '"', "»": '"', "…": "...", "×": "x", "•": "-" } as any)[c] ?? "")
    let y = height - margin

    const text = (t: string, opt: { size?: number; font?: any; color?: any; x?: number } = {}) => {
      page.drawText(sanit(t), { x: opt.x ?? margin, y, size: opt.size ?? 10, font: opt.font ?? reg, color: opt.color ?? ink })
    }
    const wrap = (t: string, size: number, font: any, maxW: number) => {
      const words = sanit(t).replace(/\s+/g, " ").trim().split(" ")
      const lines: string[] = []
      let cur = ""
      for (const w of words) {
        const cand = cur ? `${cur} ${w}` : w
        if (font.widthOfTextAtSize(cand, size) > maxW && cur) {
          lines.push(cur)
          cur = w
        } else cur = cand
      }
      if (cur) lines.push(cur)
      return lines
    }

    // Encabezado
    page.drawRectangle({ x: 0, y: height - 78, width, height: 78, color: navy })
    page.drawText(sanit("FICHA TECNICA DE INDICADOR"), { x: margin, y: height - 40, size: 15, font: bold, color: rgb(1, 1, 1) })
    page.drawText(sanit(`${f.area ? f.area + " · " : ""}${f.numeral ? f.numeral + " · " : ""}${datos.periodo ?? ""}`), {
      x: margin, y: height - 60, size: 10, font: reg, color: rgb(0.8, 0.9, 1),
    })
    y = height - 104

    // Nombre
    for (const ln of wrap(f.nombre, 16, bold, cw)) {
      text(ln, { size: 16, font: bold, color: navy })
      y -= 20
    }
    y -= 6

    // Valor / meta / estado
    const enMeta = datos.actual != null && f.meta != null ? (f.sentido === "menor" ? datos.actual <= f.meta : datos.actual >= f.meta) : null
    text(`Valor ${datos.periodo ?? ""}: `, { font: bold, size: 12 })
    page.drawText(sanit(`${datos.actual ?? "-"} ${f.unidad ?? ""}`), { x: margin + 110, y, size: 12, font: bold, color: navy })
    page.drawText(sanit(`Meta: ${f.meta ?? "-"} (${f.sentido === "menor" ? "menor es mejor" : "mayor es mejor"})`), { x: margin + 250, y, size: 10, font: reg, color: grey })
    y -= 16
    page.drawText(sanit(`Estado: ${enMeta == null ? "sin meta" : enMeta ? "EN META" : "FUERA DE META"}`), {
      x: margin, y, size: 10, font: bold, color: enMeta == null ? grey : enMeta ? rgb(0.12, 0.53, 0.29) : rgb(0.75, 0.22, 0.17),
    })
    if (datos.anterior != null) {
      page.drawText(sanit(`Anterior (${datos.periodoAnterior ?? ""}): ${datos.anterior}`), { x: margin + 200, y, size: 10, font: reg, color: grey })
    }
    y -= 24

    // Ficha técnica (campos)
    page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: width - margin, y: y + 6 }, thickness: 1, color: rgb(0.85, 0.9, 0.94) })
    const campos: [string, string | null | undefined][] = [
      ["Definicion", f.definicion],
      ["Formula", f.formula],
      ["Interpretacion", f.interpretacion],
      ["Fuente de la informacion", f.fuente],
      ["Periodicidad", f.periodicidad],
      ["Responsable", f.responsable],
    ]
    for (const [lbl, val] of campos) {
      if (!val) continue
      text(`${lbl}:`, { font: bold, size: 10, color: navy })
      y -= 13
      for (const ln of wrap(val, 10, reg, cw)) {
        text(ln, { size: 10 })
        y -= 13
      }
      y -= 4
    }

    // Serie mensual
    y -= 6
    text("Tendencia mensual:", { font: bold, size: 10, color: navy })
    y -= 15
    const puntos = datos.serie.filter((p) => p.valor != null)
    if (puntos.length) {
      const colW = cw / 12
      datos.serie.forEach((p, i) => {
        const x = margin + (i % 12) * colW
        page.drawText(sanit(p.etiqueta), { x, y, size: 7.5, font: reg, color: grey })
        page.drawText(sanit(p.valor != null ? String(p.valor) : "-"), { x, y: y - 11, size: 8.5, font: bold, color: ink })
      })
      y -= 30
    } else {
      text("(sin datos de tendencia para el periodo)", { size: 9, color: grey })
      y -= 16
    }

    // Analisis
    if (datos.analisis) {
      y -= 4
      text("Analisis del periodo:", { font: bold, size: 10, color: navy })
      y -= 13
      for (const ln of wrap(datos.analisis, 10, reg, cw)) {
        text(ln, { size: 10 })
        y -= 13
      }
    }

    // Pie
    const hoy = new Date().toISOString().slice(0, 10)
    page.drawText(sanit(`Generado por LIPgo el ${hoy} · SG-SST / SIG`), { x: margin, y: 32, size: 8, font: reg, color: grey })

    const bytes = await pdf.save()
    const base64 = Buffer.from(bytes).toString("base64")
    const safe = String(f.nombre || "indicador").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    return { success: true, base64, fileName: `Ficha_${safe}.pdf` }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error generando el PDF" }
  }
}
