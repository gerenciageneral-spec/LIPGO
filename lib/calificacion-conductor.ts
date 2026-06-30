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

export interface CargueCalificable {
  ref_orden: string
  proyecto_id: number
  proyecto: string
  conductor: string | null
  placa: string | null
  fecha: string | null
  calificacion: number | null // null = pendiente
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
