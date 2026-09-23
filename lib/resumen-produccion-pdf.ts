// ---------------------------------------------------------------------------
// PDF DEL CIERRE DIARIO DE PRODUCCIÓN
//
// Mismo patrón que lib/anexo-facturacion-pdf.ts: isomórfico (sin "use server"),
// jsPDF con imports dinámicos, devuelve el ArrayBuffer crudo. El caller decide
// si lo envuelve en un Blob para descargar o lo sube a Meta.
//
// EL LOGO VA EMBEBIDO EN BASE64, no se lee de `public/` ni se trae con fetch:
// en una función serverless de Vercel el rastreo de archivos no siempre
// arrastra lo que se lee dinámicamente, y el PDF saldría sin logo solo en
// producción --el peor sitio para descubrirlo--.
// ---------------------------------------------------------------------------

import type { ResumenProduccionDia } from "@/lib/resumen-produccion-dia"
import { LIP_LOGO_BASE64 } from "@/lib/lip-logo"

const NAVY: [number, number, number] = [13, 59, 110]
const VERDE: [number, number, number] = [5, 122, 85]
const AMBAR: [number, number, number] = [180, 83, 9]
const ROJO: [number, number, number] = [185, 28, 28]
const GRIS: [number, number, number] = [90, 90, 90]

/*
 * jsPDF tipa estos métodos con varias sobrecargas y no acepta el spread de una
 * tupla. Se pasan los tres componentes sueltos, en un ayudante, para no repetir
 * `color[0], color[1], color[2]` en cada llamada.
 */
type Color = [number, number, number]
const setText = (doc: any, c: Color) => doc.setTextColor(c[0], c[1], c[2])
const setFill = (doc: any, c: Color) => doc.setFillColor(c[0], c[1], c[2])

const num = (n: number) => Math.round(n).toLocaleString("es-CO")
const pct = (n: number) => `${n.toFixed(1)}%`

