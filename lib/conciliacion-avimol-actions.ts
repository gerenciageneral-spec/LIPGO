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

export interface ConciliacionAvimolDia {
  fecha: string
  esFestivo: boolean
  motivoFestivo: string | null // "Domingo" | "Festivo de ley" | null
  tonEstibado: number
  tonSalvado: number
  tonTotal: number
  kgTotal: number
  cobro: number
  pagoBase: number
  pagoRecargos: number
  pagoDominical: number
  pagoTotal: number
  margen: number // cobro − pagoTotal
  personas: number
  productos: ProductoConciliado[]
  detallePersonas: PersonaTurno[]
}

export interface AlertaAvimol {
  tipo: "lote_invalido" | "sin_tarifa" | "sin_liquidar"
  detalle: string
}

export interface ConciliacionAvimolData {
  rango: { desde: string; hasta: string }
  resumen: {
    tonTotal: number
    kgTotal: number
    tonEstibado: number
    tonSalvado: number
    cobro: number
    pagoBase: number
    pagoRecargos: number
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
    // 3) PAGO — turnos de Estibado PT / Salvado liquidados en pagonomina.
    // -----------------------------------------------------------------------
    const filasPago: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("pagonomina")
        .select(
          "fecha, persona, actividad_registrada, novedad_reportada, base_dia, total_recargos, hed, hedf, hen, hef, hn, horas_hed, horas_hedf, horas_hen, horas_hef, horas_hn, pago_domingo, recargodominical, total_liquidado_dia",
        )
        .eq("idempresa", AVIMOL_IDEMPRESA)
        .in("actividad_registrada", PUESTOS_TURNO)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(off, off + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      filasPago.push(...data)
      if (data.length < 1000) break
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
          cobro: 0,
          pagoBase: 0,
          pagoRecargos: 0,
          pagoDominical: 0,
          pagoTotal: 0,
          margen: 0,
          personas: 0,
          productos: [],
          detallePersonas: [],
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
      dia.cobro += cobro
    }
    for (const k of sinTarifa) {
      const [op, f] = k.split("|")
      alertas.push({
        tipo: "sin_tarifa",
        detalle: `Sin tarifa vigente en tarifasoperacion para "${op}" el ${f} (empresa Avimol) — ese tonelaje se cobra en $0.`,
      })
    }

    // 4b) Pago: una fila por persona/día.
    const personasPorDia = new Map<string, Set<string>>()
    for (const r of filasPago) {
      const fecha = String(r.fecha).slice(0, 10)
      const dia = getDia(fecha)
      const persona = String(r.persona || "").trim()
      const horasExtra =
        num(r.horas_hed) + num(r.horas_hedf) + num(r.horas_hen) + num(r.horas_hef) + num(r.horas_hn)
      const valorExtra = num(r.hed) + num(r.hedf) + num(r.hen) + num(r.hef) + num(r.hn)
      const dominical = num(r.pago_domingo) + num(r.recargodominical)
      const totalDia = num(r.total_liquidado_dia)
      // Base = total del día menos recargos y dominical (misma descomposición
      // que revision-nomina-actions.ts:280) para que base+extra+dom = total.
      const baseDia = Math.max(0, totalDia - valorExtra - dominical)

      dia.detallePersonas.push({
        persona,
        puesto: String(r.actividad_registrada || ""),
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
      dia.margen = dia.cobro - dia.pagoTotal
      dia.personas = dia.detallePersonas.length
      dia.productos.sort((a, b) => b.toneladas - a.toneladas)
      dia.detallePersonas.sort((a, b) => a.persona.localeCompare(b.persona))
    }
    const dias = Array.from(porFecha.values()).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

    const personasDistintas = new Set<string>()
    for (const s of personasPorDia.values()) for (const p of s) personasDistintas.add(p)

    const cobro = dias.reduce((a, d) => a + d.cobro, 0)
    const pagoTotal = dias.reduce((a, d) => a + d.pagoTotal, 0)
    const data: ConciliacionAvimolData = {
      rango: { desde, hasta },
      resumen: {
        tonTotal: dias.reduce((a, d) => a + d.tonTotal, 0),
        kgTotal: dias.reduce((a, d) => a + d.kgTotal, 0),
        tonEstibado: dias.reduce((a, d) => a + d.tonEstibado, 0),
        tonSalvado: dias.reduce((a, d) => a + d.tonSalvado, 0),
        cobro,
        pagoBase: dias.reduce((a, d) => a + d.pagoBase, 0),
        pagoRecargos: dias.reduce((a, d) => a + d.pagoRecargos, 0),
        pagoTotal,
        margen: cobro - pagoTotal,
        margenPct: cobro > 0 ? ((cobro - pagoTotal) / cobro) * 100 : 0,
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
