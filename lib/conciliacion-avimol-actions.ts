"use server"

/**
 * Server actions del módulo "Conciliación Avimol" (Gestión Financiera).
 *
 * Avimol (idempresa=2) tiene un modelo asimétrico: lo que LIP PAGA son los
 * TURNOS de los puestos "Estibado PT" y "Salvado" (costo de personal), pero
 * lo que LIP COBRA es PRODUCCIÓN — los ingresos de tolva registrados en
 * `invtrans`, valorizados por tonelada contra `tarifasoperacion`. Como el
 * ingreso y el costo nacen de fuentes distintas, este módulo los cruza día
 * por día para poder ver si un día se pagó más turno del que se facturó.
 *
 * SEGUNDO CONCEPTO FACTURABLE — HORAS EXTRA:
 *  - Se cobran TODAS las horas extra (hed+hedf+hen+hef+hn) de TODOS los
 *    puestos de Avimol, a `tarifasfacturacionturnos.tarifahoraextra`.
 *  - Se facturan COMPLETAS: a diferencia de la vista legacy
 *    `facturacionturnos`, aquí NO se resta el 0,66 (ese descuento venía de la
 *    jornada de 7,3333 h y quedó obsoleto con la de 7 h vigente).
 *  - Se cruzan contra lo que el PROYECTO solicitó en Servicios Adicionales
 *    (`solicitudesturnos`, tipo='Horas Extra', estado='aprobado'), por
 *    (fecharequerida, puesto). Ejecutar y facturar horas sin solicitud
 *    aprobada es la alerta más importante del módulo.
 *  - El COSTO de las horas extra de puestos distintos de Estibado PT/Salvado
 *    entra en `pagoHorasExtraOtros`: se factura su hora extra, así que su
 *    costo debe contarse o el margen quedaría inflado.
 *
 * Reglas de negocio (confirmadas con el negocio — no asumir otra cosa):
 *  - `tarifasoperacion.tarifa` está en $/TONELADA → cobro = toneladas × tarifa.
 *  - FESTIVO = domingo Ó fecha presente en la tabla `festivos` (la misma que
 *    usa pagonomina para `es_festivo`). Decide si aplica la tarifa normal o
 *    la variante "… Festivo".
 *  - El DÍA del ingreso sale del `lote` (formato YYYYMMDD), NO de `fechaprod`.
 *  - Solo entran ingresos con `status = 'Aprobado'`.
 *  - Producto: nombreproducto con "MOGOLLA" → tarifa Salvado; el resto →
 *    Estibado PT. (El negocio lo definió como "PT MOGOLLA 40 KG"; se hace
 *    match por MOGOLLA para tolerar variantes de gramaje/espaciado, y el
 *    desglose por producto queda visible en la UI para poder auditarlo.)
 *
 * Es un LECTOR: no escribe nada. Mismo patrón que getAuditoriaTolva
 * (lib/liquidacion-tolva-actions.ts), que resuelve este mismo eje para Tolva.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"

/** Avimol. El módulo es específico de este proyecto (no usa el selector global). */
const AVIMOL_IDEMPRESA = 2

/** Mismo comodín que liquidacion-tolva-actions.ts:45 — tolera la tilde de "producción". */
const ORIGEN_INGRESO_PRODUCCION = "%ingreso producci%"

/** Puestos de turno que se pagan y que este módulo concilia. */
const PUESTOS_TURNO = ["Estibado PT", "Salvado"]

/** Operaciones en tarifasoperacion (empresaid=2). */
const OP_ESTIBADO = "Estibado PT"
const OP_ESTIBADO_FESTIVO = "Estibado PT Festivo"
const OP_SALVADO = "Salvado"
const OP_SALVADO_FESTIVO = "Salvado Festivo"

const num = (v: any) => Number(v || 0)

/**
 * Parseo lote (YYYYMMDD) → fecha ISO. Mismo guard que sig-actions.ts:2401
 * (el lote se puede escribir a mano, así que puede no ser una fecha).
 */
