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
 * CUIDADO CON DOS CASOS QUE SE LLAMAN PARECIDO Y NO SON LO MISMO:
 *   · "Cantidad de más" (motivo de AQUÍ): salió más de lo que el destino necesitaba y **volvió
 *     en el mismo camión**. Hay producto físico de vuelta en la bodega, así que sí entra.
 *   · Cargar MÁS de lo que la orden autoriza y que **no vuelva**: eso no va por aquí. El candado
 *     del servidor (`lib/asignacion-lote-regla.ts`) no deja registrar una salida mayor a la
 *     orden, esas unidades salen sin respaldo y aparecen como faltante en el conteo. Gerencia,
 *     textual: "por ley no se puede cargar más de lo que pide la orden".
 *
 * LOS TRES EFECTOS
 *   1. INVENTARIO: entra la cantidad devuelta, al mismo lote y producto del que salió. Ocurre
 *      con los TRES motivos: el producto está de vuelta en la bodega, lo tiene que decir. Dicho
 *      por gerencia para el trocado y el cargue de menos: "si no se ajusta el inventario, van a
 *      sobrar unidades del producto que no se envió".
 *   2. PEDIDO: baja lo cargado y sube lo pendiente, para que pueda volver a salir en otra orden.
 *      También con los TRES, y por la misma razón: la orden depende del pedido, así que si no se
 *      llevó lo que la orden decía, el cliente sigue esperando ese envío.
 *      LA MITAD QUE EL 654 NO CIERRA (trocado): el producto que salió EN SU LUGAR nunca se
 *      descontó. Si volvió en el camión no hay nada que registrar; si se quedó donde el cliente,
 *      queda como faltante hasta el conteo, porque del inventario solo se sale con orden de
 *      cargue o por avería (regla de gerencia) y no hay código para una salida sin orden.
 *   3. PESO DE LA ORDEN: baja en proporción, pero solo si DOS cosas se cumplen — que el MOTIVO lo
 *      pida (ver `MOTIVOS_DEVOLUCION`) y que la QUINCENA del cargue siga abierta. En los CEDIs
 *      (ID3, ID4) la nómina de los auxiliares se calcula con `cabeceraoc.pesoorden` (no tienen
 *      báscula propia), así que bajarlo en una quincena ya pagada le quita plata a alguien por un
 *      trabajo que ya hizo. Regla de gerencia: ajustar solo si no se ha pagado.
 *
 * La facturación de LIP no se toca en ningún caso: va por `pesovascula` (el tiquete de báscula).
 */

import { estadoQuincena } from "@/lib/quincena-abierta"

export const CODIGO_DEVOLUCION_MAL_CARGUE = "654"

/**
 * Por qué volvió el producto. No es una etiqueta: decide si el peso de la orden —y con él la
 * nómina de los auxiliares— se ajusta o no.
 *
 * La regla la dio gerencia el 2026-10-09, y detrás hay una lógica operativa simple: **la
 * cuadrilla cobra por el peso que cargó de verdad al camión**.
 *   · Trocado y cantidad de menos → esas unidades NUNCA se cargaron (o se cargó otra cosa),
 *     así que el peso de la orden baja y el pago con él.
 *   · Cantidad de más → sí se cargaron, el camión las llevó y volvieron: la cuadrilla hizo ese
 *     trabajo, así que ni el peso ni la nómina se tocan.
 * En los TRES el producto entra al inventario (la salida ya lo había descontado) y el pedido
 * recupera esas unidades como pendientes.
 */
export type MotivoDevolucion = "trocado" | "cantidad_de_mas" | "cantidad_de_menos"

export const MOTIVOS_DEVOLUCION: Array<{
  valor: MotivoDevolucion
  etiqueta: string
  ayuda: string
  /** true = el peso de la orden (y con él la nómina de los auxiliares) baja en proporción. */
  ajustaPeso: boolean
  /** Lo que se le pinta al lado del nombre, para que el efecto se vea antes de firmar. */
  efectoCorto: string
  /** Lo que este motivo NO cierra, cuando hay algo que el 654 no alcanza. */
  nota?: string
}> = [
  {
    valor: "trocado",
    etiqueta: "Trocado",
    ayuda:
      "Se cargó un producto por otro: el que la orden descontó no salió, así que vuelve al inventario y el pedido queda esperando " +
      "el envío correcto. Si no se registra, van a sobrar en la bodega unidades que el sistema dio por despachadas.",
    ajustaPeso: true,
    efectoCorto: "baja el peso y la nómina",
    nota:
      "El producto que salió en su lugar nunca se descontó. Si volvió en el mismo camión no hay nada más que registrar; si se " +
      "quedó donde el cliente, aparecerá como faltante en el conteo, porque del inventario solo se sale con orden o por avería.",
  },
  {
    valor: "cantidad_de_mas",
    etiqueta: "Cantidad de más",
    ayuda:
      "Salió más de lo que el destino necesitaba y volvió en el mismo camión. El inventario y el pedido se corrigen, pero el peso " +
      "de la orden NO se toca: la cuadrilla sí cargó ese peso y cobra por él.",
    ajustaPeso: false,
    efectoCorto: "no toca el peso ni la nómina",
  },
  {
    valor: "cantidad_de_menos",
    etiqueta: "Cantidad de menos / error de cargue",
    ayuda:
      "El camión llevó menos de lo que la orden descontó: esas unidades nunca salieron de la bodega, así que están de más en el " +
      "inventario y el cliente las sigue esperando. El peso de la orden y el pago de la cuadrilla bajan, porque ese peso no se cargó.",
    ajustaPeso: true,
    efectoCorto: "baja el peso y la nómina",
  },
]

