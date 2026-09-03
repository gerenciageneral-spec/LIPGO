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
  // Retirado del repositorio (se subio por error). Distinto de vigente=false,
  // que es un historico legitimo y si se sigue mostrando como evidencia.
  // Opcionales porque las columnas solo existen despues del script 55.
  eliminado?: boolean | null
  eliminado_en?: string | null
  eliminado_motivo?: string | null
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
