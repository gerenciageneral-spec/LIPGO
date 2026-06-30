"use server"

import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type {
  Autoevaluacion,
  AuditoriaData,
  AuditoriaEstandarRow,
  CicloResumen,
  EstadoCumple,
  EstandarItem,
  MatrizData,
  Respuesta,
} from "@/lib/sst-types"

async function resolveEmpresaId(empresaIdFromClient?: number | null): Promise<number | null> {
  if (empresaIdFromClient && !Number.isNaN(empresaIdFromClient)) return empresaIdFromClient
  return await getCurrentEmpresaIdForInsert()
}

// ---------------------------------------------------------------------------
// Selector de autoevaluacion: trae la del anio pedido (o la mas reciente).
// ---------------------------------------------------------------------------
async function getAutoevaluacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: number,
  anio?: number | null,
): Promise<{ autoevaluacion: Autoevaluacion | null; aniosDisponibles: number[] }> {
  // Lista de anios disponibles para el selector.
  const { data: anios } = await supabase
    .from("sst_autoevaluaciones")
    .select("anio")
    .eq("idempresa", empresaId)
    .order("anio", { ascending: false })

  const aniosDisponibles = Array.from(new Set((anios ?? []).map((a: any) => a.anio as number)))

  let query = supabase.from("sst_autoevaluaciones").select("*").eq("idempresa", empresaId)
  if (anio) query = query.eq("anio", anio)
  const { data, error } = await query.order("anio", { ascending: false }).limit(1).maybeSingle()

  if (error) {
    console.error("[v0] Error fetching autoevaluacion:", error.message)
    return { autoevaluacion: null, aniosDisponibles }
  }
  return { autoevaluacion: (data as Autoevaluacion) ?? null, aniosDisponibles }
}

async function getPorCiclo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  autoevalId: number,
): Promise<CicloResumen[]> {
  const { data, error } = await supabase
    .from("v_sst_autoeval_por_ciclo")
    .select("*")
    .eq("autoevaluacion_id", autoevalId)
  if (error) {
    console.error("[v0] Error fetching por ciclo:", error.message)
    return []
  }
  return (data ?? []) as CicloResumen[]
}

// ---------------------------------------------------------------------------
// P01 — Matriz de los 60 estandares minimos
// ---------------------------------------------------------------------------
export async function getMatrizEstandares(
  empresaIdFromClient?: number | null,
  anio?: number | null,
): Promise<MatrizData> {
  const empty: MatrizData = {
    autoevaluacion: null,
    items: [],
    respuestas: [],
    porCiclo: [],
    aniosDisponibles: [],
  }
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  if (!empresaId) return empty

  // Catalogo fijo de 60 items (no depende de empresa).
  const { data: items, error: itemsError } = await supabase
    .from("sst_estandar_items")
    .select("*")
    .order("numeral", { ascending: true })
  if (itemsError) {
    console.error("[v0] Error fetching estandar items:", itemsError.message)
    return empty
  }

  const { autoevaluacion, aniosDisponibles } = await getAutoevaluacion(supabase, empresaId, anio)

  let respuestas: Respuesta[] = []
  let porCiclo: CicloResumen[] = []
  if (autoevaluacion) {
    const { data: resp } = await supabase
      .from("sst_autoeval_respuestas")
      .select("*")
      .eq("autoevaluacion_id", autoevaluacion.id)
    respuestas = (resp ?? []) as Respuesta[]
    porCiclo = await getPorCiclo(supabase, autoevaluacion.id)
  }

  return {
    autoevaluacion,
    items: (items ?? []) as EstandarItem[],
    respuestas,
    porCiclo,
    aniosDisponibles,
  }
}

// Guarda (upsert) la respuesta de un item y recalcula la autoevaluacion.
export async function guardarRespuesta(input: {
  autoevaluacion_id: number
  item_id: number
  cumple: EstadoCumple
  peso: number
  observacion?: string | null
  soporte_url?: string | null
}): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  // Art. 27: "cumple" y "no_aplica" suman el peso; "no_cumple" suma 0.
  const puntaje = input.cumple === "no_cumple" ? 0 : input.peso

  const { error } = await supabase.from("sst_autoeval_respuestas").upsert(
    {
      autoevaluacion_id: input.autoevaluacion_id,
      item_id: input.item_id,
      cumple: input.cumple,
      puntaje_obtenido: puntaje,
      observacion: input.observacion ?? null,
      soporte_url: input.soporte_url ?? null,
    },
    { onConflict: "autoevaluacion_id,item_id" },
  )
  if (error) {
    console.error("[v0] Error upserting respuesta:", error.message)
    return { success: false, message: error.message }
  }

  // Recalcular puntaje, PHVA y valoracion via RPC.
  const { error: rpcError } = await supabase.rpc("sst_recalcular_autoevaluacion", {
    p_autoeval_id: input.autoevaluacion_id,
  })
  if (rpcError) {
    console.error("[v0] Error recalculando autoevaluacion:", rpcError.message)
  }
  return { success: true }
}

// ---------------------------------------------------------------------------
// P04 — Dashboard de auditoria 0312 (estandar <-> evidencia)
// ---------------------------------------------------------------------------
export async function getAuditoria0312(
  empresaIdFromClient?: number | null,
  anio?: number | null,
): Promise<AuditoriaData> {
  const empty: AuditoriaData = {
    autoevaluacion: null,
    porCiclo: [],
    estandares: [],
    evidencia: {},
    aniosDisponibles: [],
  }
  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  if (!empresaId) return empty

  const { autoevaluacion, aniosDisponibles } = await getAutoevaluacion(supabase, empresaId, anio)
  if (!autoevaluacion) return { ...empty, aniosDisponibles }

  const porCiclo = await getPorCiclo(supabase, autoevaluacion.id)

  const { data: estData, error: estError } = await supabase
    .from("v_sst_auditoria_estandar")
    .select("*")
    .eq("autoevaluacion_id", autoevaluacion.id)
    .order("numeral", { ascending: true })
  if (estError) {
    console.error("[v0] Error fetching auditoria estandar:", estError.message)
  }
  const estandares = (estData ?? []) as AuditoriaEstandarRow[]

  // Mapa de evidencia: conteo de registros vivos por tabla de soporte.
  const tablas = Array.from(
    new Set(estandares.map((e) => e.tabla).filter((t): t is string => !!t)),
  )
  const evidencia: Record<string, number> = {}
  await Promise.all(
    tablas.map(async (tabla) => {
      try {
        const { count, error } = await supabase
          .from(tabla)
          .select("*", { count: "exact", head: true })
          .eq("idempresa", empresaId)
        evidencia[tabla] = error ? 0 : count ?? 0
      } catch {
        evidencia[tabla] = 0
      }
    }),
  )

  return { autoevaluacion, porCiclo, estandares, evidencia, aniosDisponibles }
}
