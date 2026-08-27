"use server"

// Centro de Coordinación (Operación LIP): pantalla única del coordinador que
// une la gestión hoy dispersa entre Picking (Cargue), Packing (Descargue/
// Distribución) y el control de muelles/SLA/ritmo. NO reimplementa esas
// acciones: llama a las mismas funciones de picking-actions.ts/
// packing-actions.ts/orders-actions.tsx que ya usan esas pantallas, para que
// nunca diverjan. Lo nuevo aquí es el `muelle` REAL (antes simulado en
// control-toneladas-actions.ts) y la vista unificada de los 3 tipos de
// operación con SLA/ritmo/proyección ya construidos.

import { createClient } from "@/lib/supabase-client"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getColombiaDateTime } from "@/lib/date-utils"
import { pesoBaseCalculo, excluirAvimolDistribucion } from "@/lib/nomina-calculo-utils"
import { getSlaCargueMin } from "@/lib/sla-acordados"
import {
  TON_MES_CARGUE_DESCARGUE,
  DIAS_OPERACION_MES,
  duracionHoras,
  esPuestoCargueDescargue,
} from "@/lib/meta-productividad-utils"
import { cargarMuellesEmpresa, getMuellesEmpresaSync } from "@/lib/muelles-empresa"
import { generatePickingPDF, getCarguDescarguePersonnel } from "@/lib/picking-actions"
import { generatePackingPDF, getPackingItems } from "@/lib/packing-actions"
import { updateOrderInitioCargue } from "@/lib/orders-actions"
// Las pausas viven en picking-actions porque nacieron ahí, pero son de la
// ORDEN (tabla `pausas`), no exclusivas de Cargue — mismo criterio que ya
// usa components/packing.tsx.
import { getOrdenesPausadas } from "@/lib/picking-actions"

const num = (v: any) => Number(v || 0)
const round1 = (v: number) => Math.round(v * 10) / 10
const round2 = (v: number) => Math.round(v * 100) / 100

export type TipoOperacion = "Cargue" | "Descargue" | "Distribucion"

export interface OrdenOperativa {
  orderId: number
  ordendecargue: string
  tipooperacion: TipoOperacion
  cliente: string
  placa: string | null
  conductor: string | null
  muelle: number | null
  auxiliares: string[]
  facturar: boolean | null
  /** Modo de pago elegido: 'individual' respeta `auxiliares` tal cual; 'global' se recalcula al cerrar. Obligatorio antes de cerrar. */
  tipoPago: "global" | "individual" | null
  pesoorden: number
  pesovascula: number | null
  iniciocargue: string | null
  fincargue: string | null
  tipovehiculo: string | null
  /** citasvehiculos.capacidad — capacidad real del vehículo (t), null si no hay cita asociada. */
  capacidadVehiculo: number | null
  slaMin: number | null
  pausado: boolean
  lineasTotal: number
  /** null = este tipo de operación no tiene estado por línea (Descargue/Distribución usan detalleoc a granel). */
  lineasAprobadas: number | null
  minutosTranscurridos: number | null
  slaVencido: boolean
  /** true = aún dentro del SLA pero le queda poco margen (≤20%) — aviso temprano antes de vencer. */
  slaEnRiesgo: boolean
  estado: "alistando" | "cargando" | "pausado"
}

export interface MuelleSlot {
  muelle: number
  orden: OrdenOperativa | null
}

export interface CentroCoordinacionKpis {
  cargadoHoyTon: number
  metaTonDia: number
  ritmoTonHora: number
  capacidadTonHora: number
  slaCumplimientoPct: number | null
  ordenesEnRiesgo: number
  ordenesActivas: number
  personalEnPiso: number
  personalAsignado: number
  personalDisponible: number
  muellesOcupados: number
  muellesTotal: number
  proyeccionHoraFinCola: string | null
  /** Toneladas cerradas AYER a esta misma hora (mismo corte de reloj) — comparación "vs. ayer". */
  cargadoAyerMismaHoraTon: number
  /** % de diferencia hoy vs ayer a esta hora; null si ayer no tuvo nada que comparar. */
  vsAyerPct: number | null
  /** Meta ton/hora POR TRABAJADOR — insumo para la sugerencia "reforzar con auxiliar" (cuánto sube el ritmo al agregar 1 más). */
  metaPorHoraTrabajador: number
  /** Lo que ya se debería haber cargado a esta hora, según horas de personal realmente trabajadas — mismo cálculo que "Avance en Vivo". */
  metaEsperadaAhoraTon: number
  estadoTurno: "adelantado" | "cerca" | "atrasado" | "sin_datos"
}

export interface ColaPatioItem {
  placa: string
  tipovehiculo: string | null
  horallegada: string | null
}

