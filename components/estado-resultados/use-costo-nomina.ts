"use client"

import useSWR from "swr"
import { supabase } from "@/lib/supabase-client"

// El 15 y el ultimo dia del mes son el dia de cierre de su quincena (desde el
// piso 2026-08-15): ese dia se paga el "dia pleno" y su excedente de destajo
// NO entra al bono de ESA quincena -- queda diferido a la SIGUIENTE via
// Ajuste Nomina Anterior. MISMO criterio, MISMA fecha de piso, que
// `agrupado_quincena.total_bono_nomina` en scripts/archivoplano_reemplazo.sql
// y que `esDiaCierre` en lib/revision-nomina-actions.ts -- si se toca uno,
// tocar los tres.
const PISO_EXCLUSION_DIA_CIERRE = "2026-08-15"
function esDiaCierre(fechaISO: string): boolean {
  if (fechaISO < PISO_EXCLUSION_DIA_CIERRE) return false
  const d = new Date(fechaISO + "T12:00:00Z")
  const dia = d.getUTCDate()
  if (dia === 15) return true
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  return dia === ultimo
}

/** Llave de bucket quincena, formato "yyyy-mmQ1"/"yyyy-mmQ2" -- MISMO formato
 * que ya usaba `excBucket` de este archivo (persona + este sufijo). */
function bucketQuincena(anio: number, mes: number, quincena: 1 | 2): string {
  return `${anio}-${String(mes).padStart(2, "0")}Q${quincena}`
}

/** Todas las quincenas (anio, mes, quincena) cubiertas por [desde, hasta] --
 * `getPeriodoRango` SIEMPRE alinea el rango a fronteras de quincena (1-15,
 * 16-fin), así que basta recorrer mes a mes entre las dos fechas. */
