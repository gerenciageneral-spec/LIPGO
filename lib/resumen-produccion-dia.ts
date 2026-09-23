// ---------------------------------------------------------------------------
// CIFRAS DEL DÍA DE PRODUCCIÓN, CALCULADAS EN EL SERVIDOR
//
// El Dashboard de Producción (components/produccion/control-piso.tsx) calcula
// todo dentro del componente, en el navegador. Para mandar un PDF automático
// hace falta obtener las mismas cifras sin que nadie tenga la pantalla abierta.
//
// LAS FÓRMULAS SON COPIA LITERAL DE LAS DEL DASHBOARD, incluidas dos rarezas
// que NO se corrigen aquí a propósito:
//
//   1. `totalBultos` sale del contador de la máquina (el MAX de
//      `bultos_dia_acumulado`), mientras estibas, arrume y averías salen de la
//      vista agregada. Pueden no cuadrar entre sí.
//   2. El OEE mezcla las dos fuentes: el rendimiento usa el contador y la
//      calidad usa la vista.
//
// "Arreglarlas" haría que el PDF mostrara números distintos a los de la
// pantalla, y entonces nadie sabría cuál creer. Si algún día se corrigen, hay
// que corregir ambos lados a la vez.
//
// LA HORA ES LITERAL, NO UTC. `fecha_hora` guarda la hora de pared de Colombia
// etiquetada como UTC. Por eso los rangos se arman con los dígitos del día
// (...T00:00:00Z) y NO se convierte ninguna zona horaria. Convertirla correría
// todo cinco horas.
// ---------------------------------------------------------------------------

import {
  bogotaWallAsUtcMs,
  detectarParosEnVentana,
  nextDateStr,
  utcDateStr,
  type HistRowLike,
  type ParoDetectado,
} from "@/lib/paros-produccion"

/** Mismas constantes que el dashboard. */
const BUCKET_MIN = 2
const META_POR_HORA = 240
const META_2MIN = 10
const DEFAULT_SHIFT_START_HOUR = 6
const DEFAULT_SHIFT_END_HOUR = 20

export interface ResumenProduccionDia {
  fecha: string
  /** De dónde salió la jornada: horario de tolva, turnos o el valor por defecto. */
  origenVentana: "tolva" | "turnos" | "defecto"
  ventanaDesde: string
  ventanaHasta: string
  horasTurno: number

  totalBultos: number
  estibas: number
  arrume: number
  averias: number

  metaDia: number
  cumplimientoPct: number

  oee: number
  disponibilidadPct: number
  rendimientoPct: number
  calidadPct: number

  minTrabajando: number
  minParada: number
  minProgramado: number

  parosTotal: number
  parosMinutos: number
  parosJustificados: number
  parosMinutosJustificados: number
  parosSinJustificar: number
  parosMinutosSinJustificar: number
  parosPorCategoria: Array<{ categoria: string; minutos: number }>
  paroMasLargoSinJustificar: { minutos: number; inicio: string; fin: string } | null

  porProducto: Array<{
    producto: string
    bultos: number
    estiba: number
    arrume: number
    averias: number
  }>

  porHora: Array<{ hora: string; bultos: number }>
}

function minutosDeHora(hhmm: string | null): number | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(":").map(Number)
  if (!Number.isFinite(h)) return null
  return h * 60 + (Number.isFinite(m) ? m : 0)
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * Las cifras del día.
 *
 * `fecha` en formato YYYY-MM-DD; por omisión, hoy en hora de Colombia.
 */
