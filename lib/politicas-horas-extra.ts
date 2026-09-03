// Políticas de horas extra por puesto — LÓGICA PURA, sin acceso a datos.
//
// ⚠️ ESTE ARCHIVO ES UN ESPEJO DE LA FUNCIÓN SQL
// `public.calcular_extras_con_politica` (scripts/sig/57_politica_horas_extra.sql).
// El cálculo de verdad —el que decide lo que se paga y lo que se factura— vive
// en SQL, dentro del trigger. Esta copia existe SOLO para que el simulador de la
// pantalla responda al instante mientras se escribe, sin ir al servidor.
//
// Cualquier cambio en la fórmula va en LOS DOS lados. El script 57 trae una
// consulta de contraste (paso 7c) que compara ambas implementaciones sobre los
// mismos casos: si divergen, se nota ahí.

/** Cómo se recorta el resultado final. */
export type RedondeoModo = "truncar" | "redondear" | "bloque"

export interface PoliticaHorasExtra {
  id?: number
  /** '*' es la política por defecto, para los puestos sin regla propia. */
  puesto: string
  /** Se compara contra la FECHA TRABAJADA, no contra la fecha de edición. */
  fechaDesde: string
  /** ISODOW 1=lunes … 7=domingo. null = política base del puesto. */
  diaSemana: number | null
  umbralHoras: number
  horasDescanso: number
  /** Si no es null, el descanso solo se descuenta cuando el total lo supera. */
  descansoDesdeHoras: number | null
  toleranciaSalidaMin: number
  minimoExtraHoras: number
  /** Tope POR TURNO, no por día: hay puestos con dos filas el mismo día. */
  topeExtraTurnoHoras: number | null
  redondeoModo: RedondeoModo
  redondeoBloqueMin: number | null
  /** Reservado: el cálculo automático de nocturnas es una entrega aparte. */
  ventanaNocturnaDesde: string | null
  ventanaNocturnaHasta: string | null
  activa: boolean
  nota: string | null
  actualizadoAt?: string | null
}

/**
 * Los valores de siempre, los que estaban quemados en la función trigger.
 *
 * Son el punto de retorno si no hay ninguna política configurada: sin ellos, la
 * ausencia de configuración daría 0 horas extra y se borrarían horas reales en
 * silencio.
 */
export const POLITICA_DEFAULTS: Omit<PoliticaHorasExtra, "puesto" | "fechaDesde" | "diaSemana"> = {
  umbralHoras: 7.0,
  horasDescanso: 1.0,
  descansoDesdeHoras: null,
  toleranciaSalidaMin: 45,
  minimoExtraHoras: 0,
  topeExtraTurnoHoras: null,
  redondeoModo: "truncar",
  redondeoBloqueMin: null,
  ventanaNocturnaDesde: null,
  ventanaNocturnaHasta: null,
  activa: true,
  nota: null,
}

export const DIAS_SEMANA: Array<{ valor: number; nombre: string; corto: string }> = [
  { valor: 1, nombre: "Lunes", corto: "Lun" },
  { valor: 2, nombre: "Martes", corto: "Mar" },
  { valor: 3, nombre: "Miércoles", corto: "Mié" },
  { valor: 4, nombre: "Jueves", corto: "Jue" },
  { valor: 5, nombre: "Viernes", corto: "Vie" },
  { valor: 6, nombre: "Sábado", corto: "Sáb" },
  { valor: 7, nombre: "Domingo", corto: "Dom" },
]

/** El puesto comodín. */
export const PUESTO_TODOS = "*"

/**
 * Día de la semana en formato ISO (1=lunes … 7=domingo) de un 'YYYY-MM-DD'.
 *
 * Se parte la cadena en vez de pasarla por `new Date(iso)`: ese constructor
 * interpreta el texto en UTC y en Colombia —UTC-5— un sábado se leería como
 * viernes. Con la política de sábado en juego, eso daría el umbral equivocado.
 */
export function isoDowDeFecha(fechaISO: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaISO ?? "").trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return null
  const dow = d.getDay() // 0=domingo
  return dow === 0 ? 7 : dow
}

