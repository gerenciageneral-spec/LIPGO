"use server"

import { createClient } from "@/lib/supabase"

interface LineaSolicitud {
  puesto: string
  fecharequerida: string
  cantidad: number
  // Nuevo: tipo de servicio adicional solicitado.
  // Valores permitidos: "Turnos" | "Horas Extra". Se guarda en la columna
  // `tipo` de la tabla solicitudesturnos para que el módulo Aprobar Turnos
  // y el historial puedan mostrarlo.
  tipo: string
}

interface CreateSolicitudParams {
  nombresolicitante: string
  lineas: LineaSolicitud[]
  firmasolicitante: string | null
  idempresa: number | null
  usuariosolicitud: string | null
}

export async function createSolicitudTurnos(params: CreateSolicitudParams) {
  const supabase = await createClient()
  
  try {
    const fechasolicitud = new Date().toISOString().split("T")[0]
    
    // Create one record per line (puesto)
    const records = params.lineas.map((linea) => ({
      fechasolicitud,
      idempresa: params.idempresa,
      puesto: linea.puesto,
      fecharequerida: linea.fecharequerida,
      nombresolicitante: params.nombresolicitante,
      estado: "pendiente",
      cantidad: linea.cantidad,
      firmasolicitante: params.firmasolicitante,
      nombreaprobo: null,
      firmaaprobo: null,
      usuariosolicitud: params.usuariosolicitud,
      // Persistimos el tipo de servicio por línea (Turnos / Horas Extra).
      tipo: linea.tipo || "Turnos",
    }))

    const { data, error } = await supabase
      .from("solicitudesturnos")
      .insert(records)
      .select()

    if (error) {
      console.error("[v0] Error creating solicitud turnos:", error)
      return { success: false, message: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, message: "Error inesperado al crear la solicitud" }
  }
}

export async function getSolicitudesTurnos(selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  
  try {
    let query = supabase
      .from("solicitudesturnos")
      .select("*")
      .order("fechasolicitud", { ascending: false })

    if (selectedEmpresaId) {
      query = query.eq("idempresa", selectedEmpresaId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching solicitudes turnos:", error)
      return { success: false, data: [], message: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, data: [], message: "Error inesperado" }
  }
}

export async function getSolicitudesPendientes(selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  
  try {
    let query = supabase
      .from("solicitudesturnos")
      .select("*")
      .eq("estado", "pendiente")
      .order("fechasolicitud", { ascending: false })

    if (selectedEmpresaId) {
      query = query.eq("idempresa", selectedEmpresaId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching solicitudes pendientes:", error)
      return { success: false, data: [], message: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, data: [], message: "Error inesperado" }
  }
}

interface AprobarSolicitudesParams {
  ids: number[]
  nombreaprobo: string
  firmaaprobo: string | null
  personal?: string // Lista de personas separadas por coma
}

export async function aprobarSolicitudes(params: AprobarSolicitudesParams) {
  const supabase = await createClient()
  
  try {
    // Get Colombia time
    const now = new Date()
    const colombiaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }))
    const fechahoraprobo = colombiaTime.toISOString()

    const updateData: Record<string, unknown> = {
      estado: "aprobado",
      nombreaprobo: params.nombreaprobo,
      firmaaprobo: params.firmaaprobo,
      fechahoraprobo: fechahoraprobo,
    }

    // Add personal field if provided
    if (params.personal) {
      updateData.personal = params.personal
    }

    const { data, error } = await supabase
      .from("solicitudesturnos")
      .update(updateData)
      .in("id", params.ids)
      .select()

    if (error) {
      console.error("[v0] Error approving solicitudes:", error)
      return { success: false, message: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, message: "Error inesperado al aprobar las solicitudes" }
  }
}

export async function rechazarSolicitudes(ids: number[], nombreaprobo: string) {
  const supabase = await createClient()
  
  try {
    const now = new Date()
    const colombiaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }))
    const fechahoraprobo = colombiaTime.toISOString()

    const { data, error } = await supabase
      .from("solicitudesturnos")
      .update({
        estado: "rechazado",
        nombreaprobo: nombreaprobo,
        fechahoraprobo: fechahoraprobo,
      })
      .in("id", ids)
      .select()

    if (error) {
      console.error("[v0] Error rejecting solicitudes:", error)
      return { success: false, message: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, message: "Error inesperado al rechazar las solicitudes" }
  }
}

export async function getSolicitudesAprobadas(selectedEmpresaId?: number | null) {
  const supabase = await createClient()
  
  try {
    let query = supabase
      .from("solicitudesturnos")
      .select("*")
      .eq("estado", "aprobado")
      .order("fechahoraprobo", { ascending: false })

    if (selectedEmpresaId) {
      query = query.eq("idempresa", selectedEmpresaId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching solicitudes aprobadas:", error)
      return { success: false, data: [], message: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, data: [], message: "Error inesperado" }
  }
}

export async function updatePdfUrl(ids: number[], pdfUrl: string) {
  const supabase = await createClient()
  
  try {
    const { error } = await supabase
      .from("solicitudesturnos")
      .update({ pdfaprobacion: pdfUrl })
      .in("id", ids)

    if (error) {
      console.error("[v0] Error updating PDF URL:", error)
      return { success: false, message: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return { success: false, message: "Error inesperado" }
  }
}

export async function getEmpresaData(empresaId: number) {
  const supabase = await createClient()
  
  try {
    const { data, error } = await supabase
      .from("empresas_permisos")
      .select("id, nombre, nit, direccion")
      .eq("id", empresaId)
      .maybeSingle()

    if (error) {
      console.error("[v0] Error fetching empresa data from empresas_permisos:", error)
      return null
    }

    // Return default empresa data if not found
    if (!data) {
      return { id: empresaId, nombre: `Empresa ${empresaId}`, nit: null, direccion: null }
    }

    return data
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return null
  }
}
