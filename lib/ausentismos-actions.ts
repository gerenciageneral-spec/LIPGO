"use server"

import { readFile } from "fs/promises"
import path from "path"
import { read, utils } from "xlsx"
import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import diagnosticos from "@/lib/diagnosticos-cie10.json"

// Archivo fuente SST-MAT-06 guardado en el proyecto.
const EXCEL_RELATIVE_PATH =
  "data/SST-MAT-06-ANLISIS-ESTADSTICO-DE-AUSENTISMO-LABORAL-POR-ENFERMEDAD-GENERAL-Y-ACCIDENTE-LABORAL-1-e34ae6.xlsx"
// Marca para reconocer (y poder reemplazar) las filas importadas del Excel.
const IMPORT_MARK = "Importado de SST-MAT-06"

export interface Diagnostico {
  codigo: string
  descripcion: string
}

export interface Ausentismo {
  id: string
  idempresa: number
  mes: string | null
  nombre_colaborador: string
  cedula: string | null
  cargo: string | null
  area: string | null
  estado_colaborador: string | null
  centro_trabajo: string | null
  tipo_evento: "EG" | "AT"
  eps: string | null
  fecha_inicial: string | null
  fecha_final: string | null
  dias_incapacidad: number | null
  prorroga: number | null
  total_dias_incapacidad: number | null
  dias_empresa: number | null
  dias_eps: number | null
  codigo_diagnostico: string | null
  descripcion_diagnostico: string | null
  parte_cuerpo: string | null
  estadistica: string | null
  requiere_revision_sst: boolean
  salario_base: number | null
  salario_base_dia: number | null
  costos_empresa: number | null
  costos_eps: number | null
  total_salario_pagado: number | null
  observaciones: string | null
  created_at: string
}

// TRUE cuando el codigo CIE-10 empieza por "M" (sistema osteomuscular):
// estos casos deben ir en rojo para revision del profesional de SST.
function requiereRevisionSST(codigo?: string | null) {
  return !!codigo && codigo.trim().toUpperCase().startsWith("M")
}

// Busca diagnosticos CIE-10 por codigo o descripcion (server-side para no
// enviar el catalogo completo de ~12.4k filas al cliente).
export async function searchDiagnosticos(query: string): Promise<Diagnostico[]> {
  const q = query.trim().toUpperCase()
  if (q.length < 2) return []
  const list = diagnosticos as Diagnostico[]
  // Priorizamos: 1) codigo que empieza por lo digitado, 2) codigo que lo
  // contiene, 3) coincidencia por descripcion. Asi, al digitar el codigo de la
  // incapacidad aparecen primero los diagnosticos de ese codigo.
  const startsCode: Diagnostico[] = []
  const includesCode: Diagnostico[] = []
  const byDesc: Diagnostico[] = []
  for (const d of list) {
    const cod = d.codigo.toUpperCase()
    if (cod.startsWith(q)) startsCode.push(d)
    else if (cod.includes(q)) includesCode.push(d)
    else if (d.descripcion.toUpperCase().includes(q)) byDesc.push(d)
  }
  return [...startsCode, ...includesCode, ...byDesc].slice(0, 30)
}

// Colaborador del Head Count usado para autocompletar el formulario de
// ausentismo. El "centro de trabajo" corresponde al proyecto/empresa.
export interface HeadcountColaborador {
  identificacion: string
  nombre: string
  cargo: string | null
  estado: string | null
  centro_trabajo: string | null
}

// Trae el personal del modulo Head Count (Gestion Humana) de la empresa
// seleccionada, incluyendo el nombre de la empresa como centro de trabajo.
export async function getHeadcountColaboradores(
  empresaIdFromClient?: number | null,
): Promise<HeadcountColaborador[]> {
  const supabase = await createClient()
  const empresaId =
    empresaIdFromClient && !Number.isNaN(empresaIdFromClient)
      ? empresaIdFromClient
      : await getCurrentEmpresaIdForInsert()

  if (!empresaId) return []

  // Nombre de la empresa = centro de trabajo / proyecto del colaborador.
  const { data: empresa } = await supabase
    .from("empresas")
    .select("nombre")
    .eq("id", empresaId)
    .maybeSingle()
  const centroTrabajo = empresa?.nombre ?? null

  const { data, error } = await supabase
    .from("headcount")
    .select("identificacion, nombre, cargo, estado")
    .eq("idempresa", empresaId)
    .order("nombre", { ascending: true })

  if (error) {
    console.error("[v0] Error fetching headcount colaboradores:", error)
    return []
  }

  return (data ?? []).map((p: any) => ({
    identificacion: p.identificacion,
    nombre: p.nombre,
    cargo: p.cargo ?? null,
    estado: p.estado ?? null,
    centro_trabajo: centroTrabajo,
  }))
}

