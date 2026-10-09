/**
 * CUADRE POR ORDEN: cada orden del proyecto contra lo que de verdad movió en el inventario.
 *
 * Módulo PURO (sin "use server", sin base de datos) para poder probarlo. Lo usa
 * `getCuadrePorOrden` (lib/transacciones-codigo-actions.ts) y la pestaña "Cuadre por
 * orden" de Transacciones de Inventario.
 *
 * LA PREGUNTA DE GERENCIA (2026-10-08): "necesito una tabla que tenga el pedido, la orden
 * de cargue, cantidad de la orden, cantidad despachada y que marque la diferencia; si la
 * orden es de descargue manual o de autodescargue debe verse como un ingreso".
 *
 * REGLAS
 *  - Una orden de CARGUE es una SALIDA: lo que la orden autorizó (detalleoc) contra las
 *    salidas 601 aprobadas que la citan (invtrans.ocargue). Igual que v_orden_vs_salidas.
 *  - Una orden de DESCARGUE (manual o autodescargue, clon de un cargue de planta) es un
 *    INGRESO: lo que la orden dice contra las entradas 101 aprobadas que la citan.
 *  - Distribución y Tolva no mueven inventario por diseño (la Distribución es un clon
 *    "+D" de un cargue y la Tolva es producción): se listan, no se cuadran.
 *  - Lo que entra o sale SIN número de orden no cuadra con nada: se muestra aparte, con
 *    quién lo hizo, para que se amarre o se explique.
 *  - El producto se compara normalizado (mayúsculas, sin espacios dobles): el mismo
 *    producto está escrito de varias formas en la base.
 */

export type SentidoOrden = "salida" | "ingreso" | "ninguno"

export type EstadoCuadre =
  | "cuadra"
  | "salio_menos"
  | "salio_mas"
  | "recibio_menos"
  | "recibio_mas"
  | "fuera_de_la_orden"
  | "sin_inventario"
  | "pendiente"
  | "en_curso"
  | "no_mueve"

export interface LineaCuadre {
  producto: string
  orden: number
  /** Lo que de verdad movió el inventario: en un cargue, lo despachado MENOS lo devuelto. */
  inventario: number
  diferencia: number
  /** Unidades que volvieron por mal cargue (654). Ya están descontadas de `inventario`. */
  devuelto?: number
}

/** Devolución por mal cargue: entra al inventario y resta de lo despachado por esa orden. */
export const COD_DEVOLUCION_MAL_CARGUE = "654"

export interface OrdenCuadre {
  id: number
  orden: string
  tipo: string
  sentido: SentidoOrden
  /** true = autodescargue (clon de un cargue de planta, `ordenorigen`). */
  automatica: boolean
  ordenorigen: string | null
  fecha: string | null
  placa: string | null
  cliente: string | null
  pedidos: string | null
  status: string | null
  cantOrden: number
  cantInventario: number
  diferencia: number
  /** Movimientos de la orden que aún no se aprueban (ingresos automáticos por aprobar). */
  pendientes: number
  rechazados: number
  estado: EstadoCuadre
  lineas: LineaCuadre[]
}

export interface MovimientoPeriodo {
  tipomov: string | null
  cod_movimiento: string | null
  cantidad: number | string | null
  ocargue: string | null
  status: string | null
}

export interface ResumenMovimientos {
  ingresosPorOrden: number
  ingresosAMano: number
  devoluciones: number
  sobrantes: number
  inventarioInicial: number
  salidasPorOrden: number
  salidasAMano: number
  faltantes: number
  averias: number
  reversosEntrada: number
  reversosSalida: number
  trasladosFilas: number
  otrosEntrada: number
  otrosSalida: number
  totalEntradas: number
  totalSalidas: number
}

export const normProducto = (s: unknown) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ")

const TOLERANCIA = 0.5

export function sentidoDe(tipooperacion: unknown): SentidoOrden {
  const t = String(tipooperacion ?? "").trim().toLowerCase()
  if (t === "cargue") return "salida"
  if (t === "descargue") return "ingreso"
  return "ninguno"
}

