"use server"

/**
 * Server actions del modulo "Liquidación Tolva del día" (Producción).
 *
 * Automatiza el último paso manual del flujo "Aprobación de ingreso de
 * producción → Continuar a Tolva" (production-entries-view.tsx + tolva.tsx):
 * toma las toneladas APROBADAS del día (invtrans, tipomov='Entrada',
 * status='Aprobado') y las reparte por TURNO (1/2, ver
 * registroasistencia.turno + programacion-turnos-actions.ts) según la hora
 * real de `creado`, y genera la orden de Tolva/Tolva f en cabeceraoc +
 * detalleoc con un click ("Registrar Tolva"), replicando EXACTAMENTE la
 * fórmula y el shape de `saveTolva` (lib/orders-actions.tsx:2783-2951) para
 * que el pago (pagonomina) y el cobro (facturacion) — que ya explotan
 * cabeceraoc.auxiliares / detalleoc.toneladas por tarifaspersonal /
 * tarifasoperacion — salgan idénticos a como saldrían si se hubiera hecho
 * a mano.
 *
 * Reglas de agrupación (confirmadas con el negocio):
 *  - Solo entran ingresos YA APROBADOS (status='Aprobado').
 *  - El DÍA de un ingreso = invtrans.fechaprod (fecha real de producción).
 *  - Dentro de ese día, el TURNO se determina por `invtrans.horaprod` — la
 *    HORA REAL DE PRODUCCIÓN, capturada en el formulario de Ingreso de
 *    Producción — cayendo en la ventana [horaInicio, horaFin) del Turno 1 o
 *    Turno 2 configurados en `horario_tolva` (botón "Horario de Tolva" en
 *    Programación de turnos) — ventana COMPARTIDA por día+empresa,
 *    independiente del horaentradaprogramada/horasalidaprogramada normal de
 *    cada persona (que sigue siendo para asistencia/horas extra).
 *  - La fecha en que se REGISTRÓ el ingreso (`creado`) ya NO influye. Antes
 *    sí: si `creado` caía en otro día que `fechaprod` el ingreso se marcaba
 *    "atrasado" y no se asignaba a ningún turno, así que la producción de un
 *    día registrada al día siguiente desaparecía de la liquidación y la
 *    pantalla exigía una "revisión manual" que no ofrecía cómo resolver.
 *  - Los ingresos anteriores a `horaprod` no la tienen; para esos se cae a la
 *    hora de `creado` (ya sin mirar la fecha) y se marcan como hora ESTIMADA.
 *  - Si la hora cae fuera de ambas ventanas (o no hay horario_tolva
 *    configurado ese día), el ingreso queda "sin turno" — requiere revisión.
 *  - `ordentolva IS NULL` excluye ingresos que YA se metieron a una Tolva
 *    (a mano o por este módulo), evitando duplicar si se vuelve a abrir
 *    la pantalla.
 *  - Las personas asignadas a cada turno salen de `registroasistencia.turno`
 *    (1/2, puesto="Auxiliar Mixto") — solo se usa el NOMBRE, no su horario
 *    individual.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getHorarioTolva } from "@/lib/horario-tolva-actions"

const ORIGEN_INGRESO_PRODUCCION = "%ingreso producci%"

/**
 * Excluye la produccion PROPIA de Harinera (genera inventario pero no se
 * liquida ni se factura).
 *
 * OJO con la forma: en Postgres `tipo_produccion <> 'Harinera'` es NULL para
 * las filas nulas, que quedarían EXCLUIDAS por error — y NULL es justamente el
 * valor de todo lo historico y de todo lo que sube el LOGO. Por eso el `is.null`
 * explicito.
 */
const EXCLUIR_HARINERA = "tipo_produccion.is.null,tipo_produccion.neq.Harinera"
const PUESTO_AUXILIAR_MIXTO = "Auxiliar Mixto"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface TurnoVentanaInterna {
  horaInicio: string | null
  horaFin: string | null
  personas: string[]
}

export interface LineaProducto {
  idproducto: number | null
  codproducto: string
  nombreproducto: string
  cantidad: number
  toneladas: number
}

