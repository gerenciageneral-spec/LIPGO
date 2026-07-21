// Placas que LIP NO atiende en el cargue de ciertos proyectos y que, por tanto,
// se EXCLUYEN por completo del submódulo de Gestión de Facturas (listado, conteo
// y export). La orden sí existe en `cabeceraoc` (la generó la operación), pero no
// corresponde a LIP facturarla.
//
// Proyecto 4 (CEDI Medellín): WMP446 — vehículo que LIP no atiende en el cargue.
export const PLACAS_EXCLUIDAS_FACTURAS: Record<number, string[]> = {
  4: ["WMP446"],
}

/**
 * Aplica la exclusión de placas al query de `cabeceraoc` para la empresa dada.
 * CONSERVA las filas con placa nula: el filtro es `placa IS NULL OR placa <> 'X'`
 * (un simple `neq`/`not` dejaría fuera las nulas, que sí deben aparecer).
 * Se usa igual en el listado, el conteo y el export para que el número cuadre.
 */
export function excluirPlacasFacturas(q: any, empresaId: number | null): any {
  if (!empresaId) return q
  for (const placa of PLACAS_EXCLUIDAS_FACTURAS[empresaId] ?? []) {
    q = q.or(`placa.is.null,placa.neq.${placa}`)
  }
  return q
}
