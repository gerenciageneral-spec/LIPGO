// Catálogos compartidos por el módulo MEDEVAC (SST-FOR-33), el Perfil
// Sociodemográfico (SST-FOR-32) y el portal del trabajador.
//
// Viven aquí, y no dentro de cada componente, porque los dos lados escriben en
// la MISMA tabla: si el portal ofreciera "Salud total" y SST "Salud Total",
// el directorio quedaría con dos EPS que en realidad son una, y el conteo por
// EPS del informe sería falso.
//
// Los valores de EPS, ARL, centro de trabajo, parentesco y cargo salen del
// formulario real de LIP (67 respuestas cargadas en agosto de 2026). No son
// listas cerradas: el módulo de SST permite escribir uno nuevo.

export type Opcion = [string, string]

export const RH_OPCIONES: Opcion[] = [
  ["O+", "O+"], ["O-", "O-"], ["A+", "A+"], ["A-", "A-"],
  ["B+", "B+"], ["B-", "B-"], ["AB+", "AB+"], ["AB-", "AB-"],
]

// "Permiso por protección temporal" (PPT) faltaba y sí se usa: dos personas de
// la plantilla se identifican con él.
export const DOCUMENTO_TIPOS: Opcion[] = [
  ["Cedula de ciudadanía", "Cédula de ciudadanía"],
  ["Cedula de extranjería", "Cédula de extranjería"],
  ["Permiso por protección temporal", "Permiso por protección temporal (PPT)"],
  ["Pasaporte", "Pasaporte"],
  ["PEP", "Permiso especial de permanencia (PEP)"],
]

export const MESES: Opcion[] = [
  ["Enero", "Enero"], ["Febrero", "Febrero"], ["Marzo", "Marzo"], ["Abril", "Abril"],
  ["Mayo", "Mayo"], ["Junio", "Junio"], ["Julio", "Julio"], ["Agosto", "Agosto"],
  ["Septiembre", "Septiembre"], ["Octubre", "Octubre"], ["Noviembre", "Noviembre"], ["Diciembre", "Diciembre"],
]

export const CENTROS_TRABAJO: string[] = [
  "ADMINISTRATIVO", "AVIMOL", "CEDI FUNZA", "CEDI MEDELLIN", "HARINERA INDUPAN", "POSTOBON CUCUTA",
]

export const EPS_OPCIONES: string[] = [
  "Compensar", "Coosalud", "Coolsanitas", "Famisanar", "Mutualser",
  "Nueva eps S.A.", "Salud Total", "Sanitas", "Sura eps",
]

export const ARL_OPCIONES: string[] = ["Sura", "Positiva", "Colmena", "Bolívar", "Colpatria", "Equidad"]

export const PARENTESCO_OPCIONES: string[] = [
  "Madre", "Padre", "Esposa", "Esposo", "Hermana", "Hermano",
  "Hija", "Hijo", "Prima", "Primo", "Tia", "Tio", "Cuñado", "Cuñada", "Amigo", "Otro",
]

// ---------------------------------------------------------------------------
// Perfil Sociodemográfico (SST-FOR-32)
// ---------------------------------------------------------------------------

export const SEXO_OPCIONES: Opcion[] = [
  ["Masculino", "Masculino"], ["Femenino", "Femenino"], ["Prefiero no responder", "Prefiero no responder"],
]

export const ESCOLARIDAD_OPCIONES: Opcion[] = [
  ["Primaria", "Primaria"],
  ["Bachillerato incompleto", "Bachillerato incompleto"],
  ["Bachillerato completo", "Bachillerato completo"],
  ["Técnico", "Técnico"],
  ["Tecnólogo", "Tecnólogo"],
  ["Universitario", "Universitario"],
  ["Posgrado", "Posgrado"],
  ["Ninguno", "Ninguno"],
]

export const ESTADO_CIVIL_OPCIONES: Opcion[] = [
  ["Soltero(a)", "Soltero(a)"], ["Casado(a)", "Casado(a)"], ["Unión libre", "Unión libre"],
  ["Separado(a)", "Separado(a)"], ["Divorciado(a)", "Divorciado(a)"], ["Viudo(a)", "Viudo(a)"],
]

export const SI_NO: Opcion[] = [["Sí", "Sí"], ["No", "No"]]

