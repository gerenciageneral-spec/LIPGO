"use server"

// Server actions del Sistema Integrado de Gestion (SIG).
// Lee/escribe la matriz integrada (sig_normas, sig_requisitos,
// sig_requisito_norma) y la cobertura documental (sig_documento_cobertura),
// que se apoya en el repositorio existente soportes_documentales.
//
// Convenciones LIP: createClient de @/lib/supabase-client; empresa via
// getCurrentEmpresaIdForInsert/resolveEmpresaId (nunca LIP=0); lectura en
// pasos sin joins embebidos de PostgREST (como en soportes-actions).

// Usamos el cliente admin (service role) porque las tablas sig_* tienen RLS
// y el rol anon no puede leerlas; la autorizacion del modulo ya se controla
// con los permisos (sig_matriz / sig_iso*). Mismo patron que permissions-actions.
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getResumenISO, type EstadoISO } from "@/lib/iso9001-actions"
import { getMatrizEstandares } from "@/lib/sst-auditoria-actions"
import type {
  SigNorma,
  SigRequisito,
  SigRequisitoNorma,
  SigCobertura,
  SigCeldaNorma,
  SigMatrizRow,
  SigAvanceNorma,
  SigEstadoCobertura,
  SigObjetivoCobertura,
  SigDocumento,
  SigDocVersion,
  SigTipoCambio,
  SigAspectoAmbiental,
  SigObjetivo,
  SigRequisitoLegal,
  SigDofa,
  SigProceso,
  SigNcCatalogo,
  SigNoConformidad,
  SigIndicador,
  SigIndicadorValor,
  SigProcesoInteraccion,
  SigInventarioCuadre,
  SigInventarioCuadreDetalle,
  SigInventarioAjuste,
  SigInventarioCierreMes,
  SigSatisfaccion,
  SigPQRSF,
  SigTipoMovimiento,
} from "@/lib/sig-types"
import { SIG_EMPRESA_LIP, SIG_CLIENTES_LIP } from "@/lib/sig-types"
import { getMetaDiaForEmpresa } from "@/lib/empresa-meta-dia"
import { getSlaCargueMin, PLANTA_ACORDADA } from "@/lib/sla-acordados"

// Mapea el estado del Centro de Evidencia ISO 9001 al estado de la matriz SIG.
function isoEstadoASig(e: EstadoISO): SigEstadoCobertura {
  if (e === "cumple") return "aprobado"
  if (e === "parcial" || e === "documental") return "cargado"
  return "pendiente"
}

// El SIG es ÚNICO de LIP: TODA su data vive bajo el alcance LIP (SIG_EMPRESA_LIP),
// independiente del cliente seleccionado en la app. El parámetro fromClient se
// mantiene por compatibilidad de firma pero se ignora a propósito. El cliente/sitio
// donde ocurre una NC (o se mide un indicador) se etiqueta aparte con proyecto_id.
async function resolveEmpresaId(_fromClient?: number | null): Promise<number> {
  return SIG_EMPRESA_LIP
}

