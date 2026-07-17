// Lógica PURA de Seguridad Social y Parafiscales (sin "use server", sin I/O).
// Es la fuente de verdad del cálculo; la capa de datos (parafiscales-actions.ts)
// solo arma el IBC de cada persona y llama a `calcularAportes`.
//
// Marco legal (Colombia):
//   · IBC (Ingreso Base de Cotización) = salario básico + comisiones + horas
//     extras + recargos nocturnos + dominicales y festivos.
//     NO incluye el auxilio de transporte (no es salario, CST art. 128).
//   · Piso del IBC: 1 SMLV mensual (proporcional a los días cotizados).
//     Tope del IBC: 25 SMLV (Ley 100/1993 art. 18).
//   · Pensión (Ley 100 art. 20): 16% total → 12% empleador + 4% trabajador.
//   · Salud (Ley 100 art. 204): 12,5% total → 8,5% empleador + 4% trabajador.
//   · ARL (Decreto 1772/1994): 100% a cargo del empleador, % según la clase de
//     riesgo de la actividad económica.
//   · Parafiscales: Caja de Compensación 4% (SIEMPRE, sin exención),
//     SENA 2% e ICBF 3%. Base = IBC + auxilio de transporte.
//   · EXONERACIÓN (E.T. art. 114-1): el empleador NO paga salud (8,5%), SENA (2%)
//     ni ICBF (3%) por los trabajadores que devenguen MENOS de 10 SMMLV.
//     La Caja de Compensación (4%) y la pensión NUNCA se exoneran.
//     Si el trabajador devenga 10 SMMLV o más, esos tres aportes SÍ se causan.

export type ClaseRiesgo = "I" | "II" | "III" | "IV" | "V"

/** Tarifas de ARL por clase de riesgo (Decreto 1772/1994, tarifa media). */
export const CLASES_ARL: { clase: ClaseRiesgo; pct: number; nombre: string; ejemplo: string }[] = [
  { clase: "I", pct: 0.522, nombre: "Riesgo mínimo", ejemplo: "Oficina, administrativo" },
  { clase: "II", pct: 1.044, nombre: "Riesgo bajo", ejemplo: "Comercio, almacenes" },
  { clase: "III", pct: 2.436, nombre: "Riesgo medio", ejemplo: "Manufactura, procesos" },
  { clase: "IV", pct: 4.35, nombre: "Riesgo alto", ejemplo: "Conductores, transporte" },
  { clase: "V", pct: 6.96, nombre: "Riesgo máximo", ejemplo: "Construcción, minería" },
]

export const pctArl = (clase: ClaseRiesgo): number => CLASES_ARL.find((c) => c.clase === clase)?.pct ?? 0

export interface ParametrosParafiscales {
  anio: number
  pctPensionEmpleador: number
  pctPensionEmpleado: number
  pctSaludEmpleador: number
  pctSaludEmpleado: number
  pctSena: number
  pctIcbf: number
  pctCaja: number
  /** E.T. art. 114-1: umbral de exoneración, en SMMLV. */
  umbralExoneracionSmlv: number
  /** Ley 100 art. 18: tope del IBC, en SMLV. */
  topeIbcSmlv: number
  /** Clase de riesgo ARL del personal ADMINISTRATIVO (headcount.admin = true). */
  claseArlAdmin: ClaseRiesgo
  /** Clase de riesgo ARL del personal OPERATIVO (el resto). */
  claseArlOperativo: ClaseRiesgo
  /** Sumar el auxilio de transporte a la base de Caja/SENA/ICBF. */
  incluyeAuxParafiscales: boolean
}

export const PARAFISCALES_DEFAULT: Omit<ParametrosParafiscales, "anio"> = {
  pctPensionEmpleador: 12,
  pctPensionEmpleado: 4,
  pctSaludEmpleador: 8.5,
  pctSaludEmpleado: 4,
  pctSena: 2,
  pctIcbf: 3,
  pctCaja: 4,
  umbralExoneracionSmlv: 10,
  topeIbcSmlv: 25,
  claseArlAdmin: "I",
  claseArlOperativo: "IV",
  incluyeAuxParafiscales: true,
}

// ---------------------------------------------------------------------------
// BARANDAS LEGALES del cuadro de mando.
// Cada parámetro editable declara su VALOR DE LEY vigente, la norma que lo fija
// y el rango admisible. Editar es posible (una reforma legal puede cambiar un %),
// pero salirse del rango es un ERROR que bloquea el guardado, y apartarse del
// valor de ley es un AVISO que exige confirmación explícita.
// ---------------------------------------------------------------------------

export type CampoLegal = Exclude<keyof ParametrosParafiscales, "anio" | "claseArlAdmin" | "claseArlOperativo" | "incluyeAuxParafiscales">

