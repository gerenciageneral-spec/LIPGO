// PROCESOS DEL CIERRE FINANCIERO — a qué proceso facturable pertenece cada peso
// que se paga y cada peso que se cobra.
//
// El principio del cierre es el del negocio: CADA PROCESO TIENE ASIGNADO SU
// RECURSO, y todos tienen definido cómo se paga y cómo se factura. El cargue se
// paga por toneladas y se factura por toneladas; el Estibado PT se paga por
// turno + novedades y se factura con los ingresos de producción aprobados; los
// turnos adicionales se pagan por turno y se cobran según la solicitud
// aprobada. Este archivo declara esa correspondencia para que el cierre pueda
// poner, lado a lado, lo pagado y lo facturado DE CADA PROCESO.
//
// El lado del PAGO se clasifica desde `pagonomina.actividad_registrada`:
//
//   'Cargue/Descargue'      → DESTAJO (movió toneladas; su cobro son las órdenes)
//   puesto de producción    → PRODUCCIÓN (su cobro son los ingresos aprobados)
//   'Festivo'               → sin proceso: día festivo pagado, no atribuible
//   'Sin Registro'          → sin proceso: NADIE registró qué hizo — alerta
//   cualquier otro puesto   → TURNOS (su cobro es la solicitud aprobada)
//
// Qué puesto es "de producción" NO se decide aquí a ojo: sale del maestro
// `tarifasfacturacionturnos.cobraturno = 'NO'` (el negocio ya declaró que esos
// puestos no se cobran por turno porque se cobran por producción). La lista se
// copia declarada para no ir a la base por ella en cada fila; si el maestro
// cambia, se actualiza aquí.
//
// Este archivo es solo declarativo: no puede vivir dentro del action, que por
// ser "use server" únicamente exporta funciones async.

export type ProcesoCierre =
  | "destajo" // cargue / descargue / distribución pagados por toneladas
  | "produccion" // tolva, estibado PT, salvado — se cobra por ingresos aprobados
  | "turnos" // turnos adicionales — se cobran por solicitud aprobada
  | "horas_extra" // recargos y horas extra (se cobran aparte donde aplica)
  | "festivo" // festivo pagado sin proceso detrás
  | "sin_registro" // pagado sin que nadie registrara la actividad

export const ETIQUETA_PROCESO: Record<ProcesoCierre, string> = {
  destajo: "Operación a destajo (cargue / descargue / distribución)",
  produccion: "Producción",
  turnos: "Turnos adicionales",
  horas_extra: "Horas extra y recargos",
  festivo: "Festivo (sin proceso)",
  sin_registro: "Sin registro de actividad",
}

/** Cómo se PAGA y cómo se FACTURA cada proceso — se muestra en la UI para que
 *  el cierre se pueda auditar sin abrir el código. */
export const REGLA_PROCESO: Record<ProcesoCierre, { paga: string; factura: string }> = {
  destajo: { paga: "base del día + excedente de destajo (bono quincenal)", factura: "toneladas de la orden × tarifa del owner" },
  produccion: { paga: "turno + novedades", factura: "ingresos de producción aprobados × tarifa" },
  turnos: { paga: "turno + novedades", factura: "turnos solicitados y aprobados × tarifa" },
  horas_extra: { paga: "recargos y horas extra de la nómina", factura: "horas ejecutadas × tarifa hora extra (donde aplica)" },
  festivo: { paga: "base del día festivo", factura: "no se factura: es costo del calendario" },
  sin_registro: { paga: "base del día", factura: "NO SE PUEDE COBRAR: nadie registró la actividad" },
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()

/**
 * Puestos que se cobran por PRODUCCIÓN y no por turno. Fuente:
 * `tarifasfacturacionturnos.cobraturno = 'NO'` (verificado 2026-08-01) +
 * 'Tolva Bulto' de Indupan, cuya producción se cobra por las órdenes de Tolva.
 */
const PUESTOS_PRODUCCION = new Set(
  ["Estibado PT", "Salvado", "Montacargas de producción", "Distribución Externa", "Tolva Bulto"].map(norm),
)

/** Clasifica una fila de `pagonomina` por su `actividad_registrada`. */
export function procesoDeActividad(actividad: unknown): ProcesoCierre {
  const a = norm(actividad)
  if (!a || a === "SIN REGISTRO") return "sin_registro"
  if (a === "FESTIVO") return "festivo"
  if (a === "CARGUE/DESCARGUE") return "destajo"
  if (PUESTOS_PRODUCCION.has(a)) return "produccion"
  return "turnos"
}

/** Orden fijo de presentación: primero lo que se cobra, al final lo que no. */
export const ORDEN_PROCESOS: ProcesoCierre[] = [
  "destajo",
  "produccion",
  "turnos",
  "horas_extra",
  "festivo",
  "sin_registro",
]
