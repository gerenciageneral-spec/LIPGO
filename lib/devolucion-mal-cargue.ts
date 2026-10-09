/**
 * DEVOLUCIÓN POR MAL CARGUE (código 654): lo que la orden descontó y el camión no se llevó.
 *
 * Módulo PURO (sin "use server", sin base de datos) para poder probarlo. Lo usa
 * `registrarDevolucionMalCargue` (lib/transacciones-codigo-actions.ts).
 *
 * EL CASO, DICHO POR GERENCIA (2026-10-08):
 *
 *   "Cuando un pedido sale incompleto y se escoge la orden, este módulo llama la orden y toda
 *    la línea de sus productos para realizar el descuento en el producto exacto en que se hizo
 *    el mal cargue (cargó menos). Se escoge la cantidad, con dos efectos inmediatos: le suma al
 *    pedido como pendiente de entrega, y regresa la cantidad a invtrans para normalizar el
 *    inventario."
 *
 * Son las dos caras de lo mismo: el sistema descontó 100 porque la orden decía 100, pero el
 * camión solo cargó 90. Esas 10 nunca salieron de la bodega — el inventario las tiene de menos
 * sin razón y el cliente quedó esperándolas.
 *
 * EL CASO CONTRARIO NO VA POR AQUÍ. Si el camión cargó MÁS de lo que la orden autoriza, el
 * sistema no lo deja registrar (candado del servidor, `lib/asignacion-lote-regla.ts`): esas
 * unidades salen sin respaldo y aparecen como faltante en el conteo. No se arreglan con un 654.
 *
 * LOS TRES EFECTOS
 *   1. INVENTARIO: entra la cantidad devuelta, al mismo lote y producto del que salió.
 *   2. PEDIDO: baja lo cargado y sube lo pendiente, para que pueda volver a salir en otra orden.
 *   3. PESO DE LA ORDEN: baja en proporción... PERO SOLO SI LA QUINCENA SIGUE ABIERTA. En los
 *      CEDIs (ID3, ID4) la nómina de los auxiliares se calcula con `cabeceraoc.pesoorden`
 *      (no tienen báscula propia), así que bajarlo en una quincena ya pagada le quita plata a
 *      alguien por un trabajo que ya hizo. Regla de gerencia: ajustar solo si no se ha pagado.
 */

import { estadoQuincena } from "@/lib/quincena-abierta"

export const CODIGO_DEVOLUCION_MAL_CARGUE = "654"

/** Por qué volvió el producto. Queda escrito en el movimiento y en el pedido. */
export type MotivoDevolucion = "trocado" | "cantidad_de_mas"

export const MOTIVOS_DEVOLUCION: Array<{ valor: MotivoDevolucion; etiqueta: string; ayuda: string }> = [
  { valor: "trocado", etiqueta: "Trocado", ayuda: "Se cargó un producto por otro: este no era el que iba." },
  { valor: "cantidad_de_mas", etiqueta: "Cantidad de más", ayuda: "La orden descontó más de lo que el camión se llevó." },
]

/** Una línea de lo que la orden despachó, con lo que ya se devolvió antes. */
export interface LineaDespachada {
  /** El movimiento de salida (601) del que viene. */
  invtransId: number
  producto: string
  codproducto: string
  lote: string
  location: string
  /** Unidades que esa salida descontó. */
  despachado: number
  /** Lo que ya se devolvió de esa misma salida con un 654 anterior. */
  devuelto: number
}

export interface LineaDevolvible extends LineaDespachada {
  /** Lo máximo que todavía se puede devolver de esa línea. */
  porDevolver: number
}

const n0 = (v: unknown) => Number(v) || 0
const red2 = (v: number) => Math.round(v * 100) / 100

/** Cuánto queda por devolver de cada línea; las que ya no tienen nada se quedan fuera. */
export function lineasDevolvibles(lineas: readonly LineaDespachada[]): LineaDevolvible[] {
  return lineas
    .map((l) => ({ ...l, porDevolver: red2(Math.max(0, n0(l.despachado) - n0(l.devuelto))) }))
    .filter((l) => l.porDevolver > 0)
}

export interface ValidacionDevolucion {
  ok: boolean
  error?: string
}

/**
 * ¿Se puede devolver esa cantidad de esa línea? El tope es lo que esa salida descontó menos lo
 * ya devuelto: devolver más sería inventar unidades que la orden nunca sacó.
 */
export function validarCantidad(linea: LineaDevolvible | undefined, cantidad: number): ValidacionDevolucion {
  if (!linea) return { ok: false, error: "Elige de qué línea de la orden vuelve el producto." }
  const c = n0(cantidad)
  if (c <= 0) return { ok: false, error: "Indica cuántas unidades vuelven." }
  if (c > linea.porDevolver + 0.001) {
    const yaDev = n0(linea.devuelto)
    return {
      ok: false,
      error:
        `No se pueden devolver ${c} unidades: esa orden despachó ${n0(linea.despachado)} de ${linea.producto} ` +
        `(lote ${linea.lote})${yaDev > 0 ? ` y ya se devolvieron ${yaDev}` : ""}, así que quedan ${linea.porDevolver} por devolver.`,
    }
  }
  return { ok: true }
}

