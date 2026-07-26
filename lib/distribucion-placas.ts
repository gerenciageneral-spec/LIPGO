import { getSupabaseAdminAsSystem } from "@/lib/supabase-admin"

// Vehículos PROPIOS de cada cliente que, además de cargar por LIP, hacen la
// DISTRIBUCIÓN con auxiliares de LIP. Al montar una orden de cargue para una de
// estas placas se DUPLICA automáticamente como orden de DISTRIBUCIÓN (+D).
//
// FUENTE DE VERDAD: tabla `distribucion_placas` (administrable desde Configuración →
// Placas de Distribución, sin deploy). Esta lista es el SEED / FALLBACK por si la
// tabla está vacía o no responde, para que la automatización nunca se rompa.
// Nota: WMP446 (emp 4) y SXX144 (vehículo de emp 1) quedaron EXCLUIDAS a propósito.
export const PLACAS_DISTRIBUCION_DEFAULT: Record<number, string[]> = {
  2: ["QHC437", "QHQ434", "GQV639"],
  3: ["LWY354"],
  4: ["LWY393"],
}

const norm = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase()

// --- Caché en memoria (TTL 60s) de la tabla, para no pegarle a la BD en cada
// creación de orden. `esPlacaDistribucion` se mantiene SÍNCRONA (se usa dentro de
// helpers de facturación síncronos); los server actions llaman antes a
// `cargarPlacasDistribucion()` para calentar el caché. Si el caché no está caliente,
// se usa el DEFAULT (nunca falla). ---
const TTL_MS = 60 * 1000
let _cache: Record<number, string[]> | null = null
let _exp = 0

/** Fuerza recarga del caché en la próxima lectura (llamar tras asignar/desasignar). */
export function invalidarCachePlacas(): void {
  _cache = null
  _exp = 0
}

/** Carga (y cachea) el mapa empresa→placas activas desde la tabla. Fallback al DEFAULT. */
export async function cargarPlacasDistribucion(): Promise<Record<number, string[]>> {
  const now = Date.now()
  if (_cache && _exp > now) return _cache
  try {
    const sb = await getSupabaseAdminAsSystem()
    const { data, error } = await sb.from("distribucion_placas").select("idempresa, placa").eq("activo", true)
    if (error) throw error
    if (data && data.length > 0) {
      const map: Record<number, string[]> = {}
      for (const r of data) {
        const emp = Number(r.idempresa)
        if (!map[emp]) map[emp] = []
        map[emp].push(norm(r.placa))
      }
      _cache = map
      _exp = now + TTL_MS
      return map
    }
    // Tabla vacía → usar DEFAULT (no cachear vacío para reintentar pronto).
    return PLACAS_DISTRIBUCION_DEFAULT
  } catch {
    return _cache ?? PLACAS_DISTRIBUCION_DEFAULT
  }
}

/** Mapa vigente (caché si existe, si no el DEFAULT). Síncrono. */
function mapaVigente(): Record<number, string[]> {
  return _cache ?? PLACAS_DISTRIBUCION_DEFAULT
}

/** Placas activas de una empresa (síncrono; usa el caché o el DEFAULT). */
export function getPlacasEmpresa(empresaId: number | null | undefined): string[] {
  if (!empresaId) return []
  return mapaVigente()[empresaId] ?? []
}

/** ¿La placa de esta empresa debe generar orden de distribución automática? (síncrono) */
export function esPlacaDistribucion(
  empresaId: number | null | undefined,
  placa: string | null | undefined,
): boolean {
  if (!empresaId) return false
  const lista = mapaVigente()[empresaId]
  if (!lista || lista.length === 0) return false
  const p = norm(placa)
  if (!p) return false
  return lista.some((x) => norm(x) === p)
}

/** Número de la orden de distribución = número de la orden de cargue + "D". */
export function numeroOrdenDistribucion(ordenCargue: string): string {
  return `${ordenCargue}D`
}
