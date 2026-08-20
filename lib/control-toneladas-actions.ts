"use server"

// Control de Toneladas (Operación LIP): vista OPERATIVA para el coordinador —
// toneladas por día y acumuladas por trabajador, para gestionar personal (quién
// mueve menos, quién es más eficiente, qué vehículos atendió). NO es un módulo
// de pago: reutiliza la MISMA fórmula que ya paga nómina (pesoBaseCalculo +
// reparto igualitario de cabeceraoc.auxiliares), para que el número que ve el
// coordinador nunca diverja del que ya usa Revisión de Nómina.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { pesoBaseCalculo, excluirAvimolDistribucion, liquidable, normalizeName } from "@/lib/nomina-calculo-utils"
import { getHcYHorasRealPorDia } from "@/lib/meta-productividad-actions"
import { getSlaCargueMin } from "@/lib/sla-acordados"
import {
  TON_MES_CARGUE_DESCARGUE,
  DIAS_OPERACION_MES,
  duracionHoras,
  duracionHorasNetas,
  esPuestoCargueDescargue,
  MUELLES_SIMULTANEOS,
} from "@/lib/meta-productividad-utils"

// A diferencia de nómina (Revisión de Nómina, PILA, Bonos), aquí NO se
// excluyen los "auxiliares de PRUEBA": a ellos se les paga aparte ("de una"),
// pero sí participan físicamente en la operación y dividen el tonelaje de la
// orden igual que cualquiera — excluirlos de este reporte le ocultaría al
// coordinador parte real de lo programado/movido ese día. Por eso este
// archivo, a propósito, NO importa ningún filtro de nombre "prueba".

const num = (v: any) => Number(v || 0)
const round3 = (v: number) => Math.round(v * 1000) / 1000

export interface OrdenTrabajador {
  fecha: string
  orden: string
  tipooperacion: string
  planta: number
  placa: string | null
  // Puesto donde quedó PROGRAMADO ese día (Programación de Turnos →
  // registroasistencia.puesto). null si no hubo programación ese día/persona.
  puesto: string | null
  tonPersona: number
}

export interface TonPorDia {
  fecha: string
  toneladas: number
  vehiculos: string[]
}

export interface TrabajadorToneladas {
  persona: string
  // Activo HOY en Head Count (liquidable). false = ya se retiró / quedó inactivo
  // DESPUÉS del periodo consultado — su tonelaje histórico se sigue mostrando
  // (es un reporte de periodos pasados, no la nómina a pagar hoy), solo se
  // marca para que el coordinador sepa que esa persona ya no está.
  activo: boolean
  // Proyecto principal si solo trabajó en uno; null si trabajó en varios en el periodo.
  planta: number | null
  diasTrabajados: number
  tonAcumulada: number
  tonPromedioDia: number
  // Meta ton/trabajador/día (0 si el/los proyecto(s) no tienen Meta configurada).
  metaDia: number
  // % de tonPromedioDia sobre metaDia (0 si no hay meta) — "más eficiente" = mayor %.
  pctCumplimiento: number
  vehiculos: string[]
  ordenes: OrdenTrabajador[]
  tonPorDia: TonPorDia[]
}

export interface ControlToneladasData {
  trabajadores: TrabajadorToneladas[]
  totalToneladas: number
  totalTrabajadores: number
  periodoDesde: string
  periodoHasta: string
}

