// RESOLUCIÓN DE PUESTOS DE LAS SOLICITUDES DE TURNO.
//
// `solicitudesturnos.puesto` se guardó durante meses como TEXTO LIBRE (el
// desplegable estricto es reciente), así que el mismo puesto aparece escrito de
// muchas formas: "OPERADOR COSEDOR", "Operador cosedor", "Csedor", "Operador
// vosedor". El maestro de tarifas (`tarifasfacturacionturnos`) sí tiene nombres
// canónicos, y para cobrar un turno hay que casar uno con otro.
//
// REGLA DE ORO: nunca adivinar. Se resuelve en dos pasos y nada más:
//
//   1) COINCIDENCIA EXACTA tras normalizar (mayúsculas, tildes, espacios). Cubre
//      "Pacas"/"PACAS", "Arrume negro"/"Arrume Negro", "Operario Salvado".
//   2) ALIAS DECLARADO abajo, uno por uno, solo para variantes que son
//      inequívocamente el mismo puesto (plural, prefijo "OPERADOR", erratas
//      evidentes de una sola letra).
//
// Lo que no resuelve ninguno de los dos NO se cobra: se reporta con su texto
// literal para que alguien lo decida. Un cobro inventado es peor que un cobro
// faltante, porque el faltante se ve y el inventado no.
//
// AMBIGÜEDADES CONOCIDAS que deliberadamente NO se mapean:
//   · Todo lo que dice "SALVADO" sin ser exactamente "Operario Salvado".
//     El maestro tiene DOS puestos distintos: "Operario Salvado"
//     (cobraturno = SI, $136.131) y "Salvado" (cobraturno = NO, porque ese se
//     cobra por producción de tolva). "OPERADOR SALVADO" puede ser cualquiera
//     de los dos y la diferencia es todo el dinero de la línea.
//   · "OPERADORES PARA SUBIR BULTOS", "OPERADOR YALISTA", "Operadores
//     auxiliares": no corresponden a ningún puesto del maestro.

/** Normaliza para comparar: sin tildes, sin dobles espacios, en mayúsculas. */
export function normalizarPuesto(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

/**
 * Variantes históricas → puesto del maestro. La clave va NORMALIZADA.
 * Para agregar una, basta una línea; para quitarla, borrarla. Es a propósito
 * una tabla y no un algoritmo: así se puede auditar quién decidió cada cobro.
 */
export const ALIAS_PUESTO: Record<string, string> = {
  // Cosedor
  "OPERADOR COSEDOR": "Cosedor",
  "OPERADORES COSEDOR": "Cosedor",
  "OPERADOR DE COSEDOR": "Cosedor",
  CSEDOR: "Cosedor", // errata de una letra
  "OPERADOR VOSEDOR": "Cosedor", // errata de una letra (v/c)

  // Pacas
  "OPERADOR PACAS": "Pacas",
  "OPERADORES PACAS": "Pacas",
  "OPERARIO PACAS": "Pacas",
  "OPERARIOS PACAS": "Pacas",
  "OPERADOR DE PACAS": "Pacas",
  "OPERADOR PACAS DOS": "Pacas",

  // Arrume Negro
  "OPERADOR ARRUME NEGRO": "Arrume Negro",
  "OPERADORES ARRUME NEGRO": "Arrume Negro",
  "ARRUME NEGRO 5 OPERADORES": "Arrume Negro",
  "ARRUME NEGRO-FALTA DE ESPACIO": "Arrume Negro",
  "ARRUME NEGRO - FALTA DE ESPACIO": "Arrume Negro",

  // Operador PT (Carrusel)
  "OPERADOR CARRUSEL": "Operador PT (Carrusel)",
  "OPERADOR DE CARRUSEL": "Operador PT (Carrusel)",
  CARRUSEL: "Operador PT (Carrusel)",
}

export interface PuestoResuelto {
  /** Nombre canónico del maestro, o null si no se pudo resolver. */
  puesto: string | null
  /** Cómo se resolvió. Se muestra para poder auditar el cobro. */
  via: "exacto" | "alias" | null
}

/**
 * Resuelve el texto de una solicitud contra los puestos del maestro.
 * `catalogo` son los nombres tal como están en `tarifasfacturacionturnos`.
 */
export function resolverPuesto(texto: unknown, catalogo: string[]): PuestoResuelto {
  const n = normalizarPuesto(texto)
  if (!n) return { puesto: null, via: null }

  for (const c of catalogo) {
    if (normalizarPuesto(c) === n) return { puesto: c, via: "exacto" }
  }

  const alias = ALIAS_PUESTO[n]
  if (alias) {
    // El alias apunta a un nombre canónico; se devuelve el del catálogo real
    // para no depender de cómo esté escrito aquí.
    const enCatalogo = catalogo.find((c) => normalizarPuesto(c) === normalizarPuesto(alias))
    if (enCatalogo) return { puesto: enCatalogo, via: "alias" }
  }

  return { puesto: null, via: null }
}
