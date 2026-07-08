// Constantes y tipos de la Calificación del Conductor (módulo NORMAL, sin
// "use server"): un archivo de server actions solo puede exportar funciones
// async, por eso las constantes y los tipos viven aquí.

// Escala didáctica → calificación 1-5 (compatible con el cálculo del BSC).
// Cada cara vale un PORCENTAJE explícito; como el BSC mide (promedio ÷ 5 × 100),
// la calificación 1-5 es exactamente pct ÷ 20, de modo que el % que asignamos a
// cada cara es el MISMO que sube al BSC y a los indicadores de área/gerenciales.
//   🟢 Bueno = 100% (cal 5) · 🟡 Regular = 60% (cal 3) · 🔴 Malo = 20% (cal 1)
// El "Malo" vale 20% (no 0%) a propósito: un 0 se excluiría del promedio del BSC.
export const EMOJI_PCT: Record<"feliz" | "regular" | "mala", number> = { feliz: 100, regular: 60, mala: 20 }
export const EMOJI_A_CALIF: Record<"feliz" | "regular" | "mala", number> = { feliz: 5, regular: 3, mala: 1 }

// La calificación EN LÍNEA (kiosko) opera desde esta fecha. Lo anterior es
// historial de solo lectura: no se califica en vivo, se genera automáticamente
// por SLA (ver generarHistoricoCalificaciones). Única fuente de verdad del corte.
export const CALIFICACION_INICIO = "2026-07-15"

// Mapea el cumplimiento de SLA de tiempos de UNA orden a la escala 1-5 del kiosko:
//   real ≤ SLA → 5 (bueno) · real ≤ SLA·1.3 → 3 (regular) · > SLA·1.3 → 1 (malo).
export function slaACalifConductor(realMin: number, slaMin: number): number {
  if (realMin <= slaMin) return 5
  if (realMin <= slaMin * 1.3) return 3
  return 1
}

// Mapea el % de cumplimiento de SLA del MES a la escala 1-5 del cliente
// (100% → 5, 80% → 4, …). Se acota a [1,5] para no salir de la escala.
export function slaPctACalifCliente(pct: number): number {
  return Math.max(1, Math.min(5, Math.round((pct / 20) * 10) / 10))
}

export interface CargueCalificable {
  ref_orden: string
  proyecto_id: number
  proyecto: string
  conductor: string | null
  placa: string | null
  fecha: string | null
  calificacion: number | null // null = pendiente
  historico?: boolean // true = anterior al corte: no calificable en línea
}

export interface AnalisisCalificacion {
  resumen: {
    finalizados: number
    calificados: number
    pendientes: number
    cobertura: number // % de cargues finalizados calificados (objetivo del coordinador)
    satisfaccion: number // % satisfacción (promedio calificacion /5)
    feliz: number
    regular: number
    mala: number
  }
  pendientes: CargueCalificable[]
  porProyecto: { proyecto: string; satisfaccion: number; calificados: number; cobertura: number }[]
  porMes: { mes: string; satisfaccion: number; n: number }[]
  verTodos: boolean
}
