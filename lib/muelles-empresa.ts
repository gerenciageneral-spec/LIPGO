import { getSupabaseAdminAsSystem } from "@/lib/supabase-admin"

// Muelles de cargue simultáneos por proyecto (Centro de Coordinación).
//
// FUENTE DE VERDAD: tabla `muelles_empresa` (administrable desde Configuración →
// Muelles de Cargue, sin deploy). Esta lista es el SEED / FALLBACK por si la
// tabla está vacía o no responde, para que el tablero de muelles nunca se rompa —
// reproduce exacto lo que antes era MUELLES_SIMULTANEOS en meta-productividad-utils.ts.
export const MUELLES_EMPRESA_DEFAULT: Record<number, number[]> = {
  1: [1, 2, 3],
  2: [1, 2, 3, 4, 5],
  3: [1, 2, 3, 4],
  4: [1],
}

// --- Caché en memoria (TTL 60s), mismo patrón que distribucion-placas.ts. ---
const TTL_MS = 60 * 1000
let _cache: Record<number, number[]> | null = null
let _exp = 0

/** Fuerza recarga del caché en la próxima lectura (llamar tras agregar/desactivar/eliminar). */
export function invalidarCacheMuelles(): void {
  _cache = null
  _exp = 0
}

/** Carga (y cachea) el mapa empresa→muelles activos (ordenados) desde la tabla. Fallback al DEFAULT. */
export async function cargarMuellesEmpresa(): Promise<Record<number, number[]>> {
  const now = Date.now()
  if (_cache && _exp > now) return _cache
  try {
    const sb = await getSupabaseAdminAsSystem()
    const { data, error } = await sb
      .from("muelles_empresa")
      .select("idempresa, muelle")
      .eq("activo", true)
      .order("muelle", { ascending: true })
    if (error) throw error
    if (data && data.length > 0) {
      const map: Record<number, number[]> = {}
      for (const r of data) {
        const emp = Number(r.idempresa)
        if (!map[emp]) map[emp] = []
        map[emp].push(Number(r.muelle))
      }
      _cache = map
      _exp = now + TTL_MS
      return map
    }
    // Tabla vacía → usar DEFAULT (no cachear vacío para reintentar pronto).
    return MUELLES_EMPRESA_DEFAULT
  } catch {
    return _cache ?? MUELLES_EMPRESA_DEFAULT
  }
}

/** Mapa vigente (caché si existe, si no el DEFAULT). Síncrono. */
function mapaVigente(): Record<number, number[]> {
  return _cache ?? MUELLES_EMPRESA_DEFAULT
}

/** Números de muelle ACTIVOS de una empresa, ordenados (síncrono; usa el caché o el DEFAULT). */
export function getMuellesEmpresaSync(idempresa: number | null | undefined): number[] {
  if (!idempresa) return []
  return mapaVigente()[idempresa] ?? []
}
