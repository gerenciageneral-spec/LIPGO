/**
 * Funciones puras de calculo para el Dashboard Pedidos.
 *
 * Reglas:
 *   - Toda la logica vive aqui (testeable, sin dependencias React).
 *   - Las funciones reciben los arrays tal como llegan de Supabase y
 *     devuelven tipos primitivos o estructuras serializables que las
 *     tabs renderizan directamente.
 *   - Nunca lanzan: si los datos faltan, devuelven 0 / [] / null.
 */

import type { PedidoCabecera, PedidoDetalle } from "./types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convierte un string "YYYY-MM-DD" a milisegundos UTC, o null si falla. */
function parseDate(value?: string | null): number | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

/** Convierte "HH:MM" o "HH:MM:SS" a minutos desde medianoche, o null. */
function parseTimeToMinutes(value?: string | null): number | null {
  if (!value) return null
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (Number.isNaN(h) || Number.isNaN(min)) return null
  return h * 60 + min
}

const MS_PER_DAY = 86_400_000

function diffDays(a?: string | null, b?: string | null): number | null {
  const ta = parseDate(a)
  const tb = parseDate(b)
  if (ta === null || tb === null) return null
  return Math.round((ta - tb) / MS_PER_DAY)
}

// ---------------------------------------------------------------------------
// Alertas de cumplimiento
// ---------------------------------------------------------------------------

/**
 * Devuelve "hoy" en zona horaria America/Bogota truncado a YYYY-MM-DD,
 * convertido a milisegundos UTC. Lo usamos como ancla para calcular
 * dias restantes / atraso, asi el dashboard refleja la operacion en
 * tiempo del cliente sin importar el huso del navegador.
 */
function getHoyBogotaMs(): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  // en-CA produce siempre "YYYY-MM-DD"
  const today = fmt.format(new Date())
  return Date.parse(today)
}

/**
 * Año y mes actuales en zona horaria America/Bogota.
 * Devolvemos tambien el prefijo "YYYY-MM" para poder filtrar campos
 * de fecha en formato ISO con un simple `startsWith`.
 *
 * Lo usamos en la "Carga de Trabajo por Fecha Programada", que debe
 * mostrar SIEMPRE el mes en curso independientemente del filtro de
 * periodo del resto de la tab — el equipo de logistica necesita ver
 * el plan del mes actual aunque este consultando historicos.
 */
export function getBogotaCurrentYearMonth(): {
  year: number
  month: number
  prefix: string
  label: string
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  })
  const ym = fmt.format(new Date()) // "YYYY-MM"
  const year = Number(ym.slice(0, 4))
  const month = Number(ym.slice(5, 7))
  // Construimos un Date estable a mediodia para evitar offsets en el
  // formateador del nombre del mes.
  const labelFmt = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    month: "long",
    year: "numeric",
  })
  const label = labelFmt
    .format(new Date(`${ym}-15T12:00:00Z`))
    .replace(/^./, (ch) => ch.toUpperCase())
  return { year, month, prefix: ym, label }
}

/** Fila para la tabla "Alertas de Cumplimiento". */
export interface AlertaCumplimientoRow {
  idpedido: number
  cliente: string
  fecha: string | null // creacion
  fecha_programada: string // promesa (no nullable: la fila exige tenerla)
  diasDesdeCreacion: number | null
  /**
   * Dias firmados respecto a hoy:
   *   > 0 -> faltan N dias para vencer la promesa.
   *   = 0 -> vence hoy.
   *   < 0 -> esta atrasado por |N| dias.
   */
  diasParaCumplir: number
  estado: "Vence hoy" | "Por vencer" | "Atrasado"
  total_pagar: number
}

/**
 * Pedidos con `fecha_programada` definida pero sin `fechaordencargue`.
 * Es decir: prometidos al cliente y aun no entregados.
 *
 * Para cada uno calcula:
 *   - `diasParaCumplir` (signed) = fecha_programada - hoy (Bogota).
 *     Positivo = aun hay tiempo. Negativo = atrasado.
 *   - `estado` derivado del signo: "Atrasado" / "Vence hoy" / "Por vencer".
 *
 * Orden de salida (mas critico primero):
 *   1) Atrasados, mayor atraso primero (diasParaCumplir mas negativo).
 *   2) Vence hoy.
 *   3) Por vencer, menos dias restantes primero.
 */
export function calcAlertasCumplimiento(
  cabecera: PedidoCabecera[],
): AlertaCumplimientoRow[] {
  const hoy = getHoyBogotaMs()
  const out: AlertaCumplimientoRow[] = []

  for (const p of cabecera) {
    const programadaMs = parseDate(p.fecha_programada)
    if (programadaMs === null) continue
    // Si ya tiene fechaordencargue, NO es alerta (ya se entrego).
    if (parseDate(p.fechaordencargue) !== null) continue

    const diasParaCumplir = Math.round((programadaMs - hoy) / MS_PER_DAY)
    const estado: AlertaCumplimientoRow["estado"] =
      diasParaCumplir < 0
        ? "Atrasado"
        : diasParaCumplir === 0
          ? "Vence hoy"
          : "Por vencer"

    // Dias desde creacion (cuanto lleva el pedido en el pipeline). Si
    // la fecha de creacion no es valida o es posterior a hoy (raro,
    // pero defensivo) devolvemos null para no mostrar negativos
    // confusos en la UI.
    const fechaMs = parseDate(p.fecha)
    const diasDesdeCreacion =
      fechaMs !== null && fechaMs <= hoy
        ? Math.round((hoy - fechaMs) / MS_PER_DAY)
        : null

    out.push({
      idpedido: p.idpedido,
      cliente: (p.cliente || "—").trim(),
      fecha: p.fecha ?? null,
      fecha_programada: p.fecha_programada as string,
      diasDesdeCreacion,
      diasParaCumplir,
      estado,
      total_pagar: Number(p.total_pagar) || 0,
    })
  }

  return out.sort((a, b) => {
    // Primero los atrasados (mas negativos arriba), luego los demas
    // por orden ascendente: vence hoy, por vencer cercanos, etc.
    return a.diasParaCumplir - b.diasParaCumplir
  })
}

// ---------------------------------------------------------------------------
// Banner de alertas
// ---------------------------------------------------------------------------

/**
 * Cuenta cuantos pedidos no estan totalmente aprobados.
 * Un pedido esta "pendiente" si:
 *   - revisioncartera != "Aprobado" (case-insensitive), O
 *   - revisiongerencia != "Aprobado"
 *
 * El comparador es lenient: trata null/empty como pendiente.
 */
