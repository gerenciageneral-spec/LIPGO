"use server"

/**
 * Server actions de "Ajuste de Proyecciones" (Compensación › Revisión de nómina).
 *
 * La nómina se paga ANTES de que cierre el último día de la quincena, así que
 * ese día el tonelaje se PROYECTA (`cabeceraoc.tipooperacion = 'proyeccion'`).
 * La proyección NO reemplaza a las órdenes reales: se SUMA a ellas — el día
 * sigue y siguen llegando órdenes. Al cerrar, lo real casi nunca coincide con
 * lo pagado.
 *
 * Este módulo cruza, el día siguiente al pago (el 16 y el 1º):
 *     ton_real   (SOLO órdenes reales, con tiquete de báscula)
 *   − ton_pagada (lo que pagonomina liquidó ese día: proyección + real)
 *   = diferencia -> se paga o se descuenta en la quincena SIGUIENTE.
 *
 * El reparto por persona replica EXACTAMENTE el de `pagonomina`
 * (peso_base_calculo ÷ cantidad_auxiliares), para que la comparación sea 1:1.
 *
 * Los ajustes nacen 'pendiente'; solo al aprobarse salen al archivo plano.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUsuarioForInsert } from "@/lib/user-context"
import {
  NOVEDAD_AJUSTE_INGRESO,
  NOVEDAD_AJUSTE_DEDUCCION,
  rangoQuincena,
  quincenaSiguiente,
  type EstadoAjuste,
} from "@/lib/ajuste-proyeccion-constants"

const num = (v: any) => Number(v || 0)
/** Diferencias por debajo de esto son ruido de redondeo, no ajuste real. */
const TOLERANCIA_TON = 0.01

/** Réplica de `peso_base_calculo` de pagonomina_reemplazo.sql. */
function pesoBaseCalculo(idempresa: number, tipooperacion: string, pesovascula: number, pesoorden: number): number {
  const cedis = idempresa === 3 || idempresa === 4
  if (cedis && tipooperacion === "Descargue") {
    if (pesovascula <= 0) return pesoorden
    const norm = pesoorden > 0 && pesovascula / pesoorden > 50 ? pesovascula / 1000 : pesovascula
    if (pesoorden > 0) {
      const r = norm / pesoorden
      if (r < 0.1 || r > 10) return pesoorden
    }
    return norm
  }
  if (cedis) return pesoorden
  return pesovascula
}

export interface AjusteLinea {
  id?: number
  idempresa: number
  fechaProyectada: string
  persona: string
  identificacion: string | null
  tonPagada: number
  tonReal: number
  diferenciaTon: number
  valorPagado: number
  valorReal: number
  valorAjuste: number
  novedadSiigo: string
  estado?: EstadoAjuste
  aprobadoPor?: string | null
  observacion?: string | null
}

export interface CruceProyeccionData {
  quincena: { anio: number; mes: number; num: number; desde: string; hasta: string }
  aplicaEn: { anio: number; mes: number; quincena: number }
  /** Días de la quincena que tuvieron órdenes de proyección. */
  diasProyectados: string[]
  resumen: {
    personas: number
    tonPagada: number
    tonReal: number
    diferenciaTon: number
    valorAFavorTrabajador: number
    valorAFavorEmpresa: number
    neto: number
    yaRegistrados: number
  }
  lineas: AjusteLinea[]
  /** Sin días de proyección en la quincena: no hay nada que ajustar. */
  sinProyeccion: boolean
}

