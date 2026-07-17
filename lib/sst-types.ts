// ---------------------------------------------------------------------------
// Tipos y helpers puros del modulo SST 0312 (Resolucion 0312/2019).
// Separados de las server actions porque un archivo "use server" solo puede
// exportar funciones async.
// ---------------------------------------------------------------------------

export type CicloPHVA = "PLANEAR" | "HACER" | "VERIFICAR" | "ACTUAR"
export type EstadoCumple = "cumple" | "no_cumple" | "no_aplica"
export type Valoracion = "critico" | "moderadamente_aceptable" | "aceptable"

export interface EstandarItem {
  id: number
  ciclo: CicloPHVA
  estandar: string
  numeral: string
  item: string
  peso: number
  modo_aplica: string | null
}

export interface Autoevaluacion {
  id: number
  idempresa: number
  anio: number
  sede: string | null
  responsable: string | null
  fecha: string | null
  estado: string | null
  puntaje_total: number
  valoracion: Valoracion | null
  firma?: string | null
}

export interface Respuesta {
  id?: number
  autoevaluacion_id: number
  item_id: number
  cumple: EstadoCumple
  puntaje_obtenido: number
  observacion: string | null
  soporte_url: string | null
}

export interface CicloResumen {
  ciclo: CicloPHVA
  peso_ciclo: number
  obtenido_ciclo: number
  pct_ciclo: number
}

export interface AuditoriaEstandarRow {
  ciclo: CicloPHVA
  estandar: string
  numeral: string
  item: string
  peso: number
  modulo: string | null
  tabla: string | null
  documento: string | null
  cumple: EstadoCumple | null
  observacion: string | null
  soporte_url: string | null
}

export interface MedicionIndicador {
  tipo: string
  valor: number | null
  meta: number | null
  nombre: string | null
}

export interface MatrizData {
  autoevaluacion: Autoevaluacion | null
  items: EstandarItem[]
  respuestas: Respuesta[]
  porCiclo: CicloResumen[]
  aniosDisponibles: number[]
  // Indicadores de medición (numerales 3.3.1-3.3.6) cableados: si el indicador
  // tiene datos del año, el numeral se auto-marca «cumple» y se muestra el valor.
  medicion?: Record<string, MedicionIndicador>
}

export interface AuditoriaData {
  autoevaluacion: Autoevaluacion | null
  porCiclo: CicloResumen[]
  estandares: AuditoriaEstandarRow[]
  evidencia: Record<string, number>
  aniosDisponibles: number[]
}

// Calcula la valoracion segun los cortes del Art. 28.
export function valoracionFromPct(pct: number): Valoracion {
  if (pct > 85) return "aceptable"
  if (pct >= 60) return "moderadamente_aceptable"
  return "critico"
}