export function countPendientesAprobacion(cabecera: PedidoCabecera[]): number {
  return cabecera.filter((p) => {
    const cartera = (p.revisioncartera || "").trim().toLowerCase()
    const gerencia = (p.revisiongerencia || "").trim().toLowerCase()
    return cartera !== "aprobado" || gerencia !== "aprobado"
  }).length
}

// ---------------------------------------------------------------------------
// TAB 1: Centro de Comando Operativo
// ---------------------------------------------------------------------------

/**
 * % Entregas a tiempo: pedidos con `fechaordencargue` (entrega real)
 * <= `fecha_programada` (promesa de venta), sobre el total de pedidos
 * que tienen ambos campos. Devuelve un float 0-100 (no string).
 *
 * Convencion de fechas:
 *   - `fecha`             = fecha de creacion del pedido.
 *   - `fecha_programada`  = fecha prometida al cliente.
 *   - `fechaordencargue`  = fecha de entrega real / orden de cargue.
 */
export function calcEntregasATiempoPct(cabecera: PedidoCabecera[]): number {
  let valid = 0
  let onTime = 0
  for (const p of cabecera) {
    const entregada = parseDate(p.fechaordencargue)
    const prometida = parseDate(p.fecha_programada)
    if (entregada === null || prometida === null) continue
    valid++
    if (entregada <= prometida) onTime++
  }
  if (valid === 0) return 0
  return (onTime / valid) * 100
}

/**
 * % In-Full: lineas de detalle marcadas como completas sobre el total.
 * Una linea es "completa" si in_Full == 1 OR unidadespendientes == 0.
 */
export function calcInFullPct(detalle: PedidoDetalle[]): number {
  if (detalle.length === 0) return 0
  let full = 0
  for (const d of detalle) {
    if (d.in_Full === 1 || (d.unidadespendientes ?? null) === 0) full++
  }
  return (full / detalle.length) * 100
}

/**
 * OTIF Global por pedido: cuenta los pedidos donde la cabecera fue
 * entregada a tiempo Y todas sus lineas de detalle estan in_full.
 * Devuelve % sobre el total de pedidos que tienen al menos una linea
 * con datos suficientes para evaluar.
 */
export function calcOtifGlobalPct(
  cabecera: PedidoCabecera[],
  detalle: PedidoDetalle[],
): number {
  // Indice de detalles por idpedido para evitar O(N*M).
  const detallesPorPedido = new Map<number, PedidoDetalle[]>()
  for (const d of detalle) {
    const arr = detallesPorPedido.get(d.idpedido) ?? []
    arr.push(d)
    detallesPorPedido.set(d.idpedido, arr)
  }

  let evaluables = 0
  let cumplen = 0
  for (const p of cabecera) {
    // OTIF cruza on-time (fechaordencargue vs fecha_programada) y
    // in-full (todas las lineas completas o sin pendientes).
    const entregada = parseDate(p.fechaordencargue)
    const prometida = parseDate(p.fecha_programada)
    const lineas = detallesPorPedido.get(p.idpedido) ?? []
    if (entregada === null || prometida === null || lineas.length === 0) continue

    evaluables++
    const onTime = entregada <= prometida
    const allFull = lineas.every(
      (d) => d.in_Full === 1 || (d.unidadespendientes ?? null) === 0,
    )
    if (onTime && allFull) cumplen++
  }
  if (evaluables === 0) return 0
  return (cumplen / evaluables) * 100
}

/** Sumatoria del campo `demora` de cabecera (asumido en moneda). */
export function calcCostoDemoras(cabecera: PedidoCabecera[]): number {
  return cabecera.reduce((acc, p) => acc + (Number(p.demora) || 0), 0)
}

/** Sumatoria de peso_bascula de detalle (kg). */
export function calcVolumenDespachadoKg(detalle: PedidoDetalle[]): number {
  return detalle.reduce((acc, d) => acc + (Number(d.peso_bascula) || 0), 0)
}

/**
 * Toneladas por dia: agrupa el `peso` (peso teorico/pedido) del detalle
 * cruzando con la fecha de la cabecera (idpedido es la llave). Devuelve
 * un array ordenado por fecha ascendente, ya en TONELADAS (peso / 1000).
 *
 * NOTA: anteriormente se usaba `peso_bascula` (peso real pesado), pero
 * el indicador de Centro de Comando refleja la TONELADA PEDIDA del dia,
 * que viene del campo `peso` y debe dividirse por 1000 para convertir
 * de kg a toneladas.
 */
