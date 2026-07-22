"use server"

import { readFile } from "fs/promises"
import path from "path"
import { read, utils } from "xlsx"
import { createClient } from "@/lib/supabase-client"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
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
  costos_arl?: number | null
  total_salario_pagado: number | null
  observaciones: string | null
  // Seguimiento del recobro (submódulo Recobro de Incapacidades, SQL 27).
  estado_recobro?: string | null
  valor_recobrado?: number | null
  fecha_radicado_recobro?: string | null
  obs_recobro?: string | null
  // Soportes de gestión del recobro (SQL 28): correo a EPS/ARL y comprobante de pago.
  soporte_radicado_url?: string | null
  soporte_pago_url?: string | null
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

// ---------------------------------------------------------------------------
// Análisis de ausentismo desde el CONTROL DIARIO (registroasistencia) — la
// fuente de verdad de los 4 proyectos (Visor / Tabla de asistencia /
// Programación de turnos). Distingue ausentismo médico (incapacidad) de otras
// novedades y de personal NO programado, y permite analizar causas, códigos
// más repetidos, reincidentes y meses con mayor ausentismo.
// ---------------------------------------------------------------------------
export interface AnalisisAusentismo {
  resumen: {
    programados: number
    presentes: number
    incapacidadTurnos: number // incapacidad médica (13/14/15/16)
    faltaNoMedica: number // licencia no remunerada (faltó, no es por salud ni planeada)
    planeadas: number // vacaciones, descanso, licencias remuneradas, maternidad, luto
    noProgramados: number // sin turno asignado
    pctAusentismo: number // incapacidad médica / programados (IND-GH-02)
  }
  porCodigo: { codigo: string; turnos: number; esIncapacidad: boolean }[]
  reincidentes: { identificacion: string; nombre: string; incapacidades: number; novedades: number }[]
  porMes: { mes: string; incapacidad: number; novedades: number; programados: number }[]
  anios: string[]
  // Detalle de cada evento/novedad (para el drill-down de las tarjetas).
  eventos: { fecha: string; nombre: string; identificacion: string; codigo: string; tipo: string }[]
}