export interface SugerenciaTurno {
  muelle: number
  placa: string
  tipovehiculo: string | null
}

export interface CentroCoordinacionData {
  idempresa: number
  fecha: string
  horaActual: string
  kpis: CentroCoordinacionKpis
  muelles: MuelleSlot[]
  colaSinMuelle: OrdenOperativa[]
  colaPatio: ColaPatioItem[]
  personalDisponibleLista: { id: number; nombreempleado: string }[]
  /** Próximo vehículo de patio sugerido para el primer muelle libre (mismo tipo si hay match, si no el más antiguo). */
  sugerenciaProximoTurno: SugerenciaTurno | null
  /** Ya está cargando (iniciocargue puesto) pero sin muelle asignado — alerta inmediata, sin esperar los 15 min. */
  alertaCargandoSinMuelle: OrdenOperativa[]
  /** Asignaciones que el sistema acaba de hacer solo en ESTA consulta (≥15 min sin muelle + libre disponible) — para avisar una sola vez en el cliente. */
  autoAsignaciones: { ordendecargue: string; placa: string | null; muelle: number }[]
}

/** SLA de respaldo (minutos) cuando no se pudo determinar el tipo de vehículo. */
const SLA_FALLBACK_MIN = 60

function fmtHoraDesdeMin(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60) % 24
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

async function fechaHoyColombia(): Promise<string> {
  const dt: any = await getColombiaDateTime()
  return dt.toLocaleDateString("en-CA")
}

