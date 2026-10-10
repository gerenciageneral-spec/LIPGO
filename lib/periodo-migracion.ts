/**
 * LA MIGRACIÓN AL SOFTWARE (enero y febrero de 2026).
 *
 * Módulo PURO. Gerencia, 2026-10-10: "en enero y febrero se está migrando al software, por eso
 * tantas inconsistencias; propongo buscar la manera de cerrar y no generar inconveniente, ya que
 * es normal por la implementación".
 *
 * POR QUÉ HACE FALTA DECIRLO EN EL CÓDIGO. Medido el 2026-10-10 en `v_orden_vs_salidas`: de los
 * 75 casos de "salió más de lo que la orden autorizó o salió un producto que no estaba en la
 * orden", **67 son de enero y febrero** (45 y 22), y octubre tiene CERO. Una pantalla que los
 * mezcla con la operación de hoy no está informando: está escondiendo lo que importa detrás de
 * ruido de arranque. Y peor, enseña a la gente a ignorar la alerta.
 *
 * QUÉ SE HACE Y QUÉ NO. Los casos de la migración se marcan y se cuentan APARTE, con su nombre;
 * no se borran, no se corrigen y no se tocan sus datos (misma regla que el resto del histórico
 * cerrado). Lo que se evita es que compitan con lo de hoy en la misma cifra.
 */

/** Primer mes de la migración, inclusive (AAAA-MM). */
export const MIGRACION_DESDE = "2026-01"
/** Último mes de la migración, inclusive (AAAA-MM). */
export const MIGRACION_HASTA = "2026-02"

export const ETIQUETA_MIGRACION = "migración al software (enero y febrero de 2026)"

/** El mes (AAAA-MM) de una fecha, sea date o timestamp, sin inventar nada si viene vacía. */
export function mesDe(fecha: string | null | undefined): string {
  const f = String(fecha ?? "").trim()
  return f.length >= 7 ? f.slice(0, 7) : ""
}

/** ¿Esa fecha cae en los meses de la migración? */
export function esDeLaMigracion(fecha: string | null | undefined): boolean {
  const m = mesDe(fecha)
  return m !== "" && m >= MIGRACION_DESDE && m <= MIGRACION_HASTA
}

/**
 * La fecha con la que se ubica en el tiempo una fila del cruce orden ↔ salidas.
 *
 * OJO, ES LA TRAMPA DE ESTA VISTA: en las filas FUERA_DE_LA_ORDEN no hay línea de orden, así que
 * `fechaorden` y `fechacargue` vienen NULAS — y son justo las más graves. Filtrar por `fechacargue`
 * las borraba del tablero (pasó en el chequeo de convergencia el 2026-10-07). Se usa la primera
 * fecha utilizable, empezando por cuándo salió de verdad el producto.
 */
export function fechaEfectivaCruce(fila: {
  fechacargue?: string | null
  primera_salida?: string | null
  fechaorden?: string | null
}): string {
  const f = String(fila.fechacargue ?? "").trim() || String(fila.primera_salida ?? "").trim() || String(fila.fechaorden ?? "").trim()
  return f.slice(0, 10)
}

/** ¿La fila cae dentro del período pedido? Sin período, todo entra. */
export function dentroDelPeriodo(fecha: string, desde?: string | null, hasta?: string | null): boolean {
  const f = String(fecha ?? "").slice(0, 10)
  if (!f) return !desde && !hasta
  if (desde && f < String(desde).slice(0, 10)) return false
  if (hasta && f > String(hasta).slice(0, 10)) return false
  return true
}

/** Primer y último día de un mes AAAA-MM. Devuelve null si el mes no es válido. */
export function rangoDelMes(anio: string | number | null | undefined, mes: string | number | null | undefined): { desde: string; hasta: string } | null {
  const a = Number(anio)
  const m = Number(mes)
  if (!Number.isFinite(a) || !Number.isFinite(m) || a < 2000 || m < 1 || m > 12) return null
  const desde = `${a}-${String(m).padStart(2, "0")}-01`
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { desde, hasta: `${a}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}` }
}
