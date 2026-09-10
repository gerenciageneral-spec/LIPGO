// Tipos del tallaje de productos.
//
// Van aparte del archivo de acciones porque ese es "use server" y esos archivos
// solo pueden exportar funciones async: exportar un tipo o una constante desde
// alli rompe el BUILD aunque el typecheck pase.

/** Una talla de un producto padre. */
export interface ProductoTalla {
  id: number
  nombre: string
  codigo: string
  talla: string
  tallaOrden: number | null
  /** Stock de esta talla en el lote y ubicacion consultados. */
  stock?: number
}

/** Cuanto se le asigna a cada talla en un reparto. */
export interface AsignacionTalla {
  /** id del producto-talla ya existente, o null si hay que crearlo. */
  productoId: number | null
  talla: string
  cantidad: number
}

/** Lo que se necesita para repartir stock de un padre entre sus tallas. */
export interface RepartoTallajeInput {
  selectedEmpresaId: number
  productoPadreId: number
  lote: string
  location: string
  asignaciones: AsignacionTalla[]
  /** Clave del responsable: repartir mueve stock real. */
  clave: string
  motivo: string
}

/** Origen disponible para repartir: un lote con stock en una ubicacion. */
export interface OrigenDisponible {
  lote: string
  location: string
  stock: number
}

export interface ResultadoReparto {
  success: boolean
  message: string
  invtransIds?: number[]
  repartoId?: number
  /** Tallas que hubo que crear como producto nuevo. */
  tallasCreadas?: string[]
}
