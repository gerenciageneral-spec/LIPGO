// Utilidades puras de exámenes médicos (sin "use server": se pueden importar
// tanto en server actions como en rutas y componentes).

// Normaliza el texto libre de un resultado a la bandera de aptitud.
// "apto" (sin "no") = true · "no apto"/"rechazado"/"aplazado"/"no pasa" = false · resto = pendiente(null).
export function normalizarAptitud(resultado?: string | null): boolean | null {
  const s = String(resultado || "").toLowerCase().trim()
  if (!s) return null
  if (/(no[ _]?apto|rechaz|aplaz|no[ _]?pas)/.test(s)) return false
  if (/apto/.test(s)) return true
  return null
}
