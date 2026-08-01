// CRUCE DE UN MONTACARGA CON SUS INSPECCIONES PREOPERACIONALES.
//
// `inspecciones_montacargas` identifica el equipo con `placa` y
// `referencia_montacargas` en TEXTO LIBRE, y el histórico está sucio. Medido
// sobre las últimas 1000 inspecciones (540 filas reales): **64 combinaciones
// distintas para ~10 equipos**. Ejemplos verificados:
//
//   · C814NO218OE · C814N218OE · C814NO2180E · C814N02180E  → el MISMO equipo
//   · Yale · yale · YALE                                     → mayúsculas
//   · placa="#1" ref="Yale" · placa="jn" ref="yale"          → placa inventada
//
// Es la misma enfermedad de `solicitudesturnos.puesto` y se trata igual (ver
// lib/puestos-turno-alias.ts):
//
//   1) COINCIDENCIA NORMALIZADA — sin tildes, sin espacios ni signos, en
//      mayúsculas. Cubre "Yale"/"yale"/"YALE" y "Yale 12"/"YALE12".
//   2) ALIAS DECLARADO — uno por uno, solo para variantes que son
//      inequívocamente el mismo equipo (erratas de una letra o un dígito).
//
// Lo que no resuelve ninguno de los dos NO se atribuye a ningún equipo: se
// reporta con su texto literal. Atribuir una inspección al montacarga
// equivocado ensucia su hoja de vida sin que nadie lo note, y una hoja de vida
// con datos ajenos es peor que una incompleta.
//
// LA SOLUCIÓN DE FONDO no es esta tabla: es que
// components/registro-preoperacional.tsx deje de capturar la placa como texto
// libre y use un desplegable contra el maestro. Mientras eso no pase, esto
// evita que el histórico se pierda.

/** Normaliza para comparar: sin tildes, sin separadores, en mayúsculas. */
export function normalizarEquipo(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s._\-#/]/g, "")
    .trim()
    .toUpperCase()
}

/**
 * Variantes históricas → identificación canónica del equipo en `sst_equipos`.
 * La clave va NORMALIZADA. Es una tabla y no un algoritmo a propósito: así se
 * puede auditar quién decidió que dos textos son el mismo montacarga.
 *
 * Las de abajo salieron de contar el histórico real; se agregan más a medida
 * que aparezcan, una línea cada una.
 */
export const ALIAS_EQUIPO: Record<string, string> = {
  // Cedi Funza (id 3) — cuatro formas de escribir la misma serie, con el
  // clásico baile entre la letra O y el cero.
  C814N218OE: "C814NO218OE",
  C814NO2180E: "C814NO218OE",
  C814N02180E: "C814NO218OE",
  C814N0218OE: "C814NO218OE",
}

export interface EquipoResuelto {
  /** Identificación canónica, o null si no se pudo resolver. */
  identificacion: string | null
  via: "exacto" | "alias" | null
}

/**
 * Resuelve el texto de una inspección contra las identificaciones del maestro.
 * `identificaciones` son los valores de `sst_equipos.identificacion` del
 * proyecto. Se prueba primero la placa y luego la referencia, porque en el
 * histórico a veces la buena es una y a veces la otra.
 */
export function resolverEquipo(
  placa: unknown,
  referencia: unknown,
  identificaciones: string[],
): EquipoResuelto {
  for (const texto of [placa, referencia]) {
    const n = normalizarEquipo(texto)
    if (!n) continue

    for (const id of identificaciones) {
      if (normalizarEquipo(id) === n) return { identificacion: id, via: "exacto" }
    }

    const alias = ALIAS_EQUIPO[n]
    if (alias) {
      const enMaestro = identificaciones.find((id) => normalizarEquipo(id) === normalizarEquipo(alias))
      if (enMaestro) return { identificacion: enMaestro, via: "alias" }
    }
  }
  return { identificacion: null, via: null }
}