/**
 * La política que gana para un puesto y una fecha.
 *
 * Prioridad, de mayor a menor:
 *   1. puesto propio + día concreto
 *   2. puesto propio + base
 *   3. '*' + día concreto
 *   4. '*' + base
 *
 * La fila ganadora aporta TODOS sus valores; no se mezclan campos entre filas.
 * Así "qué política se aplicó" tiene una respuesta única y auditable.
 *
 * Espejo del `order by` de `resolver_politica_horas_extra`.
 */
export function resolverPolitica(
  politicas: PoliticaHorasExtra[],
  puesto: string | null | undefined,
  fechaISO: string,
): PoliticaHorasExtra | null {
  const dow = isoDowDeFecha(fechaISO)
  if (dow == null) return null
  const p = String(puesto ?? "").trim()

  const candidatas = politicas.filter(
    (x) =>
      x.activa &&
      x.fechaDesde <= fechaISO &&
      (x.puesto === p || x.puesto === PUESTO_TODOS) &&
      (x.diaSemana === dow || x.diaSemana == null),
  )
  if (candidatas.length === 0) return null

  candidatas.sort((a, b) => {
    const propio = Number(b.puesto !== PUESTO_TODOS) - Number(a.puesto !== PUESTO_TODOS)
    if (propio !== 0) return propio
    const conDia = Number(b.diaSemana != null) - Number(a.diaSemana != null)
    if (conDia !== 0) return conDia
    if (a.fechaDesde !== b.fechaDesde) return b.fechaDesde.localeCompare(a.fechaDesde)
    return (b.id ?? 0) - (a.id ?? 0)
  })

  return candidatas[0]
}

