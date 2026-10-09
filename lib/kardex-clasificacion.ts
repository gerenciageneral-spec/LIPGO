/**
 * QUÉ LE SUMA Y QUÉ LE RESTA AL INVENTARIO, columna por columna del Kardex.
 *
 * Módulo PURO (sin "use server", sin base de datos) para poder probarlo. Lo usan el Kardex
 * (`getKardexInventario`) y el detalle por producto (`getMovimientosProducto`).
 *
 * LA REGLA, DICHA POR GERENCIA EL 2026-10-08 (es la especificación, textual):
 *
 *   "El Kardex es algo muy sencillo. Inicia un inventario inicial, que es el conteo de cada
 *    inicio de mes o conteo total, que fija el inventario inicial del mes. Este AUMENTA con
 *    todos los códigos que generen ingresos (descargue en ID3, ingreso de producción en ID1 e
 *    ID2, ingreso del LOGO —todos aprobados como ingresos de producción—, y devoluciones).
 *    Le RESTAN las órdenes de cargue y las averías. NADA MÁS lo puede afectar."
 *
 * De ahí salen las cinco columnas, y la fórmula:
 *
 *     inicial + ingresos − salidas − averías + ajustes + traslados = stock al cierre
 *
 * EL DEFECTO QUE ESTO CORRIGE
 *
 * El Kardex clasificaba adivinando por el TEXTO de `origen`. Todo lo que se registra por
 * código escribe `origen = "transaccion manual"`, que no calza con ningún patrón, así que caía
 * al cajón "Ajustes". Medido en octubre de 2026: las devoluciones (653) de ID2 e ID3, el
 * desecho por calidad (555) de ID2 y los reversos (102/602) de ID1 aparecían como "ajustes"
 * cuando son ingresos, avería y reversos de su propia columna. El saldo salía bien —todas las
 * columnas se suman al final— pero las columnas mentían, y son las que se leen para entender
 * el mes. `cod_movimiento` sí queda bien guardado: el arreglo es LEERLO en vez de adivinar.
 *
 * LOS REVERSOS VAN EN LA COLUMNA DE LO QUE DESHACEN, no en la contraria: un 102 (reverso de
 * ingreso) resta en Ingresos, no suma en Salidas. Así cada columna muestra el neto real de su
 * concepto y "Salidas" sigue siendo lo que gerencia dice que es: órdenes de cargue.
 */

export type ColumnaKardex = "ingresos" | "salidas" | "averias" | "ajustes" | "traslados"

/** Qué código cae en qué columna, y con qué signo DENTRO de ella. */
const POR_CODIGO: Record<string, { columna: ColumnaKardex; signo: 1 | -1 }> = {
  // AUMENTAN: descargue, producción, LOGO (los tres entran como 101), inventario inicial y devoluciones.
  "101": { columna: "ingresos", signo: 1 },
  "561": { columna: "ingresos", signo: 1 },
  "653": { columna: "ingresos", signo: 1 },
  // 654 — devolución por mal cargue: lo que la orden descontó y el camión no se llevó. Entra
  // como ingreso (gerencia: "entran como devolución"), y el Cuadre por orden lo resta del
  // despachado de esa orden para que el neto sea lo que el cliente recibió de verdad.
  "654": { columna: "ingresos", signo: 1 },
  "102": { columna: "ingresos", signo: -1 }, // reverso de un ingreso: deshace lo que entró
  // RESTAN: la orden de cargue.
  "601": { columna: "salidas", signo: 1 },
  "602": { columna: "salidas", signo: -1 }, // reverso de una salida: deshace lo que salió
  // RESTAN: las averías (merma/reproceso y desecho por calidad).
  "551": { columna: "averias", signo: 1 },
  "555": { columna: "averias", signo: 1 },
  "552": { columna: "averias", signo: -1 }, // reverso de merma
  // Correcciones del conteo físico. Dentro del mes deberían ser CERO: el conteo se aplica
  // fechado la víspera, así que sus 701/702 caen en el mes que cierra, no en el que abre.
  "701": { columna: "ajustes", signo: 1 },
  "702": { columna: "ajustes", signo: -1 },
  // NO lo afectan: cambian dónde está el producto o bajo qué lote, no cuánto hay.
  "309": { columna: "traslados", signo: 1 },
  "311": { columna: "traslados", signo: 1 },
  "312": { columna: "traslados", signo: 1 },
  "343": { columna: "traslados", signo: 1 },
  "344": { columna: "traslados", signo: 1 },
}

