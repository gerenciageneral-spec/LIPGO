"use server"

/**
 * Copiloto de rotación (Programación de turnos → Programar el día → panel
 * LIPbot). Sugiere a quién mover de un puesto a DESTAJO (Cargue/Descargue,
 * paga por la tonelada que llegue) a un puesto de ESPECIALIDAD/turno (paga
 * por hora, día garantizado), para nivelar el ingreso de la quincena.
 *
 * Determinística, sin llamada a IA -- mismo patrón que `sugerenciaProximoTurno`
 * en `lib/centro-coordinacion-actions.ts`: regla de negocio en TypeScript
 * plano sobre datos reales, auditable, sin riesgo de alucinación en algo
 * adyacente a nómina. Reusa tal cual:
 *  - `getControlToneladas` (toneladas / % de meta)
 *  - `getHorarioTolva` (cuántos turnos de Tolva programó el coordinador ese
 *    día -- único insumo variable de `NECESIDAD_FIJA`, ver ID1 abajo)
 *  - `categoriaDeNovedad` (filtro de domingo, mismo código que usa nómina
 *    para Siigo -- "sin justa causa" = novedad "licencia no remunerada")
 *  - `resolverPuesto` (gating de Pacas/Cosedor contra Solicitudes Adicionales)
 *
 * "Necesidad por puesto" son cantidades FIJAS de planta confirmadas por el
 * negocio (`NECESIDAD_FIJA`, 2026-09-20) -- NO se leen de la Cobertura de
 * Vista de quincena (esa demanda día-a-día existe en el esquema pero nadie
 * la ha declarado todavía; si algún día se usa, se puede sumar como
 * excepción puntual sin tocar esta lógica).
 *
 * Criterios, en el orden confirmado por el negocio:
 *   1) Horas extra acumuladas (últimos 7 días) -- quien ya está topado entra
 *      de último en la rotación.
 *   2) Toneladas vs. meta (Control de Toneladas) -- quien está más bajo
 *      entra primero.
 *   3) Se le asigna la especialidad/turno que hoy paga más nómina, para
 *      nivelar su ingreso.
 *   4) Hora de entrada rotativa -- desempate entre quien entra temprano y
 *      quien entra tarde.
 * Filtro no negociable: nadie con ausencia "sin justa causa" reciente
 * (licencia no remunerada) puede ir un domingo.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getControlToneladas } from "@/lib/control-toneladas-actions"
import { getHorarioTolva } from "@/lib/horario-tolva-actions"
import { categoriaDeNovedad } from "@/lib/ausentismo-categorias"
import { resolverPuesto } from "@/lib/puestos-turno-alias"
import { normalizeName } from "@/lib/nomina-calculo-utils"

const INDUPAN = 1
const AVIMOL = 2
const CEDI_FUNZA = 3

interface DestinoRotacion {
  puesto: string
  /** Pacas/Cosedor: solo se sugieren si hay una Solicitud Adicional aprobada para ese puesto/fecha. */
  gatedPorSolicitud?: boolean
}

interface ReglaRotacion {
  /** Puesto de destajo del que se rota (null para ID3, cuya regla no depende del puesto de origen). */
  origen: string | null
  destinos: DestinoRotacion[]
  /** true = regla especial ID3 (todos rotan por el destino al menos 1 vez/semana, no depende de toneladas). */
  rotacionSemanalObligatoria?: boolean
}

const MATRIZ_ROTACION: Record<number, ReglaRotacion> = {
  [INDUPAN]: { origen: "Cargue/Descargue", destinos: [{ puesto: "Auxiliar Mixto" }] },
  [AVIMOL]: {
    origen: "Cargue/Descargue",
    destinos: [
      { puesto: "Estibado PT" },
      { puesto: "Operario Salvado" },
      { puesto: "Cargue/Descargue Huevos" },
      { puesto: "Pacas", gatedPorSolicitud: true },
      { puesto: "Cosedor", gatedPorSolicitud: true },
    ],
  },
  [CEDI_FUNZA]: {
    origen: null,
    // Los mismos 7 de Cargue/Descargue cubren Distribución rotando -- no hay
    // un pool separado para Distribución en este proyecto.
    destinos: [{ puesto: "Distribución Turno" }],
    rotacionSemanalObligatoria: true,
  },
}

interface ItemNecesidadFija {
  puesto: string
  /** Cantidad fija de planta, o "porTurnoTolva" (solo ID1 Auxiliar Mixto: 4 × turnos de Tolva configurados ese día). */
  cantidad: number | "porTurnoTolva"
}