async function paginar(sb: any, tabla: string, cols: string, filtros: (q: any) => any): Promise<any[]> {
  const out: any[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await filtros(sb.from(tabla).select(cols).range(off, off + 999))
    if (error) throw new Error(`${tabla}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/**
 * Calcula el cruce de la quincena. NO escribe nada: es la vista previa que se
 * revisa antes de generar los ajustes.
 */
export async function getCruceProyeccion(
  anio: number,
  mes: number,
  quincena: 1 | 2,
  empresa: number, // 0 = todas
): Promise<{ success: boolean; data?: CruceProyeccionData; message?: string }> {
  try {
    const sb: any = await getSupabaseAdmin()
    const { desde, hasta } = rangoQuincena(anio, mes, quincena)
    const emps = [1, 2, 3, 4, 6].includes(empresa) ? [empresa] : null

    // 1) Órdenes de la quincena. Mismo universo que pagonomina (fincargue).
    const ordenes = await paginar(
      sb,
      "cabeceraoc",
      "id, idempresa, ordendecargue, fechacargue, tipooperacion, pesovascula, pesoorden, auxiliares",
      (q: any) => {
        let x = q.gte("fechacargue", desde).lte("fechacargue", hasta).not("fincargue", "is", null)
        if (emps) x = x.in("idempresa", emps)
        return x
      },
    )

    // 2) Días con proyección: no se asume "el 15 / el último"; se detectan.
    //    En los datos reales hay proyecciones el 13, 14, 15, 30 y 31.
    const diasProyectados = Array.from(
      new Set(
        ordenes
          .filter((o) => String(o.tipooperacion || "").trim() === "proyeccion")
          .map((o) => String(o.fechacargue).slice(0, 10)),
      ),
    ).sort()

    const aplicaEn = quincenaSiguiente(anio, mes, quincena)
    if (diasProyectados.length === 0) {
      return {
        success: true,
        data: {
          quincena: { anio, mes, num: quincena, desde, hasta },
          aplicaEn,
          diasProyectados: [],
          resumen: {
            personas: 0,
            tonPagada: 0,
            tonReal: 0,
            diferenciaTon: 0,
            valorAFavorTrabajador: 0,
            valorAFavorEmpresa: 0,
            neto: 0,
            yaRegistrados: 0,
          },
          lineas: [],
          sinProyeccion: true,
        },
      }
    }

    // 3) Tarifas de destajo vigentes (mismo join que pagonomina).
    const tarifas = await paginar(sb, "tarifaspersonal", "empresaid, operacion, tarifa, fechaini, fechafin", (q: any) => q)
    const tarifaDe = (empresaId: number, operacion: string, fecha: string): number => {
      for (const t of tarifas) {
        if (Number(t.empresaid) !== empresaId) continue
        if (String(t.operacion) !== operacion) continue
        if (String(t.fechaini).slice(0, 10) <= fecha && fecha <= String(t.fechafin).slice(0, 10)) return num(t.tarifa)
      }
      return 0
    }

    // 4) REAL por (fecha, persona): solo órdenes que NO son proyección.
    //    Reparto idéntico al de pagonomina: peso ÷ cantidad de auxiliares.
    const realTon = new Map<string, number>()
    const realVal = new Map<string, number>()
    const empresaDe = new Map<string, number>()
    for (const o of ordenes) {
      const tipo = String(o.tipooperacion || "").trim()
      if (tipo === "proyeccion") continue
      const fecha = String(o.fechacargue).slice(0, 10)
      if (!diasProyectados.includes(fecha)) continue
      const aux = String(o.auxiliares || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      if (aux.length === 0) continue
      const emp = Number(o.idempresa)
      const peso = pesoBaseCalculo(emp, tipo, num(o.pesovascula), num(o.pesoorden))
      if (peso <= 0) continue
      const porPersona = peso / aux.length
      const tarifa = tarifaDe(emp, tipo, fecha)
      for (const p of aux) {
        const k = `${fecha}|${p.toUpperCase()}`
        realTon.set(k, (realTon.get(k) || 0) + porPersona)
        realVal.set(k, (realVal.get(k) || 0) + porPersona * tarifa)
        if (!empresaDe.has(k)) empresaDe.set(k, emp)
      }
    }

    // 5) PAGADO: lo que pagonomina liquidó esos días (proyección + real).
    const filasPn = await paginar(
      sb,
      "pagonomina",
      "fecha, persona, idempresa, idempresaliquidacion, toneladas, pago_produccion",
      (q: any) => {
        let x = q.gte("fecha", desde).lte("fecha", hasta).gt("toneladas", 0)
        if (emps) x = x.in("idempresa", emps)
        return x
      },
    )
    const pagTon = new Map<string, number>()
    const pagVal = new Map<string, number>()
    for (const r of filasPn) {
      const fecha = String(r.fecha).slice(0, 10)
      if (!diasProyectados.includes(fecha)) continue
      const k = `${fecha}|${String(r.persona || "").trim().toUpperCase()}`
      pagTon.set(k, (pagTon.get(k) || 0) + num(r.toneladas))
      pagVal.set(k, (pagVal.get(k) || 0) + num(r.pago_produccion))
      if (!empresaDe.has(k)) empresaDe.set(k, Number(r.idempresaliquidacion ?? r.idempresa) || 0)
    }

    // 6) Cédulas (el archivo plano paga por identificación).
    const hc = await paginar(sb, "headcount", "nombre, identificacion", (q: any) => q)
    const cedulaDe = new Map<string, string>()
    for (const h of hc) {
      const k = String(h.nombre || "").trim().toUpperCase()
      const c = String(h.identificacion || "").trim()
      if (k && c && !cedulaDe.has(k)) cedulaDe.set(k, c)
    }

    // 7) Nombre "bonito" tal como viene de pagonomina/cabeceraoc.
    const nombreReal = new Map<string, string>()
    for (const r of filasPn) {
      const p = String(r.persona || "").trim()
      if (p) nombreReal.set(p.toUpperCase(), p)
    }
    for (const o of ordenes) {
      for (const p of String(o.auxiliares || "").split(",")) {
        const t = p.trim()
        if (t && !nombreReal.has(t.toUpperCase())) nombreReal.set(t.toUpperCase(), t)
      }
    }

    // 8) Armar las líneas.
    const claves = new Set([...pagTon.keys(), ...realTon.keys()])
    const lineas: AjusteLinea[] = []
    for (const k of claves) {
      const [fecha, personaUpper] = k.split("|")
      const persona = nombreReal.get(personaUpper) || personaUpper
      if (/prueba/i.test(persona)) continue // pagonomina nunca les paga
      const tonPagada = pagTon.get(k) || 0
      const tonReal = realTon.get(k) || 0
      const diferenciaTon = tonReal - tonPagada
      if (Math.abs(diferenciaTon) <= TOLERANCIA_TON) continue
      const valorPagado = pagVal.get(k) || 0
      const valorReal = realVal.get(k) || 0
      lineas.push({
        idempresa: empresaDe.get(k) || 0,
        fechaProyectada: fecha,
        persona,
        identificacion: cedulaDe.get(personaUpper) || null,
        tonPagada,
        tonReal,
        diferenciaTon,
        valorPagado,
        valorReal,
        valorAjuste: valorReal - valorPagado,
        novedadSiigo: valorReal - valorPagado >= 0 ? NOVEDAD_AJUSTE_INGRESO : NOVEDAD_AJUSTE_DEDUCCION,
      })
    }
    lineas.sort((a, b) => Math.abs(b.valorAjuste) - Math.abs(a.valorAjuste))

    // 9) ¿Cuántos ya están registrados? (para no re-generar a ciegas)
    const { data: yaReg } = await sb
      .from("ajustes_proyeccion")
      .select("id", { count: "exact" })
      .in("fecha_proyectada", diasProyectados)

    const aFavorTrab = lineas.filter((l) => l.valorAjuste > 0).reduce((a, l) => a + l.valorAjuste, 0)
    const aFavorEmp = lineas.filter((l) => l.valorAjuste < 0).reduce((a, l) => a + l.valorAjuste, 0)

    return {
      success: true,
      data: {
        quincena: { anio, mes, num: quincena, desde, hasta },
        aplicaEn,
        diasProyectados,
        resumen: {
          personas: new Set(lineas.map((l) => l.persona)).size,
          tonPagada: lineas.reduce((a, l) => a + l.tonPagada, 0),
          tonReal: lineas.reduce((a, l) => a + l.tonReal, 0),
          diferenciaTon: lineas.reduce((a, l) => a + l.diferenciaTon, 0),
          valorAFavorTrabajador: aFavorTrab,
          valorAFavorEmpresa: aFavorEmp,
          neto: aFavorTrab + aFavorEmp,
          yaRegistrados: (yaReg || []).length,
        },
        lineas,
        sinProyeccion: false,
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al calcular el cruce de proyección." }
  }
}

/** Persiste el cruce como ajustes PENDIENTES (upsert: re-correr no duplica). */
export async function generarAjustes(
  anio: number,
  mes: number,
  quincena: 1 | 2,
  empresa: number,
): Promise<{ success: boolean; creados?: number; message?: string }> {
  try {
    const cruce = await getCruceProyeccion(anio, mes, quincena, empresa)
    if (!cruce.success || !cruce.data) return { success: false, message: cruce.message }
    if (cruce.data.lineas.length === 0) return { success: false, message: "No hay diferencias que ajustar." }

    const sb: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert()
    const ap = cruce.data.aplicaEn

    const filas = cruce.data.lineas.map((l) => ({
      idempresa: l.idempresa,
      fecha_proyectada: l.fechaProyectada,
      anio,
      mes,
      quincena,
      persona: l.persona,
      identificacion: l.identificacion,
      ton_pagada: l.tonPagada,
      ton_real: l.tonReal,
      diferencia_ton: l.diferenciaTon,
      valor_pagado: l.valorPagado,
      valor_real: l.valorReal,
      valor_ajuste: l.valorAjuste,
      novedad_siigo: l.novedadSiigo,
      anio_aplica: ap.anio,
      mes_aplica: ap.mes,
      quincena_aplica: ap.quincena,
      estado: "pendiente",
      creado_por: usuario,
    }))

    // Upsert por (idempresa, fecha_proyectada, persona): si el cruce se vuelve
    // a correr porque llegaron más órdenes, se ACTUALIZA el ajuste en vez de
    // crear uno nuevo — si no, se pagaría dos veces la misma diferencia.
    const { error } = await sb
      .from("ajustes_proyeccion")
      .upsert(filas, { onConflict: "idempresa,fecha_proyectada,persona" })
    if (error) return { success: false, message: error.message }
    return { success: true, creados: filas.length }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al generar los ajustes." }
  }
}

export interface AjusteRow extends AjusteLinea {
  id: number
  anio: number
  mes: number
  quincena: number
  anioAplica: number
  mesAplica: number
  quincenaAplica: number
  estado: EstadoAjuste
  creadoPor: string | null
  creado: string | null
  aprobadoPor: string | null
  aprobadoEn: string | null
}

export async function getAjustes(filtros: {
  anio?: number
  mes?: number
  quincena?: 1 | 2
  estado?: EstadoAjuste | "todos"
}): Promise<{ success: boolean; data: AjusteRow[]; message?: string }> {
  try {
    const sb: any = await getSupabaseAdmin()
    const rows = await paginar(sb, "ajustes_proyeccion", "*", (q: any) => {
      let x = q.order("fecha_proyectada", { ascending: false })
      if (filtros.anio) x = x.eq("anio", filtros.anio)
      if (filtros.mes) x = x.eq("mes", filtros.mes)
      if (filtros.quincena) x = x.eq("quincena", filtros.quincena)
      if (filtros.estado && filtros.estado !== "todos") x = x.eq("estado", filtros.estado)
      return x
    })
    return {
      success: true,
      data: rows.map((r: any) => ({
        id: Number(r.id),
        idempresa: Number(r.idempresa),
        fechaProyectada: String(r.fecha_proyectada).slice(0, 10),
        anio: Number(r.anio),
        mes: Number(r.mes),
        quincena: Number(r.quincena),
        persona: String(r.persona || ""),
        identificacion: r.identificacion || null,
        tonPagada: num(r.ton_pagada),
        tonReal: num(r.ton_real),
        diferenciaTon: num(r.diferencia_ton),
        valorPagado: num(r.valor_pagado),
        valorReal: num(r.valor_real),
        valorAjuste: num(r.valor_ajuste),
        novedadSiigo: String(r.novedad_siigo || ""),
        anioAplica: Number(r.anio_aplica),
        mesAplica: Number(r.mes_aplica),
        quincenaAplica: Number(r.quincena_aplica),
        estado: String(r.estado || "pendiente") as EstadoAjuste,
        creadoPor: r.creado_por || null,
        creado: r.creado || null,
        aprobadoPor: r.aprobado_por || null,
        aprobadoEn: r.aprobado_en || null,
        observacion: r.observacion || null,
      })),
    }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al listar los ajustes." }
  }
}

/** Aprueba ajustes: desde aquí SÍ salen al archivo plano. */
export async function aprobarAjustes(ids: number[]): Promise<{ success: boolean; message?: string }> {
  try {
    if (!ids?.length) return { success: false, message: "Selecciona al menos un ajuste." }
    const sb: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert()
    const { error } = await sb
      .from("ajustes_proyeccion")
      .update({ estado: "aprobado", aprobado_por: usuario, aprobado_en: new Date().toISOString() })
      .in("id", ids)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al aprobar." }
  }
}

export async function rechazarAjustes(ids: number[], motivo: string): Promise<{ success: boolean; message?: string }> {
  try {
    if (!ids?.length) return { success: false, message: "Selecciona al menos un ajuste." }
    const sb: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert()
    const { error } = await sb
      .from("ajustes_proyeccion")
      .update({
        estado: "rechazado",
        aprobado_por: usuario,
        aprobado_en: new Date().toISOString(),
        observacion: String(motivo || "").trim() || null,
      })
      .in("id", ids)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al rechazar." }
  }
}
