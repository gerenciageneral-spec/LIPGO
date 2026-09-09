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

/**
 * Hidrata el caché con un mapa ya resuelto (ej. traído por un Server Action
 * desde código CLIENTE, que no puede llamar a `cargarPlacasDistribucion()`
 * directamente porque esta usa el cliente admin de Supabase). Sin esto, un
 * hook de navegador cae siempre al DEFAULT hardcodeado y nunca ve cambios
 * reales del módulo Placas de Distribución.
 */
export function hidratarCachePlacas(mapa: Record<number, string[]>): void {
  _cache = mapa
  _exp = Date.now() + TTL_MS
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

/**
 * Proyectos donde el vehículo PROPIO se factura ENTERO al owner del
 * proyecto, sin importar el producto que lleve (confirmado 2026-08-02 para
 * ID4/Molinos del Atlántico — LWY393 mezcla productos de Molinos y Avimol
 * pero el viaje completo es un servicio que se le vende solo a Molinos).
 * ID3/Avimol (LWY354 en CEDI Funza) tuvo esta misma regla del 2026-08-06 al
 * 2026-09-09: se REVIRTIÓ a pedido explícito porque CEDI Funza recibe y
 * despacha mercancía de TODOS los ID en la misma bodega, así que LWY354 no
 * es exclusiva de Avimol — forzar el owner mal-atribuía a Avimol cualquier
 * viaje que en realidad llevara producto de otro owner (Molinos, Indupan).
 * En ID3 se factura de nuevo al owner real del producto, como Avimol id2
 * (QHC437/QHQ434/GQV639) siempre ha hecho.
 */
export const OWNER_DE_PLACA_PROPIA: Record<number, string> = {
  4: "Molinos del Atlántico",
}

/**
 * Empresas donde el Cargue y su clon de Distribución "+D" del vehículo
 * propio (misma orden, mismo ID) se agrupan en un solo resumen/anexo de
 * facturación ("Cargue + Distribución (vehículo propio)"), para medir sus
 * toneladas/valor juntas en vez de repartirlas en documentos separados por
 * operación puntual. Independiente de `OWNER_DE_PLACA_PROPIA`: agrupar el
 * viaje y forzar el owner son decisiones separadas (ID3 agrupa pero, desde
 * 2026-09-09, ya NO fuerza el owner — ver comentario arriba).
 */
export const VEHICULO_PROPIO_AGRUPA_CARGUE_DISTRIBUCION = new Set<number>([3, 4])

/**
 * ¿Esta línea es Cargue o Distribución del vehículo propio de un proyecto
 * que agrupa ese viaje en un solo resumen/anexo? Usado tanto por Prefactura
 * (`grupoResumen`) como por el Anexo de Facturación en PDF, para que ambos
 * agrupen exactamente igual.
 */
export function esVehiculoPropioAgrupable(
  idempresa: number | null | undefined,
  placa: string | null | undefined,
  tipooperacion: string | null | undefined,
): boolean {
  const opNorm = String(tipooperacion ?? "").trim().toLowerCase()
  return (
    VEHICULO_PROPIO_AGRUPA_CARGUE_DISTRIBUCION.has(Number(idempresa)) &&
    esPlacaDistribucion(idempresa, placa) &&
    (opNorm === "cargue" || opNorm === "distribucion")
  )
}

/**
 * Owner real de una línea de facturación. Si el proyecto tiene la regla de
 * arriba y la placa es su vehículo propio, se IGNORA el owner del producto
 * que trae la vista `facturacion` y se factura entero al owner del proyecto.
 * En cualquier otro caso se respeta el owner tal como viene (de siempre).
 */
export function ownerDeLinea(
  idempresa: number | null | undefined,
  placa: string | null | undefined,
  ownerDeLaVista: string,
): string {
  const ownerPropio = OWNER_DE_PLACA_PROPIA[Number(idempresa)]
  if (ownerPropio && esPlacaDistribucion(idempresa, placa)) return ownerPropio
  return ownerDeLaVista
}