function quincenasEnRango(desde: string, hasta: string): Array<{ anio: number; mes: number; quincena: 1 | 2 }> {
  const out: Array<{ anio: number; mes: number; quincena: 1 | 2 }> = []
  const [ay, am] = desde.slice(0, 7).split("-").map(Number)
  const [by, bm] = hasta.slice(0, 7).split("-").map(Number)
  const diaDesde = Number(desde.slice(8, 10))
  const diaHasta = Number(hasta.slice(8, 10))
  let y = ay
  let m = am
  while (y < by || (y === by && m <= bm)) {
    const esPrimerMes = y === ay && m === am
    const esUltimoMes = y === by && m === bm
    const incluyeQ1 = !esPrimerMes || diaDesde <= 15
    const incluyeQ2 = !esUltimoMes || diaHasta > 15
    if (incluyeQ1) out.push({ anio: y, mes: m, quincena: 1 })
    if (incluyeQ2) out.push({ anio: y, mes: m, quincena: 2 })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

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
  /** Proyectos del alcance: uno solo, o todos los accesibles ("Todos LIP"). */
  ids: number[]
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
  ids,
  desde,
  hasta,
}: UseCostoNominaArgs) {
  const key =
    ids.length === 0
      ? null
      : (["estado-resultados:nomina", ids.join(","), desde, hasta] as const)

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
      const allRows: Array<{
        persona: string | null
        fecha: string | null
        bonif_prestacional: number | null
        total_liquidado_dia: number | null
      }> = []
      let offset = 0
      // Tope defensivo contra loops infinitos. Con el alcance "Todos los
      // proyectos" + "Todo el anio" pueden ser ~150k filas-dia (4 proyectos
      // x ~100 personas x 365 dias), asi que 300k da margen de sobra.
      const MAX_ROWS = 300_000

      while (offset < MAX_ROWS) {
        // Filtramos por `idempresaliquidacion` (empresa contratante de la
        // liquidacion), igual que la pestana "Ver Liquidacion" del modulo
        // Nominapersonal. Asi la tarjeta "Total liquidado del mes" y el
        // costo de nomina del estado de resultados muestran exactamente
        // el mismo total para una misma empresa y periodo.
        const { data: page, error: pageError } = await supabase
          .from("pagonomina")
          .select("persona, fecha, bonif_prestacional, total_liquidado_dia")
          .in("idempresaliquidacion", ids)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .range(offset, offset + PAGE_SIZE - 1)

        if (pageError) throw pageError
        if (!page || page.length === 0) break

        allRows.push(...page)
        if (page.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }

      // Base diaria liquidada (cada dia trabajado = su base, nuevo modelo).
      const totalBase = allRows.reduce(
        (acc, r: any) => acc + (Number(r.total_liquidado_dia) || 0),
        0,
      )
      // Bono de productividad = excedente de destajo NETO por (persona, quincena),
      // piso 0 y todo prestacional. Se netea por bucket para no perder los dias bajos
      // ni inflar los altos — mismo criterio que parafiscales y el archivo plano.
      //
      // SOLO DESDE LA QUINCENA DEL 16-JUL-2026: el modelo base+bono arranco
      // ahi (confirmado en el archivo plano: la 1ra quincena de julio siguio
      // con la formula vieja). Antes de esa fecha la columna trae el
      // excedente historico (formula legacy) pero NO se pago como bono:
      // sumarlo inflaria el costo de los meses/quincenas viejas con plata
      // que nunca salio.
      const BONO_DESDE = "2026-07-16"
      const excBucket = new Map<string, number>()
      for (const r of allRows) {
        const f = String((r as any).fecha || "")
        if (f.length < 10 || f.slice(0, 10) < BONO_DESDE) continue
        // EXCLUIR EL DIA DE CIERRE (15 o ultimo del mes, desde el piso
        // 2026-08-15): ese dia ya se pago a dia pleno, y su excedente NO
        // entra al bono de ESTA quincena -- queda diferido a la siguiente y
        // se recupera mas abajo via `ajustes_proyeccion` (Ajuste Nomina
        // Anterior). Sin esto, este bucket contaba esa plata en la quincena
        // equivocada.
        if (esDiaCierre(f.slice(0, 10))) continue
        const q = Number(f.slice(8, 10)) <= 15 ? 1 : 2
        const key = String((r as any).persona || "") + "|" + bucketQuincena(Number(f.slice(0, 4)), Number(f.slice(5, 7)), q)
        excBucket.set(key, (excBucket.get(key) || 0) + (Number((r as any).bonif_prestacional) || 0))
      }

      // Ajuste Nomina Anterior APROBADO que aplica a alguna quincena cubierta
      // por [desde, hasta] -- MISMO mecanismo que `ajustes_aplicables` en
      // archivoplano_reemplazo.sql: el excedente del dia de cierre que se
      // excluyo arriba reaparece aqui, sumado al bucket de la quincena
      // SIGUIENTE (positivo o negativo, antes del piso $0 por bucket).
      const periodosEnRango = new Set(
        quincenasEnRango(desde, hasta).map((p) => bucketQuincena(p.anio, p.mes, p.quincena)),
      )
      if (periodosEnRango.size > 0) {
        const { data: ajustes, error: ajustesError } = await supabase
          .from("ajustes_proyeccion")
          .select("persona, idempresa, valor_ajuste, anio_aplica, mes_aplica, quincena_aplica")
          .eq("estado", "aprobado")
          .in("idempresa", ids)
        if (ajustesError) throw ajustesError
        for (const a of ajustes || []) {
          const periodo = bucketQuincena(Number((a as any).anio_aplica), Number((a as any).mes_aplica), Number((a as any).quincena_aplica) as 1 | 2)
          if (!periodosEnRango.has(periodo)) continue
          const key = String((a as any).persona || "") + "|" + periodo
          excBucket.set(key, (excBucket.get(key) || 0) + (Number((a as any).valor_ajuste) || 0))
        }
      }

      let totalBono = 0
      for (const v of excBucket.values()) totalBono += Math.max(0, v)
      // Costo real de nomina del periodo = base garantizada + bono neto de destajo.
      const totalLiquidado = totalBase + totalBono

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
