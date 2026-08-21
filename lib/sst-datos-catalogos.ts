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

/**
 * Proyecto (idempresa) -> centro de trabajo. Se usa como RESPALDO: el centro
 * real de una persona vive en su ficha MEDEVAC, pero quien todavia no tiene
 * ficha no tiene centro en ninguna parte, y en el informe de cobertura es
 * justo a esa persona a la que hay que ubicar para ir a buscarla.
 */
export const CENTRO_POR_EMPRESA: Record<number, string> = {
  1: "HARINERA INDUPAN", 2: "AVIMOL", 3: "CEDI FUNZA", 4: "CEDI MEDELLIN", 100: "ADMINISTRATIVO",
}

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
//
// Estos valores NO son inventados: son exactamente el vocabulario del
// formulario que LIP ya venía diligenciando (29 respuestas cargadas). Importa
// que coincidan letra por letra: el censo se lee agrupando por estos campos, y
// "Secundaria Completa" y "Bachillerato completo" contarían como dos niveles
// de escolaridad distintos aunque sean el mismo.
// ---------------------------------------------------------------------------

export const SEXO_OPCIONES: Opcion[] = [
  ["Masculino", "Masculino"], ["Femenino", "Femenino"],
]

export const ESCOLARIDAD_OPCIONES: Opcion[] = [
  ["Ninguno", "Ninguno"],
  ["Primaria Incompleta", "Primaria incompleta"],
  ["Primaria Completa", "Primaria completa"],
  ["Secundaria Incompleta", "Secundaria incompleta"],
  ["Secundaria Completa", "Secundaria completa"],
  ["Técnico", "Técnico"],
  ["Tecnólogo", "Tecnólogo"],
  ["Profesional", "Profesional"],
  ["Postgrado", "Postgrado"],
]

export const ESTADO_CIVIL_OPCIONES: Opcion[] = [
  ["Soltero", "Soltero(a)"], ["Casado", "Casado(a)"], ["Unión libre", "Unión libre"],
  ["Separado", "Separado(a)"], ["Divorciado", "Divorciado(a)"], ["Viudo", "Viudo(a)"],
]

// El formulario responde SI/NO en mayúscula. Se conserva tal cual para que lo
// que capture el portal agrupe junto con lo que ya está cargado.
export const SI_NO: Opcion[] = [["SI", "Sí"], ["NO", "No"]]

// OJO: "tipo" es la clase de inmueble y "características" es la tenencia. Es al
// revés de lo que sugiere el nombre, pero es como está el formulario y como
// están los datos ya cargados.
export const TIPO_VIVIENDA_OPCIONES: Opcion[] = [
  ["Casa", "Casa"], ["Apartamento", "Apartamento"], ["Habitación", "Habitación"], ["Finca", "Finca"],
]

export const CARACTERISTICAS_VIVIENDA_OPCIONES: Opcion[] = [
  ["Propia", "Propia"], ["Arrendada", "Arrendada"], ["Familiar", "Familiar"], ["Compartida", "Compartida"],
]

export const ZONA_OPCIONES: Opcion[] = [
  ["Urbana", "Urbana"], ["Suburbana", "Suburbana"], ["Rural", "Rural"],
]

export const ESTRATO_OPCIONES: Opcion[] = [
  ["1", "Estrato 1"], ["2", "Estrato 2"], ["3", "Estrato 3"],
  ["4", "Estrato 4"], ["5", "Estrato 5"], ["6", "Estrato 6"],
]

export const TRANSPORTE_OPCIONES: Opcion[] = [
  ["Caminando", "Caminando"],
  ["Bicicleta", "Bicicleta"],
  ["Moto", "Moto"],
  ["Transporte público", "Transporte público"],
  ["Vehículo particular", "Vehículo particular"],
  ["Transporte de la empresa", "Transporte de la empresa"],
]

export const INGRESOS_OPCIONES: Opcion[] = [
  ["Menos de 1 Salario Mínimo", "Menos de 1 salario mínimo"],
  ["1 Salario Mínimo", "1 salario mínimo"],
  ["Entre 1 Y 2 Salarios Mínimos", "Entre 1 y 2 salarios mínimos"],
  ["Más de 2 Salarios", "Más de 2 salarios mínimos"],
]

export const GRUPO_ETNICO_OPCIONES: Opcion[] = [
  ["Sin Pertenencia Etnica", "Sin pertenencia étnica"],
  ["Afrodescendiente", "Afrodescendiente"],
  ["Indígena", "Indígena"],
  ["Raizal", "Raizal"],
  ["Palenquero", "Palenquero"],
  ["Rom (gitano)", "Rom (gitano)"],
]

// El formulario pregunta "¿practica actividad física al menos 3 veces por
// semana, 30 minutos mínimo?": es una sola respuesta SI/NO, no una frecuencia.
// Lo mismo con alcohol y tabaco.
export const ACTIVIDAD_FISICA_OPCIONES: Opcion[] = SI_NO
export const FRECUENCIA_CONSUMO_OPCIONES: Opcion[] = SI_NO

export const AFP_OPCIONES: string[] = [
  "PORVENIR", "PROTECCIÓN", "COLFONDOS", "COLPENSIONES", "SKANDIA",
]

export const TURNO_OPCIONES: Opcion[] = [
  ["Diurno", "Diurno"], ["Nocturno", "Nocturno"], ["Mixto", "Mixto"], ["Administrativo", "Administrativo"],
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