export async function getControlToneladas(
  idempresa: number | null, // null = todo LIP (1-4)
  desde: string,
  hasta: string,
): Promise<{ success: boolean; data?: ControlToneladasData; message?: string }> {
  try {
    if (!desde || !hasta) return { success: false, message: "Rango de fechas requerido (desde y hasta)." }
    const admin: any = await getSupabaseAdmin()
    const emps = idempresa != null && [1, 2, 3, 4].includes(idempresa) ? [idempresa] : [1, 2, 3, 4]

    // 1) Órdenes del periodo, FINALIZADAS — mismo universo que pagonomina
    //    (liquida por fechacargue de órdenes con fincargue). Paginado (tope 1000).
    const ordenesRaw: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("cabeceraoc")
        .select("id, ordendecargue, fechacargue, idempresa, tipooperacion, pesovascula, pesoorden, auxiliares, placa")
        .in("idempresa", emps)
        .gte("fechacargue", desde)
        .lte("fechacargue", hasta)
        .not("fincargue", "is", null)
        .range(off, off + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      ordenesRaw.push(...data)
      if (data.length < 1000) break
    }

    // 2) Head Count de los proyectos filtrados — SOLO para saber quién sigue
    //    activo hoy (badge informativo) y tener el nombre canónico. NO decide
    //    si una persona aparece en el reporte: este es un reporte de un periodo
    //    PASADO, así que alguien que se retiró después sigue contando su
    //    tonelaje real (igual que hace Conciliación báscula↔pago en nómina).
    const activoPorNombre = new Map<string, boolean>()
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("headcount")
        .select("nombre, idempresa, estado, contratosiigo, fecha_retiro")
        .in("idempresa", emps)
        .range(off, off + 999)
      if (error) return { success: false, message: error.message }
      for (const r of data || []) {
        const persona = String(r.nombre || "").trim()
        if (!persona) continue
        activoPorNombre.set(persona.toUpperCase(), liquidable(r))
      }
      if (!data || data.length < 1000) break
    }

    // 3) Meta DINÁMICA ton/trabajador/hora por (fecha, proyecto) — real,
    //    a partir del headcount con asistencia real de ese día (ver
    //    lib/meta-productividad-actions.ts). Reemplaza la meta plana fija
    //    que antes venía de Financiera › Tarifas › Metas.
    const hcHorasPorDia = await getHcYHorasRealPorDia(emps, desde, hasta)
    const metaPorHoraPorDia = new Map<string, number>()
    for (const [key, { horasTotales }] of hcHorasPorDia) {
      const emp = Number(key.split("|")[1])
      const metaTonDia = (TON_MES_CARGUE_DESCARGUE[emp] || 0) / DIAS_OPERACION_MES
      metaPorHoraPorDia.set(key, horasTotales > 0 ? metaTonDia / horasTotales : 0)
    }

    // 3b) Puesto y horas PROGRAMADAS de cada persona ese día — mismo cruce
    //    (idempresa|fecha|nombre normalizado) que ya usa Revisión de Nómina
    //    en getAuxiliaresVsAsistencia, contra registroasistencia.puesto
    //    (Programación de Turnos). cabeceraoc no trae esta info.
    const puestoMap = new Map<string, string>()
    const horasPersonaPorDia = new Map<string, number>()
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("registroasistencia")
        .select("nombre, idempresa, fecha, puesto, horaentradaprogramada, horasalidaprogramada")
        .in("idempresa", emps)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(off, off + 999)
      if (error) return { success: false, message: error.message }
      for (const r of data || []) {
        if (!r.puesto) continue
        const key = `${Number(r.idempresa)}|${String(r.fecha).slice(0, 10)}|${normalizeName(r.nombre)}`
        if (!puestoMap.has(key)) puestoMap.set(key, r.puesto)
        if (!horasPersonaPorDia.has(key) && r.horaentradaprogramada && r.horasalidaprogramada) {
          horasPersonaPorDia.set(key, duracionHorasNetas(String(r.horaentradaprogramada), String(r.horasalidaprogramada)))
        }
      }
      if (!data || data.length < 1000) break
    }

    // 4) Procesar órdenes: reparto EXACTO de nómina (peso base ÷ n auxiliares).
    type Acc = {
      persona: string
      activo: boolean
      plantas: Set<number>
      tonAcumulada: number
      vehiculos: Set<string>
      ordenes: OrdenTrabajador[]
      tonPorDiaMap: Map<string, number>
      // Meta INDIVIDUAL de esa persona ese día = meta/hora del proyecto ese
      // día × sus horas programadas ese día (0 si no hay programación).
      metaPorDiaMap: Map<string, number>
      vehiculosPorDiaMap: Map<string, Set<string>>
    }
    const porPersona = new Map<string, Acc>()

    for (const o of ordenesRaw) {
      const planta = Number(o.idempresa)
      const tipo = String(o.tipooperacion || "").trim()
      if (excluirAvimolDistribucion(planta, tipo)) continue
      const fecha = String(o.fechacargue).slice(0, 10)
      const auxiliares = String(o.auxiliares || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
      const nAux = auxiliares.length
      if (nAux === 0) continue
      const { peso: tonBase } = pesoBaseCalculo(planta, tipo, num(o.pesovascula), num(o.pesoorden))
      if (tonBase <= 0) continue
      const tonPersona = tonBase / nAux
      const placa = o.placa ? String(o.placa).trim() : null

      for (const p of auxiliares) {
        const key = p.toUpperCase()
        let c = porPersona.get(key)
        if (!c) {
          c = {
            persona: p,
            activo: activoPorNombre.has(key) ? activoPorNombre.get(key)! : true,
            plantas: new Set(),
            tonAcumulada: 0,
            vehiculos: new Set(),
            ordenes: [],
            tonPorDiaMap: new Map(),
            metaPorDiaMap: new Map(),
            vehiculosPorDiaMap: new Map(),
          }
          porPersona.set(key, c)
        }
        c.plantas.add(planta)
        c.tonAcumulada += tonPersona
        if (placa) c.vehiculos.add(placa)
        const puesto = puestoMap.get(`${planta}|${fecha}|${normalizeName(p)}`) || null
        c.ordenes.push({ fecha, orden: String(o.ordendecargue || ""), tipooperacion: tipo, planta, placa, puesto, tonPersona: round3(tonPersona) })
        c.tonPorDiaMap.set(fecha, (c.tonPorDiaMap.get(fecha) || 0) + tonPersona)
        if (!c.metaPorDiaMap.has(fecha)) {
          const horasPersona = horasPersonaPorDia.get(`${planta}|${fecha}|${normalizeName(p)}`) || 0
          const metaPorHoraDia = metaPorHoraPorDia.get(`${fecha}|${planta}`) || 0
          c.metaPorDiaMap.set(fecha, metaPorHoraDia * horasPersona)
        }
        if (placa) {
          if (!c.vehiculosPorDiaMap.has(fecha)) c.vehiculosPorDiaMap.set(fecha, new Set())
          c.vehiculosPorDiaMap.get(fecha)!.add(placa)
        }
      }
    }

    // 5) Armar salida por trabajador, con meta/eficiencia.
    const trabajadores: TrabajadorToneladas[] = []
    let totalToneladas = 0
    for (const c of porPersona.values()) {
      const diasTrabajados = c.tonPorDiaMap.size
      const tonPromedioDia = diasTrabajados > 0 ? c.tonAcumulada / diasTrabajados : 0
      // Meta DINÁMICA: promedio de la meta individual (horas programadas de
      // ESA persona ese día × meta/hora real del proyecto ese día) sobre los
      // días con meta calculable — ya no es un número plano igual para todos.
      const metasDelPeriodo = [...c.metaPorDiaMap.values()].filter((m) => m > 0)
      const metaDia = metasDelPeriodo.length > 0 ? metasDelPeriodo.reduce((a, b) => a + b, 0) / metasDelPeriodo.length : 0
      const pctCumplimiento = metaDia > 0 ? Math.round((tonPromedioDia / metaDia) * 1000) / 10 : 0
      totalToneladas += c.tonAcumulada
      trabajadores.push({
        persona: c.persona,
        activo: c.activo,
        planta: c.plantas.size === 1 ? [...c.plantas][0] : null,
        diasTrabajados,
        tonAcumulada: round3(c.tonAcumulada),
        tonPromedioDia: round3(tonPromedioDia),
        metaDia: round3(metaDia),
        pctCumplimiento,
        vehiculos: [...c.vehiculos].sort(),
        ordenes: c.ordenes.sort((a, b) => a.fecha.localeCompare(b.fecha)),
        tonPorDia: [...c.tonPorDiaMap.entries()]
          .map(([fecha, toneladas]) => ({
            fecha,
            toneladas: round3(toneladas),
            vehiculos: [...(c.vehiculosPorDiaMap.get(fecha) || [])].sort(),
          }))
          .sort((a, b) => a.fecha.localeCompare(b.fecha)),
      })
    }
    // Menor tonelaje primero — el pedido explícito del coordinador.
    trabajadores.sort((a, b) => a.tonAcumulada - b.tonAcumulada)

    return {
      success: true,
      data: {
        trabajadores,
        totalToneladas: round3(totalToneladas),
        totalTrabajadores: trabajadores.length,
        periodoDesde: desde,
        periodoHasta: hasta,
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al calcular el control de toneladas." }
  }
}

// ---------------------------------------------------------------------------
// RITMO EN VIVO — cuánto se ha movido hoy vs lo esperado a esta hora, y
// proyección de hora de cierre si se mantiene el ritmo actual. Usa la MISMA
// meta ton/trabajador/hora de lib/meta-productividad-actions.ts, así que
// nunca diverge del resto del módulo.
// ---------------------------------------------------------------------------

export interface RitmoEnVivo {
  fecha: string
  idempresa: number
  /** "HH:MM" hora Colombia al momento de la consulta. */
  horaActual: string
  metaTonDia: number
  metaPorHora: number
  headcountReal: number
  horasProgramadasTotales: number
  horasTranscurridas: number
  /** Capacidad del equipo: cuántas toneladas puede procesar por hora si tiene trabajo continuo. */
  capacidadTonHora: number
  tonMovido: number
  metaEsperadaAhora: number
  ritmoTonHora: number
  /** Ritmo real de HOY en ton/hora de RELOJ (no hora-persona) — 0 si aún es muy temprano para confiar en él. */
  ritmoTonHoraReloj: number
  /** Órdenes de hoy que ya empezaron a cargarse pero no han cerrado. */
  vehiculosEnProceso: number
  /** Órdenes de hoy que aún no empiezan a cargarse (en el patio, sin atender). */
  vehiculosEnCola: number
  /** Toneladas estimadas de lo pendiente (en proceso + en cola) — peso PLANEADO
   *  (pesoorden), no verificado en báscula todavía. */
  tonPendienteEstimada: number
  /** "HH:MM" en que se despejaría la cola actual, simulando muelle por
   *  muelle con el SLA de cada tipo de vehículo — null si no cierra hoy o
   *  no hay nada pendiente. */
  proyeccionHoraFinCola: string | null
  /** Estado de cada muelle simultáneo AHORA MISMO (ocupado/libre) — insumo del tablero visual. */
  muelles: MuelleEstado[]
  estado: "adelantado" | "cerca" | "atrasado" | "sin_datos"
}

export interface MuelleEstado {
  muelle: number
  ocupado: boolean
  placa: string | null
  tipovehiculo: string | null
  orden: string | null
  /** "HH:MM" en que quedó/quedará libre (según el SLA de ese vehículo) — null si ya está libre. */
  libreDesde: string | null
}

/** SLA de respaldo (minutos) cuando no se pudo determinar el tipo de vehículo — punto medio entre Turbo (30) y Tractomula (120). */
const SLA_FALLBACK_MIN = 60

function fmtHoraDesdeMin(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60) % 24
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

export async function getRitmoEnVivo(
  idempresa: number,
  fecha: string,
): Promise<{ success: boolean; data?: RitmoEnVivo; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()

    const horaActual = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date())
    const [hNow, mNow] = horaActual.split(":").map(Number)
    const minAhora = hNow * 60 + (mNow || 0)

    const metaTonDia = (TON_MES_CARGUE_DESCARGUE[idempresa] || 0) / DIAS_OPERACION_MES

    // Horas TRANSCURRIDAS a esta hora — por persona, min(ahora, salida) - entrada (0 si aún no entra).
    const { data: filas } = await admin
      .from("registroasistencia")
      .select("nombre, puesto, horaingreso, horaentradaprogramada, horasalidaprogramada")
      .eq("idempresa", idempresa)
      .eq("fecha", fecha)
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
        // Neta de 1h de almuerzo (confirmado por el usuario) — solo para la
        // capacidad/meta-hora. El fin de turno real (minSalidaProgramada,
        // usado abajo para topar horasTranscurridas) sigue siendo el bruto.
        horasProgramadasTotales += Math.max(0, horasGross - 1)
      }
      const minTope = Math.min(minAhora, minSalidaProgramada)
      if (minTope > minEntrada) horasTranscurridas += (minTope - minEntrada) / 60
    }

    // Órdenes de HOY completas (cerradas + en proceso + en cola) — una sola
    // consulta, se clasifican después. `iniciocargue` marca cuándo el equipo
    // empezó a atender ese vehículo; sin fincargue todavía = pendiente.
    const { data: ordenes } = await admin
      .from("cabeceraoc")
      .select("ordendecargue, placa, tipooperacion, pesovascula, pesoorden, iniciocargue, fincargue")
      .eq("idempresa", idempresa)
      .eq("fechacargue", fecha)

    // Tipo de vehículo de cada orden pendiente — se saca de citasvehiculos
    // (por número de orden o, si no hay match, por placa), para poder
    // consultar el SLA de cargue acordado por tipo (lib/sla-acordados.ts).
    const { data: citasHoy } = await admin
      .from("citasvehiculos")
      .select("placa, tipovehiculo, ocargue")
      .eq("idempresa", idempresa)
      .eq("fechallegada", fecha)
    const tipoPorOrden = new Map<string, string>((citasHoy || []).filter((c: any) => c.ocargue).map((c: any) => [String(c.ocargue), c.tipovehiculo]))
    const tipoPorPlaca = new Map<string, string>((citasHoy || []).map((c: any) => [String(c.placa), c.tipovehiculo]))

    type Pendiente = { orden: string; placa: string; iniciocargue: string | null; tipovehiculo: string | null; slaMin: number }
    let tonMovido = 0
    const pendientes: Pendiente[] = []
    for (const o of ordenes || []) {
      const tipo = String(o.tipooperacion || "").trim()
      if (excluirAvimolDistribucion(idempresa, tipo)) continue
      if (o.fincargue) {
        const { peso } = pesoBaseCalculo(idempresa, tipo, num(o.pesovascula), num(o.pesoorden))
        if (peso > 0) tonMovido += peso
      } else {
        const orden = String(o.ordendecargue || "")
        const placa = String(o.placa || "").trim()
        const tipovehiculo = tipoPorOrden.get(orden) || tipoPorPlaca.get(placa) || null
        const slaMin = getSlaCargueMin(tipovehiculo, "PT", idempresa) || SLA_FALLBACK_MIN
        pendientes.push({ orden, placa, iniciocargue: o.iniciocargue || null, tipovehiculo, slaMin })
      }
    }
    const vehiculosEnProceso = pendientes.filter((v) => v.iniciocargue).length
    const vehiculosEnCola = pendientes.length - vehiculosEnProceso
    const tonPendienteEstimada = (ordenes || [])
      .filter((o: any) => !o.fincargue && !excluirAvimolDistribucion(idempresa, String(o.tipooperacion || "").trim()))
      .reduce((s: number, o: any) => s + num(o.pesoorden), 0)

    const metaPorHora = horasProgramadasTotales > 0 ? metaTonDia / horasProgramadasTotales : 0
    const capacidadTonHora = headcountReal * metaPorHora
    const metaEsperadaAhora = metaPorHora * horasTranscurridas
    const ritmoTonHora = horasTranscurridas > 0 ? tonMovido / horasTranscurridas : 0
    const tonFaltante = Math.max(0, metaTonDia - tonMovido)

    // Ritmo REAL de hoy en ton/hora DE RELOJ (no hora-persona) — desde que
    // entró el primero hasta ahora. Si el equipo hoy rinde por encima de la
    // meta (ej. Cedi Funza ya superó su meta del día), este ritmo es más
    // alto que la capacidad "de libro" (capacidadTonHora, basada en la meta
    // acordada) y da una proyección más realista.
    const horasCalendarioTranscurridas = minEntradaMasTemprana !== null ? Math.max(0, (minAhora - minEntradaMasTemprana) / 60) : 0
    const ritmoTonHoraReloj = horasCalendarioTranscurridas > 0.25 ? tonMovido / horasCalendarioTranscurridas : 0

    // Proyección de CUÁNDO SE DESPEJA LA COLA — simulación muelle por
    // muelle (earliest-available-machine): cada vehículo EN PROCESO ya
    // ocupa un muelle desde su `iniciocargue` hasta iniciocargue+SLA (según
    // su tipo, lib/sla-acordados.ts); cada vehículo EN COLA se asigna al
    // muelle que se desocupe primero. La hora de cierre es el máximo entre
    // todos los muelles. Reemplaza el modelo anterior (toneladas totales ÷
    // una tasa agregada): ese promedio no distinguía tipos de vehículo ni
    // cuántos se pueden atender EN PARALELO — con muelles reales (número
    // confirmado por el usuario por proyecto) el resultado es mucho más
    // preciso, sobre todo cuando el equipo ya rinde por encima de la meta.
    const N = MUELLES_SIMULTANEOS[idempresa] || 1
    const muelleLibreDesde: number[] = new Array(N).fill(minAhora)
    const muelles: MuelleEstado[] = Array.from({ length: N }, (_, i) => ({
      muelle: i + 1,
      ocupado: false,
      placa: null,
      tipovehiculo: null,
      orden: null,
      libreDesde: null,
    }))

    const enProcesoOrdenado = pendientes.filter((v) => v.iniciocargue).sort((a, b) => (a.iniciocargue! < b.iniciocargue! ? -1 : 1))
    const enColaOrdenado = pendientes.filter((v) => !v.iniciocargue)
    // Si hay más vehículos "en proceso" que muelles físicos (dato atrasado
    // o varios muelles compartidos), los que sobran se tratan como cola.
    const enProcesoDirectos = enProcesoOrdenado.slice(0, N)
    const restoParaCola = [...enProcesoOrdenado.slice(N), ...enColaOrdenado]

    // `muelles[]` (el tablero visual) SOLO refleja la realidad de AHORA MISMO
    // — únicamente los vehículos que YA están en proceso ocupan un muelle;
    // los de la cola todavía no han empezado, así que no "pintan" ningún
    // muelle como ocupado, solo entran en la simulación de `muelleLibreDesde`
    // para calcular cuándo se despeja todo.
    enProcesoDirectos.forEach((v, i) => {
      const [ih, im] = String(v.iniciocargue).split(":").map(Number)
      const minInicio = ih * 60 + (im || 0)
      const finEstimado = minInicio + v.slaMin
      muelleLibreDesde[i] = Math.max(finEstimado, minAhora)
      muelles[i] = {
        muelle: i + 1,
        ocupado: true, // sin fincargue todavía = sigue físicamente en el muelle, aunque ya haya pasado su SLA estimado
        placa: v.placa,
        tipovehiculo: v.tipovehiculo,
        orden: v.orden,
        libreDesde: fmtHoraDesdeMin(finEstimado),
      }
    })

    restoParaCola.forEach((v) => {
      let idx = 0
      for (let i = 1; i < N; i++) if (muelleLibreDesde[i] < muelleLibreDesde[idx]) idx = i
      const inicio = Math.max(muelleLibreDesde[idx], minAhora)
      muelleLibreDesde[idx] = inicio + v.slaMin
    })

    const minCierreProyectado = muelleLibreDesde.length > 0 ? Math.max(...muelleLibreDesde) : minAhora
    const proyeccionHoraFinCola =
      pendientes.length > 0 && minCierreProyectado < 24 * 60 && minCierreProyectado > minAhora
        ? fmtHoraDesdeMin(minCierreProyectado)
        : null

    let estado: RitmoEnVivo["estado"] = "sin_datos"
    if (headcountReal > 0 && horasTranscurridas > 0) {
      if (tonFaltante <= 0 || tonMovido >= metaEsperadaAhora) estado = "adelantado"
      else if (tonMovido >= metaEsperadaAhora * 0.85) estado = "cerca"
      else estado = "atrasado"
    }

    return {
      success: true,
      data: {
        fecha,
        idempresa,
        horaActual,
        metaTonDia: Math.round(metaTonDia * 10) / 10,
        metaPorHora: Math.round(metaPorHora * 1000) / 1000,
        headcountReal,
        horasProgramadasTotales: Math.round(horasProgramadasTotales * 10) / 10,
        horasTranscurridas: Math.round(horasTranscurridas * 10) / 10,
        capacidadTonHora: Math.round(capacidadTonHora * 100) / 100,
        tonMovido: Math.round(tonMovido * 10) / 10,
        metaEsperadaAhora: Math.round(metaEsperadaAhora * 10) / 10,
        ritmoTonHora: Math.round(ritmoTonHora * 100) / 100,
        ritmoTonHoraReloj: Math.round(ritmoTonHoraReloj * 100) / 100,
        vehiculosEnProceso,
        vehiculosEnCola,
        tonPendienteEstimada: Math.round(tonPendienteEstimada * 10) / 10,
        proyeccionHoraFinCola,
        muelles,
        estado,
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al calcular el ritmo en vivo." }
  }
}