export interface MovimientoClasificable {
  cod_movimiento: string | number | null | undefined
  tipomov: string | null | undefined
  origen: string | null | undefined
}

export interface Clasificacion {
  columna: ColumnaKardex
  /** Lo que suma a esa columna (ya con su signo). Multiplíquelo por la cantidad. */
  signo: 1 | -1
  /** true = se clasificó adivinando por el texto de `origen` (fila sin código, anterior a la nomenclatura). */
  adivinado: boolean
}

const has = (v: unknown, t: string) => String(v ?? "").toLowerCase().includes(t)

/**
 * En qué columna del Kardex entra un movimiento y con qué signo.
 *
 * Primero el CÓDIGO, que es el dato real. Solo si la fila no lo trae (histórico anterior a la
 * nomenclatura por código) se cae al heurístico por texto, y se marca como `adivinado`.
 */
export function clasificarMovimiento(m: MovimientoClasificable): Clasificacion {
  const cod = String(m.cod_movimiento ?? "").trim()
  const porCodigo = POR_CODIGO[cod]
  if (porCodigo) {
    // Un traslado lleva el signo de su pata: la entrada suma y la salida resta, y el par da 0.
    if (porCodigo.columna === "traslados") {
      return { columna: "traslados", signo: String(m.tipomov ?? "").trim() === "Entrada" ? 1 : -1, adivinado: false }
    }
    return { ...porCodigo, adivinado: false }
  }

  // Respaldo para filas sin código (solo histórico).
  const entrada = String(m.tipomov ?? "").trim() === "Entrada"
  if (has(m.origen, "traslado entre localizaciones")) return { columna: "traslados", signo: entrada ? 1 : -1, adivinado: true }
  if (String(m.tipomov ?? "").trim() === "Reproceso" || (!entrada && has(m.origen, "reproceso"))) return { columna: "averias", signo: 1, adivinado: true }
  if (entrada && (has(m.origen, "producc") || has(m.origen, "aprob") || has(m.origen, "descarg") || has(m.origen, "logo"))) return { columna: "ingresos", signo: 1, adivinado: true }
  if (!entrada && has(m.origen, "orden de cargue")) return { columna: "salidas", signo: 1, adivinado: true }
  if (has(m.origen, "inicial")) return { columna: "ingresos", signo: 1, adivinado: true }
  return { columna: "ajustes", signo: entrada ? 1 : -1, adivinado: true }
}

export interface ResumenKardex {
  ingresos: number
  salidas: number
  averias: number
  ajustes: number
  traslados: number
  /** Cuántas filas se clasificaron adivinando (no traían código). */
  adivinados: number
}

export const resumenVacio = (): ResumenKardex => ({ ingresos: 0, salidas: 0, averias: 0, ajustes: 0, traslados: 0, adivinados: 0 })

/** Acumula un movimiento en el resumen del producto. `cantidad` siempre en positivo. */
export function acumular(resumen: ResumenKardex, m: MovimientoClasificable, cantidad: number): ResumenKardex {
  const c = Math.abs(Number(cantidad) || 0)
  const { columna, signo, adivinado } = clasificarMovimiento(m)
  resumen[columna] += signo * c
  if (adivinado) resumen.adivinados += 1
  return resumen
}

/**
 * El saldo del periodo con la fórmula de gerencia:
 * inicial + ingresos − salidas − averías + ajustes + traslados.
 */
export function saldoDelPeriodo(inicial: number, r: ResumenKardex): number {
  return Math.round(inicial + r.ingresos - r.salidas - r.averias + r.ajustes + r.traslados)
}
