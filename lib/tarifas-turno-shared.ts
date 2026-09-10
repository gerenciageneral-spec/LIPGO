// Funciones puras de vigencia/tarifa contra `tarifasfacturacionturnos` (el
// maestro de tarifas de turno/hora extra). Extraídas de
// lib/conciliacion-avimol-actions.ts para reusarlas SIN copiarlas en
// lib/servicios-adicionales-indupan-actions.ts.
//
// Por qué en un archivo aparte y SIN "use server": un módulo "use server"
// exige que TODO export sea una función async (si no, Next.js falla el build
// con "Server Actions must be async functions") -- estas son funciones puras
// y síncronas por diseño, así que no pueden vivir exportadas ahí. Este
// archivo es un módulo de datos/lógica pura, importable desde cualquier
// server action sin esa restricción.
//
// Cero cambio de comportamiento respecto a como vivían dentro de
// conciliacion-avimol-actions.ts: mismo cuerpo, mismos comentarios.

import { normalizarPuesto } from "@/lib/puestos-turno-alias"

const num = (v: any) => Number(v || 0)

/**
 * Tarifa de HORA EXTRA vigente por (puesto, fecha) desde
 * `tarifasfacturacionturnos`. Ese maestro es GLOBAL (su `idempresa` está casi
 * sin asignar, ver lib/company-constants.ts), así que el lookup va por puesto +
 * vigencia sin filtrar empresa — igual que hace la vista `facturacionturnos`.
 * Vigencia en `fechainicio`/`fechafin` (NO `fechaini`, que es de
 * tarifaspersonal/tarifasturnos: el bug está a un carácter).
 */
export function tarifaHoraExtraVigente(tarifas: any[], puesto: string, fecha: string): number {
  const p = puesto.trim().toUpperCase()
  const fila = (tarifas || []).find(
    (t) =>
      String(t.puesto || "").trim().toUpperCase() === p &&
      String(t.fechainicio).slice(0, 10) <= fecha &&
      String(t.fechafin).slice(0, 10) >= fecha,
  )
  return fila ? num(fila.tarifahoraextra) : 0
}

/**
 * Fila vigente del maestro para un puesto. Mismo lookup que la hora extra
 * (por puesto + vigencia, sin filtrar empresa: el maestro es global).
 */
export function filaTurnoVigente(tarifas: any[], puesto: string, fecha: string): any | null {
  const p = normalizarPuesto(puesto)
  return (
    (tarifas || []).find(
      (t) =>
        normalizarPuesto(t.puesto) === p &&
        String(t.fechainicio).slice(0, 10) <= fecha &&
        String(t.fechafin).slice(0, 10) >= fecha,
    ) || null
  )
}

/**
 * Tarifa de TURNO vigente. Usa `tarifaturnofestivo` cuando el día es festivo:
 * el maestro la declara ($188.045 vs $136.131) y la vista legacy
 * `facturacionturnos` la ignora, cobrando festivos como ordinarios.
 */
export function tarifaTurnoVigente(fila: any | null, esFestivo: boolean): number {
  if (!fila) return 0
  if (esFestivo) {
    const f = num(fila.tarifaturnofestivo)
    if (f > 0) return f
  }
  return num(fila.tarifaturno)
}

/** `cobraturno` del maestro. Ausente o distinto de 'SI' = no se cobra por turno. */
export function cobraTurno(fila: any | null): boolean {
  return String(fila?.cobraturno ?? "").trim().toUpperCase() === "SI"
}
