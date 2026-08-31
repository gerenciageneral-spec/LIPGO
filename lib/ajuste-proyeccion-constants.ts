// Constantes y tipos del submódulo "Ajuste Nómina Anterior" (Revisión de nómina;
// antes "Ajuste de Proyecciones").
//
// Viven FUERA del archivo de server actions a propósito: ese lleva "use server"
// y ahí solo se pueden exportar funciones async (exportar un objeto rompe el
// arranque de la app). Mismo criterio que lib/bonos-constants.ts.

/**
 * Novedades de Siigo que emite el ajuste en el archivo plano de la quincena
 * SIGUIENTE. El nombre es el string EXACTO que va a `archivoplano.nombrenovedad`.
 */
export const NOVEDAD_AJUSTE_INGRESO = "72-Ajuste proyección toneladas ingreso-Ingreso"
export const NOVEDAD_AJUSTE_DEDUCCION = "73-Ajuste mayor valor pagado toneladas-Deducción"

export type EstadoAjuste = "pendiente" | "aprobado" | "rechazado"

/** Última fecha del mes (28-31). */
export function finDeMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate()
}

/** Rango [desde, hasta] de una quincena, en ISO. */
export function rangoQuincena(anio: number, mes: number, quincena: 1 | 2) {
  const diaIni = quincena === 1 ? 1 : 16
  const diaFin = quincena === 1 ? 15 : finDeMes(anio, mes)
  const p = (n: number) => String(n).padStart(2, "0")
  return {
    desde: `${anio}-${p(mes)}-${p(diaIni)}`,
    hasta: `${anio}-${p(mes)}-${p(diaFin)}`,
  }
}

/**
 * Quincena SIGUIENTE a la dada — es donde se aplica el ajuste. El cruce se
 * corre el día después del pago (el 16 y el 1º), así que el ajuste de la
 * quincena 1 entra en la 2 del mismo mes, y el de la 2 en la 1 del mes que sigue.
 */
export function quincenaSiguiente(anio: number, mes: number, quincena: 1 | 2) {
  if (quincena === 1) return { anio, mes, quincena: 2 as const }
  return mes === 12
    ? { anio: anio + 1, mes: 1, quincena: 1 as const }
    : { anio, mes: mes + 1, quincena: 1 as const }
}
