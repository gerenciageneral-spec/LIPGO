// Anexo de facturación (PDF), consolidado por prefactura -- generado a partir
// del `soporte` YA CONGELADO de una prefactura aprobada (interfaz
// `SoporteLinea`, lib/facturacion-control-actions.ts). Isomórfico (mismo
// patrón de lib/aprobacion-turnos-pdf.ts): sin "use server", jsPDF con
// imports dinámicos, devuelve el ArrayBuffer crudo -- el caller decide si lo
// envuelve en Blob (navegador) o lo sube a Storage (Node, cron semanal de
// app/api/cron/anexos-pendientes/route.ts).
//
// Por qué NO se reusa `exportarAnexos()` (components/cuadro-control-facturacion.tsx):
// esa función corre solo en el navegador (carga el logo con `fetch` +
// `FileReader`, termina en `doc.save()` sin subir nada a Storage) y consume
// datos EN VIVO (`ControlFacturaFila[]`), no el `soporte` ya congelado de una
// prefactura -- no sirve para un cron sin sesión de navegador.
//
// Diferencia deliberada con `exportarAnexos()`: aquí se arma UN SOLO PDF
// consolidado (una sección por grupo owner×operación×unidad, con su
// subtotal, más un total general al final) en vez de un archivo por grupo --
// más simple para que el Coordinador maneje un solo archivo por prefactura.

import type { SoporteLinea, UnidadCobro } from "@/lib/facturacion-control-actions"

// Logo LIP embebido como base64 (public/lip-logo.png, 160×79px reales). Se
// embebe en el código -- no se lee con `fs` ni se hace `fetch` en tiempo de
// ejecución -- para que funcione igual en el navegador y en una función
// serverless de Vercel, donde el tracing de archivos no siempre arrastra lo
// que se lee dinámicamente de `public/`.
const LIP_LOGO_BASE64 =
  "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"

interface EmpresaAnexoPdf {
  nombre: string
  nit: string | null
  direccion: string | null
}

interface SoporteGrupoPdf {
  operacion: string
  unidad: UnidadCobro
  lineas: SoporteLinea[]
  cantidad: number
  valor: number
}

const money = (n: number) => "$ " + (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cantidadFmt = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })
const uLabel = (u?: UnidadCobro) => (u === "h" ? "h" : u === "turno" ? "turnos" : u === "u" ? "u" : "t")
const esTon = (u?: UnidadCobro) => u !== "h" && u !== "turno" && u !== "u"
const fmtFecha = (s: string | null) => {
  if (!s) return "-"
  const [y, m, d] = String(s).slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : String(s)
}

/** Agrupa por operación×unidad (bucket = grupoAnexo si viene, si no operacion) -- mismo criterio que `agruparSoporte()` de cuadro-control-facturacion.tsx, reimplementado aquí como función pura para no cruzar el límite server/cliente. */
function agruparSoportePdf(lineas: SoporteLinea[]): SoporteGrupoPdf[] {
  const map = new Map<string, SoporteGrupoPdf>()
  for (const l of lineas) {
    const op = l.grupoAnexo || l.operacion || "(sin operación)"
    const unidad = l.unidad || "t"
    const k = `${op}|||${unidad}`
    const g = map.get(k) || { operacion: op, unidad, lineas: [], cantidad: 0, valor: 0 }
    g.lineas.push(l)
    g.cantidad += Number(l.toneladas) || 0
    g.valor += Number(l.valor) || 0
    map.set(k, g)
  }
  return Array.from(map.values()).sort((a, b) => a.operacion.localeCompare(b.operacion, "es") || a.unidad.localeCompare(b.unidad))
}

export interface ConstruirAnexoParams {
  empresaProyecto: EmpresaAnexoPdf
  proyecto: string
  owner: string
  periodoDesde: string | null
  periodoHasta: string | null
  soporte: SoporteLinea[]
}

/** Construye el anexo de facturación (PDF) y devuelve sus bytes crudos. */
export async function construirPdfAnexoFacturacion(params: ConstruirAnexoParams): Promise<ArrayBuffer> {
  const { empresaProyecto, proyecto, owner, periodoDesde, periodoHasta, soporte } = params

  const { default: jsPDF } = await import("jspdf")
  const autoTable = (await import("jspdf-autotable")).default

  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const MW = doc.internal.pageSize.getWidth()
  const navy: [number, number, number] = [13, 59, 110]

  try {
    doc.addImage(`data:image/png;base64,${LIP_LOGO_BASE64}`, "PNG", 40, 20, 100, 49)
  } catch {}
  doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(90)
  doc.text("LIP PROGRESSIVE INTEGRAL LOGISTICS SAS · NIT 901725963-8", MW - 40, 30, { align: "right" })
  doc.text(`${empresaProyecto.nombre}${empresaProyecto.nit ? ` · NIT ${empresaProyecto.nit}` : ""}`, MW - 40, 42, { align: "right" })
  if (empresaProyecto.direccion) doc.text(empresaProyecto.direccion, MW - 40, 54, { align: "right" })

  doc.setFontSize(14).setFont("helvetica", "bold").setTextColor(...navy)
  doc.text(`ANEXO DE FACTURACIÓN — ${owner.toUpperCase()}`, MW / 2, 90, { align: "center" })
  doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(90)
  const periodo = periodoDesde || periodoHasta ? ` · ${fmtFecha(periodoDesde)} al ${fmtFecha(periodoHasta)}` : ""
  doc.text(`${proyecto}${periodo}`, MW / 2, 105, { align: "center" })

  const grupos = agruparSoportePdf(soporte)
  let y = 130
  let totalTon = 0
  let totalVal = 0

  for (const g of grupos) {
    if (y > 680) {
      doc.addPage()
      y = 40
    }
    const titulo = esTon(g.unidad) ? g.operacion : `${g.operacion} · Por unidad`
    doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(...navy)
    doc.text(titulo, 40, y)
    y += 6

    const filas = [...g.lineas]
      .sort((a, b) => String(a.fecha ?? "").localeCompare(String(b.fecha ?? "")))
      .map((l) => [
        fmtFecha(l.fecha),
        l.numeroorden,
        l.tiquete ?? "-",
        l.placa ?? "-",
        l.cliente ?? "-",
        l.producto ?? "-",
        `${cantidadFmt(l.toneladas)} ${uLabel(l.unidad)}`,
        money(l.tarifa),
        money(l.valor),
      ])

    autoTable(doc, {
      startY: y,
      margin: { left: 40, right: 40 },
      head: [["Fecha", "Orden", "Tiquete", "Placa", "Cliente", "Producto", "Cantidad", "Tarifa", "Valor"]],
      body: filas,
      foot: [["", "", "", "", "", "Subtotal", `${cantidadFmt(g.cantidad)} ${uLabel(g.unidad)}`, "", money(g.valor)]],
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: navy, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        5: { cellWidth: 130 },
        7: { halign: "right" },
        8: { halign: "right" },
      },
    })

    y = (doc as any).lastAutoTable.finalY + 20
    if (esTon(g.unidad)) totalTon += g.cantidad
    totalVal += g.valor
  }

  if (y > 700) {
    doc.addPage()
    y = 40
  }
  doc.setFontSize(11).setFont("helvetica", "bold").setTextColor(...navy)
  doc.text(`TOTAL ANEXO: ${cantidadFmt(totalTon)} t · ${money(totalVal)}`, MW - 40, y, { align: "right" })

  return doc.output("arraybuffer")
}