export interface ReferenciaLegal {
  campo: CampoLegal
  label: string
  /** Valor que fija la norma vigente. */
  valorLey: number
  norma: string
  /** Rango admisible; fuera de él el valor es imposible/ilegal. */
  min: number
  max: number
  unidad: "%" | "SMMLV" | "SMLV"
  /** A quién se le paga / a qué ente corresponde. */
  ente: string
}

export const REFERENCIAS_LEY: ReferenciaLegal[] = [
  { campo: "pctPensionEmpleador", label: "Pensión · empresa", valorLey: 12, norma: "Ley 100/1993 art. 20", min: 0, max: 100, unidad: "%", ente: "Fondo de Pensiones" },
  { campo: "pctPensionEmpleado", label: "Pensión · trabajador", valorLey: 4, norma: "Ley 100/1993 art. 20", min: 0, max: 100, unidad: "%", ente: "Fondo de Pensiones" },
  { campo: "pctSaludEmpleador", label: "Salud · empresa", valorLey: 8.5, norma: "Ley 100/1993 art. 204", min: 0, max: 100, unidad: "%", ente: "EPS" },
  { campo: "pctSaludEmpleado", label: "Salud · trabajador", valorLey: 4, norma: "Ley 100/1993 art. 204", min: 0, max: 100, unidad: "%", ente: "EPS" },
  { campo: "pctCaja", label: "Caja de Compensación", valorLey: 4, norma: "Ley 21/1982", min: 0, max: 100, unidad: "%", ente: "Caja de Compensación" },
  { campo: "pctSena", label: "SENA", valorLey: 2, norma: "Ley 21/1982", min: 0, max: 100, unidad: "%", ente: "SENA" },
  { campo: "pctIcbf", label: "ICBF", valorLey: 3, norma: "Ley 89/1988", min: 0, max: 100, unidad: "%", ente: "ICBF" },
  { campo: "umbralExoneracionSmlv", label: "Umbral de exoneración", valorLey: 10, norma: "E.T. art. 114-1", min: 0, max: 25, unidad: "SMMLV", ente: "DIAN / UGPP" },
  { campo: "topeIbcSmlv", label: "Tope del IBC", valorLey: 25, norma: "Ley 100/1993 art. 18", min: 1, max: 100, unidad: "SMLV", ente: "UGPP" },
]

export interface AvisoLegal {
  campo: CampoLegal | "pensionTotal" | "saludTotal"
  nivel: "error" | "aviso"
  mensaje: string
}

/**
 * Contrasta los parámetros contra la norma vigente.
 *   · "error" → valor imposible o que rompe la norma → NO se debe guardar.
 *   · "aviso" → se aparta del valor de ley vigente → exige confirmación.
 * Nunca bloquea por completo la edición: una reforma legal debe poder cargarse.
 */
export function validarParametros(p: ParametrosParafiscales): AvisoLegal[] {
  const avisos: AvisoLegal[] = []

  for (const ref of REFERENCIAS_LEY) {
    const v = Number(p[ref.campo])
    if (!Number.isFinite(v)) {
      avisos.push({ campo: ref.campo, nivel: "error", mensaje: `${ref.label}: falta el valor.` })
      continue
    }
    if (v < ref.min || v > ref.max) {
      avisos.push({
        campo: ref.campo,
        nivel: "error",
        mensaje: `${ref.label}: ${v}${ref.unidad} está fuera del rango admisible (${ref.min}–${ref.max}${ref.unidad}).`,
      })
      continue
    }
    if (Math.abs(v - ref.valorLey) > 0.001) {
      avisos.push({
        campo: ref.campo,
        nivel: "aviso",
        mensaje: `${ref.label}: ${v}${ref.unidad} difiere del ${ref.valorLey}${ref.unidad} que fija la ${ref.norma}.`,
      })
    }
  }

  // Los totales de la cotización están fijados por la norma: si empresa +
  // trabajador no suma lo de ley, el aporte no lo recibe el ente completo.
  const pension = Number(p.pctPensionEmpleador) + Number(p.pctPensionEmpleado)
  if (Number.isFinite(pension) && Math.abs(pension - 16) > 0.001) {
    avisos.push({
      campo: "pensionTotal",
      nivel: "aviso",
      mensaje: `La cotización total de pensión suma ${pension}% y la Ley 100/1993 art. 20 fija 16% (12% empresa + 4% trabajador).`,
    })
  }
  const salud = Number(p.pctSaludEmpleador) + Number(p.pctSaludEmpleado)
  if (Number.isFinite(salud) && Math.abs(salud - 12.5) > 0.001) {
    avisos.push({
      campo: "saludTotal",
      nivel: "aviso",
      mensaje: `La cotización total de salud suma ${salud}% y la Ley 100/1993 art. 204 fija 12,5% (8,5% empresa + 4% trabajador).`,
    })
  }

  return avisos
}