export function ordenFinalizada(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase()
  return s.startsWith("final") || s.startsWith("cerrad")
}

export function esAprobado(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase().startsWith("apr")
}

export function esRechazado(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase().startsWith("rech")
}

/** Con qué código mueve inventario una orden según su sentido. */
export function codigoDelSentido(sentido: SentidoOrden): { tipomov: string; codigo: string } | null {
  if (sentido === "salida") return { tipomov: "Salida", codigo: "601" }
  if (sentido === "ingreso") return { tipomov: "Entrada", codigo: "101" }
  return null
}

export function clasificar(args: {
  sentido: SentidoOrden
  status: unknown
  lineas: LineaCuadre[]
  pendientes: number
}): EstadoCuadre {
  const { sentido, lineas, pendientes } = args
  if (sentido === "ninguno") return "no_mueve"
  const cantInventario = lineas.reduce((s, l) => s + l.inventario, 0)
  if (!ordenFinalizada(args.status)) return "en_curso"
  if (cantInventario <= TOLERANCIA) return pendientes > 0 ? "pendiente" : "sin_inventario"
  // Un producto que la orden no decía y sí se movió: para una salida es tan grave como
  // salir de más; para un ingreso, entró algo que nadie autorizó.
  if (lineas.some((l) => l.orden <= TOLERANCIA && l.inventario > TOLERANCIA)) return "fuera_de_la_orden"
  const cantOrden = lineas.reduce((s, l) => s + l.orden, 0)
  const dif = cantInventario - cantOrden
  if (Math.abs(dif) <= TOLERANCIA) return "cuadra"
  if (sentido === "salida") return dif > 0 ? "salio_mas" : "salio_menos"
  return dif > 0 ? "recibio_mas" : "recibio_menos"
}

export const ETIQUETA_ESTADO: Record<EstadoCuadre, { texto: string; tono: "ok" | "atencion" | "critico" | "info" | "neutro" }> = {
  cuadra: { texto: "Cuadra", tono: "ok" },
  salio_menos: { texto: "Salió menos", tono: "atencion" },
  salio_mas: { texto: "SALIÓ MÁS", tono: "critico" },
  recibio_menos: { texto: "Recibió menos", tono: "atencion" },
  recibio_mas: { texto: "Recibió más", tono: "critico" },
  fuera_de_la_orden: { texto: "Fuera de la orden", tono: "critico" },
  sin_inventario: { texto: "Sin inventario", tono: "critico" },
  pendiente: { texto: "Por aprobar", tono: "info" },
  en_curso: { texto: "En curso", tono: "neutro" },
  no_mueve: { texto: "No mueve inventario", tono: "neutro" },
}

/** Los estados que piden una explicación o una acción. */
export const ESTADOS_CON_DIFERENCIA: ReadonlySet<EstadoCuadre> = new Set([
  "salio_menos",
  "salio_mas",
  "recibio_menos",
  "recibio_mas",
  "fuera_de_la_orden",
  "sin_inventario",
])

/**
 * Arma las líneas de una orden: lo que dice el detalle contra lo que movió el
 * inventario, producto por producto (normalizado), en el orden del detalle.
 */