export function calcToneladasPorDia(
  cabecera: PedidoCabecera[],
  detalle: PedidoDetalle[],
): Array<{ fecha: string; toneladas: number }> {
  const fechaPorPedido = new Map<number, string>()
  for (const p of cabecera) {
    if (p.fecha) fechaPorPedido.set(p.idpedido, p.fecha)
  }

  const acc = new Map<string, number>()
  for (const d of detalle) {
    const fecha = fechaPorPedido.get(d.idpedido)
    if (!fecha) continue
    acc.set(fecha, (acc.get(fecha) ?? 0) + (Number(d.peso) || 0))
  }

  return Array.from(acc.entries())
    .map(([fecha, kg]) => ({ fecha, toneladas: kg / 1000 }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}

/**
 * Top N vehiculos por numero de despachos (apariciones en cabecera).
 * Ignora vacios y normaliza espacios.
 */
export function calcTopVehiculos(
  cabecera: PedidoCabecera[],
  topN = 5,
): Array<{ vehiculo: string; despachos: number }> {
  const acc = new Map<string, number>()
  for (const p of cabecera) {
    const v = (p.vehiculo || "").trim()
    if (!v) continue
    acc.set(v, (acc.get(v) ?? 0) + 1)
  }
  return Array.from(acc.entries())
    .map(([vehiculo, despachos]) => ({ vehiculo, despachos }))
    .sort((a, b) => b.despachos - a.despachos)
    .slice(0, topN)
}

/**
 * Top N destinos por numero de despachos (apariciones en cabecera).
 * Lee `pedidoscabecera.destino` y normaliza espacios. Ignora vacios.
 */
export function calcTopDestinos(
  cabecera: PedidoCabecera[],
  topN = 5,
): Array<{ destino: string; despachos: number }> {
  const acc = new Map<string, number>()
  for (const p of cabecera) {
    const d = (p.destino || "").trim()
    if (!d) continue
    acc.set(d, (acc.get(d) ?? 0) + 1)
  }
  return Array.from(acc.entries())
    .map(([destino, despachos]) => ({ destino, despachos }))
    .sort((a, b) => b.despachos - a.despachos)
    .slice(0, topN)
}

// ---------------------------------------------------------------------------
// TAB 2: Tiempos y Cuellos de Botella
// ---------------------------------------------------------------------------

/**
 * Scatter: cada punto representa un pedido.
 *   - x: tiempo en cartera en MINUTOS (entrega - recibido).
 *   - y: total_pagar.
 *   - meta: idpedido + cliente, util para tooltip.
 *
 * Excluye pedidos sin alguno de los dos datos.
 */
export function calcScatterCarteraVsValor(
  cabecera: PedidoCabecera[],
): Array<{ x: number; y: number; idpedido: number; cliente: string }> {
  const out: Array<{ x: number; y: number; idpedido: number; cliente: string }> = []
  for (const p of cabecera) {
    const recibido = parseTimeToMinutes(p.hora_recibido_cartera)
    const entregado = parseTimeToMinutes(p.hora_entrega_cartera)
    if (recibido === null || entregado === null) continue
    const tiempo = entregado - recibido
    if (tiempo < 0) continue // ignora horas invertidas
    const valor = Number(p.total_pagar) || 0
    if (valor <= 0) continue
    out.push({
      x: tiempo,
      y: valor,
      idpedido: p.idpedido,
      cliente: (p.cliente || "—").trim(),
    })
  }
  return out
}

/**
 * Promesa vs Realidad por cliente. Para los Top N clientes con mas
 * pedidos calcula:
 *   - prometidos: avg(fecha_programada - fecha)         (lead time prometido)
 *   - reales:     avg(fechaordencargue - fecha)         (lead time real)
 *
 * Donde:
 *   `fecha`             = creacion del pedido
 *   `fecha_programada`  = entrega prometida
 *   `fechaordencargue`  = entrega real (orden de cargue)
 */
export function calcPromesaVsRealidad(
  cabecera: PedidoCabecera[],
  topN = 10,
): Array<{ cliente: string; prometidos: number; reales: number }> {
  const acc = new Map<
    string,
    { sumaPromesa: number; nPromesa: number; sumaReal: number; nReal: number; total: number }
  >()

  for (const p of cabecera) {
    const cliente = (p.cliente || "").trim()
    if (!cliente) continue
    const cur = acc.get(cliente) ?? {
      sumaPromesa: 0,
      nPromesa: 0,
      sumaReal: 0,
      nReal: 0,
      total: 0,
    }
    cur.total++
    const promesa = diffDays(p.fecha_programada, p.fecha)
    if (promesa !== null && promesa >= 0) {
      cur.sumaPromesa += promesa
      cur.nPromesa++
    }
    const real = diffDays(p.fechaordencargue, p.fecha)
    if (real !== null && real >= 0) {
      cur.sumaReal += real
      cur.nReal++
    }
    acc.set(cliente, cur)
  }

  return Array.from(acc.entries())
    .map(([cliente, v]) => ({
      cliente,
      prometidos: v.nPromesa > 0 ? v.sumaPromesa / v.nPromesa : 0,
      reales: v.nReal > 0 ? v.sumaReal / v.nReal : 0,
      _total: v.total,
    }))
    .sort((a, b) => b._total - a._total)
    .slice(0, topN)
    .map(({ _total, ...rest }) => rest)
}

// ---------------------------------------------------------------------------
// Tiempo de entrega mes a mes
// ---------------------------------------------------------------------------

/**
 * Tiempo promedio (en dias) que se tardan los pedidos por MES.
 *
 * Agrupa por `YYYY-MM` extraido de `cabecera.fecha` y para cada mes
 * calcula:
 *   - leadTimeReal:    avg(fechaordencargue - fecha)              (dias)
 *   - leadTimePromesa: avg(fecha_programada - fecha)              (dias)
 *   - delay:           avg(fechaordencargue - fecha_programada)   (dias, signed)
 *
 * Devuelve un array ordenado cronologicamente con `label` corto
 * ("Ene 25", "Feb 25") listo para el eje X de un line/area chart.
 */
export function calcLeadTimePorMes(
  cabecera: PedidoCabecera[],
): Array<{
  yearMonth: string
  label: string
  leadTimeReal: number
  leadTimePromesa: number
  delay: number
  pedidos: number
}> {
  const acc = new Map<
    string,
    {
      sumReal: number
      nReal: number
      sumPromesa: number
      nPromesa: number
      sumDelay: number
      nDelay: number
      pedidos: number
    }
  >()

  for (const p of cabecera) {
    if (!p.fecha) continue
    const ym = p.fecha.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(ym)) continue

    const cur =
      acc.get(ym) ?? {
        sumReal: 0,
        nReal: 0,
        sumPromesa: 0,
        nPromesa: 0,
        sumDelay: 0,
        nDelay: 0,
        pedidos: 0,
      }
    cur.pedidos++

    const real = diffDays(p.fechaordencargue, p.fecha)
    if (real !== null && real >= 0) {
      cur.sumReal += real
      cur.nReal++
    }
    const promesa = diffDays(p.fecha_programada, p.fecha)
    if (promesa !== null && promesa >= 0) {
      cur.sumPromesa += promesa
      cur.nPromesa++
    }
    const delay = diffDays(p.fechaordencargue, p.fecha_programada)
    if (delay !== null) {
      cur.sumDelay += delay
      cur.nDelay++
    }

    acc.set(ym, cur)
  }

  const MES_LABELS = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ]

  return Array.from(acc.entries())
    .map(([ym, v]) => {
      const [y, m] = ym.split("-").map(Number)
      const label = `${MES_LABELS[m - 1] ?? m} ${String(y).slice(-2)}`
      return {
        yearMonth: ym,
        label,
        leadTimeReal: v.nReal > 0 ? v.sumReal / v.nReal : 0,
        leadTimePromesa: v.nPromesa > 0 ? v.sumPromesa / v.nPromesa : 0,
        delay: v.nDelay > 0 ? v.sumDelay / v.nDelay : 0,
        pedidos: v.pedidos,
      }
    })
    .sort((a, b) => (a.yearMonth < b.yearMonth ? -1 : 1))
}

// ---------------------------------------------------------------------------
// Insights adicionales
// ---------------------------------------------------------------------------

/**
 * Lead time real promedio en dias = avg(fechaordencargue - fecha) sobre
 * pedidos con ambos campos validos. 0 si no hay pedidos evaluables.
 */
