// Constantes del módulo "Prefactura de Producción".
//
// Viven FUERA de `lib/prefactura-produccion-actions.ts` a propósito: ese archivo
// lleva "use server" y ahí solo se pueden exportar funciones async. Exportar un
// array desde allá rompe el arranque de la app con
// "A 'use server' file can only export async functions, found object"
// —ya pasó con lib/bonos-actions.ts—. Aquí no hay directiva, así que se puede
// importar tanto desde el servidor como desde el cliente.

/** Proyectos que se facturan por PRODUCCIÓN, con su fuente de datos. */
export const PROYECTOS_PRODUCCION = [
  { idempresa: 1, nombre: "Indupan" }, // órdenes de cabeceraoc: Tolva / Tolva f
  { idempresa: 2, nombre: "Avimol" }, // tolva (invtrans): Salvado / Estibado PT + horas extra
] as const

export const AVIMOL_ID = 2
export const INDUPAN_ID = 1

/**
 * Operaciones de Indupan que se cobran por producción, escritas EXACTAMENTE como
 * están en `tarifasoperacion` ("Tolva f", con f minúscula). Se comparan
 * normalizadas para que una diferencia de mayúsculas no deje una orden sin cobrar.
 */
export const OPS_INDUPAN = ["Tolva", "Tolva f"] as const
