"use server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type { MedevacRow } from "@/lib/sst-evidencia-types"

// Nota: se usa el cliente admin (service role) en el servidor porque la tabla
// sst_medevac tiene RLS activo; el acceso al módulo ya lo controla PermissionGuard
// (permiso sst_medevac). El filtro por proyecto lo da el selector global.

// Columnas que la app puede escribir. Todo lo demás se descarta antes de
// mandar la fila a Postgres. Es importante que `documento_norm` NO esté aquí:
// es una columna GENERADA y Postgres rechaza el insert con
// "cannot insert a non-default value into column documento_norm".
const CAMPOS_ESCRIBIBLES = [
  "idempresa", "centro_trabajo", "nombres", "documento_tipo", "documento", "cargo",
  "celular", "alergias", "rh", "arl", "eps", "contacto_nombre", "contacto_telefono",
  "contacto_parentesco", "email", "mes_cumple", "requiere_revision", "revision_nota",
] as const

// Deja solo las columnas escribibles y normaliza el documento a alfanumérico
// en mayúscula, que es exactamente lo que calcula la columna generada. Si no se
// normalizara aquí, "1.049.945.704" y "1049945704" crearían dos filas distintas
// aunque el índice único los considere la misma persona.
function saneado(row: Partial<MedevacRow>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of CAMPOS_ESCRIBIBLES) {
    if (row[k as keyof MedevacRow] !== undefined) out[k] = row[k as keyof MedevacRow]
  }
  if (typeof out.documento === "string") out.documento = normalizarDocumento(out.documento)
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string") {
      const v = out[k].trim().replace(/\s+/g, " ")
      out[k] = v === "" ? null : v
    }
  }
  return out
}

function normalizarDocumento(v: unknown): string {
  return String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase()
}

async function resolveEmpresaId(fromClient?: number | null): Promise<number | null> {
  if (fromClient && !Number.isNaN(fromClient)) return fromClient
  return await getCurrentEmpresaIdForInsert()
}

export async function listMedevac(empresaIdFromClient?: number | null): Promise<MedevacRow[]> {
  const supabase: any = await getSupabaseAdmin()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const q = supabase.from("sst_medevac").select("*").order("nombres", { ascending: true })
  // SST transversal (LIP): se listan TODOS los registros MEDEVAC sin filtrar por
  // el ID del cliente; la info de SST es la misma para todos los proyectos.
  void empresaId
  const { data, error } = await q
  if (error) {
    console.error("[v0] listMedevac:", error.message, error.code, error.details, error.hint)
    return []
  }
  return (data ?? []) as MedevacRow[]
}

/**
 * Alta o actualización de un colaborador en el MEDEVAC.
 *
 * Es un UPSERT por documento, no un insert ciego: el documento es la llave que
 * enlaza MEDEVAC con el Perfil Sociodemográfico, el head count y el portal del
 * trabajador. Si la persona ya está, se actualiza su fila en vez de crear una
 * segunda — antes esto sí pasaba y dejaba dos tarjetas de emergencia distintas
 * para la misma persona.
 */
export async function saveMedevac(
  row: Partial<MedevacRow>,
  empresaIdFromClient?: number | null,
  actualizadoPor?: string,
): Promise<{ success: boolean; message?: string }> {
  const supabase: any = await getSupabaseAdmin()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const limpio = saneado(row)

  if (!limpio.documento) return { success: false, message: "El N° de documento es obligatorio: es la llave que enlaza al colaborador." }
  if (!limpio.nombres) return { success: false, message: "El nombre del colaborador es obligatorio." }

  const payload = {
    ...limpio,
    idempresa: limpio.idempresa ?? empresaId ?? 100,
    origen: "sst",
    // Guardar a mano ES la revisión: si alguien abrió la ficha, la revisó y la
    // guardó, la marca de "por corregir" que dejó la carga masiva ya no aplica.
    // Sin esto la fila seguiría apareciendo en la pestaña de pendientes después
    // de haberla arreglado, que es justo lo que esa pestaña promete que no pasa.
    requiere_revision: limpio.requiere_revision ?? false,
    revision_nota: limpio.revision_nota ?? null,
    actualizado_en: new Date().toISOString(),
    actualizado_por: actualizadoPor ?? null,
  }

  const { error } = await supabase
    .from("sst_medevac")
    .upsert([payload], { onConflict: "documento_norm" })
  if (error) {
    console.error("[v0] saveMedevac:", error.message, error.code, error.details, error.hint)
    return { success: false, message: error.message }
  }
  return { success: true }
}

