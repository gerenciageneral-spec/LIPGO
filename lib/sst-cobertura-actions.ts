"use server"

// Cobertura de los datos de SST contra el head count: de la gente ACTIVA,
// quién tiene su ficha MEDEVAC y su Perfil Sociodemográfico, y quién no.
//
// Vive en su propio archivo porque la consultan DOS módulos —MEDEVAC y Perfil
// Sociodemográfico—, cada uno mostrando su parte. Si cada uno la calculara por
// su lado, con el tiempo terminarían discrepando sobre quién está completo, y
// entonces la pregunta de auditoría —"¿todos los trabajadores tienen sus datos
// de SST?"— tendría dos respuestas distintas según por dónde se mire.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { CENTRO_POR_EMPRESA } from "@/lib/sst-datos-catalogos"

export interface FilaCobertura {
  identificacion: string
  nombre: string
  cargo: string | null
  centroTrabajo: string | null
  tieneMedevac: boolean
  medevacCompleto: boolean
  tienePerfil: boolean
  perfilCompleto: boolean
}

export interface CoberturaSST {
  /** false cuando la vista todavía no existe: sirve para distinguir "no hay
   *  nadie" de "falta correr el script", que en pantalla se ven igual. */
  disponible: boolean
  filas: FilaCobertura[]
}

/**
 * Personal ACTIVO del head count con el estado de sus dos formatos de SST.
 *
 * Devuelve las filas SIN sumar. Los indicadores los calcula cada módulo sobre
 * lo que quede filtrado: si se sumaran aquí, al filtrar por un centro de
 * trabajo los números seguirían mostrando el total de la empresa y no
 * cuadrarían con la tabla que se está viendo.
 *
 * Lee la vista vw_sst_datos_colaborador (scripts/sig/44_...).
 */
export async function getCoberturaSST(): Promise<CoberturaSST> {
  const supabase: any = await getSupabaseAdmin()
  const { data, error } = await supabase
    .from("vw_sst_datos_colaborador")
    .select(
      "identificacion, nombre, cargo_headcount, idempresa, centro_trabajo, estado, tiene_medevac, tiene_perfil, medevac_completo, perfil_completo",
    )
  if (error) {
    console.error("[v0] getCoberturaSST:", error.message, error.code, error.details, error.hint)
    return { disponible: false, filas: [] }
  }

  const filas: FilaCobertura[] = (data ?? [])
    .filter((r: any) => String(r.estado ?? "").trim().toLowerCase() === "activo")
    .map((r: any) => ({
      identificacion: r.identificacion ?? "",
      nombre: r.nombre ?? "",
      cargo: r.cargo_headcount ?? null,
      // El centro sale de la ficha MEDEVAC; quien no la tiene se ubica por el
      // proyecto al que está asignado en el head count, que es justo a quien
      // hay que ir a buscar.
      centroTrabajo: r.centro_trabajo ?? CENTRO_POR_EMPRESA[Number(r.idempresa)] ?? null,
      tieneMedevac: !!r.tiene_medevac,
      medevacCompleto: !!r.medevac_completo,
      tienePerfil: !!r.tiene_perfil,
      perfilCompleto: !!r.perfil_completo,
    }))
    .sort((a: FilaCobertura, b: FilaCobertura) => a.nombre.localeCompare(b.nombre, "es"))

  return { disponible: true, filas }
}
