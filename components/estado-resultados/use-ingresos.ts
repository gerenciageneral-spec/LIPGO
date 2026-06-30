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
 * Suma del lado del cliente para no depender de RPCs nuevos. Como el filtro
 * por empresa + rango es estrecho, el volumen de filas es chico (decenas a
 * cientos por mes en proyectos tipicos).
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

async function fetchIngresos(
  idEmpresa: number,
  desde: string,
  hasta: string,
  hastaExclusivo: string,
): Promise<IngresosTotales> {
  // Facturacion toneladas: la columna `fechacargue` es timestamp en este
  // proyecto, asi que usamos gte/lt con el dia +1 exclusivo.
  const tonsPromise = supabase
    .from("facturacion")
    .select("valor_a_facturar", { count: "exact" })
    .eq("idempresa", idEmpresa)
    .gte("fechacargue", desde)
    .lt("fechacargue", hastaExclusivo)

  // Facturacion turnos: la columna `fecha` es DATE puro, asi que usamos
  // gte/lte inclusive.
  const turnosPromise = supabase
    .from("facturacionturnos")
    .select("facturacion_total", { count: "exact" })
    .eq("idempresa", idEmpresa)
    .gte("fecha", desde)
    .lte("fecha", hasta)

  const [tonsRes, turnosRes] = await Promise.all([tonsPromise, turnosPromise])

  if (tonsRes.error) {
    throw new Error(
      `Error al leer facturacion toneladas: ${tonsRes.error.message}`,
    )
  }
  if (turnosRes.error) {
    throw new Error(
      `Error al leer facturacion turnos: ${turnosRes.error.message}`,
    )
  }

  const toneladas = (tonsRes.data ?? []).reduce(
    (acc, r) => acc + (Number(r.valor_a_facturar) || 0),
    0,
  )
  const turnos = (turnosRes.data ?? []).reduce(
    (acc, r) => acc + (Number(r.facturacion_total) || 0),
    0,
  )

  return {
    toneladas,
    turnos,
    total: toneladas + turnos,
    conteoToneladas: tonsRes.count ?? tonsRes.data?.length ?? 0,
    conteoTurnos: turnosRes.count ?? turnosRes.data?.length ?? 0,
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
