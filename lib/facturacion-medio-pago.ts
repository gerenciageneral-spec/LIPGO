// MEDIO DE PAGO ESPERADO SEGÚN EL TRANSPORTE.
//
// En Avimol (id 2) el transporte no solo dice quién mueve la carga: determina
// cómo se cobra el cargue, y esa es una regla dura del negocio.
//
//   · TERCEROS → el cliente recoge en bodega y paga de CONTADO, sin excepción.
//   · ZAMUDIO  → es cliente a CRÉDITO.
//
// En ambos casos el coordinador solicita la factura desde Gestión de Facturas;
// lo que cambia es la condición de pago, no el trámite.
//
// La regla es POR PROYECTO a propósito: en los demás el transporte no manda
// sobre el medio de pago, y aplicarla en bloque marcaría como inconsistente
// una operación que allí es normal.

export type MedioPago = "Contado" | "Crédito"

/** idempresa → transporte (normalizado) → medio de pago que corresponde. */
export const MEDIO_PAGO_POR_TRANSPORTE: Record<number, Record<string, MedioPago>> = {
  2: {
    TERCEROS: "Contado",
    ZAMUDIO: "Crédito",
  },
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()

/** ¿Este proyecto tiene la regla? Sirve para no mostrar la columna donde no aplica. */
export function proyectoConReglaMedioPago(idempresa?: number | null): boolean {
  return !!MEDIO_PAGO_POR_TRANSPORTE[Number(idempresa)]
}

/** Medio de pago que corresponde a un transporte, o null si no hay regla. */
export function medioPagoEsperado(idempresa: number | null | undefined, transporte: unknown): MedioPago | null {
  const reglas = MEDIO_PAGO_POR_TRANSPORTE[Number(idempresa)]
  if (!reglas) return null
  return reglas[norm(transporte)] ?? null
}

/**
 * ¿El medio de pago registrado contradice la regla? Solo cuenta como
 * incumplimiento si HAY regla y HAY dato: una orden todavía sin medio de pago
 * está pendiente de gestionar, que es otra cosa distinta a estar mal.
 */
export function medioPagoInconsistente(
  idempresa: number | null | undefined,
  transporte: unknown,
  mediopago: unknown,
): boolean {
  const esperado = medioPagoEsperado(idempresa, transporte)
  if (!esperado) return false
  const real = norm(mediopago)
  if (!real) return false
  return real !== norm(esperado)
}
