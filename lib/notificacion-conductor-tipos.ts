// Tipos de la notificación al conductor.
//
// Aparte del archivo de acciones porque ese es "use server" y esos archivos
// solo pueden exportar funciones async.

export type EventoConductor = "muelle_asignado" | "cargue_finalizado"

export interface ConfigConductor {
  id: number
  evento: EventoConductor
  nombre: string
  activo: boolean
  mensaje: string
  titulo: string
  urlEncuesta: string | null
  /** Empresas donde aplica. Vacío = ninguna. */
  empresas: number[]
  /**
   * Con valor, TODOS los avisos van ahí en vez de al conductor.
   * Vaciarlo es lo que pone el flujo en real.
   */
  telefonoPrueba: string | null
  actualizadoPor: string | null
}

/** Datos de la orden con los que se arma el mensaje. */
export interface ContextoOrden {
  ordenId: number
  empresaId: number
  conductor: string | null
  placa: string | null
  ordenDeCargue: string | null
  cliente: string | null
  muelle: number | null
  /** Teléfono real del conductor, si la orden lo trae. */
  telefonoConductor: string | null
}

export interface ResultadoAviso {
  /** false cuando no se envió por configuración, no por error. */
  enviado: boolean
  /** Por qué no se envió, cuando aplica. */
  motivo?: string
  telefono?: string
}