export const TIPO_VIVIENDA_OPCIONES: Opcion[] = [
  ["Propia", "Propia"], ["Arrendada", "Arrendada"], ["Familiar", "Familiar"], ["Compartida", "Compartida"],
]

export const CARACTERISTICAS_VIVIENDA_OPCIONES: Opcion[] = [
  ["Casa", "Casa"], ["Apartamento", "Apartamento"], ["Habitación", "Habitación"], ["Finca", "Finca"],
]

export const ZONA_OPCIONES: Opcion[] = [["Urbana", "Urbana"], ["Rural", "Rural"]]

export const ESTRATO_OPCIONES: Opcion[] = [
  ["1", "Estrato 1"], ["2", "Estrato 2"], ["3", "Estrato 3"],
  ["4", "Estrato 4"], ["5", "Estrato 5"], ["6", "Estrato 6"],
]

export const TRANSPORTE_OPCIONES: Opcion[] = [
  ["A pie", "A pie"], ["Bicicleta", "Bicicleta"], ["Moto", "Moto"],
  ["Transporte público", "Transporte público"], ["Vehículo propio", "Vehículo propio"],
  ["Transporte de la empresa", "Transporte de la empresa"],
]

// En salarios mínimos, que es como lo pide el análisis sociodemográfico.
export const INGRESOS_OPCIONES: Opcion[] = [
  ["1 SMLV", "1 salario mínimo"],
  ["Entre 1 y 2 SMLV", "Entre 1 y 2 salarios mínimos"],
  ["Entre 2 y 3 SMLV", "Entre 2 y 3 salarios mínimos"],
  ["Más de 3 SMLV", "Más de 3 salarios mínimos"],
]

export const GRUPO_ETNICO_OPCIONES: Opcion[] = [
  ["Ninguno", "Ninguno"], ["Afrodescendiente", "Afrodescendiente"], ["Indígena", "Indígena"],
  ["Raizal", "Raizal"], ["Palenquero", "Palenquero"], ["Rom (gitano)", "Rom (gitano)"],
]

export const ACTIVIDAD_FISICA_OPCIONES: Opcion[] = [
  ["No practica", "No practica"],
  ["1 a 2 veces por semana", "1 a 2 veces por semana"],
  ["3 a 4 veces por semana", "3 a 4 veces por semana"],
  ["5 o más veces por semana", "5 o más veces por semana"],
]

export const FRECUENCIA_CONSUMO_OPCIONES: Opcion[] = [
  ["No consume", "No consume"], ["Ocasionalmente", "Ocasionalmente"],
  ["Fin de semana", "Fin de semana"], ["Diariamente", "Diariamente"],
]

export const AFP_OPCIONES: string[] = [
  "Porvenir", "Protección", "Colfondos", "Skandia", "Colpensiones",
]

export const TURNO_OPCIONES: Opcion[] = [
  ["Turno 1", "Turno 1"], ["Turno 2", "Turno 2"], ["Turno 3", "Turno 3"],
  ["Administrativo", "Administrativo"], ["Mixto", "Mixto"],
]

/** Convierte una lista de textos en pares [valor, etiqueta] para los `Select`. */
export const comoOpciones = (xs: string[]): Opcion[] => xs.map((x) => [x, x])

/**
 * Edad en anos cumplidos a partir de una fecha `YYYY-MM-DD`.
 *
 * Vive aqui, y no dentro de cada accion, porque el portal del trabajador y el
 * modulo de SST escriben en la MISMA columna `edad`: si cada uno la calculara
 * a su manera, la misma persona tendria una edad distinta segun quien guardo
 * de ultimo.
 *
 * Compara por texto contra la fecha de hoy en Colombia. NO usa
 * `new Date("YYYY-MM-DD")`: ese constructor interpreta la cadena como UTC y en
 * Colombia (UTC-5) devuelve el dia anterior, con lo que quien cumple anos hoy
 * quedaria con un ano menos.
 */
export function edadDesdeFechaISO(fechaISO: string | null | undefined, hoyISO?: string): number | null {
  const f = String(fechaISO ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null
  const hoy = hoyISO ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
  const [ay, am, ad] = f.split("-").map(Number)
  const [hy, hm, hd] = hoy.split("-").map(Number)
  let edad = hy - ay
  if (hm < am || (hm === am && hd < ad)) edad--
  return edad >= 0 && edad < 120 ? edad : null
}
