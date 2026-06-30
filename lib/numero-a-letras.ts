/**
 * Convierte un numero entero positivo a texto en espanol.
 *
 * Soporta hasta 999.999.999.999 y agrega el sufijo " PESOS M/CTE" cuando se
 * llama desde `numeroALetrasPesos`. La salida esta normalizada en MAYUSCULAS
 * para que encaje en certificados laborales formales.
 *
 * Implementacion clasica por bloques de 3 digitos (unidades, miles, millones,
 * miles de millones) sin dependencias externas.
 */

const UNIDADES = [
  "",
  "UNO",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
]

const ESPECIALES_10_19 = [
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISEIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
]

const DECENAS = [
  "",
  "DIEZ", // no se usa directamente (se atrapa en 10-19)
  "VEINTI", // 21-29 se concatenan: VEINTIUNO, VEINTIDOS...
  "TREINTA",
  "CUARENTA",
  "CINCUENTA",
  "SESENTA",
  "SETENTA",
  "OCHENTA",
  "NOVENTA",
]

const CENTENAS = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
]

function unidadesATexto(n: number): string {
  if (n < 0 || n > 9) return ""
  return UNIDADES[n] || ""
}

function decenasATexto(n: number): string {
  // n esperado entre 0 y 99
  if (n < 10) return unidadesATexto(n)
  if (n < 20) return ESPECIALES_10_19[n - 10]
  const dec = Math.floor(n / 10)
  const uni = n % 10
  if (n === 20) return "VEINTE"
  if (dec === 2) return `${DECENAS[2]}${UNIDADES[uni].toLowerCase()}`.toUpperCase()
  if (uni === 0) return DECENAS[dec]
  return `${DECENAS[dec]} Y ${UNIDADES[uni]}`
}

function centenasATexto(n: number): string {
  // n esperado entre 0 y 999
  if (n === 0) return ""
  if (n === 100) return "CIEN"
  const cen = Math.floor(n / 100)
  const resto = n % 100
  const cenTxt = CENTENAS[cen]
  const restoTxt = decenasATexto(resto)
  if (cenTxt && restoTxt) return `${cenTxt} ${restoTxt}`
  return cenTxt || restoTxt
}

/**
 * Convierte un entero positivo a texto en espanol, sin moneda ni sufijos.
 * Ejemplo: 1750905 -> "UN MILLON SETECIENTOS CINCUENTA MIL NOVECIENTOS CINCO"
 */
export function numeroALetras(numero: number): string {
  const n = Math.floor(Math.abs(Number(numero) || 0))
  if (n === 0) return "CERO"

  // Bloques de 3 digitos: miles de millones, millones, miles, unidades
  const milMillones = Math.floor(n / 1_000_000_000)
  const millones = Math.floor((n % 1_000_000_000) / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1_000)
  const unidades = n % 1000

  const partes: string[] = []

  if (milMillones > 0) {
    if (milMillones === 1) {
      partes.push("MIL MILLONES")
    } else {
      partes.push(`${centenasATexto(milMillones)} MIL MILLONES`)
    }
  }

  if (millones > 0) {
    if (millones === 1) {
      partes.push("UN MILLON")
    } else {
      partes.push(`${centenasATexto(millones)} MILLONES`)
    }
  }

  if (miles > 0) {
    if (miles === 1) {
      partes.push("MIL")
    } else {
      partes.push(`${centenasATexto(miles)} MIL`)
    }
  }

  if (unidades > 0) {
    partes.push(centenasATexto(unidades))
  }

  return partes.join(" ").replace(/\s+/g, " ").trim()
}

/**
 * Convierte un numero a texto en espanol con el sufijo " PESOS M/CTE", como se
 * usa habitualmente en certificados laborales colombianos.
 * Ejemplo: 1750905 -> "UN MILLON SETECIENTOS CINCUENTA MIL NOVECIENTOS CINCO PESOS M/CTE"
 */
export function numeroALetrasPesos(numero: number): string {
  return `${numeroALetras(numero)} PESOS M/CTE`
}

/**
 * Formatea un numero como moneda colombiana sin decimales y con signo $.
 * Ejemplo: 1750905 -> "$ 1.750.905"
 */
export function formatearPesos(numero: number): string {
  const n = Math.floor(Math.abs(Number(numero) || 0))
  return `$ ${n.toLocaleString("es-CO")}`
}