export async function getCentroCoordinacion(
  idempresa: number,
  fecha?: string,
): Promise<{ success: boolean; data?: CentroCoordinacionData; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const fechaConsulta = fecha || (await fechaHoyColombia())

    const horaActual = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date())
    const [hNow, mNow] = horaActual.split(":").map(Number)
    const minAhora = hNow * 60 + (mNow || 0)

    const metaTonDia = (TON_MES_CARGUE_DESCARGUE[idempresa] || 0) / DIAS_OPERACION_MES
    await cargarMuellesEmpresa()
    const muelleNumeros = getMuellesEmpresaSync(idempresa)
    const N = muelleNumeros.length || 1

    // 1) Headcount real de hoy (mismo criterio que Avance en Vivo).
    const { data: filas } = await admin
      .from("registroasistencia")
      .select("nombre, puesto, horaingreso, horaentradaprogramada, horasalidaprogramada")
      .eq("idempresa", idempresa)
      .eq("fecha", fechaConsulta)
      .not("puesto", "is", null)
      .not("horaingreso", "is", null)

    let headcountReal = 0
    let horasProgramadasTotales = 0
    let horasTranscurridas = 0
    let minEntradaMasTemprana: number | null = null
    for (const r of filas || []) {
      if (!esPuestoCargueDescargue(idempresa, r.puesto)) continue
      if (String(r.nombre || "").trim().toUpperCase() === "SIN AUXILIAR") continue
      headcountReal += 1
      if (!r.horaentradaprogramada) continue
      const [he, me] = String(r.horaentradaprogramada).split(":").map(Number)
      const minEntrada = he * 60 + (me || 0)
      if (minEntradaMasTemprana === null || minEntrada < minEntradaMasTemprana) minEntradaMasTemprana = minEntrada
      let minSalidaProgramada = minEntrada
      if (r.horasalidaprogramada) {
        const horasGross = duracionHoras(String(r.horaentradaprogramada), String(r.horasalidaprogramada))
        minSalidaProgramada = horasGross * 60 + minEntrada
        horasProgramadasTotales += Math.max(0, horasGross - 1)
      }
      const minTope = Math.min(minAhora, minSalidaProgramada)
      if (minTope > minEntrada) horasTranscurridas += (minTope - minEntrada) / 60
    }
    const metaPorHora = horasProgramadasTotales > 0 ? metaTonDia / horasProgramadasTotales : 0
    const capacidadTonHora = headcountReal * metaPorHora
    const horasCalendarioTranscurridas =
      minEntradaMasTemprana !== null ? Math.max(0, (minAhora - minEntradaMasTemprana) / 60) : 0

    // 2) Órdenes de hoy (los 3 tipos, se filtra por UI si aplica — el
    //    KPI siempre suma los 3 porque los muelles son compartidos).
    const { data: ordenesRaw } = await admin
      .from("cabeceraoc")
      .select(
        "id, ordendecargue, tipooperacion, muelle, auxiliares, facturar, pesoorden, pesovascula, iniciocargue, fincargue, placa, conductor, horalote, tipo_pago",
      )
      .eq("idempresa", idempresa)
      .eq("fechacargue", fechaConsulta)

    const todasOrdenes = ordenesRaw || []
    // Cargue requiere vehículo (placa) Y lote asignados para empezar a
    // operarse — mismo filtro real que ya usa Picking para lote
    // (getPendingLoadOrders: .not("horalote","is",null)). En la práctica el
    // lote, al aprobarse, ya exige que la placa esté asignada (ver
    // lib/batch-actions.ts), pero se encontró al menos una orden real con
    // horalote seteado y placa NULL (dato viejo, previo a que esa regla
    // quedara firme) que sí quedaba asignable a muelle sin vehículo — por
    // eso se exige `placa` explícitamente además de `horalote`, no se confía
    // en que uno implique el otro. Descargue/Distribución no tienen ese gate
    // en Packing, así que acá tampoco se les agrega uno nuevo.
    const ordenesActivasRaw = todasOrdenes.filter(
      (o: any) => !o.fincargue && (o.tipooperacion !== "Cargue" || (o.horalote && o.placa)),
    )
    const orderIdsActivas = ordenesActivasRaw.map((o: any) => o.id)
    const ordendecargueCargueActivas = ordenesActivasRaw
      .filter((o: any) => o.tipooperacion === "Cargue")
      .map((o: any) => o.ordendecargue)

    // 3) Cliente + conteo de líneas por orden (detalleoc, 1 sola consulta para todas).
    const clientePorOrden = new Map<number, string>()
    const lineasDetalleocPorOrden = new Map<number, number>()
    if (orderIdsActivas.length > 0) {
      const { data: detalles } = await admin.from("detalleoc").select("idorden, cliente").in("idorden", orderIdsActivas)
      for (const d of detalles || []) {
        if (!clientePorOrden.has(d.idorden)) clientePorOrden.set(d.idorden, d.cliente || "Sin cliente")
        lineasDetalleocPorOrden.set(d.idorden, (lineasDetalleocPorOrden.get(d.idorden) || 0) + 1)
      }
    }

    // 4) Líneas de invtrans (Cargue): total y aprobadas por ordendecargue.
    const lineasInvtransPorOrden = new Map<string, { total: number; aprobadas: number }>()
    if (ordendecargueCargueActivas.length > 0) {
      const { data: filasInv } = await admin
        .from("invtrans")
        .select("ocargue, status")
        .in("ocargue", ordendecargueCargueActivas)
      for (const f of filasInv || []) {
        const acc = lineasInvtransPorOrden.get(f.ocargue) || { total: 0, aprobadas: 0 }
        acc.total += 1
        if (String(f.status || "").toLowerCase() === "aprobado") acc.aprobadas += 1
        lineasInvtransPorOrden.set(f.ocargue, acc)
      }
    }

    // 5) Tipo y capacidad de vehículo por orden (citasvehiculos, para el SLA
    //    acordado y para la barra de toneladas contra la capacidad real).
    const { data: citasHoy } = await admin
      .from("citasvehiculos")
      .select("placa, tipovehiculo, capacidad, ocargue, horallegada")
      .eq("idempresa", idempresa)
      .eq("fechallegada", fechaConsulta)
    const tipoPorOrden = new Map<string, string>(
      (citasHoy || []).filter((c: any) => c.ocargue).map((c: any) => [String(c.ocargue), c.tipovehiculo]),
    )
    const tipoPorPlaca = new Map<string, string>((citasHoy || []).map((c: any) => [String(c.placa), c.tipovehiculo]))
    const capacidadPorOrden = new Map<string, number>(
      (citasHoy || []).filter((c: any) => c.ocargue && c.capacidad).map((c: any) => [String(c.ocargue), num(c.capacidad)]),
    )
    const capacidadPorPlaca = new Map<string, number>(
      (citasHoy || []).filter((c: any) => c.capacidad).map((c: any) => [String(c.placa), num(c.capacidad)]),
    )

    // 6) Pausas activas.
    const ordenesPausadas = new Set(await getOrdenesPausadas())

    // 7) Armar OrdenOperativa por cada orden activa.
    let cargadoHoyTon = 0
    for (const o of todasOrdenes) {
      if (!o.fincargue) continue
      const tipo = String(o.tipooperacion || "").trim()
      if (excluirAvimolDistribucion(idempresa, tipo)) continue
      const { peso } = pesoBaseCalculo(idempresa, tipo, num(o.pesovascula), num(o.pesoorden))
      if (peso > 0) cargadoHoyTon += peso
    }

    const armar = (o: any): OrdenOperativa => {
      const tipo = String(o.tipooperacion || "").trim() as TipoOperacion
      const placa = o.placa ? String(o.placa).trim() : null
      const tipovehiculo = tipoPorOrden.get(String(o.ordendecargue)) || (placa ? tipoPorPlaca.get(placa) : null) || null
      const capacidadVehiculo =
        capacidadPorOrden.get(String(o.ordendecargue)) ?? (placa ? capacidadPorPlaca.get(placa) : undefined) ?? null
      const slaMin = getSlaCargueMin(tipovehiculo, "PT", idempresa) || SLA_FALLBACK_MIN
      const auxiliares = String(o.auxiliares || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
      const pausado = ordenesPausadas.has(o.ordendecargue)
      let minutosTranscurridos: number | null = null
      let slaVencido = false
      let slaEnRiesgo = false
      if (o.iniciocargue) {
        const [ih, im] = String(o.iniciocargue).split(":").map(Number)
        const minInicio = ih * 60 + (im || 0)
        minutosTranscurridos = Math.max(0, minAhora - minInicio)
        slaVencido = slaMin != null && minutosTranscurridos > slaMin
        // Aviso temprano: sin vencer todavía, pero ya se consumió ≥80% del SLA.
        slaEnRiesgo = !slaVencido && slaMin != null && minutosTranscurridos >= slaMin * 0.8
      }
      const lineasInv = tipo === "Cargue" ? lineasInvtransPorOrden.get(o.ordendecargue) : null
      return {
        orderId: o.id,
        ordendecargue: o.ordendecargue,
        tipooperacion: tipo,
        cliente: clientePorOrden.get(o.id) || "Sin cliente",
        placa,
        conductor: o.conductor || null,
        muelle: o.muelle ?? null,
        auxiliares,
        facturar: o.facturar ?? null,
        tipoPago: o.tipo_pago ?? null,
        pesoorden: num(o.pesoorden),
        pesovascula: o.pesovascula != null ? num(o.pesovascula) : null,
        iniciocargue: o.iniciocargue || null,
        fincargue: o.fincargue || null,
        tipovehiculo,
        capacidadVehiculo,
        slaMin,
        pausado,
        lineasTotal: lineasInv ? lineasInv.total : lineasDetalleocPorOrden.get(o.id) || 0,
        lineasAprobadas: lineasInv ? lineasInv.aprobadas : null,
        minutosTranscurridos,
        slaVencido,
        slaEnRiesgo,
        estado: pausado ? "pausado" : o.iniciocargue ? "cargando" : "alistando",
      }
    }

    // Los muelles son un recurso físico compartido por los 3 tipos de
    // operación: NUNCA se filtran por tipo acá — un muelle ocupado por un
    // Descargue debe seguir viéndose ocupado aunque el coordinador esté
    // mirando el filtro "Cargue". El filtro de tipo es solo una ayuda visual
    // en el cliente (resaltar/atenuar), nunca esconde ocupación real.
    const ordenesOperativas: OrdenOperativa[] = ordenesActivasRaw.map(armar)

    // 8) Muelles: ocupación REAL (cabeceraoc.muelle) + cola sin muelle asignado.
    // Los números de muelle vienen de `muelles_empresa` (administrable) y no son
    // necesariamente contiguos 1..N (se puede desactivar uno puntual) — por eso
    // se busca por número real, no por aritmética de índice.
    const muelles: MuelleSlot[] = muelleNumeros.length > 0
      ? muelleNumeros.map((m) => ({ muelle: m, orden: null }))
      : Array.from({ length: N }, (_, i) => ({ muelle: i + 1, orden: null }))
    const muellePorNumero = new Map(muelles.map((slot) => [slot.muelle, slot]))
    let colaSinMuelle: OrdenOperativa[] = []
    for (const o of ordenesOperativas) {
      const slot = o.muelle != null ? muellePorNumero.get(o.muelle) : undefined
      if (slot) {
        slot.orden = o
      } else {
        colaSinMuelle.push(o)
      }
    }
    colaSinMuelle.sort((a, b) => a.ordendecargue.localeCompare(b.ordendecargue))

    // 8b) Auto-asignación de muelle: una orden ya "cargando" (iniciocargue
    // puesto, sin pasar por Centro de Coordinación) sin muelle asignado es
    // una situación real mientras el módulo no reemplaza a Picking/Packing —
    // se alerta de inmediato (`alertaCargandoSinMuelle`, cualquier minuto) y,
    // si pasan ≥15 min sin que el coordinador la asigne a mano, el sistema le
    // asigna el primer muelle libre que encuentre en ese momento. Si no hay
    // ninguno libre, se reintenta en el próximo refresco (cada 60s) hasta que
    // se libere uno — nunca se deja de intentar.
    const autoAsignaciones: { ordendecargue: string; placa: string | null; muelle: number }[] = []
    const candidatasAutoAsignar = colaSinMuelle.filter(
      (o) => o.estado === "cargando" && o.minutosTranscurridos != null && o.minutosTranscurridos >= 15,
    )
    for (const o of candidatasAutoAsignar) {
      const idxLibre = muelles.findIndex((m) => m.orden === null)
      if (idxLibre === -1) break // no quedan muelles libres ahora mismo
      const muelleLibre = muelles[idxLibre].muelle
      const resultado = await asignarOrdenAMuelle(o.orderId, muelleLibre)
      if (resultado.success) {
        o.muelle = muelleLibre
        muelles[idxLibre].orden = o
        autoAsignaciones.push({ ordendecargue: o.ordendecargue, placa: o.placa, muelle: muelleLibre })
      }
    }
    if (autoAsignaciones.length > 0) {
      colaSinMuelle = colaSinMuelle.filter((o) => o.muelle == null)
    }
    const alertaCargandoSinMuelle = colaSinMuelle.filter((o) => o.estado === "cargando")

    // 9) Proyección de cierre: earliest-available-machine sobre los muelles
    //    REALES. Los ocupados calculan su fin desde iniciocargue+SLA (si aún
    //    no inician, se estima desde AHORA — no se conoce cuándo arrancarán).
    //    La cola sin muelle se reparte en el que se desocupe primero.
    const muelleLibreDesde: number[] = new Array(N).fill(minAhora)
    muelles.forEach((slot, i) => {
      const o = slot.orden
      if (!o) return
      const minInicio = o.iniciocargue
        ? (() => {
            const [ih, im] = String(o.iniciocargue).split(":").map(Number)
            return ih * 60 + (im || 0)
          })()
        : minAhora
      muelleLibreDesde[i] = Math.max(minInicio + (o.slaMin || SLA_FALLBACK_MIN), minAhora)
    })
    colaSinMuelle.forEach((o) => {
      let idx = 0
      for (let i = 1; i < N; i++) if (muelleLibreDesde[i] < muelleLibreDesde[idx]) idx = i
      const inicio = Math.max(muelleLibreDesde[idx], minAhora)
      muelleLibreDesde[idx] = inicio + (o.slaMin || SLA_FALLBACK_MIN)
    })
    const pendientesTotal = ordenesOperativas.length
    const minCierreProyectado = muelleLibreDesde.length > 0 ? Math.max(...muelleLibreDesde) : minAhora
    const proyeccionHoraFinCola =
      pendientesTotal > 0 && minCierreProyectado < 24 * 60 && minCierreProyectado > minAhora
        ? fmtHoraDesdeMin(minCierreProyectado)
        : null

    // 10) SLA de cumplimiento: % de órdenes EN CARGUE (ya iniciadas) que
    //     siguen dentro de su SLA acordado.
    const enCargue = ordenesOperativas.filter((o) => o.iniciocargue)
    const enRiesgo = enCargue.filter((o) => o.slaVencido)
    const slaCumplimientoPct = enCargue.length > 0 ? round1(((enCargue.length - enRiesgo.length) / enCargue.length) * 100) : null

    // 9b) Semáforo del turno — mismo criterio que "Avance en Vivo": compara
    //     lo cargado contra lo que ya se debería haber cargado a esta hora
    //     según las horas de personal realmente trabajadas.
    const metaEsperadaAhoraTon = metaPorHora * horasTranscurridas
    const tonFaltante = Math.max(0, metaTonDia - cargadoHoyTon)
    let estadoTurno: CentroCoordinacionKpis["estadoTurno"] = "sin_datos"
    if (headcountReal > 0 && horasTranscurridas > 0) {
      if (tonFaltante <= 0 || cargadoHoyTon >= metaEsperadaAhoraTon) estadoTurno = "adelantado"
      else if (cargadoHoyTon >= metaEsperadaAhoraTon * 0.85) estadoTurno = "cerca"
      else estadoTurno = "atrasado"
    }

    // 11) Personal: asignado (únicos en órdenes activas) vs disponible (mismo
    //     universo que ya usa Picking/Packing).
    const personalAsignadoSet = new Set<string>()
    for (const o of ordenesOperativas) for (const a of o.auxiliares) personalAsignadoSet.add(a.toUpperCase())
    const personalDisponibleRes = await getCarguDescarguePersonnel(idempresa)
    const personalDisponibleLista = personalDisponibleRes.success ? personalDisponibleRes.data : []

    // 12) Cola de patio: vehículos con cita hoy que aún no tienen orden de cargue vinculada.
    const colaPatio: ColaPatioItem[] = (citasHoy || [])
      .filter((c: any) => !c.ocargue)
      .map((c: any) => ({ placa: c.placa, tipovehiculo: c.tipovehiculo || null, horallegada: c.horallegada || null }))
      .sort((a: ColaPatioItem, b: ColaPatioItem) => (a.horallegada || "").localeCompare(b.horallegada || ""))

    const muellesOcupados = muelles.filter((m) => m.orden !== null).length

    // 13) Sugerencia de siguiente turno: primer muelle libre + vehículo de
    //     patio más antiguo (preferimos coincidencia de tipo de vehículo con
    //     el último atendido en ese muelle si se puede saber; si no, el más
    //     antiguo en cola).
    let sugerenciaProximoTurno: SugerenciaTurno | null = null
    const primerMuelleLibre = muelles.find((m) => !m.orden)
    if (primerMuelleLibre && colaPatio.length > 0) {
      const primero = colaPatio[0]
      sugerenciaProximoTurno = { muelle: primerMuelleLibre.muelle, placa: primero.placa, tipovehiculo: primero.tipovehiculo }
    }

    // 14) Comparación vs. ayer a la misma hora — mismo corte de reloj, para
    //     que el número sea comparable (no el total del día completo de ayer).
    const ayer = new Date(`${fechaConsulta}T00:00:00`)
    ayer.setDate(ayer.getDate() - 1)
    const fechaAyer = ayer.toISOString().slice(0, 10)
    const { data: ordenesAyer } = await admin
      .from("cabeceraoc")
      .select("tipooperacion, pesovascula, pesoorden, fincargue")
      .eq("idempresa", idempresa)
      .eq("fechacargue", fechaAyer)
      .not("fincargue", "is", null)
      .lte("fincargue", horaActual)
    let cargadoAyerMismaHoraTon = 0
    for (const o of ordenesAyer || []) {
      const tipo = String(o.tipooperacion || "").trim()
      if (excluirAvimolDistribucion(idempresa, tipo)) continue
      const { peso } = pesoBaseCalculo(idempresa, tipo, num(o.pesovascula), num(o.pesoorden))
      if (peso > 0) cargadoAyerMismaHoraTon += peso
    }
    const vsAyerPct = cargadoAyerMismaHoraTon > 0 ? round1(((cargadoHoyTon - cargadoAyerMismaHoraTon) / cargadoAyerMismaHoraTon) * 100) : null

    return {
      success: true,
      data: {
        idempresa,
        fecha: fechaConsulta,
        horaActual,
        kpis: {
          cargadoHoyTon: round1(cargadoHoyTon),
          metaTonDia: round1(metaTonDia),
          ritmoTonHora: round2(horasCalendarioTranscurridas > 0.25 ? cargadoHoyTon / horasCalendarioTranscurridas : 0),
          capacidadTonHora: round2(capacidadTonHora),
          slaCumplimientoPct,
          ordenesEnRiesgo: enRiesgo.length,
          ordenesActivas: ordenesOperativas.length,
          personalEnPiso: headcountReal,
          personalAsignado: personalAsignadoSet.size,
          personalDisponible: personalDisponibleLista.length,
          muellesOcupados,
          muellesTotal: N,
          proyeccionHoraFinCola,
          cargadoAyerMismaHoraTon: round1(cargadoAyerMismaHoraTon),
          vsAyerPct,
          metaPorHoraTrabajador: round2(metaPorHora),
          metaEsperadaAhoraTon: round1(metaEsperadaAhoraTon),
          estadoTurno,
        },
        muelles,
        colaSinMuelle,
        colaPatio,
        personalDisponibleLista,
        sugerenciaProximoTurno,
        alertaCargandoSinMuelle,
        autoAsignaciones,
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al cargar el Centro de Coordinación." }
  }
}

// ---------------------------------------------------------------------------
// Parte de turno — resumen para entregarle al siguiente coordinador. Reusa
// getCentroCoordinacion (no duplica sus cálculos) y solo agrega el conteo de
// órdenes cerradas hoy + la lista de pendientes armada desde los mismos datos.
// ---------------------------------------------------------------------------

export interface ParteDeTurno {
  cargadoHoyTon: number
  ordenesCerradas: number
  ordenesEnCurso: number
  /** Vencidas EN ESTE MOMENTO entre las activas — no es un acumulado histórico del día completo. */
  slaVencidosAhora: number
  personalEnPiso: number
  pendientes: string[]
}

export async function getParteDeTurno(
  idempresa: number,
  fecha?: string,
): Promise<{ success: boolean; data?: ParteDeTurno; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const fechaConsulta = fecha || (await fechaHoyColombia())

    const base = await getCentroCoordinacion(idempresa, fechaConsulta)
    if (!base.success || !base.data) return { success: false, message: base.message }

    const { data: cerradas } = await admin
      .from("cabeceraoc")
      .select("id")
      .eq("idempresa", idempresa)
      .eq("fechacargue", fechaConsulta)
      .not("fincargue", "is", null)

    const pendientes: string[] = []
    for (const slot of base.data.muelles) {
      const o = slot.orden
      if (!o) continue
      if (o.pausado) {
        pendientes.push(`Muelle ${slot.muelle} (${o.cliente}, ${o.placa || "sin placa"}) en pausa — falta reanudar y cerrar.`)
      } else if (o.slaVencido && o.auxiliares.length === 0) {
        pendientes.push(`Muelle ${slot.muelle} (${o.cliente}, ${o.placa || "sin placa"}) sin personal asignado, SLA vencido.`)
      } else if (o.slaVencido) {
        pendientes.push(`Muelle ${slot.muelle} (${o.cliente}, ${o.placa || "sin placa"}) con SLA vencido.`)
      }
    }
    if (base.data.colaSinMuelle.length > 0) {
      pendientes.push(`${base.data.colaSinMuelle.length} orden(es) esperando muelle libre.`)
    }
    for (const o of base.data.alertaCargandoSinMuelle) {
      pendientes.push(`${o.cliente} (${o.placa || "sin placa"}) está cargando sin muelle asignado — asignar cuanto antes.`)
    }

    return {
      success: true,
      data: {
        cargadoHoyTon: base.data.kpis.cargadoHoyTon,
        ordenesCerradas: cerradas?.length || 0,
        ordenesEnCurso: base.data.kpis.ordenesActivas,
        slaVencidosAhora: base.data.kpis.ordenesEnRiesgo,
        personalEnPiso: base.data.kpis.personalEnPiso,
        pendientes,
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al calcular el parte de turno." }
  }
}

// ---------------------------------------------------------------------------
// Acciones — asignar muelle e iniciar orden. Reutilizan generatePickingPDF /
// generatePackingPDF / updateOrderInitioCargue (Picking y Packing hacen
// exactamente esto mismo hoy); acá solo se orquestan junto al muelle real.
// ---------------------------------------------------------------------------

export async function asignarOrdenAMuelle(
  orderId: number,
  muelle: number,
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()

  const { data: orderRow, error: fetchErr } = await supabase
    .from("cabeceraoc")
    .select("id, idempresa, muelle, fincargue")
    .eq("id", orderId)
    .single()
  if (fetchErr || !orderRow) return { success: false, message: "No se encontró la orden" }
  if (orderRow.fincargue) return { success: false, message: "La orden ya está cerrada" }

  await cargarMuellesEmpresa()
  const muellesActivos = getMuellesEmpresaSync(orderRow.idempresa)
  if (!Number.isFinite(muelle) || !muellesActivos.includes(muelle)) {
    return { success: false, message: `Muelle inválido (activos: ${muellesActivos.join(", ") || "ninguno configurado"})` }
  }

  const { data: ocupante } = await supabase
    .from("cabeceraoc")
    .select("id")
    .eq("idempresa", orderRow.idempresa)
    .eq("muelle", muelle)
    .is("fincargue", null)
    .neq("id", orderId)
    .limit(1)
    .maybeSingle()
  if (ocupante) return { success: false, message: `El muelle ${muelle} ya está ocupado` }

  const { error } = await supabase.from("cabeceraoc").update({ muelle }).eq("id", orderId)
  if (error) return { success: false, message: error.message }
  return { success: true, message: `Orden asignada al muelle ${muelle}` }
}

export async function liberarMuelle(orderId: number): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("cabeceraoc").update({ muelle: null }).eq("id", orderId)
  if (error) return { success: false, message: error.message }
  return { success: true, message: "Muelle liberado" }
}

export async function iniciarOrdenEnMuelle(
  orderId: number,
  muelle: number,
  orderData: { ordendecargue: string; cliente: string; placa: string; conductor: string; tipooperacion: TipoOperacion },
): Promise<{ success: boolean; message?: string; url?: string }> {
  const asigna = await asignarOrdenAMuelle(orderId, muelle)
  if (!asigna.success) return asigna

  if (orderData.tipooperacion === "Cargue") {
    const r = await generatePickingPDF(orderId, orderData.ordendecargue, orderData.cliente, orderData.placa, orderData.conductor)
    if (!r.success) return { success: false, message: r.error || r.message }
    return { success: true, message: "Cargue iniciado", url: r.url }
  }

  const r = await generatePackingPDF(orderId, orderData.ordendecargue, orderData.cliente, orderData.placa, orderData.conductor)
  if (!r.success) return { success: false, message: r.error }
  await updateOrderInitioCargue(orderId)
  return { success: true, message: "Orden iniciada", url: r.pdfUrl }
}

// ---------------------------------------------------------------------------
// Hoja del muelle — detalle expandible bajo cada fila. Carga bajo demanda
// (solo cuando el coordinador expande), no en el refresco de 60s.
// ---------------------------------------------------------------------------

export interface LineaOrden {
  id: number
  producto: string
  cantidad: number
  status?: string | null
}

export interface HojaMuelle {
  orderId: number
  ordendecargue: string
  tipooperacion: TipoOperacion
  cliente: string
  placa: string | null
  conductor: string | null
  auxiliares: { nombre: string; tonAsignada: number; tonPorHora: number }[]
  lineas: LineaOrden[]
  trazabilidad: { evento: string; hora: string | null }[]
  fotospicking: string[]
  evidenciaPreoperacional: { fotos: string[]; fecha: string | null } | null
  vehiculosAtendidosHoy: { ordendecargue: string; placa: string | null; fincargue: string | null; pesovascula: number | null }[]
}

export async function getHojaDelMuelle(orderId: number): Promise<{ success: boolean; data?: HojaMuelle; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()

    const { data: o, error } = await admin
      .from("cabeceraoc")
      .select(
        "id, idempresa, ordendecargue, tipooperacion, muelle, placa, conductor, auxiliares, pesoorden, pesovascula, fechacargue, horavehiculo, horasanitario, pesajeinicial, iniciocargue, pesajefinal, fincargue, fotospicking, tiquetebascula",
      )
      .eq("id", orderId)
      .single()
    if (error || !o) return { success: false, message: "No se encontró la orden" }

    const tipo = String(o.tipooperacion || "").trim() as TipoOperacion

    const { data: detalle } = await admin.from("detalleoc").select("cliente").eq("idorden", orderId).limit(1).maybeSingle()

    let lineas: LineaOrden[] = []
    if (tipo === "Cargue") {
      const { data: inv } = await admin
        .from("invtrans")
        .select("id, nombreproducto, cantidad, status")
        .eq("ocargue", o.ordendecargue)
      lineas = (inv || []).map((r: any) => ({ id: r.id, producto: r.nombreproducto, cantidad: num(r.cantidad), status: r.status || null }))
    } else {
      const pk = await getPackingItems(o.ordendecargue)
      lineas = (pk.data || []).map((r: any) => ({ id: r.id, producto: r.producto, cantidad: num(r.cantidad), status: null }))
    }

    const auxiliaresNombres = String(o.auxiliares || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
    const { peso: tonOrden } = pesoBaseCalculo(o.idempresa, tipo, num(o.pesovascula), num(o.pesoorden))
    let horasDesdeInicio = 0
    if (o.iniciocargue) {
      const horaActual = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date())
      const [hNow, mNow] = horaActual.split(":").map(Number)
      const [ih, im] = String(o.iniciocargue).split(":").map(Number)
      horasDesdeInicio = Math.max(0, (hNow * 60 + (mNow || 0) - (ih * 60 + (im || 0))) / 60)
    }
    const auxiliares = auxiliaresNombres.map((nombre) => {
      const tonAsignada = auxiliaresNombres.length > 0 ? tonOrden / auxiliaresNombres.length : 0
      return {
        nombre,
        tonAsignada: round2(tonAsignada),
        tonPorHora: round2(horasDesdeInicio > 0 ? tonAsignada / horasDesdeInicio : 0),
      }
    })

    const trazabilidad = [
      { evento: "Llegada", hora: o.horavehiculo || null },
      { evento: "Registro/inspección", hora: o.horasanitario || null },
      { evento: "Pesaje inicial", hora: o.pesajeinicial || null },
      { evento: "Inicio de cargue", hora: o.iniciocargue || null },
      { evento: "Pesaje final", hora: o.pesajefinal || null },
      { evento: "Cierre", hora: o.fincargue || null },
    ]

    let fotospicking: string[] = []
    try {
      fotospicking = o.fotospicking ? JSON.parse(o.fotospicking) : []
    } catch {
      fotospicking = []
    }

    let evidenciaPreoperacional: HojaMuelle["evidenciaPreoperacional"] = null
    if (o.placa) {
      const { data: insp } = await admin
        .from("inspeccion_sanitaria_vehiculos")
        .select("fotos, fecha")
        .eq("id_empresa", o.idempresa)
        .eq("placa_vehiculo", o.placa)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (insp) evidenciaPreoperacional = { fotos: insp.fotos || [], fecha: insp.fecha || null }
    }

    const { data: atendidosHoy } = await admin
      .from("cabeceraoc")
      .select("ordendecargue, placa, fincargue, pesovascula")
      .eq("idempresa", o.idempresa)
      .eq("fechacargue", o.fechacargue)
      .eq("muelle", o.muelle)
      .not("fincargue", "is", null)
      .order("fincargue", { ascending: false })
      .limit(10)

    return {
      success: true,
      data: {
        orderId: o.id,
        ordendecargue: o.ordendecargue,
        tipooperacion: tipo,
        cliente: detalle?.cliente || "Sin cliente",
        placa: o.placa || null,
        conductor: o.conductor || null,
        auxiliares,
        lineas,
        trazabilidad,
        fotospicking,
        evidenciaPreoperacional,
        vehiculosAtendidosHoy: atendidosHoy || [],
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al cargar la hoja del muelle." }
  }
}
