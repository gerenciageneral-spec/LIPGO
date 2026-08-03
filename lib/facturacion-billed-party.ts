// Regla de negocio confirmada por gerencia (2026-08-02, RE-CONFIRMADA el
// mismo día tras un intento de revertir por error): en Avimol (id2) el
// Cargue/Descargue variable por tonelada NO se factura a Avimol — CADA
// TRANSPORTADORA PAGA SU PROPIO CARGUE: transporte ZAMUDIO → se factura a
// Zamudio; transporte TERCEROS → se factura a Terceros. Avimol como owner
// SOLO factura por sus propios vehículos (transporte "AVIMOL"), y esa porción
// tampoco se factura por tonelada — se cruza contra el fijo de 600 ton/mes
// (300 cargue + 300 descargue, la distribución con placa propia también
// entra ahí) de Cargos Fijos (`lib/cargos-fijos-actions.ts`,
// `montacargas_alquiler`/`cargos_fijos_proyecto`, ~$15.869.700/mes).
//
// Producción (Estibado PT/Salvado + festivos), turnos y novedades adicionales
// SÍ se facturan a Avimol sin cambios — no pasan por esta función (no nacen de
// una orden de la vista `facturacion`, no tienen `transporte`).
//
// Archivo NORMAL (no "use server"): se importa directo desde
// facturacion-control-actions.ts, cierre-financiero-actions.ts y
// analisis-financiero-actions.ts para que los tres calculen exactamente igual.

const OPS_POR_TRANSPORTE_ID2 = new Set(["cargue", "descargue", "distribucion"])

export interface FacturadoA {
  /** A quién se factura esta línea (puede diferir del owner del producto). */
  owner: string
  /** true = movimiento real (cuenta en toneladas), pero YA PAGADO por el fijo
   *  mensual: el valor a facturar de esta línea es 0. */
  cubiertoPorFijo: boolean
}

export function facturadoAOwner(
  idempresa: number,
  ownerProducto: string,
  operacion: string | null,
  transporte: string | null,
): FacturadoA {
  if (idempresa !== 2) return { owner: ownerProducto, cubiertoPorFijo: false }
  const op = String(operacion ?? "").trim().toLowerCase()
  if (!OPS_POR_TRANSPORTE_ID2.has(op)) return { owner: ownerProducto, cubiertoPorFijo: false }
  const tr = String(transporte ?? "").trim().toUpperCase()
  if (tr === "ZAMUDIO") return { owner: "Zamudio", cubiertoPorFijo: false }
  if (tr === "TERCEROS") return { owner: "Terceros", cubiertoPorFijo: false }
  if (tr === "AVIMOL") return { owner: ownerProducto, cubiertoPorFijo: true }
  return { owner: ownerProducto, cubiertoPorFijo: false } // Susanita u otro: sin cambio
}