export function armarLineas(
  detalle: ReadonlyArray<{ producto: unknown; cantidad: unknown }>,
  movimientos: ReadonlyArray<{ producto: unknown; cantidad: unknown }>,
  /** Lo que volvió por mal cargue (654), por producto: se resta de lo despachado. */
  devoluciones: ReadonlyArray<{ producto: unknown; cantidad: unknown }> = [],
): LineaCuadre[] {
  const orden = new Map<string, { producto: string; cantidad: number }>()
  for (const d of detalle) {
    const k = normProducto(d.producto)
    if (!k) continue
    const g = orden.get(k) ?? { producto: String(d.producto).trim(), cantidad: 0 }
    g.cantidad += Number(d.cantidad) || 0
    orden.set(k, g)
  }
  const inv = new Map<string, { producto: string; cantidad: number }>()
  for (const m of movimientos) {
    const k = normProducto(m.producto)
    if (!k) continue
    const g = inv.get(k) ?? { producto: String(m.producto).trim(), cantidad: 0 }
    g.cantidad += Number(m.cantidad) || 0
    inv.set(k, g)
  }
  // Lo devuelto por mal cargue no es un ingreso de esa orden: es despacho que se deshizo.
  const dev = new Map<string, number>()
  for (const d of devoluciones) {
    const k = normProducto(d.producto)
    if (!k) continue
    dev.set(k, (dev.get(k) ?? 0) + (Number(d.cantidad) || 0))
  }

  const lineas: LineaCuadre[] = []
  const conDevolucion = (k: string, base: LineaCuadre): LineaCuadre => {
    const d = dev.get(k) ?? 0
    if (d <= 0) return base
    const neto = base.inventario - d
    return { ...base, inventario: neto, diferencia: neto - base.orden, devuelto: d }
  }
  for (const [k, g] of orden) {
    const i = inv.get(k)?.cantidad ?? 0
    lineas.push(conDevolucion(k, { producto: g.producto, orden: g.cantidad, inventario: i, diferencia: i - g.cantidad }))
  }
  for (const [k, g] of inv) {
    if (orden.has(k)) continue
    lineas.push(conDevolucion(k, { producto: g.producto, orden: 0, inventario: g.cantidad, diferencia: g.cantidad }))
  }
  // Un producto que solo tiene devolución (la orden no lo traía y el despacho tampoco): raro,
  // pero si pasa tiene que verse, no desaparecer.
  for (const [k, d] of dev) {
    if (orden.has(k) || inv.has(k)) continue
    lineas.push({ producto: k, orden: 0, inventario: -d, diferencia: -d, devuelto: d })
  }
  return lineas
}

/**
 * Resume los movimientos APROBADOS de un período por su naturaleza, para cerrar el
 * universo: todo lo que entró y todo lo que salió, con o sin orden.
 */
export function resumirMovimientos(movs: ReadonlyArray<MovimientoPeriodo>): ResumenMovimientos {
  const r: ResumenMovimientos = {
    ingresosPorOrden: 0, ingresosAMano: 0, devoluciones: 0, sobrantes: 0, inventarioInicial: 0,
    salidasPorOrden: 0, salidasAMano: 0, faltantes: 0, averias: 0,
    reversosEntrada: 0, reversosSalida: 0, trasladosFilas: 0, otrosEntrada: 0, otrosSalida: 0,
    totalEntradas: 0, totalSalidas: 0,
  }
  for (const m of movs) {
    if (!esAprobado(m.status)) continue
    const c = Number(m.cantidad) || 0
    const cod = String(m.cod_movimiento ?? "").trim()
    const tipo = String(m.tipomov ?? "").trim().toLowerCase()
    const conOrden = !!String(m.ocargue ?? "").trim()
    if (["309", "311", "312", "343", "344"].includes(cod)) { r.trasladosFilas++; continue }
    if (tipo === "entrada") {
      r.totalEntradas += c
      if (cod === "101") { if (conOrden) r.ingresosPorOrden += c; else r.ingresosAMano += c }
      else if (cod === "653") r.devoluciones += c
      else if (cod === "701") r.sobrantes += c
      else if (cod === "561") r.inventarioInicial += c
      else if (cod === "602" || cod === "552") r.reversosSalida += c
      else r.otrosEntrada += c
    } else if (tipo === "salida") {
      r.totalSalidas += c
      if (cod === "601") { if (conOrden) r.salidasPorOrden += c; else r.salidasAMano += c }
      else if (cod === "702") r.faltantes += c
      else if (cod === "551" || cod === "555") r.averias += c
      else if (cod === "102") r.reversosEntrada += c
      else r.otrosSalida += c
    } else if (tipo === "reproceso") {
      // 551 "Reproceso" sale del inventario vendible.
      r.totalSalidas += c
      r.averias += c
    }
  }
  return r
}
