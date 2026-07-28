"use server"

// Submódulo Liquidaciones: personas RETIRADAS (headcount.estado Inactivo) CON
// contrato (número SIIGO), separado por CLIENTE (headcount.idempresa). Muestra:
//   - Nómina PENDIENTE de pago (desde pagonomina, posterior a "pagado_hasta" y
//     hasta la fecha de retiro).
//   - PRESTACIONES SOCIALES (prima, cesantías, intereses, vacaciones) calculadas
//     sobre el devengado del período de causación, con % de parametros_prestaciones.
// Estado (pendiente/liquidada), soporte y "pagado_hasta" viven en liquidaciones_retiro.
//
// Base de prestaciones = devengado (salario + extras + recargos) + Auxilio de
// Transporte (parametros_legales_anio.auxilio_transporte), EXCEPTO vacaciones que
// excluye el auxilio. Períodos de causación derivados de la fecha de retiro:
//   - Cesantías / intereses / vacaciones: desde el 1-ene del año del retiro.
//   - Prima: desde 1-ene (si retiro en 1er semestre) o 1-jul (si 2do semestre).

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export type EstadoLiquidacion = "pendiente" | "liquidada"

export interface ParametrosPrestaciones {
  pctPrima: number
  pctCesantias: number
  pctInteresesCesantias: number
  pctVacaciones: number
  incluyeAux: boolean
}

const PRESTACIONES_DEFAULT: ParametrosPrestaciones = {
  pctPrima: 8.33,
  pctCesantias: 8.33,
  pctInteresesCesantias: 12,
  pctVacaciones: 4.17,
  incluyeAux: true,
}

export interface LiquidacionNovedad {
  fecha: string
  actividad_registrada: string | null
  novedad_reportada: string | null
  base_dia: number
  hed: number
  hedf: number
  hen: number
  hef: number
  hn: number
  pago_domingo: number
  recargodominical: number
  total_liquidado_dia: number
}

export interface LiquidacionPersona {
  persona: string
  identificacion: string
  idempresa: number | null
  fecha_retiro: string | null
  pagado_hasta: string | null
  dias: number
  total: number // nómina pendiente
  prima: number
  cesantias: number
  intereses: number
  vacaciones: number
  prestaciones: number // suma de las 4
  total_liquidacion: number // nómina pendiente + prestaciones
  estado: EstadoLiquidacion
  soporte_url: string | null
  soporte_nombre: string | null
  novedades: LiquidacionNovedad[]
}

async function leerParametrosPrestaciones(admin: any): Promise<ParametrosPrestaciones> {
  const { data } = await admin.from("parametros_prestaciones").select("*").eq("id", 1).maybeSingle()
  if (!data) return PRESTACIONES_DEFAULT
  return {
    pctPrima: Number(data.pct_prima ?? PRESTACIONES_DEFAULT.pctPrima),
    pctCesantias: Number(data.pct_cesantias ?? PRESTACIONES_DEFAULT.pctCesantias),
    pctInteresesCesantias: Number(data.pct_intereses_cesantias ?? PRESTACIONES_DEFAULT.pctInteresesCesantias),
    pctVacaciones: Number(data.pct_vacaciones ?? PRESTACIONES_DEFAULT.pctVacaciones),
    incluyeAux: data.incluye_aux !== false,
  }
}

