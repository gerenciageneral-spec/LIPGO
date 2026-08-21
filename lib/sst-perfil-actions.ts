"use server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import type { PerfilSociodemograficoRow } from "@/lib/sst-evidencia-types"
import { edadDesdeFechaISO } from "@/lib/sst-datos-catalogos"

// Cliente admin server-side (la tabla tiene RLS; el acceso lo controla PermissionGuard).
async function resolveEmpresaId(fromClient?: number | null): Promise<number | null> {
  if (fromClient && !Number.isNaN(fromClient)) return fromClient
  return await getCurrentEmpresaIdForInsert()
}

// Columnas que la app puede escribir. `documento_norm` NO está aquí a propósito:
// es una columna GENERADA y Postgres rechaza cualquier escritura sobre ella.
const CAMPOS_ESCRIBIBLES = [
  "idempresa", "estado", "documento_tipo", "documento", "nombres", "apellidos",
  "fecha_nacimiento", "edad", "sexo", "eps", "afp", "arl", "centro_trabajo", "turno",
  "cargo", "fecha_ingreso", "fecha_retiro", "pais_nacimiento", "depto_nacimiento",
  "municipio_residencia", "grupo_etnico", "nivel_escolaridad", "estado_civil",
  "cabeza_familia", "num_hijos", "personas_hogar", "ingresos_familiares",
  "tipo_vivienda", "caracteristicas_vivienda", "zona", "direccion", "transporte",
  "estrato", "consume_alcohol", "actividad_fisica", "fumador",
  "requiere_revision", "revision_nota",
] as const

// Sin `export`: en un archivo "use server" todo lo exportado debe ser una
// funcion async, y esta es un helper sincrono de uso interno.
function normalizarDocumentoPerfil(v: unknown): string {
  return String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase()
}

function saneado(row: Partial<PerfilSociodemograficoRow>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of CAMPOS_ESCRIBIBLES) {
    const v = row[k as keyof PerfilSociodemograficoRow]
    if (v !== undefined) out[k] = v
  }
  if (typeof out.documento === "string") out.documento = normalizarDocumentoPerfil(out.documento)
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string") {
      const v = out[k].trim().replace(/\s+/g, " ")
      out[k] = v === "" ? null : v
    }
    // `edad`, `num_hijos` y `personas_hogar` son enteros: una cadena vacía que
    // llegue del formulario debe ir como null, no como 0 (0 hijos y "no
    // respondió" no son lo mismo para el análisis sociodemográfico).
    if (["edad", "num_hijos", "personas_hogar"].includes(k)) {
      const n = Number(out[k])
      out[k] = out[k] === null || out[k] === "" || Number.isNaN(n) ? null : n
    }
  }
  return out
}

export async function listPerfilSociodemografico(
  empresaIdFromClient?: number | null,
): Promise<PerfilSociodemograficoRow[]> {
  const supabase: any = await getSupabaseAdmin()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const q = supabase.from("sst_perfil_sociodemografico").select("*").order("apellidos", { ascending: true })
  // SST transversal (LIP): se lista TODO el perfil sociodemográfico sin filtrar
  // por el ID del cliente; la info de SST es la misma para todos los proyectos.
  void empresaId
  const { data, error } = await q
  if (error) {
    console.error("[v0] listPerfilSociodemografico:", error.message, error.code, error.details, error.hint)
    return []
  }
  return (data ?? []) as PerfilSociodemograficoRow[]
}

/**
 * El perfil de UNA persona, por documento. El módulo MEDEVAC lo usa para
 * editar el registro completo de alguien sin tener que traerse el censo
 * entero, que es de cientos de filas.
 */
export async function getPerfilPorDocumento(
  documento: string,
): Promise<PerfilSociodemograficoRow | null> {
  const doc = normalizarDocumentoPerfil(documento)
  if (!doc) return null
  const supabase: any = await getSupabaseAdmin()
  const { data, error } = await supabase
    .from("sst_perfil_sociodemografico").select("*")
    .eq("documento_norm", doc).limit(1).maybeSingle()
  if (error) {
    console.error("[v0] getPerfilPorDocumento:", error.message, error.code, error.details, error.hint)
    return null
  }
  return (data ?? null) as PerfilSociodemograficoRow | null
}

/**
 * Alta o actualización del perfil de una persona. Upsert por documento: el
 * documento es la llave que enlaza este perfil con su tarjeta MEDEVAC y con el
 * head count, así que una persona no puede tener dos perfiles.
 */
export async function savePerfilSociodemografico(
  row: Partial<PerfilSociodemograficoRow>,
  empresaIdFromClient?: number | null,
  actualizadoPor?: string,
): Promise<{ success: boolean; message?: string }> {
  const supabase: any = await getSupabaseAdmin()
  const empresaId = await resolveEmpresaId(empresaIdFromClient)
  const limpio = saneado(row)

  if (!limpio.documento) return { success: false, message: "El N° de documento es obligatorio: es la llave que enlaza al colaborador." }

  // La edad se DERIVA de la fecha de nacimiento, nunca se guarda lo que venga
  // en el formulario: una edad capturada a mano deja de ser cierta al año
  // siguiente, y la fecha no. Mismo helper que usa el portal.
  const edadCalculada = edadDesdeFechaISO(limpio.fecha_nacimiento)

  const payload = {
    ...limpio,
    edad: edadCalculada ?? limpio.edad ?? null,
    // Guardar a mano ES la revisión: si alguien abrió el perfil, lo revisó y lo
    // guardó, la marca que dejó la carga masiva ya no aplica.
    requiere_revision: limpio.requiere_revision ?? false,
    revision_nota: limpio.revision_nota ?? null,
    idempresa: limpio.idempresa ?? empresaId ?? 100,
    origen: (row as any).origen ?? "sst",
    actualizado_en: new Date().toISOString(),
    actualizado_por: actualizadoPor ?? null,
  }

  const { error } = await supabase
    .from("sst_perfil_sociodemografico")
    .upsert([payload], { onConflict: "documento_norm" })
  if (error) {
    console.error("[v0] savePerfilSociodemografico:", error.message, error.code, error.details, error.hint)
    return { success: false, message: error.message }
  }
  return { success: true }
}
