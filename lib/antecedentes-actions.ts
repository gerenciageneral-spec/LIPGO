"use server"

import { createClient } from "@/lib/supabase-client"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"

export interface Antecedente {
  id: string
  idempresa: number
  hoja_vida_id: string | null
  cedula: string | null
  nombre: string
  policia_url: string | null
  policia_nombre: string | null
  procuraduria_url: string | null
  procuraduria_nombre: string | null
  contraloria_url: string | null
  contraloria_nombre: string | null
  created_at: string
}

// Lista los antecedentes de la empresa seleccionada (o la de sesion).
export async function getAntecedentes(selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  const empresaId = selectedEmpresaId || (await getCurrentEmpresaIdForInsert())

  const { data, error } = await supabase
    .from("antecedentes")
    .select("*")
    .eq("idempresa", empresaId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching antecedentes:", error)
    return { success: false, data: [] as Antecedente[], message: error.message }
  }

  return { success: true, data: (data || []) as Antecedente[] }
}

// SINCRONIZAR desde Head Count: los colaboradores antiguos YA tienen su documento
// de antecedentes cargado en Head Count (columna antecedentes = URL). Esta acción
// lo trae al submódulo de Antecedentes sin re-subir. Head Count guarda UN documento
// consolidado → se referencia en el slot principal (policía); los otros dos quedan
// para carga separada si el cliente maneja certificados independientes.
// Idempotente por cédula: crea los que faltan y actualiza el documento de los que ya están.
export async function sincronizarAntecedentesDesdeHeadcount(selectedEmpresaId?: number | null) {
  const admin: any = await getSupabaseAdmin()
  const empresaId = selectedEmpresaId || (await getCurrentEmpresaIdForInsert())
  if (!empresaId) return { success: false, creadas: 0, actualizadas: 0, message: "Sin empresa seleccionada." }

  const { data: hc, error: eHc } = await admin
    .from("headcount")
    .select("identificacion,nombre,antecedentes")
    .eq("idempresa", empresaId)
    .not("antecedentes", "is", null)
  if (eHc) return { success: false, creadas: 0, actualizadas: 0, message: eHc.message }

  const { data: exist } = await admin.from("antecedentes").select("id,cedula").eq("idempresa", empresaId)
  const byCedula = new Map<string, string>()
  for (const a of exist ?? []) if (a.cedula) byCedula.set(String(a.cedula).trim(), a.id)

  let actualizadas = 0
  const nuevas: any[] = []
  for (const c of hc ?? []) {
    const url = c.antecedentes as string
    if (!url) continue
    const ced = c.identificacion ? String(c.identificacion).trim() : ""
    const existingId = ced ? byCedula.get(ced) : undefined
    const doc = { policia_url: url, policia_nombre: "Antecedentes (Head Count)" }
    if (existingId) {
      const { error } = await admin.from("antecedentes").update(doc).eq("id", existingId)
      if (!error) actualizadas++
    } else {
      nuevas.push({ idempresa: empresaId, hoja_vida_id: null, cedula: ced || null, nombre: c.nombre, ...doc })
    }
  }
  if (nuevas.length) {
    const { error } = await admin.from("antecedentes").insert(nuevas)
    if (error) return { success: false, creadas: 0, actualizadas, message: error.message }
  }
  return { success: true, creadas: nuevas.length, actualizadas }
}

// Elimina un antecedente (archivos en Supabase Storage + registro).
export async function deleteAntecedente(id: string) {
  const supabase = await createClient()

  const { data: current } = await supabase
    .from("antecedentes")
    .select("policia_url, procuraduria_url, contraloria_url")
    .eq("id", id)
    .maybeSingle()

  // Borramos los archivos del bucket "archivos" (si falla no interrumpimos el
  // borrado del registro). Derivamos la ruta interna desde la URL publica.
  if (current) {
    const marker = "/object/public/archivos/"
    const urls = [current.policia_url, current.procuraduria_url, current.contraloria_url].filter(
      Boolean,
    ) as string[]
    const paths = urls
      .map((u) => {
        const idx = u.indexOf(marker)
        return idx !== -1 ? decodeURIComponent(u.slice(idx + marker.length)) : null
      })
      .filter(Boolean) as string[]
    if (paths.length > 0) {
      try {
        const supabaseAdmin = await getSupabaseAdmin()
        await supabaseAdmin.storage.from("archivos").remove(paths)
      } catch (err: any) {
        console.error("[v0] Error eliminando archivos de antecedentes:", err?.message || err)
      }
    }
  }

  const { error } = await supabase.from("antecedentes").delete().eq("id", id)

  if (error) {
    console.error("[v0] Error deleting antecedente:", error)
    return { success: false, message: error.message }
  }

  return { success: true }
}
