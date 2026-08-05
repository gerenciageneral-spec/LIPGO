// Regla de negocio confirmada por gerencia (2026-08-02, RE-CONFIRMADA el
// mismo día tras un intento de revertir por error): en Avimol (id2) el
// Cargue/Descargue variable por tonelada NO se factura a Avimol — CADA
// TRANSPORTADORA PAGA SU PROPIO CARGUE: transporte ZAMUDIO → se factura a
// Zamudio; transporte TERCEROS → se factura a Terceros. Avimol como owner
// SOLO factura por sus propios vehículos (transporte "AVIMOL"), y esa porción
// tampoco se factura por tonelada — la cubre el fijo mensual de Cargos Fijos
// (`cargos_fijos_proyecto`, ~$15.869.700/mes).
//
// QUÉ SON ESAS 600 TONELADAS (corregido 2026-08-05): son de DISTRIBUCIÓN, en
// DOS TRAMOS DE 300 ton a TARIFA distinta ($15.099 y $37.800). NO son "300
// cargue + 300 descargue", como afirmaba antes este comentario. La fuente es
// `scripts/create_cargos_fijos_proyecto.sql:52-57`, donde las dos filas se
// llaman literalmente "Distribución fija — tramo 1/2"; su encabezado explica
// que son la contrapartida de facturación del puesto "Distribución Turno".
// (Tampoco tienen que ver con `montacargas_alquiler`, que es otro concepto:
// alquiler por equipo, no toneladas.)
//
// OJO CON EL ALCANCE: `cubiertoPorFijo` pone en 0 las TRES operaciones —
// cargue, descargue y distribución— con placa propia de Avimol, aunque el fijo
// solo respalde la distribución. Coincide con la regla de gerencia ("solo se
// cobra lo que es de terceros y Zamudio"), pero NO hay ningún tope: si Avimol
// mueve 900 ton con placa propia, las 900 salen a $0 y el fijo no cambia.
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