export interface EntradaAportes {
  /** Devengado salarial del mes (sin auxilio de transporte). */
  devengado: number
  /** Auxilio de transporte proporcional a los días laborados. */
  auxilio: number
  /** Días con registro de nómina en el mes (para el piso proporcional del IBC). */
  dias: number
  /** SMLV del año. */
  smlv: number
  /** true = personal administrativo (headcount.admin). */
  esAdmin: boolean
}

export interface Aportes {
  ibc: number
  /** IBC llevado a mes completo — es el valor que se compara con los 10 SMMLV. */
  ibcMensualizado: number
  auxilio: number
  /** Base de Caja/SENA/ICBF = IBC (+ auxilio si el parámetro lo indica). */
  baseParafiscales: number
  claseArl: ClaseRiesgo
  pctArl: number
  /** true = devenga menos de 10 SMMLV → exonerado de salud/SENA/ICBF (art. 114-1). */
  exonerado: boolean
  /** Aportes a cargo de la EMPRESA. */
  pensionEmpleador: number
  saludEmpleador: number
  arl: number
  caja: number
  sena: number
  icbf: number
  totalEmpresa: number
  /** Deducciones a cargo del TRABAJADOR (la empresa las retiene y las paga en PILA). */
  pensionEmpleado: number
  saludEmpleado: number
  totalEmpleado: number
  /** Lo que efectivamente se gira en la planilla PILA. */
  totalPila: number
  /** Anotaciones del cálculo (topes/pisos aplicados) para trazabilidad. */
  notas: string[]
}

/**
 * Calcula los aportes de un trabajador para UN mes, aplicando piso y tope del
 * IBC y la exoneración del art. 114-1.
 */
export function calcularAportes(e: EntradaAportes, p: ParametrosParafiscales): Aportes {
  const notas: string[] = []
  const dias = Math.max(0, Math.min(Number(e.dias) || 0, 30))
  const smlv = Number(e.smlv) || 0

  // IBC = devengado salarial, acotado por el piso (1 SMLV proporcional a los
  // días cotizados) y el tope (25 SMLV).
  let ibc = Math.max(0, Number(e.devengado) || 0)
  const piso = dias > 0 ? (smlv / 30) * dias : 0
  const tope = smlv * p.topeIbcSmlv
  if (dias > 0 && ibc < piso) {
    notas.push(`IBC ajustado al piso legal de 1 SMLV proporcional (${dias} días).`)
    ibc = piso
  }
  if (ibc > tope) {
    notas.push(`IBC limitado al tope legal de ${p.topeIbcSmlv} SMLV.`)
    ibc = tope
  }

  // El umbral del art. 114-1 se evalúa sobre el devengo MENSUAL: si la persona
  // solo trabajó parte del mes, se lleva a mes completo para no exonerar por
  // error a un salario alto con pocos días.
  const ibcMensualizado = dias > 0 ? (ibc / dias) * 30 : ibc
  const exonerado = ibcMensualizado < smlv * p.umbralExoneracionSmlv
  notas.push(
    exonerado
      ? `Devenga menos de ${p.umbralExoneracionSmlv} SMMLV → exonerado de salud, SENA e ICBF (E.T. art. 114-1).`
      : `Devenga ${p.umbralExoneracionSmlv} SMMLV o más → NO aplica la exoneración: causa salud, SENA e ICBF.`,
  )

  const auxilio = Math.max(0, Number(e.auxilio) || 0)
  const baseParafiscales = ibc + (p.incluyeAuxParafiscales ? auxilio : 0)
  const claseArl = e.esAdmin ? p.claseArlAdmin : p.claseArlOperativo
  const tarifaArl = pctArl(claseArl)

  const pensionEmpleador = ibc * (p.pctPensionEmpleador / 100)
  const saludEmpleador = exonerado ? 0 : ibc * (p.pctSaludEmpleador / 100)
  const arl = ibc * (tarifaArl / 100)
  const caja = baseParafiscales * (p.pctCaja / 100) // sin exención
  const sena = exonerado ? 0 : baseParafiscales * (p.pctSena / 100)
  const icbf = exonerado ? 0 : baseParafiscales * (p.pctIcbf / 100)
  const totalEmpresa = pensionEmpleador + saludEmpleador + arl + caja + sena + icbf

  const pensionEmpleado = ibc * (p.pctPensionEmpleado / 100)
  const saludEmpleado = ibc * (p.pctSaludEmpleado / 100)
  const totalEmpleado = pensionEmpleado + saludEmpleado

  return {
    ibc,
    ibcMensualizado,
    auxilio,
    baseParafiscales,
    claseArl,
    pctArl: tarifaArl,
    exonerado,
    pensionEmpleador,
    saludEmpleador,
    arl,
    caja,
    sena,
    icbf,
    totalEmpresa,
    pensionEmpleado,
    saludEmpleado,
    totalEmpleado,
    totalPila: totalEmpresa + totalEmpleado,
    notas,
  }
}
