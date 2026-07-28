"use server"

// Revisión de nómina (Gestión Humana › Nómina): arma, para un colaborador y una
// quincena, el CUADRO DEFINITIVO del nuevo modelo de liquidación:
//   A) Liquidación diaria — cada día trabajado paga su BASE; el turno suma recargos.
//   B) Resumen de quincena — base garantizada + ingreso por turno + bono neto de
//      destajo (excedente de toneladas neteado por quincena, todo prestacional).
//   C) Archivo plano → Siigo — las novedades tal como salen (bono + horas extra + días).
// Es un LECTOR de las vistas `pagonomina` y `archivoplano` (fuente de verdad). No
// escribe nada. Mismo patrón que parafiscales-actions / liquidaciones-actions.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMetasToneladas } from "@/lib/metas-toneladas-actions"

export interface ColaboradorRef {
  persona: string
  identificacion: string
  empresa: number | null
  estado: string
}

export interface DiaRevision {
  fecha: string
  dow: string
  tipo: string
  actividad: string
  novedad: string
  toneladas: number
  pagoProduccion: number
  base: number
  recargos: number
  domingo: number
  excedente: number // destajo con signo (prod - base); 0 si no es destajo
  total: number
  esDestajo: boolean
  anomalia: boolean // Cargue/Descargue con 0 toneladas (a corregir)
  meta: number // meta de toneladas del proyecto ese día (0 si no configurada)
  cumpleMeta: boolean // solo destajo: toneladas >= meta
  hcDia: number // HC real: trabajadores que movieron toneladas ese día en el proyecto
}

export interface MetaResumen {
  configurada: boolean
  metaReferencia: number // meta ton/trab/día del proyecto principal del colaborador
  diasDestajo: number
  diasCumple: number
  diasBajo: number
  toneladasMovidas: number
  toneladasMeta: number // meta acumulada del período (Σ meta de los días de destajo)
  promedioDia: number
  pctCumplimiento: number // días que cumplió la meta / días de destajo
  hcConfigurado: number // head count planeado del proyecto (tab Metas)
  hcPromedioReal: number // head count real promedio (trabajadores que asistieron a destajo)
}

export interface ResumenRevision {
  baseGarantizada: number
  ingresoTurno: number
  recargoDominical: number
  netoDestajo: number
  bono: number
  perdida: number
  total: number
  diasDestajo: number
  diasAltos: number
  diasBajos: number
  anomalias: number
}

export interface PlanoRevision {
  nombrenovedad: string
  tiponovedad: string
  cantidadvalor: number
  nominaproyectada: number
  fechainicio: string | null
}

export interface RevisionNominaData {
  colaborador: {
    persona: string
    identificacion: string
    salario: number
    baseDia: number
    empresa: number | null
    contratosiigo: string
  }
  quincena: { anio: number; mes: number; num: number; desde: string; hasta: string }
  dias: DiaRevision[]
  resumen: ResumenRevision
  metaResumen: MetaResumen
  plano: PlanoRevision[]
}

const DOW = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"]
const num = (v: any) => Number(v || 0)
const fin = (anio: number, mes: number) => new Date(anio, mes, 0).getDate()

/** Colaboradores para el selector (Head Count, activos primero). */
export async function getColaboradores(): Promise<{ success: boolean; data: ColaboradorRef[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { data, error } = await admin
      .from("headcount")
      .select("nombre, identificacion, idempresa, estado")
      .order("estado", { ascending: true })
      .order("nombre", { ascending: true })
    if (error) return { success: false, data: [], message: error.message }
    const vistos = new Set<string>()
    const out: ColaboradorRef[] = []
    for (const r of data || []) {
      const persona = String(r.nombre || "").trim()
      if (!persona || /prueba/i.test(persona)) continue
      if (vistos.has(persona)) continue
      vistos.add(persona)
      out.push({
        persona,
        identificacion: String(r.identificacion || "").trim(),
        empresa: r.idempresa != null ? Number(r.idempresa) : null,
        estado: String(r.estado || "").trim() || "—",
      })
    }
    return { success: true, data: out }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al leer colaboradores." }
  }
}