export async function getAnalisisAusentismoDiario(
  empresaIdFromClient?: number | null,
  anio?: string | null,
  mes?: string | null,
): Promise<AnalisisAusentismo> {
  const supabase = await createClient()
  // Si viene un cliente, ese; si no, los 4 proyectos SIG (análisis consolidado).
  const clientes: number[] = empresaIdFromClient && !Number.isNaN(empresaIdFromClient) ? [empresaIdFromClient] : [1, 2, 3, 4]

  // Traer TODO el control diario del/los proyecto(s) (paginado). El filtro de
  // año/mes se aplica en código para poder ofrecer los años disponibles.
  const rows: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from("registroasistencia").select("fecha,nombre,identificacion,puesto,asistencia").in("idempresa", clientes).range(from, from + 999)
    if (error) { console.error("[v0] getAnalisisAusentismoDiario:", error.message); break }
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
    from += 1000
    if (from > 200000) break
  }

  // La novedad evidencia el tipo: incapacidad (salud) vs falta no médica
  // (licencia no remunerada) vs planeada (vacaciones/descanso/licencias) vs retiro.
  const esIncap = (a: any) => String(a || "").toLowerCase().includes("incapacidad")
  const esFaltaNoMedica = (a: any) => String(a || "").toLowerCase().includes("no remunerada")
  const esRetiro = (a: any) => String(a || "").toLowerCase().includes("retiro")
  const tipoDe = (a: any) => esIncap(a) ? "incapacidad" : esFaltaNoMedica(a) ? "falta" : esRetiro(a) ? "retiro" : "planeada"

  // Años disponibles (de todo el set) y filtro año/mes en código.
  const anios = Array.from(new Set(rows.map((r) => String(r.fecha ?? "").slice(0, 4)).filter(Boolean))).sort().reverse()
  const filtradas = rows.filter((r) => {
    const f = String(r.fecha ?? "")
    if (anio && f.slice(0, 4) !== anio) return false
    if (mes && f.slice(5, 7) !== mes) return false
    return true
  })

  let programados = 0, presentes = 0, incapacidadTurnos = 0, faltaNoMedica = 0, planeadas = 0, noProgramados = 0
  const codigos: Record<string, { turnos: number; inc: boolean }> = {}
  const personas: Record<string, { nombre: string; inc: number; nov: number }> = {}
  const meses: Record<string, { inc: number; nov: number; prog: number }> = {}
  const eventos: { fecha: string; nombre: string; identificacion: string; codigo: string; tipo: string }[] = []

  for (const r of filtradas) {
    const tieneNovedad = r.asistencia !== null && r.asistencia !== ""
    const programado = r.puesto !== null || tieneNovedad
    const mesK = String(r.fecha ?? "").slice(0, 7)
    if (mesK && !meses[mesK]) meses[mesK] = { inc: 0, nov: 0, prog: 0 }
    if (programado) { programados++; if (mesK) meses[mesK].prog++ }
    if (!tieneNovedad && r.puesto !== null) presentes++
    if (!tieneNovedad && r.puesto === null) noProgramados++
    if (tieneNovedad) {
      const cod = String(r.asistencia)
      const inc = esIncap(cod)
      if (inc) incapacidadTurnos++
      else if (esFaltaNoMedica(cod)) faltaNoMedica++
      else if (!esRetiro(cod)) planeadas++ // vacaciones/descanso/licencias; retiro = baja, no cuenta
      if (!codigos[cod]) codigos[cod] = { turnos: 0, inc }
      codigos[cod].turnos++
      const id = String(r.identificacion ?? "?")
      if (!personas[id]) personas[id] = { nombre: r.nombre ?? id, inc: 0, nov: 0 }
      personas[id].nov++
      if (inc) personas[id].inc++
      if (mesK) { meses[mesK].nov++; if (inc) meses[mesK].inc++ }
      eventos.push({ fecha: r.fecha, nombre: r.nombre ?? id, identificacion: id, codigo: cod, tipo: tipoDe(cod) })
    }
  }

  return {
    resumen: {
      programados, presentes, incapacidadTurnos, faltaNoMedica, planeadas, noProgramados,
      pctAusentismo: programados > 0 ? Math.round((incapacidadTurnos / programados) * 1000) / 10 : 0,
    },
    porCodigo: Object.entries(codigos).map(([codigo, v]) => ({ codigo, turnos: v.turnos, esIncapacidad: v.inc })).sort((a, b) => b.turnos - a.turnos),
    reincidentes: Object.entries(personas).map(([identificacion, v]) => ({ identificacion, nombre: v.nombre, incapacidades: v.inc, novedades: v.nov }))
      .sort((a, b) => b.incapacidades - a.incapacidades || b.novedades - a.novedades).slice(0, 12),
    porMes: Object.entries(meses).map(([mes, v]) => ({ mes, incapacidad: v.inc, novedades: v.nov, programados: v.prog })).sort((a, b) => a.mes.localeCompare(b.mes)),
    anios,
    eventos: eventos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))),
  }
}

// Parámetros legales por año (SMLV, auxilio) — base del cálculo de costos.
export interface ParametroAnio { anio: number; smlv: number; auxilio_transporte: number; dias_cargo_empleador: number; pct_pago_incapacidad: number }

export async function getParametrosLegalesAnio(): Promise<ParametroAnio[]> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const { data, error } = await supabase.from("parametros_legales_anio").select("*").order("anio", { ascending: false })
    if (error) return []
    return (data ?? []) as ParametroAnio[]
  } catch { return [] }
}

