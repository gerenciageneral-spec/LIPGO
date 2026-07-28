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
        "fecha, idempresa, actividad_registrada, novedad_reportada, especialidad, toneladas, pago_produccion, base_dia, bonif_prestacional, hed, hedf, hen, hef, hn, pago_domingo, recargodominical, total_liquidado_dia",
      )
      .eq("persona", persona)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
    if (errPn) return { success: false, message: errPn.message }

    const dias: DiaRevision[] = []
    let baseGar = 0,
      ingTurno = 0,
      recDom = 0,
      neto = 0,
      diasDestajo = 0,
      diasAltos = 0,
      diasBajos = 0,
      anomalias = 0,
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
      })
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
        plano,
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar la revisión de nómina." }
  }
}
