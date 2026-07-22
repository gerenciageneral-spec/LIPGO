// Mapeo del DESTINO de una línea de cargue (detalleoc.cliente) → CEDI destino donde
// se debe generar automáticamente el DESCARGUE pendiente. El destino de despacho de
// las plantas (Avimol / Indupan) viene en `detalleoc.cliente` (ej. "CEDI MEDELLIN",
// "CEDI FUNZA", "TOSTADITOS SUSANITA SAS"). Ver plan de automatización inter-CEDI.

export interface CediDestino {
  idempresa: number
  transporte?: string // fuerza el transporte del descargue (ej. Susanita → factura a AVIMOL)
  label: string
}

// Clave = destino NORMALIZADO (mayúsculas, sin acentos, espacios colapsados). El match
// es por PREFIJO: la clave debe ser prefijo del cliente normalizado (así "TOSTADITOS
// SUSANITA SAS" cae en "TOSTADITOS SUSANITA").
export const CEDIS_DESTINO: Record<string, CediDestino> = {
  "CEDI FUNZA": { idempresa: 3, label: "Cedi Funza" },
  "CEDI BOGOTA": { idempresa: 3, label: "Cedi Funza (Bogotá)" }, // Funza sirve a Bogotá → mismo id 3
  "CEDI MEDELLIN": { idempresa: 4, label: "Cedi Medellín" },
  "TOSTADITOS SUSANITA": { idempresa: 4, transporte: "SUSANITA", label: "Tostaditos Susanita" },
  // "CEDI BUCARAMANGA": EXCLUIDO a propósito (LIP no opera ese descargue).
}

// Plantas que despachan a los CEDIs (disparan la automatización).
// id1 Harinera Indupan, id2 Avimol, id6 Precocidos (sin cargues hoy, se deja por si acaso).
export const PLANTAS_ORIGEN = new Set([1, 2, 6])

// Normaliza para comparar destinos con variantes de acento/mayúsculas/espacios.
export function normalizaDestino(cliente: string | null | undefined): string {
  return String(cliente ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos (marcas diacríticas combinantes)
    .replace(/\s+/g, " ")
    .trim()
}

// Devuelve el CEDI destino de una línea de cargue, o null si no despacha a un CEDI.
export function cediDeDestino(cliente: string | null | undefined): CediDestino | null {
  const c = normalizaDestino(cliente)
  if (!c) return null
  for (const [clave, cedi] of Object.entries(CEDIS_DESTINO)) {
    if (c.startsWith(clave)) return cedi
  }
  return null
}