export async function deleteMedevac(id: number): Promise<{ success: boolean; message?: string }> {
  const supabase: any = await getSupabaseAdmin()
  const { error } = await supabase.from("sst_medevac").delete().eq("id", id)
  return error ? { success: false, message: error.message } : { success: true }
}

/**
 * Quita la marca de "requiere revisión" de una fila. Se usa cuando SST ya
 * corrigió a mano lo que la carga masiva no pudo resolver.
 */
export async function resolverRevisionMedevac(id: number): Promise<{ success: boolean; message?: string }> {
  const supabase: any = await getSupabaseAdmin()
  const { error } = await supabase
    .from("sst_medevac")
    .update({ requiere_revision: false, revision_nota: null, actualizado_en: new Date().toISOString() })
    .eq("id", id)
  return error ? { success: false, message: error.message } : { success: true }
}

// Autorrelleno: busca al colaborador en el head count / carpeta de Trabajadores
// (tabla headcount) por N° de documento. Valida contra el proyecto del selector:
// si se pasa empresaId, solo lo encuentra si pertenece a ese proyecto.
export async function buscarColaboradorMedevac(
  documento: string,
  empresaId?: number | null,
): Promise<{ found: boolean; data?: any; message?: string }> {
  const doc = normalizarDocumento(documento)
  if (!doc) return { found: false }
  const supabase: any = await getSupabaseAdmin()
  let q = supabase
    .from("headcount")
    .select("identificacion, nombre, cargo, celular, afiliacion_eps, afiliacion_arl, idempresa, estado")
    .eq("identificacion", doc)
  if (empresaId) q = q.eq("idempresa", empresaId)
  const { data, error } = await q.limit(1)
  if (error) return { found: false, message: error.message }
  if (!data || !data.length) {
    return { found: false, message: empresaId ? "No está en el head count de este proyecto" : "No se encontró en el head count" }
  }
  const p = data[0]
  return {
    found: true,
    data: {
      nombres: p.nombre ?? "",
      cargo: p.cargo ?? "",
      celular: p.celular ?? "",
      eps: p.afiliacion_eps ?? "",
      arl: p.afiliacion_arl ?? "",
      idempresa: p.idempresa,
      estado: p.estado ?? "",
    },
  }
}

export interface CoberturaMedevac {
  activos: number
  conMedevac: number
  medevacCompleto: number
  conPerfil: number
  perfilCompleto: number
  faltantes: { identificacion: string; nombre: string; tieneMedevac: boolean; tienePerfil: boolean }[]
}

/**
 * Cobertura del MEDEVAC contra el head count: de la gente ACTIVA, quién tiene
 * su tarjeta de emergencia y su perfil, y quién no. Es la respuesta a la
 * pregunta de auditoría "¿todos los trabajadores tienen plan de emergencia?".
 *
 * Lee la vista vw_sst_datos_colaborador (scripts/sig/44_...). Si la vista aún
 * no existe, devuelve ceros en vez de romper el módulo.
 */
export async function getCoberturaMedevac(): Promise<CoberturaMedevac> {
  const vacio: CoberturaMedevac = { activos: 0, conMedevac: 0, medevacCompleto: 0, conPerfil: 0, perfilCompleto: 0, faltantes: [] }
  const supabase: any = await getSupabaseAdmin()
  const { data, error } = await supabase
    .from("vw_sst_datos_colaborador")
    .select("identificacion, nombre, estado, tiene_medevac, tiene_perfil, medevac_completo, perfil_completo")
  if (error) {
    console.error("[v0] getCoberturaMedevac:", error.message, error.code, error.details, error.hint)
    return vacio
  }
  const activos = (data ?? []).filter((r: any) => String(r.estado ?? "").trim().toLowerCase() === "activo")
  return {
    activos: activos.length,
    conMedevac: activos.filter((r: any) => r.tiene_medevac).length,
    medevacCompleto: activos.filter((r: any) => r.medevac_completo).length,
    conPerfil: activos.filter((r: any) => r.tiene_perfil).length,
    perfilCompleto: activos.filter((r: any) => r.perfil_completo).length,
    faltantes: activos
      .filter((r: any) => !r.medevac_completo || !r.perfil_completo)
      .map((r: any) => ({
        identificacion: r.identificacion ?? "",
        nombre: r.nombre ?? "",
        tieneMedevac: !!r.medevac_completo,
        tienePerfil: !!r.perfil_completo,
      }))
      .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre)),
  }
}