// "Pagado hasta" por defecto = corte de la última quincena YA pagada (el pago es
// quincenal: 1–15 y 16–fin). Así la nómina pendiente es solo la quincena en curso.
//   - retiro después del 15 → pagada la 1a quincena → pendiente 16..retiro.
//   - retiro el 15 o antes  → pagado hasta fin del mes anterior → pendiente 1..retiro.
function defaultPagadoHasta(fechaRetiro: string): string {
  const y = Number(fechaRetiro.slice(0, 4))
  const m = Number(fechaRetiro.slice(5, 7))
  const d = Number(fechaRetiro.slice(8, 10))
  if (d > 15) return `${fechaRetiro.slice(0, 7)}-15`
  const prev = new Date(Date.UTC(y, m - 1, 0)) // último día del mes anterior
  const mm = String(prev.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(prev.getUTCDate()).padStart(2, "0")
  return `${prev.getUTCFullYear()}-${mm}-${dd}`
}

// Suma el devengado REAL (total_liquidado_dia) y cuenta los días con registro
// dentro de [desde, hasta]. Se usan los datos reales de LIPgo; el único relleno
// (los 4 primeros días de enero que no existen en el sistema) se maneja aparte.
//   - `extra` = parte del devengado que el CST art. 192 EXCLUYE de la base de
//     vacaciones: trabajo suplementario/horas extras (hed+hedf+hen, lo que entra
//     al total del día) + trabajo en descanso obligatorio (dominical/festivo:
//     pago_domingo + recargodominical). Así la base de vacaciones = dev − extra.
//   - `bono` = bonificación por productividad = excedente de destajo NETO por
//     QUINCENA (piso 0), TODO prestacional. Como el período abarca varios meses, se
//     netea por bucket (mes, quincena) y se suman los buckets positivos — igual que
//     el archivo plano de Siigo y que el IBC de parafiscales. Es SALARIO ORDINARIO
//     (no es hora extra ni dominical), por eso entra a la base de cesantías/prima y a
//     la base ordinaria de vacaciones.
function sumaPeriodo(
  rows: any[],
  desde: string,
  hasta: string,
): { dev: number; dias: number; extra: number; bono: number } {
  let dev = 0
  let dias = 0
  let extra = 0
  const excPorQuincena = new Map<string, number>()
  for (const r of rows) {
    const f = String(r.fecha)
    if (f >= desde && f <= hasta) {
      dev += Number(r.total_liquidado_dia || 0)
      extra +=
        Number(r.hed || 0) +
        Number(r.hedf || 0) +
        Number(r.hen || 0) +
        Number(r.pago_domingo || 0) +
        Number(r.recargodominical || 0)
      dias += 1
      const clave = f.slice(0, 7) + (Number(f.slice(8, 10)) <= 15 ? "-Q1" : "-Q2")
      excPorQuincena.set(clave, (excPorQuincena.get(clave) || 0) + Number(r.bonif_prestacional || 0))
    }
  }
  let bono = 0
  for (const v of excPorQuincena.values()) bono += Math.max(0, v)
  return { dev, dias, extra, bono }
}

export async function getLiquidaciones(
  idempresa: number,
): Promise<{ success: boolean; data: LiquidacionPersona[]; params?: ParametrosPrestaciones; message?: string }> {
  if (!idempresa) return { success: false, data: [], message: "Selecciona una empresa." }
  try {
    const admin: any = await getSupabaseAdmin()

    // 1) Retirados (Inactivo) del cliente seleccionado.
    const { data: retirados, error: rErr } = await admin
      .from("headcount")
      .select("identificacion, nombre, fecha_retiro, idempresa, contratosiigo, salario, fechainicio")
      .eq("idempresa", idempresa)
      .ilike("estado", "inactivo")
    if (rErr) return { success: false, data: [], message: rErr.message }
    if (!retirados || retirados.length === 0) return { success: true, data: [] }

    const infoPorNombre = new Map<
      string,
      {
        identificacion: string
        fecha_retiro: string | null
        idempresa: number | null
        contratosiigo: string
        salario: number
        fechainicio: string | null
      }
    >()
    for (const r of retirados) {
      const nombre = String(r.nombre || "").trim()
      if (!nombre) continue
      infoPorNombre.set(nombre, {
        identificacion: String(r.identificacion || "").trim(),
        fecha_retiro: r.fecha_retiro ?? null,
        idempresa: r.idempresa ?? null,
        contratosiigo: String(r.contratosiigo || "").trim(),
        salario: Number(r.salario) || 0,
        fechainicio: r.fechainicio ?? null,
      })
    }

    // 2) Solo con contrato = número de contrato SIIGO (fuente de verdad).
    for (const [nombre, info] of Array.from(infoPorNombre.entries())) {
      if (info.contratosiigo === "") infoPorNombre.delete(nombre)
    }
    const nombres = Array.from(infoPorNombre.keys())
    if (nombres.length === 0) return { success: true, data: [], params: await leerParametrosPrestaciones(admin) }

    // 3) Parámetros de prestaciones + auxilio de transporte por año.
    const pp = await leerParametrosPrestaciones(admin)
    const auxPorAnio = new Map<number, number>()
    const smlvPorAnio = new Map<number, number>()
    const { data: paramsAnio } = await admin.from("parametros_legales_anio").select("anio, auxilio_transporte, smlv")
    for (const a of paramsAnio || []) {
      auxPorAnio.set(Number(a.anio), Number(a.auxilio_transporte || 0))
      smlvPorAnio.set(Number(a.anio), Number(a.smlv || 0))
    }

    // 4) Estado/soporte/pagado_hasta guardado.
    const estadoPorCedula = new Map<
      string,
      { estado: EstadoLiquidacion; soporte_url: string | null; soporte_nombre: string | null; pagado_hasta: string | null }
    >()
    const { data: estados } = await admin
      .from("liquidaciones_retiro")
      .select("identificacion, estado, soporte_url, soporte_nombre, pagado_hasta")
      .eq("idempresa", idempresa)
    for (const e of estados || []) {
      estadoPorCedula.set(String(e.identificacion || "").trim(), {
        estado: e.estado === "liquidada" ? "liquidada" : "pendiente",
        soporte_url: e.soporte_url ?? null,
        soporte_nombre: e.soporte_nombre ?? null,
        pagado_hasta: e.pagado_hasta ?? null,
      })
    }

    // 5) TODAS las novedades de pagonomina de esos retirados (para prestaciones y
    //    pendientes). Paginado.
    const cols =
      "fecha, persona, actividad_registrada, novedad_reportada, base_dia, hed, hedf, hen, hef, hn, pago_domingo, recargodominical, bonif_prestacional, total_liquidado_dia"
    let all: any[] = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const { data, error } = await admin
        .from("pagonomina")
        .select(cols)
        .in("persona", nombres)
        .order("fecha", { ascending: false })
        .range(offset, offset + pageSize - 1)
      if (error) return { success: false, data: [], message: error.message }
      if (!data || data.length === 0) hasMore = false
      else {
        all = all.concat(data)
        if (data.length < pageSize) hasMore = false
        else offset += pageSize
      }
    }

    // Agrupar filas por persona (solo hasta su fecha de retiro).
    const rowsPorNombre = new Map<string, any[]>()
    for (const row of all) {
      const nombre = String(row.persona || "").trim()
      const info = infoPorNombre.get(nombre)
      if (!info) continue
      if (info.fecha_retiro && String(row.fecha) > info.fecha_retiro) continue
      const arr = rowsPorNombre.get(nombre) || []
      arr.push(row)
      rowsPorNombre.set(nombre, arr)
    }

    // 6) Construir cada persona: pendiente + prestaciones.
    const data: LiquidacionPersona[] = []
    for (const [nombre, info] of infoPorNombre) {
      const est = estadoPorCedula.get(info.identificacion)
      // "Pagado hasta": el guardado manualmente, o por defecto el corte de la
      // última quincena pagada (para que la nómina pendiente sea solo la quincena).
      const pagado_hasta =
        (est?.pagado_hasta ?? null) || (info.fecha_retiro ? defaultPagadoHasta(info.fecha_retiro) : null)
      const rows = rowsPorNombre.get(nombre) || []

      // Nómina PENDIENTE: fecha > pagado_hasta (y <= retiro, ya filtrado).
      const novedades: LiquidacionNovedad[] = []
      let total = 0
      // Bono de productividad de la quincena PENDIENTE (excedente de destajo neto,
      // piso 0 por quincena). Se suma al total además de las bases diarias.
      const excPendiente = new Map<string, number>()
      for (const r of rows) {
        if (pagado_hasta && String(r.fecha) <= pagado_hasta) continue
        const nov: LiquidacionNovedad = {
          fecha: r.fecha,
          actividad_registrada: r.actividad_registrada ?? null,
          novedad_reportada: r.novedad_reportada ?? null,
          base_dia: Number(r.base_dia || 0),
          hed: Number(r.hed || 0),
          hedf: Number(r.hedf || 0),
          hen: Number(r.hen || 0),
          hef: Number(r.hef || 0),
          hn: Number(r.hn || 0),
          pago_domingo: Number(r.pago_domingo || 0),
          recargodominical: Number(r.recargodominical || 0),
          total_liquidado_dia: Number(r.total_liquidado_dia || 0),
        }
        novedades.push(nov)
        total += nov.total_liquidado_dia
        const f = String(r.fecha)
        const clave = f.slice(0, 7) + (Number(f.slice(8, 10)) <= 15 ? "-Q1" : "-Q2")
        excPendiente.set(clave, (excPendiente.get(clave) || 0) + Number(r.bonif_prestacional || 0))
      }
      for (const v of excPendiente.values()) total += Math.max(0, v)

      // PRESTACIONES sobre el devengado del período de causación.
      let prima = 0
      let cesantias = 0
      let intereses = 0
      let vacaciones = 0
      if (info.fecha_retiro) {
        const anio = Number(info.fecha_retiro.slice(0, 4))
        const cesDesde = `${anio}-01-01`
        const auxMensual = auxPorAnio.get(anio) ?? 0
        const salarioMensual = info.salario || smlvPorAnio.get(anio) || 0
        const salarioDia = salarioMensual / 30
        const ce = sumaPeriodo(rows, cesDesde, info.fecha_retiro)

        // Relleno SOLO de los primeros días de enero que no existen en el sistema
        // (hasta 4), y únicamente si el trabajador venía del año anterior (tiene
        // registros antes del 1-ene). Cada día = 1 día de salario básico.
        let fillDias = 0
        // "Venía del año anterior": tiene registros antes del 1-ene, o su fecha de
        // inicio de contrato es anterior al año del retiro.
        const veniaAnioAnterior =
          rows.some((r: any) => String(r.fecha) < cesDesde) ||
          (!!info.fechainicio && String(info.fechainicio) < cesDesde)
        if (veniaAnioAnterior) {
          const primerDelAnio = rows
            .map((r: any) => String(r.fecha))
            .filter((fx: string) => fx >= cesDesde)
            .sort()[0]
          if (primerDelAnio) fillDias = Math.max(0, Math.min(Number(primerDelAnio.slice(8, 10)) - 1, 4))
        }
        const fillMonto = fillDias * salarioDia
        const diasCes = ce.dias + fillDias

        const auxPropCes = (auxMensual / 30) * diasCes
        // Base de cesantías = devengado (base diaria) + bono de productividad (salario)
        // + relleno enero + auxilio. El bono es salario para prestaciones.
        const baseCes = ce.dev + ce.bono + fillMonto + (pp.incluyeAux ? auxPropCes : 0)
        cesantias = baseCes * (pp.pctCesantias / 100)
        intereses = cesantias * (pp.pctInteresesCesantias / 100) * (diasCes / 360)

        // PRIMA — la prima del 1er semestre se pagó hasta el 30-jun. Según la fecha:
        //  · Retiro en junio → ya recibió prima hasta el 30-jun → se DESCUENTAN los
        //    días pagados de más (del retiro al 30-jun) → valor NEGATIVO.
        //  · Retiro antes de junio → prima ene→retiro PENDIENTE (aún no pagada).
        //  · Retiro 2do semestre → prima desde jul (o dic si ya se pagó).
        const primaBaseDiaria = (salarioMensual + (pp.incluyeAux ? auxMensual : 0)) / 30
        if (info.fecha_retiro >= `${anio}-06-01` && info.fecha_retiro <= `${anio}-06-30`) {
          const diasDeMas = 30 - Number(info.fecha_retiro.slice(8, 10))
          prima = -(diasDeMas * primaBaseDiaria * (pp.pctPrima / 100))
        } else if (info.fecha_retiro < `${anio}-06-01`) {
          const prc = sumaPeriodo(rows, cesDesde, info.fecha_retiro)
          prima = (prc.dev + prc.bono + (pp.incluyeAux ? (auxMensual / 30) * prc.dias : 0)) * (pp.pctPrima / 100)
        } else {
          const primaDesde2 = info.fecha_retiro >= `${anio}-12-15` ? `${anio}-12-15` : `${anio}-07-01`
          const pr2 = sumaPeriodo(rows, primaDesde2, info.fecha_retiro)
          prima = (pr2.dev + pr2.bono + (pp.incluyeAux ? (auxMensual / 30) * pr2.dias : 0)) * (pp.pctPrima / 100)
        }

        // Vacaciones: se ACUMULAN de forma continua durante TODO el vínculo (no se
        // reinician cada año). Días causados = pctVacaciones × días de vínculo (≈15/año,
        // desde la fecha de ingreso) MENOS los días ya disfrutados. Se paga lo
        // pendiente al salario básico/día. Ej: si ya disfrutó su año pero siguió
        // laborando, quedan las pocas causadas después.
        const inicioVinculo =
          info.fechainicio && String(info.fechainicio) < info.fecha_retiro ? String(info.fechainicio) : cesDesde
        const diasVinculo = Math.max(
          0,
          Math.round((Date.parse(info.fecha_retiro) - Date.parse(inicioVinculo)) / 86_400_000),
        )
        const vacCausadasDias = (pp.pctVacaciones / 100) * diasVinculo
        const diasDisfrutados = rows.filter((r: any) =>
          /vacaciones\s+disfrutad/i.test(String(r.novedad_reportada || "")),
        ).length
        // Los días pendientes se pagan sobre el DEVENGADO promedio, pero como manda
        // el CST art. 192: la base es el SALARIO ORDINARIO, que EXCLUYE el trabajo
        // suplementario (horas extras) y el de descanso obligatorio (dominical/
        // festivo) — y también el auxilio de transporte (que no está en el devengado).
        // No es sobre el salario mínimo: es el promedio diario ordinario real.
        // Base ordinaria = devengado − extras/dominical (excluidos por art. 192) +
        // bono de productividad (SÍ es salario ordinario: destajo, no hora extra) + relleno.
        const devOrdinario = ce.dev - ce.extra + ce.bono + fillMonto
        const promedioDiaOrdinario = diasCes > 0 ? devOrdinario / diasCes : salarioDia
        vacaciones = Math.max(0, vacCausadasDias - diasDisfrutados) * promedioDiaOrdinario
      }
      const prestaciones = prima + cesantias + intereses + vacaciones

      data.push({
        persona: nombre,
        identificacion: info.identificacion,
        idempresa: info.idempresa,
        fecha_retiro: info.fecha_retiro,
        pagado_hasta,
        dias: novedades.length,
        total,
        prima,
        cesantias,
        intereses,
        vacaciones,
        prestaciones,
        total_liquidacion: total + prestaciones,
        estado: est?.estado ?? "pendiente",
        soporte_url: est?.soporte_url ?? null,
        soporte_nombre: est?.soporte_nombre ?? null,
        novedades,
      })
    }

    data.sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === "pendiente" ? -1 : 1
      return String(b.fecha_retiro || "").localeCompare(String(a.fecha_retiro || ""))
    })
    return { success: true, data, params: pp }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al cargar las liquidaciones." }
  }
}