export function calcLeadTimeRealProm(cabecera: PedidoCabecera[]): number {
  let suma = 0
  let n = 0
  for (const p of cabecera) {
    const d = diffDays(p.fechaordencargue, p.fecha)
    if (d !== null && d >= 0) {
      suma += d
      n++
    }
  }
  return n === 0 ? 0 : suma / n
}

/**
 * Lead time prometido promedio en dias = avg(fecha_programada - fecha).
 * Comparado con `calcLeadTimeRealProm` da el "gap" promesa-realidad.
 */
export function calcLeadTimePromesaProm(cabecera: PedidoCabecera[]): number {
  let suma = 0
  let n = 0
  for (const p of cabecera) {
    const d = diffDays(p.fecha_programada, p.fecha)
    if (d !== null && d >= 0) {
      suma += d
      n++
    }
  }
  return n === 0 ? 0 : suma / n
}

/**
 * Dias promedio de retraso (solo pedidos atrasados).
 * Si entregada > prometida, contamos la diferencia. Util para responder
 * "cuando llegamos tarde, ¿por cuanto?" sin que las entregas a tiempo
 * diluyan el promedio.
 */
export function calcDelayDaysProm(cabecera: PedidoCabecera[]): number {
  let suma = 0
  let n = 0
  for (const p of cabecera) {
    const entregada = parseDate(p.fechaordencargue)
    const prometida = parseDate(p.fecha_programada)
    if (entregada === null || prometida === null) continue
    if (entregada > prometida) {
      suma += Math.round((entregada - prometida) / MS_PER_DAY)
      n++
    }
  }
  return n === 0 ? 0 : suma / n
}

/**
 * Conteos de entregas: a tiempo / atrasados / sin datos suficientes.
 * Sirve para mostrar tarjetas con counters que sumen el total y un
 * StackedBar de "estado de entrega" claro al gerente.
 */
export function calcResumenEntregas(cabecera: PedidoCabecera[]): {
  aTiempo: number
  atrasados: number
  sinDatos: number
} {
  let aTiempo = 0
  let atrasados = 0
  let sinDatos = 0
  for (const p of cabecera) {
    const entregada = parseDate(p.fechaordencargue)
    const prometida = parseDate(p.fecha_programada)
    if (entregada === null || prometida === null) {
      sinDatos++
    } else if (entregada <= prometida) {
      aTiempo++
    } else {
      atrasados++
    }
  }
  return { aTiempo, atrasados, sinDatos }
}

/**
 * Distribucion de pedidos por `estado` (cabecera). Devuelve top N + un
 * agregado "Otros" para que el donut/lista no se sature de categorias
 * con 1-2 pedidos. Util para visualizar a alto nivel "donde estan
 * parados los pedidos".
 */
export function calcResumenPorEstado(
  cabecera: PedidoCabecera[],
  topN = 6,
): Array<{ estado: string; pedidos: number }> {
  const acc = new Map<string, number>()
  for (const p of cabecera) {
    const e = (p.estado || "").trim() || "Sin estado"
    acc.set(e, (acc.get(e) ?? 0) + 1)
  }
  const entries = Array.from(acc.entries())
    .map(([estado, pedidos]) => ({ estado, pedidos }))
    .sort((a, b) => b.pedidos - a.pedidos)

  if (entries.length <= topN) return entries
  const top = entries.slice(0, topN)
  const restoCount = entries
    .slice(topN)
    .reduce((acc, e) => acc + e.pedidos, 0)
  if (restoCount > 0) top.push({ estado: "Otros", pedidos: restoCount })
  return top
}

/**
 * Top N vendedores por monto facturado (suma total_pagar). Util para
 * complementar el centro de comando con quien esta moviendo la aguja.
 */
export function calcTopVendedores(
  cabecera: PedidoCabecera[],
  topN = 5,
): Array<{ vendedor: string; pedidos: number; ventas: number }> {
  const acc = new Map<string, { pedidos: number; ventas: number }>()
  for (const p of cabecera) {
    const v = (p.vendedor || "").trim()
    if (!v) continue
    const cur = acc.get(v) ?? { pedidos: 0, ventas: 0 }
    cur.pedidos++
    cur.ventas += Number(p.total_pagar) || 0
    acc.set(v, cur)
  }
  return Array.from(acc.entries())
    .map(([vendedor, v]) => ({ vendedor, ...v }))
    .sort((a, b) => b.ventas - a.ventas)
    .slice(0, topN)
}

/** Top N clientes por total facturado. */
export function calcTopClientes(
  cabecera: PedidoCabecera[],
  topN = 5,
): Array<{ cliente: string; pedidos: number; ventas: number }> {
  const acc = new Map<string, { pedidos: number; ventas: number }>()
  for (const p of cabecera) {
    const c = (p.cliente || "").trim()
    if (!c) continue
    const cur = acc.get(c) ?? { pedidos: 0, ventas: 0 }
    cur.pedidos++
    cur.ventas += Number(p.total_pagar) || 0
    acc.set(c, cur)
  }
  return Array.from(acc.entries())
    .map(([cliente, v]) => ({ cliente, ...v }))
    .sort((a, b) => b.ventas - a.ventas)
    .slice(0, topN)
}

/** Total de pedidos analizables y total facturado, para contextos KPI. */
export function calcResumenGlobal(cabecera: PedidoCabecera[]): {
  totalPedidos: number
  totalFacturado: number
  ticketPromedio: number
} {
  const totalPedidos = cabecera.length
  let totalFacturado = 0
  for (const p of cabecera) totalFacturado += Number(p.total_pagar) || 0
  const ticketPromedio = totalPedidos > 0 ? totalFacturado / totalPedidos : 0
  return { totalPedidos, totalFacturado, ticketPromedio }
}

/**
 * Alertas internas: pedidos donde revisioncartera no es "Aprobado".
 * Devuelve una proyeccion de las columnas que la tabla muestra.
 */
export interface AlertaInternaRow {
  idpedido: number
  cliente: string
  hora_recibido_cartera: string
  obs_cartera: string
  total_pagar: number
}

export function calcAlertasCartera(
  cabecera: PedidoCabecera[],
): AlertaInternaRow[] {
  const out: AlertaInternaRow[] = []
  for (const p of cabecera) {
    const cartera = (p.revisioncartera || "").trim().toLowerCase()
    if (cartera === "aprobado") continue
    out.push({
      idpedido: p.idpedido,
      cliente: (p.cliente || "—").trim(),
      hora_recibido_cartera: p.hora_recibido_cartera || "—",
      obs_cartera: (p.obs_cartera || "").trim() || "—",
      total_pagar: Number(p.total_pagar) || 0,
    })
  }
  // Mas costosos primero — el gerente quiere ver los criticos arriba.
  return out.sort((a, b) => b.total_pagar - a.total_pagar)
}

