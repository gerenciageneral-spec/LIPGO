// Lógica PURA del cuadro de mando de nómina (sin "use server", sin I/O): tipos,
// defaults y el cálculo de recargos/horas extra a partir del salario + auxilio y
// los parámetros legales del año. Este mismo cálculo se replica en SQL dentro de
// la vista pagonomina (ver scripts/vistas_financieras.sql, CTE calculo_turnos).
//
// Convenciones (confirmadas contra las vistas reales):
//   - hed/hen/hedf/hef guardan la HORA COMPLETA  = HOD × (1 + %/100)
//   - hn (recargo nocturno) guarda SOLO EL RECARGO = HOD × (%/100)
//   - recargo dominical se aplica sobre el VALOR DÍA (no sobre la HOD)

export interface ParametrosNomina {
  anio: number
  smlv: number // salario mínimo legal mensual vigente del año (fallback / salario de prueba)
  auxilio: number // auxilio de transporte mensual del año
  diasCalendario: number // divisor del valor día (30)
  jornadaHoras: number // horas/día de la jornada legal (7); divisor mensual = dias × jornada (210)
  pctHed: number
  pctHen: number
  pctHn: number
  pctRecargoDominical: number
  pctHedf: number
  pctHef: number
  pctRecargoNocturnoDominical: number
}

// Defaults de ley (2026). El % dominical sube a 100 en 2027.
export const PARAMS_NOMINA_DEFAULTS: Omit<ParametrosNomina, "anio" | "smlv" | "auxilio"> = {
  diasCalendario: 30,
  jornadaHoras: 7,
  pctHed: 25,
  pctHen: 75,
  pctHn: 35,
  pctRecargoDominical: 90,
  pctHedf: 115,
  pctHef: 165,
  pctRecargoNocturnoDominical: 125,
}

export interface RecargosCalculados {
  smmlv: number // salario + auxilio
  valorDia: number // SMMLV / dias
  hod: number // hora ordinaria = SMMLV / (dias × jornada)
  hed: number
  hen: number
  hn: number
  hedf: number
  hef: number
  recargoDominical: number // sobre el valor día
  recargoNocturnoDominical: number // informativo (sin columna en tarifasturnos)
}

/**
 * Calcula el valor $/hora de cada recargo a partir del salario básico + auxilio y
 * los parámetros del año. En el preview del cuadro, `salario` = SMLV del año; en
 * producción, `salario` = headcount.salario (contrato) de cada persona.
 */
export function calcularRecargos(salario: number, aux: number, p: ParametrosNomina): RecargosCalculados {
  const smmlv = (Number(salario) || 0) + (Number(aux) || 0)
  const dias = Number(p.diasCalendario) || 0
  const jornada = Number(p.jornadaHoras) || 0
  const divisorMensual = dias * jornada

  const valorDia = dias > 0 ? smmlv / dias : 0
  const hod = divisorMensual > 0 ? smmlv / divisorMensual : 0

  return {
    smmlv,
    valorDia,
    hod,
    hed: hod * (1 + p.pctHed / 100),
    hen: hod * (1 + p.pctHen / 100),
    hn: hod * (p.pctHn / 100),
    hedf: hod * (1 + p.pctHedf / 100),
    hef: hod * (1 + p.pctHef / 100),
    recargoDominical: valorDia * (p.pctRecargoDominical / 100),
    recargoNocturnoDominical: hod * (p.pctRecargoNocturnoDominical / 100),
  }
}