export async function upsertParametroLegalAnio(
  anio: number, smlv: number, auxilio_transporte: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!anio || !smlv) return { success: false, error: "Año y SMLV son obligatorios" }
    const supabase: any = await getSupabaseAdmin()
    const { error } = await supabase.from("parametros_legales_anio")
      .upsert({ anio, smlv, auxilio_transporte: auxilio_transporte || 0, actualizado_at: new Date().toISOString() }, { onConflict: "anio" })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) { return { success: false, error: err?.message || "Error" } }
}

/**
 * PUENTE (backfill de una vez): genera BORRADORES en ausentismosst a partir de
 * las incapacidades del control diario (registroasistencia), agrupando días
 * consecutivos en episodios. Solo procesa MESES INCOMPLETOS: omite los meses que
 * ya tienen registros en ausentismosst (no duplica ni toca lo cargado). El
 * analista luego completa diagnóstico/AT-EG/costos. Por proyecto.
 */
export interface BorradorAusentismoResult {
  creados: number
  episodios: number
  mesesOmitidos: string[]
  error?: string
}
const MESES_NOMBRE = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

export async function generarBorradoresAusentismoDesdeControl(
  empresaId: number,
  anio: string,
  mes?: string | null,
): Promise<BorradorAusentismoResult> {
  try {
    if (!empresaId) return { creados: 0, episodios: 0, mesesOmitidos: [], error: "Selecciona un cliente/sitio en el selector global" }
    if (!anio) return { creados: 0, episodios: 0, mesesOmitidos: [], error: "Indica el año" }
    const supabase: any = await getSupabaseAdmin()

    const { data: emp } = await supabase.from("empresas").select("nombre").eq("id", empresaId).maybeSingle()
    const centro = emp?.nombre ?? null
    const { data: hc } = await supabase.from("headcount").select("identificacion,cargo,salario").eq("idempresa", empresaId)
    const cargoById: Record<string, string> = {}
    const salarioById: Record<string, number> = {}
    for (const h of hc ?? []) { cargoById[String(h.identificacion)] = h.cargo; salarioById[String(h.identificacion)] = Number(h.salario) || 0 }
    // Parámetros legales del año (SMLV) para el cálculo de costos.
    const { data: par } = await supabase.from("parametros_legales_anio").select("*").eq("anio", Number(anio)).maybeSingle()
    const smlv = Number(par?.smlv) || 1423500
    const diasEmpleador = Number(par?.dias_cargo_empleador ?? 2)
    const pct = Number(par?.pct_pago_incapacidad ?? 66.67) / 100

    // Incapacidades del control diario (año + mes opcional).
    const rows: any[] = []
    let from = 0
    while (true) {
      let q = supabase.from("registroasistencia").select("fecha,nombre,identificacion,asistencia").eq("idempresa", empresaId)
        .ilike("asistencia", "%incapacidad%").gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`).range(from, from + 999)
      const { data, error } = await q
      if (error) return { creados: 0, episodios: 0, mesesOmitidos: [], error: error.message }
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
      from += 1000
      if (from > 60000) break
    }
    const enScope = mes ? rows.filter((r) => String(r.fecha).slice(5, 7) === mes) : rows

    // Meses ya cargados en ausentismosst (se omiten = "meses completos").
    const { data: existentes } = await supabase.from("ausentismosst").select("fecha_inicial").eq("idempresa", empresaId)
    const mesesCargados = new Set((existentes ?? []).map((e: any) => String(e.fecha_inicial ?? "").slice(0, 7)).filter(Boolean))

    // Agrupar por persona en episodios (días contiguos, gap <= 4 días).
    const porPersona: Record<string, any[]> = {}
    for (const r of enScope) { const id = String(r.identificacion ?? "?"); (porPersona[id] = porPersona[id] || []).push(r) }
    const dif = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
    const episodios: any[] = []
    for (const id of Object.keys(porPersona)) {
      const lista = porPersona[id].filter((x) => x.fecha).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      let ep: any = null
      for (const x of lista) {
        if (ep && dif(ep.fin, x.fecha) <= 4) { ep.fin = x.fecha; ep.dias++ }
        else { if (ep) episodios.push(ep); ep = { id, nombre: x.nombre ?? id, codigo: x.asistencia, ini: x.fecha, fin: x.fecha, dias: 1 } }
      }
      if (ep) episodios.push(ep)
    }

    // Construir borradores, omitiendo meses ya cargados.
    const mesesOmitidosSet = new Set<string>()
    const filas = episodios.filter((ep) => {
      const ym = String(ep.ini).slice(0, 7)
      if (mesesCargados.has(ym)) { mesesOmitidosSet.add(ym); return false }
      return true
    }).map((ep) => {
      const m = Number(String(ep.ini).slice(5, 7))
      const esAT = String(ep.codigo).toLowerCase().includes("profesional")
      // Costo sugerido con el SMLV del año. Base salarial = salario real del
      // colaborador (headcount), con piso en el SMLV. EG: días 1-2 a cargo del
      // empleador y el resto a cargo de la EPS, al % de ley. AT: lo asume la ARL.
      const salarioBase = Math.max(salarioById[ep.id] || 0, smlv)
      const salarioDia = Math.round(salarioBase / 30)
      const diasEmp = esAT ? 0 : Math.min(ep.dias, diasEmpleador)
      const diasEps = esAT ? 0 : Math.max(0, ep.dias - diasEmpleador)
      const costosEmpresa = Math.round(diasEmp * salarioDia * pct)
      const costosEps = Math.round(diasEps * salarioDia * pct)
      // AT: a cargo de la ARL al 100% del salario (para el análisis SST de costos).
      const costosArl = esAT ? Math.round(ep.dias * salarioDia) : 0
      return {
        idempresa: empresaId,
        mes: MESES_NOMBRE[m] ?? null,
        nombre_colaborador: ep.nombre,
        cedula: ep.id,
        cargo: cargoById[ep.id] ?? null,
        centro_trabajo: centro,
        tipo_evento: esAT ? "AT" : "EG",
        fecha_inicial: ep.ini,
        fecha_final: ep.fin,
        dias_incapacidad: ep.dias,
        total_dias_incapacidad: ep.dias,
        dias_empresa: diasEmp,
        dias_eps: diasEps,
        salario_base: salarioBase,
        salario_base_dia: salarioDia,
        costos_empresa: costosEmpresa,
        costos_eps: costosEps,
        costos_arl: costosArl,
        requiere_revision_sst: false,
        observaciones: `[Borrador desde control diario · SMLV ${anio}] completar diagnóstico/AT-EG; costo estimado`,
      }
    })

    if (filas.length > 0) {
      const { error } = await supabase.from("ausentismosst").insert(filas)
      if (error) return { creados: 0, episodios: episodios.length, mesesOmitidos: [...mesesOmitidosSet], error: error.message }
    }
    return { creados: filas.length, episodios: episodios.length, mesesOmitidos: [...mesesOmitidosSet].sort() }
  } catch (err: any) {
    return { creados: 0, episodios: 0, mesesOmitidos: [], error: err?.message || "Error desconocido" }
  }
}

// Normaliza una cédula/identificación para casar ausentismosst.cedula con headcount.identificacion
// (quita sufijo ".0" del Excel y deja solo dígitos).
function normCedula(c: string | null | undefined): string {
  return String(c ?? "").trim().replace(/\.0+$/, "").replace(/\D/g, "")
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
  const rows = (data ?? []) as Ausentismo[]

  // ESTADO VIGENTE + VALOR DÍA del colaborador desde headcount (por identificación).
  //  - estado_colaborador queda CONGELADO al crear la fila; si la persona se retira
  //    después (novedad de retiro → headcount Inactivo), el módulo debe reflejar el retiro.
  //  - salario_base / salario_base_dia se completan con el salario del head count (piso
  //    SMLV del año) para VALORIZAR cada incapacidad = días × valor día. Es el mismo
  //    valor día que usa el cuadro de nómina (parafiscales/prestaciones): salario / 30.
  try {
    // SMLV por año (para el piso del salario base). El SMLV más reciente sirve de default.
    const smlvPorAnio = new Map<string, number>()
    let smlvDefault = 0
    const { data: pars } = await supabase.from("parametros_legales_anio").select("anio, smlv")
    for (const p of pars ?? []) {
      const s = Number(p.smlv) || 0
      smlvPorAnio.set(String(p.anio), s)
      if (s > smlvDefault) smlvDefault = s
    }
    if (!smlvDefault) smlvDefault = 1423500 // fallback 2026

    const estadoHc = new Map<string, string>()
    const salarioHc = new Map<string, number>()
    for (let off = 0; ; off += 1000) {
      const { data: hc } = await supabase
        .from("headcount")
        .select("identificacion, estado, fecha_retiro, salario")
        .range(off, off + 999)
      if (!hc || hc.length === 0) break
      for (const h of hc) {
        const k = normCedula(h.identificacion)
        if (!k) continue
        const est = String(h.estado ?? "").toUpperCase()
        const retirado = est.includes("INACTIV") || est.includes("RETIR") || !!h.fecha_retiro
        estadoHc.set(k, retirado ? "RETIRADO" : "ACTIVO")
        const sal = Number(h.salario) || 0
        if (sal > 0) salarioHc.set(k, sal)
      }
      if (hc.length < 1000) break
    }
    const smlvActual = smlvDefault // SMLV vigente (año más reciente) = mínimo de hoy
    for (const r of rows) {
      const k = normCedula(r.cedula)
      if (!k) continue
      if (estadoHc.has(k)) r.estado_colaborador = estadoHc.get(k)!
      // Valor día por AÑO de la incapacidad. El head count solo guarda el salario
      // VIGENTE, así que:
      //   - Quien gana el mínimo (salario ≤ SMLV de hoy) se valoriza con el SMLV del
      //     AÑO de la incapacidad (2025 usa SMLV 2025; 2026 usa SMLV 2026).
      //   - Quien gana por encima del mínimo usa su salario (piso en el SMLV del año);
      //     no hay histórico de salario, se toma el vigente como mejor aproximación.
      const anioFila = String(r.fecha_inicial ?? "").slice(0, 4)
      const smlvAnio = smlvPorAnio.get(anioFila) || smlvDefault
      const salActual = salarioHc.get(k) || 0
      const salarioBase = salActual > smlvActual ? Math.max(salActual, smlvAnio) : smlvAnio
      if (salarioBase > 0) {
        r.salario_base = salarioBase
        // Valor día = salario / 30 (mismo divisor del cuadro de nómina).
        r.salario_base_dia = Math.round(salarioBase / 30)
      }
    }
  } catch (e) {
    console.error("[v0] Error sincronizando estado/valor día con headcount:", e)
  }

  return rows
}

// AT REALES = investigaciones (sst_incidentes): una investigación por accidente. Las
// prórrogas son filas extra en ausentismosst pero NO son AT nuevos. Devuelve fecha del
// evento y estado (para contar por período y separar pendientes de cerradas).
export async function getIncidentesAT(
  empresaId?: number | null,
): Promise<{ fecha_evento: string | null; estado: string | null }[]> {
  const supabase = await createClient()
  let q = supabase.from("sst_incidentes").select("fecha_evento, estado")
  if (empresaId) q = q.eq("idempresa", empresaId)
  const { data, error } = await q
  if (error) {
    console.error("[v0] Error fetching incidentes AT:", error)
    return []
  }
  return (data ?? []) as { fecha_evento: string | null; estado: string | null }[]
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
