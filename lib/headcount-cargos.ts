// CARGOS VÁLIDOS DE HEAD COUNT — única fuente de verdad.
//
// El cargo de Head Count se elige de esta lista y NADA MÁS lo puede cambiar.
// Antes lo pisaban dos flujos:
//
//   · `lib/rrhh-actions.ts` (Gestión de Colaboradores › TH) lo sobrescribía en
//     CADA sincronización con el cargo del catálogo de TH, que es otro y mucho
//     más largo ("COORDINADOR SST", "COORDINADORA SST", …). Bastaba con que
//     alguien guardara al colaborador para perder el cargo elegido aquí.
//   · `lib/examenes-medicos-actions.ts` lo sembraba desde `cargo_aspirado` de la
//     hoja de vida al vincular a alguien nuevo — texto libre del aspirante.
//
// Ahora ninguno de los dos escribe un cargo que no esté en esta lista, y
// NINGUNO pisa uno ya existente. Ver `esCargoValido`.
//
// Archivo NORMAL (no "use server"): lo importan el componente de Head Count
// (cliente) y los dos server actions, para que los tres apliquen la misma regla.

export const CARGOS_HEADCOUNT = ["AUXILIAR LOGÍSTICO", "COORDINADOR", "MONTACARGUISTA"] as const

export type CargoHeadcount = (typeof CARGOS_HEADCOUNT)[number]

/**
 * ¿El texto corresponde a uno de los cargos válidos?
 *
 * Compara normalizando mayúsculas, espacios y TILDES: "auxiliar logistico" sin
 * tilde —como suele venir de otros módulos— es el mismo cargo que
 * "AUXILIAR LOGÍSTICO". Devuelve el valor CANÓNICO de la lista, o null si no
 * corresponde a ninguno.
 */
export function cargoCanonico(valor: unknown): CargoHeadcount | null {
  const limpio = String(valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase()
  if (!limpio) return null
  for (const c of CARGOS_HEADCOUNT) {
    const canon = c
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase()
    if (canon === limpio) return c
  }
  return null
}

/** Atajo booleano de `cargoCanonico`. */
export function esCargoValido(valor: unknown): boolean {
  return cargoCanonico(valor) !== null
}
