"use client"

/**
 * Hook que calcula los INGRESOS del Estado de Resultados para el periodo
 * y la empresa indicados.
 *
 * Fuentes:
 *  - Facturacion de toneladas: `public.facturacion`
 *      - filtro: idempresa = idEmpresa
 *      - rango : fechacargue (timestamp) en [desde, hastaExclusivo)
 *      - sumar : valor_a_facturar
 *
 *  - Facturacion de turnos: `public.facturacionturnos`
 *      - filtro: idempresa = idEmpresa
 *      - rango : fecha (date) en [desde, hasta] (inclusive)
 *      - sumar : facturacion_total
 *
 * Suma del lado del cliente para no depender de RPCs nuevos.
 *
 * IMPORTANTE - paginacion obligatoria: Supabase/PostgREST corta toda
 * respuesta en 1000 filas aunque el `count` diga mas. `facturacion` supera
 * las 7.000 filas por empresa en un anio, asi que sumar sin `.range(...)`
 * truncaba el ingreso en silencio (68% del ingreso 2026 quedaba oculto)
 * mientras el costo de nomina SI paginaba: el P&L mostraba una perdida
 * inexistente. Mismo patron de bloques de 1000 que `use-costo-nomina.ts`.
 */

import useSWR from "swr"
import { supabase } from "@/lib/supabase-client"
import { getConciliacionAvimol } from "@/lib/conciliacion-avimol-actions"

export interface IngresosTotales {
  toneladas: number
  turnos: number
  /** Cargos fijos mensuales reconocidos: $2M Manejo de Inventario (id1/id3),
   *  600 ton fijas de Avimol, alquiler de montacargas facturado (id1/id3).
   *  Ver lib/cargos-fijos-actions.ts. */
  fijos: number
  total: number
  conteoToneladas: number
  conteoTurnos: number
  conteoFijos: number
  /** De dónde salió el renglón de turnos: la vista `facturacionturnos` o la
   *  Conciliación (Avimol, id 2), donde vive su facturación real. */
  fuenteTurnos: "vista" | "conciliacion"
}

interface UseIngresosArgs {
  idEmpresa: number | null | undefined
  desde: string
  hasta: string
  hastaExclusivo: string
}