export interface IngresoPendienteRevision {
  id: number
  codproducto: string
  nombreproducto: string
  cantidad: number
  creado: string
  fechaprod: string
  /**
   * Ya no existe el motivo "atrasado": que el ingreso se haya REGISTRADO otro
   * dia dejo de descartarlo, porque el turno se decide con la hora real de
   * produccion (`horaprod`) y no con la de registro.
   */
  motivo: "sin_turno"
  /** Hora que se uso para intentar ubicarlo, "HH:MM". */
  horaUsada: string
  /** true cuando la hora salio de `creado` porque el ingreso no tiene `horaprod`. */
  horaEstimada: boolean
}

export interface TurnoPreview {
  turno: 1 | 2
  horaInicio: string | null
  horaFin: string | null
  personas: string[]
  lineas: LineaProducto[]
  totalToneladas: number
  invtransIds: number[]
}

export interface LiquidacionTolvaDia {
  fecha: string
  idempresa: number
  tipoOperacion: "Tolva" | "Tolva f"
  turnos: TurnoPreview[]
  pendientes: IngresoPendienteRevision[]
  puedeRegistrar: boolean
}

// ---------------------------------------------------------------------------
// Helpers de fecha/hora (America/Bogota)
// ---------------------------------------------------------------------------

/** Fecha (YYYY-MM-DD) y minutos-desde-medianoche de un ISO timestamp, en hora de Bogotá. */
function bogotaParts(iso: string): { fecha: string; minutos: number } {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00"
  return {
    fecha: `${get("year")}-${get("month")}-${get("day")}`,
    minutos: Number(get("hour")) * 60 + Number(get("minute")),
  }
}