// ---- Parámetros de prestaciones (tabla de porcentajes de ley) ----
export async function getParametrosPrestaciones(): Promise<{ success: boolean; data: ParametrosPrestaciones }> {
  try {
    const admin: any = await getSupabaseAdmin()
    return { success: true, data: await leerParametrosPrestaciones(admin) }
  } catch {
    return { success: true, data: PRESTACIONES_DEFAULT }
  }
}

export async function guardarParametrosPrestaciones(
  p: ParametrosPrestaciones,
): Promise<{ success: boolean; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await admin.from("parametros_prestaciones").upsert(
      {
        id: 1,
        pct_prima: p.pctPrima,
        pct_cesantias: p.pctCesantias,
        pct_intereses_cesantias: p.pctInteresesCesantias,
        pct_vacaciones: p.pctVacaciones,
        incluye_aux: p.incluyeAux,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar parámetros." }
  }
}

// ---- Estado / soporte / pagado_hasta ----
async function upsertLiquidacion(admin: any, fields: Record<string, unknown>) {
  return admin
    .from("liquidaciones_retiro")
    .upsert({ ...fields, updated_at: new Date().toISOString() }, { onConflict: "idempresa,identificacion" })
}

export async function guardarEstadoLiquidacion(payload: {
  idempresa: number | null
  identificacion: string
  persona: string
  fecha_retiro: string | null
  total: number
  estado: EstadoLiquidacion
}): Promise<{ success: boolean; message?: string }> {
  if (!payload?.identificacion) return { success: false, message: "Datos incompletos." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await upsertLiquidacion(admin, {
      idempresa: payload.idempresa,
      identificacion: payload.identificacion,
      persona: payload.persona,
      fecha_retiro: payload.fecha_retiro,
      total_liquidado: payload.total,
      estado: payload.estado,
      fecha_liquidacion: payload.estado === "liquidada" ? new Date().toISOString() : null,
    })
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar el estado." }
  }
}

export async function guardarPagadoHasta(payload: {
  idempresa: number | null
  identificacion: string
  persona: string
  fecha_retiro: string | null
  pagado_hasta: string | null
}): Promise<{ success: boolean; message?: string }> {
  if (!payload?.identificacion) return { success: false, message: "Datos incompletos." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await upsertLiquidacion(admin, {
      idempresa: payload.idempresa,
      identificacion: payload.identificacion,
      persona: payload.persona,
      fecha_retiro: payload.fecha_retiro,
      pagado_hasta: payload.pagado_hasta || null,
    })
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar la fecha." }
  }
}

export async function subirSoporteLiquidacion(
  formData: FormData,
): Promise<{ success: boolean; url?: string; message?: string }> {
  try {
    const file = formData.get("file") as File | null
    const idempresaRaw = Number(formData.get("idempresa"))
    const idempresa = Number.isFinite(idempresaRaw) && idempresaRaw > 0 ? idempresaRaw : null
    const identificacion = String(formData.get("identificacion") || "").trim()
    const persona = String(formData.get("persona") || "")
    const fecha_retiro = (formData.get("fecha_retiro") as string) || null
    if (!file || !identificacion) return { success: false, message: "Faltan datos o archivo." }

    const admin: any = await getSupabaseAdmin()
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase()
    const filePath = `liquidaciones/${identificacion}_${Date.now()}.${ext}`

    const { error: upErr } = await admin.storage.from("archivos").upload(filePath, file, { upsert: true })
    if (upErr) return { success: false, message: upErr.message }

    const { data: urlData } = admin.storage.from("archivos").getPublicUrl(filePath)
    const url = urlData?.publicUrl as string

    const { error: dbErr } = await upsertLiquidacion(admin, {
      idempresa,
      identificacion,
      persona,
      fecha_retiro,
      soporte_url: url,
      soporte_nombre: file.name,
    })
    if (dbErr) return { success: false, message: dbErr.message }

    return { success: true, url }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al subir el soporte." }
  }
}