// Estado agregado de una celda (requisito x norma) a partir de sus coberturas.
function estadoAgregado(aplica: boolean, coberturas: SigCobertura[]): SigEstadoCobertura {
  if (!aplica) return "no_aplica"
  if (coberturas.some((c) => c.estado === "aprobado")) return "aprobado"
  if (coberturas.some((c) => c.estado === "cargado" || !!c.soporte_id)) return "cargado"
  if (coberturas.some((c) => c.estado === "no_aplica")) return "no_aplica"
  return "pendiente"
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export async function getNormas(): Promise<{ success: boolean; data: SigNorma[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("sig_normas")
      .select("id, codigo, nombre, descripcion, color, orden, activo")
      .eq("activo", true)
      .order("orden", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigNorma[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

/**
 * Trae las 4 tablas base y arma la matriz integrada general en memoria:
 * un numeral por fila con una celda por norma (texto + aplica + coberturas).
 */
export async function getMatrizIntegrada(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; normas: SigNorma[]; rows: SigMatrizRow[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    if (!empresaId) return { success: false, normas: [], rows: [], error: "No se pudo resolver la empresa." }

    const [normasRes, reqRes, rnRes, covRes] = await Promise.all([
      supabase
        .from("sig_normas")
        .select("id, codigo, nombre, descripcion, color, orden, activo")
        .eq("activo", true)
        .order("orden", { ascending: true }),
      supabase
        .from("sig_requisitos")
        .select("id, numeral, tema, es_comun, evidencia_comun_sugerida, orden, activo")
        .eq("activo", true)
        .order("orden", { ascending: true }),
      supabase.from("sig_requisito_norma").select("id, requisito_id, norma_id, texto, aplica"),
      supabase
        // "*" para tolerar que la columna documento_id aun no exista (script 04
        // opcional): si falta, simplemente no viene y la enriquecemos como null.
        .from("sig_documento_cobertura")
        .select("*")
        .eq("idempresa", empresaId),
    ])

    const firstErr = normasRes.error || reqRes.error || rnRes.error || covRes.error
    if (firstErr) return { success: false, normas: [], rows: [], error: firstErr.message }

    const normas = (normasRes.data ?? []) as SigNorma[]
    const requisitos = (reqRes.data ?? []) as SigRequisito[]
    const rn = (rnRes.data ?? []) as SigRequisitoNorma[]
    const cov = (covRes.data ?? []) as SigCobertura[]

    // Enriquecer coberturas con el documento real (sig_documentos). La referencia
    // al documento se guarda en `observacion` con prefijo "doc:<uuid>" para no
    // depender de un cambio de tipo de columna (documento_id quedo como bigint en
    // la BD y sig_documentos.id es uuid). Ver vincularDocumentoAObjetivos.
    const parseDocRef = (obs: string | null): string | null =>
      obs && obs.startsWith("doc:") ? obs.slice(4) : null
    const docIds = Array.from(new Set(cov.map((c) => parseDocRef(c.observacion)).filter((v): v is string => !!v)))
    if (docIds.length > 0) {
      const { data: docs } = await supabase
        .from("sig_documentos")
        .select("id, codigo, nombre, tipo, proceso, version, estado, soporte")
        .in("id", docIds)
      const docMap = new Map<string, SigDocumento>()
      for (const d of (docs ?? []) as SigDocumento[]) docMap.set(d.id, d)
      for (const c of cov) {
        const did = parseDocRef(c.observacion)
        c.documento_id = did
        c.documento = did ? docMap.get(did) ?? null : null
      }
    }

    // Cableado ISO 9001: traemos el Centro de Evidencia (iso_clausulas con
    // estado auto+manual) y lo indexamos por numeral. Si falla, la columna
    // ISO 9001 simplemente cae a cobertura propia (degradacion suave).
    const isoPorNumeral = new Map<string, { estado: EstadoISO; valor: string | null }>()
    try {
      const resumen = await getResumenISO()
      for (const c of resumen.clausulas) {
        if (c.numero) isoPorNumeral.set(String(c.numero).trim(), { estado: c.estado, valor: c.valor })
        if (c.codigo_sig) isoPorNumeral.set(String(c.codigo_sig).trim(), { estado: c.estado, valor: c.valor })
      }
    } catch (e) {
      console.error("[v0] getMatrizIntegrada: no se pudo leer ISO 9001:", (e as any)?.message)
    }
    const normaIso9001Id = normas.find((n) => n.codigo === "ISO9001")?.id ?? null

    // Indices para armar en O(n).
    const rnByReqNorma = new Map<string, SigRequisitoNorma>()
    for (const r of rn) rnByReqNorma.set(`${r.requisito_id}:${r.norma_id}`, r)
    const covByReqNorma = new Map<string, SigCobertura[]>()
    for (const c of cov) {
      const k = `${c.requisito_id}:${c.norma_id}`
      const arr = covByReqNorma.get(k) ?? []
      arr.push(c)
      covByReqNorma.set(k, arr)
    }

    const rows: SigMatrizRow[] = requisitos.map((req) => {
      const celdas: SigCeldaNorma[] = normas.map((n) => {
        const detalle = rnByReqNorma.get(`${req.id}:${n.id}`)
        const aplica = detalle ? detalle.aplica : false
        const coberturas = covByReqNorma.get(`${req.id}:${n.id}`) ?? []

        // Si es la columna ISO 9001 y existe la clausula en el Centro de
        // Evidencia para este numeral, el estado proviene de alli (real).
        const iso = n.id === normaIso9001Id ? isoPorNumeral.get(req.numeral.trim()) : undefined
        if (iso && aplica) {
          return {
            norma_id: n.id,
            codigo: n.codigo,
            texto: detalle?.texto ?? null,
            aplica,
            coberturas,
            estado: isoEstadoASig(iso.estado),
            fuente: "iso9001" as const,
            valorFuente: iso.valor,
          }
        }

        return {
          norma_id: n.id,
          codigo: n.codigo,
          texto: detalle?.texto ?? null,
          aplica,
          coberturas,
          estado: estadoAgregado(aplica, coberturas),
          fuente: "matriz" as const,
        }
      })
      return { requisito: req, celdas }
    })

    return { success: true, normas, rows }
  } catch (err: any) {
    return { success: false, normas: [], rows: [], error: err?.message || "Error desconocido" }
  }
}

/**
 * Vista de una sola norma (por codigo): solo numerales que aplican, con su
 * texto, estado y coberturas. Para las pestanas individuales del modulo.
 */
export async function getRequisitosPorNorma(
  codigo: string,
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; norma: SigNorma | null; rows: SigMatrizRow[]; error?: string }> {
  try {
    const full = await getMatrizIntegrada(empresaIdFromClient)
    if (!full.success) return { success: false, norma: null, rows: [], error: full.error }
    const norma = full.normas.find((n) => n.codigo === codigo) ?? null
    if (!norma) return { success: false, norma: null, rows: [], error: `Norma ${codigo} no encontrada` }
    const rows = full.rows
      .map((r) => ({ requisito: r.requisito, celdas: r.celdas.filter((c) => c.norma_id === norma.id) }))
      .filter((r) => r.celdas.length > 0 && r.celdas[0].aplica)
    return { success: true, norma, rows }
  } catch (err: any) {
    return { success: false, norma: null, rows: [], error: err?.message || "Error desconocido" }
  }
}

/** Resumen de avance por norma (para el tablero del auditor). */
export async function getAvancePorNorma(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; data: SigAvanceNorma[]; error?: string }> {
  try {
    const full = await getMatrizIntegrada(empresaIdFromClient)
    if (!full.success) return { success: false, data: [], error: full.error }

    const data: SigAvanceNorma[] = full.normas.map((n) => {
      let total = 0
      let cargados = 0
      let aprobados = 0
      for (const row of full.rows) {
        const celda = row.celdas.find((c) => c.norma_id === n.id)
        if (!celda || !celda.aplica) continue
        total += 1
        if (celda.estado === "aprobado") {
          aprobados += 1
          cargados += 1
        } else if (celda.estado === "cargado") {
          cargados += 1
        }
      }
      return {
        norma_id: n.id,
        codigo: n.codigo,
        nombre: n.nombre,
        color: n.color,
        total_aplica: total,
        cargados,
        aprobados,
        pct: total > 0 ? Math.round((aprobados / total) * 100) : 0,
      }
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

/**
 * Inserta o actualiza una cobertura (requisito x norma) para la empresa.
 * Clave natural: (idempresa, requisito_id, norma_id, soporte_id).
 */
export async function upsertCobertura(
  payload: {
    requisitoId: number
    normaId: number
    soporteId?: number | null
    estado?: SigEstadoCobertura
    observacion?: string | null
    actualizadoPor?: string | null
  },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const { requisitoId, normaId } = payload
    if (!requisitoId || !normaId) return { success: false, error: "requisito y norma son obligatorios" }
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    if (!empresaId) return { success: false, error: "No se pudo resolver la empresa." }

    const supabase: any = await getSupabaseAdmin()
    const row = {
      idempresa: empresaId,
      requisito_id: requisitoId,
      norma_id: normaId,
      soporte_id: payload.soporteId ?? null,
      estado: payload.estado ?? (payload.soporteId ? "cargado" : "pendiente"),
      observacion: payload.observacion ?? null,
      actualizado_por: payload.actualizadoPor ?? null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from("sig_documento_cobertura")
      .upsert(row, { onConflict: "idempresa,requisito_id,norma_id,soporte_id" })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/**
 * Vincula UN soporte ya existente (soportes_documentales.id) a VARIOS pares
 * (requisito, norma) de una sola vez: este es el corazon del "documento
 * compartido" entre normas del SIG.
 */
export async function vincularSoporteAObjetivos(
  soporteId: number,
  objetivos: SigObjetivoCobertura[],
  opts?: { estado?: SigEstadoCobertura; observacion?: string | null; actualizadoPor?: string | null },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; insertados: number; error?: string }> {
  try {
    if (!soporteId) return { success: false, insertados: 0, error: "soporteId requerido" }
    if (!objetivos?.length) return { success: false, insertados: 0, error: "Selecciona al menos un requisito/norma" }
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    if (!empresaId) return { success: false, insertados: 0, error: "No se pudo resolver la empresa." }

    const supabase: any = await getSupabaseAdmin()
    const now = new Date().toISOString()
    const rows = objetivos.map((o) => ({
      idempresa: empresaId,
      requisito_id: o.requisitoId,
      norma_id: o.normaId,
      soporte_id: soporteId,
      estado: opts?.estado ?? "cargado",
      observacion: opts?.observacion ?? null,
      actualizado_por: opts?.actualizadoPor ?? null,
      updated_at: now,
    }))
    const { data, error } = await supabase
      .from("sig_documento_cobertura")
      .upsert(rows, { onConflict: "idempresa,requisito_id,norma_id,soporte_id" })
      .select("id")
    if (error) return { success: false, insertados: 0, error: error.message }
    return { success: true, insertados: (data ?? []).length }
  } catch (err: any) {
    return { success: false, insertados: 0, error: err?.message || "Error desconocido" }
  }
}

/** Cambia el estado de una cobertura (p.ej. aprobar evidencia desde el panel del auditor). */
export async function setEstadoCobertura(
  id: number,
  estado: SigEstadoCobertura,
  actualizadoPor?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: "id requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase
      .from("sig_documento_cobertura")
      .update({ estado, actualizado_por: actualizadoPor ?? null, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/** Elimina una cobertura (no toca el soporte fisico ni el documento maestro). */
export async function eliminarCobertura(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: "id requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_documento_cobertura").delete().eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Documentos del SIG (maestro sig_documentos, 94 reales)
// ---------------------------------------------------------------------------

/** Lista documentos del maestro para el selector (con busqueda opcional). */
export async function getDocumentos(
  filtro?: string,
): Promise<{ success: boolean; data: SigDocumento[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    let query = supabase
      .from("sig_documentos")
      .select("id, codigo, nombre, tipo, proceso, version, estado, soporte")
      .order("codigo", { ascending: true })
    if (filtro && filtro.trim()) {
      const f = filtro.trim().replace(/[%,]/g, "")
      query = query.or(`codigo.ilike.%${f}%,nombre.ilike.%${f}%,proceso.ilike.%${f}%`)
    }
    const { data, error } = await query.limit(500)
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigDocumento[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

/**
 * Vincula un documento del maestro (sig_documentos) a uno o varios pares
 * (requisito, norma): este es el "documento compartido" entre normas del SIG.
 * Usa delete+insert por par para no duplicar el mismo documento en la misma celda.
 */
export async function vincularDocumentoAObjetivos(
  documentoId: string,
  objetivos: SigObjetivoCobertura[],
  opts?: { estado?: SigEstadoCobertura; observacion?: string | null; actualizadoPor?: string | null },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; vinculados: number; error?: string }> {
  try {
    if (!documentoId) return { success: false, vinculados: 0, error: "documentoId requerido" }
    if (!objetivos?.length) return { success: false, vinculados: 0, error: "Selecciona al menos un requisito/norma" }
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    if (!empresaId) return { success: false, vinculados: 0, error: "No se pudo resolver la empresa." }

    const supabase: any = await getSupabaseAdmin()
    const now = new Date().toISOString()
    const ref = `doc:${documentoId}`
    let vinculados = 0
    for (const o of objetivos) {
      // Evita duplicar el mismo documento en el mismo (requisito, norma).
      await supabase
        .from("sig_documento_cobertura")
        .delete()
        .eq("idempresa", empresaId)
        .eq("requisito_id", o.requisitoId)
        .eq("norma_id", o.normaId)
        .eq("observacion", ref)
      const { error } = await supabase.from("sig_documento_cobertura").insert({
        idempresa: empresaId,
        requisito_id: o.requisitoId,
        norma_id: o.normaId,
        soporte_id: null,
        estado: opts?.estado ?? "cargado",
        observacion: ref, // referencia al documento (doc:<uuid>)
        actualizado_por: opts?.actualizadoPor ?? null,
        updated_at: now,
      })
      if (!error) vinculados += 1
    }
    return { success: true, vinculados }
  } catch (err: any) {
    return { success: false, vinculados: 0, error: err?.message || "Error desconocido" }
  }
}

/**
 * Repositorio documental por norma: lista los documentos del maestro
 * (sig_documentos) que estan vinculados a la norma dada (via cobertura),
 * con los numerales que cubre cada uno. Es la vista "que documentos
 * sustentan esta norma" para el auditor.
 */
export async function getDocumentosPorNorma(
  codigo: string,
  empresaIdFromClient?: number | null,
): Promise<{
  success: boolean
  norma: SigNorma | null
  data: { documento: SigDocumento; numerales: string[] }[]
  error?: string
}> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    if (!empresaId) return { success: false, norma: null, data: [], error: "No se pudo resolver la empresa." }

    const { data: norma } = await supabase
      .from("sig_normas")
      .select("id, codigo, nombre, descripcion, color, orden, activo")
      .eq("codigo", codigo)
      .maybeSingle()
    if (!norma) return { success: false, norma: null, data: [], error: `Norma ${codigo} no encontrada` }

    const { data: cov } = await supabase
      .from("sig_documento_cobertura")
      .select("requisito_id, observacion")
      .eq("idempresa", empresaId)
      .eq("norma_id", norma.id)

    const parse = (o: string | null) => (o && o.startsWith("doc:") ? o.slice(4) : null)
    const rows = (cov ?? [])
      .map((c: any) => ({ docId: parse(c.observacion), reqId: c.requisito_id }))
      .filter((r: any) => r.docId)
    if (!rows.length) return { success: true, norma: norma as SigNorma, data: [] }

    const docIds = Array.from(new Set(rows.map((r: any) => r.docId)))
    const reqIds = Array.from(new Set(rows.map((r: any) => r.reqId)))
    const [docsRes, reqsRes] = await Promise.all([
      supabase.from("sig_documentos").select("id, codigo, nombre, tipo, proceso, version, estado, soporte").in("id", docIds),
      supabase.from("sig_requisitos").select("id, numeral").in("id", reqIds),
    ])
    const docMap = new Map<string, SigDocumento>((docsRes.data ?? []).map((d: any) => [d.id, d]))
    const reqMap = new Map<number, string>((reqsRes.data ?? []).map((r: any) => [r.id, r.numeral]))

    const byDoc = new Map<string, { documento: SigDocumento; numerales: Set<string> }>()
    for (const r of rows) {
      const doc = docMap.get(r.docId)
      if (!doc) continue
      const e = byDoc.get(r.docId) ?? { documento: doc, numerales: new Set<string>() }
      const num = reqMap.get(r.reqId)
      if (num) e.numerales.add(num)
      byDoc.set(r.docId, e)
    }
    const data = Array.from(byDoc.values())
      .map((e) => ({ documento: e.documento, numerales: Array.from(e.numerales).sort() }))
      .sort((a, b) => (a.documento.codigo || "").localeCompare(b.documento.codigo || ""))
    return { success: true, norma: norma as SigNorma, data }
  } catch (err: any) {
    return { success: false, norma: null, data: [], error: err?.message || "Error desconocido" }
  }
}

/**
 * Listado Maestro: TODOS los documentos del SIG con las normas y numerales que
 * cubren (según cobertura) y su última versión registrada. Vista global para
 * el auditor (ISO 7.5 — control de la información documentada).
 */
export async function getListadoMaestro(empresaIdFromClient?: number | null): Promise<{
  success: boolean
  data: {
    documento: SigDocumento
    normas: string[]
    numerales: string[]
    ultimaVersion: SigDocVersion | null
  }[]
  error?: string
}> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)

    const [docsRes, normasRes, reqRes, covRes, verRes] = await Promise.all([
      supabase.from("sig_documentos").select("id, codigo, nombre, tipo, proceso, version, estado, soporte"),
      supabase.from("sig_normas").select("id, codigo"),
      supabase.from("sig_requisitos").select("id, numeral"),
      supabase
        .from("sig_documento_cobertura")
        .select("requisito_id, norma_id, observacion")
        .eq("idempresa", empresaId),
      supabase
        .from("sig_documento_versiones")
        .select("*")
        .order("created_at", { ascending: false }),
    ])

    const normaMap = new Map<number, string>((normasRes.data ?? []).map((n: any) => [n.id, n.codigo]))
    const reqMap = new Map<number, string>((reqRes.data ?? []).map((r: any) => [r.id, r.numeral]))
    const parse = (o: string | null) => (o && o.startsWith("doc:") ? o.slice(4) : null)

    // docId -> { normas:Set, numerales:Set }
    const cobByDoc = new Map<string, { normas: Set<string>; numerales: Set<string> }>()
    for (const c of covRes.data ?? []) {
      const did = parse(c.observacion)
      if (!did) continue
      const e = cobByDoc.get(did) ?? { normas: new Set<string>(), numerales: new Set<string>() }
      const nc = normaMap.get(c.norma_id)
      if (nc) e.normas.add(nc)
      const num = reqMap.get(c.requisito_id)
      if (num) e.numerales.add(num)
      cobByDoc.set(did, e)
    }

    // docId -> ultima version (la primera por orden desc)
    const verByDoc = new Map<string, SigDocVersion>()
    for (const v of (verRes.data ?? []) as SigDocVersion[]) {
      if (v.documento_id && !verByDoc.has(v.documento_id)) verByDoc.set(v.documento_id, v)
    }

    const data = ((docsRes.data ?? []) as SigDocumento[])
      .map((d) => {
        const cob = cobByDoc.get(d.id)
        return {
          documento: d,
          normas: cob ? Array.from(cob.normas).sort() : [],
          numerales: cob ? Array.from(cob.numerales).sort() : [],
          ultimaVersion: verByDoc.get(d.id) ?? null,
        }
      })
      .sort((a, b) => (a.documento.codigo || "").localeCompare(b.documento.codigo || ""))

    return { success: true, data }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// ISO 14001 — Aspectos e impactos ambientales (numeral 6.1.2)
// ---------------------------------------------------------------------------

/** Lista la matriz de aspectos e impactos ambientales de la empresa. */
export async function getAspectosAmbientales(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; data: SigAspectoAmbiental[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const { data, error } = await supabase
      .from("sig_aspectos_ambientales")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("activo", true)
      .order("id", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigAspectoAmbiental[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

/** Crea o actualiza un aspecto ambiental. Si trae id → update; si no → insert. */
export async function upsertAspectoAmbiental(
  payload: {
    id?: number
    actividad: string
    aspecto: string
    impacto?: string | null
    tipo_recurso?: string | null
    condicion?: string | null
    cumplimiento_legal?: boolean
    frecuencia?: number
    severidad?: number
    alcance?: number
    significancia?: string
    control?: string | null
    responsable?: string | null
  },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!payload.actividad?.trim() || !payload.aspecto?.trim()) {
      return { success: false, error: "Actividad y aspecto son obligatorios" }
    }
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const fila = {
      actividad: payload.actividad.trim(),
      aspecto: payload.aspecto.trim(),
      impacto: payload.impacto ?? null,
      tipo_recurso: payload.tipo_recurso ?? null,
      condicion: payload.condicion ?? "normal",
      cumplimiento_legal: payload.cumplimiento_legal ?? true,
      frecuencia: payload.frecuencia ?? 3,
      severidad: payload.severidad ?? 3,
      alcance: payload.alcance ?? 3,
      significancia: payload.significancia ?? "no_significativo",
      control: payload.control ?? null,
      responsable: payload.responsable ?? null,
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_aspectos_ambientales").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_aspectos_ambientales")
      .insert({ ...fila, idempresa: empresaId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/**
 * Indicador ambiental de DIGITALIZACIÓN (ahorro de papel) — objetivo ISO 14001
 * (6.2) y diferenciador de LIP: procesos en LIPgo en vez de papel. Cuenta en
 * vivo los registros digitales y estima hojas/resmas/kg de papel ahorrados.
 */
export async function getIndicadorDigitalizacion(): Promise<{
  success: boolean
  registros: number
  hojas: number
  resmas: number
  kg: number
  desglose: { label: string; count: number }[]
  error?: string
}> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const fuentes: { tabla: string; label: string }[] = [
      { tabla: "registroasistencia", label: "Registros de asistencia / turnos" },
      { tabla: "registrosanitario", label: "Registros sanitarios" },
      { tabla: "solicitudes_trabajadores", label: "Solicitudes (certificados, anticipos, permisos)" },
      { tabla: "capacitaciones_evaluacion_intentos", label: "Evaluaciones de capacitación" },
      { tabla: "capacitaciones", label: "Capacitaciones" },
      { tabla: "sig_documentos", label: "Documentos del SIG controlados digitalmente" },
    ]
    const desglose: { label: string; count: number }[] = []
    for (const f of fuentes) {
      const { count, error } = await supabase.from(f.tabla).select("*", { count: "exact", head: true })
      if (!error) desglose.push({ label: f.label, count: count ?? 0 })
    }
    const registros = desglose.reduce((s, d) => s + d.count, 0)
    const hojas = registros // 1 hoja por registro (estimación conservadora)
    const resmas = Math.round(hojas / 500)
    const kg = Math.round((hojas * 5) / 1000) // ~5 g por hoja A4
    return { success: true, registros, hojas, resmas, kg, desglose }
  } catch (err: any) {
    return { success: false, registros: 0, hojas: 0, resmas: 0, kg: 0, desglose: [], error: err?.message || "Error" }
  }
}

// ---------------------------------------------------------------------------
// Análisis de Contexto / DOFA (sig_contexto_dofa, numeral 4.1)
// ---------------------------------------------------------------------------

export async function getContextoDofa(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; data: SigDofa[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const { data, error } = await supabase
      .from("sig_contexto_dofa")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("activo", true)
      .order("cuadrante", { ascending: true })
      .order("orden", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigDofa[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function upsertDofa(
  payload: { id?: number; cuadrante: string; origen?: string | null; descripcion: string; orden?: number },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!payload.descripcion?.trim()) return { success: false, error: "La descripción es obligatoria" }
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const externo = payload.cuadrante === "oportunidad" || payload.cuadrante === "amenaza"
    const fila = {
      cuadrante: payload.cuadrante,
      origen: payload.origen ?? (externo ? "externo" : "interno"),
      descripcion: payload.descripcion.trim(),
      orden: payload.orden ?? 99,
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_contexto_dofa").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_contexto_dofa")
      .insert({ ...fila, idempresa: empresaId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarDofa(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: "id requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_contexto_dofa").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Matriz Legal (sig_requisitos_legales, numeral 6.1.3)
// ---------------------------------------------------------------------------

export async function getRequisitosLegales(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; data: SigRequisitoLegal[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const { data, error } = await supabase
      .from("sig_requisitos_legales")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("activo", true)
      .order("id", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigRequisitoLegal[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function upsertRequisitoLegal(
  payload: {
    id?: number
    norma_codigo?: string
    tipo_norma?: string | null
    identificacion: string
    titulo?: string | null
    requisito?: string | null
    como_cumple?: string | null
    cumple?: string
    responsable?: string | null
  },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!payload.identificacion?.trim()) return { success: false, error: "La identificación de la norma es obligatoria" }
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const fila = {
      norma_codigo: payload.norma_codigo ?? "ISO14001",
      tipo_norma: payload.tipo_norma ?? null,
      identificacion: payload.identificacion.trim(),
      titulo: payload.titulo ?? null,
      requisito: payload.requisito ?? null,
      como_cumple: payload.como_cumple ?? null,
      cumple: payload.cumple ?? "cumple",
      responsable: payload.responsable ?? null,
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_requisitos_legales").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_requisitos_legales")
      .insert({ ...fila, idempresa: empresaId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarRequisitoLegal(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: "id requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_requisitos_legales").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Objetivos y Metas del SIG (sig_objetivos, numeral 6.2)
// ---------------------------------------------------------------------------

export async function getObjetivos(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; data: SigObjetivo[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const { data, error } = await supabase
      .from("sig_objetivos")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("activo", true)
      .order("id", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigObjetivo[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function upsertObjetivo(
  payload: {
    id?: number
    norma_codigo: string
    objetivo: string
    meta?: string | null
    indicador?: string | null
    unidad?: string | null
    linea_base?: string | null
    valor_actual?: string | null
    responsable?: string | null
    estado?: string
  },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!payload.objetivo?.trim()) return { success: false, error: "El objetivo es obligatorio" }
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const fila = {
      norma_codigo: payload.norma_codigo,
      objetivo: payload.objetivo.trim(),
      meta: payload.meta ?? null,
      indicador: payload.indicador ?? null,
      unidad: payload.unidad ?? null,
      linea_base: payload.linea_base ?? null,
      valor_actual: payload.valor_actual ?? null,
      responsable: payload.responsable ?? null,
      estado: payload.estado ?? "en_curso",
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_objetivos").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_objetivos")
      .insert({ ...fila, idempresa: empresaId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarObjetivo(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: "id requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_objetivos").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/** Elimina (desactiva) un aspecto ambiental. */
export async function eliminarAspectoAmbiental(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: "id requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_aspectos_ambientales").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Control de cambios documentales (sig_documento_versiones, ISO 7.5.3)
// ---------------------------------------------------------------------------

/** Lista la bitácora de versiones de un documento (más reciente primero). */
export async function getVersionesDocumento(
  documentoId: string,
): Promise<{ success: boolean; data: SigDocVersion[]; error?: string }> {
  try {
    if (!documentoId) return { success: false, data: [], error: "documentoId requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("sig_documento_versiones")
      .select("*")
      .eq("documento_id", documentoId)
      .order("created_at", { ascending: false })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigDocVersion[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

/** Registra un cambio/versión de un documento en la bitácora. */
export async function registrarCambioDocumento(
  payload: {
    documentoId: string
    documentoCodigo?: string | null
    version: string
    versionAnterior?: string | null
    tipo: SigTipoCambio
    motivo?: string | null
    descripcionCambio?: string | null
    responsable?: string | null
  },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!payload.documentoId) return { success: false, error: "documentoId requerido" }
    if (!payload.version?.trim()) return { success: false, error: "La versión es obligatoria" }
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const supabase: any = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("sig_documento_versiones")
      .insert({
        idempresa: empresaId,
        documento_id: payload.documentoId,
        documento_codigo: payload.documentoCodigo ?? null,
        version: payload.version.trim(),
        version_anterior: payload.versionAnterior ?? null,
        tipo: payload.tipo,
        motivo: payload.motivo ?? null,
        descripcion_cambio: payload.descripcionCambio ?? null,
        responsable: payload.responsable ?? null,
      })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Referencia SG-SST 0312 -> ISO 45001
// ---------------------------------------------------------------------------

/**
 * Avance GLOBAL del SG-SST (Res. 0312) de la empresa, reutilizando la matriz
 * de 60 estandares. Sirve como REFERENCIA del estado de ISO 45001 en el SIG
 * (no se mapea numeral-a-numeral porque el 0312 no sigue el Anexo SL).
 * % = suma de pesos cumplidos / 100 (cumple y no_aplica suman; no_cumple = 0).
 */
export async function getAvance0312(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; pct: number; error?: string }> {
  try {
    const data = await getMatrizEstandares(empresaIdFromClient)
    const resp = new Map<number, string>()
    for (const r of data.respuestas) resp.set(r.item_id, r.cumple)
    let peso = 0
    let obtenido = 0
    for (const it of data.items) {
      peso += it.peso || 0
      const c = resp.get(it.id)
      if (c && c !== "no_cumple") obtenido += it.peso || 0
    }
    return { success: true, pct: peso > 0 ? Math.round((obtenido / peso) * 100) : 0 }
  } catch (err: any) {
    return { success: false, pct: 0, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Mapa de Procesos (sig_procesos)
// ---------------------------------------------------------------------------

export async function getProcesos(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; data: SigProceso[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const { data, error } = await supabase
      .from("sig_procesos")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("activo", true)
      .order("orden", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigProceso[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Catálogo de no conformes potenciales por proceso (sig_nc_catalogo, 6.1)
// ---------------------------------------------------------------------------

export async function getNcCatalogo(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; data: SigNcCatalogo[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const { data, error } = await supabase
      .from("sig_nc_catalogo")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("activo", true)
      .order("proceso_codigo", { ascending: true })
      .order("orden", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigNcCatalogo[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function upsertNcCatalogo(
  payload: {
    id?: number
    proceso_codigo: string
    etapa?: string | null
    descripcion: string
    tipo?: string | null
    afecta_cliente?: boolean | null
    requisito_iso?: string | null
    deteccion?: string | null
    accion?: string | null
    orden?: number | null
  },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!payload.proceso_codigo) return { success: false, error: "El proceso es obligatorio" }
    if (!payload.descripcion?.trim()) return { success: false, error: "La descripción es obligatoria" }
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const fila = {
      proceso_codigo: payload.proceso_codigo,
      etapa: payload.etapa ?? null,
      descripcion: payload.descripcion.trim(),
      tipo: payload.tipo ?? "interno",
      afecta_cliente: payload.afecta_cliente ?? false,
      requisito_iso: payload.requisito_iso ?? null,
      deteccion: payload.deteccion ?? null,
      accion: payload.accion ?? null,
      orden: payload.orden ?? 99,
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_nc_catalogo").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_nc_catalogo")
      .insert({ ...fila, idempresa: empresaId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarNcCatalogo(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: "id requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_nc_catalogo").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Registro de no conformidades (sig_no_conformidades, ISO 9001 10.2 / 8.7)
// ---------------------------------------------------------------------------

export async function getNoConformidades(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; data: SigNoConformidad[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const { data, error } = await supabase
      .from("sig_no_conformidades")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("activo", true)
      .order("fecha", { ascending: false })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigNoConformidad[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function upsertNoConformidad(
  payload: {
    id?: number
    codigo?: string | null
    proceso_codigo?: string | null
    proyecto_id?: number | null
    catalogo_id?: number | null
    fecha?: string | null
    origen?: string | null
    descripcion: string
    tipo?: string | null
    afecta_cliente?: boolean | null
    requisito_incumplido?: string | null
    correccion?: string | null
    causa_raiz?: string | null
    accion_correctiva?: string | null
    responsable?: string | null
    fecha_compromiso?: string | null
    fecha_cierre?: string | null
    estado?: string | null
    eficacia?: string | null
  },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!payload.descripcion?.trim()) return { success: false, error: "La descripción es obligatoria" }
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const fila: any = {
      codigo: payload.codigo ?? null,
      proceso_codigo: payload.proceso_codigo ?? null,
      proyecto_id: payload.proyecto_id ?? null,
      catalogo_id: payload.catalogo_id ?? null,
      fecha: payload.fecha ?? null,
      origen: payload.origen ?? "proceso",
      descripcion: payload.descripcion.trim(),
      tipo: payload.tipo ?? "interno",
      afecta_cliente: payload.afecta_cliente ?? false,
      requisito_incumplido: payload.requisito_incumplido ?? null,
      correccion: payload.correccion ?? null,
      causa_raiz: payload.causa_raiz ?? null,
      accion_correctiva: payload.accion_correctiva ?? null,
      responsable: payload.responsable ?? null,
      fecha_compromiso: payload.fecha_compromiso ?? null,
      fecha_cierre: payload.fecha_cierre ?? null,
      estado: payload.estado ?? "abierta",
      eficacia: payload.eficacia ?? "pendiente",
      updated_at: new Date().toISOString(),
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_no_conformidades").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_no_conformidades")
      .insert({ ...fila, idempresa: empresaId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarNoConformidad(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: "id requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_no_conformidades").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Indicadores de gestión (sig_indicadores, ISO 9001 9.1) + cálculo en vivo
// ---------------------------------------------------------------------------

export async function getIndicadores(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; data: SigIndicador[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const { data, error } = await supabase
      .from("sig_indicadores")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("activo", true)
      .order("orden", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigIndicador[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function upsertIndicador(
  payload: {
    id?: number
    codigo: string
    proceso_codigo?: string | null
    nombre: string
    tipo?: string | null
    parte_interesada?: string | null
    formula?: string | null
    fuente?: string | null
    calculo_auto?: string | null
    unidad?: string | null
    meta?: number | null
    sentido?: string | null
    frecuencia?: string | null
    responsable?: string | null
    valor_manual?: number | null
    orden?: number | null
    perspectiva?: string | null
    area?: string | null
    finalidad?: string | null
    cliente_interno?: string | null
    cliente_externo?: string | null
    contribucion?: string | null
    objetivo_id?: number | null
  },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!payload.codigo?.trim()) return { success: false, error: "El código es obligatorio" }
    if (!payload.nombre?.trim()) return { success: false, error: "El nombre es obligatorio" }
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const fila: any = {
      codigo: payload.codigo.trim(),
      proceso_codigo: payload.proceso_codigo ?? null,
      nombre: payload.nombre.trim(),
      tipo: payload.tipo ?? "resultado",
      parte_interesada: payload.parte_interesada ?? null,
      formula: payload.formula ?? null,
      fuente: payload.fuente ?? "manual",
      calculo_auto: payload.calculo_auto ?? null,
      unidad: payload.unidad ?? null,
      meta: payload.meta ?? null,
      sentido: payload.sentido ?? null,
      frecuencia: payload.frecuencia ?? null,
      responsable: payload.responsable ?? null,
      valor_manual: payload.valor_manual ?? null,
      orden: payload.orden ?? 99,
      perspectiva: payload.perspectiva ?? null,
      area: payload.area ?? null,
      finalidad: payload.finalidad ?? null,
      cliente_interno: payload.cliente_interno ?? null,
      cliente_externo: payload.cliente_externo ?? null,
      contribucion: payload.contribucion ?? null,
      objetivo_id: payload.objetivo_id ?? null,
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_indicadores").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_indicadores")
      .insert({ ...fila, idempresa: empresaId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarIndicador(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: "id requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_indicadores").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/**
 * Calcula EN VIVO los indicadores automáticos desde datos reales de LIPgo,
 * filtrando por cliente/sitio (proyectoId; null = todos los clientes) y un
 * rango de fechas opcional. Devuelve un mapa clave (calculo_auto) -> valor.
 * Es lo que hace que el tablero 9.1 muestre "resultados por sitio".
 */
export async function getIndicadoresValores(
  proyectoId?: number | null,
  desde?: string | null,
  hasta?: string | null,
): Promise<{ success: boolean; valores: Record<string, SigIndicadorValor>; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    // IDs de cliente sobre los que se calcula (solo clientes ACTIVOS del SIG).
    const clientes: number[] = proyectoId ? [proyectoId] : SIG_CLIENTES_LIP

    const contar = async (tabla: string, build: (q: any) => any): Promise<number> => {
      let q = supabase.from(tabla).select("*", { count: "exact", head: true }).in("idempresa", clientes)
      q = build(q)
      const { count, error } = await q
      if (error) return 0
      return count || 0
    }

    // --- Cargue/Descargue (cabeceraoc) ---
    const filtroFechaOrden = (q: any) => {
      if (desde) q = q.gte("fechaorden", desde)
      if (hasta) q = q.lte("fechaorden", hasta)
      return q
    }
    const totOrdenes = await contar("cabeceraoc", filtroFechaOrden)
    // El desempeño de LIP se mide por SU tramo: `fincargue` (cargue finalizado
    // por LIP). No se usa status='finalizado' como medida de LIP porque ese
    // estado lo activa el pesaje final del cliente (paso de la operación del
    // cliente dentro de LIPgo, valor agregado, fuera del alcance del servicio).
    const finalizadasLIP = await contar("cabeceraoc", (q: any) => filtroFechaOrden(q).not("fincargue", "is", null))
    // Ciclo completo registrado en LIPgo (valor agregado: trazabilidad para el cliente).
    const cicloCerrado = await contar("cabeceraoc", (q: any) => filtroFechaOrden(q).ilike("status", "finalizado"))
    // Evidencia fotográfica del cargue (control/trazabilidad de LIP).
    const conEvidencia = await contar("cabeceraoc", (q: any) => filtroFechaOrden(q).not("fotospicking", "is", null))

    // Toneladas (suma en memoria: pesovascula) + meta del periodo por sede.
    let qTon = supabase.from("cabeceraoc").select("pesovascula,idempresa,fechaorden").in("idempresa", clientes)
    qTon = filtroFechaOrden(qTon)
    const { data: tonRows } = await qTon
    const toneladas = (tonRows ?? []).reduce((s: number, r: any) => s + (Number(r.pesovascula) || 0), 0)
    // Cumplimiento de meta de tonelaje = ton / (meta_día por sede × días operativos).
    const diasPorCliente: Record<number, Set<string>> = {}
    for (const r of tonRows ?? []) {
      const id = Number(r.idempresa)
      if (!diasPorCliente[id]) diasPorCliente[id] = new Set()
      if (r.fechaorden) diasPorCliente[id].add(String(r.fechaorden))
    }
    let metaPeriodo = 0
    for (const id of Object.keys(diasPorCliente)) metaPeriodo += getMetaDiaForEmpresa(Number(id)) * diasPorCliente[Number(id)].size
    const cumplimientoMetaTon = metaPeriodo > 0 ? Math.round((toneladas / metaPeriodo) * 1000) / 10 : 0

    // Tiempo de cargue LIP (iniciocargue -> fincargue), promedio en minutos.
    let qDur = supabase
      .from("cabeceraoc")
      .select("iniciocargue,fincargue")
      .in("idempresa", clientes)
      .not("iniciocargue", "is", null)
      .not("fincargue", "is", null)
    qDur = filtroFechaOrden(qDur)
    const { data: durRows } = await qDur
    const aMin = (s: string) => {
      const [h, m, sec] = String(s).split(":").map(Number)
      return h * 60 + m + (sec || 0) / 60
    }
    const durs = (durRows ?? [])
      .map((r: any) => aMin(r.fincargue) - aMin(r.iniciocargue))
      .filter((d: number) => d > 0 && d < 600)
    const tiempoCargue = durs.length ? Math.round(durs.reduce((s: number, d: number) => s + d, 0) / durs.length) : 0

    // --- Vehículos / conductores (citasvehiculos, fechallegada) ---
    const vehiculos = await contar("citasvehiculos", (q: any) => {
      if (desde) q = q.gte("fechallegada", desde)
      if (hasta) q = q.lte("fechallegada", hasta)
      return q
    })

    // --- Inventario (invtrans): exactitud y rechazos (sin filtro de fecha: creado suele venir nulo) ---
    const totInv = await contar("invtrans", (q: any) => q)
    const aprobInv = await contar("invtrans", (q: any) => q.ilike("status", "aprobado"))
    const rechInv = await contar("invtrans", (q: any) => q.ilike("status", "rechazado"))

    // --- Gestión humana (headcount): colaboradores activos ---
    const activos = await contar("headcount", (q: any) => q.ilike("estado", "activo"))

    // --- Satisfacción (sig_satisfaccion): promedio 1-5 → % ---
    const avgSat = async (tipo: string): Promise<{ v: number; n: number }> => {
      const { data } = await supabase.from("sig_satisfaccion").select("calificacion").eq("activo", true).eq("tipo", tipo).in("proyecto_id", clientes)
      const vals = (data ?? []).map((r: any) => Number(r.calificacion) || 0).filter((x: number) => x > 0)
      const avg = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0
      return { v: Math.round((avg / 5) * 1000) / 10, n: vals.length }
    }
    const satCli = await avgSat("cliente")
    const satCon = await avgSat("conductor")

    // --- SLA de tiempos de cargue (Acuerdos de Servicio) ---
    // % de despachos cuyo tiempo efectivo (fincargue−iniciocargue) está dentro
    // del tiempo acordado para su tipo de vehículo. Tipo de vehículo desde
    // citasvehiculos (ocargue = cabeceraoc.ordendecargue).
    let qSla = supabase
      .from("cabeceraoc")
      .select("ordendecargue,iniciocargue,fincargue")
      .in("idempresa", clientes)
      .not("iniciocargue", "is", null)
      .not("fincargue", "is", null)
    qSla = filtroFechaOrden(qSla)
    const { data: slaRows } = await qSla
    const { data: citas } = await supabase.from("citasvehiculos").select("ocargue,tipovehiculo").in("idempresa", clientes)
    const tipoPorOc: Record<string, string> = {}
    for (const c of citas ?? []) if (c.ocargue) tipoPorOc[String(c.ocargue)] = c.tipovehiculo
    let slaOk = 0, slaTot = 0
    for (const r of slaRows ?? []) {
      const tv = tipoPorOc[String(r.ordendecargue)]
      const max = getSlaCargueMin(tv, "PT")
      if (!max) continue
      const real = aMin(r.fincargue) - aMin(r.iniciocargue)
      if (real <= 0 || real > 600) continue
      slaTot++
      if (real <= max) slaOk++
    }
    const slaTiempos = slaTot > 0 ? Math.round((slaOk / slaTot) * 1000) / 10 : 0

    // --- Cobertura de personal vs planta acordada ---
    let plantaAcordada = 0
    for (const id of clientes) plantaAcordada += PLANTA_ACORDADA[id]?.total || 0
    const ghCobertura = plantaAcordada > 0 ? Math.round((activos / plantaAcordada) * 1000) / 10 : 0

    // --- Ausentismo (registroasistencia): control diario por proyecto ---
    // Ausentismo = turnos con incapacidad o licencia no remunerada / turnos
    // programados. Excluye vacaciones, descansos, licencias remuneradas y retiros.
    const asisRows: any[] = []
    let aFrom = 0
    while (true) {
      let qa = supabase.from("registroasistencia").select("fecha,puesto,asistencia").in("idempresa", clientes).range(aFrom, aFrom + 999)
      if (desde) qa = qa.gte("fecha", desde)
      if (hasta) qa = qa.lte("fecha", hasta)
      const { data } = await qa
      asisRows.push(...(data ?? []))
      if (!data || data.length < 1000) break
      aFrom += 1000
      if (aFrom > 120000) break
    }
    const esAusentismo = (a: any) => {
      const s = String(a || "").toLowerCase()
      return s.includes("incapacidad") || s.includes("no remunerada")
    }
    const turnosProgramados = asisRows.filter((r) => r.puesto !== null || r.asistencia !== null).length
    const turnosAusencia = asisRows.filter((r) => esAusentismo(r.asistencia)).length
    const ghAusentismo = turnosProgramados > 0 ? Math.round((turnosAusencia / turnosProgramados) * 1000) / 10 : 0

    // --- Recobro de incapacidades (ausentismosst): % de recuperación ---
    // Recobrable = costos_eps (EG día 3+) + costos_arl (AT 100%); recuperado =
    // valor_recobrado (o el recobrable si el estado es RECOBRADO). El indicador
    // mide la eficiencia de la gestión de cobro ante EPS/ARL (recurso de la
    // empresa que se pierde si no se recobra a tiempo).
    let qRec = supabase
      .from("ausentismosst")
      .select("tipo_evento,total_dias_incapacidad,costos_eps,costos_arl,salario_base_dia,salario_base,estado_recobro,valor_recobrado,fecha_inicial")
      .in("idempresa", clientes)
    if (desde) qRec = qRec.gte("fecha_inicial", desde)
    if (hasta) qRec = qRec.lte("fecha_inicial", hasta)
    const { data: recRows } = await qRec
    let recobrableTot = 0
    let recuperadoTot = 0
    for (const a of recRows ?? []) {
      const dias = Number(a.total_dias_incapacidad) || 0
      const diaVal = Number(a.salario_base_dia) || (Number(a.salario_base) || 0) / 30
      const esAT = a.tipo_evento === "AT"
      const recobrable = esAT
        ? Number(a.costos_arl) || Math.round(dias * diaVal)
        : Number(a.costos_eps) || Math.round(Math.max(dias - 2, 0) * diaVal * 0.6667)
      if (recobrable <= 0) continue
      recobrableTot += recobrable
      recuperadoTot += Number(a.valor_recobrado) || (String(a.estado_recobro) === "RECOBRADO" ? recobrable : 0)
    }
    const ghRecobro = recobrableTot > 0 ? Math.round((recuperadoTot / recobrableTot) * 1000) / 10 : 0

    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
    // Nivel de servicio global = promedio de los componentes de servicio medibles.
    const compGlobal = [pct(finalizadasLIP, totOrdenes), cumplimientoMetaTon, slaTiempos].filter((x) => x > 0)
    const slaGlobal = compGlobal.length ? Math.round((compGlobal.reduce((a, b) => a + b, 0) / compGlobal.length) * 10) / 10 : 0

    // Gestión de facturación (operaciones): % de operaciones ya gestionadas
    // (solicitud de factura hecha por el coordinador) vs total facturable. Las
    // pendientes (estadofactura null) son las que el coordinador aún no solicita.
    // Piso = MES ACTUAL (o `desde` si se filtró): el backlog de meses pasados se
    // considera cerrado y NO distorsiona el indicador ni el BSC de la empresa.
    const mesIniFact = (() => {
      const h = new Date()
      return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-01`
    })()
    const factDesde = desde || mesIniFact
    const filtroFact = (q: any) => {
      q = q.gte("fechaorden", factDesde)
      if (hasta) q = q.lte("fechaorden", hasta)
      return q.not("tipooperacion", "ilike", "proyeccion").not("tipooperacion", "ilike", "tolva")
    }
    const factTot = await contar("cabeceraoc", filtroFact)
    const factPend = await contar("cabeceraoc", (q: any) => filtroFact(q).is("estadofactura", null))
    const lipFacturacion = pct(factTot - factPend, factTot)

    const valores: Record<string, SigIndicadorValor> = {
      // Desempeño de LIP = cargues finalizados por LIP (fincargue).
      desp_cumplimiento: { valor: pct(finalizadasLIP, totOrdenes), base: `${finalizadasLIP}/${totOrdenes}` },
      // Valor agregado: ciclo completo registrado en LIPgo (trazabilidad para el cliente).
      desp_ciclo_cerrado: { valor: pct(cicloCerrado, totOrdenes), base: `${cicloCerrado}/${totOrdenes}` },
      lip_evidencia: { valor: pct(conEvidencia, totOrdenes), base: `${conEvidencia}/${totOrdenes}` },
      lip_tiempo_cargue: { valor: tiempoCargue, base: `${durs.length} órdenes` },
      desp_ordenes: { valor: totOrdenes, base: "" },
      desp_toneladas: { valor: Math.round(toneladas * 10) / 10, base: "" },
      desp_meta_ton: { valor: cumplimientoMetaTon, base: `${Math.round(toneladas)}/${Math.round(metaPeriodo)} ton` },
      sla_tiempos: { valor: slaTiempos, base: `${slaOk}/${slaTot} dentro de SLA` },
      gh_cobertura: { valor: ghCobertura, base: plantaAcordada > 0 ? `${activos}/${plantaAcordada} planta` : "planta no definida" },
      gh_ausentismo: { valor: ghAusentismo, base: turnosProgramados > 0 ? `${turnosAusencia}/${turnosProgramados} turnos` : "sin registros" },
      gh_recobro: { valor: ghRecobro, base: recobrableTot > 0 ? `$${recuperadoTot.toLocaleString("es-CO")} de $${recobrableTot.toLocaleString("es-CO")}` : "sin recobros" },
      sla_global: { valor: slaGlobal, base: "promedio de servicio" },
      lip_facturacion: { valor: lipFacturacion, base: `${factTot - factPend}/${factTot} gestionadas` },
      vehiculos_atendidos: { valor: vehiculos, base: "" },
      inv_exactitud: { valor: pct(aprobInv, totInv), base: `${aprobInv}/${totInv}` },
      inv_rechazos: { valor: rechInv, base: "" },
      gh_activos: { valor: activos, base: "" },
      sat_cliente: { valor: satCli.v, base: `${satCli.n} encuestas` },
      sat_conductor: { valor: satCon.v, base: `${satCon.n} encuestas` },
    }
    return { success: true, valores }
  } catch (err: any) {
    return { success: false, valores: {}, error: err?.message || "Error desconocido" }
  }
}

// Clientes/sitios ACTIVOS del SIG (para selectores). Excluye prueba/inactivos.
export async function getClientesLIP(): Promise<{ id: number; nombre: string }[]> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("empresas")
      .select("id,nombre")
      .in("id", SIG_CLIENTES_LIP)
      .order("nombre", { ascending: true })
    if (error) return []
    return (data ?? []) as { id: number; nombre: string }[]
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Panel LIP · Inventario — Exactitud y merma (ISO 9001 8.5.1). Cuadre
// entradas/salidas + eventos de pérdida (lo que se cobra a LIP), por año y mes,
// por cliente/sitio. Fuente: invtrans + reprocesos (todo en LIPgo).
// ---------------------------------------------------------------------------
export async function getPanelInventarioLIP(
  proyectoId?: number | null,
  anio?: string | null,
  mes?: string | null,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const clientes: number[] = proyectoId ? [proyectoId] : SIG_CLIENTES_LIP

    // Traer movimientos (paginado; solo columnas necesarias).
    const inv: any[] = []
    let fromIdx = 0
    while (true) {
      const { data, error } = await supabase
        .from("invtrans")
        .select("tipomov,origen,status,cantidad,creado,codproducto,nombreproducto")
        .in("idempresa", clientes)
        .range(fromIdx, fromIdx + 999)
      if (error) return { success: false, error: error.message }
      inv.push(...(data ?? []))
      if (!data || data.length < 1000) break
      fromIdx += 1000
      if (fromIdx > 60000) break // tope de seguridad
    }

    // Reprocesos (daños en proceso).
    const { data: repro } = await supabase
      .from("reprocesos")
      .select("cantidad,creado")
      .in("idempresa", clientes)

    // Saldos físicos actuales (saldoinvdetalle) — referencia del cuadre.
    const saldosRows: any[] = []
    let sFrom = 0
    while (true) {
      const { data } = await supabase.from("saldoinvdetalle").select("codproducto,stock_actual").in("idempresa", clientes).range(sFrom, sFrom + 999)
      saldosRows.push(...(data ?? []))
      if (!data || data.length < 1000) break
      sFrom += 1000
      if (sFrom > 60000) break
    }
    const saldoFisico = saldosRows.reduce((s, r) => s + (Number(r.stock_actual) || 0), 0)
    const skusConStock = new Set(saldosRows.filter((r) => (Number(r.stock_actual) || 0) > 0).map((r) => r.codproducto)).size

    const yr = (s: any) => (s ? String(s).slice(0, 4) : null)
    const mo = (s: any) => (s ? String(s).slice(5, 7) : null)
    const has = (v: any, t: string) => String(v || "").toLowerCase().includes(t)
    // Años disponibles.
    const aniosSet = new Set<string>()
    for (const r of inv) if (yr(r.creado)) aniosSet.add(yr(r.creado)!)
    const anios = Array.from(aniosSet).sort().reverse()
    const anioSel = anio || anios[0] || String(new Date().getFullYear())

    // ---- Clasificación por TIPO DE MOVIMIENTO (nomenclatura LIPgo) ----
    // Códigos de referencia (ver catálogo sig_tipos_movimiento):
    //   recepcion (101 producción/recepción/descargue), despacho (601 cargue),
    //   traslado_interno (311 ubicación↔ubicación), ajuste (701/702 diferencia de
    //   inventario físico), inicial (561 carga inicial),
    //   merma (551 reproceso = merma de proceso, NO se cobra a LIP).
    const tipoMov = (r: any): string => {
      if (r.tipomov === "Reproceso" || has(r.origen, "reproceso")) return "merma"
      if (has(r.origen, "inicial")) return "inicial"
      if (has(r.origen, "traslado entre localizaciones")) return "traslado_interno"
      if (r.tipomov === "Entrada" && (has(r.origen, "producc") || has(r.origen, "aprob") || has(r.origen, "descarg") || has(r.origen, "logo"))) return "recepcion"
      if (r.tipomov === "Salida" && has(r.origen, "orden de cargue")) return "despacho"
      return "ajuste" // transacción manual / ajuste de inventario / bodega general
    }

    const totMov: Record<string, number> = { recepcion: 0, despacho: 0, traslado_interno: 0, ajuste: 0, inicial: 0, merma: 0 }
    const meses: Record<string, { recepcion: number; despacho: number }> = {}
    for (let i = 1; i <= 12; i++) meses[String(i).padStart(2, "0")] = { recepcion: 0, despacho: 0 }
    const salPorProd: Record<string, { producto: string; salidas: number }> = {} // para top movers / ABC
    const skusActivosSet = new Set<string>()
    for (const r of inv) {
      if (yr(r.creado) !== anioSel) continue
      const c = Number(r.cantidad) || 0
      const t = tipoMov(r)
      const m = mo(r.creado)
      if (m && meses[m]) {
        if (t === "recepcion") meses[m].recepcion += c
        else if (t === "despacho") meses[m].despacho += c
      }
      if (!mes || m === mes) {
        totMov[t] = (totMov[t] || 0) + c
        if (r.codproducto) skusActivosSet.add(r.codproducto)
        if (t === "despacho" && r.codproducto) {
          const cod = r.codproducto
          if (!salPorProd[cod]) salPorProd[cod] = { producto: r.nombreproducto || cod, salidas: 0 }
          salPorProd[cod].salidas += c
        }
      }
    }
    for (const r of repro ?? []) {
      if (yr(r.creado) !== anioSel) continue
      if (mes && mo(r.creado) !== mes) continue
      totMov.merma += Number(r.cantidad) || 0
    }
    const movimientosAnio = totMov.recepcion + totMov.despacho + totMov.traslado_interno + totMov.ajuste

    // ---- ANALÍTICA AVANZADA ----
    const prods = Object.entries(salPorProd).map(([cod, v]) => ({ cod, producto: v.producto, salidas: Math.round(v.salidas) })).sort((a, b) => b.salidas - a.salidas)
    const topMovers = prods.slice(0, 8)
    const totalSalidasProd = prods.reduce((s, p) => s + p.salidas, 0)
    // Clasificación ABC (Pareto sobre salidas): A≤80% acumulado, B≤95%, C resto.
    let acum = 0
    const abc = { A: 0, B: 0, C: 0 }
    for (const p of prods) {
      acum += p.salidas
      const pct = totalSalidasProd > 0 ? acum / totalSalidasProd : 1
      if (pct <= 0.8) abc.A++
      else if (pct <= 0.95) abc.B++
      else abc.C++
    }
    const periodoDias = mes ? 30 : 365
    const rotacion = saldoFisico > 0 ? Math.round((totMov.despacho / saldoFisico) * 100) / 100 : 0
    const diasInventario = totMov.despacho > 0 ? Math.round(saldoFisico / (totMov.despacho / periodoDias)) : 0
    const skusActivos = skusActivosSet.size
    const skusSinMovimiento = Math.max(0, skusConStock - skusActivos)

    // ---- ERI (Exactitud del Registro de Inventario): físico vs libro por conteo ----
    // Faltante (diferencia negativa, mov. 701/702) = lo ÚNICO que se cobra a LIP.
    // La merma de proceso (551 reproceso) NO se cobra. Resiliente si no existe la tabla.
    let faltante = 0, sobrante = 0, itemsContados = 0, itemsConDif = 0
    try {
      const { data: aj } = await supabase.from("sig_inventario_ajuste").select("cantidad,tipo").eq("activo", true).in("proyecto_id", clientes)
      for (const r of aj ?? []) {
        const c = Number(r.cantidad) || 0
        if (r.tipo === "faltante") faltante += Math.abs(c)
        else if (r.tipo === "sobrante") sobrante += Math.abs(c)
        else if (c < 0) faltante += Math.abs(c)
        else if (c > 0) sobrante += c
      }
      const { data: cuad } = await supabase.from("sig_inventario_cuadre").select("items,items_con_diferencia").eq("activo", true).in("proyecto_id", clientes)
      for (const r of cuad ?? []) { itemsContados += Number(r.items) || 0; itemsConDif += Number(r.items_con_diferencia) || 0 }
    } catch { /* tablas de cuadre aún no creadas */ }
    // ERI: si hay conteos, % de ítems sin diferencia; si no, se infiere por faltante/stock.
    const eri = itemsContados > 0
      ? Math.round((1 - itemsConDif / itemsContados) * 1000) / 10
      : (saldoFisico > 0 ? Math.round((1 - faltante / saldoFisico) * 1000) / 10 : 100)

    const NOMBRE_MES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    const porMes = Object.entries(meses)
      .filter(([, v]) => v.recepcion || v.despacho)
      .map(([k, v]) => ({ mes: NOMBRE_MES[Number(k)], recepcion: Math.round(v.recepcion), despacho: Math.round(v.despacho) }))

    const movimientos = [
      { tipo: "Recepción (101)", cant: Math.round(totMov.recepcion) },
      { tipo: "Despacho / cargue (601)", cant: Math.round(totMov.despacho) },
      { tipo: "Traslado interno (311)", cant: Math.round(totMov.traslado_interno) },
      { tipo: "Ajuste de inventario (701/702)", cant: Math.round(totMov.ajuste) },
      { tipo: "Inventario inicial (561)", cant: Math.round(totMov.inicial) },
      { tipo: "Merma / reproceso (551)", cant: Math.round(totMov.merma) },
    ]

    return {
      success: true,
      data: {
        anios,
        anio: anioSel,
        kpis: {
          eri,                                  // exactitud de registro (ERI)
          faltante: Math.round(faltante),       // mov. 701/702 negativo → se cobra a LIP
          sobrante: Math.round(sobrante),
          saldoFisico: Math.round(saldoFisico), // stock libro (perpetuo)
          movimientos: Math.round(movimientosAnio),
          itemsContados,
          mermaProceso: Math.round(totMov.merma), // 551: NO se cobra a LIP
          rotacion,                              // veces (despacho / stock)
          diasInventario,                        // días de cobertura
          skusActivos,
          skusConStock,
          skusSinMovimiento,
        },
        movimientos,
        topMovers,
        abc,
        porMes,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// Cuadre diario: saldo inicial del día + ingresos − salidas = saldo final (running).
export async function getCuadreDiario(
  proyectoId?: number | null,
  anio?: string | null,
  mes?: string | null,
): Promise<{ success: boolean; data: any[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const clientes: number[] = proyectoId ? [proyectoId] : SIG_CLIENTES_LIP
    const has = (v: any, t: string) => String(v || "").toLowerCase().includes(t)
    const inv: any[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase.from("invtrans").select("tipomov,origen,cantidad,creado").in("idempresa", clientes).range(from, from + 999)
      if (error) return { success: false, data: [], error: error.message }
      inv.push(...(data ?? []))
      if (!data || data.length < 1000) break
      from += 1000
      if (from > 60000) break
    }
    // Agrupar por día
    const byDay: Record<string, { ingresos: number; salidas: number; otros: number }> = {}
    for (const r of inv) {
      const d = String(r.creado || "").slice(0, 10)
      if (!d) continue
      if (has(r.origen, "traslado entre localizaciones")) continue // interno: no afecta
      const c = Number(r.cantidad) || 0
      byDay[d] = byDay[d] || { ingresos: 0, salidas: 0, otros: 0 }
      if (r.tipomov === "Entrada" && (has(r.origen, "producc") || has(r.origen, "aprob") || has(r.origen, "descarg") || has(r.origen, "logo"))) byDay[d].ingresos += c
      else if (r.tipomov === "Salida" && has(r.origen, "orden de cargue")) byDay[d].salidas += c
      else if (r.tipomov === "Reproceso" || has(r.origen, "reproceso")) byDay[d].otros -= c
      else if (has(r.origen, "inicial")) byDay[d].otros += c
      else byDay[d].otros += r.tipomov === "Salida" ? -c : c // ajuste manual
    }
    // Running balance por fecha ascendente
    const dias = Object.keys(byDay).sort()
    let saldo = 0
    const todas = dias.map((d) => {
      const v = byDay[d]
      const inicial = saldo
      const net = v.ingresos - v.salidas + v.otros
      saldo = inicial + net
      return {
        fecha: d,
        saldoInicial: Math.round(inicial),
        ingresos: Math.round(v.ingresos),
        salidas: Math.round(v.salidas),
        otros: Math.round(v.otros),
        saldoFinal: Math.round(saldo),
      }
    })
    // Filtrar a año/mes para mostrar
    const filas = todas.filter((r) => (!anio || r.fecha.slice(0, 4) === anio) && (!mes || r.fecha.slice(5, 7) === mes)).reverse()
    return { success: true, data: filas }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

// Preservación / FIFO: antigüedad del stock y productos próximos a vencer (8.5.4).
export async function getPreservacionInventario(
  proyectoId?: number | null,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const clientes: number[] = proyectoId ? [proyectoId] : SIG_CLIENTES_LIP
    // Saldos con stock
    const saldos: any[] = []
    let sFrom = 0
    while (true) {
      const { data } = await supabase.from("saldoinvdetalle").select("codproducto,nombreproducto,lote,stock_actual").in("idempresa", clientes).range(sFrom, sFrom + 999)
      saldos.push(...(data ?? []))
      if (!data || data.length < 1000) break
      sFrom += 1000
      if (sFrom > 60000) break
    }
    // Vida útil por producto (productos.vidautildias)
    const vida: Record<string, number> = {}
    try {
      const { data: prods } = await supabase.from("productos").select("codigo,vidautildias")
      for (const p of prods ?? []) if (p.vidautildias) vida[p.codigo] = Number(p.vidautildias)
    } catch { /* sin tabla productos */ }

    const hoy = new Date()
    const parseLote = (l: any): Date | null => {
      const s = String(l || "")
      if (/^\d{8}$/.test(s)) { const d = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))); return isNaN(d.getTime()) ? null : d }
      return null
    }
    let vencidos = 0, proximos = 0, ok = 0, sumDias = 0, nConDias = 0
    const filas = saldos
      .filter((r) => (Number(r.stock_actual) || 0) > 0)
      .map((r) => {
        const fp = parseLote(r.lote)
        const dias = fp ? Math.floor((hoy.getTime() - fp.getTime()) / 86400000) : null
        const vu = vida[r.codproducto] || 0
        let estado = "sin_vida"
        if (vu > 0 && dias != null) {
          if (dias >= vu) { estado = "vencido"; vencidos++ }
          else if (dias >= vu * 0.7) { estado = "proximo"; proximos++ }
          else { estado = "ok"; ok++ }
        }
        if (dias != null) { sumDias += dias; nConDias++ }
        return { codproducto: r.codproducto, producto: r.nombreproducto, lote: r.lote, stock: Math.round(Number(r.stock_actual) || 0), dias, vidautil: vu || null, estado }
      })
      .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1))
    return {
      success: true,
      data: {
        filas,
        resumen: { vencidos, proximos, ok, total: filas.length, antiguedadProm: nConDias ? Math.round(sumDias / nConDias) : 0 },
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// Catálogo de tipos de movimiento (nomenclatura LIPgo).
export async function getTiposMovimiento(): Promise<{ success: boolean; data: SigTipoMovimiento[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { data, error } = await supabase.from("sig_tipos_movimiento").select("*").eq("activo", true).order("orden", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigTipoMovimiento[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

// Drill-down del Kardex: movimientos de UN producto con sus soportes PDF
// (ingreso/aprobación = invtrans.pdf; orden de cargue = cabeceraoc.pdfoc/doccargue).
export async function getMovimientosProducto(
  codproducto: string,
  proyectoId?: number | null,
  anio?: string | null,
  mes?: string | null,
): Promise<{ success: boolean; data: any[]; error?: string }> {
  try {
    if (!codproducto) return { success: true, data: [] }
    const supabase: any = await getSupabaseAdmin()
    const clientes: number[] = proyectoId ? [proyectoId] : SIG_CLIENTES_LIP
    const has = (v: any, t: string) => String(v || "").toLowerCase().includes(t)
    const yr = (s: any) => (s ? String(s).slice(0, 4) : null)
    const mo = (s: any) => (s ? String(s).slice(5, 7) : null)
    const { data: rows, error } = await supabase
      .from("invtrans")
      .select("tipomov,origen,cantidad,creado,creadopor,ocargue,pdf,status,lote,location")
      .eq("codproducto", codproducto)
      .in("idempresa", clientes)
      .limit(5000)
    if (error) return { success: false, data: [], error: error.message }
    const movs = (rows ?? []).filter((r: any) => (!anio || yr(r.creado) === anio) && (!mes || mo(r.creado) === mes))

    // Resolver PDFs de las órdenes de cargue
    const ocargues = Array.from(new Set(movs.map((r: any) => r.ocargue).filter(Boolean)))
    const pdfPorOC: Record<string, { pdfoc: string | null; doccargue: string | null }> = {}
    if (ocargues.length > 0) {
      const { data: cab } = await supabase.from("cabeceraoc").select("ordendecargue,pdfoc,doccargue").in("ordendecargue", ocargues)
      for (const c of cab ?? []) pdfPorOC[c.ordendecargue] = { pdfoc: c.pdfoc, doccargue: c.doccargue }
    }
    const label = (r: any): string => {
      if (r.tipomov === "Reproceso" || has(r.origen, "reproceso")) return "Merma/Reproceso (551)"
      if (has(r.origen, "inicial")) return "Inventario inicial (561)"
      if (has(r.origen, "traslado entre localizaciones")) return "Traslado interno (311)"
      if (r.tipomov === "Entrada" && (has(r.origen, "producc") || has(r.origen, "aprob") || has(r.origen, "descarg") || has(r.origen, "logo"))) return "Recepción (101)"
      if (r.tipomov === "Salida" && has(r.origen, "orden de cargue")) return "Despacho (601)"
      return "Ajuste (701/702)"
    }
    const data = movs
      .map((r: any) => ({
        fecha: r.creado,
        tipo: label(r),
        tipomov: r.tipomov,
        cantidad: Number(r.cantidad) || 0,
        status: r.status,
        usuario: r.creadopor || null, // quién realizó el movimiento (auditoría)
        lote: r.lote,
        location: r.location,
        ocargue: r.ocargue,
        pdf: r.pdf || null, // soporte de ingreso/aprobación si existe
        pdfoc: r.ocargue ? pdfPorOC[r.ocargue]?.pdfoc ?? null : null, // orden de cargue
        doccargue: r.ocargue ? pdfPorOC[r.ocargue]?.doccargue ?? null : null, // picking
      }))
      .sort((a: any, b: any) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
    return { success: true, data }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Kardex / Inventario Detalle: movimiento total de cada producto (ingreso→salida).
// Movimiento total por producto (ingreso → salida), agregado por código.
// ---------------------------------------------------------------------------
export async function getKardexInventario(
  proyectoId?: number | null,
  anio?: string | null,
  mes?: string | null,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const clientes: number[] = proyectoId ? [proyectoId] : SIG_CLIENTES_LIP
    const has = (v: any, t: string) => String(v || "").toLowerCase().includes(t)
    const yr = (s: any) => (s ? String(s).slice(0, 4) : null)
    const mo = (s: any) => (s ? String(s).slice(5, 7) : null)

    // Movimientos (paginado)
    const inv: any[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from("invtrans")
        .select("codproducto,nombreproducto,tipomov,origen,cantidad,creado")
        .in("idempresa", clientes)
        .range(from, from + 999)
      if (error) return { success: false, error: error.message }
      inv.push(...(data ?? []))
      if (!data || data.length < 1000) break
      from += 1000
      if (from > 60000) break
    }

    // Saldo actual por producto (saldoinvdetalle)
    const saldos: Record<string, number> = {}
    let sFrom = 0
    while (true) {
      const { data } = await supabase.from("saldoinvdetalle").select("codproducto,stock_actual").in("idempresa", clientes).range(sFrom, sFrom + 999)
      for (const r of data ?? []) saldos[r.codproducto] = (saldos[r.codproducto] || 0) + (Number(r.stock_actual) || 0)
      if (!data || data.length < 1000) break
      sFrom += 1000
      if (sFrom > 60000) break
    }

    const map: Record<string, any> = {}
    for (const r of inv) {
      if (anio && yr(r.creado) !== anio) continue
      if (mes && mo(r.creado) !== mes) continue
      const cod = r.codproducto || "(sin código)"
      if (!map[cod]) map[cod] = { codproducto: cod, producto: r.nombreproducto || "", entradas: 0, salidas: 0, ajustes: 0, traslados: 0, merma: 0 }
      const c = Number(r.cantidad) || 0
      if (r.nombreproducto && !map[cod].producto) map[cod].producto = r.nombreproducto
      if (r.tipomov === "Reproceso" || has(r.origen, "reproceso")) map[cod].merma += c
      else if (has(r.origen, "traslado entre localizaciones")) map[cod].traslados += c
      else if (r.tipomov === "Entrada" && (has(r.origen, "producc") || has(r.origen, "aprob") || has(r.origen, "descarg") || has(r.origen, "logo"))) map[cod].entradas += c
      else if (r.tipomov === "Salida" && has(r.origen, "orden de cargue")) map[cod].salidas += c
      else map[cod].ajustes += r.tipomov === "Salida" ? -c : c
    }
    const filas = Object.values(map)
      .map((p: any) => ({
        ...p,
        entradas: Math.round(p.entradas),
        salidas: Math.round(p.salidas),
        ajustes: Math.round(p.ajustes),
        merma: Math.round(p.merma),
        saldo: Math.round(saldos[p.codproducto] || 0),
      }))
      .sort((a: any, b: any) => (a.producto || "").localeCompare(b.producto || ""))

    return { success: true, data: { filas } }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Cuadre / Conteo Físico de Inventario + Ajustes. Por cliente/sitio.
// Persiste lo que el módulo "Auditoría de Inventario" calcula en memoria.
// ---------------------------------------------------------------------------

export async function getCuadres(
  proyectoId: number,
): Promise<{ success: boolean; data: SigInventarioCuadre[]; error?: string }> {
  try {
    if (!proyectoId) return { success: true, data: [] }
    const supabase: any = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("sig_inventario_cuadre")
      .select("*")
      .eq("proyecto_id", proyectoId)
      .eq("activo", true)
      .order("fecha", { ascending: false })
      .order("id", { ascending: false })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigInventarioCuadre[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function getCuadreDetalle(
  cuadreId: number,
): Promise<{ success: boolean; data: SigInventarioCuadreDetalle[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("sig_inventario_cuadre_detalle")
      .select("*")
      .eq("cuadre_id", cuadreId)
      .order("producto", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigInventarioCuadreDetalle[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

/** Crea un documento de conteo cargando el stock en sistema (saldoinvdetalle). */
export async function crearCuadre(
  proyectoId: number,
  payload: { fecha?: string; tipo?: string; almacen?: string | null; responsable?: string | null; creado_por?: string | null },
): Promise<{ success: boolean; id?: number; items?: number; error?: string }> {
  try {
    if (!proyectoId) return { success: false, error: "Selecciona un cliente/sitio" }
    const supabase: any = await getSupabaseAdmin()

    // Cargar saldos del sistema (paginado).
    const saldos: any[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from("saldoinvdetalle")
        .select("codproducto,nombreproducto,lote,location,stock_actual")
        .eq("idempresa", proyectoId)
        .range(from, from + 999)
      if (error) return { success: false, error: error.message }
      saldos.push(...(data ?? []))
      if (!data || data.length < 1000) break
      from += 1000
      if (from > 60000) break
    }
    const lineasBase = saldos.filter((r) => (Number(r.stock_actual) || 0) !== 0)
    const totalSistema = lineasBase.reduce((s, r) => s + (Number(r.stock_actual) || 0), 0)

    const { data: cab, error: errCab } = await supabase
      .from("sig_inventario_cuadre")
      .insert({
        proyecto_id: proyectoId,
        fecha: payload.fecha ?? null,
        tipo: payload.tipo ?? "total",
        almacen: payload.almacen ?? null,
        responsable: payload.responsable ?? null,
        estado: "borrador",
        total_sistema: Math.round(totalSistema * 100) / 100,
        total_conteo: Math.round(totalSistema * 100) / 100, // inicia = sistema (sin diferencia)
        total_diferencia: 0,
        items: lineasBase.length,
        items_con_diferencia: 0,
        creado_por: payload.creado_por ?? null,
      })
      .select("id")
      .single()
    if (errCab) return { success: false, error: errCab.message }
    const cuadreId = (cab as any).id

    if (lineasBase.length > 0) {
      const detalle = lineasBase.map((r) => {
        const sistema = Number(r.stock_actual) || 0
        return {
          cuadre_id: cuadreId,
          codproducto: r.codproducto ?? null,
          producto: r.nombreproducto ?? null,
          lote: r.lote ?? null,
          location: r.location ?? null,
          sistema,
          conteo: sistema, // sin contar todavía → sin diferencia
          diferencia: 0,
        }
      })
      // Insertar en lotes de 500.
      for (let i = 0; i < detalle.length; i += 500) {
        const { error: errDet } = await supabase.from("sig_inventario_cuadre_detalle").insert(detalle.slice(i, i + 500))
        if (errDet) return { success: false, error: errDet.message }
      }
    }
    return { success: true, id: cuadreId, items: lineasBase.length }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/** Guarda el conteo físico (reemplaza el detalle) y recalcula totales. */
export async function guardarConteoCuadre(
  cuadreId: number,
  lineas: { codproducto?: string | null; producto?: string | null; lote?: string | null; location?: string | null; sistema: number; conteo: number; observacion?: string | null }[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const filas = lineas.map((l) => {
      const sistema = Number(l.sistema) || 0
      const conteo = Number(l.conteo) || 0
      return {
        cuadre_id: cuadreId,
        codproducto: l.codproducto ?? null,
        producto: l.producto ?? null,
        lote: l.lote ?? null,
        location: l.location ?? null,
        sistema,
        conteo,
        diferencia: Math.round((conteo - sistema) * 100) / 100,
        observacion: l.observacion ?? null,
      }
    })
    await supabase.from("sig_inventario_cuadre_detalle").delete().eq("cuadre_id", cuadreId)
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await supabase.from("sig_inventario_cuadre_detalle").insert(filas.slice(i, i + 500))
      if (error) return { success: false, error: error.message }
    }
    const totalSistema = filas.reduce((s, r) => s + r.sistema, 0)
    const totalConteo = filas.reduce((s, r) => s + r.conteo, 0)
    const totalDif = filas.reduce((s, r) => s + r.diferencia, 0)
    const conDif = filas.filter((r) => r.diferencia !== 0).length
    await supabase
      .from("sig_inventario_cuadre")
      .update({
        total_sistema: Math.round(totalSistema * 100) / 100,
        total_conteo: Math.round(totalConteo * 100) / 100,
        total_diferencia: Math.round(totalDif * 100) / 100,
        items: filas.length,
        items_con_diferencia: conDif,
        estado: "contado",
        updated_at: new Date().toISOString(),
      })
      .eq("id", cuadreId)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function cerrarCuadre(cuadreId: number, estado: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase
      .from("sig_inventario_cuadre")
      .update({ estado, updated_at: new Date().toISOString() })
      .eq("id", cuadreId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/** Registra la firma del cliente en el acta de revisión de inventario (auditoría). */
export async function firmarCuadre(
  cuadreId: number,
  payload: { cliente_firmante?: string | null; cliente_cargo?: string | null; fecha_firma?: string | null; acta_observaciones?: string | null },
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase
      .from("sig_inventario_cuadre")
      .update({
        cliente_firmante: payload.cliente_firmante ?? null,
        cliente_cargo: payload.cliente_cargo ?? null,
        fecha_firma: payload.fecha_firma ?? null,
        acta_observaciones: payload.acta_observaciones ?? null,
        firmado: !!(payload.cliente_firmante && payload.cliente_firmante.trim()),
        updated_at: new Date().toISOString(),
      })
      .eq("id", cuadreId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarCuadre(cuadreId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_inventario_cuadre").update({ activo: false }).eq("id", cuadreId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/** Genera ajustes contabilizados desde las diferencias de un cuadre. */
export async function generarAjustesCuadre(cuadreId: number): Promise<{ success: boolean; creados?: number; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { data: cab } = await supabase.from("sig_inventario_cuadre").select("proyecto_id,fecha,responsable").eq("id", cuadreId).single()
    const { data: det } = await supabase.from("sig_inventario_cuadre_detalle").select("*").eq("cuadre_id", cuadreId)
    const conDif = (det ?? []).filter((d: any) => Number(d.diferencia) !== 0)
    if (conDif.length === 0) return { success: true, creados: 0 }
    const filas = conDif.map((d: any) => ({
      proyecto_id: (cab as any)?.proyecto_id ?? null,
      cuadre_id: cuadreId,
      fecha: (cab as any)?.fecha ?? null,
      codproducto: d.codproducto,
      producto: d.producto,
      lote: d.lote,
      cantidad: d.diferencia,
      tipo: Number(d.diferencia) < 0 ? "faltante" : "sobrante",
      motivo: "Ajuste por conteo físico (cuadre)",
      responsable: (cab as any)?.responsable ?? null,
      estado: "registrado",
    }))
    const { error } = await supabase.from("sig_inventario_ajuste").insert(filas)
    if (error) return { success: false, error: error.message }
    await supabase.from("sig_inventario_cuadre").update({ estado: "cerrado", updated_at: new Date().toISOString() }).eq("id", cuadreId)
    return { success: true, creados: filas.length }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function getAjustesInventario(
  proyectoId: number,
): Promise<{ success: boolean; data: SigInventarioAjuste[]; error?: string }> {
  try {
    if (!proyectoId) return { success: true, data: [] }
    const supabase: any = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("sig_inventario_ajuste")
      .select("*")
      .eq("proyecto_id", proyectoId)
      .eq("activo", true)
      .order("fecha", { ascending: false })
      .order("id", { ascending: false })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigInventarioAjuste[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function registrarAjusteInventario(
  proyectoId: number,
  payload: {
    id?: number
    fecha?: string | null
    codproducto?: string | null
    producto?: string | null
    lote?: string | null
    location?: string | null
    direccion?: string | null
    cod_movimiento?: string | null
    cantidad: number
    tipo: string
    motivo?: string | null
    responsable?: string | null
    soporte?: string | null
    estado?: string
  },
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!proyectoId) return { success: false, error: "Selecciona un cliente/sitio" }
    const supabase: any = await getSupabaseAdmin()
    // La dirección (ingreso/salida) define el signo: salida = − (descuenta stock).
    const dir = payload.direccion ?? (payload.cantidad < 0 ? "salida" : "ingreso")
    const cant = dir === "salida" ? -Math.abs(payload.cantidad ?? 0) : Math.abs(payload.cantidad ?? 0)
    const fila: any = {
      fecha: payload.fecha ?? null,
      codproducto: payload.codproducto ?? null,
      producto: payload.producto ?? null,
      lote: payload.lote ?? null,
      location: payload.location ?? null,
      direccion: dir,
      cod_movimiento: payload.cod_movimiento ?? null,
      cantidad: cant,
      tipo: payload.tipo ?? "correccion",
      motivo: payload.motivo ?? null,
      responsable: payload.responsable ?? null,
      soporte: payload.soporte ?? null,
      estado: payload.estado ?? "registrado",
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_inventario_ajuste").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_inventario_ajuste")
      .insert({ ...fila, proyecto_id: proyectoId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarAjusteInventario(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_inventario_ajuste").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// Hora de Colombia (UTC-5) en ISO — para invtrans.creado, igual que la operación.
function colombiaNowISO(): string {
  const now = new Date()
  return new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" })).toISOString()
}

/**
 * Postea una corrección como MOVIMIENTO REAL en invtrans (igual que la
 * operación: el trigger de la base recalcula saldoinvdetalle e invglobal).
 * Faltante/avería = Salida; sobrante/devolución = Entrada. Mueve stock.
 * Devuelve el id del movimiento generado (o null si no se pudo).
 */
async function postCorreccionInvtrans(
  supabase: any,
  ajuste: any,
  actor: string,
): Promise<{ id: number | null; error?: string }> {
  try {
    const proyectoId = Number(ajuste.proyecto_id)
    if (!proyectoId) return { id: null, error: "Sin cliente/sitio" }
    // Idempotencia: si ya existe el movimiento de ESTA corrección (marcador
    // [aj#id] en observaciones), no se vuelve a postear (evita duplicados aun
    // si no se pudo guardar invtrans_id).
    const marker = `[aj#${ajuste.id}]`
    const { data: yaExiste } = await supabase.from("invtrans").select("id").ilike("observaciones", `%${marker}%`).limit(1).maybeSingle()
    if (yaExiste?.id) return { id: Number(yaExiste.id) }
    // Siguiente id (mismo patrón que registerInventoryTransaction).
    const { data: maxRow } = await supabase.from("invtrans").select("id").order("id", { ascending: false }).limit(1).maybeSingle()
    const nextId = maxRow ? Number(maxRow.id) + 1 : 1
    // idproducto (productos.codigo) — best effort.
    let idproducto = 0
    try {
      const { data: p } = await supabase.from("productos").select("id").eq("codigo", ajuste.codproducto).maybeSingle()
      if (p?.id) idproducto = Number(p.id)
    } catch { /* sin match */ }
    // almacén del location (locations.bodega → almacenes.nombre) — best effort.
    let almacen: string | null = null
    try {
      const { data: loc } = await supabase.from("locations").select("bodega").eq("codigo", ajuste.location).maybeSingle()
      if (loc?.bodega) { const { data: alm } = await supabase.from("almacenes").select("nombre").eq("id", loc.bodega).maybeSingle(); almacen = alm?.nombre ?? null }
    } catch { /* sin almacén */ }
    // Avería = merma de proceso (Reproceso); faltante = Salida; sobrante/devolución = Entrada.
    const tipomov = ajuste.tipo === "averia" ? "Reproceso" : ajuste.direccion === "salida" ? "Salida" : "Entrada"
    const cantidad = Math.abs(Number(ajuste.cantidad) || 0)
    const insert: any = {
      id: nextId,
      idempresa: proyectoId,
      idproducto,
      codproducto: ajuste.codproducto ?? null,
      nombreproducto: ajuste.producto ?? null,
      lote: ajuste.lote ?? null,
      location: ajuste.location ?? null,
      almacen,
      cantidad,
      tipomov,
      status: "aprobado",
      origen: "transaccion manual", // mismo origen que la operación → trigger ajusta saldo
      observaciones: `Corrección de inventario${ajuste.cuadre_id ? ` · cuadre #${ajuste.cuadre_id}` : ""} · ${ajuste.tipo}${ajuste.motivo ? " · " + ajuste.motivo : ""} ${marker}`,
      cod_movimiento: ajuste.cod_movimiento ?? null,
      creadopor: actor,
      creado: colombiaNowISO(),
    }
    const { error } = await supabase.from("invtrans").insert([insert])
    if (error) return { id: null, error: error.message }
    // Reproceso (avería) también se refleja en la tabla reprocesos (merma de proceso).
    if (tipomov === "Reproceso") {
      try {
        await supabase.from("reprocesos").insert([{ idempresa: proyectoId, lote: ajuste.lote, producto: ajuste.producto, codproducto: ajuste.codproducto, cantidad, creado: colombiaNowISO(), creadopor: actor }])
      } catch { /* tabla opcional */ }
    }
    return { id: nextId }
  } catch (err: any) {
    return { id: null, error: err?.message || "Error al postear el movimiento" }
  }
}

// Marca la corrección como aprobada. Si la columna invtrans_id aún no existe
// (SQL 19 sin la última versión), hace fallback sin ella para no fallar.
async function marcarAjusteAprobado(
  supabase: any,
  id: number,
  aprobadoPor: string,
  invtransId: number | null,
): Promise<{ error?: string }> {
  const base = { estado: "aprobado", aprobado_por: aprobadoPor, aprobado_fecha: new Date().toISOString() }
  const r1 = await supabase.from("sig_inventario_ajuste").update({ ...base, invtrans_id: invtransId }).eq("id", id)
  if (!r1.error) return {}
  // Reintento sin invtrans_id (columna ausente). La idempotencia la cubre el marcador.
  const r2 = await supabase.from("sig_inventario_ajuste").update(base).eq("id", id)
  if (r2.error) return { error: r2.error.message }
  return {}
}

/**
 * Aprueba una corrección: registra quién/cuándo y POSTEA el movimiento real
 * en invtrans (mueve stock). Idempotente: si ya tiene invtrans_id, no re-postea.
 */
export async function aprobarAjusteInventario(
  id: number,
  aprobadoPor: string,
): Promise<{ success: boolean; invtransId?: number | null; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { data: aj } = await supabase.from("sig_inventario_ajuste").select("*").eq("id", id).single()
    if (!aj) return { success: false, error: "Corrección no encontrada" }
    let invtransId: number | null = aj.invtrans_id ?? null
    if (!invtransId) {
      const r = await postCorreccionInvtrans(supabase, aj, aprobadoPor)
      if (r.error) return { success: false, error: `No se pudo mover el stock: ${r.error}` }
      invtransId = r.id
    }
    const ok = await marcarAjusteAprobado(supabase, id, aprobadoPor, invtransId)
    if (ok.error) return { success: false, error: ok.error }
    return { success: true, invtransId }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/**
 * Cierre mensual del cuadre: aprueba y postea a invtrans TODAS las correcciones
 * pendientes del cuadre (mueve stock → físico = sistema) y marca el cuadre como
 * aprobado. El Acta firmada por el cliente es el soporte del cierre.
 */
export async function cerrarMesCuadre(
  cuadreId: number,
  actor: string,
): Promise<{ success: boolean; posteados?: number; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { data: ajustes } = await supabase
      .from("sig_inventario_ajuste")
      .select("*")
      .eq("cuadre_id", cuadreId)
      .eq("activo", true)
    let posteados = 0
    for (const aj of ajustes ?? []) {
      if (aj.invtrans_id) continue // ya posteado
      const r = await postCorreccionInvtrans(supabase, aj, actor)
      if (r.error) return { success: false, posteados, error: `Corrección ${aj.id}: ${r.error}` }
      await marcarAjusteAprobado(supabase, aj.id, actor, r.id)
      posteados++
    }
    await supabase.from("sig_inventario_cuadre").update({ estado: "aprobado", updated_at: new Date().toISOString() }).eq("id", cuadreId)
    return { success: true, posteados }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/**
 * Catálogo de productos con stock del cliente (saldoinvdetalle) para PRECARGAR
 * el formulario de ajuste: el usuario digita el código y aparece el producto,
 * con sus lotes y ubicaciones reales (respeta la configuración de LIPgo).
 */
export async function getProductosInventario(
  proyectoId: number,
): Promise<{
  success: boolean
  data: Array<{
    codproducto: string
    nombreproducto: string
    stock: number
    lotes: string[]
    locations: string[]
    porUbicacion: Array<{ lote: string; location: string; stock: number }>
  }>
  error?: string
}> {
  try {
    if (!proyectoId) return { success: true, data: [] }
    const supabase: any = await getSupabaseAdmin()
    const rows: any[] = []
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase
        .from("saldoinvdetalle")
        .select("codproducto,nombreproducto,lote,location,stock_actual")
        .eq("idempresa", proyectoId)
        .range(from, from + 999)
      if (error) return { success: false, data: [], error: error.message }
      if (!data || data.length === 0) break
      rows.push(...data)
      if (data.length < 1000) break
    }
    const map: Record<string, any> = {}
    for (const r of rows) {
      const cod = String(r.codproducto ?? "").trim()
      if (!cod) continue
      if (!map[cod]) map[cod] = { codproducto: cod, nombreproducto: r.nombreproducto ?? "", stock: 0, lotes: new Set<string>(), locations: new Set<string>(), porUbicacion: [] as any[] }
      const m = map[cod]
      const s = Number(r.stock_actual) || 0
      m.stock += s
      if (r.lote) m.lotes.add(String(r.lote))
      if (r.location) m.locations.add(String(r.location))
      if (!m.nombreproducto && r.nombreproducto) m.nombreproducto = r.nombreproducto
      m.porUbicacion.push({ lote: r.lote ?? "", location: r.location ?? "", stock: s })
    }
    const data = Object.values(map)
      .map((m: any) => ({
        codproducto: m.codproducto,
        nombreproducto: m.nombreproducto,
        stock: Math.round(m.stock * 100) / 100,
        lotes: Array.from(m.lotes).sort() as string[],
        locations: Array.from(m.locations).sort() as string[],
        porUbicacion: m.porUbicacion,
      }))
      .sort((a: any, b: any) => a.nombreproducto.localeCompare(b.nombreproducto))
    return { success: true, data }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Satisfacción del cliente y partes interesadas + PQRSF (ISO 9001 9.1.2)
// ---------------------------------------------------------------------------

export async function getSatisfaccion(
  proyectoId?: number | null,
  tipo?: string | null,
): Promise<{ success: boolean; data: SigSatisfaccion[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    let q = supabase.from("sig_satisfaccion").select("*").eq("activo", true)
    if (proyectoId) q = q.eq("proyecto_id", proyectoId)
    else q = q.in("proyecto_id", SIG_CLIENTES_LIP)
    if (tipo) q = q.eq("tipo", tipo)
    const { data, error } = await q.order("fecha", { ascending: false }).order("id", { ascending: false })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigSatisfaccion[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function upsertSatisfaccion(
  proyectoId: number,
  payload: Partial<SigSatisfaccion> & { tipo: string; calificacion: number },
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!proyectoId) return { success: false, error: "Selecciona un cliente/sitio" }
    const supabase: any = await getSupabaseAdmin()
    const fila: any = {
      tipo: payload.tipo ?? "cliente",
      fecha: payload.fecha ?? null,
      periodo: payload.periodo ?? null,
      encuestado: payload.encuestado ?? null,
      calificacion: payload.calificacion ?? null,
      oportunidad: payload.oportunidad ?? null,
      calidad: payload.calidad ?? null,
      comunicacion: payload.comunicacion ?? null,
      recomendaria: payload.recomendaria ?? null,
      comentario: payload.comentario ?? null,
      canal: payload.canal ?? null,
      responsable: payload.responsable ?? null,
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_satisfaccion").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_satisfaccion")
      .insert({ ...fila, proyecto_id: proyectoId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarSatisfaccion(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_satisfaccion").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function getPQRSF(
  proyectoId?: number | null,
): Promise<{ success: boolean; data: SigPQRSF[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    let q = supabase.from("sig_pqrsf").select("*").eq("activo", true)
    if (proyectoId) q = q.eq("proyecto_id", proyectoId)
    else q = q.in("proyecto_id", SIG_CLIENTES_LIP)
    const { data, error } = await q.order("fecha", { ascending: false }).order("id", { ascending: false })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigPQRSF[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function upsertPQRSF(
  proyectoId: number,
  payload: Partial<SigPQRSF> & { tipo: string; descripcion: string },
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!proyectoId) return { success: false, error: "Selecciona un cliente/sitio" }
    if (!payload.descripcion?.trim()) return { success: false, error: "La descripción es obligatoria" }
    const supabase: any = await getSupabaseAdmin()
    // Días de respuesta si hay fecha y cierre.
    let dias: number | null = payload.dias_respuesta ?? null
    if (payload.fecha && payload.fecha_cierre) {
      const d = Math.round((new Date(payload.fecha_cierre).getTime() - new Date(payload.fecha).getTime()) / 86400000)
      if (!Number.isNaN(d)) dias = d
    }
    const fila: any = {
      fecha: payload.fecha ?? null,
      tipo: payload.tipo ?? "queja",
      parte_interesada: payload.parte_interesada ?? "cliente",
      canal: payload.canal ?? null,
      descripcion: payload.descripcion.trim(),
      responsable: payload.responsable ?? null,
      estado: payload.estado ?? "abierta",
      respuesta: payload.respuesta ?? null,
      fecha_compromiso: payload.fecha_compromiso ?? null,
      fecha_cierre: payload.fecha_cierre ?? null,
      dias_respuesta: dias,
      genera_nc: payload.genera_nc ?? false,
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_pqrsf").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_pqrsf")
      .insert({ ...fila, proyecto_id: proyectoId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarPQRSF(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_pqrsf").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Panel LIP · Gestión Humana — talento que presta el servicio. Armónico con
// las 3 normas: ISO 9001 (7.1.2 personas / 7.2 competencia / 7.3 conciencia),
// ISO 45001 (accidentalidad/ausentismo), ISO 14001 (formación ambiental).
// Por cliente/sitio. Fuente: headcount, registroasistencia, ausentismosst,
// capacitaciones_evaluacion_intentos.
// ---------------------------------------------------------------------------
export async function getPanelGestionHumanaLIP(
  proyectoId?: number | null,
  anio?: string | null,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const clientes: number[] = proyectoId ? [proyectoId] : SIG_CLIENTES_LIP
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
    const enAnio = (f: any) => !anio || String(f || "").slice(0, 4) === anio

    // --- Talento (headcount) ---
    const { data: hc } = await supabase
      .from("headcount")
      .select("id,idempresa,cargo,estado,contrato,examenes_ing,afiliacion_arl")
      .in("idempresa", clientes)
    const hcRows: any[] = hc ?? []
    const activos = hcRows.filter((r) => String(r.estado || "").toLowerCase() === "activo")
    const inactivos = hcRows.length - activos.length
    const idoneos = activos.filter((r) => r.contrato && r.examenes_ing && r.afiliacion_arl).length

    // --- Formación / toma de conciencia (intentos de evaluación, vía headcount) ---
    const hcIds = hcRows.map((r) => r.id)
    let aprob = 0, totalInt = 0
    const capacitadosSet = new Set<number>()
    if (hcIds.length > 0) {
      const { data: intentos } = await supabase
        .from("capacitaciones_evaluacion_intentos")
        .select("headcount_id,aprobado,fecha")
        .in("headcount_id", hcIds)
      for (const it of intentos ?? []) {
        if (!enAnio(it.fecha)) continue
        totalInt++
        if (it.aprobado) { aprob++; capacitadosSet.add(it.headcount_id) }
      }
    }

    // --- Asistencia diaria (registroasistencia) = fuente de verdad ---
    // Cubre los 4 proyectos. De aquí salen jornada, ausentismo y retiros.
    const asisRows: any[] = []
    let aFrom = 0
    while (true) {
      let q = supabase.from("registroasistencia").select("fecha,puesto,asistencia,identificacion").in("idempresa", clientes).range(aFrom, aFrom + 999)
      if (anio) q = q.gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`)
      const { data } = await q
      asisRows.push(...(data ?? []))
      if (!data || data.length < 1000) break
      aFrom += 1000
      if (aFrom > 120000) break
    }
    const esAusentismo = (a: any) => String(a || "").toLowerCase().includes("incapacidad") // ausentismo médico (incapacidades)
    const asisProgramados = asisRows.filter((r) => r.puesto !== null || r.asistencia !== null).length
    const asisPresentes = asisRows.filter((r) => r.asistencia === null && r.puesto !== null).length
    const asisAusencias = asisRows.filter((r) => esAusentismo(r.asistencia)).length
    // Retiros = PERSONAS distintas con novedad "Retiro" (incluye apoyo de picos,
    // no solo salidas definitivas). Se reporta como conteo, no como % de rotación.
    const retiros = new Set(asisRows.filter((r) => String(r.asistencia || "").toLowerCase().includes("retiro")).map((r) => r.identificacion)).size
    const asisTotal = asisProgramados
    // Planta acordada (base de cobertura).
    let plantaGH = 0
    for (const id of clientes) plantaGH += PLANTA_ACORDADA[id]?.total || 0

    // --- Accidentalidad / ausentismo (ausentismosst) ---
    const { data: au } = await supabase
      .from("ausentismosst")
      .select("tipo_evento,total_dias_incapacidad,costos_empresa,fecha_inicial,requiere_revision_sst")
      .in("idempresa", clientes)
    let diasAT = 0, casosAT = 0, diasEG = 0, casosEG = 0, costos = 0, osteomuscular = 0
    for (const r of au ?? []) {
      if (!enAnio(r.fecha_inicial)) continue
      const dias = Number(r.total_dias_incapacidad) || 0
      costos += Number(r.costos_empresa) || 0
      if (r.requiere_revision_sst) osteomuscular++
      if (r.tipo_evento === "AT") { diasAT += dias; casosAT++ }
      else { diasEG += dias; casosEG++ }
    }

    // Distribución headcount por cargo (top).
    const cargos: Record<string, number> = {}
    for (const r of activos) { const c = r.cargo || "(sin cargo)"; cargos[c] = (cargos[c] || 0) + 1 }
    const porCargo = Object.entries(cargos).map(([cargo, n]) => ({ cargo, n })).sort((a, b) => b.n - a.n).slice(0, 8)

    return {
      success: true,
      data: {
        talento: {
          activos: activos.length,
          inactivos, // incluye retiros definitivos + personal de apoyo para picos
          vinculados: hcRows.length,
          planta: plantaGH,
          // Cobertura de planta = activos vs planta acordada (métrica confiable).
          cobertura: plantaGH > 0 ? pct(activos.length, plantaGH) : 0,
          // Retiros = personas distintas con novedad "Retiro" en el periodo (conteo).
          retiros,
          // Ausentismo real desde el control diario de asistencia (todos los proyectos).
          ausentismo: pct(asisAusencias, asisProgramados),
          ausencias: asisAusencias,
          idoneidad: pct(idoneos, activos.length),
          idoneos,
        },
        formacion: {
          aprobadas: pct(aprob, totalInt),
          intentos: totalInt,
          colaboradoresCapacitados: capacitadosSet.size,
          coberturaFormacion: pct(capacitadosSet.size, activos.length),
        },
        jornada: { cumplimiento: pct(asisPresentes, asisTotal), presentes: asisPresentes, total: asisTotal },
        sst: { casosAT, diasAT, casosEG, diasEG, costos: Math.round(costos), osteomuscular },
        porCargo,
        ausentismoPorTipo: [
          { tipo: "Accidente trabajo (AT)", dias: diasAT, casos: casosAT },
          { tipo: "Enfermedad general (EG)", dias: diasEG, casos: casosEG },
        ],
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Mapa de Interacción del Proceso (sig_proceso_interaccion) — guía auditor
// ---------------------------------------------------------------------------

export async function getProcesoInteraccion(
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; data: SigProcesoInteraccion[]; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const { data, error } = await supabase
      .from("sig_proceso_interaccion")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("activo", true)
      .order("orden", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as SigProcesoInteraccion[] }
  } catch (err: any) {
    return { success: false, data: [], error: err?.message || "Error desconocido" }
  }
}

export async function upsertProcesoInteraccion(
  payload: {
    id?: number
    orden: number
    fase: string
    paso: string
    responsable?: string | null
    es_valor_agregado?: boolean | null
    accion_lipgo?: string | null
    modulo_lipgo?: string | null
    evidencia?: string | null
    campo_dato?: string | null
    norma_iso?: string | null
  },
  empresaIdFromClient?: number | null,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!payload.fase?.trim() || !payload.paso?.trim())
      return { success: false, error: "Fase y paso son obligatorios" }
    const supabase: any = await getSupabaseAdmin()
    const empresaId = await resolveEmpresaId(empresaIdFromClient)
    const fila: any = {
      orden: payload.orden ?? 99,
      fase: payload.fase.trim(),
      paso: payload.paso.trim(),
      responsable: payload.responsable ?? "lip",
      es_valor_agregado: payload.es_valor_agregado ?? false,
      accion_lipgo: payload.accion_lipgo ?? null,
      modulo_lipgo: payload.modulo_lipgo ?? null,
      evidencia: payload.evidencia ?? null,
      campo_dato: payload.campo_dato ?? null,
      norma_iso: payload.norma_iso ?? null,
    }
    if (payload.id) {
      const { error } = await supabase.from("sig_proceso_interaccion").update(fila).eq("id", payload.id)
      if (error) return { success: false, error: error.message }
      return { success: true, id: payload.id }
    }
    const { data, error } = await supabase
      .from("sig_proceso_interaccion")
      .insert({ ...fila, idempresa: empresaId, activo: true })
      .select("id")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: (data as any)?.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

export async function eliminarProcesoInteraccion(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: "id requerido" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("sig_proceso_interaccion").update({ activo: false }).eq("id", id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

// ---------------------------------------------------------------------------
// Panel LIP · Operación de cargue/descargue (dashboard de gestión de LIP como
// operador, NO del cliente). Enfoque ISO 9001 8.5/8.6/9.1. Filtrable por
// cliente/sitio y periodo. Tres focos: (A) servicio LIP, (B) personas que
// prestan el servicio, (C) valor agregado de LIPgo (trazabilidad/soportes).
// ---------------------------------------------------------------------------
export async function getPanelOperacionLIP(
  proyectoId?: number | null,
  desde?: string | null,
  hasta?: string | null,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const clientes: number[] = proyectoId ? [proyectoId] : SIG_CLIENTES_LIP
    const nombres: Record<number, string> = {}
    {
      const { data: emps } = await supabase.from("empresas").select("id,nombre").in("id", clientes)
      for (const e of emps ?? []) nombres[e.id] = e.nombre
    }

    // --- Órdenes (cabeceraoc): traer columnas necesarias y agregar en memoria ---
    let q = supabase
      .from("cabeceraoc")
      .select("idempresa,fechaorden,tipooperacion,pesovascula,iniciocargue,fincargue,fotospicking,pdfoc,doccargue,status,ordendecargue,estadofactura,fechacargue,placa,cliente,transporte")
      .in("idempresa", clientes)
      .limit(10000)
    if (desde) q = q.gte("fechaorden", desde)
    if (hasta) q = q.lte("fechaorden", hasta)
    const { data: rowsRaw, error } = await q
    if (error) return { success: false, error: error.message }
    const rows: any[] = rowsRaw ?? []

    const aMin = (s: string) => {
      const [h, m, sec] = String(s).split(":").map(Number)
      return h * 60 + m + (sec || 0) / 60
    }
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

    const tot = rows.length
    const finc = rows.filter((r) => r.fincargue).length
    const evid = rows.filter((r) => r.fotospicking && String(r.fotospicking).length > 2).length
    const ciclo = rows.filter((r) => r.status && String(r.status).toLowerCase() === "finalizado").length
    const pdfO = rows.filter((r) => r.pdfoc).length
    const pdfP = rows.filter((r) => r.doccargue).length
    const ton = rows.reduce((s, r) => s + (Number(r.pesovascula) || 0), 0)
    const durs = rows
      .filter((r) => r.iniciocargue && r.fincargue)
      .map((r) => aMin(r.fincargue) - aMin(r.iniciocargue))
      .filter((d) => d > 0 && d < 600)
    const tiempo = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0

    // Cumplimiento de META de tonelaje (vs EMPRESA_META_DIA_TON × días operativos por cliente).
    const diasPorCliente: Record<number, Set<string>> = {}
    for (const r of rows) {
      const id = r.idempresa
      if (!diasPorCliente[id]) diasPorCliente[id] = new Set()
      if (r.fechaorden) diasPorCliente[id].add(String(r.fechaorden))
    }
    let metaPeriodo = 0
    for (const id of Object.keys(diasPorCliente)) {
      metaPeriodo += getMetaDiaForEmpresa(Number(id)) * diasPorCliente[Number(id)].size
    }
    const cumplimientoMeta = metaPeriodo > 0 ? Math.round((ton / metaPeriodo) * 1000) / 10 : 0

    // Series por mes (últimos 12)
    const mes: Record<string, { ordenes: number; toneladas: number }> = {}
    for (const r of rows) {
      const k = String(r.fechaorden || "").slice(0, 7)
      if (!k) continue
      mes[k] = mes[k] || { ordenes: 0, toneladas: 0 }
      mes[k].ordenes++
      mes[k].toneladas += Number(r.pesovascula) || 0
    }
    const porMes = Object.entries(mes)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([m, v]) => ({ mes: m, ordenes: v.ordenes, toneladas: Math.round(v.toneladas) }))

    // Por tipo de operación
    const tipo: Record<string, number> = {}
    for (const r of rows) {
      const t = r.tipooperacion || "(sin tipo)"
      tipo[t] = (tipo[t] || 0) + 1
    }
    const porTipo = Object.entries(tipo)
      .map(([t, n]) => ({ tipo: t, ordenes: n }))
      .sort((a, b) => b.ordenes - a.ordenes)

    // Por cliente (solo cuando se ven todos)
    let porCliente: any[] = []
    if (!proyectoId) {
      const cl: Record<number, { ordenes: number; toneladas: number; finc: number }> = {}
      for (const r of rows) {
        const id = r.idempresa
        cl[id] = cl[id] || { ordenes: 0, toneladas: 0, finc: 0 }
        cl[id].ordenes++
        cl[id].toneladas += Number(r.pesovascula) || 0
        if (r.fincargue) cl[id].finc++
      }
      porCliente = Object.entries(cl)
        .map(([id, v]) => ({
          cliente: nombres[Number(id)] || `Empresa ${id}`,
          ordenes: v.ordenes,
          toneladas: Math.round(v.toneladas),
          cumplimiento: pct(v.finc, v.ordenes),
        }))
        .sort((a, b) => b.ordenes - a.ordenes)
    }

    // (B) Personas que prestan el servicio (gestión propia de LIP)
    const headCount = async (build: (q: any) => any): Promise<number> => {
      let qq = supabase.from("headcount").select("*", { count: "exact", head: true }).in("idempresa", clientes)
      qq = build(qq)
      const { count } = await qq
      return count || 0
    }
    const activos = await headCount((qq: any) => qq.ilike("estado", "activo"))
    const inactivos = await headCount((qq: any) => qq.not("estado", "ilike", "activo"))

    // Asistencia del periodo (cumplimiento de jornada): asistencia NULL = presente
    const asisCount = async (build: (q: any) => any): Promise<number> => {
      let qq = supabase.from("registroasistencia").select("*", { count: "exact", head: true }).in("idempresa", clientes)
      if (desde) qq = qq.gte("fecha", desde)
      if (hasta) qq = qq.lte("fecha", hasta)
      qq = build(qq)
      const { count } = await qq
      return count || 0
    }
    const asisTotal = await asisCount((qq: any) => qq)
    const asisPresentes = await asisCount((qq: any) => qq.is("asistencia", null))

    // --- SLA de tiempos por vehículo (Acuerdos de Servicio acordados) ---
    // Tiempo efectivo (fincargue−iniciocargue) vs el SLA acordado para el tipo
    // de vehículo. Tipo desde citasvehiculos (ocargue = cabeceraoc.ordendecargue).
    const { data: citasSla } = await supabase
      .from("citasvehiculos")
      .select("ocargue,tipovehiculo")
      .in("idempresa", clientes)
    const tipoPorOc: Record<string, string> = {}
    for (const c of citasSla ?? []) if (c.ocargue) tipoPorOc[String(c.ocargue)] = c.tipovehiculo
    const slaTipoMap: Record<string, { sumaReal: number; n: number; ok: number; sla: number }> = {}
    const slaMesMap: Record<string, { ok: number; n: number }> = {}
    const fueraDeSla: any[] = []
    let slaOk = 0
    let slaTot = 0
    for (const r of rows) {
      if (!r.iniciocargue || !r.fincargue) continue
      const tv = tipoPorOc[String(r.ordendecargue)]
      const max = getSlaCargueMin(tv, "PT")
      if (!max) continue
      const real = aMin(r.fincargue) - aMin(r.iniciocargue)
      if (real <= 0 || real > 600) continue
      slaTot++
      const cumple = real <= max
      if (cumple) slaOk++
      const tkey = tv || "(sin tipo)"
      slaTipoMap[tkey] = slaTipoMap[tkey] || { sumaReal: 0, n: 0, ok: 0, sla: max }
      slaTipoMap[tkey].sumaReal += real
      slaTipoMap[tkey].n++
      if (cumple) slaTipoMap[tkey].ok++
      const mk = String(r.fechaorden || "").slice(0, 7)
      if (mk) {
        slaMesMap[mk] = slaMesMap[mk] || { ok: 0, n: 0 }
        slaMesMap[mk].n++
        if (cumple) slaMesMap[mk].ok++
      }
      if (!cumple) fueraDeSla.push({ fecha: r.fechaorden, tipo: tkey, real: Math.round(real), sla: max, exceso: Math.round(real - max) })
    }
    const slaPorTipo = Object.entries(slaTipoMap)
      .map(([tipo, v]) => ({ tipo, sla: v.sla, real: Math.round(v.sumaReal / v.n), total: v.n, fuera: v.n - v.ok, cumplimiento: pct(v.ok, v.n) }))
      .sort((a, b) => b.total - a.total)
    const slaPorMes = Object.entries(slaMesMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([mes, v]) => ({ mes, cumplimiento: pct(v.ok, v.n) }))
    fueraDeSla.sort((a, b) => b.exceso - a.exceso)

    // Satisfacción del conductor (parte interesada que gestiona el coordinador).
    const { data: satRows } = await supabase
      .from("sig_satisfaccion")
      .select("calificacion")
      .eq("activo", true)
      .eq("tipo", "conductor")
      .in("proyecto_id", clientes)
    const satVals = (satRows ?? []).map((r: any) => Number(r.calificacion) || 0).filter((x: number) => x > 0)
    const satConductor = satVals.length ? Math.round((satVals.reduce((a: number, b: number) => a + b, 0) / satVals.length / 5) * 1000) / 10 : 0

    // Cobertura de calificación = cargues finalizados calificados (objetivo del coordinador).
    const finalizados = rows.filter((r) => r.fincargue).length
    const { data: califRows } = await supabase
      .from("sig_satisfaccion")
      .select("ref_orden")
      .eq("tipo", "conductor")
      .not("ref_orden", "is", null)
      .in("proyecto_id", clientes)
    const ordenesCalif = new Set((califRows ?? []).map((c: any) => String(c.ref_orden)))
    const calificados = rows.filter((r) => r.fincargue && ordenesCalif.has(String(r.ordendecargue))).length
    const coberturaCalificacion = pct(calificados, finalizados)

    // Cobertura de planta (activos vs planta acordada de los clientes en alcance).
    let plantaAcordada = 0
    for (const id of clientes) plantaAcordada += PLANTA_ACORDADA[id]?.total || 0
    const coberturaPlanta = plantaAcordada > 0 ? pct(activos, plantaAcordada) : 0

    // Ausentismo médico del equipo (incapacidad / turnos del periodo).
    const ausIncap = await asisCount((qq: any) => qq.ilike("asistencia", "%incapacidad%"))
    const ausentismo = pct(ausIncap, asisTotal)

    // --- Facturación PENDIENTE POR SOLICITAR (responsabilidad del coordinador) ---
    // Solo las órdenes que el coordinador AÚN NO solicitó facturar (estadofactura
    // null). Cuando solicita (CF)/confirma pago (SF) pasa a la parte financiera.
    // No aplica a proyecciones ni tolva. Valor desde la tabla facturacion
    // (empresas 1-2: MAX peso × MAX tarifa; resto: suma valor_a_facturar).
    const esFacturable = (t: any) => {
      const x = String(t || "").toLowerCase()
      return x && x !== "proyeccion" && x !== "tolva"
    }
    // Solo "este mes en adelante": el backlog de meses pasados se considera
    // cerrado/cumplido y no se cuenta como pendiente vigente. Si el usuario
    // elige un rango con el filtro (desde), se respeta ese rango.
    const mesIniFact = (() => {
      const h = new Date()
      return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-01`
    })()
    const factFloor = desde || mesIniFact
    const opsFacturables = rows.filter(
      (r) => esFacturable(r.tipooperacion) && String(r.fechacargue || r.fechaorden || "").slice(0, 10) >= factFloor,
    )
    const gestionadas = opsFacturables.filter((r) => r.estadofactura).length
    const facturacionPct = pct(gestionadas, opsFacturables.length)
    const pendRows = opsFacturables.filter((r) => !r.estadofactura)
    const pendIds = Array.from(new Set(pendRows.map((r) => String(r.ordendecargue)).filter(Boolean)))
    const valorPorOrden: Record<string, number> = {}
    if (pendIds.length) {
      const { data: fact } = await supabase
        .from("facturacion")
        .select("numeroorden, pesobascula, tarifa, valor_a_facturar, idempresa")
        .in("numeroorden", pendIds)
      const byOrden: Record<string, any[]> = {}
      for (const f of fact ?? []) {
        const k = String(f.numeroorden)
        if (!byOrden[k]) byOrden[k] = []
        byOrden[k].push(f)
      }
      for (const [oc, fs] of Object.entries(byOrden)) {
        const emp = Number(fs[0].idempresa)
        const v =
          emp === 1 || emp === 2
            ? Math.max(...fs.map((x) => Number(x.pesobascula) || 0)) * Math.max(...fs.map((x) => Number(x.tarifa) || 0))
            : fs.reduce((s, x) => s + (Number(x.valor_a_facturar) || 0), 0)
        valorPorOrden[oc] = Math.round(v)
      }
    }
    const hoyTs = Date.parse(new Date().toISOString().slice(0, 10))
    const pendientesFact = pendRows
      .map((r) => {
        const fc = r.fechacargue || r.fechaorden
        const dias = fc ? Math.max(0, Math.floor((hoyTs - Date.parse(String(fc).slice(0, 10))) / 86400000)) : 0
        return {
          orden: r.ordendecargue,
          fecha: fc,
          placa: r.placa || null,
          cliente: r.cliente || null,
          transporte: r.transporte || null,
          toneladas: Math.round((Number(r.pesovascula) || 0) * 10) / 10,
          valor: valorPorOrden[String(r.ordendecargue)] || 0,
          dias,
        }
      })
      .sort((a, b) => b.dias - a.dias)
    const valorPendiente = pendientesFact.reduce((s, p) => s + p.valor, 0)
    const valorRiesgo = pendientesFact.filter((p) => p.dias > 8).reduce((s, p) => s + p.valor, 0)
    const diasMax = pendientesFact.reduce((m, p) => Math.max(m, p.dias), 0)

    return {
      success: true,
      data: {
        servicioLIP: {
          ordenes: tot,
          toneladas: Math.round(ton * 10) / 10,
          cumplimiento: pct(finc, tot),
          tiempoCargue: tiempo,
          evidencia: pct(evid, tot),
          productividad: tot > 0 ? Math.round((ton / tot) * 100) / 100 : 0, // ton/orden
          cumplimientoMeta,                       // % ejecutado vs meta de tonelaje
          metaPeriodo: Math.round(metaPeriodo),   // meta del periodo (ton)
        },
        personas: {
          activos,
          inactivos,
          rotacion: pct(inactivos, activos + inactivos),
          asistencia: pct(asisPresentes, asisTotal),
          asistenciaBase: `${asisPresentes}/${asisTotal}`,
          coberturaPlanta,
          plantaAcordada,
          ausentismo,
        },
        valorAgregado: {
          pdfOrden: pct(pdfO, tot),
          pdfPicking: pct(pdfP, tot),
          evidenciaFoto: pct(evid, tot),
          cicloRegistrado: pct(ciclo, tot),
        },
        sla: {
          pct: slaTot > 0 ? pct(slaOk, slaTot) : 0,
          total: slaTot,
          ok: slaOk,
          porTipo: slaPorTipo,
          porMes: slaPorMes,
          fuera: fueraDeSla.slice(0, 20),
        },
        satConductor,
        coberturaCalificacion,
        calificados,
        finalizados,
        facturacion: {
          pct: facturacionPct, // % de operaciones ya gestionadas (solicitadas) por el coordinador
          pendientesCount: pendientesFact.length,
          valorPendiente,
          valorRiesgo, // pendiente con > 8 días sin solicitar
          diasMax,
          pendientes: pendientesFact.slice(0, 50),
        },
        porMes,
        porTipo,
        porCliente,
        verTodos: !proyectoId,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/**
 * Indicador de FACTURACIÓN POR PROYECTOS (módulo Gestión Financiera).
 * Compara los 4 proyectos: % de gestión de facturación (solicitadas/total),
 * pendientes por solicitar y valor pendiente. Piso = mes actual (o `desde`):
 * el backlog histórico se considera cerrado y no distorsiona el indicador.
 */
export async function getFacturacionPorProyecto(
  desde?: string | null,
  hasta?: string | null,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const clientes = SIG_CLIENTES_LIP
    const nombres: Record<number, string> = {}
    {
      const { data: emps } = await supabase.from("empresas").select("id,nombre").in("id", clientes)
      for (const e of emps ?? []) nombres[e.id] = e.nombre
    }
    const mesIni = (() => {
      const h = new Date()
      return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-01`
    })()
    const floor = desde || mesIni
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

    let q = supabase
      .from("cabeceraoc")
      .select("idempresa, ordendecargue, estadofactura, tipooperacion, fechacargue, fechaorden, pesovascula")
      .in("idempresa", clientes)
      .gte("fechaorden", floor)
      .limit(20000)
    if (hasta) q = q.lte("fechaorden", hasta)
    const { data: rows, error } = await q
    if (error) return { success: false, error: error.message }
    const esFact = (t: any) => {
      const x = String(t || "").toLowerCase()
      return x && x !== "proyeccion" && x !== "tolva"
    }
    const facturables = (rows ?? []).filter((r: any) => esFact(r.tipooperacion))
    const pend = facturables.filter((r: any) => !r.estadofactura)
    const pendIds = Array.from(new Set(pend.map((r: any) => String(r.ordendecargue)).filter(Boolean)))
    const valorPorOrden: Record<string, number> = {}
    for (let i = 0; i < pendIds.length; i += 400) {
      const chunk = pendIds.slice(i, i + 400)
      const { data: fact } = await supabase
        .from("facturacion")
        .select("numeroorden, pesobascula, tarifa, valor_a_facturar, idempresa")
        .in("numeroorden", chunk)
      const byO: Record<string, any[]> = {}
      for (const f of fact ?? []) {
        const k = String(f.numeroorden)
        if (!byO[k]) byO[k] = []
        byO[k].push(f)
      }
      for (const [oc, fs] of Object.entries(byO)) {
        const emp = Number(fs[0].idempresa)
        const v =
          emp === 1 || emp === 2
            ? Math.max(...fs.map((x) => Number(x.pesobascula) || 0)) * Math.max(...fs.map((x) => Number(x.tarifa) || 0))
            : fs.reduce((s, x) => s + (Number(x.valor_a_facturar) || 0), 0)
        valorPorOrden[oc] = Math.round(v)
      }
    }
    const hoyTs = Date.parse(new Date().toISOString().slice(0, 10))
    const map: Record<number, any> = {}
    for (const r of facturables) {
      const id = r.idempresa
      if (!map[id]) map[id] = { idempresa: id, proyecto: nombres[id] || `Empresa ${id}`, facturables: 0, pendientes: 0, valorPendiente: 0, valorRiesgo: 0, diasMax: 0 }
      const m = map[id]
      m.facturables++
      if (!r.estadofactura) {
        m.pendientes++
        const v = valorPorOrden[String(r.ordendecargue)] || 0
        m.valorPendiente += v
        const fc = r.fechacargue || r.fechaorden
        const dias = fc ? Math.max(0, Math.floor((hoyTs - Date.parse(String(fc).slice(0, 10))) / 86400000)) : 0
        if (dias > 8) m.valorRiesgo += v
        if (dias > m.diasMax) m.diasMax = dias
      }
    }
    const proyectos = clientes.map((id) => {
      const m = map[id] || { idempresa: id, proyecto: nombres[id] || `Empresa ${id}`, facturables: 0, pendientes: 0, valorPendiente: 0, valorRiesgo: 0, diasMax: 0 }
      return { ...m, pct: pct(m.facturables - m.pendientes, m.facturables) }
    })
    const totFact = proyectos.reduce((s, p) => s + p.facturables, 0)
    const totPend = proyectos.reduce((s, p) => s + p.pendientes, 0)
    const totales = {
      facturables: totFact,
      pendientes: totPend,
      valorPendiente: proyectos.reduce((s, p) => s + p.valorPendiente, 0),
      valorRiesgo: proyectos.reduce((s, p) => s + p.valorRiesgo, 0),
      pct: pct(totFact - totPend, totFact),
    }
    const periodoLabel = new Date().toLocaleDateString("es-CO", { month: "long", year: "numeric" })
    return { success: true, data: { proyectos, totales, periodoLabel } }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/**
 * CONCILIACIÓN MENSUAL de inventario (depuración mes a mes).
 * Mes tomado del CÓDIGO de la orden. Modelo:
 *   INGRESOS = producción/descargue + devolución.
 *   SALIDAS  = cargue (601) + merma/reproceso (551).
 * Cierres persistidos en sig_inventario_cierre_mes + PDF en Storage.
 */
const RE_ORDEN = /^(?:dis-)?[a-z]+(\d{4})(\d{2})(\d{2})\d+[a-z]?$/i
export async function getConciliacionMensualInventario(
  empresaId?: number | null,
  anio?: string | null,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (!empresaId) {
      return { success: false, error: "Seleccione un cliente/sitio en el selector global (un proyecto a la vez)." }
    }
    const supabase: any = await getSupabaseAdmin()
    const clientes: number[] = [empresaId]
    const has = (v: any, t: string) => String(v || "").toLowerCase().includes(t)

    // Traer invtrans del/los proyecto(s) (paginado). El inventario y los despachos
    // se llevan POR LOTE, así que traemos producto+lote para el cuadre físico.
    const inv: any[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from("invtrans")
        .select("idproducto, nombreproducto, codproducto, lote, tipomov, origen, cantidad, creado, ocargue, ordentolva, cod_movimiento, status, location")
        .in("idempresa", clientes)
        .range(from, from + 999)
      if (error) return { success: false, error: error.message }
      inv.push(...(data ?? []))
      if (!data || data.length < 1000) break
      from += 1000
      if (from > 100000) break
    }

    // Saldo VIVO por (producto, lote) — es la VERDAD física (lo confirma el conteo).
    const saldosRows: any[] = []
    {
      let sf = 0
      while (true) {
        const { data } = await supabase.from("saldoinvdetalle").select("idproducto, nombreproducto, codproducto, categoria, subcategoria, lote, stock_actual").in("idempresa", clientes).range(sf, sf + 999)
        saldosRows.push(...(data ?? []))
        if (!data || data.length < 1000) break
        sf += 1000
        if (sf > 100000) break
      }
    }

    // La conciliación es SOLO de Producto Terminado + Sub Producto (así lo maneja
    // el cliente). El EMPAQUE y la MATERIA PRIMA NO entran (se concilian aparte).
    const catDe: Record<string, string> = {}
    const codDe: Record<string, string> = {}
    const nomDe: Record<string, string> = {}
    for (const r of saldosRows) {
      catDe[r.idproducto] = `${r.categoria || ""} / ${r.subcategoria || ""}`.toUpperCase()
      codDe[r.idproducto] = String(r.codproducto || "").toUpperCase()
      if (r.nombreproducto) nomDe[r.idproducto] = String(r.nombreproducto).toUpperCase()
    }
    for (const r of inv) {
      if (codDe[r.idproducto] === undefined) codDe[r.idproducto] = String(r.codproducto || "").toUpperCase()
      if (nomDe[r.idproducto] === undefined && r.nombreproducto) nomDe[r.idproducto] = String(r.nombreproducto).toUpperCase()
    }
    const incluir = (idp: any): boolean => {
      // Regla del cliente: los productos que DICEN "EMP" (empaque) NO entran al cruce,
      // aunque estén mal categorizados como PT. Prevalece el nombre/código.
      const nm = nomDe[idp] || ""
      if (nm.startsWith("EMP") || nm.startsWith("MP ")) return false
      const cs = catDe[idp]
      if (cs !== undefined) {
        if (cs.includes("EMPAQUE") || cs.includes("MATERIA PRIMA")) return false
        return cs.includes("PRODUCTO TERMINADO") || cs.includes("SUB PRODUCTO")
      }
      const p = codDe[idp] || "" // sin saldo/categoría → por prefijo del código
      if (p.startsWith("EMP") || p.startsWith("MP")) return false
      return p.startsWith("PT") || p.startsWith("SP")
    }

    const stockActual = saldosRows.reduce((s, r) => s + (incluir(r.idproducto) ? Number(r.stock_actual) || 0 : 0), 0)

    const mesDe = (oc: any, creado: any): string | null => {
      const m = RE_ORDEN.exec(String(oc || "").trim())
      if (m) return `${m[1]}-${m[2]}`
      const c = String(creado || "")
      return c.length >= 7 ? c.slice(0, 7) : null
    }

    // ============================================================
    // A) ROLL MENSUAL OPERACIONAL
    //    Apertura del periodo = Inventario Inicial (cód 561).
    //    Cada mes: saldo inicial + ingresos − despachos = saldo final,
    //    y ese saldo final es el inicial del mes siguiente.
    //    Ingresos = producción/recepción + devoluciones.
    //    SALIDAS = SOLO órdenes de cargue (601). Bodega/reproceso/ajustes
    //    NO interfieren en el roll (se sacan al cuadre físico/lista a revisar).
    //    Traslados internos, tolva y proyección se excluyen.
    // ============================================================
    const aniosSet = new Set<string>()
    let invInicial = 0
    const map: Record<string, any> = {}
    for (const r of inv) {
      if (!incluir(r.idproducto)) continue // solo Producto Terminado + Sub Producto
      const st = String(r.status || "").toLowerCase()
      if (!st.startsWith("aprob")) continue // SOLO lo aprobado (fuera: rechazado, por descontar, lote alterno)
      if (String(r.location || "") === "AJUSTE-SIG") continue // remanente de ajustes (obsoleto)
      const tieneOC = !!(r.ocargue && String(r.ocargue).trim())
      // lote paralelo/alterno SIN orden de cargue: no es una salida real
      if ((st.includes("altern") || st.includes("paralel") || has(r.origen, "altern") || has(r.origen, "paralel")) && !tieneOC) continue
      const c = Math.abs(Number(r.cantidad) || 0)
      const esInicial = r.cod_movimiento === "561" || has(r.origen, "inventario inicial")
      if (esInicial) { invInicial += c; continue } // apertura, no es flujo del mes
      if (r.cod_movimiento === "311" || has(r.origen, "traslado entre localizaciones")) continue // neto 0
      if (r.ordentolva || has(r.ocargue, "tolva") || has(r.ocargue, "proyec") || has(r.origen, "tolva") || has(r.origen, "proyec")) continue
      const mk = mesDe(r.ocargue, r.creado)
      if (!mk) continue
      const yyyy = mk.slice(0, 4)
      aniosSet.add(yyyy)
      if (anio && yyyy !== anio) continue
      if (!map[mk]) map[mk] = { mes: mk, produccion: 0, devolucion: 0, cargue: 0, merma: 0, ajuste: 0 }
      const a = map[mk]
      const esCargue = r.tipomov === "Salida" && (r.cod_movimiento === "601" || has(r.origen, "orden de cargue"))
      const esMerma = r.cod_movimiento === "551" || r.tipomov === "Reproceso" || has(r.origen, "reproceso")
      const esProd = r.cod_movimiento === "101" || (r.tipomov === "Entrada" && (has(r.origen, "producc") || has(r.origen, "aprob") || has(r.origen, "descarg") || has(r.origen, "logo")))
      const esDev = has(r.origen, "devoluc") || (r.tipomov === "Entrada" && has(r.origen, "transaccion manual"))
      const esAjuste = r.cod_movimiento === "701" || r.cod_movimiento === "702"
      if (esCargue) a.cargue += c
      else if (esMerma) a.merma += c
      else if (esProd) a.produccion += c
      else if (esDev) a.devolucion += c
      else if (esAjuste) a.ajuste += c
    }

    // ============================================================
    // B) CUADRE FÍSICO LOTE POR LOTE (se calcula ANTES del roll para poder
    //    atribuir la diferencia libro-vs-físico a su mes por la fecha del lote).
    //    El inventario y los despachos se llevan POR LOTE (lote = AAAAMMDD).
    //    diferencia > 0 = el kardex tiene MÁS que el físico. Según el proyecto
    //    esa diferencia es MERMA DE PROCESO (p.ej. Avimol) o error a corregir.
    // ============================================================
    const book: Record<string, number> = {}
    const nombre: Record<string, string> = {}
    const loteDe: Record<string, string> = {}
    for (const r of inv) {
      if (!incluir(r.idproducto)) continue
      const st = String(r.status || "").toLowerCase()
      if (!st.startsWith("aprob")) continue // SOLO lo aprobado (fuera: rechazado, por descontar, lote alterno)
      if (String(r.location || "") === "AJUSTE-SIG") continue // remanente de ajustes (obsoleto)
      const tieneOC = !!(r.ocargue && String(r.ocargue).trim())
      // lote paralelo/alterno SIN orden de cargue: no es una salida real
      if (r.tipomov !== "Entrada" && (st.includes("altern") || st.includes("paralel") || has(r.origen, "altern") || has(r.origen, "paralel")) && !tieneOC) continue
      const k = `${r.idproducto}|${r.lote}`
      const c = Math.abs(Number(r.cantidad) || 0)
      book[k] = (book[k] || 0) + (r.tipomov === "Entrada" ? c : -c)
      if (r.nombreproducto) nombre[k] = r.nombreproducto
      loteDe[k] = String(r.lote ?? "")
    }
    const saldoLote: Record<string, number> = {}
    for (const r of saldosRows) {
      if (!incluir(r.idproducto)) continue
      const k = `${r.idproducto}|${r.lote}`
      saldoLote[k] = (saldoLote[k] || 0) + (Number(r.stock_actual) || 0)
      if (!nombre[k] && r.nombreproducto) nombre[k] = r.nombreproducto
      if (loteDe[k] === undefined) loteDe[k] = String(r.lote ?? "")
    }
    const loteMes = (lote: string): string | null => {
      const m = /^(\d{4})(\d{2})/.exec(String(lote || ""))
      return m && m[2] >= "01" && m[2] <= "12" ? `${m[1]}-${m[2]}` : null
    }
    const keys = new Set([...Object.keys(book), ...Object.keys(saldoLote)])
    let sobrante = 0
    let faltante = 0
    const difMes: Record<string, number> = {} // diferencia física atribuida por mes del lote
    const revisar: any[] = []
    for (const k of keys) {
      // El stock físico no puede ser negativo: un libro negativo (p.ej. reproceso
      // registrado sobre un lote ya en 0) es un artefacto → se pisa en 0, igual que la vista.
      const libroLote = Math.max(0, Math.round(book[k] || 0))
      const d = libroLote - Math.round(saldoLote[k] || 0)
      if (d > 0) sobrante += d
      else faltante += d
      const lm = loteMes(loteDe[k] || "")
      if (lm) difMes[lm] = (difMes[lm] || 0) + d
      if (Math.abs(d) > 100) revisar.push({ producto: nombre[k] || "?", lote: loteDe[k] || "", libro: libroLote, saldo: Math.round(saldoLote[k] || 0), diferencia: d })
    }
    revisar.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))

    // ============================================================
    // A) ROLL MENSUAL — cierre de un mes = inicial del siguiente.
    //    Apertura = Inventario Inicial (561). Reconoce la MERMA DE PROCESO
    //    (diferencia libro-vs-físico por lote, mesProc) para que el saldo
    //    conciliado cuadre EXACTO contra el stock vivo (la verdad física).
    // ============================================================
    const meses = Object.values(map).sort((x: any, y: any) => x.mes.localeCompare(y.mes))
    let saldo = Math.round(invInicial)
    const filas = meses.map((a: any) => {
      const ingresos = a.produccion + a.devolucion
      const mermaProceso = Math.round(difMes[a.mes] || 0) // cuadre físico del mes (por lote)
      const reproceso = Math.round(a.merma)               // reproceso/avería registrado (551)
      const merma = reproceso + mermaProceso              // merma total = reproceso + cuadre
      const salidas = a.cargue + merma
      const saldoInicial = saldo
      const saldoFinal = saldoInicial + ingresos - salidas
      saldo = saldoFinal
      return {
        mes: a.mes,
        saldoInicial: Math.round(saldoInicial),
        ingresos: Math.round(ingresos),
        recepcion: Math.round(a.produccion),
        produccion: Math.round(a.produccion),
        devolucion: Math.round(a.devolucion),
        cargue: Math.round(a.cargue),
        reproceso,
        mermaProceso,
        merma: Math.round(merma),
        salidas: Math.round(salidas),
        saldoFinal: Math.round(saldoFinal),
        faltante: 0,
        ajuste: Math.round(a.ajuste),
        documento_url: null as string | null,
        cierre_id: null as number | null,
        estadoCierre: null as string | null,
      }
    })
    // Cuadre exacto contra el físico: el residual (lotes sin fecha, 702/otros,
    // redondeos) se lleva al último mes como merma de proceso → saldo final = stock vivo.
    if (filas.length) {
      const last = filas[filas.length - 1]
      const residual = Math.round(last.saldoFinal - stockActual)
      if (residual !== 0) {
        last.mermaProceso += residual
        last.merma += residual
        last.salidas += residual
        last.saldoFinal -= residual
      }
    }
    const saldoTeorico = filas.length ? filas[filas.length - 1].saldoFinal : Math.round(invInicial)
    const mermaProcesoTotal = filas.reduce((s: number, f: any) => s + (f.mermaProceso || 0), 0)

    const resumen = {
      invInicial: Math.round(invInicial),
      saldoTeorico,                                        // = stock vivo tras conciliar
      saldoVivo: Math.round(stockActual),
      diferencia: Math.round(saldoTeorico - stockActual),  // ~0 tras conciliar
      mermaProceso: Math.round(mermaProcesoTotal),
      sobranteKardex: Math.round(sobrante),
      faltanteKardex: Math.round(Math.abs(faltante)),
      lotesRevisar: revisar.length,
    }

    let cierres: SigInventarioCierreMes[] = []
    try {
      const { data: cData } = await supabase
        .from("sig_inventario_cierre_mes")
        .select("*")
        .eq("proyecto_id", empresaId)
        .order("mes")
      cierres = (cData ?? []) as SigInventarioCierreMes[]
    } catch { /* tabla aún no creada */ }

    const cierrePorMes: Record<string, SigInventarioCierreMes> = {}
    for (const c of cierres) cierrePorMes[c.mes] = c
    for (const f of filas) {
      const c = cierrePorMes[f.mes]
      if (c) {
        f.documento_url = c.documento_url
        f.cierre_id = c.id
        f.estadoCierre = c.estado
      }
    }

    const anios = Array.from(aniosSet).sort().reverse()
    return { success: true, data: { filas, resumen, revisar: revisar.slice(0, 100), anios, anio: anio || anios[0] || null, stockActual: Math.round(stockActual), cierres } }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}

/** Persiste el cierre mensual tras generar/subir el acta PDF. */
export async function guardarCierreMesInventario(payload: {
  proyecto_id: number
  mes: string
  saldo_inicial: number
  ingresos: number
  cargue: number
  merma: number
  salidas: number
  saldo_final: number
  faltante: number
  ajuste: number
  produccion: number
  devolucion: number
  documento_url: string
  cerrado_por?: string | null
  observaciones?: string | null
}): Promise<{ success: boolean; data?: SigInventarioCierreMes; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const mesActual = new Date().toISOString().slice(0, 7)
    const estado = payload.mes < mesActual ? "conciliado" : "pendiente"
    const fila = {
      proyecto_id: payload.proyecto_id,
      mes: payload.mes,
      estado,
      saldo_inicial: payload.saldo_inicial,
      ingresos: payload.ingresos,
      cargue: payload.cargue,
      merma: payload.merma,
      salidas: payload.salidas,
      saldo_final: payload.saldo_final,
      faltante: payload.faltante,
      ajuste: payload.ajuste,
      produccion: payload.produccion,
      devolucion: payload.devolucion,
      documento_url: payload.documento_url,
      cerrado_por: payload.cerrado_por ?? null,
      observaciones: payload.observaciones ?? null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from("sig_inventario_cierre_mes")
      .upsert(fila, { onConflict: "proyecto_id,mes" })
      .select("*")
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as SigInventarioCierreMes }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}
