// =====================================================================
// SLA acordados con el cliente — fuente AUTORITATIVA para medir el servicio
// de LIP como operador de outsourcing.
// Fuente: "Acuerdos de Servicio Indupan - LiP" y "Acuerdos de Servicio
// La Insuperable (Avimol) - LiP", Mayo 2026. Los tiempos de cargue por tipo
// de vehículo aplican a los 4 sitios (Indupan, Avimol, Cedi Funza, Cedi Medellín).
// Editable aquí (no es dato operativo; es el compromiso contractual).
// =====================================================================

// Tiempo MÁXIMO efectivo de cargue acordado, en minutos, por tipo de vehículo
// y tipo de producto (PT = producto terminado, SUB = subproducto).
export const SLA_TIEMPO_CARGUE_MIN: Record<string, { PT: number | null; SUB: number | null }> = {
  Turbo: { PT: 30, SUB: null },
  Sencillo: { PT: 45, SUB: 50 },
  Dobletroque: { PT: 70, SUB: 100 },
  Tractomula: { PT: 120, SUB: 150 },
  Mula: { PT: 120, SUB: 150 }, // alias de Tractomula (citasvehiculos usa "Mula")
  Camioneta: { PT: 30, SUB: null }, // asimilada a Turbo (menor capacidad)
}

// Tiempo SLA aplicable a un vehículo/producto. Si no se conoce el producto,
// usa PT (estándar de referencia del acuerdo).
export function getSlaCargueMin(tipovehiculo?: string | null, producto: "PT" | "SUB" = "PT"): number | null {
  if (!tipovehiculo) return null
  const v = SLA_TIEMPO_CARGUE_MIN[tipovehiculo]
  if (!v) return null
  return v[producto] ?? v.PT ?? null
}

// Planta de personal ACORDADA por proyecto (headcount esperado). Fuente:
// directriz de Gerencia (2026-06-28), validable en Programación de Turnos.
// El nº de auxiliares sube en días de mayor volumen; esta es la base general.
export const PLANTA_ACORDADA: Record<number, { total: number; auxiliares: number; montacarguistas: number; coordinadores: number; detalle: string }> = {
  1: { total: 19, auxiliares: 17, montacarguistas: 0, coordinadores: 2, detalle: "17 auxiliares + 1 coord. operaciones + 1 coord. SST (compartido con Cedi Funza)" }, // Indupan
  2: { total: 23, auxiliares: 20, montacarguistas: 2, coordinadores: 1, detalle: "20 auxiliares + 2 operarios montacargas + 1 coord. operaciones" }, // Avimol
  3: { total: 7, auxiliares: 5, montacarguistas: 1, coordinadores: 1, detalle: "5 auxiliares + 1 operario montacargas + 1 coord. operaciones" }, // Cedi Funza
  4: { total: 7, auxiliares: 7, montacarguistas: 0, coordinadores: 0, detalle: "7 auxiliares (uno de ellos líder)" }, // Cedi Medellín
}

// Volúmenes objetivo mensuales acordados (toneladas). Fuente: SLA.
export const VOLUMEN_OBJETIVO_MES: Record<number, { pt: number; sub: number }> = {
  1: { pt: 3500, sub: 1000 }, // Indupan
  2: { pt: 4000, sub: 1200 }, // Avimol
}