/** Cuadro completo (A/B/C) de un colaborador para una quincena. */
export async function getRevisionNomina(
  persona: string,
  anio: number,
  mes: number,
  quincena: 1 | 2,
): Promise<{ success: boolean; data?: RevisionNominaData; message?: string }> {
  try {
    if (!persona) return { success: false, message: "Selecciona un colaborador." }
    const admin: any = await getSupabaseAdmin()

    const diaIni = quincena === 1 ? 1 : 16
    const diaFin = quincena === 1 ? 15 : fin(anio, mes)
    const desde = `${anio}-${String(mes).padStart(2, "0")}-${String(diaIni).padStart(2, "0")}`
    const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(diaFin).padStart(2, "0")}`

    // Ficha del colaborador (Head Count)
    const { data: hc } = await admin
      .from("headcount")
      .select("nombre, identificacion, salario, idempresa, contratosiigo")
      .eq("nombre", persona)
      .limit(1)
      .maybeSingle()
    const identificacion = String(hc?.identificacion || "").trim()
    const salario = num(hc?.salario)
    const baseDia = salario > 0 ? salario / 30 : 58364

    // A) Días de la quincena (pagonomina — modelo nuevo ya liquida base por día)
    const { data: filas, error: errPn } = await admin
      .from("pagonomina")
      .select(
        "fecha, idempresa, idempresaliquidacion, actividad_registrada, novedad_reportada, especialidad, toneladas, pago_produccion, base_dia, bonif_prestacional, hed, hedf, hen, hef, hn, pago_domingo, recargodominical, total_liquidado_dia",
      )
      .eq("persona", persona)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
    if (errPn) return { success: false, message: errPn.message }

    // Metas de toneladas por proyecto (idempresa) — indicador de productividad.
    const metasRes = await getMetasToneladas()
    const metaObjPorEmpresa = new Map<number, { meta: number; hc: number }>()
    for (const m of metasRes.data || [])
      metaObjPorEmpresa.set(m.idempresa, { meta: m.metaTonTrabajadorDia, hc: m.hc })

    // HC REAL por día: trabajadores que movieron toneladas ese día en el proyecto
    // (asistencia ya ratificada en pagonomina). El HC varía a diario según el volumen.
    const proyectos = new Set<number>()
    for (const r of filas || []) {
      const esp = r.especialidad === true || String(r.especialidad) === "true"
      if (num(r.toneladas) > 0 && !esp && r.idempresaliquidacion != null) proyectos.add(Number(r.idempresaliquidacion))
    }
    const hcPorFechaEmp = new Map<string, Set<string>>()
    if (proyectos.size > 0) {
      const { data: hcRows } = await admin
        .from("pagonomina")
        .select("fecha, persona, idempresaliquidacion, especialidad")
        .in("idempresaliquidacion", Array.from(proyectos))
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .gt("toneladas", 0)
      for (const r of hcRows || []) {
        if (r.especialidad === true || String(r.especialidad) === "true") continue
        const key = String(r.fecha).slice(0, 10) + "|" + Number(r.idempresaliquidacion)
        if (!hcPorFechaEmp.has(key)) hcPorFechaEmp.set(key, new Set())
        hcPorFechaEmp.get(key)!.add(String(r.persona || "").trim())
      }
    }
    const hcReal = (fecha: string, emp: number) => hcPorFechaEmp.get(fecha + "|" + emp)?.size || 0

    const dias: DiaRevision[] = []
    let baseGar = 0,
      ingTurno = 0,
      recDom = 0,
      neto = 0,
      diasDestajo = 0,
      diasAltos = 0,
      diasBajos = 0,
      anomalias = 0,
      diasCumpleMeta = 0,
      toneladasMovidas = 0,
      toneladasMeta = 0,
      empresa: number | null = hc?.idempresa != null ? Number(hc.idempresa) : null

    for (const r of filas || []) {
      const d = new Date(String(r.fecha).slice(0, 10) + "T12:00:00Z")
      const ton = num(r.toneladas)
      const prod = num(r.pago_produccion)
      const base = num(r.base_dia)
      const esp = r.especialidad === true || String(r.especialidad) === "true"
      const nov = String(r.novedad_reportada || "").trim()
      const act = String(r.actividad_registrada || "").trim()
      const recargos = num(r.hed) + num(r.hedf) + num(r.hen) + num(r.hef) + num(r.hn)
      const domingo = num(r.pago_domingo) + num(r.recargodominical)
      const total = num(r.total_liquidado_dia)
      const esDestajo = ton > 0 && !esp
      const esFestivo = /festivo/i.test(act)
      const anomalia = /cargue|descargue/i.test(act) && ton === 0 && !esp && base > 0 && nov === "" && !esFestivo
      const excedente = esDestajo ? prod - base : 0

      let tipo: string
      if (esDestajo) tipo = "Destajo"
      else if (esp) tipo = "Turno"
      else if (esFestivo) tipo = "Festivo"
      else if (nov) tipo = "Novedad"
      else if (total > 0) tipo = "Descanso"
      else tipo = "Sin registro"

      // Proyecto del día (idempresaliquidacion = donde se movió el tonelaje).
      const empDia =
        r.idempresaliquidacion != null ? Number(r.idempresaliquidacion) : r.idempresa != null ? Number(r.idempresa) : 0
      // Meta de toneladas del proyecto de ese día (indicador de productividad).
      const metaDia = empDia ? metaObjPorEmpresa.get(empDia)?.meta || 0 : 0
      const cumpleMeta = esDestajo && metaDia > 0 ? ton >= metaDia : false
      const hcDia = esDestajo ? hcReal(String(r.fecha).slice(0, 10), empDia) : 0

      // Descomposición del total del día: base = total − recargos − dominical
      const basePortion = Math.max(0, total - recargos - domingo)
      if (total > 0) baseGar += basePortion
      ingTurno += recargos
      recDom += domingo
      if (esDestajo) {
        neto += excedente
        diasDestajo += 1
        if (excedente >= 0) diasAltos += 1
        else diasBajos += 1
        toneladasMovidas += ton
        if (metaDia > 0) {
          toneladasMeta += metaDia
          if (cumpleMeta) diasCumpleMeta += 1
        }
      }
      if (anomalia) anomalias += 1
      if (empresa == null && r.idempresa != null) empresa = Number(r.idempresa)

      dias.push({
        fecha: String(r.fecha).slice(0, 10),
        dow: DOW[d.getUTCDay()],
        tipo,
        actividad: act,
        novedad: nov,
        toneladas: ton,
        pagoProduccion: prod,
        base: basePortion,
        recargos,
        domingo,
        excedente,
        total,
        esDestajo,
        anomalia,
        meta: metaDia,
        cumpleMeta,
        hcDia,
      })
    }

    // Resumen de cumplimiento de META (productividad). La meta de referencia es la
    // del proyecto principal del colaborador (su empresa); días con meta configurada.
    const metaReferencia = empresa != null ? metaObjPorEmpresa.get(empresa)?.meta || 0 : 0
    const hcConfigurado = empresa != null ? metaObjPorEmpresa.get(empresa)?.hc || 0 : 0
    const diasConMeta = dias.filter((x) => x.esDestajo && x.meta > 0).length
    const diasDestajoArr = dias.filter((x) => x.esDestajo && x.hcDia > 0)
    const hcPromedioReal =
      diasDestajoArr.length > 0 ? diasDestajoArr.reduce((a, x) => a + x.hcDia, 0) / diasDestajoArr.length : 0
    const metaResumen: MetaResumen = {
      configurada: metaReferencia > 0 || diasConMeta > 0,
      metaReferencia,
      diasDestajo,
      diasCumple: diasCumpleMeta,
      diasBajo: Math.max(0, diasConMeta - diasCumpleMeta),
      toneladasMovidas,
      toneladasMeta,
      promedioDia: diasDestajo > 0 ? toneladasMovidas / diasDestajo : 0,
      pctCumplimiento: diasConMeta > 0 ? (diasCumpleMeta / diasConMeta) * 100 : 0,
      hcConfigurado,
      hcPromedioReal,
    }

    const bono = Math.max(0, neto)
    const perdida = Math.max(0, -neto)
    const resumen: ResumenRevision = {
      baseGarantizada: baseGar,
      ingresoTurno: ingTurno,
      recargoDominical: recDom,
      netoDestajo: neto,
      bono,
      perdida,
      total: baseGar + ingTurno + recDom + bono,
      diasDestajo,
      diasAltos,
      diasBajos,
      anomalias,
    }

    // C) Archivo plano (novedades a Siigo) para ese id + mes + quincena
    let plano: PlanoRevision[] = []
    if (identificacion) {
      const { data: pl } = await admin
        .from("archivoplano")
        .select("nombrenovedad, tiponovedad, cantidadvalor, nominaproyectada, fechainicio, quincena, mes")
        .eq("identificacionempleado", identificacion)
        .eq("mes", String(mes).padStart(2, "0"))
        .eq("quincena", quincena)
      plano = (pl || []).map((p: any) => ({
        nombrenovedad: String(p.nombrenovedad || ""),
        tiponovedad: String(p.tiponovedad || ""),
        cantidadvalor: num(p.cantidadvalor),
        nominaproyectada: num(p.nominaproyectada),
        fechainicio: p.fechainicio || null,
      }))
    }

    return {
      success: true,
      data: {
        colaborador: {
          persona,
          identificacion,
          salario,
          baseDia,
          empresa,
          contratosiigo: String(hc?.contratosiigo || "").trim(),
        },
        quincena: { anio, mes, num: quincena, desde, hasta },
        dias,
        resumen,
        metaResumen,
        plano,
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar la revisión de nómina." }
  }
}

// ---------------------------------------------------------------------------
// HC POR DÍA POR PROYECTO (ID) — base real de trabajadores con la que se opera
// cada día. Cuenta los trabajadores DISTINTOS que movieron toneladas (destajo)
// por fecha + proyecto (asistencia ya ratificada en pagonomina), y lo cruza con
// el HC planeado y la meta configurados. El HC varía a diario según el volumen.
// ---------------------------------------------------------------------------

export interface HcDiaProyecto {
  fecha: string
  dow: string
  idempresa: number
  proyecto: string
  hcReal: number
  toneladas: number
  hcConfig: number
  meta: number
  tonPorTrabajador: number // toneladas ÷ hcReal (promedio real por trabajador ese día)
}

export async function getHcPorDia(
  anio: number,
  mes: number,
): Promise<{ success: boolean; data: HcDiaProyecto[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`
    const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(fin(anio, mes)).padStart(2, "0")}`

    // Metas por proyecto (nombre + HC planeado + meta)
    const metasRes = await getMetasToneladas()
    const metaObj = new Map<number, { proyecto: string; hc: number; meta: number }>()
    for (const m of metasRes.data || [])
      metaObj.set(m.idempresa, { proyecto: m.proyecto, hc: m.hc, meta: m.metaTonTrabajadorDia })

    // pagonomina del mes con toneladas (destajo). Paginado.
    const rows: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("pagonomina")
        .select("fecha, persona, idempresaliquidacion, especialidad, toneladas")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .gt("toneladas", 0)
        .range(off, off + 999)
      if (error) return { success: false, data: [], message: error.message }
      if (!data || data.length === 0) break
      rows.push(...data)
      if (data.length < 1000) break
    }

    // Agrupar por fecha + proyecto: HC (distintos) + toneladas
    const grupo = new Map<string, { personas: Set<string>; ton: number; fecha: string; emp: number }>()
    for (const r of rows) {
      if (r.especialidad === true || String(r.especialidad) === "true") continue
      const emp = r.idempresaliquidacion != null ? Number(r.idempresaliquidacion) : 0
      const fecha = String(r.fecha).slice(0, 10)
      const key = fecha + "|" + emp
      if (!grupo.has(key)) grupo.set(key, { personas: new Set(), ton: 0, fecha, emp })
      const g = grupo.get(key)!
      g.personas.add(String(r.persona || "").trim())
      g.ton += num(r.toneladas)
    }

    const data: HcDiaProyecto[] = []
    for (const g of grupo.values()) {
      const cfg = metaObj.get(g.emp)
      const hcReal = g.personas.size
      const d = new Date(g.fecha + "T12:00:00Z")
      data.push({
        fecha: g.fecha,
        dow: DOW[d.getUTCDay()],
        idempresa: g.emp,
        proyecto: cfg?.proyecto || `Proyecto ${g.emp}`,
        hcReal,
        toneladas: g.ton,
        hcConfig: cfg?.hc || 0,
        meta: cfg?.meta || 0,
        tonPorTrabajador: hcReal > 0 ? g.ton / hcReal : 0,
      })
    }
    data.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.idempresa - b.idempresa))
    return { success: true, data }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al calcular el HC por día." }
  }
}
