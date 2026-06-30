/**
 * Convierte un valor (string|number) a numero soportando formato colombiano
 * y angloamericano.
 *
 * Reglas:
 *  - Si recibe `number`, lo retorna tal cual.
 *  - Limpia simbolos de moneda, espacios y letras, dejando solo digitos, "." y ",".
 *  - Si hay ambos "." y ",": el que aparece ultimo es el separador decimal.
 *      "1.234.567,89" -> 1234567.89   (colombiano)
 *      "1,234,567.89" -> 1234567.89   (angloamericano)
 *  - Si solo hay "," -> es decimal colombiano: "1234,56" -> 1234.56
 *  - Si solo hay ".":
 *      * Mas de un "." -> todos son separadores de miles: "1.234.567" -> 1234567
 *      * Un solo "." con exactamente 3 digitos despues -> miles colombiano:
 *        "1.234" -> 1234, "150.000" -> 150000
 *      * Un solo "." con cantidad distinta de 3 digitos -> decimal: "1234.5" -> 1234.5
 */
export function parseColombianNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0

  const raw = String(value).trim()
  if (!raw) return 0

  // Conservar digitos, puntos, comas y signo negativo.
  const cleaned = raw.replace(/[^\d.,-]/g, "")
  if (!cleaned) return 0

  const hasDot = cleaned.includes(".")
  const hasComma = cleaned.includes(",")

  // Caso 1: ambos separadores -> el ultimo es el decimal
  if (hasDot && hasComma) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      // Colombiano: "1.234.567,89"
      return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0
    }
    // Angloamericano: "1,234,567.89"
    return parseFloat(cleaned.replace(/,/g, "")) || 0
  }

  // Caso 2: solo coma -> decimal colombiano
  if (hasComma && !hasDot) {
    // Si hay varias comas, todas son separadores de miles
    const commaCount = (cleaned.match(/,/g) || []).length
    if (commaCount > 1) {
      return parseFloat(cleaned.replace(/,/g, "")) || 0
    }
    return parseFloat(cleaned.replace(",", ".")) || 0
  }

  // Caso 3: solo punto -> ambiguo
  if (hasDot && !hasComma) {
    const dotCount = (cleaned.match(/\./g) || []).length
    if (dotCount > 1) {
      // "1.234.567" -> todos miles
      return parseFloat(cleaned.replace(/\./g, "")) || 0
    }
    const parts = cleaned.split(".")
    // Un solo punto: si despues hay exactamente 3 digitos, heuristica = miles colombianos.
    if (parts[1] && parts[1].length === 3) {
      return parseFloat(cleaned.replace(".", "")) || 0
    }
    return parseFloat(cleaned) || 0
  }

  // Caso 4: ningun separador
  return parseFloat(cleaned) || 0
}
