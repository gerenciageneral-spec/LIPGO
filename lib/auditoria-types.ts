// Tipos de la Bitácora de Auditoría (fuera de "use server" para exportarlos).

export interface AuditoriaFiltro {
  desde?: string // ISO date (YYYY-MM-DD)
  hasta?: string
  actorId?: string
  modulo?: string
  tabla?: string
  operacion?: "INSERT" | "UPDATE" | "DELETE"
  busqueda?: string
  page?: number // 0-based
  pageSize?: number // default 50, máx 200
}

export interface AuditoriaRow {
  id: number
  ts: string
  actor_id: string | null
  actor_nombre: string
  idempresa: number | null
  modulo: string | null
  tabla: string
  operacion: "INSERT" | "UPDATE" | "DELETE" | string
  registro_id: string | null
  descripcion: string | null
  antes: Record<string, any> | null
  despues: Record<string, any> | null
  campos_cambiados: string[] | null
}

// Diff campo-a-campo para el modal (calculado en cliente desde antes/después).
export interface DiffCampo {
  campo: string
  antes: any
  despues: any
  estado: "igual" | "cambiado" | "agregado" | "eliminado"
}

export function calcularDiff(
  antes: Record<string, any> | null,
  despues: Record<string, any> | null,
  cambiados?: string[] | null,
): DiffCampo[] {
  const a = antes || {}
  const d = despues || {}
  const claves = Array.from(new Set([...Object.keys(a), ...Object.keys(d)])).sort()
  const setCambiados = cambiados ? new Set(cambiados) : null
  return claves.map((campo) => {
    const enA = campo in a
    const enD = campo in d
    const vA = a[campo]
    const vD = d[campo]
    let estado: DiffCampo["estado"] = "igual"
    if (enA && !enD) estado = "eliminado"
    else if (!enA && enD) estado = "agregado"
    else if (JSON.stringify(vA) !== JSON.stringify(vD)) estado = "cambiado"
    // Si el trigger marcó campos_cambiados, respétalo para el resaltado.
    if (setCambiados && setCambiados.has(campo) && estado === "igual") estado = "cambiado"
    return { campo, antes: vA, despues: vD, estado }
  })
}
