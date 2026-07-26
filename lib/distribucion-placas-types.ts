// Tipo de la tabla `distribucion_placas` (fuera de "use server" para exportarlo).
export interface DistribucionPlaca {
  id: number
  idempresa: number
  placa: string
  activo: boolean
  observacion: string | null
  created_at: string
}
