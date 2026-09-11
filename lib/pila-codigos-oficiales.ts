// Diccionario nombre-libre (guardado hoy en `parafiscales_estatico`) -> código
// oficial de 6 caracteres que exige el archivo plano PILA (Anexo Técnico 2,
// Resolución 2388 de 2016). `parafiscales_estatico.administradora_pension/
// salud` guardan el NOMBRE de la administradora (ej. "COLFONDOS"), no el
// código -- este diccionario traduce. `administradora_caja` YA guarda el
// código tal cual (ej. "CCF24") -- no necesita traducción, se usa directo.
//
// Construido cruzando, campo por campo, el archivo real de agosto-2026
// (`Agosto_2026_LIPPROGRESSIVEINTEGRALLOGISTICSSAS_Pila.txt`) contra
// `parafiscales_estatico`, contando TODOS los códigos vistos por nombre (no
// solo el último) para no repetir el error de la primera versión de este
// archivo, que tomó un valor cualquiera por un cruce mal hecho.
//
// AFP: las 4 son consistentes casi siempre -- COLFONDOS y COLPENSIONES 100%
// (13/13, 17/17), PORVENIR 96% (66/69), PROTECCION 86% (19/22, 3 casos con
// 230301 en vez de 230201). Se usa el código MAYORITARIO.
//
// EPS -- HALLAZGO IMPORTANTE, NO resuelto del todo: "SALUD TOTAL" (el nombre
// que hoy guarda `parafiscales_estatico` para 62 de los 68 trabajadores
// cruzados) en la práctica corresponde a CINCO códigos reales distintos
// (EPS002 46x, EPS037 7x, CCFC55 4x, ESSC07 4x, ESSC24 1x) -- el nombre
// genérico "SALUD TOTAL" NO alcanza para saber el código real de cada
// persona; son variantes regionales/de movilidad de la misma EPS con código
// de operador distinto. Se usa aquí el código MAYORITARIO (EPS002, 74% de
// los casos) como mejor valor por defecto, pero **hasta un 26% de quienes
// tengan "SALUD TOTAL" en su ficha pueden salir con el código EPS
// incorrecto** -- para cerrar esto de verdad, `parafiscales_estatico`
// necesitaría guardar el código real por persona (o un nombre más específico
// que si distinga la variante), no solo "SALUD TOTAL" genérico. Las otras 6
// EPS sí fueron 100% consistentes.
export const CODIGOS_AFP: Record<string, string> = {
  COLFONDOS: "231001",
  PORVENIR: "230301",
  PROTECCION: "230201",
  COLPENSIONES: "25-14",
}

export const CODIGOS_EPS: Record<string, string> = {
  "SALUD TOTAL": "EPS002", // mayoritario -- ver nota arriba, no 100% confiable
  "COOSALUD MOVILIDAD": "ESSC24",
  FAMISANAR: "EPS017",
  "NUEVA EPS MOVILIDAD": "EPS037",
  "MUTUAL SER": "ESSC07",
  "EPS SURA (ANTES SUSALUD)": "EPS010",
  "NUEVA E.P.S.": "EPS037",
  SANITAS: "EPS005",
  "SAVIA SALUD": "EPS040",
  COMPENSAR: "EPS008",
}

// Código DIVIPOLA (departamento-municipio) de la "ubicación laboral" del
// cotizante. HALLAZGO IMPORTANTE (verificado contra las 138 filas reales de
// agosto): este campo NO refleja la ciudad real del trabajador -- personas
// de Barranquilla, Medellín, Cúcuta y Valledupar aparecen TODAS con el mismo
// código "20-001" (Cesar/Valledupar), y no correlaciona limpio ni por
// proyecto ni por idempresa (ver commit de este cambio). Es, aparentemente,
// un valor por defecto que ya venía usando quien preparaba la planilla antes
// de LIPgo. Para que el archivo nuevo se comporte igual que el histórico que
// SÍ se aceptó, se replica el mismo patrón mayoritario: "11-001" (Bogotá)
// solo si la ciudad guardada es literalmente "BOGOTA", "20-001" en cualquier
// otro caso. Esto reproduce ~85% de los casos reales exactos; el resto
// (excepciones ya minoritarias en el propio histórico) requieren
// confirmación del usuario antes de la primera radicación real con este
// generador -- NO se debe asumir que es 100% correcto sin que alguien de
// Compensación lo revise contra la próxima planilla.
export function codigoDivipola(ciudad: string | null | undefined): string {
  return String(ciudad || "").trim().toUpperCase() === "BOGOTA" ? "11-001" : "20-001"
}

const CODIGOS_AFP_VALIDOS = new Set(Object.values(CODIGOS_AFP))
// "CCFC55" es el 4o código real visto para "SALUD TOTAL" en el archivo de
// agosto-2026 (ver nota arriba: EPS002 46x, EPS037 7x, CCFC55 4x, ESSC07 4x,
// ESSC24 1x) -- no tiene un nombre propio claro en el diccionario, pero es
// un código real confirmado (ROBERTO ENRIQUE HOYOS VIDEZ), no un error.
const CODIGOS_EPS_VALIDOS = new Set([...Object.values(CODIGOS_EPS), "CCFC55"])

// Acepta tanto el NOMBRE libre (lo que guarda Head Count al elegir del
// desplegable) como el CÓDIGO oficial ya resuelto (lo que trae, por
// persona, el archivo plano real ya radicado -- más confiable que el
// nombre porque no sufre la ambigüedad de "SALUD TOTAL" documentada
// arriba). Backfill 2026-09-11: se importaron los códigos reales de
// agosto-2026 directo al campo, sin pasar por el diccionario de nombres.
export function codigoAfp(valor: string | null | undefined): string | null {
  const v = String(valor || "").trim()
  if (!v) return null
  if (CODIGOS_AFP_VALIDOS.has(v)) return v
  return CODIGOS_AFP[v] ?? null
}

export function codigoEps(valor: string | null | undefined): string | null {
  const v = String(valor || "").trim()
  if (!v) return null
  if (CODIGOS_EPS_VALIDOS.has(v)) return v
  return CODIGOS_EPS[v] ?? null
}

// "Código de la ARL" (posición 507-512 del registro tipo 02, y también el
// campo 14 del registro tipo 01). HALLAZGO: en las 138 filas reales de
// agosto-2026 aparece SIEMPRE, sin una sola excepción, el valor literal
// "14-28" -- no es un código de ARL reconocible (ARL SURA tiene su propio
// código oficial distinto), así que probablemente esta posición la usa el
// operador (Aportes en Línea) para otra cosa (posible marcador de período
// quincenal "14 al 28"), no para el código de administradora que dice la
// especificación oficial. Se replica el valor EXACTO visto en producción
// (más seguro que inventar el código real de ARL SURA, que no se pudo
// confirmar) -- si un futuro archivo real muestra algo distinto, actualizar
// aquí.
export const CODIGO_ARL_OBSERVADO = "14-28"
