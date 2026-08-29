// =====================================================================
// SLA acordados con el cliente — fuente AUTORITATIVA para medir el servicio
// de LIP como operador de outsourcing.
// Fuente: "Acuerdos de Servicio Indupan - LiP" y "Acuerdos de Servicio
// La Insuperable (Avimol) - LiP", Mayo 2026. Los tiempos de cargue por tipo
// de vehículo aplican a los 4 sitios (Indupan, Avimol, Cedi Funza, Cedi Medellín).
// Editable aquí (no es dato operativo; es el compromiso contractual).
// =====================================================================

// Tiempo MÁXIMO efectivo de cargue acordado, en minutos, por tipo de vehículo
// y tipo de producto (PT = producto terminado, SUB = subproducto: mogolla,
// salvado, harina de tercera — ver `esNombreSubproducto`). Confirmado con el
// usuario 2026-08-27: en Tractomula/Mula (los vehículos que de verdad cargan
// subproducto a granel) el SLA real es 180 min (3 h), no 150 — se sube acá.
export const SLA_TIEMPO_CARGUE_MIN: Record<string, { PT: number | null; SUB: number | null }> = {
  Turbo: { PT: 30, SUB: null },
  Sencillo: { PT: 45, SUB: 50 },
  Dobletroque: { PT: 70, SUB: 100 },
  Tractomula: { PT: 120, SUB: 180 },
  Mula: { PT: 120, SUB: 180 }, // alias de Tractomula (citasvehiculos usa "Mula")
  Camioneta: { PT: 30, SUB: null }, // asimilada a Turbo (menor capacidad)
}

// AJUSTE DE TIEMPO POR SITIO (proyecto). Los CEDIs manejan tiempos MAYORES a las plantas
// (más manipulación/cross-docking): el acuerdo replica el SLA de Indupan/Avimol pero
// INCREMENTA el tiempo permitido en los CEDIs — Cedi Funza +15%, Cedi Medellín +35%.
// Las plantas (Indupan/Avimol) usan el tiempo base (factor 1.0).
export const FACTOR_TIEMPO_SITIO: Record<number, number> = { 1: 1.0, 2: 1.0, 3: 1.15, 4: 1.35 }
export function factorTiempoSitio(empresaId?: number | null): number {
  return (empresaId != null && FACTOR_TIEMPO_SITIO[empresaId]) || 1.0
}

// Subproducto = Mogolla/Salvado/Harina de Tercera — mismo criterio que ya usa
// Análisis Financiero/Cuadro de Control (`esSubproducto` en
// lib/analisis-financiero-actions.ts) para clasificar por nombre de producto.
// Se duplica acá (no se importa: ese archivo es "use server", solo exporta
// funciones async) para que TODO consumidor de `getSlaCargueMin` pueda saber
// si debe pedir el SLA "PT" o "SUB" sin depender de otro módulo.
export function esNombreSubproducto(nombreProducto: unknown): boolean {
  const k = String(nombreProducto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
  return k.includes("MOGOLLA") || k.includes("SALVADO") || k.includes("TERCERA")
}

export type TipologiaProducto = "BULTO" | "PASTA"

// Ajuste fino DENTRO de PT por tipología de producto (Bulto/estibas normales
// vs Pasta/Pacas livianas ≤15kg por unidad — más movimientos por tonelada).
// Un año completo de tiempos reales (iniciocargue→fincargue) mostró que en
// estas combinaciones puntuales Pasta tarda estructuralmente más que Bulto,
// brecha que el SLA único de PT no reflejaba. Confirmado con el usuario
// 2026-08-29. A diferencia de SLA_TIEMPO_CARGUE_MIN, estos valores YA son
// finales por sitio (salen de la mediana real medida ahí) — no se multiplican
// por factorTiempoSitio. Solo están las combinaciones donde la evidencia
// mostró una brecha real; lo que no aparece aquí sigue el PT normal para
// ambas tipologías (ej. Sencillo en ID3, o cualquier vehículo en ID4).
export const SLA_PT_POR_TIPOLOGIA: Record<
  number,
  Partial<Record<string, Partial<Record<TipologiaProducto, number>>>>
> = {
  1: {
    Sencillo: { PASTA: 50 },
    Mula: { PASTA: 135 },
    Tractomula: { PASTA: 135 },
  },
  2: {
    Sencillo: { PASTA: 75 },
    Dobletroque: { BULTO: 90 },
  },
  3: {
    Turbo: { BULTO: 45, PASTA: 60 },
    Dobletroque: { PASTA: 130 },
    Mula: { BULTO: 180, PASTA: 210 },
    Tractomula: { BULTO: 180, PASTA: 210 },
  },
}

// Tiempo SLA aplicable a un vehículo/producto EN UN SITIO. Si no se conoce el producto,
// usa PT (estándar de referencia del acuerdo). Aplica el factor del sitio (CEDIs +%).
// `tipologia` es opcional y solo aplica sobre PT: quien no lo pase (todos los
// consumidores existentes antes de 2026-08-29) obtiene EXACTAMENTE el mismo
// resultado de siempre.
export function getSlaCargueMin(
  tipovehiculo?: string | null,
  producto: "PT" | "SUB" = "PT",
  empresaId?: number | null,
  tipologia?: TipologiaProducto | null,
): number | null {
  if (!tipovehiculo) return null
  if (producto === "PT" && tipologia && empresaId != null) {
    const override = SLA_PT_POR_TIPOLOGIA[empresaId]?.[tipovehiculo]?.[tipologia]
    if (override != null) return override
  }
  const v = SLA_TIEMPO_CARGUE_MIN[tipovehiculo]
  if (!v) return null
  const base = v[producto] ?? v.PT ?? null
  if (base == null) return null
  return Math.round(base * factorTiempoSitio(empresaId))
}

/**
 * true si la orden DEBE elegir modo de carga (Estibado/Arrume) antes de
 * cerrarse: solo Cargue en ID1 (Indupan) e ID2 (Avimol) — únicos proyectos
 * con la práctica real de arrume negro (confirmado 2026-08-29). No aplica a
 * Descargue/Distribución ni a ID3/ID4. Ver setModoCargaOrden (lib/picking-actions.ts).
 */
export function esModoCargaRequerido(
  idempresa: number | string | null | undefined,
  tipooperacion: string | null | undefined,
): boolean {
  return (Number(idempresa) === 1 || Number(idempresa) === 2) && tipooperacion === "Cargue"
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