export async function getAusentismos(empresaId?: number | null): Promise<Ausentismo[]> {
  const supabase = await createClient()
  let query = supabase.from("ausentismosst").select("*").order("created_at", { ascending: false })
  if (empresaId) query = query.eq("idempresa", empresaId)

  const { data, error } = await query
  if (error) {
    console.error("[v0] Error fetching ausentismos:", error)
    return []
  }
  return (data ?? []) as Ausentismo[]
}

export async function createAusentismo(
  data: Record<string, any>,
  empresaIdFromClient?: number | null,
) {
  const supabase = await createClient()
  const empresaId =
    empresaIdFromClient && !Number.isNaN(empresaIdFromClient)
      ? empresaIdFromClient
      : await getCurrentEmpresaIdForInsert()

  const { id, created_at, idempresa, ...rest } = data

  const { data: inserted, error } = await supabase
    .from("ausentismosst")
    .insert({
      ...rest,
      idempresa: empresaId,
      requiere_revision_sst: requiereRevisionSST(rest.codigo_diagnostico),
    })
    .select()

  if (error) {
    console.error("[v0] Error creating ausentismo:", error)
    return { success: false, message: error.message }
  }
  return { success: true, data: inserted?.[0] as Ausentismo }
}

export async function updateAusentismo(id: string, updates: Record<string, any>) {
  const supabase = await createClient()
  const { idempresa, id: _ignore, created_at, ...rest } = updates

  const { data, error } = await supabase
    .from("ausentismosst")
    .update({
      ...rest,
      requiere_revision_sst: requiereRevisionSST(rest.codigo_diagnostico),
    })
    .eq("id", id)
    .select()

  if (error) {
    console.error("[v0] Error updating ausentismo:", error)
    return { success: false, message: error.message }
  }
  return { success: true, data: data?.[0] as Ausentismo }
}

export async function deleteAusentismo(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("ausentismosst").delete().eq("id", id)
  if (error) {
    console.error("[v0] Error deleting ausentismo:", error)
    return { success: false, message: error.message }
  }
  return { success: true }
}

// ----- Importacion desde el Excel SST-MAT-06 -----------------------------

function toISODate(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (!s) return null
  if (s.includes("T")) return s.slice(0, 10) // ISO con hora
  return s
}

function toInt(v: any): number {
  const n = Number.parseInt(String(v ?? "").replace(/[^\d.-]/g, ""), 10)
  return Number.isNaN(n) ? 0 : n
}

function toFloat(v: any): number {
  const n = Number.parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""))
  return Number.isNaN(n) ? 0 : n
}

function str(v: any): string | null {
  const s = String(v ?? "").trim()
  return s || null
}