/**
 * ¿El motivo que llegó es uno de los tres? Se valida en el SERVIDOR, no solo en la pantalla:
 * el motivo decide si la nómina de los auxiliares se mueve, así que no puede llegar un texto
 * cualquiera desde el navegador.
 */
export function esMotivoDevolucion(v: unknown): v is MotivoDevolucion {
  return MOTIVOS_DEVOLUCION.some((m) => m.valor === v)
}

export const etiquetaMotivo = (motivo: MotivoDevolucion | string) =>
  MOTIVOS_DEVOLUCION.find((m) => m.valor === motivo)?.etiqueta ?? String(motivo)

export const ajustaPesoElMotivo = (motivo: MotivoDevolucion) =>
  MOTIVOS_DEVOLUCION.find((m) => m.valor === motivo)?.ajustaPeso ?? true

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
 * Dos condiciones, y las dos tienen que cumplirse:
 *   1. EL MOTIVO lo pide. En "cantidad de más" no: la cuadrilla sí cargó ese peso al camión,
 *      así que cobra por él aunque el producto haya vuelto (regla de gerencia 2026-10-09).
 *   2. LA QUINCENA del cargue sigue abierta. Si ya se pagó, no se toca: bajar el peso le
 *      quitaría plata a alguien por un trabajo hecho.
 *
 * El peso baja en PROPORCIÓN a lo devuelto dentro de su línea (`toneladas` ÷ `cantidad` ×
 * lo devuelto), que funciona igual para los productos que se miden en toneladas y para los que
 * se pagan por unidad (Huevos/Empaque de ID2, donde `toneladas` ya viene en unidades).
 */
export function decidirPeso(args: {
  fechaCargue: string | null | undefined
  pesoOrden: number | null | undefined
  /** De la línea de `detalleoc` de la que vuelve el producto. */
  toneladasLinea: number | null | undefined
  cantidadLinea: number | null | undefined
  cantidadDevuelta: number
  /** Si no se pasa, se asume que el motivo sí ajusta (compatibilidad). */
  motivo?: MotivoDevolucion
  hoyISO?: string
}): DecisionPeso {
  if (args.motivo && !ajustaPesoElMotivo(args.motivo)) {
    const m = MOTIVOS_DEVOLUCION.find((x) => x.valor === args.motivo)
    return {
      ajustar: false,
      pesoNuevo: null,
      motivo: `"${m?.etiqueta ?? args.motivo}": el peso de la orden no se toca, porque la cuadrilla sí cargó ese peso al camión y cobra por él. Solo se corrigen el inventario y el pedido.`,
    }
  }
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

/**
 * Texto del movimiento, para que el porqué viaje con el dato.
 *
 * Incluye qué pasó con el PESO. No es adorno: el peso de la orden es la base del pago de los
 * auxiliares en los CEDIs, así que meses después hay que poder leer en el propio movimiento por
 * qué la nómina se movió o por qué no.
 */
export function observacionDevolucion(args: {
  ocargue: string
  motivo: MotivoDevolucion
  detalle?: string | null
  invtransOrigen: number
  autorizadoPor?: string | null
  /** El `motivo` que devolvió `decidirPeso`. */
  pesoNota?: string | null
}): string {
  return [
    `Devolución por mal cargue (654) de la orden ${args.ocargue}`,
    `· ${etiquetaMotivo(args.motivo)}`,
    String(args.detalle ?? "").trim() ? `· ${String(args.detalle).trim()}` : "",
    `· vuelve de la salida invtrans #${args.invtransOrigen}`,
    String(args.pesoNota ?? "").trim() ? `· peso: ${String(args.pesoNota).trim()}` : "",
    args.autorizadoPor ? `· autoriza: ${args.autorizadoPor}` : "",
  ]
    .filter(Boolean)
    .join(" ")
}
