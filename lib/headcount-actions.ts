"use server"

import { createClient } from "@/lib/supabase-client"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"

export interface HeadcountPerson {
  id?: number
  idempresa: number
  identificacion: string
  nombre: string
  estado: string
  correo?: string | null
  celular?: string | null
  fechainicio?: string | null
  salario?: number | null
  cargo?: string | null
  hoja_de_vida?: string | null
  copia_doc_id?: string | null
  afiliacion_arl?: string | null
  afiliacion_eps?: string | null
  afiliacion_afp?: string | null
  afiliacion_caja?: string | null
  cert_laborales?: string | null
  cert_personales?: string | null
  antecedentes?: string | null
  doc_beneficia?: string | null
  examenes_ing?: string | null
  cert_m_alimentos?: string | null
  cert_eva_med?: string | null
  acta_dotacion?: string | null
  cert_cuenta?: string | null
  contrato?: string | null
  contratosiigo?: string | null
  // Bandera para incluir/excluir a la persona del archivo plano de
  // nomina. Boolean en BD; tratar `null`/`undefined` como `false` en UI.
  aplicaplano?: boolean | null
  // Marca al trabajador como personal administrativo. Los administrativos se
  // listan en la pestaña "Headcount Administrativo" sin filtro de empresa.
  admin?: boolean | null
  // Fecha de retiro (baja). Se setea automáticamente al marcar la novedad
  // "Retiro"; también editable en el formulario. String date (YYYY-MM-DD).
  fecha_retiro?: string | null
}

// Colaborador "liviano" para AUTOCOMPLETAR expediente (Hojas de Vida / Antecedentes)
// por cédula, tomando lo que YA existe en Head Count. Evita re-digitar los datos.
export interface ColaboradorLite {
  identificacion: string
  nombre: string
  cargo?: string | null
  correo?: string | null
  celular?: string | null
  hoja_de_vida?: string | null
  antecedentes?: string | null
  estado?: string | null
}

// Nómina de la empresa SELECCIONADA (para el autocompletar por cédula). Solo
// lectura de campos básicos; ordenada por nombre.
export async function getColaboradoresLite(empresaId?: number | null): Promise<ColaboradorLite[]> {
  const supabase = await createClient()
  let q = supabase
    .from("headcount")
    .select("identificacion,nombre,cargo,correo,celular,hoja_de_vida,antecedentes,estado")
  if (empresaId) q = q.eq("idempresa", empresaId)
  const { data, error } = await q.order("nombre", { ascending: true })
  if (error) {
    console.error("[v0] getColaboradoresLite:", error.message)
    return []
  }
  return (data ?? []) as ColaboradorLite[]
}

export async function getHeadcountList() {
  const supabase = await createClient()
  const empresaId = await getCurrentEmpresaIdForInsert()

  const { data, error } = await supabase
    .from("headcount")
    .select("*")
    .eq("idempresa", empresaId)
    .order("id", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching headcount:", error)
    throw new Error("Error al obtener la lista de personal")
  }

  return data as HeadcountPerson[]
}

export async function createHeadcountPerson(person: Omit<HeadcountPerson, "id" | "idempresa">) {
  const supabase = await createClient()
  const empresaId = await getCurrentEmpresaIdForInsert()

  const { data, error } = await supabase
    .from("headcount")
    .insert({
      ...person,
      idempresa: empresaId,
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] Error creating headcount person:", error)
    throw new Error("Error al crear el registro de personal")
  }

  return data as HeadcountPerson
}

export async function updateHeadcountPerson(id: number, person: Partial<HeadcountPerson>) {
  const supabase = await createClient()

  const { data, error } = await supabase.from("headcount").update(person).eq("id", id).select().single()

  if (error) {
    console.error("[v0] Error updating headcount person:", error)
    throw new Error("Error al actualizar el registro de personal")
  }

  return data as HeadcountPerson
}

export async function deleteHeadcountPerson(id: number) {
  const supabase = await createClient()

  const { error } = await supabase.from("headcount").delete().eq("id", id)

  if (error) {
    console.error("[v0] Error deleting headcount person:", error)
    throw new Error("Error al eliminar el registro de personal")
  }

  return { success: true }
}

export async function uploadHeadcountDocument(file: File, personId: number, documentType: string) {
  try {
    const supabaseAdmin = await getSupabaseAdmin()
    const timestamp = Date.now()
    const fileName = `${documentType}_${personId}_${timestamp}.${file.name.split(".").pop()}`
    const filePath = `personal/${fileName}`

    // Upload file to storage
    const { error: uploadError } = await supabaseAdmin.storage.from("archivos").upload(filePath, file)

    if (uploadError) {
      console.error("[v0] Error uploading document:", uploadError)
      throw new Error("Error al subir el documento")
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage.from("archivos").getPublicUrl(filePath)

    return urlData.publicUrl
  } catch (error) {
    console.error("[v0] Error in uploadHeadcountDocument:", error)
    throw error
  }
}
