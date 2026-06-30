"use client"

import useSWR from "swr"
import { supabase } from "@/lib/supabase-client"

/**
 * Fila agregada por categoria. La UI renderiza una fila por cada elemento
 * y al final una fila "Total gastos".
 */
export interface CategoriaRow {
  categoria: string
  total: number
  cantidad: number
}

export interface GastosResumen {
  porCategoria: CategoriaRow[]
  total: number
  cantidadTotal: number
}

interface Args {
  idEmpresa: number | null
  desde: string
  hasta: string
}

/**
 * useGastosPorCategoria - Trae todos los gastos del periodo (filtrados por
 * id_empresa) y los agrega por categoria en cliente. La tabla `gastos`
 * usa `id_empresa` (snake_case) y `fecha` (DATE), distinto del resto de
 * tablas del estado de resultados.
 *
 * Decision: NO usamos `count: 'exact'` ni un agregado SQL aparte porque
 * Supabase no tiene `group by` en el cliente JS. Traemos las filas y
 * agregamos en memoria (volumen esperado: decenas/cientos por mes, ok).
 */
export function useGastosPorCategoria({
  idEmpresa,
  desde,
  hasta,
}: Args) {
  const swrKey =
    idEmpresa == null
      ? null
      : (["estado-resultados:gastos", idEmpresa, desde, hasta] as const)

  const { data, error, isLoading } = useSWR<GastosResumen>(
    swrKey,
    async () => {
      const { data: rows, error: err } = await supabase
        .from("gastos")
        .select("categoria, monto")
        .eq("id_empresa", idEmpresa as number)
        .gte("fecha", desde)
        .lte("fecha", hasta)

      if (err) throw err

      // Agregamos por categoria en memoria. Usamos un Map para preservar
      // orden de insercion estable.
      const acc = new Map<string, { total: number; cantidad: number }>()
      let total = 0
      let cantidadTotal = 0

      for (const r of rows ?? []) {
        const cat = (r.categoria ?? "Sin categoria").toString()
        const monto = Number(r.monto) || 0
        const cur = acc.get(cat) ?? { total: 0, cantidad: 0 }
        cur.total += monto
        cur.cantidad += 1
        acc.set(cat, cur)
        total += monto
        cantidadTotal += 1
      }

      const porCategoria: CategoriaRow[] = Array.from(acc.entries())
        .map(([categoria, v]) => ({
          categoria,
          total: v.total,
          cantidad: v.cantidad,
        }))
        // Orden descendente por monto: el usuario ve primero lo que mas pesa.
        .sort((a, b) => b.total - a.total)

      return { porCategoria, total, cantidadTotal }
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  )

  return {
    data,
    error: error as Error | undefined,
    isLoading,
  }
}