// Importa las filas de las dos hojas de datos del Excel (Enfermedad General /
// Accidente de Transito, y Accidentes Laborales) para la empresa indicada.
// Reemplaza importaciones previas (filas marcadas) para que sea idempotente.
export async function importAusentismosFromExcel(empresaIdFromClient?: number | null) {
  const supabase = await createClient()
  const empresaId =
    empresaIdFromClient && !Number.isNaN(empresaIdFromClient)
      ? empresaIdFromClient
      : await getCurrentEmpresaIdForInsert()

  if (!empresaId) {
    return { success: false, message: "No hay empresa seleccionada." }
  }

  let workbook
  try {
    const buf = await readFile(path.join(process.cwd(), EXCEL_RELATIVE_PATH))
    workbook = read(buf, { cellDates: true })
  } catch (err: any) {
    console.error("[v0] Error reading Excel:", err?.message)
    return { success: false, message: "No se pudo leer el archivo Excel." }
  }

  const rows: Record<string, any>[] = []

  // Hoja 1: "Base de Datos E.G - A.C" (EG y AT, con EPS y desglose de costos).
  const egSheet = workbook.Sheets["Base de Datos E.G - A.C"]
  if (egSheet) {
    const data = utils.sheet_to_json<any[]>(egSheet, { header: 1, raw: false })
    for (let i = 5; i < data.length; i++) {
      const r = data[i]
      if (!r) continue
      const nombre = str(r[1])
      if (!nombre || nombre.toUpperCase().includes("NOMBRES Y APELLIDOS")) continue
      const tipo = (str(r[7]) || "EG").toUpperCase() === "AT" ? "AT" : "EG"
      rows.push({
        mes: str(r[0]),
        nombre_colaborador: nombre,
        cedula: str(r[2]),
        cargo: str(r[3]),
        area: str(r[4]),
        estado_colaborador: str(r[5]),
        centro_trabajo: str(r[6]),
        tipo_evento: tipo,
        eps: str(r[8]),
        fecha_inicial: toISODate(r[9]),
        fecha_final: toISODate(r[10]),
        dias_incapacidad: toInt(r[11]),
        prorroga: toInt(r[12]),
        total_dias_incapacidad: toInt(r[13]),
        dias_empresa: toInt(r[14]),
        dias_eps: toInt(r[15]),
        codigo_diagnostico: str(r[16]),
        descripcion_diagnostico: str(r[17]),
        parte_cuerpo: str(r[18]),
        estadistica: str(r[19]),
        salario_base: toFloat(r[20]),
        salario_base_dia: toFloat(r[21]),
        costos_empresa: toFloat(r[22]),
        costos_eps: toFloat(r[23]),
        total_salario_pagado: toFloat(r[24]),
      })
    }
  }

  // Hoja 2: "Base de Datos - AL" (Accidentes Laborales). Tiene celdas
  // combinadas: los datos del colaborador solo aparecen en la primera fila de
  // cada bloque, por lo que rellenamos hacia abajo (forward-fill).
  const alSheet = workbook.Sheets["Base de Datos - AL"]
  if (alSheet) {
    const data = utils.sheet_to_json<any[]>(alSheet, { header: 1, raw: false })
    let lastMes: string | null = null
    let lastNombre: string | null = null
    let lastCedula: string | null = null
    let lastCargo: string | null = null
    let lastArea: string | null = null
    let lastEstado: string | null = null
    let lastCentro: string | null = null
    let lastCentroMedico: string | null = null
    for (let i = 5; i < data.length; i++) {
      const r = data[i]
      if (!r) continue
      lastMes = str(r[0]) ?? lastMes
      lastNombre = str(r[1]) ?? lastNombre
      lastCedula = str(r[2]) ?? lastCedula
      lastCargo = str(r[3]) ?? lastCargo
      lastArea = str(r[4]) ?? lastArea
      lastEstado = str(r[5]) ?? lastEstado
      lastCentro = str(r[6]) ?? lastCentro
      lastCentroMedico = str(r[7]) ?? lastCentroMedico
      // Una fila valida del bloque tiene fechas o diagnostico.
      const fi = toISODate(r[8])
      const cod = str(r[13])
      if (!fi && !cod && !str(r[10])) continue
      if (!lastNombre) continue
      rows.push({
        mes: lastMes,
        nombre_colaborador: lastNombre,
        cedula: lastCedula,
        cargo: lastCargo,
        area: lastArea,
        estado_colaborador: lastEstado,
        centro_trabajo: lastCentro,
        tipo_evento: "AT",
        eps: lastCentroMedico,
        fecha_inicial: fi,
        fecha_final: toISODate(r[9]),
        dias_incapacidad: toInt(r[10]),
        prorroga: toInt(r[11]),
        total_dias_incapacidad: toInt(r[12]),
        dias_empresa: 0,
        dias_eps: 0,
        codigo_diagnostico: cod,
        descripcion_diagnostico: str(r[14]),
        parte_cuerpo: str(r[15]),
        estadistica: str(r[16]),
        salario_base: toFloat(r[17]),
        salario_base_dia: toFloat(r[18]),
        costos_empresa: 0,
        costos_eps: toFloat(r[19]),
        total_salario_pagado: toFloat(r[19]),
      })
    }
  }

  if (rows.length === 0) {
    return { success: false, message: "No se encontraron filas para importar en el Excel." }
  }

  // Reemplazo idempotente: elimina importaciones previas de esta empresa.
  await supabase
    .from("ausentismosst")
    .delete()
    .eq("idempresa", empresaId)
    .eq("observaciones", IMPORT_MARK)

  const payload = rows.map((r) => ({
    ...r,
    idempresa: empresaId,
    requiere_revision_sst: requiereRevisionSST(r.codigo_diagnostico),
    observaciones: IMPORT_MARK,
  }))

  const { error } = await supabase.from("ausentismosst").insert(payload)
  if (error) {
    console.error("[v0] Error importing ausentismos:", error)
    return { success: false, message: error.message }
  }

  return { success: true, count: payload.length }
}
