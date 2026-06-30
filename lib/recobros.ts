// Constantes y tipos del recobro de incapacidades (módulo NORMAL, sin
// "use server"): un archivo de server actions solo puede exportar funciones
// async, por eso la constante y los tipos viven aquí y se reutilizan tanto en
// el componente como en lib/recobros-actions.ts.

// Estados del ciclo de recobro de una incapacidad.
export type EstadoRecobro = "PENDIENTE" | "RADICADO" | "RECOBRADO" | "GLOSADO" | "PERDIDO"

export const ESTADOS_RECOBRO: EstadoRecobro[] = [
  "PENDIENTE",
  "RADICADO",
  "RECOBRADO",
  "GLOSADO",
  "PERDIDO",
]

export interface ActualizarRecobroInput {
  estado_recobro?: EstadoRecobro | null
  valor_recobrado?: number | null
  fecha_radicado_recobro?: string | null
  obs_recobro?: string | null
  soporte_radicado_url?: string | null
  soporte_pago_url?: string | null
}
