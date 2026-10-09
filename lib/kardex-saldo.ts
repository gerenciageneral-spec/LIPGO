/**
 * EL SALDO QUE VA QUEDANDO EN EL KARDEX, y qué movimiento lo mueve de verdad.
 *
 * Módulo PURO (sin "use server", sin base de datos) para poder probarlo. Lo usa
 * `getMovimientosProducto` (lib/sig-actions.ts), el detalle del Kardex.
 *
 * LA REGLA (gerencia, repetida el 2026-10-08): "ya quedó claro qué le suma y qué le resta al
 * inventario y los códigos que hacen esto". Al inventario de un PRODUCTO:
 *   · le SUMAN   los ingresos (101 descargue/producción, 653 devolución, 701 sobrante, 561 inicial)
 *   · le RESTAN  las salidas por orden de cargue (601), las averías (551/555) y los faltantes (702)
 *   · NO lo mueven los traslados y reclasificaciones (309/311/312/344/343): cambian DÓNDE está
 *     el producto o bajo qué lote, no CUÁNTO hay.
 *
 * EL DEFECTO QUE ESTO CORRIGE (POLI PANADERIA, ID3, 8-oct-2026)
 *
 * El detalle movía el saldo con las DOS patas de cada traslado. Como las dos tienen el mismo
 * instante (`creado` idéntico al segundo), el orden entre ellas es arbitrario: con la salida
 * primero el saldo caía a −233 y con la entrada primero habría subido a +377. Ninguno de los
 * dos números existió jamás: entre una pata y otra no pasa nada en la bodega. Un saldo en rojo
 * que no es real hace dudar de todo el Kardex, que es justo lo que no puede pasar.
 *
 * CÓMO SE DISTINGUE UN TRASLADO DE UNA RECLASIFICACIÓN QUE SÍ MUEVE
 *
 * Un 309 puede cruzar de PRODUCTO (sale de uno y entra en otro). En ese caso el producto solo
 * ve UNA pata, y ahí sí cambió cuánto hay de él. Por eso la regla no es "el código 309/311
 * nunca mueve", sino: **si las patas de ese movimiento se compensan dentro del producto, no
 * mueven; si queda un remanente, el remanente mueve**. Así el traslado se vuelve invisible
 * para el saldo y la reclasificación cruzada sigue viéndose, que es lo correcto.
 */

export interface MovimientoKardex {
  tipomov: string | null | undefined
  cantidad: number | string | null | undefined
  cod_movimiento: string | number | null | undefined
  creado: string | null | undefined
  status: string | null | undefined
}

/** Los códigos que cambian dónde está el producto, no cuánto hay. */
export const CODIGOS_SIN_EFECTO_EN_EL_SALDO = ["309", "311", "312", "343", "344"] as const

export const esTraslado = (cod: unknown) =>
  (CODIGOS_SIN_EFECTO_EN_EL_SALDO as readonly string[]).includes(String(cod ?? "").trim())

export const esAprobada = (status: unknown) => String(status ?? "").trim().toLowerCase().startsWith("aprob")

const n0 = (v: unknown) => Math.abs(Number(v) || 0)
const signo = (tipomov: unknown) => (String(tipomov ?? "").trim() === "Entrada" ? 1 : -1)

/** Clave del par: mismo código y mismo instante. Las dos patas se escriben a la vez. */
const claveDelPar = (m: MovimientoKardex) => `${String(m.cod_movimiento ?? "").trim()}|${String(m.creado ?? "")}`

/**
 * Qué mueve cada movimiento en el saldo del producto. Devuelve un Map movimiento → efecto
 * (0 para las patas de un traslado que se compensa).
 *
 * @param movimientos TODOS los del producto en el periodo, aprobados o no (los no aprobados
 *   no mueven nada, pero se listan).
 */
export function efectoEnElSaldo<T extends MovimientoKardex>(movimientos: readonly T[]): Map<T, number> {
  // 1) ¿Qué pares de traslado se compensan dentro de este producto?
  const neto = new Map<string, number>()
  for (const m of movimientos) {
    if (!esAprobada(m.status) || !esTraslado(m.cod_movimiento)) continue
    const k = claveDelPar(m)
    neto.set(k, (neto.get(k) ?? 0) + signo(m.tipomov) * n0(m.cantidad))
  }

  // 2) El efecto de cada uno.
  const efecto = new Map<T, number>()
  for (const m of movimientos) {
    if (!esAprobada(m.status)) {
      efecto.set(m, 0)
      continue
    }
    if (esTraslado(m.cod_movimiento) && Math.abs(neto.get(claveDelPar(m)) ?? 0) < 0.001) {
      // Las patas se compensan: el producto no cambió de cantidad, solo de sitio.
      efecto.set(m, 0)
      continue
    }
    efecto.set(m, signo(m.tipomov) * n0(m.cantidad))
  }
  return efecto
}

export interface FilaConSaldo<T> {
  movimiento: T
  /** Lo que movió en el saldo del producto: 0 en las patas de un traslado. */
  efecto: number
  /** El saldo antes y después de este movimiento. */
  antes: number
  despues: number
}

/**
 * El saldo que va quedando, movimiento por movimiento, arrancando en la base del periodo.
 * Los movimientos se recorren en el orden que se le pasen (cronológico).
 */
export function saldoCorrido<T extends MovimientoKardex>(movimientos: readonly T[], base: number): FilaConSaldo<T>[] {
  const efecto = efectoEnElSaldo(movimientos)
  let corrido = base
  const filas: FilaConSaldo<T>[] = []
  for (const m of movimientos) {
    const e = efecto.get(m) ?? 0
    const antes = corrido
    corrido = Math.round((corrido + e) * 100) / 100
    filas.push({ movimiento: m, efecto: e, antes, despues: corrido })
  }
  return filas
}