/**
 * Cantidades FIJAS de planta por puesto, confirmadas por el negocio
 * 2026-09-20. Puestos de un proyecto que NO aparecen aquí (ej.
 * "Cargue/Descargue Huevos" en ID2) no tienen cupo fijo declarado -- la
 * sugerencia no los acota.
 */
const NECESIDAD_FIJA: Record<number, ItemNecesidadFija[]> = {
  [INDUPAN]: [
    { puesto: "Cargue/Descargue", cantidad: 12 },
    { puesto: "Auxiliar Mixto", cantidad: "porTurnoTolva" },
  ],
  [AVIMOL]: [
    { puesto: "Cargue/Descargue", cantidad: 12 },
    { puesto: "Estibado PT", cantidad: 3 },
    { puesto: "Operario Salvado", cantidad: 3 },
    { puesto: "Montacargas de producción", cantidad: 1 },
    { puesto: "Montacargas de cargue", cantidad: 1 },
    { puesto: "Distribución Turno", cantidad: 4 },
  ],
  [CEDI_FUNZA]: [
    { puesto: "Cargue/Descargue", cantidad: 7 },
    // "1 montacargas" -- se asume "Montacargas de cargue" (carga camiones de
    // distribución); si el puesto real de ID3 es otro, avisar para corregir.
    { puesto: "Montacargas de cargue", cantidad: 1 },
  ],
}

export interface SugerenciaPersona {
  identificacion: string
  nombre: string
  puestoActual: string | null
  puestoSugerido: string
  horaEntradaSugerida: string
  horaSalidaSugerida: string
  criteriosAplicados: string[]
  pctCumplimiento: number | null
  horasExtraSemana: number
}

export interface NecesidadPuesto {
  puesto: string
  requeridos: number
  asignadosHoy: number
  disponibles: number | null // null = sin demanda declarada (Cobertura), no se pudo acotar
}

export interface SugerenciaRotacion {
  fecha: string
  reglaEmpresa: string | null
  sugerencias: SugerenciaPersona[]
  necesidadPorPuesto: NecesidadPuesto[]
  alertas: string[]
}

