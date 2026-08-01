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

export interface IngresosTotales {
  toneladas: number
  turnos: number
  total: number
  conteoToneladas: number
  conteoTurnos: number
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

async function fetchIngresos(
  idEmpresa: number,
  desde: string,
  hasta: string,
  hastaExclusivo: string,
): Promise<IngresosTotales> {
  // Facturacion toneladas: la columna `fechacargue` es timestamp en este
  // proyecto, asi que usamos gte/lt con el dia +1 exclusivo.
  // Facturacion turnos: la columna `fecha` es DATE puro, gte/lte inclusive.
  const [tons, turnosRes] = await Promise.all([
    sumarPaginado(
      (q) =>
        q
          .eq("idempresa", idEmpresa)
          .gte("fechacargue", desde)
          .lt("fechacargue", hastaExclusivo),
      "facturacion",
      "valor_a_facturar",
    ),
    sumarPaginado(
      (q) =>
        q.eq("idempresa", idEmpresa).gte("fecha", desde).lte("fecha", hasta),
      "facturacionturnos",
      "facturacion_total",
    ),
  ])

  return {
    toneladas: tons.suma,
    turnos: turnosRes.suma,
    total: tons.suma + turnosRes.suma,
    conteoToneladas: tons.filas,
    conteoTurnos: turnosRes.filas,
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
