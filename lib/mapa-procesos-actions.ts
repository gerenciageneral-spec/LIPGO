"use server"

// Documentos del Mapa de Procesos.
//
// Escriben en `sig_documentos`, el MISMO maestro que alimenta el Listado
// Maestro de Documentos del Dashboard SIG. No hay tabla aparte a propósito: con
// dos listados, la pregunta de auditoría "¿cuáles son los documentos del SGI?"
// tendría dos respuestas que con el tiempo se contradicen.
//
// El archivo va al bucket "archivos", el mismo de `soportes_documentales`.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUsuarioForInsert } from "@/lib/user-context"
// Los tipos y constantes viven en su propio archivo: este es `"use server"` y
// aqui SOLO se pueden exportar funciones async.
import {
  MAX_MB_DOCUMENTO,
  type CategoriaDoc,
  type DocumentoProceso,
  type GuardarDocumentoInput,
} from "@/lib/mapa-procesos-tipos"

interface Resultado<T = undefined> {
  success: boolean
  data?: T
  message?: string
}

const MSG_FALTA_MIGRACION =
  "Falta correr scripts/sig/58_mapa_procesos_documentos.sql en la base para poder cargar documentos desde el mapa."

/** Distingue "falta la migración" del resto de errores, para no mostrar el crudo. */
function faltaMigracion(msg: string | undefined): boolean {
  const t = String(msg ?? "").toLowerCase()
  return (
    t.includes("categoria") ||
    t.includes("proceso_id") ||
    t.includes("archivo_url") ||
    t.includes("does not exist") ||
    t.includes("schema cache")
  )
}

function filaADocumento(r: any): DocumentoProceso {
  return {
    id: String(r.id),
    codigo: r.codigo ?? "",
    nombre: r.nombre ?? "",
    version: r.version ?? "",
    categoria: (r.categoria ?? null) as CategoriaDoc | null,
    procesoId: r.proceso_id ?? null,
    archivoUrl: r.archivo_url ?? null,
    archivoNombre: r.archivo_nombre ?? null,
    estado: r.estado ?? null,
    subidoPor: r.subido_por ?? null,
    actualizadoAt: r.actualizado_at ?? null,
  }
}

/**
 * Documentos de UN proceso, de las tres categorías.
 *
 * Los devuelve todos juntos y la pantalla los reparte por pestaña: son pocos
 * por proceso, y así cambiar de pestaña no dispara otra consulta.
 */
export async function getDocumentosDeProceso(
  procesoId: string,
): Promise<Resultado<DocumentoProceso[]>> {
  if (!procesoId) return { success: false, message: "No se indicó el proceso." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { data, error } = await admin
      .from("sig_documentos")
      .select(
        "id, codigo, nombre, version, tipo, proceso, categoria, proceso_id, archivo_url, archivo_nombre, estado, subido_por, actualizado_at, eliminado",
      )
      .eq("proceso_id", procesoId)
      .order("categoria", { ascending: true })
      .order("codigo", { ascending: true })

    if (error) {
      console.error("[v0] getDocumentosDeProceso:", error.message)
      return { success: false, message: faltaMigracion(error.message) ? MSG_FALTA_MIGRACION : error.message }
    }

    // Los retirados se filtran acá y no en el select: si la columna todavía no
    // existe --falta la migración-- un filtro en la consulta la haría fallar
    // entera en vez de devolver la lista.
    const vivos = (data ?? []).filter((r: any) => r.eliminado !== true)
    return { success: true, data: vivos.map(filaADocumento) }
  } catch (e: any) {
    console.error("[v0] getDocumentosDeProceso excepción:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudieron leer los documentos." }
  }
}

/** Cuántos documentos tiene cada proceso, para mostrarlo en el mapa. */
export async function getConteoDocumentosPorProceso(): Promise<Resultado<Record<string, number>>> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { data, error } = await admin
      .from("sig_documentos")
      .select("proceso_id, eliminado")
      .not("proceso_id", "is", null)

    if (error) {
      // Sin migración no hay conteo, pero el mapa debe seguir viéndose: se
      // devuelve vacío en vez de un error que rompa la pantalla entera.
      console.error("[v0] getConteoDocumentosPorProceso:", error.message)
      return { success: true, data: {} }
    }

    const out: Record<string, number> = {}
    for (const r of data ?? []) {
      if (r.eliminado === true) continue
      const k = String(r.proceso_id)
      out[k] = (out[k] ?? 0) + 1
    }
    return { success: true, data: out }
  } catch {
    return { success: true, data: {} }
  }
}

/** Nombre de archivo seguro para el bucket. Mismo criterio que soportes-actions. */
const safe = (s: string) => (s || "").replace(/[^a-zA-Z0-9._-]/g, "_")