// Suma una columna numerica de una vista paginando en bloques de 1000,
// exactamente como `use-costo-nomina.ts`. Devuelve la suma y cuantas filas
// se leyeron de verdad (no el `count` del servidor, que puede mentir menos
// que una respuesta truncada).
async function sumarPaginado(
  aplicarFiltros: (q: any) => any,
  tabla: string,
  columna: string,
): Promise<{ suma: number; filas: number }> {
  const PAGE_SIZE = 1000
  // Tope defensivo contra loops infinitos; ~100k filas cubre varios anios.
  const MAX_ROWS = 100_000
  let suma = 0
  let filas = 0
  let offset = 0

  while (offset < MAX_ROWS) {
    const { data: page, error } = await aplicarFiltros(
      supabase.from(tabla).select(columna),
    ).range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Error al leer ${tabla}: ${error.message}`)
    }
    if (!page || page.length === 0) break

    for (const r of page as Array<Record<string, unknown>>) {
      suma += Number(r[columna]) || 0
    }
    filas += page.length
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return { suma, filas }
}

// Igual que sumarPaginado, pero TOLERANTE a que la tabla aun no exista —
// usado solo para `cargos_fijos_generados`, que depende de migraciones
// nuevas (scripts/create_cargos_fijos_*.sql) que pueden no haberse corrido
// todavia. Sin esto, abrir el Estado de Resultados en cualquier proyecto
// se rompía por completo hasta correr esas migraciones.
async function sumarPaginadoTolerante(
  aplicarFiltros: (q: any) => any,
  tabla: string,
  columna: string,
): Promise<{ suma: number; filas: number }> {
  try {
    return await sumarPaginado(aplicarFiltros, tabla, columna)
  } catch (e) {
    console.warn(`[estado-resultados] ${tabla} no disponible todavia (¿faltan migraciones?):`, e)
    return { suma: 0, filas: 0 }
  }
}

async function fetchIngresos(
  idEmpresa: number,
  desde: string,
  hasta: string,
  hastaExclusivo: string,
): Promise<IngresosTotales> {
  // Facturacion toneladas: la columna `fechacargue` es timestamp en este
  // proyecto, asi que usamos gte/lt con el dia +1 exclusivo.
  const tonsPromise = sumarPaginado(
    (q) =>
      q
        .eq("idempresa", idEmpresa)
        .gte("fechacargue", desde)
        .lt("fechacargue", hastaExclusivo),
    "facturacion",
    "valor_a_facturar",
  )

  // Cargos fijos reconocidos (ver lib/cargos-fijos-actions.ts): un registro
  // por CONCEPTO x MES (columna `periodo` = primer dia del mes). Al filtrar
  // por [desde,hasta] igual que facturacionturnos, un periodo que abarque el
  // mes completo lo cuenta entero; si se consulta solo una quincena, el cargo
  // cae en la quincena que contenga el dia 1 del mes (no se prorratea).
  const fijosPromise = sumarPaginadoTolerante(
    (q) =>
      q
        .eq("idempresa", idEmpresa)
        .eq("tipo", "ingreso")
        .gte("periodo", desde)
        .lte("periodo", hasta),
    "cargos_fijos_generados",
    "valor",
  )

  // AVIMOL (id 2): su facturacion real de turnos NO es la vista — son los
  // turnos SOLICITADOS Y APROBADOS + la produccion aprobada + las horas extra,
  // que arma la Conciliacion. La vista facturacionturnos cobraba por ejecucion
  // e ignoraba `cobraturno`, doble-contando la produccion (~$12M/mes). El P&L
  // usa el mismo motor que la prefactura para que ambos cuadren.
  if (idEmpresa === 2) {
    const [tons, conc, fijos] = await Promise.all([
      tonsPromise,
      getConciliacionAvimol(desde, hasta),
      fijosPromise,
    ])
    if (!conc.success || !conc.data) {
      throw new Error(
        `Error al leer la conciliacion de Avimol: ${conc.message || "desconocido"}`,
      )
    }
    const r = conc.data.resumen
    return {
      toneladas: tons.suma,
      turnos: r.cobroTotal,
      fijos: fijos.suma,
      total: tons.suma + r.cobroTotal + fijos.suma,
      conteoToneladas: tons.filas,
      conteoTurnos: r.diasConDatos,
      conteoFijos: fijos.filas,
      fuenteTurnos: "conciliacion",
    }
  }

  // Facturacion turnos: la columna `fecha` es DATE puro, gte/lte inclusive.
  const [tons, turnosRes, fijos] = await Promise.all([
    tonsPromise,
    sumarPaginado(
      (q) =>
        q.eq("idempresa", idEmpresa).gte("fecha", desde).lte("fecha", hasta),
      "facturacionturnos",
      "facturacion_total",
    ),
    fijosPromise,
  ])

  return {
    toneladas: tons.suma,
    turnos: turnosRes.suma,
    fijos: fijos.suma,
    total: tons.suma + turnosRes.suma + fijos.suma,
    conteoToneladas: tons.filas,
    conteoTurnos: turnosRes.filas,
    conteoFijos: fijos.filas,
    fuenteTurnos: "vista",
  }
}

export function useIngresos({
  idEmpresa,
  desde,
  hasta,
  hastaExclusivo,
}: UseIngresosArgs) {
  const key =
    idEmpresa != null
      ? (["estado-resultados:ingresos", idEmpresa, desde, hasta] as const)
      : null

  const { data, error, isLoading, mutate } = useSWR(
    key,
    () => fetchIngresos(idEmpresa as number, desde, hasta, hastaExclusivo),
    {
      // El periodo cambia poco; no necesitamos refrescar con foco.
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  )

  return {
    data,
    isLoading,
    error: error as Error | undefined,
    refrescar: mutate,
  }
}