/** "HH:MM" o "HH:MM:SS" -> minutos desde medianoche. */
function horaAMinutos(t: string | null | undefined): number | null {
  if (!t) return null
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Inverso de `horaAMinutos`: 485 -> "08:05". Para mostrar la hora usada. */
function minutosAHora(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** ¿`minutos` cae dentro de [inicio,fin)? Soporta ventanas que cruzan medianoche. */
function dentroDeVentana(minutos: number, inicio: number, fin: number): boolean {
  if (fin > inicio) return minutos >= inicio && minutos < fin
  if (fin < inicio) return minutos >= inicio || minutos < fin
  return false
}

/** Domingo (Ley) -> "Tolva f"; el resto -> "Tolva". Mismo criterio que `saveTolva`. */
function tipoOperacionTolva(fechaISO: string): "Tolva" | "Tolva f" {
  const [y, m, d] = fechaISO.split("-").map(Number)
  if (!y || !m || !d) return "Tolva"
  return new Date(y, m - 1, d).getDay() === 0 ? "Tolva f" : "Tolva"
}

// ---------------------------------------------------------------------------
// Preview del día
// ---------------------------------------------------------------------------

export async function getLiquidacionTolvaDia(
  fecha: string,
  idempresa: number,
): Promise<{ success: boolean; data?: LiquidacionTolvaDia; message?: string }> {
  if (!fecha || !idempresa) return { success: false, message: "Fecha y empresa son requeridas." }
  try {
    const admin: any = await getSupabaseAdmin()

    // 1) Ventana COMPARTIDA de Turno 1 / Turno 2 (horario_tolva, botón "Horario
    //    de Tolva" en Programación de turnos) — independiente del horario
    //    normal de cada persona. Las PERSONAS de cada turno sí salen de
    //    registroasistencia.turno (solo el nombre, no su horaentrada/salida).
    const horarioRes = await getHorarioTolva(idempresa, fecha)
    if (!horarioRes.success || !horarioRes.data) return { success: false, message: horarioRes.message }
    const horario = horarioRes.data

    const { data: prog, error: errProg } = await admin
      .from("registroasistencia")
      .select("nombre, turno")
      .eq("fecha", fecha)
      .eq("idempresa", idempresa)
      .eq("puesto", PUESTO_AUXILIAR_MIXTO)
      .in("turno", [1, 2])
    if (errProg) return { success: false, message: errProg.message }

    const ventanas = new Map<number, TurnoVentanaInterna>([
      [1, { horaInicio: horario.turno1.horaInicio, horaFin: horario.turno1.horaFin, personas: [] }],
      [2, { horaInicio: horario.turno2.horaInicio, horaFin: horario.turno2.horaFin, personas: [] }],
    ])
    for (const r of prog || []) {
      const t = Number(r.turno)
      if (t !== 1 && t !== 2) continue
      const v = ventanas.get(t)!
      const nombre = String(r.nombre || "").trim()
      if (nombre && !v.personas.includes(nombre)) v.personas.push(nombre)
    }

    // 2) Ingresos APROBADOS de ese día (fechaprod=fecha) sin Tolva asignada.
    const { data: ingresos, error: errIng } = await admin
      .from("invtrans")
      .select("id, idproducto, codproducto, nombreproducto, cantidad, creado, fechaprod, horaprod")
      .eq("tipomov", "Entrada")
      .eq("status", "Aprobado")
      .eq("idempresa", idempresa)
      .eq("fechaprod", fecha)
      .ilike("origen", ORIGEN_INGRESO_PRODUCCION)
      .is("ordentolva", null)
      // La produccion PROPIA de Harinera genera inventario pero no se liquida
      // ni se factura. NULL = LIP (historico y lo que sube el LOGO).
      .or(EXCLUIR_HARINERA)
    if (errIng) return { success: false, message: errIng.message }

    // 3) Pesos por producto (peso_unitkg) para la conversión bultos->toneladas
    //    (misma fórmula exacta que saveTolva: cantidad × peso_unitkg / 1000).
    const idsProducto = Array.from(
      new Set((ingresos || []).map((r: any) => r.idproducto).filter((x: any) => x != null)),
    )
    const pesoPorProducto = new Map<number, number>()
    if (idsProducto.length > 0) {
      const { data: productos } = await admin.from("productos").select("id, peso_unitkg").in("id", idsProducto)
      for (const p of productos || []) pesoPorProducto.set(Number(p.id), Number(p.peso_unitkg) || 0)
    }

    // 4) Clasificar cada ingreso: turno 1 / turno 2 / sin_turno.
    const pendientes: IngresoPendienteRevision[] = []
    const porTurno = new Map<number, { lineas: Map<string, LineaProducto>; ids: number[] }>([
      [1, { lineas: new Map(), ids: [] }],
      [2, { lineas: new Map(), ids: [] }],
    ])

    for (const r of ingresos || []) {
      const cantidad = Number(r.cantidad) || 0

      // El turno se decide con la HORA REAL DE PRODUCCION (`horaprod`), que se
      // captura en el formulario de Ingreso de Producción. La fecha en que se
      // REGISTRO el ingreso ya no importa: antes, si `creado` caia en otro dia
      // que `fechaprod`, el ingreso se marcaba "atrasado" y desaparecia de la
      // liquidacion — la produccion de un dia registrada al dia siguiente no
      // se podia liquidar y la pantalla no ofrecia como resolverlo.
      //
      // Los ingresos anteriores a este cambio no tienen `horaprod`; para esos
      // se cae a la hora de `creado` (ya sin mirar la fecha) y se marcan como
      // hora ESTIMADA, para que se puedan verificar en vez de bloquear.
      const minutosProd = horaAMinutos(r.horaprod)
      const horaEstimada = minutosProd == null
      const minutos = horaEstimada ? bogotaParts(r.creado).minutos : minutosProd!

      let turnoAsignado: number | null = null
      for (const t of [1, 2]) {
        const v = ventanas.get(t)!
        const ini = horaAMinutos(v.horaInicio)
        const fin = horaAMinutos(v.horaFin)
        if (ini == null || fin == null) continue
        if (dentroDeVentana(minutos, ini, fin)) {
          turnoAsignado = t
          break
        }
      }
      if (turnoAsignado == null) {
        pendientes.push({
          id: r.id,
          codproducto: r.codproducto,
          nombreproducto: r.nombreproducto,
          cantidad,
          creado: r.creado,
          fechaprod: r.fechaprod,
          motivo: "sin_turno",
          horaUsada: minutosAHora(minutos),
          horaEstimada,
        })
        continue
      }
      const bucket = porTurno.get(turnoAsignado)!
      bucket.ids.push(r.id)
      const key = `${r.idproducto}|${r.codproducto}`
      const pesoUnit = r.idproducto != null ? pesoPorProducto.get(Number(r.idproducto)) || 0 : 0
      const existente = bucket.lineas.get(key)
      if (existente) {
        existente.cantidad += cantidad
        existente.toneladas += (cantidad * pesoUnit) / 1000
      } else {
        bucket.lineas.set(key, {
          idproducto: r.idproducto != null ? Number(r.idproducto) : null,
          codproducto: r.codproducto,
          nombreproducto: r.nombreproducto,
          cantidad,
          toneladas: (cantidad * pesoUnit) / 1000,
        })
      }
    }

    const turnos: TurnoPreview[] = [1, 2].map((t) => {
      const v = ventanas.get(t)!
      const bucket = porTurno.get(t)!
      const lineas = Array.from(bucket.lineas.values())
      return {
        turno: t as 1 | 2,
        horaInicio: v.horaInicio,
        horaFin: v.horaFin,
        personas: v.personas,
        lineas,
        totalToneladas: lineas.reduce((a, l) => a + l.toneladas, 0),
        invtransIds: bucket.ids,
      }
    })

    return {
      success: true,
      data: {
        fecha,
        idempresa,
        tipoOperacion: tipoOperacionTolva(fecha),
        turnos,
        pendientes,
        puedeRegistrar: pendientes.length === 0,
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar la liquidación de tolva." }
  }
}

// ---------------------------------------------------------------------------
// Registrar Tolva del turno
// ---------------------------------------------------------------------------

export async function registrarTolvaTurno(
  fecha: string,
  idempresa: number,
  turno: 1 | 2,
): Promise<{ success: boolean; message?: string; id?: number; ordendecargue?: string; toneladas?: number }> {
  if (!fecha || !idempresa || !turno) return { success: false, message: "Datos incompletos." }
  try {
    const admin: any = await getSupabaseAdmin()

    // Recalcula el preview (no confía en lo que el cliente tenía en pantalla,
    // para evitar condiciones de carrera con nuevas aprobaciones/turnos).
    const preview = await getLiquidacionTolvaDia(fecha, idempresa)
    if (!preview.success || !preview.data) return { success: false, message: preview.message }
    if (preview.data.pendientes.length > 0) {
      return {
        success: false,
        message: `Hay ${preview.data.pendientes.length} ingreso(s) cuya hora no cae en ninguna ventana de turno — resuélvelos antes de registrar.`,
      }
    }
    const turnoData = preview.data.turnos.find((t) => t.turno === turno)
    if (!turnoData || turnoData.lineas.length === 0) {
      return { success: false, message: "No hay ingresos aprobados para este turno." }
    }

    const tipoOperacion = preview.data.tipoOperacion

    const { data: lastHeader, error: errHeader } = await admin
      .from("cabeceraoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (errHeader) return { success: false, message: errHeader.message }
    const nextId = lastHeader ? (lastHeader.id || 0) + 1 : 1

    const auxiliaresStr = turnoData.personas.join(", ")
    const totalToneladas = turnoData.totalToneladas
    const horaFin = `${turnoData.horaFin || "23:59"}:00`

    const { error: errInsertHeader } = await admin.from("cabeceraoc").insert({
      id: nextId,
      idempresa,
      ordendecargue: `Tolva${nextId}`,
      fechaorden: fecha,
      tipooperacion: tipoOperacion,
      auxiliares: auxiliaresStr,
      status: "finalizado",
      pesoorden: totalToneladas,
      pesovascula: totalToneladas,
      fechacargue: fecha,
      fincargue: horaFin,
      horalote: horaFin,
    })
    if (errInsertHeader) return { success: false, message: `Error al crear cabecera: ${errInsertHeader.message}` }

    const { data: lastDetail, error: errDetail } = await admin
      .from("detalleoc")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (errDetail) return { success: false, message: errDetail.message }
    let nextDetailId = lastDetail ? (lastDetail.id || 0) + 1 : 1

    const detalles = turnoData.lineas.map((l) => ({
      id: nextDetailId++,
      idorden: nextId,
      numeroorden: `Tolva${nextId}`,
      producto: l.nombreproducto,
      cantidad: l.cantidad,
      toneladas: l.toneladas,
    }))
    if (detalles.length > 0) {
      const { error: errInsertDetalle } = await admin.from("detalleoc").insert(detalles)
      if (errInsertDetalle) return { success: false, message: `Error al crear detalles: ${errInsertDetalle.message}` }
    }

    if (turnoData.invtransIds.length > 0) {
      const { error: errUpdate } = await admin
        .from("invtrans")
        .update({ ordentolva: `Tolva${nextId}` })
        .in("id", turnoData.invtransIds)
      if (errUpdate) {
        return {
          success: true,
          id: nextId,
          ordendecargue: `Tolva${nextId}`,
          toneladas: totalToneladas,
          message: `Tolva creada, pero falló vincular ingresos: ${errUpdate.message}`,
        }
      }
    }

    return { success: true, id: nextId, ordendecargue: `Tolva${nextId}`, toneladas: totalToneladas }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al registrar la tolva." }
  }
}

// ---------------------------------------------------------------------------
// Auditoría: pago (nómina) vs cobro (facturación) vs entrega real (invtrans)
// ---------------------------------------------------------------------------

// Tolerancia de redondeo (bultos→toneladas, varios productos) antes de marcar
// una fecha como discrepancia real entre lo entregado y lo facturado.
const TOLERANCIA_TONELADAS = 0.05

export interface AuditoriaTolvaDia {
  fecha: string
  entregaToneladas: number
  facturadoToneladas: number
  diferenciaToneladas: number // entrega − facturado (con signo)
  discrepancia: boolean
  pago: number
  cobro: number
  ordenesSinPersonal: number
}

export async function getAuditoriaTolva(
  desde: string,
  hasta: string,
  idempresa: number,
): Promise<{ success: boolean; data: AuditoriaTolvaDia[]; message?: string }> {
  if (!desde || !hasta || !idempresa)
    return { success: false, data: [], message: "Rango de fechas y empresa son requeridos." }
  try {
    const admin: any = await getSupabaseAdmin()

    // 1) Entrega real: invtrans aprobados del rango, agrupados por fechaprod.
    const { data: ingresos, error: errIng } = await admin
      .from("invtrans")
      .select("idproducto, cantidad, fechaprod")
      .eq("tipomov", "Entrada")
      .eq("status", "Aprobado")
      .eq("idempresa", idempresa)
      .gte("fechaprod", desde)
      .lte("fechaprod", hasta)
      .ilike("origen", ORIGEN_INGRESO_PRODUCCION)
      // Misma exclusion que el preview. Sin esto la produccion de Harinera
      // aparecería para siempre como diferencia entre lo aprobado y lo
      // facturado, porque nunca va a tener una orden de Tolva.
      .or(EXCLUIR_HARINERA)
    if (errIng) return { success: false, data: [], message: errIng.message }

    const idsProducto = Array.from(
      new Set((ingresos || []).map((r: any) => r.idproducto).filter((x: any) => x != null)),
    )
    const pesoPorProducto = new Map<number, number>()
    if (idsProducto.length > 0) {
      const { data: productos } = await admin.from("productos").select("id, peso_unitkg").in("id", idsProducto)
      for (const p of productos || []) pesoPorProducto.set(Number(p.id), Number(p.peso_unitkg) || 0)
    }
    const entregaPorFecha = new Map<string, number>()
    for (const r of ingresos || []) {
      const peso = r.idproducto != null ? pesoPorProducto.get(Number(r.idproducto)) || 0 : 0
      const ton = ((Number(r.cantidad) || 0) * peso) / 1000
      const f = String(r.fechaprod).slice(0, 10)
      entregaPorFecha.set(f, (entregaPorFecha.get(f) || 0) + ton)
    }

    // 2) Órdenes de Tolva/Tolva f del rango (pago + cobro nacen de aquí).
    const { data: ordenes, error: errOrd } = await admin
      .from("cabeceraoc")
      .select("id, fechaorden, tipooperacion, auxiliares, pesoorden, pesovascula")
      .eq("idempresa", idempresa)
      .in("tipooperacion", ["Tolva", "Tolva f"])
      .gte("fechaorden", desde)
      .lte("fechaorden", hasta)
    if (errOrd) return { success: false, data: [], message: errOrd.message }

    const idsOrden = (ordenes || []).map((o: any) => o.id)
    const toneladasPorOrden = new Map<number, number>()
    if (idsOrden.length > 0) {
      const { data: detalles } = await admin.from("detalleoc").select("idorden, toneladas").in("idorden", idsOrden)
      for (const d of detalles || []) {
        toneladasPorOrden.set(
          Number(d.idorden),
          (toneladasPorOrden.get(Number(d.idorden)) || 0) + (Number(d.toneladas) || 0),
        )
      }
    }

    const { data: tarifasPersonal } = await admin
      .from("tarifaspersonal")
      .select("operacion, tarifa, fechaini, fechafin")
      .eq("empresaid", idempresa)
      .in("operacion", ["Tolva", "Tolva f"])
    const { data: tarifasOperacion } = await admin
      .from("tarifasoperacion")
      .select("operacion, tarifa, fechainicio, fechafin")
      .eq("empresaid", idempresa)
      .in("operacion", ["Tolva", "Tolva f"])

    function tarifaVigente(tarifas: any[], operacion: string, fecha: string, colDesde: string, colHasta: string): number {
      const fila = (tarifas || []).find(
        (t) => t.operacion === operacion && String(t[colDesde]).slice(0, 10) <= fecha && String(t[colHasta]).slice(0, 10) >= fecha,
      )
      return fila ? Number(fila.tarifa) || 0 : 0
    }

    const porFecha = new Map<string, AuditoriaTolvaDia>()
    const getRow = (f: string): AuditoriaTolvaDia => {
      if (!porFecha.has(f))
        porFecha.set(f, {
          fecha: f,
          entregaToneladas: 0,
          facturadoToneladas: 0,
          diferenciaToneladas: 0,
          discrepancia: false,
          pago: 0,
          cobro: 0,
          ordenesSinPersonal: 0,
        })
      return porFecha.get(f)!
    }
    for (const [f, ton] of entregaPorFecha) getRow(f).entregaToneladas += ton

    for (const o of ordenes || []) {
      const f = String(o.fechaorden).slice(0, 10)
      const row = getRow(f)
      const toneladas = toneladasPorOrden.get(Number(o.id)) ?? (Number(o.pesovascula) || Number(o.pesoorden) || 0)
      const tieneAuxiliares = String(o.auxiliares || "").trim().length > 0
      const tarifaPago = tarifaVigente(tarifasPersonal || [], o.tipooperacion, f, "fechaini", "fechafin")
      const tarifaCobro = tarifaVigente(tarifasOperacion || [], o.tipooperacion, f, "fechainicio", "fechafin")
      row.pago += tieneAuxiliares ? toneladas * tarifaPago : 0
      row.cobro += toneladas * tarifaCobro
      // Toneladas FACTURADAS = mismas toneladas de detalleoc que valorizan el
      // cobro (Σ detalleoc.toneladas de las órdenes Tolva/Tolva f del día) —
      // es la comparación pedida: lo entregado (invtrans) vs. lo facturado.
      row.facturadoToneladas += toneladas
      if (!tieneAuxiliares) row.ordenesSinPersonal += 1
    }

    // Diferencia + alerta de discrepancia (entrega vs. facturado), con
    // tolerancia de redondeo por conversión bultos→toneladas.
    for (const row of porFecha.values()) {
      row.diferenciaToneladas = row.entregaToneladas - row.facturadoToneladas
      row.discrepancia = Math.abs(row.diferenciaToneladas) > TOLERANCIA_TONELADAS
    }

    const data = Array.from(porFecha.values()).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    return { success: true, data }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al calcular la auditoría." }
  }
}
