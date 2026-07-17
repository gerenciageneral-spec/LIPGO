// Config de FICHAS de los indicadores del SG-SST (0312). Es la fuente estática
// que alimenta el viewer genérico de indicadores (components/indicadores) y el
// tablero. No renderiza; solo datos/ayudas. (Sin "use client": es data pura.)

export const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

export interface Ficha {
  tipo: string
  numeral?: string
  nombre: string
  definicion: string
  formula: string
  interpretacion: string
  fuente: string
  periodicidad: string
  responsable: string
  sentido: "menor" | "mayor"
  clase: "resultado" | "gestion"
}

export const FICHAS: Ficha[] = [
  { tipo: "frecuencia_at", numeral: "3.3.2", nombre: "Frecuencia de accidentalidad", clase: "resultado", sentido: "menor",
    definicion: "Relación entre el número de accidentes de trabajo y el número de trabajadores en el período.",
    formula: "(N.º de AT / N.º de trabajadores) × 100", interpretacion: "AT por cada 100 trabajadores.",
    fuente: "Registro de AT / investigaciones (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "severidad_at", numeral: "3.3.1", nombre: "Severidad de accidentalidad", clase: "resultado", sentido: "menor",
    definicion: "Días perdidos por AT en relación con el número de trabajadores.",
    formula: "(N.º de días perdidos por AT / N.º de trabajadores) × 100", interpretacion: "Días perdidos por cada 100 trabajadores.",
    fuente: "Incapacidades por AT (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "mortalidad_at", numeral: "3.3.3", nombre: "Mortalidad por AT/EL", clase: "resultado", sentido: "menor",
    definicion: "Proporción de accidentes de trabajo mortales frente al total de AT.",
    formula: "(N.º de AT mortales / N.º total de AT) × 100", interpretacion: "% de AT que fueron mortales.",
    fuente: "Registro de AT (LIPgo)", periodicidad: "Anual", responsable: "Coordinador SST" },
  { tipo: "prevalencia_el", numeral: "3.3.4", nombre: "Prevalencia de enfermedad laboral", clase: "resultado", sentido: "menor",
    definicion: "Número de casos de EL (nuevos y antiguos) en relación con los trabajadores.",
    formula: "(N.º de casos EL / N.º de trabajadores) × 100.000", interpretacion: "Casos de EL por cada 100.000 trabajadores.",
    fuente: "Diagnóstico EL / EPS-ARL", periodicidad: "Anual", responsable: "Coordinador SST" },
  { tipo: "incidencia_el", numeral: "3.3.5", nombre: "Incidencia de enfermedad laboral", clase: "resultado", sentido: "menor",
    definicion: "Número de casos NUEVOS de EL en relación con los trabajadores.",
    formula: "(N.º de casos nuevos EL / N.º de trabajadores) × 100.000", interpretacion: "Casos nuevos de EL por cada 100.000 trabajadores.",
    fuente: "Diagnóstico EL / EPS-ARL", periodicidad: "Anual", responsable: "Coordinador SST" },
  { tipo: "ausentismo", numeral: "3.3.6", nombre: "Ausentismo por causa médica", clase: "resultado", sentido: "menor",
    definicion: "Días de ausencia por causa médica frente a los días de trabajo programados.",
    formula: "(N.º de días de ausencia médica / N.º de días programados) × 100", interpretacion: "% de tiempo perdido por causa médica.",
    fuente: "Control diario / incapacidades (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "investigaciones", nombre: "Cumplimiento de investigación de AT/incidentes", clase: "gestion", sentido: "mayor",
    definicion: "Investigaciones de AT/incidentes realizadas frente a las requeridas.",
    formula: "(Investigaciones realizadas / requeridas) × 100", interpretacion: "% de eventos investigados.",
    fuente: "Investigaciones (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "rotacion_personal", nombre: "Índice de rotación de personal", clase: "gestion", sentido: "menor",
    definicion: "Retiros de personal frente al promedio de empleados.",
    formula: "(Retiros / promedio de empleados) × 100", interpretacion: "% de rotación del personal.",
    fuente: "Head Count / novedades (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
]

export const fichaDe = (t: string) => FICHAS.find((f) => f.tipo === t)

export function enMeta(valor: number | null, meta: number | null, sentido: "menor" | "mayor") {
  if (valor == null || meta == null) return null
  return sentido === "menor" ? valor <= meta : valor >= meta
}
