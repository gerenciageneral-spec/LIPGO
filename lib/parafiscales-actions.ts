"use server"

// Submódulo "Parafiscales" (Gestión Humana › Nómina): cuadro de control de los
// aportes de Seguridad Social y Parafiscales que la EMPRESA debe pagar cada mes
// a los entes de control (Pensión, Salud, ARL, Caja, SENA, ICBF) — la guía para
// liquidar la planilla PILA.
//
// Fuente de los datos (todo real, nada simulado):
//   · IBC  → suma de `pagonomina.total_liquidado_dia` del mes por persona. Esa
//     columna ya es salario + horas extras + recargos + dominical/festivo y NO
//     incluye auxilio de transporte → coincide con la definición legal del IBC.
//   · Días → nº de días con registro en pagonomina (piso proporcional del IBC).
//   · Auxilio de transporte → `parametros_legales_anio.auxilio_transporte`,
//     proporcional a los días y solo para quien devenga hasta 2 SMMLV.
//   · admin (clase de riesgo ARL) y salario → `headcount`.
// El cálculo vive en lib/parafiscales.ts (lógica pura); aquí solo se arman las
// entradas. Ver `parametros_parafiscales` para los % de ley por año.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import {
  calcularAportes,
  validarParametros,
  PARAFISCALES_DEFAULT,
  type Aportes,
  type ClaseRiesgo,
  type ParametrosParafiscales,
} from "@/lib/parafiscales"

export interface ParafiscalPersona extends Aportes {
  persona: string
  identificacion: string
  idempresa: number | null
  esAdmin: boolean
  dias: number
  devengado: number
}

export interface ResumenParafiscales {
  personas: number
  exonerados: number
  ibc: number
  pensionEmpleador: number
  saludEmpleador: number
  arl: number
  caja: number
  sena: number
  icbf: number
  totalEmpresa: number
  pensionEmpleado: number
  saludEmpleado: number
  totalEmpleado: number
  totalPila: number
}

const CLASES: ClaseRiesgo[] = ["I", "II", "III", "IV", "V"]
const asClase = (v: unknown, def: ClaseRiesgo): ClaseRiesgo =>
  CLASES.includes(String(v) as ClaseRiesgo) ? (String(v) as ClaseRiesgo) : def

function finDeMes(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

async function leerParametros(admin: any, anio: number): Promise<ParametrosParafiscales> {
  const { data } = await admin.from("parametros_parafiscales").select("*").eq("anio", anio).maybeSingle()
  if (!data) return { anio, ...PARAFISCALES_DEFAULT }
  const n = (v: unknown, d: number) => (v == null || v === "" ? d : Number(v))
  return {
    anio,
    pctPensionEmpleador: n(data.pct_pension_empleador, PARAFISCALES_DEFAULT.pctPensionEmpleador),
    pctPensionEmpleado: n(data.pct_pension_empleado, PARAFISCALES_DEFAULT.pctPensionEmpleado),
    pctSaludEmpleador: n(data.pct_salud_empleador, PARAFISCALES_DEFAULT.pctSaludEmpleador),
    pctSaludEmpleado: n(data.pct_salud_empleado, PARAFISCALES_DEFAULT.pctSaludEmpleado),
    pctSena: n(data.pct_sena, PARAFISCALES_DEFAULT.pctSena),
    pctIcbf: n(data.pct_icbf, PARAFISCALES_DEFAULT.pctIcbf),
    pctCaja: n(data.pct_caja, PARAFISCALES_DEFAULT.pctCaja),
    umbralExoneracionSmlv: n(data.umbral_exoneracion_smlv, PARAFISCALES_DEFAULT.umbralExoneracionSmlv),
    topeIbcSmlv: n(data.tope_ibc_smlv, PARAFISCALES_DEFAULT.topeIbcSmlv),
    claseArlAdmin: asClase(data.clase_arl_admin, PARAFISCALES_DEFAULT.claseArlAdmin),
    claseArlOperativo: asClase(data.clase_arl_operativo, PARAFISCALES_DEFAULT.claseArlOperativo),
    incluyeAuxParafiscales: data.incluye_aux_parafiscales !== false,
  }
}

export async function getParametrosParafiscales(
  anio: number,
): Promise<{ success: boolean; data: ParametrosParafiscales }> {
  try {
    const admin: any = await getSupabaseAdmin()
    return { success: true, data: await leerParametros(admin, anio) }
  } catch {
    return { success: true, data: { anio, ...PARAFISCALES_DEFAULT } }
  }
}

export async function guardarParametrosParafiscales(
  p: ParametrosParafiscales,
): Promise<{ success: boolean; message?: string }> {
  // Baranda legal del lado del servidor: un valor fuera del rango admisible no
  // se persiste aunque la UI lo mande. Los "avisos" (apartarse del valor de ley
  // vigente por una reforma) sí se permiten — los confirma el usuario en la UI.
  const errores = validarParametros(p).filter((a) => a.nivel === "error")
  if (errores.length > 0) {
    return { success: false, message: errores.map((e) => e.mensaje).join(" ") }
  }
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await admin.from("parametros_parafiscales").upsert(
      {
        anio: p.anio,
        pct_pension_empleador: p.pctPensionEmpleador,
        pct_pension_empleado: p.pctPensionEmpleado,
        pct_salud_empleador: p.pctSaludEmpleador,
        pct_salud_empleado: p.pctSaludEmpleado,
        pct_sena: p.pctSena,
        pct_icbf: p.pctIcbf,
        pct_caja: p.pctCaja,
        umbral_exoneracion_smlv: p.umbralExoneracionSmlv,
        tope_ibc_smlv: p.topeIbcSmlv,
        clase_arl_admin: p.claseArlAdmin,
        clase_arl_operativo: p.claseArlOperativo,
        incluye_aux_parafiscales: p.incluyeAuxParafiscales,
        actualizado_at: new Date().toISOString(),
      },
      { onConflict: "anio" },
    )
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar los parámetros." }
  }
}

