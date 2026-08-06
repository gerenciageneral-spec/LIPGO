// QUÉ CARGUE SE LE FACTURA AL PROYECTO.
//
// En Avimol (id 2) el cargue no se le cobra todo al proyecto. LIP carga
// vehículos de tres orígenes y cada uno lo paga alguien distinto:
//
//   · TERCEROS → lo paga el tercero, de CONTADO.
//   · ZAMUDIO  → lo paga Zamudio, a CRÉDITO.
//   · Vehículos de AVIMOL → eso sí se le factura a Avimol.
//
// (Ver lib/facturacion-medio-pago.ts para la condición de pago de los dos
// primeros; aquí solo se resuelve QUIÉN entra en la prefactura del proyecto.)
//
// CÓMO SE APLICA (cambió): antes la prefactura APARTABA por placa las líneas de
// cargue que no fueran de Avimol y las reportaba en un recuadro al margen. El
// efecto era que Zamudio y Terceros no existían como owners del documento —solo
// salía Avimol— y no había forma de ver su detalle orden por orden.
//
// Hoy el reparto lo hace `facturadoAOwner` (lib/facturacion-billed-party.ts) por
// TRANSPORTE, que es el mismo criterio que ya usaban el cuadro y el análisis
// financiero. Cada línea queda a nombre de quien la paga y arrastra su detalle;
// nada se aparta. Este archivo ya solo aporta el TEXTO de la regla para el
// encabezado y la prefactura.

/** Proyectos donde el cargue no se le factura completo al proyecto. */
export const CARGUE_SOLO_PLACA_PROPIA: Record<number, { operacion: string; nota: string }> = {
  2: {
    operacion: "Cargue",
    nota:
      "En Avimol cada transportadora paga lo suyo: el cargue de vehículos de TERCEROS se le cobra al tercero " +
      "de contado y el de ZAMUDIO a Zamudio a crédito. Lo movido con vehículos propios de Avimol no se cobra " +
      "por tonelada — lo cubre el cargo fijo mensual —, así que se lista con valor 0.",
  },
}

export function cargueSoloPlacaPropia(idempresa?: number | null): { operacion: string; nota: string } | null {
  return CARGUE_SOLO_PLACA_PROPIA[Number(idempresa)] ?? null
}
