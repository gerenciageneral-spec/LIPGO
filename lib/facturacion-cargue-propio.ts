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
// La lista de placas propias sale de `distribucion_placas` con `activo = true`,
// que es el submódulo Configuración → Placas de Distribución. Se lee de la
// tabla en cada cálculo, NO del seed de lib/distribucion-placas.ts: ese seed es
// un fallback para que la automatización de distribución nunca se caiga, e
// incluye placas dadas de baja (GQV639). Facturar contra un fallback sería
// cobrar por una lista que nadie revisó.
//
// REGLA DE SEGURIDAD: si la lista no se puede leer, NO se filtra nada y se
// avisa. Es preferible una prefactura de más —que un humano revisa antes de
// emitir— a una de menos que se emite sin que nadie note lo que falta.

/** Proyectos donde el cargue solo se le factura al dueño de la placa. */
export const CARGUE_SOLO_PLACA_PROPIA: Record<number, { operacion: string; nota: string }> = {
  2: {
    operacion: "Cargue",
    nota:
      "A Avimol solo se le factura el cargue de los vehículos a su nombre (Configuración → Placas de " +
      "Distribución, activas). El cargue de vehículos de TERCEROS se le cobra al tercero de contado y el de " +
      "ZAMUDIO a Zamudio a crédito, así que no entran en este documento.",
  },
}

export function cargueSoloPlacaPropia(idempresa?: number | null): { operacion: string; nota: string } | null {
  return CARGUE_SOLO_PLACA_PROPIA[Number(idempresa)] ?? null
}

/** ¿La línea es un cargue que debe filtrarse por placa propia en este proyecto? */
export function esCargueFiltrable(idempresa: number | null | undefined, tipooperacion: unknown): boolean {
  const cfg = cargueSoloPlacaPropia(idempresa)
  if (!cfg) return false
  return String(tipooperacion ?? "").trim().toUpperCase() === cfg.operacion.toUpperCase()
}
