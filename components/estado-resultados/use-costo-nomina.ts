"use client"

import useSWR from "swr"
import { supabase } from "@/lib/supabase-client"

/**
 * Porcentajes regulatorios usados en Colombia para calcular las
 * provisiones a partir del valor liquidado de nomina del periodo.
 *
 * Centralizados aqui para que tanto el hook (calculos numericos) como
 * la seccion presentacional (etiquetas en la UI) los compartan y nunca
 * se desincronicen.
 */
export const PROVISIONES_PRESTACIONES = {
  cesantias: 0.0833, // 8.33%
  interesesCesantias: 0.01, // 1%
  prima: 0.0833, // 8.33% (igual a cesantias)
  vacaciones: 0.0417, // 4.17%
} as const

export const PROVISIONES_SEG_SOCIAL = {
  // NOTA: `saludEmpleado` (8.5%) y `pensionEmpleado` (12%) se removieron
  // del estado de resultados por solicitud del negocio: no se reflejan
  // aqui dentro del P&L. Si se requiere reincorporarlos en el futuro,
  // basta con anadir el campo aqui y la fila correspondiente en
  // seccion-costo-nomina.
  pensionEmpresa: 0.12, // 12%
  cajaCompensacion: 0.04, // 4%
  provisionEmpresa: 0.0244, // 2.44%
} as const

export interface ProvisionesPrestaciones {
  cesantias: number
  interesesCesantias: number
  prima: number
  vacaciones: number
  total: number
}

export interface ProvisionesSegSocial {
  pensionEmpresa: number
  cajaCompensacion: number
  provisionEmpresa: number
  total: number
}

export interface CostoNominaData {
  /** Suma de pagonomina.total_liquidado_dia en el rango. */
  totalLiquidado: number
  /** Numero de registros (filas-dia) usados para calcular el total. */
  registros: number
  /** Provisiones de prestaciones sociales calculadas sobre `totalLiquidado`. */
  prestaciones: ProvisionesPrestaciones
  /** Provisiones de seguridad social calculadas sobre `totalLiquidado`. */
  segSocial: ProvisionesSegSocial
  /** Costo total = nomina + prestaciones.total + segSocial.total */
  costoTotal: number
}

interface UseCostoNominaArgs {
  idEmpresa: number | null | undefined
  desde: string
  hasta: string
}

/**
 * Lee `pagonomina` filtrando por empresa y rango (`fecha` es DATE puro,
 * por eso usamos `gte`/`lte` con el dia inclusive sin necesidad de
 * `hastaExclusivo`), suma `total_liquidado_dia` y calcula sobre ese
 * total las provisiones de prestaciones sociales y seguridad social
 * con los porcentajes regulatorios definidos arriba.
 */
export function useCostoNomina({
  idEmpresa,
  desde,
  hasta,
}: UseCostoNominaArgs) {
  const key =
    idEmpresa == null
      ? null
      : (["estado-resultados:nomina", idEmpresa, desde, hasta] as const)

  const { data, error, isLoading, mutate } = useSWR<CostoNominaData>(
    key,
    async () => {
      // -----------------------------------------------------------------
      // Mismo principio que el fix de la tarjeta "Total liquidado del mes"
      // en nominapersonal: el total DEBE corresponder EXACTAMENTE a todas
      // las filas que pasan el filtro. Aqui la query ya filtra por empresa
      // y rango en el servidor, pero Supabase corta a 1000 filas por
      // defecto (PostgREST `max-rows`), asi que para empresas con varios
      // empleados un mes completo puede truncarse silenciosamente y el
      // costo de nomina queda subestimado en el estado de resultados.
      //
      // Solucion: paginar con `.range(...)` en bloques de 1000 hasta que
      // no lleguen mas filas. Asi el `reduce` posterior trabaja sobre el
      // 100% del dataset filtrado, igual que en nomina personal.
      // -----------------------------------------------------------------
      const PAGE_SIZE = 1000
      const allRows: Array<{ total_liquidado_dia: number | null }> = []
      let offset = 0
      // Tope defensivo: ~50k filas-dia por periodo es mas que suficiente
      // y evita un loop infinito si algo raro pasa con el conteo.
      const MAX_ROWS = 50_000

      while (offset < MAX_ROWS) {
        // Filtramos por `idempresaliquidacion` (empresa contratante de la
        // liquidacion), igual que la pestana "Ver Liquidacion" del modulo
        // Nominapersonal. Asi la tarjeta "Total liquidado del mes" y el
        // costo de nomina del estado de resultados muestran exactamente
        // el mismo total para una misma empresa y periodo.
        const { data: page, error: pageError } = await supabase
          .from("pagonomina")
          .select("total_liquidado_dia")
          .eq("idempresaliquidacion", idEmpresa as number)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .range(offset, offset + PAGE_SIZE - 1)

        if (pageError) throw pageError
        if (!page || page.length === 0) break

        allRows.push(...page)
        if (page.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }

      const totalLiquidado = allRows.reduce(
        (acc, r: any) => acc + (Number(r.total_liquidado_dia) || 0),
        0,
      )

      // --- Provisiones de prestaciones sociales --------------------
      const cesantias = totalLiquidado * PROVISIONES_PRESTACIONES.cesantias
      const interesesCesantias =
        totalLiquidado * PROVISIONES_PRESTACIONES.interesesCesantias
      const prima = totalLiquidado * PROVISIONES_PRESTACIONES.prima
      const vacaciones = totalLiquidado * PROVISIONES_PRESTACIONES.vacaciones
      const totalPrestaciones =
        cesantias + interesesCesantias + prima + vacaciones

      // --- Provisiones de seguridad social -------------------------
      // `saludEmpleado` (8.5%) y `pensionEmpleado` (12%) se removieron
      // por solicitud del negocio: no se reflejan aqui dentro del P&L.
      const pensionEmpresa =
        totalLiquidado * PROVISIONES_SEG_SOCIAL.pensionEmpresa
      const cajaCompensacion =
        totalLiquidado * PROVISIONES_SEG_SOCIAL.cajaCompensacion
      const provisionEmpresa =
        totalLiquidado * PROVISIONES_SEG_SOCIAL.provisionEmpresa
      const totalSegSocial =
        pensionEmpresa + cajaCompensacion + provisionEmpresa

      const costoTotal = totalLiquidado + totalPrestaciones + totalSegSocial

      return {
        totalLiquidado,
        registros: allRows.length,
        prestaciones: {
          cesantias,
          interesesCesantias,
          prima,
          vacaciones,
          total: totalPrestaciones,
        },
        segSocial: {
          pensionEmpresa,
          cajaCompensacion,
          provisionEmpresa,
          total: totalSegSocial,
        },
        costoTotal,
      }
    },
    {
      // Mantenemos los datos previos visibles mientras llega la nueva
      // peticion para evitar flicker entre quincenas.
      keepPreviousData: true,
      revalidateOnFocus: false,
    },
  )

  return { data, error, isLoading, mutate }
}