// ---------------------------------------------------------------------------
// TAB 3: Eficiencia de Carga e In-Full
// ---------------------------------------------------------------------------

/** Total de unidades pendientes (sumatoria del campo en detalle). */
export function calcTotalUnidadesPendientes(detalle: PedidoDetalle[]): number {
  return detalle.reduce((acc, d) => acc + (Number(d.unidadespendientes) || 0), 0)
}

/**
 * Precision de bascula en %: (sum(peso_bascula) / sum(peso)) * 100.
 * Si sum(peso) es 0 devuelve 0 para no dividir por cero.
 */
export function calcPrecisionBasculaPct(detalle: PedidoDetalle[]): number {
  let sumBascula = 0
  let sumTeorico = 0
  for (const d of detalle) {
    sumBascula += Number(d.peso_bascula) || 0
    sumTeorico += Number(d.peso) || 0
  }
  if (sumTeorico === 0) return 0
  return (sumBascula / sumTeorico) * 100
}

/**
 * Tasa de carga perfecta: % de lineas donde unidades pedidas == cargadas.
 * Acepta tanto `unidades_cargadas` como `unidadescargadas` (ambos
 * existen en el schema); se prefiere el mas reciente (`unidadescargadas`).
 * Solo cuenta lineas con ambos campos numericos definidos.
 */
export function calcTasaCargaPerfectaPct(detalle: PedidoDetalle[]): number {
  let evaluables = 0
  let perfectas = 0
  for (const d of detalle) {
    const pedidas = d.unidades
    const cargadas = d.unidadescargadas ?? d.unidades_cargadas
    if (pedidas == null || cargadas == null) continue
    evaluables++
    if (Number(pedidas) === Number(cargadas)) perfectas++
  }
  if (evaluables === 0) return 0
  return (perfectas / evaluables) * 100
}

/**
 * % Cumplimiento global de entregas:
 *   sum(unidadescargadas) / sum(unidades) * 100
 *
 * Mide cuanto del total pedido se ha cargado efectivamente. Acepta
 * tanto `unidadescargadas` como `unidades_cargadas` por compatibilidad
 * con el schema. Lineas sin pedidas o sin cargadas se omiten para no
 * contaminar el numerador/denominador.
 */
export function calcCumplimientoGlobalPct(detalle: PedidoDetalle[]): number {
  let pedidas = 0
  let cargadas = 0
  for (const d of detalle) {
    const ped = d.unidades
    const car = d.unidadescargadas ?? d.unidades_cargadas
    if (ped == null || car == null) continue
    pedidas += Number(ped) || 0
    cargadas += Number(car) || 0
  }
  if (pedidas === 0) return 0
  return (cargadas / pedidas) * 100
}

/**
 * Series temporal mensual del % de cumplimiento de entregas.
 *
 * Cruza `pedidoscabecera.fechadeentrega` con `pedidosdetalle` por
 * `idpedido` y agrupa por mes (`YYYY-MM`). Para cada mes:
 *   - pedidas:   sum(unidades)
 *   - cargadas:  sum(unidadescargadas)
 *   - pendientes:sum(unidadespendientes)
 *   - cumplimiento: pedidas > 0 ? cargadas / pedidas * 100 : 0
 *
 * Usamos `fechadeentrega` (no `fecha` de creacion) porque el
 * cumplimiento se mide contra la fecha REAL de entrega al cliente:
 * agrupar por `fecha` mostraria "cuando se creo el pedido" en lugar
 * de "cuando se entrego", desplazando la serie y mezclando entregas
 * de meses distintos en el mismo bucket. Pedidos sin `fechadeentrega`
 * (aun no entregados) quedan fuera de la serie temporal, que es el
 * comportamiento correcto para un indicador de cumplimiento.
 *
 * Devuelve un array ordenado cronologicamente con `label` corto
 * ("Ene 25"), listo para alimentar un LineChart de Recharts.
 *
 * NO usa peso_bascula ni ningun calculo de bascula: se enfoca solo en
 * unidades pedidas vs cargadas, que es lo que realmente mide el
 * cumplimiento operativo.
 */
export function calcCumplimientoPorMes(
  cabecera: PedidoCabecera[],
  detalle: PedidoDetalle[],
): Array<{
  yearMonth: string
  label: string
  pedidas: number
  cargadas: number
  pendientes: number
  cumplimiento: number
}> {
  const fechaPorPedido = new Map<number, string>()
  for (const p of cabecera) {
    if (p.fechadeentrega) fechaPorPedido.set(p.idpedido, p.fechadeentrega)
  }

  const acc = new Map<
    string,
    { pedidas: number; cargadas: number; pendientes: number }
  >()

  for (const d of detalle) {
    const fecha = fechaPorPedido.get(d.idpedido)
    if (!fecha) continue
    const ym = fecha.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(ym)) continue

    const cur = acc.get(ym) ?? { pedidas: 0, cargadas: 0, pendientes: 0 }
    const ped = Number(d.unidades) || 0
    const car = Number(d.unidadescargadas ?? d.unidades_cargadas ?? 0) || 0
    const pend = Number(d.unidadespendientes) || 0
    cur.pedidas += ped
    cur.cargadas += car
    cur.pendientes += pend
    acc.set(ym, cur)
  }

  const MES_LABELS = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ]

  return Array.from(acc.entries())
    .map(([ym, v]) => {
      const [y, m] = ym.split("-").map(Number)
      const label = `${MES_LABELS[m - 1] ?? m} ${String(y).slice(-2)}`
      return {
        yearMonth: ym,
        label,
        pedidas: v.pedidas,
        cargadas: v.cargadas,
        pendientes: v.pendientes,
        cumplimiento: v.pedidas > 0 ? (v.cargadas / v.pedidas) * 100 : 0,
      }
    })
    .sort((a, b) => (a.yearMonth < b.yearMonth ? -1 : 1))
}

/**
 * Filas con problemas de cumplimiento en unidades (sin involucrar
 * peso_bascula). Una fila entra si `unidadespendientes > 0` o si
 * `unidadescargadas < unidades` (entrega incompleta). Calcula el % de
 * cumplimiento por linea para que el gerente vea de un vistazo cuan
 * "lejos" estuvo cada despacho de ser perfecto.
 */