export async function getResumenProduccionDia(
  sb: any,
  empresaId: number,
  fecha?: string,
): Promise<{ success: boolean; data?: ResumenProduccionDia; message?: string }> {
  try {
    const dia = fecha || utcDateStr()
    const desde = `${dia}T00:00:00Z`
    const hasta = `${nextDateStr(dia)}T00:00:00Z`

    // --- Los datos crudos, las mismas tres fuentes que el dashboard ---------
    const [agrupada, historial, detalle] = await Promise.all([
      sb
        .from("vw_produccion_agrupada_10m")
        .select("intervalo, total_bultos, total_averias, total_estibas, bultos_arrume")
        .gte("intervalo", desde)
        .lt("intervalo", hasta),
      sb
        .from("historial_intervalos")
        .select("fecha_hora, bultos_dia_acumulado, produccion_2min")
        .gte("fecha_hora", desde)
        .lt("fecha_hora", hasta)
        .order("fecha_hora", { ascending: true }),
      sb
        .from("vw_produccion_dashboard")
        .select("fecha_hora, producto_nombre, tipo_empaque, bultos_procesados, averias")
        .gte("fecha_hora", desde)
        .lt("fecha_hora", hasta),
    ])

    const agr = agrupada.data ?? []
    const hist: HistRowLike[] = historial.data ?? []
    const det = detalle.data ?? []

    // --- La jornada --------------------------------------------------------
    // Misma cascada del dashboard: horario de tolva, luego turnos programados,
    // luego el valor por defecto.
    let desdeMin = DEFAULT_SHIFT_START_HOUR * 60
    let hastaMin = DEFAULT_SHIFT_END_HOUR * 60
    let origenVentana: ResumenProduccionDia["origenVentana"] = "defecto"

    const { data: horario } = await sb
      .from("horario_tolva")
      .select("turno, hora_inicio, hora_fin")
      .eq("idempresa", empresaId)
      .eq("fecha", dia)

    if (horario?.length) {
      const inicios = horario.map((h: any) => minutosDeHora(h.hora_inicio)).filter((x: any) => x != null)
      const fines = horario.map((h: any) => minutosDeHora(h.hora_fin)).filter((x: any) => x != null)
      if (inicios.length && fines.length) {
        desdeMin = Math.min(...(inicios as number[]))
        hastaMin = Math.max(...(fines as number[]))
        origenVentana = "tolva"
      }
    }

    if (origenVentana === "defecto") {
      const { data: turnos } = await sb
        .from("registroasistencia")
        .select("horaentradaprogramada, horasalidaprogramada")
        .eq("fecha", dia)
        .eq("puesto", "Auxiliar Mixto")
      if (turnos?.length) {
        const ent = turnos.map((t: any) => minutosDeHora(t.horaentradaprogramada)).filter((x: any) => x != null)
        const sal = turnos.map((t: any) => minutosDeHora(t.horasalidaprogramada)).filter((x: any) => x != null)
        if (ent.length && sal.length) {
          desdeMin = Math.min(...(ent as number[]))
          hastaMin = Math.max(...(sal as number[]))
          origenVentana = "turnos"
        }
      }
    }

    const horasTurno = Math.max((hastaMin - desdeMin) / 60, 0)
    const metaDia = META_POR_HORA * horasTurno

    // --- Los cuatro números de arriba --------------------------------------
    let totalVista = 0
    let estibas = 0
    let arrume = 0
    let averias = 0
    for (const a of agr) {
      totalVista += a.total_bultos || 0
      estibas += a.total_estibas || 0
      arrume += a.bultos_arrume || 0
      averias += a.total_averias || 0
    }

    /*
     * El contador se reinicia a 0 al cierre del día, así que se toma el MAX y
     * no la última lectura: si el PDF se genera después del reinicio, la última
     * sería 0 y el día entero aparecería vacío.
     */
    const maxAcum = hist.reduce((m, h: any) => Math.max(m, h.bultos_dia_acumulado || 0), 0)
    const totalBultos = maxAcum > 0 ? maxAcum : totalVista

    // --- Celdas de 2 minutos: disponibilidad y paros -----------------------
    const msDelDia = (min: number) => Date.parse(`${dia}T${hhmm(min)}:00Z`)
    const base = msDelDia(desdeMin)
    // `ceil` a propósito: redondear hacia abajo dejaría el último tramo sin
    // celda e inflaría la disponibilidad.
    const totalBuckets = Math.max(0, Math.ceil((hastaMin - desdeMin) / BUCKET_MIN))

    const porBucket = new Map<number, number>()
    for (const h of hist as any[]) {
      const t = Date.parse(h.fecha_hora)
      if (!Number.isFinite(t)) continue
      const start = t - (t % (BUCKET_MIN * 60000))
      porBucket.set(start, (porBucket.get(start) ?? 0) + (h.produccion_2min || 0))
    }

    const ultimoInst = hist.length ? Date.parse((hist[hist.length - 1] as any).fecha_hora) : null
    const esHoy = dia === utcDateStr()
    const corte = esHoy ? (ultimoInst ?? bogotaWallAsUtcMs(new Date())) : msDelDia(hastaMin)

    let activas = 0
    let caidas = 0
    for (let i = 0; i < totalBuckets; i++) {
      const start = base + i * BUCKET_MIN * 60000
      if (start > corte) continue // todavía no ocurrió
      if ((porBucket.get(start) ?? 0) > 0) activas++
      else caidas++
    }

    const minTrabajando = activas * BUCKET_MIN
    const minParada = caidas * BUCKET_MIN
    const minProgramado = minTrabajando + minParada
    const disponibilidadPct = minProgramado > 0 ? (minTrabajando / minProgramado) * 100 : 0

    // --- Rendimiento y OEE -------------------------------------------------
    const horasTranscurridas = Math.min(Math.max((corte - base) / 3_600_000, 0), horasTurno)
    const metaActual = Math.round(horasTranscurridas * META_POR_HORA)
    const cumplimientoPct =
      metaActual > 0 ? (totalBultos / metaActual) * 100 : totalBultos > 0 ? 100 : 0

    const rendimientoPct = Math.min(cumplimientoPct, 100)
    const calidadPct =
      totalVista + averias > 0 ? (totalVista / (totalVista + averias)) * 100 : 100
    const oee = (disponibilidadPct / 100) * (rendimientoPct / 100) * (calidadPct / 100) * 100

    // --- Paros -------------------------------------------------------------
    const detectados: ParoDetectado[] = detectarParosEnVentana(
      hist,
      dia,
      desdeMin,
      hastaMin,
      corte,
    )

    const { data: comentarios } = await sb
      .from("paros_produccion")
      .select("inicio, minutos, motivo, categoria")
      .eq("idempresa", empresaId)
      .eq("fecha", dia)

    const porInicio = new Map<string, any>()
    for (const c of comentarios ?? []) porInicio.set(String(c.inicio), c)

    let parosMinutos = 0
    let parosJustificados = 0
    let parosMinutosJustificados = 0
    const categorias = new Map<string, number>()
    let masLargoSinJustificar: ResumenProduccionDia["paroMasLargoSinJustificar"] = null

    for (const p of detectados) {
      parosMinutos += p.minutos
      const c = porInicio.get(p.inicioISO)
      if (c?.motivo) {
        parosJustificados++
        parosMinutosJustificados += p.minutos
        const cat = c.categoria || "Sin categoría"
        categorias.set(cat, (categorias.get(cat) ?? 0) + p.minutos)
      } else if (!masLargoSinJustificar || p.minutos > masLargoSinJustificar.minutos) {
        masLargoSinJustificar = { minutos: p.minutos, inicio: p.inicio, fin: p.fin }
      }
    }

    // --- Por producto ------------------------------------------------------
    // El split usa la MISMA regla del dashboard: lo que no es estiba cae en
    // arrume. Es distinto de los KPIs de arriba, que usan las columnas ya
    // calculadas de la vista.
    const prod = new Map<string, { bultos: number; estiba: number; arrume: number; averias: number }>()
    for (const d of det as any[]) {
      const nombre = d.producto_nombre || "Sin producto"
      const actual = prod.get(nombre) ?? { bultos: 0, estiba: 0, arrume: 0, averias: 0 }
      const bultos = d.bultos_procesados || 0
      actual.bultos += bultos
      actual.averias += d.averias || 0
      if (String(d.tipo_empaque || "").toLowerCase().includes("estiba")) actual.estiba += bultos
      else actual.arrume += bultos
      prod.set(nombre, actual)
    }

    // --- Por hora ----------------------------------------------------------
    const horas = new Map<number, number>()
    for (const h of hist as any[]) {
      const t = new Date(h.fecha_hora)
      const hora = t.getUTCHours()
      const min = hora * 60 + t.getUTCMinutes()
      if (min < desdeMin || min > hastaMin) continue
      horas.set(hora, (horas.get(hora) ?? 0) + (h.produccion_2min || 0))
    }

    return {
      success: true,
      data: {
        fecha: dia,
        origenVentana,
        ventanaDesde: hhmm(desdeMin),
        ventanaHasta: hhmm(hastaMin),
        horasTurno,
        totalBultos,
        estibas,
        arrume,
        averias,
        metaDia,
        cumplimientoPct,
        oee,
        disponibilidadPct,
        rendimientoPct,
        calidadPct,
        minTrabajando,
        minParada,
        minProgramado,
        parosTotal: detectados.length,
        parosMinutos,
        parosJustificados,
        parosMinutosJustificados,
        parosSinJustificar: detectados.length - parosJustificados,
        parosMinutosSinJustificar: parosMinutos - parosMinutosJustificados,
        parosPorCategoria: [...categorias.entries()]
          .map(([categoria, minutos]) => ({ categoria, minutos }))
          .sort((a, b) => b.minutos - a.minutos),
        paroMasLargoSinJustificar: masLargoSinJustificar,
        porProducto: [...prod.entries()]
          .map(([producto, v]) => ({ producto, ...v }))
          .sort((a, b) => b.bultos - a.bultos),
        porHora: [...horas.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([h, bultos]) => ({ hora: `${String(h).padStart(2, "0")}:00`, bultos })),
      },
    }
  } catch (e: any) {
    console.error("[v0] getResumenProduccionDia:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo calcular el resumen." }
  }
}
