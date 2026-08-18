import { TON_MES_CARGUE_DESCARGUE, DIAS_OPERACION_MES } from "@/lib/meta-productividad-utils"

/**
 * Meta de toneladas por dia, fija por empresa.
 *
 * Reemplaza el calculo previo basado en la columna `Meta Dia` de la
 * vista `metadia` por una constante operativa decidida con el
 * negocio. La vista sigue existiendo y se sigue consultando para
 * traer el desglose por `Tipo de Producto` / `Tipo de Operacion`
 * (necesario para los filtros y graficas), pero el numero "meta"
 * que se compara contra el ejecutado se sobrescribe con este mapa
 * para garantizar el mismo objetivo en todos los dashboards
 * (Dashboard Operacion del dia + Dashboard Operacion / LIP) y en el
 * indicador de volumen del BSC (IND-CD-06, lib/sig-actions.ts).
 *
 * id1-4: se derivan de `TON_MES_CARGUE_DESCARGUE` (lib/meta-productividad-utils.ts)
 * / 24,7 dias habiles — MISMA fuente que usa Control de Toneladas y Revision
 * de Nomina, para que "meta diaria" sea un solo numero en toda la app.
 * Corregido 2026-08-18 a pedido del usuario: SOLO Cargue y Distribución
 * cuentan para la meta diaria — Producción (Tolva, Estibado PT, Salvado)
 * tiene su PROPIO indicador OEE de Producción y no suma acá (antes esta
 * constante incluía Tolva en id1 por error, y excluía Distribución en id2
 * por error — el mecanismo de facturación de una actividad, ej. Distribución
 * de Avimol se cobra vía fijo mensual, no decide si cuenta como tarea diaria):
 *   id1 Indupan       4.500 t/mes -> 182,2 (Indupan no tiene distribución en el acuerdo)
 *   id2 Avimol        4.525 t/mes -> 183,2 (vigencia jul-dic-2026; incluye distribución)
 *   id3 Cedi Funza    2.200 t/mes -> 89,1
 *   id4 Cedi Medellin 1.693 t/mes -> 68,5
 * id5/id6 son proyectos de prueba, no participan del acuerdo — se
 * dejan con su valor propio, sin relación con acuerdo_volumenes.
 */
export const EMPRESA_META_DIA_TON: Record<number, number> = {
  1: Math.round((TON_MES_CARGUE_DESCARGUE[1] / DIAS_OPERACION_MES) * 10) / 10,
  2: Math.round((TON_MES_CARGUE_DESCARGUE[2] / DIAS_OPERACION_MES) * 10) / 10,
  3: Math.round((TON_MES_CARGUE_DESCARGUE[3] / DIAS_OPERACION_MES) * 10) / 10,
  4: Math.round((TON_MES_CARGUE_DESCARGUE[4] / DIAS_OPERACION_MES) * 10) / 10,
  5: 120,
  6: 100,
}

/**
 * Devuelve la meta diaria en toneladas para una empresa. Si el id
 * no esta en el mapa retorna 0 (en lugar de lanzar) para que el
 * dashboard simplemente renderice sin meta y no rompa el flujo de
 * empresas que aun no tengan objetivo asignado.
 */
export function getMetaDiaForEmpresa(empresaId: number | string | null | undefined): number {
  if (empresaId === null || empresaId === undefined) return 0
  const id = typeof empresaId === "number" ? empresaId : Number(empresaId)
  if (!Number.isFinite(id)) return 0
  return EMPRESA_META_DIA_TON[id] ?? 0
}

/**
 * Toma un set de filas de la vista `metadia` (devueltas con las
 * columnas en PascalCase tal como las expone Postgres: "Fecha",
 * "Meta Dia", "Total Toneladas Procesadas", etc.) y devuelve una
 * copia donde el campo "Meta Dia" queda redistribuido para que la
 * suma por dia sea exactamente `metaTotalDia` (la constante del
 * mapa).
 *
 * Estrategia de distribucion:
 *   1. Agrupar filas por "Fecha".
 *   2. Calcular el total de toneladas reales del dia.
 *   3. Si hay toneladas > 0, asignar a cada fila una porcion de
 *      `metaTotalDia` proporcional a sus toneladas. Asi los
 *      filtros por producto/operacion siguen mostrando un
 *      cumplimiento coherente.
 *   4. Si todas las filas del dia tienen toneladas = 0,
 *      distribuir el total equitativamente entre las filas para
 *      que la suma del dia siga dando la constante.
 *
 * Esto preserva la forma del payload (mismas columnas, mismo
 * numero de filas) y permite que los componentes existentes
 * (`lip-daily-operations`, `lip-historical-operations`) sumen
 * `meta_dia` y obtengan la nueva meta sin cambios adicionales.
 */
export function rewriteMetaDiaRows<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
  metaTotalDia: number,
): T[] {
  if (!rows || rows.length === 0) return []

  // Agrupar indices de filas por fecha.
  const byDate = new Map<string, number[]>()
  rows.forEach((r, idx) => {
    const fecha = String(r["Fecha"] ?? "")
    const arr = byDate.get(fecha)
    if (arr) arr.push(idx)
    else byDate.set(fecha, [idx])
  })

  // Trabajamos sobre una copia para no mutar el array original.
  const out = rows.map((r) => ({ ...r })) as T[]

  for (const [, idxs] of byDate) {
    const totalTon = idxs.reduce(
      (s, i) => s + (Number(out[i]["Total Toneladas Procesadas"]) || 0),
      0,
    )

    if (totalTon > 0) {
      // Distribucion proporcional a toneladas reales.
      idxs.forEach((i) => {
        const ton = Number(out[i]["Total Toneladas Procesadas"]) || 0
        ;(out[i] as Record<string, unknown>)["Meta Dia"] = (ton / totalTon) * metaTotalDia
      })
    } else {
      // Sin toneladas reales: distribucion equitativa para que la
      // suma siga siendo la constante.
      const share = metaTotalDia / idxs.length
      idxs.forEach((i) => {
        ;(out[i] as Record<string, unknown>)["Meta Dia"] = share
      })
    }
  }

  return out
}

/**
 * Construye una fila sintetica de `metadia` para una fecha y
 * empresa. Util cuando la vista no tiene registro para el dia
 * (porque aun no hay toneladas registradas) pero el dashboard
 * necesita mostrar la meta como hito a alcanzar.
 */
export function buildSyntheticMetaRow(
  empresaId: number,
  fecha: string,
  metaTotalDia: number,
): Record<string, unknown> {
  return {
    Fecha: fecha,
    IdEmpresa: empresaId,
    "Tipo de Producto": "Total",
    "Tipo de Operacion": "Total",
    "Total Viajes/Tickets": 0,
    "Total Toneladas Procesadas": 0,
    "Meta Dia": metaTotalDia,
  }
}
