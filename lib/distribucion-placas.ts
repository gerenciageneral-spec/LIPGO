// Vehículos PROPIOS de cada cliente que, además de cargar por LIP, hacen la
// DISTRIBUCIÓN con auxiliares de LIP. Cuando en "Generar órdenes de cargue" se
// monta una orden de cargue para una de estas placas, se DUPLICA automáticamente
// como orden de DISTRIBUCIÓN: mismo número + "D" al final, tipooperacion
// "Distribucion", copiando cliente, productos y cantidades de la orden original
// (el owner viaja pegado al producto). Antes esto se hacía a mano.
//
// Lista validada con el usuario (2026-07). Editable: agregar/quitar placas por
// idempresa aquí. Nota: WMP446 (emp 4) y SXX144 (vehículo de emp 1) quedaron
// EXCLUIDAS a propósito.
export const PLACAS_DISTRIBUCION: Record<number, string[]> = {
  2: ["QHC437", "QHQ434", "GQV639"],
  3: ["LWY354"],
  4: ["LWY393"],
}

const norm = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase()

/** ¿La placa de esta empresa debe generar orden de distribución automática? */
export function esPlacaDistribucion(
  empresaId: number | null | undefined,
  placa: string | null | undefined,
): boolean {
  if (!empresaId) return false
  const lista = PLACAS_DISTRIBUCION[empresaId]
  if (!lista || lista.length === 0) return false
  const p = norm(placa)
  if (!p) return false
  return lista.some((x) => norm(x) === p)
}

/** Número de la orden de distribución = número de la orden de cargue + "D". */
export function numeroOrdenDistribucion(ordenCargue: string): string {
  return `${ordenCargue}D`
}
