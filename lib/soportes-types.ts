// Tipos del repositorio central de soportes documentales.
export interface SoporteRow {
  id: number
  idempresa: number
  norma: string
  modulo: string
  referencia_tipo: string
  referencia_id: string
  referencia_desc: string | null
  archivo_url: string
  archivo_nombre: string | null
  tipo_archivo: string | null
  tamano: number | null
  subido_por: string | null
  observacion: string | null
  vigente: boolean
  created_at: string | null
}

export interface SoporteMeta {
  norma: string
  modulo: string
  referenciaTipo: string
  referenciaId: string
  referenciaDesc?: string | null
  observacion?: string | null
  subidoPor?: string | null
}