/**
 * Cuadro de parafiscales de un mes. `idempresa = null` → consolidado LIP
 * (todos los clientes), que es el total real de la planilla PILA.
 */
export async function getParafiscales(
  idempresa: number | null,
  anio: number,
  mes: number,
): Promise<{
  success: boolean
  data: ParafiscalPersona[]
  resumen?: ResumenParafiscales
  params?: ParametrosParafiscales
  smlv?: number
  auxilio?: number
  message?: string
}> {
  try {
    const admin: any = await getSupabaseAdmin()
    const params = await leerParametros(admin, anio)

    // Parámetros legales del año (SMLV + auxilio de transporte).
    const { data: pa } = await admin
      .from("parametros_legales_anio")
      .select("smlv, auxilio_transporte")
      .eq("anio", anio)
      .maybeSingle()
    const smlv = Number(pa?.smlv || 0)
    const auxilioMes = Number(pa?.auxilio_transporte || 0)
    if (!smlv) {
      return { success: false, data: [], message: `No hay parámetros legales cargados para el año ${anio}.` }
    }

    // Personal: quien tenga contrato (nº SIIGO). Se incluyen los retirados del
    // mes — sus días trabajados también cotizan.
    let q = admin.from("headcount").select("identificacion, nombre, admin, salario, idempresa, contratosiigo")
    if (idempresa) q = q.eq("idempresa", idempresa)
    const { data: personal, error: hErr } = await q
    if (hErr) return { success: false, data: [], message: hErr.message }

    const infoPorNombre = new Map<
      string,
      { identificacion: string; esAdmin: boolean; salario: number; idempresa: number | null }
    >()
    for (const h of personal || []) {
      const nombre = String(h.nombre || "").trim()
      if (!nombre || !String(h.contratosiigo || "").trim()) continue
      infoPorNombre.set(nombre, {
        identificacion: String(h.identificacion || "").trim(),
        esAdmin: h.admin === true,
        salario: Number(h.salario) || 0,
        idempresa: h.idempresa ?? null,
      })
    }
    if (infoPorNombre.size === 0) return { success: true, data: [], params, smlv, auxilio: auxilioMes }

    // Nómina del mes (paginada — Supabase topa en 1000 filas por respuesta).
    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`
    const hasta = finDeMes(anio, mes)
    const nombres = Array.from(infoPorNombre.keys())
    let filas: any[] = []
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin
        .from("pagonomina")
        .select("persona, fecha, total_liquidado_dia")
        .in("persona", nombres)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(offset, offset + pageSize - 1)
      if (error) return { success: false, data: [], message: error.message }
      if (!data || data.length === 0) break
      filas = filas.concat(data)
      if (data.length < pageSize) break
    }

    // Agregar por persona: devengado del mes + días con registro.
    const acum = new Map<string, { dev: number; dias: number }>()
    for (const r of filas) {
      const nombre = String(r.persona || "").trim()
      if (!infoPorNombre.has(nombre)) continue
      const a = acum.get(nombre) || { dev: 0, dias: 0 }
      a.dev += Number(r.total_liquidado_dia || 0)
      a.dias += 1
      acum.set(nombre, a)
    }

    const data: ParafiscalPersona[] = []
    for (const [nombre, a] of acum) {
      if (a.dias === 0) continue
      const info = infoPorNombre.get(nombre)!
      // Auxilio de transporte: solo para quien devenga hasta 2 SMMLV, y
      // proporcional a los días laborados del mes.
      const salarioRef = info.salario || smlv
      const auxilio = salarioRef <= smlv * 2 ? (auxilioMes / 30) * Math.min(a.dias, 30) : 0
      const ap = calcularAportes(
        { devengado: a.dev, auxilio, dias: a.dias, smlv, esAdmin: info.esAdmin },
        params,
      )
      data.push({
        ...ap,
        persona: nombre,
        identificacion: info.identificacion,
        idempresa: info.idempresa,
        esAdmin: info.esAdmin,
        dias: a.dias,
        devengado: a.dev,
      })
    }

    data.sort((x, y) => y.totalEmpresa - x.totalEmpresa)

    const resumen = data.reduce<ResumenParafiscales>(
      (acc, p) => {
        acc.personas += 1
        if (p.exonerado) acc.exonerados += 1
        acc.ibc += p.ibc
        acc.pensionEmpleador += p.pensionEmpleador
        acc.saludEmpleador += p.saludEmpleador
        acc.arl += p.arl
        acc.caja += p.caja
        acc.sena += p.sena
        acc.icbf += p.icbf
        acc.totalEmpresa += p.totalEmpresa
        acc.pensionEmpleado += p.pensionEmpleado
        acc.saludEmpleado += p.saludEmpleado
        acc.totalEmpleado += p.totalEmpleado
        acc.totalPila += p.totalPila
        return acc
      },
      {
        personas: 0,
        exonerados: 0,
        ibc: 0,
        pensionEmpleador: 0,
        saludEmpleador: 0,
        arl: 0,
        caja: 0,
        sena: 0,
        icbf: 0,
        totalEmpresa: 0,
        pensionEmpleado: 0,
        saludEmpleado: 0,
        totalEmpleado: 0,
        totalPila: 0,
      },
    )

    return { success: true, data, resumen, params, smlv, auxilio: auxilioMes }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al calcular los parafiscales." }
  }
}
