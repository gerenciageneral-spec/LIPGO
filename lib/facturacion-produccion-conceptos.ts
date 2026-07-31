// CONCEPTOS DE PRODUCCIÓN POR PROYECTO — qué se le factura a cada cliente además
// del movimiento de órdenes de cargue.
//
// El Cuadro de Control de Facturación nació sobre `cabeceraoc`: una orden de
// servicio procesada = una línea facturable. Eso cubre el eje de TRANSPORTE
// (cargue, descargue, distribución), pero no todo lo que se le cobra a un
// cliente nace de una orden. Este archivo declara, POR PROYECTO, cuáles son sus
// conceptos de producción y —lo más importante— DE DÓNDE SALEN, porque de eso
// depende si hay que sumarlos aparte o si ya vienen incluidos:
//
//   · fuente "ordenes"      → el concepto YA es un `cabeceraoc.tipooperacion`, así
//     que la prefactura lo trae por la vía normal. NO se suma otra vez: hacerlo
//     cobraría dos veces lo mismo. Caso Indupan (Tolva / Tolva f).
//
//   · fuente "conciliacion" → el concepto NO tiene orden detrás; vive en otra
//     tabla (la tolva de Avimol está en `invtrans`, las horas extra en la
//     nómina). La prefactura no lo ve, así que hay que AGREGARLO. Caso Avimol.
//
// Este archivo es solo declarativo (constantes): no puede vivir dentro de un
// módulo "use server", que únicamente exporta funciones async.

export type FuenteProduccion = "ordenes" | "conciliacion"

export interface ProduccionProyecto {
  idempresa: number
  /** Owner con el que se factura, tal como aparece en la vista `facturacion`,
   *  para que la producción caiga en el MISMO bloque del documento y no abra
   *  uno paralelo por una diferencia de mayúsculas. */
  owner: string
  fuente: FuenteProduccion
  /** Los conceptos, con el nombre exacto del maestro de tarifas. */
  conceptos: string[]
  /** Se muestra en la prefactura para que quien factura entienda de un vistazo
   *  por qué el concepto está (o no está) sumando aparte. */
  nota: string
}

export const PRODUCCION_POR_PROYECTO: Record<number, ProduccionProyecto> = {
  // Harinera Indupan — la tolva SÍ es una orden de cargue (`tipooperacion`
  // Tolva / Tolva f), así que la prefactura ya la cobra por `pesovascula` ×
  // tarifa dentro del bloque de operación. Queda declarado para que se vea que
  // el concepto está contemplado y NO se agregue por segunda vez.
  1: {
    idempresa: 1,
    owner: "Harinera Indupan",
    fuente: "ordenes",
    conceptos: ["Tolva", "Tolva f"],
    nota:
      "La producción de tolva de Indupan se registra como orden de cargue (operación Tolva / Tolva f), " +
      "así que ya está incluida arriba con su tarifa por tonelada. No se suma aparte para no cobrarla dos veces.",
  },
  // Avimol — lo que se cobra por producción son los ingresos de tolva de
  // `invtrans` (Salvado / Estibado PT, con sus variantes de festivo) más las
  // horas extra por puesto. Nada de eso tiene orden de cargue detrás, así que
  // sin este bloque la factura de Avimol sale incompleta.
  2: {
    idempresa: 2,
    owner: "AVIMOL",
    fuente: "conciliacion",
    conceptos: ["Salvado", "Salvado Festivo", "Estibado PT", "Estibado PT Festivo", "Horas extra por puesto"],
    nota:
      "La producción de Avimol (Salvado y Estibado PT) sale de los ingresos de tolva y las horas extra de la " +
      "nómina: no existen como orden de cargue, por eso se suman aparte. Es el mismo cálculo de Conciliación Avimol.",
  },
}

export function produccionDelProyecto(idempresa: number | null | undefined): ProduccionProyecto | null {
  if (!idempresa) return null
  return PRODUCCION_POR_PROYECTO[Number(idempresa)] ?? null
}

/** Prefijo con el que se nombra cada concepto de hora extra en el documento. */
export const CONCEPTO_HORA_EXTRA = "Hora extra"
