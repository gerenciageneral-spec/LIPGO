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

export interface DeduccionLiquidacion {
  id: string
  concepto: string
  valor: number
  observacion: string | null
}

export interface LiquidacionPersona {
  persona: string
  identificacion: string
  idempresa: number | null
  fecha_retiro: string | null
  pagado_hasta: string | null
  motivo_retiro: string | null
  dias: number
  total: number // nómina pendiente
  prima: number
  cesantias: number
  intereses: number
  vacaciones: number
  indemnizacion: number
  prestaciones: number // suma de las 4 prestaciones + indemnización
  deducciones: number // suma de los items registrados
  deduccion_items: DeduccionLiquidacion[]
  total_liquidacion: number // nómina pendiente + prestaciones − deducciones
  estado: EstadoLiquidacion
  soporte_url: string | null
  soporte_nombre: string | null
  novedades: LiquidacionNovedad[]
  // Valor REAL guardado (histórico), si existe -- para mostrar en pantalla
  // cuál de las prestaciones viene de la fórmula y cuál de un valor
  // confirmado manualmente.
  cesantias_real: number | null
  intereses_real: number | null
  prima_real: number | null
  vacaciones_real: number | null
  indemnizacion_real: number | null
}

// INDEMNIZACIÓN por despido SIN JUSTA CAUSA -- Ley 789/2002 art. 28 (modifica
// CST art. 64). Solo aplica cuando el motivo del retiro es "sin justa causa"
// (renuncia voluntaria, justa causa o terminación de período de prueba NO
// generan indemnización). Salario ≤10 SMLMV: 30 días si el vínculo es ≤1 año;
// 30 + 20 días por cada año adicional (proporcional) si es >1 año. Salario
// >10 SMLMV: 20 días / 20 + 15 por año adicional. Días de vínculo con
// convención /360 (igual que el resto del módulo, ej. intereses de cesantías).
function calcularIndemnizacion(
  motivoRetiro: string | null,
  salarioMensual: number,
  smlv: number,
  fechainicio: string | null,
  fechaRetiro: string,
): number {
  if (!/sin\s+justa\s+causa/i.test(String(motivoRetiro || ""))) return 0
  if (!fechainicio) return 0
  const diasVinculo = Math.max(0, Math.round((Date.parse(fechaRetiro) - Date.parse(fechainicio)) / 86_400_000))
  const anios = diasVinculo / 360
  const salarioDia = salarioMensual / 30
  const superaDiezSmlmv = smlv > 0 && salarioMensual > 10 * smlv
  const diasBase = superaDiezSmlmv ? 20 : 30
  const diasPorAnioAdicional = superaDiezSmlmv ? 15 : 20
  const diasIndemnizacion = anios <= 1 ? diasBase : diasBase + diasPorAnioAdicional * (anios - 1)
  return diasIndemnizacion * salarioDia
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
//
// "Sin Registro" SIN motivo (novedad_reportada vacía) y en $0: verificado con
// datos reales 2026-09-07 (Omar Villar, Jesús De La Hoz -- ambos cargo
// "Cargue/Descargue", pago por tonelada) que esto es un hueco de captura de
// actividad, NO una ausencia real -- a diferencia de "Sin Registro" con un
// motivo real (13-Incapacidad, 38-Licencia no remunerada), que sí debe seguir
// en $0. Se rellena con el salario básico del día (el piso garantizado,
// incluso para quien trabaja al destajo). Confirmado que NO aplica cuando ya
// hay un total_liquidado_dia real (turno con "Sin Registro" pagado completo,
// ej. Luis Ángel Arrieta, cargo "Distribución Turno" -- no se toca, ya paga
// bien).
//
// Bono de destajo (`bonif_prestacional`, novedad "52-Bonificación Por
// Productividad"): confirmado por el usuario (2026-09-07) que SÍ es base de
// prestaciones (cesantías/intereses/prima/vacaciones) -- coincide con el
// comentario canónico de lib/revision-nomina-actions.ts ("bono neto de
// destajo... TODO prestacional") -- pero solo para quien trabaja al DESTAJO
// (toneladas>0 y no "especialidad"/turno, mismo criterio `esDestajo` de ese
// archivo) y solo DESDE el 1-jul-2026 (antes de esa fecha el bono no era base
// de prestaciones). Se acumula por QUINCENA con piso $0 antes de sumarlo,
// igual que `excPendiente` más abajo para la nómina pendiente -- así un mes
// con días buenos y malos mezclados no resta plata ya "asegurada" por el piso
// diario.
const BONO_DESTAJO_PRESTACIONAL_DESDE = "2026-07-01"

function sumaPeriodo(rows: any[], desde: string, hasta: string, salarioDia: number): { dev: number; dias: number } {
  let dev = 0
  let dias = 0
  const bonoPorQuincena = new Map<string, number>()
  for (const r of rows) {
    const f = String(r.fecha)
    if (f >= desde && f <= hasta) {
      const sinRegistroSinMotivo =
        String(r.actividad_registrada || "") === "Sin Registro" &&
        !String(r.novedad_reportada || "").trim() &&
        Number(r.total_liquidado_dia || 0) === 0
      dev += sinRegistroSinMotivo ? salarioDia : Number(r.total_liquidado_dia || 0)
      dias += 1
      if (f >= BONO_DESTAJO_PRESTACIONAL_DESDE) {
        const esp = r.especialidad === true || String(r.especialidad) === "true"
        const esDestajo = Number(r.toneladas || 0) > 0 && !esp
        if (esDestajo) {
          const clave = f.slice(0, 7) + (Number(f.slice(8, 10)) <= 15 ? "-Q1" : "-Q2")
          bonoPorQuincena.set(clave, (bonoPorQuincena.get(clave) || 0) + Number(r.bonif_prestacional || 0))
        }
      }
    }
  }
  for (const v of bonoPorQuincena.values()) dev += Math.max(0, v)
  return { dev, dias }
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
      .select("identificacion, nombre, fecha_retiro, idempresa, contratosiigo, salario, fechainicio, motivo_retiro")
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
        motivo_retiro: string | null
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
        motivo_retiro: r.motivo_retiro ?? null,
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

    // 4) Estado/soporte/pagado_hasta guardado + valores REALES (histórico).
    // Si una persona ya liquidada tiene guardado el valor real de una
    // prestación (porque lo que pagó Siigo no coincide con la fórmula --
    // huecos de datos históricos, ajustes manuales de RRHH), ese valor real
    // GANA sobre el cálculo en vivo. Confirmado por el usuario 2026-09-07.
    const estadoPorCedula = new Map<
      string,
      {
        estado: EstadoLiquidacion
        soporte_url: string | null
        soporte_nombre: string | null
        pagado_hasta: string | null
        cesantias_real: number | null
        intereses_real: number | null
        prima_real: number | null
        vacaciones_real: number | null
        indemnizacion_real: number | null
      }
    >()
    const { data: estados } = await admin
      .from("liquidaciones_retiro")
      .select(
        "identificacion, estado, soporte_url, soporte_nombre, pagado_hasta, cesantias_real, intereses_real, prima_real, vacaciones_real, indemnizacion_real",
      )
      .eq("idempresa", idempresa)
    for (const e of estados || []) {
      estadoPorCedula.set(String(e.identificacion || "").trim(), {
        estado: e.estado === "liquidada" ? "liquidada" : "pendiente",
        soporte_url: e.soporte_url ?? null,
        soporte_nombre: e.soporte_nombre ?? null,
        pagado_hasta: e.pagado_hasta ?? null,
        cesantias_real: e.cesantias_real ?? null,
        intereses_real: e.intereses_real ?? null,
        prima_real: e.prima_real ?? null,
        vacaciones_real: e.vacaciones_real ?? null,
        indemnizacion_real: e.indemnizacion_real ?? null,
      })
    }

    // 4b) Deducciones registradas caso-por-caso (préstamos, anticipos, otros
    // descuentos autorizados) -- no calculables por fórmula.
    const cedulas = Array.from(infoPorNombre.values()).map((i) => i.identificacion)
    const deduccionesPorCedula = new Map<string, DeduccionLiquidacion[]>()
    if (cedulas.length > 0) {
      const { data: deducciones } = await admin
        .from("liquidaciones_retiro_deducciones")
        .select("id, identificacion, concepto, valor, observacion")
        .eq("idempresa", idempresa)
        .in("identificacion", cedulas)
      for (const d of deducciones || []) {
        const cedula = String(d.identificacion || "").trim()
        const arr = deduccionesPorCedula.get(cedula) || []
        arr.push({ id: d.id, concepto: d.concepto, valor: Number(d.valor) || 0, observacion: d.observacion ?? null })
        deduccionesPorCedula.set(cedula, arr)
      }
    }

    // 5) TODAS las novedades de pagonomina de esos retirados (para prestaciones y
    //    pendientes). Paginado.
    const cols =
      "fecha, persona, actividad_registrada, novedad_reportada, base_dia, hed, hedf, hen, hef, hn, pago_domingo, recargodominical, bonif_prestacional, total_liquidado_dia, especialidad, toneladas"
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
      let indemnizacion = 0
      if (info.fecha_retiro) {
        const anio = Number(info.fecha_retiro.slice(0, 4))
        indemnizacion = calcularIndemnizacion(
          info.motivo_retiro,
          info.salario || smlvPorAnio.get(anio) || 0,
          smlvPorAnio.get(anio) || 0,
          info.fechainicio,
          info.fecha_retiro,
        )
        const cesDesde = `${anio}-01-01`
        // Si el vínculo empezó DENTRO del año del retiro, las ventanas de
        // causación arrancan en la fecha real de ingreso, no en enero-1 -- de
        // lo contrario `pagonomina` trae filas "Sin Registro" (piso $0) desde
        // enero para CUALQUIER persona del roster, sin importar cuándo entró,
        // e inflan/deflactan el conteo de días (auxilio prorrateado de más,
        // promedio diario de vacaciones de menos) aunque no aporten devengado.
        // Verificado con datos reales 2026-09-07 (Carlos Pacheco, Jesús Escalona:
        // pagonomina con filas desde enero pese a haber ingresado en junio).
        const cesDesdeReal =
          info.fechainicio && String(info.fechainicio) > cesDesde ? String(info.fechainicio) : cesDesde
        const auxMensual = auxPorAnio.get(anio) ?? 0
        const salarioMensual = info.salario || smlvPorAnio.get(anio) || 0
        const salarioDia = salarioMensual / 30
        const ce = sumaPeriodo(rows, cesDesdeReal, info.fecha_retiro, salarioDia)

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
        // Base de cesantías = devengado (incluye el bono de destajo desde
        // julio-2026, ver sumaPeriodo) + relleno enero + auxilio.
        const baseCes = ce.dev + fillMonto + (pp.incluyeAux ? auxPropCes : 0)
        cesantias = baseCes * (pp.pctCesantias / 100)
        intereses = cesantias * (pp.pctInteresesCesantias / 100) * (diasCes / 360)

        // PRIMA — la prima del 1er semestre se ADELANTA con la nómina del 15-jun a
        // quien ya venía de una quincena anterior (confirmado por el usuario
        // 2026-09-07: "las personas retiradas desde el día 16 aparecen en cero
        // porque se les pagó de forma anticipada el 15 de junio con la nómina").
        // Verificado con 10 casos reales: retiro en junio → prima liquidación = $0,
        // sin importar el día exacto ni la antigüedad -- la ÚNICA excepción es
        // alguien que ingresa y se retira el MISMO día (nunca pasó por una
        // quincena, nunca recibió el adelanto), a quien sí se le prorratea normal.
        // El recobro de lo pagado de más ("mayor valor pagado en primas") es una
        // DEDUCCIÓN, no un valor negativo de esta línea -- pendiente de modelar en
        // el submódulo de Deducciones (fuera del alcance de este fix).
        if (info.fecha_retiro >= `${anio}-06-01` && info.fecha_retiro <= `${anio}-06-30`) {
          if (info.fechainicio && String(info.fechainicio) === info.fecha_retiro) {
            const prc = sumaPeriodo(rows, cesDesdeReal, info.fecha_retiro, salarioDia)
            prima = (prc.dev + (pp.incluyeAux ? (auxMensual / 30) * prc.dias : 0)) * (pp.pctPrima / 100)
          } else {
            prima = 0
          }
        } else if (info.fecha_retiro < `${anio}-06-01`) {
          const prc = sumaPeriodo(rows, cesDesdeReal, info.fecha_retiro, salarioDia)
          prima = (prc.dev + (pp.incluyeAux ? (auxMensual / 30) * prc.dias : 0)) * (pp.pctPrima / 100)
        } else {
          const primaDesde2Base = info.fecha_retiro >= `${anio}-12-15` ? `${anio}-12-15` : `${anio}-07-01`
          const primaDesde2 =
            info.fechainicio && String(info.fechainicio) > primaDesde2Base ? String(info.fechainicio) : primaDesde2Base
          const pr2 = sumaPeriodo(rows, primaDesde2, info.fecha_retiro, salarioDia)
          prima = (pr2.dev + (pp.incluyeAux ? (auxMensual / 30) * pr2.dias : 0)) * (pp.pctPrima / 100)
        }

        // Vacaciones: se ACUMULAN de forma continua durante TODO el vínculo (no se
        // reinician cada año). Días causados = pctVacaciones × días de vínculo (≈15/año,
        // desde la fecha de ingreso) MENOS los días ya disfrutados. Se paga lo
        // pendiente al salario básico/día. Ej: si ya disfrutó su año pero siguió
        // laborando, quedan las pocas causadas después.
        // `diasVinculo` para alguien que YA venía de antes del 1-ene usa la fecha
        // real de ingreso (así no se reinicia la acumulación cada año). Para quien
        // ingresó DENTRO del año del retiro, se reutiliza `diasCes` (ya calculado
        // arriba a partir de `cesDesdeReal`) en vez de restar fechas -- restar
        // fechas rompía con ingreso=retiro el mismo día (diferencia de fechas = 0,
        // pero sí hay 1 día causado). Verificado con datos reales 2026-09-07
        // (varias personas con ingreso y retiro el mismo día, ej. Felipe Pérez
        // Vega, Juan David Gámez Tatis).
        const diasVinculo = veniaAnioAnterior
          ? Math.max(
              0,
              Math.round((Date.parse(info.fecha_retiro) - Date.parse(String(info.fechainicio))) / 86_400_000),
            )
          : diasCes
        const vacCausadasDias = (pp.pctVacaciones / 100) * diasVinculo
        const diasDisfrutados = rows.filter((r: any) =>
          /vacaciones\s+disfrutad/i.test(String(r.novedad_reportada || "")),
        ).length
        // Los días pendientes se pagan al SALARIO DIARIO BÁSICO (salarioMensual/30),
        // no al promedio real devengado -- verificado con datos reales 2026-09-07
        // (Carlos Pacheco: usar el promedio real devengado daba $128.989 vs. real
        // $160.094; con salario básico da ~$163.062, a menos de un día de tenencia
        // de diferencia). Coincide con el criterio general de LIPgo para "básico
        // por día" (`salarioDia`, usado igual en la prima/cesantías de gente recién
        // ingresada) en vez de un promedio calculado sobre horas extra/destajo.
        vacaciones = Math.max(0, vacCausadasDias - diasDisfrutados) * salarioDia
      }

      // Valor REAL guardado (histórico) gana sobre el cálculo en vivo, campo
      // por campo -- ver comentario en el punto 4 más arriba.
      if (est?.cesantias_real != null) cesantias = est.cesantias_real
      if (est?.intereses_real != null) intereses = est.intereses_real
      if (est?.prima_real != null) prima = est.prima_real
      if (est?.vacaciones_real != null) vacaciones = est.vacaciones_real
      if (est?.indemnizacion_real != null) indemnizacion = est.indemnizacion_real

      const prestaciones = prima + cesantias + intereses + vacaciones + indemnizacion
      const deduccion_items = deduccionesPorCedula.get(info.identificacion) || []
      const deducciones = deduccion_items.reduce((s, d) => s + d.valor, 0)

      data.push({
        persona: nombre,
        identificacion: info.identificacion,
        idempresa: info.idempresa,
        fecha_retiro: info.fecha_retiro,
        pagado_hasta,
        motivo_retiro: info.motivo_retiro,
        dias: novedades.length,
        total,
        prima,
        cesantias,
        intereses,
        vacaciones,
        indemnizacion,
        prestaciones,
        deducciones,
        deduccion_items,
        total_liquidacion: total + prestaciones - deducciones,
        estado: est?.estado ?? "pendiente",
        soporte_url: est?.soporte_url ?? null,
        soporte_nombre: est?.soporte_nombre ?? null,
        novedades,
        cesantias_real: est?.cesantias_real ?? null,
        intereses_real: est?.intereses_real ?? null,
        prima_real: est?.prima_real ?? null,
        vacaciones_real: est?.vacaciones_real ?? null,
        indemnizacion_real: est?.indemnizacion_real ?? null,
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

// Valores REALES (histórico) de una prestación, cuando lo pagado en Siigo no
// coincide con la fórmula. Pasar null en un campo lo deja SIN valor real (el
// cálculo en vivo vuelve a aplicar para ese campo).
export async function guardarValoresRealesLiquidacion(payload: {
  idempresa: number | null
  identificacion: string
  persona: string
  fecha_retiro: string | null
  cesantias_real: number | null
  intereses_real: number | null
  prima_real: number | null
  vacaciones_real: number | null
  indemnizacion_real: number | null
}): Promise<{ success: boolean; message?: string }> {
  if (!payload?.identificacion) return { success: false, message: "Datos incompletos." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await upsertLiquidacion(admin, {
      idempresa: payload.idempresa,
      identificacion: payload.identificacion,
      persona: payload.persona,
      fecha_retiro: payload.fecha_retiro,
      cesantias_real: payload.cesantias_real,
      intereses_real: payload.intereses_real,
      prima_real: payload.prima_real,
      vacaciones_real: payload.vacaciones_real,
      indemnizacion_real: payload.indemnizacion_real,
    })
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar los valores reales." }
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

// Motivo de retiro (headcount.motivo_retiro) -- de él depende si aplica
// indemnización (solo "Sin Justa Causa", ver calcularIndemnizacion).
export async function guardarMotivoRetiro(payload: {
  identificacion: string
  motivo_retiro: string | null
}): Promise<{ success: boolean; message?: string }> {
  if (!payload?.identificacion) return { success: false, message: "Datos incompletos." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await admin
      .from("headcount")
      .update({ motivo_retiro: payload.motivo_retiro || null })
      .eq("identificacion", payload.identificacion)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar el motivo de retiro." }
  }
}

// ---- Deducciones (caso por caso: préstamos, anticipos, otros descuentos) ----
export async function agregarDeduccionLiquidacion(payload: {
  idempresa: number | null
  identificacion: string
  persona: string
  concepto: string
  valor: number
  observacion: string | null
}): Promise<{ success: boolean; message?: string }> {
  if (!payload?.identificacion || !payload?.concepto) return { success: false, message: "Datos incompletos." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await admin.from("liquidaciones_retiro_deducciones").insert({
      idempresa: payload.idempresa,
      identificacion: payload.identificacion,
      persona: payload.persona,
      concepto: payload.concepto,
      valor: payload.valor,
      observacion: payload.observacion || null,
    })
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar la deducción." }
  }
}

export async function eliminarDeduccionLiquidacion(id: string): Promise<{ success: boolean; message?: string }> {
  if (!id) return { success: false, message: "Falta el identificador." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await admin.from("liquidaciones_retiro_deducciones").delete().eq("id", id)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al eliminar la deducción." }
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