/** Lo que hay que bajarle al pedido, línea por línea del pedido. */
export interface AjustePedido {
  transid: number
  idpedido: number
  /** Unidades que dejan de estar cargadas y vuelven a pendientes. */
  devolver: number
  /** Lo que esa orden había anotado en el libro, para dejarlo en el valor nuevo. */
  unidadesEnLibro: number
  unidadesNuevasEnLibro: number
}

/**
 * Reparte lo devuelto entre las líneas del pedido que esa orden cargó de ese producto.
 *
 * Normalmente es una sola línea, pero una orden puede atender varios pedidos del mismo
 * producto (25,7 % de las órdenes atienden a más de un pedido). Se reparte de la más grande a
 * la más pequeña, que es como se arma el cargue, y así el reparto es estable y no deja
 * fracciones raras en pedidos pequeños.
 */
export function repartirEnPedidos(
  lineasDelPedido: ReadonlyArray<{ transid: number; idpedido: number; unidadesEnLibro: number }>,
  cantidad: number,
): AjustePedido[] {
  let resta = n0(cantidad)
  const orden = [...lineasDelPedido].sort((a, b) => n0(b.unidadesEnLibro) - n0(a.unidadesEnLibro) || a.transid - b.transid)
  const ajustes: AjustePedido[] = []
  for (const l of orden) {
    if (resta <= 0.001) break
    const puede = Math.min(n0(l.unidadesEnLibro), resta)
    if (puede <= 0) continue
    resta = red2(resta - puede)
    ajustes.push({
      transid: l.transid,
      idpedido: l.idpedido,
      devolver: red2(puede),
      unidadesEnLibro: n0(l.unidadesEnLibro),
      unidadesNuevasEnLibro: red2(n0(l.unidadesEnLibro) - puede),
    })
  }
  return ajustes
}

export interface DecisionPeso {
  ajustar: boolean
  /** El peso nuevo de la orden, en las mismas unidades que `pesoorden`. */
  pesoNuevo: number | null
  /** Por qué se ajustó o por qué no. Se muestra al usuario y queda en el movimiento. */
  motivo: string
}

/**
 * ¿Se le baja el peso a la orden?
 *
 * Solo si la quincena del cargue sigue abierta. El peso baja en PROPORCIÓN a lo devuelto
 * dentro de su línea (`toneladas` de la línea ÷ `cantidad` de la línea × lo devuelto), que
 * funciona igual para los productos que se miden en toneladas y para los que se pagan por
 * unidad (Huevos/Empaque de ID2, donde `toneladas` ya viene en unidades).
 */
export function decidirPeso(args: {
  fechaCargue: string | null | undefined
  pesoOrden: number | null | undefined
  /** De la línea de `detalleoc` de la que vuelve el producto. */
  toneladasLinea: number | null | undefined
  cantidadLinea: number | null | undefined
  cantidadDevuelta: number
  hoyISO?: string
}): DecisionPeso {
  const fecha = String(args.fechaCargue ?? "").trim()
  if (!fecha) return { ajustar: false, pesoNuevo: null, motivo: "La orden no tiene fecha de cargue: el peso no se toca." }

  const q = args.hoyISO ? estadoQuincena(fecha, args.hoyISO) : estadoQuincena(fecha)
  if (!q.abierta) {
    return {
      ajustar: false,
      pesoNuevo: null,
      motivo:
        `${q.motivo ?? "La quincena de esa orden ya está cerrada."} El peso de la orden se deja como está para no mover una nómina ya pagada; ` +
        `la devolución queda registrada igual y se ve en el 360 de la orden.`,
    }
  }

  const pesoOrden = n0(args.pesoOrden)
  const cantLinea = n0(args.cantidadLinea)
  const ton = n0(args.toneladasLinea)
  if (pesoOrden <= 0 || cantLinea <= 0 || ton <= 0) {
    return { ajustar: false, pesoNuevo: null, motivo: "La orden o su línea no tienen peso registrado: el peso no se toca." }
  }

  const pesoDevuelto = red2((ton / cantLinea) * n0(args.cantidadDevuelta) * 100) / 100
  const nuevo = Math.max(0, red2(pesoOrden - pesoDevuelto))
  return {
    ajustar: true,
    pesoNuevo: nuevo,
    motivo: `La quincena del ${q.quincena?.etiqueta ?? fecha} sigue abierta: el peso de la orden baja de ${pesoOrden} a ${nuevo}.`,
  }
}

/** Texto del movimiento, para que el porqué viaje con el dato. */
export function observacionDevolucion(args: {
  ocargue: string
  motivo: MotivoDevolucion
  detalle?: string | null
  invtransOrigen: number
  autorizadoPor?: string | null
}): string {
  const etiqueta = MOTIVOS_DEVOLUCION.find((m) => m.valor === args.motivo)?.etiqueta ?? args.motivo
  return [
    `Devolución por mal cargue (654) de la orden ${args.ocargue}`,
    `· ${etiqueta}`,
    String(args.detalle ?? "").trim() ? `· ${String(args.detalle).trim()}` : "",
    `· vuelve de la salida invtrans #${args.invtransOrigen}`,
    args.autorizadoPor ? `· autoriza: ${args.autorizadoPor}` : "",
  ]
    .filter(Boolean)
    .join(" ")
}
