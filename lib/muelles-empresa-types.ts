// Tipo de la tabla `muelles_empresa` (fuera de "use server" para exportarlo).
export interface MuelleEmpresa {
  id: number
  idempresa: number
  muelle: number
  activo: boolean
  observacion: string | null
  created_at: string
}