/** Minutos a "Xh YYm", que se lee mejor que "372 min". */
function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`
}

function fmtFecha(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

/** El color dice el estado de un vistazo, con los mismos cortes del dashboard. */
function colorPorValor(v: number, bueno: number, regular: number): [number, number, number] {
  if (v >= bueno) return VERDE
  if (v >= regular) return AMBAR
  return ROJO
}

export async function construirPdfResumenProduccion(
  r: ResumenProduccionDia,
  empresaNombre: string,
): Promise<ArrayBuffer> {
  const { default: jsPDF } = await import("jspdf")
  const autoTable = (await import("jspdf-autotable")).default

  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const MW = doc.internal.pageSize.getWidth()

  // --- Encabezado ---------------------------------------------------------
  try {
    doc.addImage(`data:image/png;base64,${LIP_LOGO_BASE64}`, "PNG", 40, 20, 100, 49)
  } catch {
    // Sin logo el PDF sigue sirviendo; no vale la pena tumbarlo por eso.
  }
  doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(...GRIS)
  doc.text("LIP PROGRESSIVE INTEGRAL LOGISTICS SAS · NIT 901725963-8", MW - 40, 30, {
    align: "right",
  })
  doc.text(empresaNombre, MW - 40, 42, { align: "right" })

  doc.setFontSize(15).setFont("helvetica", "bold").setTextColor(...NAVY)
  doc.text("CIERRE DIARIO DE PRODUCCIÓN", MW / 2, 92, { align: "center" })

  doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(...GRIS)
  const origen =
    r.origenVentana === "tolva"
      ? "según el Horario de Tolva"
      : r.origenVentana === "turnos"
        ? "según los turnos programados"
        : "con el horario por defecto"
  doc.text(
    `${fmtFecha(r.fecha)} · Jornada ${r.ventanaDesde}–${r.ventanaHasta} (${r.horasTurno.toFixed(1)} h, ${origen})`,
    MW / 2,
    108,
    { align: "center" },
  )

  // --- Los cuatro números de arriba ---------------------------------------
  let y = 134
  const anchoCaja = (MW - 80 - 30) / 4
  const cajas: Array<{ etiqueta: string; valor: string; sub: string }> = [
    { etiqueta: "Total bultos", valor: num(r.totalBultos), sub: `meta ${num(r.metaDia)}` },
    { etiqueta: "Estibas", valor: num(r.estibas), sub: "despachadas" },
    { etiqueta: "Arrume", valor: num(r.arrume), sub: "sin estibar" },
    { etiqueta: "Averías", valor: num(r.averias), sub: "con defecto" },
  ]

  cajas.forEach((c, i) => {
    const x = 40 + i * (anchoCaja + 10)
    doc.setDrawColor(220).setFillColor(248, 250, 252)
    doc.roundedRect(x, y, anchoCaja, 62, 4, 4, "FD")
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(...GRIS)
    doc.text(c.etiqueta.toUpperCase(), x + 10, y + 16)
    doc.setFontSize(18).setFont("helvetica", "bold").setTextColor(...NAVY)
    doc.text(c.valor, x + 10, y + 40)
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(...GRIS)
    doc.text(c.sub, x + 10, y + 54)
  })

  y += 82

  // --- OEE y sus tres componentes -----------------------------------------
  doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(...NAVY)
  doc.text("Eficiencia general (OEE)", 40, y)
  y += 8

  const colOee = colorPorValor(r.oee, 80, 60)
  doc.setDrawColor(220).setFillColor(248, 250, 252)
  doc.roundedRect(40, y, 150, 68, 4, 4, "FD")
  doc.setFontSize(26).setFont("helvetica", "bold"); setText(doc, colOee)
  doc.text(pct(r.oee), 115, y + 34, { align: "center" })
  doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(...GRIS)
  const juicio = r.oee >= 80 ? "Excelente" : r.oee >= 60 ? "Aceptable" : "Crítico"
  doc.text(juicio, 115, y + 50, { align: "center" })

  const comp: Array<{ etiqueta: string; valor: number; bueno: number; regular: number }> = [
    { etiqueta: "Disponibilidad", valor: r.disponibilidadPct, bueno: 90, regular: 75 },
    { etiqueta: "Rendimiento", valor: r.rendimientoPct, bueno: 95, regular: 80 },
    { etiqueta: "Calidad", valor: r.calidadPct, bueno: 98, regular: 95 },
  ]
  comp.forEach((c, i) => {
    const yy = y + i * 23
    const color = colorPorValor(c.valor, c.bueno, c.regular)
    doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(60)
    doc.text(c.etiqueta, 210, yy + 14)
    doc.setFont("helvetica", "bold").setTextColor(...color)
    doc.text(pct(c.valor), 320, yy + 14, { align: "right" })
    // Barra: el número solo no dice si 78% está cerca o lejos de lo esperado.
    doc.setFillColor(230, 230, 230).rect(334, yy + 7, MW - 374, 8, "F")
    doc.setFillColor(color[0], color[1], color[2])
    doc.rect(334, yy + 7, ((MW - 374) * Math.min(c.valor, 100)) / 100, 8, "F")
  })

  y += 88

  // --- Cumplimiento y tiempos ---------------------------------------------
  doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(...NAVY)
  doc.text("Cumplimiento y tiempos", 40, y)
  y += 6

  autoTable(doc, {
    startY: y,
    margin: { left: 40, right: 40 },
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    head: [["Indicador", "Valor", "Detalle"]],
    body: [
      [
        "Cumplimiento de meta",
        pct(r.cumplimientoPct),
        `${num(r.totalBultos)} de ${num(r.metaDia)} bultos`,
      ],
      [
        "Máquina trabajando",
        fmtMin(r.minTrabajando),
        `de ${fmtMin(r.minProgramado)} programados`,
      ],
      ["Máquina parada", fmtMin(r.minParada), `${pct(100 - r.disponibilidadPct)} del tiempo`],
    ],
  })

  y = (doc as any).lastAutoTable.finalY + 22

  // --- Paros ---------------------------------------------------------------
  doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(...NAVY)
  doc.text("Paros de la jornada", 40, y)
  y += 6

  const cuerpoParos: string[][] = [
    ["Paro total", fmtMin(r.parosMinutos), `${r.parosTotal} franjas`],
    [
      "Justificado",
      fmtMin(r.parosMinutosJustificados),
      `${r.parosJustificados} con motivo`,
    ],
    [
      "Sin justificar",
      fmtMin(r.parosMinutosSinJustificar),
      `${r.parosSinJustificar} sin motivo`,
    ],
  ]

  if (r.paroMasLargoSinJustificar) {
    cuerpoParos.push([
      "El más largo sin explicar",
      fmtMin(r.paroMasLargoSinJustificar.minutos),
      `entre ${r.paroMasLargoSinJustificar.inicio} y ${r.paroMasLargoSinJustificar.fin}`,
    ])
  }

  autoTable(doc, {
    startY: y,
    margin: { left: 40, right: 40 },
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    head: [["Concepto", "Tiempo", "Detalle"]],
    body: cuerpoParos,
  })

  y = (doc as any).lastAutoTable.finalY + 14

  if (r.parosPorCategoria.length) {
    doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(...GRIS)
    const chips = r.parosPorCategoria
      .map((c) => `${c.categoria}: ${fmtMin(c.minutos)}`)
      .join("   ·   ")
    doc.text(`Justificado por categoría — ${chips}`, 40, y, { maxWidth: MW - 80 })
    y += 18
  }

  // --- Producción por producto --------------------------------------------
  if (r.porProducto.length) {
    if (y > 620) {
      doc.addPage()
      y = 46
    }
    doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(...NAVY)
    doc.text("Producción por producto", 40, y)
    y += 6

    const tot = r.porProducto.reduce(
      (a, p) => ({
        bultos: a.bultos + p.bultos,
        estiba: a.estiba + p.estiba,
        arrume: a.arrume + p.arrume,
        averias: a.averias + p.averias,
      }),
      { bultos: 0, estiba: 0, arrume: 0, averias: 0 },
    )

    autoTable(doc, {
      startY: y,
      margin: { left: 40, right: 40 },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
      head: [["Producto", "Bultos", "Estiba", "Arrume", "Averías"]],
      body: r.porProducto.map((p) => [
        p.producto,
        num(p.bultos),
        num(p.estiba),
        num(p.arrume),
        num(p.averias),
      ]),
      foot: [
        [
          `Total (${r.porProducto.length})`,
          num(tot.bultos),
          num(tot.estiba),
          num(tot.arrume),
          num(tot.averias),
        ],
      ],
      footStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
    })

    y = (doc as any).lastAutoTable.finalY + 20
  }

  // --- Producción hora a hora ----------------------------------------------
  if (r.porHora.length) {
    if (y > 600) {
      doc.addPage()
      y = 46
    }
    doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(...NAVY)
    doc.text("Producción hora a hora", 40, y)
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(...GRIS)
    doc.text("Meta: 240 bultos/hora", MW - 40, y, { align: "right" })
    y += 12

    // Barras dibujadas a mano. Es más simple que una librería de gráficos y
    // no arrastra dependencias que jsPDF no entiende.
    const maxBultos = Math.max(240, ...r.porHora.map((h) => h.bultos))
    const anchoBarra = (MW - 80) / r.porHora.length
    const altoMax = 90

    // La línea de meta, para que las barras se lean contra algo.
    const yMeta = y + altoMax - (240 / maxBultos) * altoMax
    doc.setDrawColor(200).setLineDashPattern([2, 2], 0)
    doc.line(40, yMeta, MW - 40, yMeta)
    doc.setLineDashPattern([], 0)

    r.porHora.forEach((h, i) => {
      const alto = (h.bultos / maxBultos) * altoMax
      const x = 40 + i * anchoBarra
      setFill(doc, colorPorValor(h.bultos, 240, 200))
      doc.rect(x + 2, y + altoMax - alto, anchoBarra - 4, alto, "F")
      doc.setFontSize(6).setTextColor(...GRIS)
      doc.text(h.hora.slice(0, 2), x + anchoBarra / 2, y + altoMax + 10, { align: "center" })
      if (h.bultos > 0) {
        doc.setFontSize(6).setTextColor(60)
        doc.text(num(h.bultos), x + anchoBarra / 2, y + altoMax - alto - 3, { align: "center" })
      }
    })

    y += altoMax + 24
  }

  // --- Pie ------------------------------------------------------------------
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(150)
    doc.text(
      `Generado por LIPgo · ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}`,
      40,
      doc.internal.pageSize.getHeight() - 24,
    )
    doc.text(`${p} de ${paginas}`, MW - 40, doc.internal.pageSize.getHeight() - 24, {
      align: "right",
    })
  }

  return doc.output("arraybuffer")
}