export interface BrechaCargaRow {
  idpedido: number
  producto: string
  unidades: number
  unidadescargadas: number | null
  unidadespendientes: number
  cumplimientoPct: number // 0..100, NaN-safe
}

export function calcBrechasCarga(
  detalle: PedidoDetalle[],
  topN = 50,
): BrechaCargaRow[] {
  const out: BrechaCargaRow[] = []
  for (const d of detalle) {
    const pedidas = Number(d.unidades) || 0
    const cargadasRaw = d.unidadescargadas ?? d.unidades_cargadas
    const cargadas = cargadasRaw != null ? Number(cargadasRaw) : null
    const pendientes = Number(d.unidadespendientes) || 0

    const incompleta = cargadas !== null && cargadas < pedidas
    if (pendientes <= 0 && !incompleta) continue

    const cumplimientoPct =
      pedidas > 0 && cargadas !== null
        ? Math.min(100, Math.max(0, (cargadas / pedidas) * 100))
        : 0

    out.push({
      idpedido: d.idpedido,
      producto: (d.producto || "—").trim(),
      unidades: pedidas,
      unidadescargadas: cargadas,
      unidadespendientes: pendientes,
      cumplimientoPct,
    })
  }
  // Mas criticos primero: menor cumplimiento, luego mayores pendientes.
  return out
    .sort((a, b) => {
      if (a.cumplimientoPct !== b.cumplimientoPct) {
        return a.cumplimientoPct - b.cumplimientoPct
      }
      return b.unidadespendientes - a.unidadespendientes
    })
    .slice(0, topN)
}

/**
 * Top N productos para el grafico compuesto. Por cada producto retorna
 * el promedio de unidades pedidas y el promedio de unidades pendientes.
 * Ordena por unidades pedidas descendente (los productos mas demandados
 * arriba, que son los relevantes para el gerente).
 */
export function calcCumplimientoPorProducto(
  detalle: PedidoDetalle[],
  topN = 10,
): Array<{ producto: string; pedidas: number; pendientes: number }> {
  const acc = new Map<
    string,
    { sumPedidas: number; sumPendientes: number; n: number }
  >()
  for (const d of detalle) {
    const producto = (d.producto || "").trim()
    if (!producto) continue
    const cur = acc.get(producto) ?? { sumPedidas: 0, sumPendientes: 0, n: 0 }
    cur.sumPedidas += Number(d.unidades) || 0
    cur.sumPendientes += Number(d.unidadespendientes) || 0
    cur.n++
    acc.set(producto, cur)
  }
  return Array.from(acc.entries())
    .map(([producto, v]) => ({
      producto,
      pedidas: v.n > 0 ? v.sumPedidas / v.n : 0,
      pendientes: v.n > 0 ? v.sumPendientes / v.n : 0,
    }))
    .sort((a, b) => b.pedidas - a.pedidas)
    .slice(0, topN)
}

/**
 * Desviacion absoluta de bascula por categoria: |peso - peso_bascula|
 * sumado por categoria, ordenado de mayor a menor.
 */
export function calcDesviacionBasculaPorCategoria(
  detalle: PedidoDetalle[],
): Array<{ categoria: string; desviacion: number }> {
  const acc = new Map<string, number>()
  for (const d of detalle) {
    const categoria = (d.categoria || "").trim() || "Sin categoría"
    const teorico = Number(d.peso) || 0
    const real = Number(d.peso_bascula) || 0
    const desv = Math.abs(teorico - real)
    if (desv === 0) continue
    acc.set(categoria, (acc.get(categoria) ?? 0) + desv)
  }
  return Array.from(acc.entries())
    .map(([categoria, desviacion]) => ({ categoria, desviacion }))
    .sort((a, b) => b.desviacion - a.desviacion)
}

/** Filas que muestran "fugas operativas" en la tabla de la tab 3. */
export interface FugaOperativaRow {
  idpedido: number
  producto: string
  unidades: number
  unidadescargadas: number | null
  unidadespendientes: number
  peso: number
  peso_bascula: number
  desviacionPct: number // % desviacion en peso vs teorico, signed
}

/**
 * Devuelve filas con problemas: unidades pendientes > 0 O desviacion
 * de bascula > umbral (default 5%) respecto al peso teorico. Las
 * lineas sin peso teorico no se evaluan por desviacion (se requiere
 * ese dato para el calculo del %).
 */
export function calcFugasOperativas(
  detalle: PedidoDetalle[],
  umbralPct = 5,
): FugaOperativaRow[] {
  const out: FugaOperativaRow[] = []
  for (const d of detalle) {
    const pendientes = Number(d.unidadespendientes) || 0
    const teorico = Number(d.peso) || 0
    const real = Number(d.peso_bascula) || 0
    const desviacionPct =
      teorico > 0 ? ((real - teorico) / teorico) * 100 : 0
    const tieneDesviacion =
      teorico > 0 && Math.abs(desviacionPct) > umbralPct
    if (pendientes <= 0 && !tieneDesviacion) continue
    out.push({
      idpedido: d.idpedido,
      producto: (d.producto || "—").trim(),
      unidades: Number(d.unidades) || 0,
      unidadescargadas: d.unidadescargadas ?? d.unidades_cargadas ?? null,
      unidadespendientes: pendientes,
      peso: teorico,
      peso_bascula: real,
      desviacionPct,
    })
  }
  // Mas criticos primero: pendientes desc, luego desviacion abs desc.
  return out.sort((a, b) => {
    if (b.unidadespendientes !== a.unidadespendientes) {
      return b.unidadespendientes - a.unidadespendientes
    }
    return Math.abs(b.desviacionPct) - Math.abs(a.desviacionPct)
  })
}

// ---------------------------------------------------------------------------
// TAB 4: Finanzas Logisticas y Rentabilidad
// ---------------------------------------------------------------------------

/** Sumatoria de fletes (cabecera). */
export function calcGastoTotalFletes(cabecera: PedidoCabecera[]): number {
  return cabecera.reduce((acc, p) => acc + (Number(p.flete) || 0), 0)
}

/** Sumatoria de descuentos (descuentopp + descuentoiva). */
export function calcTotalDescuentos(cabecera: PedidoCabecera[]): number {
  return cabecera.reduce(
    (acc, p) =>
      acc + (Number(p.descuentopp) || 0) + (Number(p.descuentoiva) || 0),
    0,
  )
}

/**
 * Ratio Flete/Ventas: (sum flete / sum total_pagar) * 100.
 * 0 si total_pagar es 0 (evita NaN).
 */