/** "HH:MM" o "HH:MM:SS" → minutos desde medianoche. null si no se entiende. */
export function horaAMinutos(hora: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(hora ?? "").trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export interface EntradaCalculo {
  horaIngreso: string
  horaEntradaProgramada: string
  horaSalida: string
  horaSalidaProgramada: string
}

/** El paso a paso del cálculo, para poder mostrarlo y auditarlo. */
export interface DetalleCalculo {
  inicioEfectivo: string
  finEfectivo: string
  horasTotales: number
  descansoAplicado: number
  descuentaDescanso: boolean
  umbral: number
  brutoAntesDeAjustes: number
  horasExtra: number
  /** Qué recorte se aplicó al final, ya en lenguaje humano. */
  ajuste: string | null
}

const dosDecimales = (n: number) => Math.round(n * 100) / 100

const minutosAHora = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

/**
 * Horas extra de una jornada, con el paso a paso.
 *
 * Espejo de `calcular_extras_con_politica`. Si `politica` es null se usan los
 * valores de siempre (POLITICA_DEFAULTS), igual que el COALESCE de la función
 * SQL: nunca devuelve 0 por falta de configuración.
 */
export function calcularHorasExtra(
  entrada: EntradaCalculo,
  politica: PoliticaHorasExtra | null,
): DetalleCalculo | null {
  const ingreso = horaAMinutos(entrada.horaIngreso)
  const entradaProg = horaAMinutos(entrada.horaEntradaProgramada)
  const salida = horaAMinutos(entrada.horaSalida)
  const salidaProg = horaAMinutos(entrada.horaSalidaProgramada)
  if (ingreso == null || entradaProg == null || salida == null || salidaProg == null) return null

  const umbral = politica?.umbralHoras ?? POLITICA_DEFAULTS.umbralHoras
  const descanso = politica?.horasDescanso ?? POLITICA_DEFAULTS.horasDescanso
  const descansoDesde = politica?.descansoDesdeHoras ?? null
  const tolerancia = politica?.toleranciaSalidaMin ?? POLITICA_DEFAULTS.toleranciaSalidaMin
  const minimo = politica?.minimoExtraHoras ?? POLITICA_DEFAULTS.minimoExtraHoras
  const tope = politica?.topeExtraTurnoHoras ?? null
  const modo = politica?.redondeoModo ?? POLITICA_DEFAULTS.redondeoModo
  const bloque = politica?.redondeoBloqueMin ?? null

  // 1) Inicio efectivo: llegar antes no cuenta.
  const inicioEfectivo = ingreso < entradaProg ? entradaProg : ingreso

  // 2) Fin efectivo, con la tolerancia. Se normaliza el cruce de medianoche.
  let exceso = salida - salidaProg
  if (exceso < -720) exceso += 1440
  else if (exceso > 720) exceso -= 1440
  const finEfectivo = exceso >= 0 && exceso < tolerancia ? salidaProg : salida

  // 3) Horas trabajadas.
  let trabajado = finEfectivo - inicioEfectivo
  if (trabajado < 0) trabajado += 1440
  const horasTotales = trabajado / 60

  // 4) Descanso: siempre, o solo si el turno pasa de cierto largo.
  const descuentaDescanso = descansoDesde == null || horasTotales > descansoDesde
  let extra = horasTotales - umbral
  if (descuentaDescanso) extra -= descanso
  if (extra < 0) extra = 0
  const bruto = extra

  // 5) Redondeo.
  let ajuste: string | null = null
  if (modo === "bloque" && bloque && bloque > 0) {
    const antes = extra
    extra = (Math.floor((extra * 60) / bloque) * bloque) / 60
    if (extra !== antes) ajuste = `Redondeado hacia abajo a bloques de ${bloque} min`
  } else if (modo === "redondear") {
    extra = dosDecimales(extra)
  } else {
    extra = Math.trunc(extra * 100) / 100
  }

  // 6) Mínimo.
  if (extra < minimo) {
    if (extra > 0) ajuste = `Por debajo del mínimo de ${minimo} h: no se genera`
    extra = 0
  }

  // 7) Tope por turno.
  if (tope != null && extra > tope) {
    extra = tope
    ajuste = `Recortado al tope de ${tope} h por turno`
  }

  return {
    inicioEfectivo: minutosAHora(inicioEfectivo),
    finEfectivo: minutosAHora(finEfectivo),
    horasTotales: dosDecimales(horasTotales),
    descansoAplicado: descuentaDescanso ? descanso : 0,
    descuentaDescanso,
    umbral,
    brutoAntesDeAjustes: dosDecimales(bruto),
    horasExtra: dosDecimales(extra),
    ajuste,
  }
}

/**
 * Cómo se llama la política en pantalla: "Distribución Turno · sábado · desde
 * 1900-01-01". Sin esto no hay forma de depurar por qué salió un número.
 */
export function describirPolitica(p: PoliticaHorasExtra | null): string {
  if (!p) return "Sin política configurada (se usan los valores por defecto)"
  const puesto = p.puesto === PUESTO_TODOS ? "Todos los puestos" : p.puesto
  const dia = p.diaSemana == null
    ? "todos los días"
    : (DIAS_SEMANA.find((d) => d.valor === p.diaSemana)?.nombre.toLowerCase() ?? `día ${p.diaSemana}`)
  return `${puesto} · ${dia} · desde ${p.fechaDesde}`
}

/**
 * El umbral total en lenguaje humano: lo que de verdad tiene que trabajar
 * alguien antes de que empiece a contar la hora extra.
 */
export function explicarUmbral(p: PoliticaHorasExtra | null): string {
  const umbral = p?.umbralHoras ?? POLITICA_DEFAULTS.umbralHoras
  const descanso = p?.horasDescanso ?? POLITICA_DEFAULTS.horasDescanso
  const desde = p?.descansoDesdeHoras ?? null
  const tol = p?.toleranciaSalidaMin ?? POLITICA_DEFAULTS.toleranciaSalidaMin
  const total = umbral + descanso

  const base = desde == null
    ? `Se paga extra a partir de ${total.toLocaleString("es-CO")} h trabajadas (${umbral} h de jornada + ${descanso} h de descanso).`
    : `Se paga extra a partir de ${umbral} h trabajadas. El descanso de ${descanso} h solo se descuenta cuando el turno pasa de ${desde} h, así que en un turno largo el umbral sube a ${total}.`

  return `${base} Quedarse hasta ${tol} min de más no cuenta.`
}