function loteAFecha(lote: any): string | null {
  const s = String(lote || "").trim()
  if (!/^\d{8}$/.test(s)) return null
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(4, 6))
  const d = Number(s.slice(6, 8))
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, m - 1, d)
  if (isNaN(dt.getTime()) || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

/** ¿El producto es Salvado (mogolla)? Si no, es Estibado PT. */
function esSalvado(nombreproducto: any): boolean {
  return String(nombreproducto || "").toUpperCase().includes("MOGOLLA")
}

/**
 * Tarifa vigente por (operación, fecha). Mismo helper que
 * liquidacion-tolva-actions.ts:493-498. OJO: `tarifasoperacion` usa
 * `fechainicio`/`fechafin` (no `fechaini` como tarifaspersonal/tarifasturnos)
 * y su columna `tarifa` es TEXT → siempre Number(...) || 0.
 */
function tarifaVigente(tarifas: any[], operacion: string, fecha: string): number {
  const fila = (tarifas || []).find(
    (t) =>
      String(t.operacion || "").trim() === operacion &&
      String(t.fechainicio).slice(0, 10) <= fecha &&
      String(t.fechafin).slice(0, 10) >= fecha,
  )
  return fila ? num(fila.tarifa) : 0
}

/**
 * Tarifa de HORA EXTRA vigente por (puesto, fecha) desde
 * `tarifasfacturacionturnos`. Ese maestro es GLOBAL (su `idempresa` está casi
 * sin asignar, ver lib/company-constants.ts), así que el lookup va por puesto +
 * vigencia sin filtrar empresa — igual que hace la vista `facturacionturnos`.
 * Vigencia en `fechainicio`/`fechafin` (NO `fechaini`, que es de
 * tarifaspersonal/tarifasturnos: el bug está a un carácter).
 */
function tarifaHoraExtraVigente(tarifas: any[], puesto: string, fecha: string): number {
  const p = puesto.trim().toUpperCase()
  const fila = (tarifas || []).find(
    (t) =>
      String(t.puesto || "").trim().toUpperCase() === p &&
      String(t.fechainicio).slice(0, 10) <= fecha &&
      String(t.fechafin).slice(0, 10) >= fecha,
  )
  return fila ? num(fila.tarifahoraextra) : 0
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ProductoConciliado {
  nombreproducto: string
  bultos: number
  kg: number
  toneladas: number
  operacion: string // la tarifa aplicada (con o sin "Festivo")
  tarifa: number
  cobro: number
}

export interface PersonaTurno {
  persona: string
  puesto: string
  baseDia: number
  horasExtra: number // suma de horas_hed..horas_hn (cantidad)
  valorExtra: number // suma de hed..hn ($)
  dominical: number
  totalDia: number
  novedad: string | null
}

/**
 * Horas extra facturables de un PUESTO en un día. Se cobran TODAS las horas
 * (hed+hedf+hen+hef+hn) a `tarifahoraextra`, y COMPLETAS: a diferencia de la
 * vista legacy `facturacionturnos`, aquí NO se resta el 0,66 (ese descuento
 * venía de la jornada de 7,3333 h y quedó obsoleto con la de 7 h).
 */
export interface HoraExtraPuesto {
  puesto: string
  hed: number
  hedf: number
  hen: number
  hef: number
  hn: number
  horas: number // suma de los 5 tipos
  tarifa: number
  cobro: number
  costo: number // lo que cuesta esa hora extra en nómina ($)
  horasSolicitadas: number // solicitudesturnos aprobadas (tipo='Horas Extra')
  delta: number // horas − horasSolicitadas
}

export interface ConciliacionAvimolDia {
  fecha: string
  esFestivo: boolean
  motivoFestivo: string | null // "Domingo" | "Festivo de ley" | null
  tonEstibado: number
  tonSalvado: number
  tonTotal: number
  kgTotal: number
  cobroProduccion: number
  cobroHorasExtra: number
  cobroTotal: number
  horasExtraEjecutadas: number
  horasExtraSolicitadas: number
  pagoBase: number
  pagoRecargos: number // recargos de los turnos Estibado PT / Salvado
  pagoDominical: number
  // Costo de las horas extra de los DEMÁS puestos de Avimol. Va aparte para no
  // doble-contar: las de Estibado PT/Salvado ya están dentro de pagoRecargos.
  // Sin esto el margen quedaría inflado, porque se factura hora extra de
  // puestos cuyo costo no entraba al módulo.
  pagoHorasExtraOtros: number
  pagoTotal: number
  margen: number // cobroTotal − pagoTotal
  personas: number
  productos: ProductoConciliado[]
  detallePersonas: PersonaTurno[]
  detalleHorasExtra: HoraExtraPuesto[]
}

export interface AlertaAvimol {
  tipo: "lote_invalido" | "sin_tarifa" | "sin_liquidar" | "sin_solicitud" | "sin_tarifa_he" | "exceso_solicitud"
  detalle: string
}

export interface ConciliacionAvimolData {
  rango: { desde: string; hasta: string }
  resumen: {
    tonTotal: number
    kgTotal: number
    tonEstibado: number
    tonSalvado: number
    cobroProduccion: number
    cobroHorasExtra: number
    cobroTotal: number
    horasExtraEjecutadas: number
    horasExtraSolicitadas: number
    pagoBase: number
    pagoRecargos: number
    pagoHorasExtraOtros: number
    pagoTotal: number
    margen: number
    margenPct: number
    diasConDatos: number
    diasMargenNegativo: number
    personasDistintas: number
  }
  dias: ConciliacionAvimolDia[]
  alertas: AlertaAvimol[]
}

// ---------------------------------------------------------------------------
// Conciliación
// ---------------------------------------------------------------------------

export async function getConciliacionAvimol(
  desde: string,
  hasta: string,
): Promise<{ success: boolean; data?: ConciliacionAvimolData; message?: string }> {
  if (!desde || !hasta) return { success: false, message: "El rango de fechas es requerido." }
  if (desde > hasta) return { success: false, message: "La fecha 'desde' no puede ser mayor que 'hasta'." }
  try {
    const admin: any = await getSupabaseAdmin()
    const alertas: AlertaAvimol[] = []

    // -----------------------------------------------------------------------
    // 1) FESTIVOS del rango (domingo se calcula aparte, por fecha).
    // -----------------------------------------------------------------------
    const festivos = new Set<string>()
    {
      const { data } = await admin.from("festivos").select("fecha").gte("fecha", desde).lte("fecha", hasta)
      for (const f of data || []) festivos.add(String(f.fecha).slice(0, 10))
    }
    const infoFestivo = (fecha: string): { esFestivo: boolean; motivo: string | null } => {
      const [y, m, d] = fecha.split("-").map(Number)
      const esDomingo = new Date(y, m - 1, d).getDay() === 0
      if (esDomingo) return { esFestivo: true, motivo: "Domingo" }
      if (festivos.has(fecha)) return { esFestivo: true, motivo: "Festivo de ley" }
      return { esFestivo: false, motivo: null }
    }

    // -----------------------------------------------------------------------
    // 2) COBRO — ingresos de producción aprobados, fechados por LOTE.
    //    El lote es YYYYMMDD (texto): ordena lexicográficamente igual que
    //    cronológicamente, así que el rango se puede filtrar en la BD y de
    //    paso deja fuera los lotes que no son fecha.
    // -----------------------------------------------------------------------
    const loteDesde = desde.replace(/-/g, "")
    const loteHasta = hasta.replace(/-/g, "")
    const ingresos: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("invtrans")
        .select("id, idproducto, nombreproducto, cantidad, lote, fechaprod")
        .eq("idempresa", AVIMOL_IDEMPRESA)
        .eq("tipomov", "Entrada")
        .eq("status", "Aprobado")
        .ilike("origen", ORIGEN_INGRESO_PRODUCCION)
        .gte("lote", loteDesde)
        .lte("lote", loteHasta)
        .range(off, off + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      ingresos.push(...data)
      if (data.length < 1000) break
    }

    // Ingresos aprobados del rango cuyo LOTE no es una fecha parseable: el
    // filtro de arriba los deja fuera, así que se buscan por `fechaprod`
    // para que no queden invisibles (no suman al cobro, solo se alertan).
    {
      const { data } = await admin
        .from("invtrans")
        .select("id, nombreproducto, lote, fechaprod")
        .eq("idempresa", AVIMOL_IDEMPRESA)
        .eq("tipomov", "Entrada")
        .eq("status", "Aprobado")
        .ilike("origen", ORIGEN_INGRESO_PRODUCCION)
        .gte("fechaprod", desde)
        .lte("fechaprod", hasta)
        .range(0, 999)
      for (const r of data || []) {
        if (loteAFecha(r.lote) === null) {
          alertas.push({
            tipo: "lote_invalido",
            detalle: `Ingreso #${r.id} (${r.nombreproducto || "sin producto"}) con lote "${r.lote ?? ""}" no es una fecha YYYYMMDD — no se factura. Producción: ${String(r.fechaprod ?? "").slice(0, 10) || "—"}.`,
          })
        }
      }
    }

    // Peso unitario por producto (kg/bulto).
    const idsProducto = Array.from(
      new Set(ingresos.map((r) => r.idproducto).filter((x) => x != null).map((x) => Number(x))),
    )
    const pesoPorProducto = new Map<number, number>()
    for (let i = 0; i < idsProducto.length; i += 100) {
      const chunk = idsProducto.slice(i, i + 100)
      const { data } = await admin.from("productos").select("id, peso_unitkg").in("id", chunk)
      for (const p of data || []) pesoPorProducto.set(Number(p.id), num(p.peso_unitkg))
    }

    // Tarifas vigentes de las 4 operaciones.
    const { data: tarifas } = await admin
      .from("tarifasoperacion")
      .select("operacion, tarifa, fechainicio, fechafin")
      .eq("empresaid", AVIMOL_IDEMPRESA)
      .in("operacion", [OP_ESTIBADO, OP_ESTIBADO_FESTIVO, OP_SALVADO, OP_SALVADO_FESTIVO])

    // -----------------------------------------------------------------------
    // 3) PAGO — pagonomina de Avimol. Se trae SIN filtrar por puesto porque
    //    las horas extra se facturan de TODOS los puestos; el filtro a
    //    Estibado PT / Salvado se aplica después, solo para el bloque de
    //    turnos (que es lo que se cobra vía producción).
    // -----------------------------------------------------------------------
    const filasPago: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("pagonomina")
        .select(
          "fecha, persona, actividad_registrada, novedad_reportada, base_dia, total_recargos, hed, hedf, hen, hef, hn, horas_hed, horas_hedf, horas_hen, horas_hef, horas_hn, pago_domingo, recargodominical, total_liquidado_dia",
        )
        .eq("idempresa", AVIMOL_IDEMPRESA)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(off, off + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      filasPago.push(...data)
      if (data.length < 1000) break
    }

    // Tarifas de facturación de HORA EXTRA por puesto (maestro global).
    const { data: tarifasHE } = await admin
      .from("tarifasfacturacionturnos")
      .select("puesto, tarifahoraextra, fechainicio, fechafin")

    // Horas extra SOLICITADAS por el proyecto (Servicios Adicionales). Solo
    // las APROBADAS: una solicitud pendiente o rechazada no autoriza nada.
    // Para tipo='Horas Extra', `cantidad` son HORAS (para 'Turnos' son
    // personas, ver components/aprobar-turnos.tsx).
    const solicitadasPorFechaPuesto = new Map<string, number>()
    {
      const { data } = await admin
        .from("solicitudesturnos")
        .select("fecharequerida, puesto, cantidad, tipo, estado")
        .eq("idempresa", AVIMOL_IDEMPRESA)
        .eq("tipo", "Horas Extra")
        .eq("estado", "aprobado")
        .gte("fecharequerida", desde)
        .lte("fecharequerida", hasta)
        .range(0, 999)
      for (const s of data || []) {
        // TRIM + UPPER en ambos lados: el histórico de `puesto` se guardó como
        // texto libre sin normalizar (el desplegable estricto es reciente).
        const key = `${String(s.fecharequerida).slice(0, 10)}|${String(s.puesto || "").trim().toUpperCase()}`
        solicitadasPorFechaPuesto.set(key, (solicitadasPorFechaPuesto.get(key) || 0) + num(s.cantidad))
      }
    }

    // -----------------------------------------------------------------------
    // 4) Armar el día a día.
    // -----------------------------------------------------------------------
    const porFecha = new Map<string, ConciliacionAvimolDia>()
    const getDia = (fecha: string): ConciliacionAvimolDia => {
      if (!porFecha.has(fecha)) {
        const { esFestivo, motivo } = infoFestivo(fecha)
        porFecha.set(fecha, {
          fecha,
          esFestivo,
          motivoFestivo: motivo,
          tonEstibado: 0,
          tonSalvado: 0,
          tonTotal: 0,
          kgTotal: 0,
          cobroProduccion: 0,
          cobroHorasExtra: 0,
          cobroTotal: 0,
          horasExtraEjecutadas: 0,
          horasExtraSolicitadas: 0,
          pagoBase: 0,
          pagoRecargos: 0,
          pagoDominical: 0,
          pagoHorasExtraOtros: 0,
          pagoTotal: 0,
          margen: 0,
          personas: 0,
          productos: [],
          detallePersonas: [],
          detalleHorasExtra: [],
        })
      }
      return porFecha.get(fecha)!
    }

    // 4a) Cobro: agrupar por fecha(lote) + producto.
    const sinTarifa = new Set<string>()
    for (const r of ingresos) {
      const fecha = loteAFecha(r.lote)
      if (!fecha) {
        alertas.push({
          tipo: "lote_invalido",
          detalle: `Ingreso #${r.id} (${r.nombreproducto || "sin producto"}) con lote "${r.lote ?? ""}" no parseable — excluido del cobro.`,
        })
        continue
      }
      const dia = getDia(fecha)
      const peso = r.idproducto != null ? pesoPorProducto.get(Number(r.idproducto)) || 0 : 0
      const bultos = num(r.cantidad)
      const kg = bultos * peso
      const ton = kg / 1000
      const salvado = esSalvado(r.nombreproducto)
      const operacion = salvado
        ? dia.esFestivo
          ? OP_SALVADO_FESTIVO
          : OP_SALVADO
        : dia.esFestivo
          ? OP_ESTIBADO_FESTIVO
          : OP_ESTIBADO
      const tarifa = tarifaVigente(tarifas || [], operacion, fecha)
      if (tarifa === 0 && ton > 0) sinTarifa.add(`${operacion}|${fecha}`)
      const cobro = ton * tarifa

      const nombre = String(r.nombreproducto || "(sin producto)")
      const existente = dia.productos.find((p) => p.nombreproducto === nombre && p.operacion === operacion)
      if (existente) {
        existente.bultos += bultos
        existente.kg += kg
        existente.toneladas += ton
        existente.cobro += cobro
      } else {
        dia.productos.push({ nombreproducto: nombre, bultos, kg, toneladas: ton, operacion, tarifa, cobro })
      }

      if (salvado) dia.tonSalvado += ton
      else dia.tonEstibado += ton
      dia.tonTotal += ton
      dia.kgTotal += kg
      dia.cobroProduccion += cobro
    }
    for (const k of sinTarifa) {
      const [op, f] = k.split("|")
      alertas.push({
        tipo: "sin_tarifa",
        detalle: `Sin tarifa vigente en tarifasoperacion para "${op}" el ${f} (empresa Avimol) — ese tonelaje se cobra en $0.`,
      })
    }

    // 4b) Pago + horas extra. Dos ejes distintos sobre las mismas filas:
    //   · TURNOS (Estibado PT / Salvado): base + recargos + dominical. Es el
    //     costo del servicio que se cobra por producción.
    //   · HORAS EXTRA: de TODOS los puestos, para facturarlas. Las de los
    //     puestos que NO son de turno suman su costo aparte
    //     (`pagoHorasExtraOtros`), porque su base no entra a este módulo y sin
    //     ese costo el margen quedaría inflado.
    const personasPorDia = new Map<string, Set<string>>()
    // Acumulador de horas extra por (fecha, puesto) para agregarlas al final.
    const hePorFechaPuesto = new Map<
      string,
      { fecha: string; puesto: string; hed: number; hedf: number; hen: number; hef: number; hn: number; costo: number }
    >()

    for (const r of filasPago) {
      const fecha = String(r.fecha).slice(0, 10)
      const dia = getDia(fecha)
      const persona = String(r.persona || "").trim()
      const puesto = String(r.actividad_registrada || "").trim()
      const esTurnoConciliado = PUESTOS_TURNO.includes(puesto)

      const hed = num(r.horas_hed)
      const hedf = num(r.horas_hedf)
      const hen = num(r.horas_hen)
      const hef = num(r.horas_hef)
      const hn = num(r.horas_hn)
      const horasExtra = hed + hedf + hen + hef + hn
      const valorExtra = num(r.hed) + num(r.hedf) + num(r.hen) + num(r.hef) + num(r.hn)
      const dominical = num(r.pago_domingo) + num(r.recargodominical)
      const totalDia = num(r.total_liquidado_dia)
      // Base = total del día menos recargos y dominical (misma descomposición
      // que revision-nomina-actions.ts:280) para que base+extra+dom = total.
      const baseDia = Math.max(0, totalDia - valorExtra - dominical)

      // Horas extra facturables: de cualquier puesto con horas > 0.
      if (horasExtra > 0 && puesto) {
        const key = `${fecha}|${puesto.toUpperCase()}`
        if (!hePorFechaPuesto.has(key))
          hePorFechaPuesto.set(key, { fecha, puesto, hed: 0, hedf: 0, hen: 0, hef: 0, hn: 0, costo: 0 })
        const acc = hePorFechaPuesto.get(key)!
        acc.hed += hed
        acc.hedf += hedf
        acc.hen += hen
        acc.hef += hef
        acc.hn += hn
        acc.costo += valorExtra
      }

      if (esTurnoConciliado) {
        dia.detallePersonas.push({
          persona,
          puesto,
          baseDia,
          horasExtra,
          valorExtra,
          dominical,
          totalDia,
          novedad: String(r.novedad_reportada || "").trim() || null,
        })
        dia.pagoBase += baseDia
        dia.pagoRecargos += valorExtra
        dia.pagoDominical += dominical
        dia.pagoTotal += totalDia

        if (!personasPorDia.has(fecha)) personasPorDia.set(fecha, new Set())
        personasPorDia.get(fecha)!.add(persona.toUpperCase())
      } else if (valorExtra > 0) {
        // Puesto fuera del alcance de turnos: solo entra el COSTO de su hora
        // extra (su base la paga otro concepto, ajeno a esta conciliación).
        dia.pagoHorasExtraOtros += valorExtra
        dia.pagoTotal += valorExtra
      }
    }

    // 4b-bis) Valorizar las horas extra y cruzarlas contra lo solicitado.
    const sinTarifaHE = new Set<string>()
    for (const acc of hePorFechaPuesto.values()) {
      const dia = getDia(acc.fecha)
      const horas = acc.hed + acc.hedf + acc.hen + acc.hef + acc.hn
      const tarifa = tarifaHoraExtraVigente(tarifasHE || [], acc.puesto, acc.fecha)
      if (tarifa === 0 && horas > 0) sinTarifaHE.add(`${acc.puesto}|${acc.fecha}`)
      // Horas COMPLETAS: sin la resta de 0,66 de la vista legacy.
      const cobro = horas * tarifa
      const solicitadas = solicitadasPorFechaPuesto.get(`${acc.fecha}|${acc.puesto.toUpperCase()}`) || 0

      dia.detalleHorasExtra.push({
        puesto: acc.puesto,
        hed: acc.hed,
        hedf: acc.hedf,
        hen: acc.hen,
        hef: acc.hef,
        hn: acc.hn,
        horas,
        tarifa,
        cobro,
        costo: acc.costo,
        horasSolicitadas: solicitadas,
        delta: horas - solicitadas,
      })
      dia.cobroHorasExtra += cobro
      dia.horasExtraEjecutadas += horas
      dia.horasExtraSolicitadas += solicitadas

      if (solicitadas === 0 && horas > 0) {
        alertas.push({
          tipo: "sin_solicitud",
          detalle: `${acc.puesto} · ${acc.fecha}: se ejecutaron ${horas.toFixed(2)} h extra y se facturan, pero NO hay solicitud aprobada del proyecto (Servicios Adicionales, tipo "Horas Extra").`,
        })
      } else if (horas > solicitadas) {
        alertas.push({
          tipo: "exceso_solicitud",
          detalle: `${acc.puesto} · ${acc.fecha}: se ejecutaron ${horas.toFixed(2)} h extra pero el proyecto solicitó ${solicitadas.toFixed(2)} h (exceso de ${(horas - solicitadas).toFixed(2)} h).`,
        })
      }
    }
    for (const k of sinTarifaHE) {
      const [p, f] = k.split("|")
      alertas.push({
        tipo: "sin_tarifa_he",
        detalle: `Sin tarifa de hora extra vigente en tarifasfacturacionturnos para el puesto "${p}" el ${f} — esas horas se facturan en $0.`,
      })
    }

    // 4c) Alerta: gente con puesto de turno en asistencia que pagonomina NO
    //     liquidó como turno (falta tarifa de turno vigente — pagonomina hace
    //     INNER JOIN a tarifasturnos, ver pagonomina_reemplazo.sql:158).
    {
      const { data } = await admin
        .from("registroasistencia")
        .select("fecha, nombre, puesto")
        .eq("idempresa", AVIMOL_IDEMPRESA)
        .in("puesto", PUESTOS_TURNO)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(0, 999)
      for (const r of data || []) {
        const f = String(r.fecha).slice(0, 10)
        const nombre = String(r.nombre || "").trim()
        if (!nombre) continue
        if (!personasPorDia.get(f)?.has(nombre.toUpperCase())) {
          alertas.push({
            tipo: "sin_liquidar",
            detalle: `${nombre} figura en asistencia el ${f} con puesto "${r.puesto}" pero no aparece liquidado como turno en pagonomina — revisar tarifa de turno vigente.`,
          })
        }
      }
    }

    // -----------------------------------------------------------------------
    // 5) Cierre: márgenes, orden y resumen.
    // -----------------------------------------------------------------------
    for (const dia of porFecha.values()) {
      dia.cobroTotal = dia.cobroProduccion + dia.cobroHorasExtra
      dia.margen = dia.cobroTotal - dia.pagoTotal
      dia.personas = dia.detallePersonas.length
      dia.productos.sort((a, b) => b.toneladas - a.toneladas)
      dia.detallePersonas.sort((a, b) => a.persona.localeCompare(b.persona))
      dia.detalleHorasExtra.sort((a, b) => b.horas - a.horas)
    }
    const dias = Array.from(porFecha.values()).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

    const personasDistintas = new Set<string>()
    for (const s of personasPorDia.values()) for (const p of s) personasDistintas.add(p)

    const cobroProduccion = dias.reduce((a, d) => a + d.cobroProduccion, 0)
    const cobroHorasExtra = dias.reduce((a, d) => a + d.cobroHorasExtra, 0)
    const cobroTotal = cobroProduccion + cobroHorasExtra
    const pagoTotal = dias.reduce((a, d) => a + d.pagoTotal, 0)
    const data: ConciliacionAvimolData = {
      rango: { desde, hasta },
      resumen: {
        tonTotal: dias.reduce((a, d) => a + d.tonTotal, 0),
        kgTotal: dias.reduce((a, d) => a + d.kgTotal, 0),
        tonEstibado: dias.reduce((a, d) => a + d.tonEstibado, 0),
        tonSalvado: dias.reduce((a, d) => a + d.tonSalvado, 0),
        cobroProduccion,
        cobroHorasExtra,
        cobroTotal,
        horasExtraEjecutadas: dias.reduce((a, d) => a + d.horasExtraEjecutadas, 0),
        horasExtraSolicitadas: dias.reduce((a, d) => a + d.horasExtraSolicitadas, 0),
        pagoBase: dias.reduce((a, d) => a + d.pagoBase, 0),
        pagoRecargos: dias.reduce((a, d) => a + d.pagoRecargos, 0),
        pagoHorasExtraOtros: dias.reduce((a, d) => a + d.pagoHorasExtraOtros, 0),
        pagoTotal,
        margen: cobroTotal - pagoTotal,
        margenPct: cobroTotal > 0 ? ((cobroTotal - pagoTotal) / cobroTotal) * 100 : 0,
        diasConDatos: dias.length,
        diasMargenNegativo: dias.filter((d) => d.margen < 0).length,
        personasDistintas: personasDistintas.size,
      },
      dias,
      alertas,
    }
    return { success: true, data }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar la conciliación de Avimol." }
  }
}