export function calcRatioFleteVentasPct(cabecera: PedidoCabecera[]): number {
  let flete = 0
  let ventas = 0
  for (const p of cabecera) {
    flete += Number(p.flete) || 0
    ventas += Number(p.total_pagar) || 0
  }
  if (ventas === 0) return 0
  return (flete / ventas) * 100
}

/**
 * Composicion de sobrecostos: dos categorias agregadas para un donut.
 * Excluye categorias con valor 0 para que el chart no muestre slices
 * vacios.
 */
export function calcComposicionSobrecostos(
  cabecera: PedidoCabecera[],
): Array<{ categoria: string; valor: number }> {
  let totalFlete = 0
  let totalDemora = 0
  for (const p of cabecera) {
    totalFlete += Number(p.flete) || 0
    totalDemora += Number(p.demora) || 0
  }
  const items = [
    { categoria: "Fletes", valor: totalFlete },
    { categoria: "Demoras", valor: totalDemora },
  ]
  return items.filter((i) => i.valor > 0)
}

/**
 * Top 5 clientes por total_pagar (cabecera). Para cada cliente devuelve
 * los componentes que se apilaran en la barra:
 *   - margen: total_pagar - flete - demora (puede ser negativo, lo
 *     clamp-eamos a 0 para que la barra apilada se vea bien; un cliente
 *     con margen negativo se reflejara con la suma flete+demora >=
 *     total_pagar, indicando que ESE cliente no es rentable).
 *   - flete: costo de flete agregado.
 *   - demora: costo de demora agregado.
 */
export function calcRentabilidadTopClientes(
  cabecera: PedidoCabecera[],
  topN = 5,
): Array<{
  cliente: string
  margen: number
  flete: number
  demora: number
  total_pagar: number
}> {
  const acc = new Map<
    string,
    { totalPagar: number; flete: number; demora: number }
  >()
  for (const p of cabecera) {
    const cliente = (p.cliente || "").trim()
    if (!cliente) continue
    const cur = acc.get(cliente) ?? { totalPagar: 0, flete: 0, demora: 0 }
    cur.totalPagar += Number(p.total_pagar) || 0
    cur.flete += Number(p.flete) || 0
    cur.demora += Number(p.demora) || 0
    acc.set(cliente, cur)
  }
  return Array.from(acc.entries())
    .map(([cliente, v]) => ({
      cliente,
      margen: Math.max(0, v.totalPagar - v.flete - v.demora),
      flete: v.flete,
      demora: v.demora,
      total_pagar: v.totalPagar,
    }))
    .sort((a, b) => b.total_pagar - a.total_pagar)
    .slice(0, topN)
}

/** Filas para la tabla financiera general (cabecera). */
export interface FinanzasRow {
  idpedido: number
  cliente: string
  condicion_pago: string
  total_pagar: number
  flete: number
  demora: number
  impactoLogisticoPct: number
}

/**
 * Resumen financiero por pedido. Para cada cabecera calcula el
 * "Impacto Logistico %" = (flete + demora) / total_pagar * 100.
 * Se filtran pedidos sin total_pagar para evitar divisiones por cero
 * (no aportan informacion al gerente).
 *
 * Ordenado por impacto descendente: los pedidos mas costosos
 * logisticamente arriba.
 */
export function calcResumenFinanciero(
  cabecera: PedidoCabecera[],
): FinanzasRow[] {
  const out: FinanzasRow[] = []
  for (const p of cabecera) {
    const total = Number(p.total_pagar) || 0
    if (total <= 0) continue
    const flete = Number(p.flete) || 0
    const demora = Number(p.demora) || 0
    out.push({
      idpedido: p.idpedido,
      cliente: (p.cliente || "—").trim(),
      condicion_pago: (p.condicion_pago || "—").trim(),
      total_pagar: total,
      flete,
      demora,
      impactoLogisticoPct: ((flete + demora) / total) * 100,
    })
  }
  return out.sort((a, b) => b.impactoLogisticoPct - a.impactoLogisticoPct)
}

// ---------------------------------------------------------------------------
// Formateo (helpers de presentacion)
// ---------------------------------------------------------------------------

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})
const NUM0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 })
const NUM1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 })

export const fmtCOP = (n: number) => COP.format(n)
export const fmtInt = (n: number) => NUM0.format(n)
export const fmtFloat1 = (n: number) => NUM1.format(n)
export const fmtPct = (n: number) => `${NUM1.format(n)}%`
export const fmtKg = (n: number) => `${NUM0.format(n)} kg`

// ---------------------------------------------------------------------------
// Carga de trabajo por fecha programada
// ---------------------------------------------------------------------------

/**
 * Una fila representa la carga proyectada para UN dia (un valor de
 * `fecha_programada`). El componente la usa para pintar barras
 * apiladas y el tooltip detalle.
 *
 * `toneladas*` se obtiene sumando `pedidosdetalle.peso` (kg) cruzado
 * por idpedido y dividiendo por 1000 para llevar a toneladas.
 */
/**
 * Representacion de UN pedido individual dentro de la carga del dia.
 * Lo necesita la card expansible para listar pedido x pedido el
 * cliente, las toneladas y el estado entregado/pendiente.
 */
export interface CargaTrabajoPedidoItem {
  idpedido: number
  pedido: string | null
  cliente: string | null
  destino: string | null
  vendedor: string | null
  estado: string | null
  /** Peso del pedido en toneladas (Σ pedidosdetalle.peso ÷ 1000). */
  toneladas: number
  /** true si tiene `fechaordencargue` -> ya salio del muelle. */
  entregado: boolean
}

export interface CargaTrabajoPorFecha {
  /** ISO YYYY-MM-DD — clave estable para sort/agrupacion. */
  fecha: string
  /** Etiqueta corta ("Lun 15 nov"). */
  label: string
  /** Etiqueta larga ("Lunes 15 nov 2025"). */
  labelLargo: string
  pedidosEntregados: number
  pedidosPendientes: number
  pedidosTotal: number
  toneladasEntregadas: number
  toneladasPendientes: number
  toneladasTotal: number
  /** Lista de pedidos del dia, ordenada: pendientes primero
   *  (mayor toneladas primero) y luego entregados. */
  pedidos: CargaTrabajoPedidoItem[]
  /** fecha_programada anterior a hoy y aun con pendientes -> bandera. */
  esAtrasado: boolean
  esHoy: boolean
  esFuturo: boolean
}

