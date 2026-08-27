// Constantes y helpers SINCRONOS de la meta de productividad dinamica,
// compartidos entre `lib/meta-productividad-actions.ts`, `lib/empresa-meta-dia.ts`
// y `lib/control-toneladas-actions.ts` — un solo lugar para no desalinear el
// numero. Archivo plano (sin "use server"): un archivo "use server" solo
// puede exportar funciones async (regla de Next.js), y esto son constantes y
// funciones sincronas. Mismo patron que lib/nomina-calculo-utils.ts.

/**
 * Ton/mes del pool de Cargue + Distribución (la "tarea diaria" operativa)
 * por proyecto — suma de los actividad_codigo de `acuerdo_volumenes` que
 * corresponden a ESE pool. Confirmado con el usuario 2026-08-18: SOLO
 * cargue y distribución cuentan para el indicador de los dashboards
 * diarios; Producción (Tolva, Estibado PT, Salvado) tiene su PROPIO
 * indicador OEE de Producción y no suma acá — y el mecanismo de
 * FACTURACIÓN (ej. Distribución de Avimol se cobra vía fijo mensual, no
 * por tonelada) es un asunto aparte que NO decide si algo cuenta como
 * tarea diaria: si el trabajo es cargue/distribución, cuenta, sin
 * importar cómo se factura.
 *
 * Verificado en vivo (2026-08-18) contra `acuerdo_volumenes`:
 *   id1: aux_cargue_descargue(3500) + cargue_subproducto(1000) = 4.500
 *        (Indupan no tiene actividad de distribución en el acuerdo;
 *        excluye tolva/tolva_domingo — producción)
 *   id2: aux_cargue_descargue(3350) + cargue_subproducto(875) +
 *        distribución(300, cuenta UNA vez — mismo tonelaje físico
 *        reportado bajo 2 códigos, no se duplica) = 4.525
 *        (vigencia jul-dic-2026; excluye estibado/salvado — producción)
 *   id3: cargue+descargue+distribucion = 1000+1000+200 = 2.200
 *        (un solo pool "Cargue/Descargue" en registroasistencia, sin
 *        puestos de producción separados)
 *   id4: cargue_propio+descargue_propio+descargue_pt_molinos+
 *        descargue_pt_avimol+cargue_cliente_recoge = 230+230+508+485+240
 *        = 1.693 (mismo caso, un solo pool, sin producción separada)
 *
 * Es la MISMA fuente que usa `EMPRESA_META_DIA_TON` (lib/empresa-meta-dia.ts)
 * para id1-4 — un solo número de "meta diaria de Cargue/Distribución" en
 * toda la app (BSC, dashboards, Control de Toneladas, Revisión de Nómina).
 */
export const TON_MES_CARGUE_DESCARGUE: Record<number, number> = {
  1: 4500,
  2: 4525,
  3: 2200,
  4: 1693,
}

/** Dias habiles/mes (lunes a sabado, sin domingos ni festivos) — mismo criterio en toda la app. */
export const DIAS_OPERACION_MES = 24.7

function normPuesto(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

/**
 * Puestos (registroasistencia.puesto) que cuentan para el HEADCOUNT de la
 * meta diaria de Cargue/Distribución, por proyecto — confirmado con el
 * usuario 2026-08-18. Puestos de producción (Estibado PT, Salvado,
 * Montacargas de producción) y líneas ajenas al acuerdo (Arrume Negro,
 * Cargue/Descargue Huevos, Clasificación huevos, Cosedor, Mantenimiento
 * Estibas, Montacargas de cargue, Pacas, Reempaque — todas de Avimol, sin
 * actividad_codigo propio en el acuerdo) quedan FUERA a propósito.
 *
 * OJO: "Distribución Turno" (Avimol) NO cuenta para el headcount aunque su
 * tonelaje SÍ cuente para `TON_MES_CARGUE_DESCARGUE` — confirmado con el
 * usuario: esas personas no están en Cargue, son un pool aparte (cubierto
 * por el fijo mensual de Cargos Fijos). El tonelaje de Distribución cuenta
 * como TAREA del proyecto, pero no diluye la meta/hora de los auxiliares de
 * Cargue/Descargue con más gente de la que realmente hace ese trabajo.
 */
const PUESTOS_CARGUE_DESCARGUE: Record<number, Set<string>> = {
  1: new Set(["CARGUE/DESCARGUE", "AUXILIAR MIXTO"]),
  2: new Set(["CARGUE/DESCARGUE"]),
  3: new Set(["CARGUE/DESCARGUE"]),
  4: new Set(["CARGUE/DESCARGUE"]),
}

/** true si el puesto cuenta para el headcount de la meta diaria de Cargue/Distribución de ese proyecto. */
export function esPuestoCargueDescargue(idempresa: number, puesto: unknown): boolean {
  return PUESTOS_CARGUE_DESCARGUE[idempresa]?.has(normPuesto(puesto)) ?? false
}

/** Duracion en horas entre dos "HH:MM[:SS]", asumiendo +24h si la salida es menor (turno que cruza medianoche). */
export function duracionHoras(entrada: string, salida: string): number {
  const [he, me] = entrada.split(":").map(Number)
  const [hs, ms] = salida.split(":").map(Number)
  if (!Number.isFinite(he) || !Number.isFinite(hs)) return 0
  let minEntrada = he * 60 + (me || 0)
  let minSalida = hs * 60 + (ms || 0)
  if (minSalida <= minEntrada) minSalida += 24 * 60
  return (minSalida - minEntrada) / 60
}

/** Jornada NETA (descuenta 1h de almuerzo, confirmado por el usuario 2026-08-18: todos los trabajadores almuerzan 1h/día). Para calcular capacidad/meta-hora, no para "horas transcurridas" en vivo. */
export function duracionHorasNetas(entrada: string, salida: string): number {
  return Math.max(0, duracionHoras(entrada, salida) - 1)
}

export function normNombreMeta(s: unknown): string {
  return String(s ?? "").trim().toUpperCase()
}

/** Meta individual de UNA persona ese dia = meta/hora del proyecto x sus horas programadas ese dia. */
export function metaTrabajadorParaHoras(metaPorHora: number, horasProgramadasPersona: number): number {
  return metaPorHora > 0 ? metaPorHora * horasProgramadasPersona : 0
}