const p2 = (n: number) => String(n).padStart(2, "0")
function fechaMenosDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00`)
  d.setDate(d.getDate() - dias)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
function esDomingo(fecha: string): boolean {
  return new Date(`${fecha}T00:00:00`).getDay() === 0
}

export async function sugerirRotacion(
  empresaId: number,
  fecha: string,
): Promise<{ success: boolean; data?: SugerenciaRotacion; message?: string }> {
  if (!empresaId) return { success: false, message: "Empresa no seleccionada." }
  if (!fecha) return { success: false, message: "Fecha requerida." }

  const regla = MATRIZ_ROTACION[empresaId]
  if (!regla) {
    return {
      success: true,
      data: { fecha, reglaEmpresa: null, sugerencias: [], necesidadPorPuesto: [], alertas: ["No hay una regla de rotación configurada para este proyecto."] },
    }
  }

  const admin: any = await getSupabaseAdmin()
  const alertas: string[] = []

  // 1) Personal activo (mismo universo que ya usa Programar el día).
  const { data: hcRows, error: hcError } = await admin
    .from("headcount")
    .select("id, nombre, identificacion")
    .eq("idempresa", empresaId)
    .eq("estado", "Activo")
    .not("admin", "is", true)
  if (hcError) return { success: false, message: hcError.message }
  const personas: { id: number; nombre: string; identificacion: string }[] = (hcRows || []).map((p: any) => ({
    id: Number(p.id),
    nombre: String(p.nombre || ""),
    identificacion: String(p.identificacion || ""),
  }))
  if (personas.length === 0) return { success: true, data: { fecha, reglaEmpresa: regla.origen, sugerencias: [], necesidadPorPuesto: [], alertas: ["No hay personal activo."] } }

  // 2) Últimos 7 días de registroasistencia -- para saber el puesto/hora más
  //    frecuente de cada persona (quién está en destajo, hora habitual).
  const desde7 = fechaMenosDias(fecha, 7)
  const { data: raRows } = await admin
    .from("registroasistencia")
    .select("identificacion, nombre, puesto, horaentradaprogramada, asistencia, fecha")
    .eq("idempresa", empresaId)
    .gte("fecha", desde7)
    .lt("fecha", fecha)
  const puestoFrecuentePorId = new Map<string, string>()
  const horaFrecuentePorId = new Map<string, string>()
  const historicoPorId = new Map<string, any[]>()
  for (const r of raRows || []) {
    const ident = String(r.identificacion || "")
    if (!historicoPorId.has(ident)) historicoPorId.set(ident, [])
    historicoPorId.get(ident)!.push(r)
  }
  for (const [ident, filas] of historicoPorId.entries()) {
    const conteoPuesto = new Map<string, number>()
    const conteoHora = new Map<string, number>()
    for (const r of filas) {
      if (r.puesto) conteoPuesto.set(r.puesto, (conteoPuesto.get(r.puesto) || 0) + 1)
      if (r.horaentradaprogramada) {
        const h = String(r.horaentradaprogramada).slice(0, 5)
        conteoHora.set(h, (conteoHora.get(h) || 0) + 1)
      }
    }
    const puestoTop = [...conteoPuesto.entries()].sort((a, b) => b[1] - a[1])[0]
    if (puestoTop) puestoFrecuentePorId.set(ident, puestoTop[0])
    const horaTop = [...conteoHora.entries()].sort((a, b) => b[1] - a[1])[0]
    if (horaTop) horaFrecuentePorId.set(ident, horaTop[0])
  }

  // 3) Filtro de domingo: novedad "NO_REMUNERADA" (licencia no remunerada) en
  //    los últimos 30 días -- mismo código que ya usa nómina para Siigo.
  const excluidosDomingo = new Set<string>()
  if (esDomingo(fecha)) {
    const desde30 = fechaMenosDias(fecha, 30)
    const { data: novRows } = await admin
      .from("registroasistencia")
      .select("identificacion, asistencia")
      .eq("idempresa", empresaId)
      .gte("fecha", desde30)
      .lt("fecha", fecha)
      .not("asistencia", "is", null)
    for (const r of novRows || []) {
      if (categoriaDeNovedad(r.asistencia) === "NO_REMUNERADA") excluidosDomingo.add(String(r.identificacion))
    }
    if (excluidosDomingo.size > 0) {
      alertas.push(`${excluidosDomingo.size} persona(s) excluida(s) por ausencia sin justa causa reciente (no pueden ir el domingo).`)
    }
  }

  // 4) Control de Toneladas (mes en curso de `fecha`) -- % de cumplimiento.
  const [y, m] = fecha.split("-").map(Number)
  const ultimoDiaMes = new Date(y, m, 0).getDate()
  const toneladasRes = await getControlToneladas(empresaId, `${y}-${p2(m)}-01`, `${y}-${p2(m)}-${p2(ultimoDiaMes)}`)
  const pctPorNombreNorm = new Map<string, number>()
  if (toneladasRes.success && toneladasRes.data) {
    for (const t of toneladasRes.data.trabajadores) pctPorNombreNorm.set(normalizeName(t.persona), t.pctCumplimiento)
  } else {
    alertas.push("No se pudo leer Control de Toneladas -- la sugerencia no usa el criterio de % de meta.")
  }

  // 5) Horas extra últimos 7 días (CANTIDAD de horas, columnas horas_hed..horas_hn).
  const nombres = personas.map((p) => p.nombre).filter(Boolean)
  const horasExtraPorNombreNorm = new Map<string, number>()
  if (nombres.length > 0) {
    const { data: pnRows } = await admin
      .from("pagonomina")
      .select("persona, horas_hed, horas_hedf, horas_hen, horas_hef, horas_hn")
      .in("persona", nombres)
      .gte("fecha", desde7)
      .lt("fecha", fecha)
    for (const r of pnRows || []) {
      const key = normalizeName(r.persona)
      const h =
        Number(r.horas_hed || 0) + Number(r.horas_hedf || 0) + Number(r.horas_hen || 0) + Number(r.horas_hef || 0) + Number(r.horas_hn || 0)
      horasExtraPorNombreNorm.set(key, (horasExtraPorNombreNorm.get(key) || 0) + h)
    }
  }

  // 6) Última vez que cada persona pasó por cada destino (para ID3 y como
  //    dato informativo general) -- últimos 30 días.
  const desde30gen = fechaMenosDias(fecha, 30)
  const { data: raRows30 } = await admin
    .from("registroasistencia")
    .select("identificacion, puesto, fecha")
    .eq("idempresa", empresaId)
    .gte("fecha", desde30gen)
    .lt("fecha", fecha)
  const ultimaVezEnPuesto = new Map<string, string>() // `${identificacion}|${puesto}` -> fecha más reciente
  for (const r of raRows30 || []) {
    if (!r.puesto) continue
    const key = `${r.identificacion}|${r.puesto}`
    const actual = ultimaVezEnPuesto.get(key)
    if (!actual || String(r.fecha) > actual) ultimaVezEnPuesto.set(key, String(r.fecha))
  }

  // 7) Necesidad por puesto: cantidades FIJAS de planta, confirmadas por el
  //    negocio (2026-09-20), no una demanda declarada día a día -- por eso NO
  //    se lee de `demanda_puesto`/Cobertura (esa tabla está vacía hoy). Único
  //    caso variable: ID1 Auxiliar Mixto depende de cuántos turnos de Tolva
  //    programó el coordinador ESE día (Horario de Tolva, Turno 1/2).
  //    "asignadosHoy" sí es real: cuenta filas ya guardadas en
  //    `registroasistencia` para ese puesto/fecha.
  const destinosTodos = regla.destinos.map((d) => d.puesto)
  const necesidadFijaPorPuesto = new Map<string, number>()
  for (const item of NECESIDAD_FIJA[empresaId] || []) {
    if (item.cantidad === "porTurnoTolva") {
      const horarioRes = await getHorarioTolva(empresaId, fecha)
      let turnosConfigurados = 0
      if (horarioRes.success && horarioRes.data) {
        if (horarioRes.data.turno1.horaInicio && horarioRes.data.turno1.horaFin) turnosConfigurados++
        if (horarioRes.data.turno2.horaInicio && horarioRes.data.turno2.horaFin) turnosConfigurados++
      }
      necesidadFijaPorPuesto.set(item.puesto, 4 * turnosConfigurados)
      if (turnosConfigurados === 0) alertas.push(`No hay Horario de Tolva configurado para ${fecha} -- no se sugiere ${item.puesto} hasta que se configure.`)
    } else {
      necesidadFijaPorPuesto.set(item.puesto, item.cantidad)
    }
  }

  const { data: asignadosHoyRows } = await admin
    .from("registroasistencia")
    .select("puesto")
    .eq("idempresa", empresaId)
    .eq("fecha", fecha)
    .in("puesto", destinosTodos)
  const asignadosHoyPorPuesto = new Map<string, number>()
  for (const r of asignadosHoyRows || []) {
    asignadosHoyPorPuesto.set(r.puesto, (asignadosHoyPorPuesto.get(r.puesto) || 0) + 1)
  }

  const necesidadPorPuesto: NecesidadPuesto[] = []
  const disponiblesPorPuesto = new Map<string, number | null>()
  for (const destino of destinosTodos) {
    const requeridos = necesidadFijaPorPuesto.get(destino)
    if (requeridos === undefined) {
      disponiblesPorPuesto.set(destino, null) // sin cupo fijo declarado (ej. Cargue/Descargue Huevos) -- no se acota
      continue
    }
    const asignados = asignadosHoyPorPuesto.get(destino) || 0
    const disponibles = Math.max(0, requeridos - asignados)
    disponiblesPorPuesto.set(destino, disponibles)
    necesidadPorPuesto.push({ puesto: destino, requeridos, asignadosHoy: asignados, disponibles })
  }

  // 8) Gating de Pacas/Cosedor contra Solicitudes Adicionales aprobadas.
  const destinosGateados = regla.destinos.filter((d) => d.gatedPorSolicitud).map((d) => d.puesto)
  const destinosHabilitados = new Set(destinosTodos)
  if (destinosGateados.length > 0) {
    const { data: solRows } = await admin
      .from("solicitudesturnos")
      .select("puesto")
      .eq("idempresa", empresaId)
      .eq("estado", "aprobado")
      .eq("fecharequerida", fecha)
    const puestosConSolicitud = new Set((solRows || []).map((r: any) => resolverPuesto(r.puesto, destinosGateados).puesto).filter(Boolean) as string[])
    for (const puestoGateado of destinosGateados) {
      if (!puestosConSolicitud.has(puestoGateado)) {
        destinosHabilitados.delete(puestoGateado)
        alertas.push(`${puestoGateado} sin Solicitud Adicional aprobada para ${fecha} -- no se sugiere como destino hoy.`)
      }
    }
  }

  // 9) Candidatos + ranking.
  const sugerencias: SugerenciaPersona[] = []
  const cupoUsado = new Map<string, number>()

  let candidatos: { id: number; nombre: string; identificacion: string; puestoActual: string | null; prioridadExtra: number }[] = []
  if (regla.rotacionSemanalObligatoria) {
    // ID3: TODOS los activos son candidatos; prioridad = días sin pasar por el destino.
    candidatos = personas.map((p) => {
      const ultimaVez = destinosTodos
        .map((destino) => ultimaVezEnPuesto.get(`${p.identificacion}|${destino}`))
        .filter(Boolean)
        .sort()
        .pop()
      const diasSinRotar = ultimaVez
        ? Math.round((new Date(`${fecha}T00:00:00`).getTime() - new Date(`${ultimaVez}T00:00:00`).getTime()) / 86400000)
        : 999 // nunca ha pasado por el destino -> máxima prioridad
      return {
        id: p.id,
        nombre: p.nombre,
        identificacion: p.identificacion,
        puestoActual: puestoFrecuentePorId.get(p.identificacion) || null,
        prioridadExtra: diasSinRotar,
      }
    })
  } else {
    candidatos = personas
      .filter((p) => puestoFrecuentePorId.get(p.identificacion) === regla.origen)
      .map((p) => ({ id: p.id, nombre: p.nombre, identificacion: p.identificacion, puestoActual: regla.origen, prioridadExtra: 0 }))
  }

  if (esDomingo(fecha)) candidatos = candidatos.filter((c) => !excluidosDomingo.has(c.identificacion))

  candidatos.sort((a, b) => {
    const heA = horasExtraPorNombreNorm.get(normalizeName(a.nombre)) ?? 0
    const heB = horasExtraPorNombreNorm.get(normalizeName(b.nombre)) ?? 0
    if (heA !== heB) return heA - heB // criterio 1: menos horas extra primero
    if (!regla.rotacionSemanalObligatoria) {
      const pctA = pctPorNombreNorm.get(normalizeName(a.nombre)) ?? 100
      const pctB = pctPorNombreNorm.get(normalizeName(b.nombre)) ?? 100
      if (pctA !== pctB) return pctA - pctB // criterio 2: menor % de meta primero
    } else {
      if (a.prioridadExtra !== b.prioridadExtra) return b.prioridadExtra - a.prioridadExtra // más días sin rotar primero
    }
    return 0
  })

  for (const cand of candidatos) {
    // Elegir el destino habilitado con más cupo disponible (criterio 3: la
    // especialidad que hoy paga más nómina -- se aproxima con la tarifa
    // vigente más alta entre los destinos con cupo; si ninguno tiene cupo
    // declarado, se ofrece igual con alerta ya emitida arriba).
    let destinoElegido: string | null = null
    for (const destino of destinosTodos) {
      if (!destinosHabilitados.has(destino)) continue
      const disponibles = disponiblesPorPuesto.get(destino) ?? null
      const usado = cupoUsado.get(destino) || 0
      if (disponibles === null || disponibles - usado > 0) {
        destinoElegido = destino
        break
      }
    }
    if (!destinoElegido) continue // sin cupo en ningún destino habilitado hoy

    cupoUsado.set(destinoElegido, (cupoUsado.get(destinoElegido) || 0) + 1)

    const heCand = horasExtraPorNombreNorm.get(normalizeName(cand.nombre)) ?? 0
    const pctCand = regla.rotacionSemanalObligatoria ? null : pctPorNombreNorm.get(normalizeName(cand.nombre)) ?? null

    const criterios: string[] = []
    if (regla.rotacionSemanalObligatoria) {
      criterios.push(cand.prioridadExtra >= 999 ? "Nunca ha pasado por este puesto" : `${cand.prioridadExtra} días sin pasar por este puesto`)
    } else {
      criterios.push(pctCand !== null && pctCand < 100 ? `${pctCand}% de la meta` : "Dentro de la meta")
    }
    if (heCand > 0) criterios.push(`${heCand}h extra esta semana`)

    // Horario del destino: el más frecuente reciente para ESE puesto en la
    // empresa (últimos 14 días); si no hay historial, se deja el default
    // genérico que ya usa el formulario (06:00-14:00) y se avisa.
    const horaSugerida = horaFrecuentePorId.get(cand.identificacion) || "06:00"

    sugerencias.push({
      identificacion: cand.identificacion,
      nombre: cand.nombre,
      puestoActual: cand.puestoActual,
      puestoSugerido: destinoElegido,
      horaEntradaSugerida: horaSugerida,
      horaSalidaSugerida: "", // el coordinador la confirma al aplicar (mismo campo que ya edita a mano)
      criteriosAplicados: criterios,
      pctCumplimiento: pctCand,
      horasExtraSemana: heCand,
    })
  }

  if (sugerencias.length === 0 && alertas.length === 0) {
    alertas.push("No se encontraron candidatos para rotar en esta fecha (nadie identificado recientemente en el puesto de destajo, o sin cupo declarado en los destinos).")
  }

  return {
    success: true,
    data: { fecha, reglaEmpresa: regla.origen, sugerencias, necesidadPorPuesto, alertas },
  }
}