/**
 * Construye la "Carga de Trabajo" agrupada por `fecha_programada`.
 *
 * Reglas:
 *   - Pedidos sin `fecha_programada` se ignoran (no aportan plan).
 *   - Un pedido se considera "entregado" si tiene `fechaordencargue`.
 *   - El peso (kg) se suma desde `pedidosdetalle` cruzado por idpedido
 *     (un pedido puede tener varias lineas con peso) y se convierte
 *     a toneladas dividiendo por 1000.
 *   - Si `pedidosdetalle` no trae peso (null/0), la barra mostrara
 *     toneladas=0 pero el conteo de pedidos sigue siendo correcto.
 *   - El array sale ordenado por fecha ascendente para que el
 *     equipo de logistica vea primero "los proximos dias".
 */
export function calcCargaTrabajoPorFecha(
  cabecera: PedidoCabecera[],
  detalle: PedidoDetalle[],
): CargaTrabajoPorFecha[] {
  // 1) Sumar peso por idpedido en una sola pasada para evitar el O(n*m)
  //    que tendriamos al cruzar pedido por pedido contra todo `detalle`.
  const pesoKgPorPedido = new Map<number, number>()
  for (const d of detalle) {
    const peso = Number(d.peso ?? 0)
    if (!Number.isFinite(peso) || peso === 0) continue
    pesoKgPorPedido.set(
      d.idpedido,
      (pesoKgPorPedido.get(d.idpedido) ?? 0) + peso,
    )
  }

  // 2) Agrupar cabecera por fecha_programada (clave YYYY-MM-DD).
  //    Conservamos en cada bucket la lista cruda de items para que
  //    la card pueda mostrarlos al expandir el dia. El costo extra
  //    es despreciable: un pedido se almacena una sola vez.
  type Bucket = {
    pedidosEntregados: number
    pedidosPendientes: number
    pesoEntregadoKg: number
    pesoPendienteKg: number
    items: CargaTrabajoPedidoItem[]
  }
  const buckets = new Map<string, Bucket>()
  for (const c of cabecera) {
    const fechaProg = c.fecha_programada
    if (!fechaProg) continue
    // Aceptamos "YYYY-MM-DD" o "YYYY-MM-DDT…" tomando los primeros 10.
    const fecha = fechaProg.slice(0, 10)
    if (fecha.length !== 10) continue

    const peso = pesoKgPorPedido.get(c.idpedido) ?? 0
    const entregado = !!(c.fechaordencargue && c.fechaordencargue.trim())

    const cur = buckets.get(fecha) ?? {
      pedidosEntregados: 0,
      pedidosPendientes: 0,
      pesoEntregadoKg: 0,
      pesoPendienteKg: 0,
      items: [] as CargaTrabajoPedidoItem[],
    }
    if (entregado) {
      cur.pedidosEntregados++
      cur.pesoEntregadoKg += peso
    } else {
      cur.pedidosPendientes++
      cur.pesoPendienteKg += peso
    }
    cur.items.push({
      idpedido: c.idpedido,
      pedido: c.pedido ?? null,
      cliente: c.cliente ?? null,
      destino: c.destino ?? null,
      vendedor: c.vendedor ?? null,
      estado: c.estado ?? null,
      toneladas: peso / 1000,
      entregado,
    })
    buckets.set(fecha, cur)
  }

  // 3) Formatear etiquetas y banderas temporales.
  const hoy = getHoyBogotaMs()
  // El eje X mostrara dia + mes ("Lun 15 nov") para que el lector
  // pueda ubicar la barra rapidamente cuando el periodo cruza varios
  // meses. Mantenemos `weekday: short` para conservar el contexto de
  // la semana laboral.
  const fmtCorto = new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Bogota",
  })
  const fmtLargo = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  })

  const out: CargaTrabajoPorFecha[] = []
  for (const [fecha, b] of buckets.entries()) {
    const ms = parseDate(fecha)
    if (ms === null) continue
    // Date.parse de "YYYY-MM-DD" devuelve UTC midnight. Para
    // formatearlo en Bogota es mas seguro construir un Date con la
    // misma fecha pero medio dia (asi evitamos el offset que pueda
    // hacer caer el dia un cuadrante atras en navegadores).
    const date = new Date(ms + 12 * 3600_000)
    const pedidosTotal = b.pedidosEntregados + b.pedidosPendientes
    const toneladasEntregadas = b.pesoEntregadoKg / 1000
    const toneladasPendientes = b.pesoPendienteKg / 1000
    // Orden visual de la lista expandible:
    //   1) primero los pendientes (lo que el equipo debe mover)
    //   2) dentro de pendientes, mayor toneladas primero
    //   3) entregados al final, tambien por toneladas desc
    const items = b.items.slice().sort((a, z) => {
      if (a.entregado !== z.entregado) return a.entregado ? 1 : -1
      return z.toneladas - a.toneladas
    })
    out.push({
      fecha,
      label: fmtCorto.format(date).replace(/^./, (ch) => ch.toUpperCase()),
      labelLargo: fmtLargo.format(date).replace(/^./, (ch) => ch.toUpperCase()),
      pedidosEntregados: b.pedidosEntregados,
      pedidosPendientes: b.pedidosPendientes,
      pedidosTotal,
      toneladasEntregadas,
      toneladasPendientes,
      toneladasTotal: toneladasEntregadas + toneladasPendientes,
      pedidos: items,
      esAtrasado: ms < hoy && b.pedidosPendientes > 0,
      esHoy: ms === hoy,
      esFuturo: ms > hoy,
    })
  }

  out.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  return out
}

/** Resumen agregado de la carga proyectada (consumido por el header). */
export interface CargaTrabajoResumen {
  diasConCarga: number
  diasFuturoConPendientes: number
  pedidosPendientes: number
  toneladasPendientes: number
  pedidosAtrasados: number
  toneladasAtrasadas: number
}

export function calcCargaTrabajoResumen(
  rows: CargaTrabajoPorFecha[],
): CargaTrabajoResumen {
  const r: CargaTrabajoResumen = {
    diasConCarga: rows.length,
    diasFuturoConPendientes: 0,
    pedidosPendientes: 0,
    toneladasPendientes: 0,
    pedidosAtrasados: 0,
    toneladasAtrasadas: 0,
  }
  for (const row of rows) {
    r.pedidosPendientes += row.pedidosPendientes
    r.toneladasPendientes += row.toneladasPendientes
    if (row.esAtrasado) {
      r.pedidosAtrasados += row.pedidosPendientes
      r.toneladasAtrasadas += row.toneladasPendientes
    }
    if ((row.esHoy || row.esFuturo) && row.pedidosPendientes > 0) {
      r.diasFuturoConPendientes++
    }
  }
  return r
}
