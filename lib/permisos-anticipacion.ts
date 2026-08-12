// ANTICIPACIÓN MÍNIMA PARA SOLICITAR UN PERMISO.
//
// La regla del negocio son 3 DÍAS CONTANDO EL DÍA DE HOY. Si hoy es el 12, el
// permiso más próximo que se puede pedir es para el 14: 12 (día 1), 13 (día 2),
// 14 (día 3).
//
// ANTES SE MEDÍA EN HORAS —`ahora + 72h`— y por eso se sentía un día más
// estricta de lo que dice la regla: el 12 a las 10 de la mañana + 72 h cae el 15
// a las 10, así que el 14 quedaba rechazado. Además el resultado dependía de la
// HORA en que se abriera el formulario, de modo que la misma solicitud pasaba o
// no según el momento del día.
//
// Ahora se cuenta en DÍAS DE CALENDARIO, que es como lo cuenta una persona.
//
// Archivo NORMAL (no "use server"): lo importan el formulario del portal (cliente)
// y `createSolicitudPermiso` (servidor) para que los dos apliquen exactamente la
// misma regla. Cuando la validación vivía duplicada en tres lugares bastaba con
// tocar uno para que dejaran de coincidir.

/** Días de anticipación, CONTANDO HOY como el primero. */
export const DIAS_ANTICIPACION_PERMISO = 3

/**
 * Hoy en el calendario COLOMBIANO (YYYY-MM-DD).
 *
 * Se fija la zona horaria a propósito: el servidor corre en UTC y el navegador
 * en la del equipo, así que sin esto la fecha límite podía diferir entre lo que
 * el formulario permitía elegir y lo que el servidor aceptaba.
 */
function hoyColombia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/**
 * Primera fecha (YYYY-MM-DD) para la que se puede pedir permiso.
 *
 * Sirve para dos cosas: validar y alimentar el atributo `min` del
 * `input[type=date]`, de modo que la fecha inválida ni siquiera se pueda elegir.
 */
export function fechaMinimaPermiso(): string {
  const [y, m, d] = hoyColombia().split("-").map(Number)
  // Hoy cuenta como el día 1, así que se suman DIAS − 1.
  const limite = new Date(Date.UTC(y, m - 1, d + (DIAS_ANTICIPACION_PERMISO - 1)))
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(limite)
}

/**
 * ¿La fecha de inicio respeta la anticipación mínima?
 *
 * Compara los strings YYYY-MM-DD directamente: en ese formato el orden
 * alfabético es el cronológico, así que no hace falta construir `Date` —y con
 * ello se evita el clásico desfase de un día al parsear fechas sin hora.
 */
export function cumpleAnticipacionPermiso(fechaInicio: string): boolean {
  const f = String(fechaInicio ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false
  return f >= fechaMinimaPermiso()
}

/** Mensaje único de rechazo, para que el portal y el servidor digan lo mismo. */
export function mensajeAnticipacionPermiso(): string {
  return `El permiso se debe solicitar con al menos ${DIAS_ANTICIPACION_PERMISO} días de anticipación contando hoy (a partir del ${fechaMinimaPermiso()}).`
}