/**
 * Sube el adjunto de un documento y devuelve su URL.
 *
 * Va al bucket "archivos", el mismo de `soportes_documentales`, bajo su propia
 * carpeta para que se pueda distinguir de un vistazo qué subió el mapa.
 */
export async function subirArchivoDocumento(
  file: File,
  procesoId: string,
  categoria: CategoriaDoc,
): Promise<Resultado<{ url: string; nombre: string }>> {
  if (!file) return { success: false, message: "No se seleccionó ningún archivo." }
  if (file.size > MAX_MB_DOCUMENTO * 1024 * 1024) {
    return {
      success: false,
      message: `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_MB_DOCUMENTO} MB.`,
    }
  }

  try {
    const admin: any = await getSupabaseAdmin()
    const ext = file.name.split(".").pop() || "bin"
    const ruta = `sig/mapa-procesos/${safe(procesoId)}/${safe(categoria)}_${Date.now()}.${ext}`

    const up = await admin.storage
      .from("archivos")
      .upload(ruta, file, { contentType: file.type || undefined, upsert: true })
    if (up.error) {
      console.error("[v0] subirArchivoDocumento:", up.error.message)
      return { success: false, message: up.error.message }
    }

    const { data } = admin.storage.from("archivos").getPublicUrl(ruta)
    return { success: true, data: { url: data.publicUrl, nombre: file.name } }
  } catch (e: any) {
    console.error("[v0] subirArchivoDocumento excepción:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo subir el archivo." }
  }
}


/**
 * Crea o actualiza un documento del proceso.
 *
 * Esta es la PRIMERA pantalla del sistema que escribe en `sig_documentos`: hasta
 * ahora el maestro solo se leía. Por eso se validan los campos acá y no se
 * confía en que la tabla los rechace.
 */
export async function guardarDocumentoProceso(
  input: GuardarDocumentoInput,
): Promise<Resultado<DocumentoProceso>> {
  const codigo = String(input?.codigo ?? "").trim()
  const nombre = String(input?.nombre ?? "").trim()
  const version = String(input?.version ?? "").trim()

  if (!input?.procesoId) return { success: false, message: "No se indicó el proceso." }
  if (!input?.categoria) return { success: false, message: "Indica si es formato, información documentada o registro." }
  if (!codigo) return { success: false, message: "El código del documento es obligatorio." }
  if (!nombre) return { success: false, message: "El nombre del documento es obligatorio." }
  if (!version) return { success: false, message: "La versión es obligatoria." }

  try {
    const admin: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert().catch(() => null)

    const payload: Record<string, unknown> = {
      codigo,
      nombre,
      version,
      categoria: input.categoria,
      proceso_id: input.procesoId,
      actualizado_at: new Date().toISOString(),
    }
    // El adjunto solo se toca si viene: al editar solo el nombre o la versión,
    // omitirlo dejaría el documento sin archivo.
    if (input.archivoUrl !== undefined) payload.archivo_url = input.archivoUrl
    if (input.archivoNombre !== undefined) payload.archivo_nombre = input.archivoNombre
    if (usuario) payload.subido_por = usuario

    const q = input.id
      ? admin.from("sig_documentos").update(payload).eq("id", input.id).select("*").single()
      : admin.from("sig_documentos").insert(payload).select("*").single()

    const { data, error } = await q
    if (error) {
      console.error("[v0] guardarDocumentoProceso:", error.message)
      return { success: false, message: faltaMigracion(error.message) ? MSG_FALTA_MIGRACION : error.message }
    }
    return { success: true, data: filaADocumento(data) }
  } catch (e: any) {
    console.error("[v0] guardarDocumentoProceso excepción:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo guardar el documento." }
  }
}

/**
 * Retira un documento del listado. NO lo borra.
 *
 * Mismo criterio que los soportes documentales: esto es información documentada
 * de un sistema que se audita, y un documento que desaparece sin explicación es
 * peor que uno retirado con su motivo escrito.
 */
export async function eliminarDocumentoProceso(
  id: string,
  motivo: string,
): Promise<Resultado> {
  if (!id) return { success: false, message: "No se indicó qué documento quitar." }
  if (!motivo?.trim()) return { success: false, message: "Indica por qué se quita el documento." }

  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await admin
      .from("sig_documentos")
      .update({
        eliminado: true,
        eliminado_motivo: motivo.trim(),
        eliminado_en: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) {
      console.error("[v0] eliminarDocumentoProceso:", error.message)
      return { success: false, message: faltaMigracion(error.message) ? MSG_FALTA_MIGRACION : error.message }
    }
    return { success: true }
  } catch (e: any) {
    console.error("[v0] eliminarDocumentoProceso excepción:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo quitar el documento." }
  }
}