// ---------------------------------------------------------------------------
// CAPACIDAD vs LLEGADAS — desglose por hora del día: cuántas toneladas
// LLEGARON (citas de vehículos) cada hora vs. cuánto puede procesar el
// equipo por hora (capacidad). Muestra los picos que colapsan la operación
// y los huecos donde el personal espera sin vehículos que atender.
// ---------------------------------------------------------------------------

export interface LlegadaPorHora {
  hora: number // 0-23
  vehiculos: number
  toneladas: number
}

export interface CapacidadVsLlegadas {
  fecha: string
  idempresa: number
  capacidadTonHora: number
  llegadas: LlegadaPorHora[]
}

export async function getCapacidadVsLlegadas(
  idempresa: number,
  fecha: string,
): Promise<{ success: boolean; data?: CapacidadVsLlegadas; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()

    const [ritmo, citasRes, ordenesRes] = await Promise.all([
      getRitmoEnVivo(idempresa, fecha),
      admin
        .from("citasvehiculos")
        .select("placa, horallegada, capacidad, ocargue")
        .eq("idempresa", idempresa)
        .eq("fechallegada", fecha),
      admin
        .from("cabeceraoc")
        .select("ordendecargue, pesoorden, pesovascula")
        .eq("idempresa", idempresa)
        .eq("fechacargue", fecha),
    ])

    const pesoPorOrden = new Map<string, number>(
      (ordenesRes.data || []).map((o: any) => [o.ordendecargue, num(o.pesovascula) || num(o.pesoorden)]),
    )

    const porHora = new Map<number, LlegadaPorHora>()
    for (const c of citasRes.data || []) {
      if (!c.horallegada) continue
      const hora = Number(String(c.horallegada).split(":")[0])
      if (!Number.isFinite(hora)) continue
      const pesoOrden = c.ocargue ? pesoPorOrden.get(String(c.ocargue)) : undefined
      const toneladas = pesoOrden || num(c.capacidad)
      const acc = porHora.get(hora) || { hora, vehiculos: 0, toneladas: 0 }
      acc.vehiculos += 1
      acc.toneladas += toneladas
      porHora.set(hora, acc)
    }

    return {
      success: true,
      data: {
        fecha,
        idempresa,
        capacidadTonHora: ritmo.data?.capacidadTonHora || 0,
        llegadas: [...porHora.values()].sort((a, b) => a.hora - b.hora),
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al calcular capacidad vs llegadas." }
  }
}
