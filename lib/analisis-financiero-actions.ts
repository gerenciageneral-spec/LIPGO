"use server"

/**
 * ANÁLISIS FINANCIERO por proyecto — INFORMACIÓN CONFIDENCIAL DE GERENCIA.
 *
 * Es un análisis de PRESUPUESTO vs REAL, con dos tarifas que NO deben
 * mezclarse (corregido 2026-08-02 a pedido de gerencia):
 *
 *   · ACORDADA (`acuerdo_volumenes.tarifa`): el cuadro que entregó gerencia
 *     — la estructura pactada y cuánto ASPIRA a facturar LIP por ese
 *     volumen. Es la vara para medir el DÉFICIT de volumen: si el real
 *     queda por debajo del acordado, `deficit × tarifa_acordada` es lo que
 *     hay que facturar ADICIONAL para no perder plata en esa actividad.
 *
 *   · REAL (tarifa VIGENTE del maestro `tarifasoperacion`, la misma que usa
 *     el Cierre Financiero/Cuadro de Control): lo que el sistema factura DE
 *     VERDAD hoy con las tarifas actuales — que fluctúan (ajustes de IPC,
 *     cambios de tarifa a mitad de año) y no siempre coinciden con la del
 *     cuadro acordado. `margenReal` sale de esto: Σ(volumen real × tarifa
 *     REAL vigente) − nómina real. NUNCA se recalcula con la tarifa del
 *     acuerdo — eso inflaría o desinflaría el margen con un precio que hoy
 *     puede no ser el que efectivamente se cobra.
 *
 * El volumen real (toneladas) SÍ se mide con la lógica propia de cada ID
 * (cada proyecto es un cliente distinto):
 *   · ID1: vista `facturacion` — Cargue PT / Cargue subproducto (Mogolla) /
 *     Tolva / Tolva f. Valor real = tarifaDeServicio (por owner, con
 *     prorrateo de báscula) — el MISMO cálculo que usa el Cuadro/Cierre
 *     Financiero, para que ambas pestañas cuadren entre sí.
 *   · ID2: cargue igual que arriba; la producción (Estibado PT / Salvado,
 *     con festivos) por getConciliacionAvimol — su cobro real ya viene
 *     calculado con la tarifa vigente correcta (incluye festivo).
 *   · ID3/ID4: por tipooperacion/transporte, mismo tarifaDeServicio.
 *
 * Es un LECTOR: no escribe nada. Tolerante a que `acuerdo_volumenes` aún no
 * exista (migración scripts/create_acuerdo_volumenes.sql pendiente).
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getConciliacionAvimol } from "@/lib/conciliacion-avimol-actions"
import { esPlacaDistribucion, ownerDeLinea, cargarPlacasDistribucion } from "@/lib/distribucion-placas"
import { PLACAS_EXCLUIDAS_FACTURAS } from "@/lib/facturas-exclusiones"
import { facturadoAOwner } from "@/lib/facturacion-billed-party"

const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()

/** Subproducto = Mogolla/Salvado/Tercera — mismo criterio del Cuadro. */
const esSubproducto = (subcat: unknown) => {
  const k = norm(subcat)
  return k.includes("MOGOLLA") || k.includes("SALVADO") || k.includes("TERCERA")
}

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
}

function diaSiguiente(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number)
  const [yb, mb, db] = b.split("-").map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000) + 1
}

// ---------------------------------------------------------------------------
// Tarifa REAL vigente — REPLICADO de lib/facturacion-control-actions.ts.
// No se puede importar de allá: ese archivo es "use server" y solo puede
// exportar funciones async, y estas son helpers síncronos. Se copian
// literales para que "lo facturado real" de este análisis sea EXACTAMENTE
// el mismo cálculo que ya usan el Cuadro y el Cierre Financiero.
// ---------------------------------------------------------------------------

function ownerKey(s: string | null | undefined): string {
  return norm(s)
}

/** Los SUB-PRODUCTOS (Mogolla, Salvado, Harina de Tercera) comparten tarifa. */
function subcatKey(s: string | null | undefined): string {
  return esSubproducto(s) ? "MOGOLLA KG." : ownerKey(s)
}

interface TarifasEmpresa {
  exact: Map<string, number>
  porOpOwner: Map<string, number>
  porOp: Map<string, number>
  susanita: number
}

async function tarifasDeEmpresa(sb: any, idempresa: number): Promise<TarifasEmpresa> {
  const t: TarifasEmpresa = { exact: new Map(), porOpOwner: new Map(), porOp: new Map(), susanita: 0 }
  const setMax = (m: Map<string, number>, k: string, v: number) => m.set(k, Math.max(m.get(k) || 0, v))
  const { data: tar } = await sb.from("tarifasoperacion").select("operacion, empresafactura, producto, tarifa").eq("empresaid", idempresa)
  for (const r of tar || []) {
    const op = String(r.operacion ?? "").trim().toLowerCase()
    const owner = ownerKey(r.empresafactura)
    const subcat = subcatKey(r.producto)
    const v = num(r.tarifa)
    if (!op || v <= 0) continue
    if (op === "descargue" && owner === "SUSANITA") {
      t.susanita = Math.max(t.susanita, v)
      continue
    }
    setMax(t.exact, `${op}|||${owner}|||${subcat}`, v)
    setMax(t.porOpOwner, `${op}|||${owner}`, v)
    setMax(t.porOp, op, v)
  }
  return t
}

function lookupTarifa(operacion: string | null, owner: string, subcategoria: string | null, t: TarifasEmpresa): number {
  const op = String(operacion ?? "").trim().toLowerCase()
  const ok = ownerKey(owner)
  const sk = subcatKey(subcategoria)
  return t.exact.get(`${op}|||${ok}|||${sk}`) ?? t.porOpOwner.get(`${op}|||${ok}`) ?? t.porOp.get(op) ?? 0
}

function tarifaDeServicio(
  idempresa: number,
  operacion: string | null,
  transporte: string | null,
  cliente: string | null,
  placa: string | null,
  owner: string,
  subcategoria: string | null,
  tarifas: TarifasEmpresa,
): number {
  const op = String(operacion ?? "").trim().toLowerCase()
  const tr = norm(transporte)
  const cl = norm(cliente)
  if (cl.includes("SUSANITA") || tr === "SUSANITA") return tarifas.susanita || lookupTarifa("descargue", owner, subcategoria, tarifas)
  // "Recoge en bodega" (Cargue TERCEROS a tarifa de DESCARGUE) es regla solo de Medellín (id4).
  if (idempresa === 4 && op === "cargue" && tr === "TERCEROS" && !esPlacaDistribucion(idempresa, placa)) {
    return lookupTarifa("descargue", owner, subcategoria, tarifas)
  }
  return lookupTarifa(op, owner, subcategoria, tarifas)
}

/** Báscula del tiquete de descargue (cedis id3/id4), normalizada a toneladas. */
function basculaTiqueteDescargue(pesovascula: number, detalle: number): number {
  if (pesovascula <= 0) return 0
  let p = pesovascula
  if (detalle > 0 && p / detalle > 50) p = p / 1000
  if (detalle > 0) {
    const ratio = p / detalle
    if (ratio < 0.1 || ratio > 10) return 0
  }
  return p
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ActividadAnalisis {
  actividad: string
  codigo: string
  tarifa: number
  volumenAcordadoMes: number
  /** Acordado escalado al período (mes × meses del período). */
  volumenAcordado: number
  volumenReal: number
  cumplimientoPct: number | null
  deficit: number
  /** deficit × tarifa ACORDADA: lo que hay que facturar adicional para no perder. */
  aFacturarAdicional: number
  facturaAcordada: number
  /** volumenReal × tarifa REAL vigente (o cobro real de la conciliación) — NO la del acuerdo. */
  facturaReal: number
}

export interface EstructuraFila {
  actividad: string
  auxiliares: number | null
  muelle: string | null
}

export interface ProyectoAnalisis {
  idempresa: number
  proyecto: string
  actividades: ActividadAnalisis[]
  estructura: EstructuraFila[]
  tonAcordadas: number
  tonReales: number
  cumplimientoPct: number | null
  totalFacturaAcordada: number
  totalFacturaReal: number
  totalAFacturarAdicional: number
  costoNomina: number
  /** Σ facturaReal (tarifa VIGENTE, no la del acuerdo) − costoNomina real. */
  margenReal: number
  margenPorTon: number | null
  /** costo ÷ tarifa promedio ponderada del acuerdo = ton mínimas del período. */
  puntoEquilibrioTon: number | null
  /** Proyección lineal de toneladas al cierre (solo si el período está en curso). */
  proyeccionTon: number | null
  notas: string[]
}

export interface AnalisisFinanciero {
  desde: string
  hasta: string
  meses: number
  proyectos: ProyectoAnalisis[]
}

// ---------------------------------------------------------------------------
// Volumen Y VALOR real por actividad_codigo, por proyecto
// ---------------------------------------------------------------------------

interface RealPorCodigo {
  ton: number
  valor: number
}

async function realPorCodigo(
  sb: any,
  idempresa: number,
  desde: string,
  hasta: string,
  notas: string[],
): Promise<Map<string, RealPorCodigo>> {
  const real = new Map<string, RealPorCodigo>()
  const add = (codigo: string, ton: number, valor: number) => {
    const e = real.get(codigo) || { ton: 0, valor: 0 }
    e.ton += ton
    e.valor += valor
    real.set(codigo, e)
  }
  const hastaExclusivo = diaSiguiente(hasta)
  const placasExcluidas = new Set((PLACAS_EXCLUIDAS_FACTURAS[idempresa] || []).map((p) => p.toUpperCase()))
  const tarifas = await tarifasDeEmpresa(sb, idempresa)
  await cargarPlacasDistribucion() // caché para esPlacaDistribucion/ownerDeLinea
  const esBascula = idempresa === 1 || idempresa === 2

  // Clasifica una línea al código de actividad del acuerdo (misma lógica por
  // ID que antes; ahora se usa para AGRUPAR el valor real, no solo el volumen).
  const codigoDe = (op: string, transporte: unknown, subcategoria: unknown): string | null => {
    if (idempresa === 1 || idempresa === 2) {
      if (op === "CARGUE") return esSubproducto(subcategoria) ? "cargue_subproducto" : "aux_cargue_descargue"
      if (op === "TOLVA") return "tolva"
      if (op === "TOLVA F") return "tolva_domingo"
      return null
    }
    if (idempresa === 3) {
      if (op === "CARGUE") return "cargue"
      if (op === "DESCARGUE") return "descargue"
      if (op === "DISTRIBUCION") return "distribucion"
      return null
    }
    if (idempresa === 4) {
      if (op === "CARGUE") return norm(transporte) === "TERCEROS" ? "cargue_cliente_recoge" : "cargue_propios"
      if (op === "DISTRIBUCION") return "descargue_distribucion"
      if (op === "DESCARGUE") return "descargue_terceros"
      return null
    }
    return null
  }

  // Líneas de la vista `facturacion` del período.
  let filas: any[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb
      .from("facturacion")
      .select("numeroorden, owner, subcategoria, toneladas, tipooperacion, transporte, cliente, placa")
      .eq("idempresa", idempresa)
      .gte("fechacargue", desde)
      .lt("fechacargue", hastaExclusivo)
      .range(off, off + 999)
    if (error) {
      notas.push(`No se pudo leer la facturación: ${error.message}`)
      break
    }
    if (!data || data.length === 0) break
    filas = filas.concat(data)
    if (data.length < 1000) break
  }

  // Órdenes PROCESADAS y facturables — mismo criterio de getControlFacturacion:
  // `fincargue` (orden cerrada) y `facturar !== false` (nadie desmarcó el check
  // "Facturar" en Picking/Packing). Sin este filtro se contarían órdenes que el
  // resto del sistema jamás factura, y "lo real" dejaría de cuadrar con el Cuadro.
  const numerosOrden = [...new Set(filas.map((r) => String(r.numeroorden || "").trim()).filter(Boolean))]
  const pesoV = new Map<string, number>()
  const procesadas = new Set<string>()
  for (let i = 0; i < numerosOrden.length; i += 200) {
    const chunk = numerosOrden.slice(i, i + 200)
    const { data } = await sb
      .from("cabeceraoc")
      .select("ordendecargue, pesovascula, fincargue, facturar")
      .eq("idempresa", idempresa)
      .neq("tipooperacion", "proyeccion")
      .in("ordendecargue", chunk)
    for (const o of data || []) {
      const on = String(o.ordendecargue || "").trim()
      pesoV.set(on, num(o.pesovascula))
      if (o.fincargue && o.facturar !== false) procesadas.add(on)
    }
  }

  // Acumular por (orden, código) — igual que el Cuadro acumula por (orden, owner) —
  // y el denominador del prorrateo es el detalle TOTAL de la orden (todos los códigos).
  type Acc = { on: string; codigo: string; op: string; tonDet: number; valorDet: number }
  const accMap = new Map<string, Acc>()
  const ordenTotalDet = new Map<string, number>()

  for (const r of filas) {
    const on = String(r.numeroorden || "").trim()
    if (!on || !procesadas.has(on)) continue
    const placa = String(r.placa ?? "").trim().toUpperCase()
    const cl = norm(r.cliente)
    if (placasExcluidas.has(placa) && !cl.includes("SUSANITA")) continue // WMP446 salvo Susanita
    const op = norm(r.tipooperacion)
    const codigo = codigoDe(op, r.transporte, r.subcategoria)
    const ton = num(r.toneladas)
    ordenTotalDet.set(on, (ordenTotalDet.get(on) || 0) + ton)
    if (!codigo) continue // producto/operación fuera del acuerdo (no se pierde del denominador, sí de la salida)

    const owner = ownerDeLinea(idempresa, r.placa, String(r.owner || "SIN OWNER"))
    const tarifa = tarifaDeServicio(idempresa, r.tipooperacion, r.transporte, r.cliente, r.placa, owner, r.subcategoria, tarifas)
    // Avimol (id2) placa propia: cubierto por el fijo de 600 ton/mes, no se
    // factura por tonelada aquí (ya está en Cargos Fijos, no se duplica). Con
    // transporte Zamudio/Terceros SÍ se factura (a esa transportadora, no a
    // Avimol) — para el margen del PROYECTO Avimol esa plata sigue contando.
    // Mismo criterio que getControlFacturacion — ver lib/facturacion-billed-party.ts.
    const fa = facturadoAOwner(idempresa, owner, r.tipooperacion, r.transporte)
    const k = `${on}|||${codigo}`
    const a = accMap.get(k) || { on, codigo, op, tonDet: 0, valorDet: 0 }
    a.tonDet += ton
    a.valorDet += fa.cubiertoPorFijo ? 0 : ton * tarifa
    accMap.set(k, a)
  }

  for (const a of accMap.values()) {
    let toneladas = a.tonDet
    let valor = a.valorDet
    const esDescargueCedi = (idempresa === 3 || idempresa === 4) && a.op === "DESCARGUE"
    if (esBascula || esDescargueCedi) {
      const totalDet = ordenTotalDet.get(a.on) || 0
      const P = esDescargueCedi ? basculaTiqueteDescargue(pesoV.get(a.on) || 0, totalDet) : pesoV.get(a.on) || 0
      if (P > 0 && totalDet > 0) {
        const scale = P / totalDet
        toneladas = a.tonDet * scale
        valor = a.valorDet * scale
      }
    }
    add(a.codigo, toneladas, valor)
  }

  // ID2: la producción real (Estibado/Salvado con festivos) sale de la
  // conciliación — YA es su cobro real (tarifa vigente + festivo), no se
  // recalcula con tarifaDeServicio.
  if (idempresa === 2) {
    const conc = await getConciliacionAvimol(desde, hasta)
    if (conc.success && conc.data) {
      for (const d of conc.data.dias) {
        for (const p of d.productos) {
          const op = norm(p.operacion)
          if (op === "ESTIBADO PT") add("estibado_pt", p.toneladas, p.cobro)
          else if (op === "ESTIBADO PT FESTIVO") add("estibado_pt_festivo", p.toneladas, p.cobro)
          else if (op === "SALVADO") add("salvado", p.toneladas, p.cobro)
          else if (op === "SALVADO FESTIVO") add("salvado_festivo", p.toneladas, p.cobro)
        }
      }
    } else {
      notas.push(`No se pudo leer la producción de la conciliación: ${conc.message || "error"}`)
    }
  }

  return real
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export async function getAnalisisFinanciero(
  ids: number[],
  desde: string,
  hasta: string,
  meses: number,
): Promise<{ success: boolean; data?: AnalisisFinanciero; message?: string }> {
  try {
    if (!ids?.length) return { success: false, message: "Sin proyectos en el alcance." }
    const sb: any = await getSupabaseAdmin()

    // Acuerdos vigentes que TOQUEN el período. Tolerante a tabla inexistente.
    const { data: acuerdos, error: errAc } = await sb
      .from("acuerdo_volumenes")
      .select("*")
      .in("idempresa", ids)
      .lte("fechainicio", hasta)
      .gte("fechafin", desde)
    if (errAc) {
      return {
        success: true,
        data: { desde, hasta, meses, proyectos: [] },
        message: "La tabla acuerdo_volumenes no existe todavía — correr scripts/create_acuerdo_volumenes.sql.",
      }
    }

    const { data: empresasData } = await sb.from("empresas").select("id, nombre").in("id", ids)
    const nombreDe = new Map<number, string>((empresasData || []).map((e: any) => [Number(e.id), String(e.nombre)]))

    // Nómina del período por proyecto (mismo neteo del P&L: liquidado + bono
    // con compuerta del 16-jul).
    const BONO_DESDE = "2026-07-16"
    const costoDe = new Map<number, number>()
    {
      const bonoQ = new Map<string, number>()
      for (let off = 0; ; off += 1000) {
        const { data, error } = await sb
          .from("pagonomina")
          .select("idempresaliquidacion, persona, fecha, total_liquidado_dia, bonif_prestacional")
          .in("idempresaliquidacion", ids)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .range(off, off + 999)
        if (error) break
        if (!data || data.length === 0) break
        for (const r of data) {
          const id = Number(r.idempresaliquidacion)
          costoDe.set(id, (costoDe.get(id) || 0) + num(r.total_liquidado_dia))
          const f = String(r.fecha).slice(0, 10)
          if (f >= BONO_DESDE) {
            const q = `${id}|${String(r.persona).trim()}|${f.slice(0, 7)}-${Number(f.slice(8, 10)) <= 15 ? "Q1" : "Q2"}`
            bonoQ.set(q, (bonoQ.get(q) || 0) + num(r.bonif_prestacional))
          }
        }
        if (data.length < 1000) break
      }
      for (const [k, v] of bonoQ) {
        if (v > 0) {
          const id = Number(k.split("|")[0])
          costoDe.set(id, (costoDe.get(id) || 0) + v)
        }
      }
    }

    // Período en curso → factor de proyección lineal.
    const hoy = hoyBogota()
    const enCurso = hoy >= desde && hoy <= hasta
    const factorProyeccion = enCurso ? diasEntre(desde, hasta) / Math.max(1, diasEntre(desde, hoy)) : null

    const proyectos: ProyectoAnalisis[] = []
    for (const id of ids) {
      const propios = (acuerdos || []).filter((a: any) => Number(a.idempresa) === id)
      if (!propios.length) continue

      const notas: string[] = []
      const real = await realPorCodigo(sb, id, desde, hasta, notas)

      // El acuerdo puede tener VARIAS vigencias dentro del período (ID2 cambió
      // el 1-jul): cada actividad acumula acordado = Σ(volumen × meses de su
      // vigencia dentro del período). Aproximación por meses calendario.
      type Acc = {
        actividad: string
        codigo: string
        tarifa: number
        volMes: number
        volAcordado: number
        facturaAcordada: number
      }
      const actividades = new Map<string, Acc>()
      const estructura: EstructuraFila[] = []

      for (const a of propios) {
        if (a.volumen_acordado === null || a.tarifa === null) {
          // Fila de estructura (informativa): se toma la de la vigencia que
          // cubra el final del período (la más reciente).
          if (String(a.fechafin) >= hasta || String(a.fechafin) >= hoy) {
            estructura.push({ actividad: a.actividad, auxiliares: a.auxiliares === null ? null : num(a.auxiliares), muelle: a.muelle ?? null })
          }
          continue
        }
        // Meses de esta vigencia dentro del período (aprox. por meses de 30d).
        const ini = String(a.fechainicio) > desde ? String(a.fechainicio) : desde
        const fin = String(a.fechafin) < hasta ? String(a.fechafin) : hasta
        const mesesVig = Math.min(meses, Math.max(0, diasEntre(ini, fin) / 30.4))
        const codigo = String(a.actividad_codigo ?? "").trim()
        if (!codigo) continue
        const acc = actividades.get(codigo) || {
          actividad: a.actividad,
          codigo,
          tarifa: num(a.tarifa),
          volMes: num(a.volumen_acordado),
          volAcordado: 0,
          facturaAcordada: 0,
        }
        acc.tarifa = num(a.tarifa) // la más reciente manda para valorar déficit
        acc.volMes = num(a.volumen_acordado)
        acc.volAcordado += num(a.volumen_acordado) * mesesVig
        acc.facturaAcordada += num(a.volumen_acordado) * num(a.tarifa) * mesesVig
        actividades.set(codigo, acc)
      }

      const lista: ActividadAnalisis[] = []
      for (const acc of actividades.values()) {
        const r = real.get(acc.codigo) || { ton: 0, valor: 0 }
        const deficit = Math.max(0, acc.volAcordado - r.ton)
        lista.push({
          actividad: acc.actividad,
          codigo: acc.codigo,
          tarifa: acc.tarifa,
          volumenAcordadoMes: acc.volMes,
          volumenAcordado: Math.round(acc.volAcordado * 10) / 10,
          volumenReal: Math.round(r.ton * 10) / 10,
          cumplimientoPct: acc.volAcordado > 0 ? Math.round((r.ton / acc.volAcordado) * 100) : null,
          deficit: Math.round(deficit * 10) / 10,
          // Déficit valorado a la tarifa ACORDADA (lo que se aspira a facturar).
          aFacturarAdicional: Math.round(deficit * acc.tarifa),
          facturaAcordada: Math.round(acc.facturaAcordada),
          // Lo REAL: volumen real × tarifa VIGENTE (o cobro real de la conciliación).
          facturaReal: Math.round(r.valor),
        })
      }
      lista.sort((a, b) => b.facturaAcordada - a.facturaAcordada)

      const tonAcordadas = lista.reduce((s, a) => s + a.volumenAcordado, 0)
      const tonReales = lista.reduce((s, a) => s + a.volumenReal, 0)
      const totalFacturaAcordada = lista.reduce((s, a) => s + a.facturaAcordada, 0)
      const totalFacturaReal = lista.reduce((s, a) => s + a.facturaReal, 0)
      const totalAFacturarAdicional = lista.reduce((s, a) => s + a.aFacturarAdicional, 0)
      const costoNomina = Math.round(costoDe.get(id) || 0)
      const tarifaPromedio = tonAcordadas > 0 ? totalFacturaAcordada / tonAcordadas : 0

      proyectos.push({
        idempresa: id,
        proyecto: nombreDe.get(id) || `Empresa ${id}`,
        actividades: lista,
        estructura,
        tonAcordadas: Math.round(tonAcordadas * 10) / 10,
        tonReales: Math.round(tonReales * 10) / 10,
        cumplimientoPct: tonAcordadas > 0 ? Math.round((tonReales / tonAcordadas) * 100) : null,
        totalFacturaAcordada,
        totalFacturaReal: Math.round(totalFacturaReal),
        totalAFacturarAdicional,
        costoNomina,
        // Margen REAL = lo que factura hoy el sistema (tarifa vigente) − nómina real.
        margenReal: Math.round(totalFacturaReal - costoNomina),
        margenPorTon: tonReales > 0 ? Math.round((totalFacturaReal - costoNomina) / tonReales) : null,
        puntoEquilibrioTon: tarifaPromedio > 0 ? Math.round(costoNomina / tarifaPromedio) : null,
        proyeccionTon: factorProyeccion ? Math.round(tonReales * factorProyeccion * 10) / 10 : null,
        notas,
      })
    }

    return { success: true, data: { desde, hasta, meses, proyectos } }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error calculando el análisis financiero." }
  }
}

// ---------------------------------------------------------------------------
// Edición ligera del acuerdo (reajustes anuales / correcciones)
// ---------------------------------------------------------------------------

export async function guardarAcuerdoVolumen(payload: {
  id?: number
  idempresa: number
  actividad: string
  actividad_codigo: string | null
  auxiliares: number | null
  muelle: string | null
  tarifa: number | null
  volumen_acordado: number | null
  fechainicio: string
  fechafin: string
}): Promise<{ success: boolean; message?: string }> {
  try {
    const sb: any = await getSupabaseAdmin()
    const row = {
      idempresa: payload.idempresa,
      actividad: payload.actividad.trim(),
      actividad_codigo: payload.actividad_codigo,
      auxiliares: payload.auxiliares,
      muelle: payload.muelle,
      tarifa: payload.tarifa,
      volumen_acordado: payload.volumen_acordado,
      fechainicio: payload.fechainicio,
      fechafin: payload.fechafin,
    }
    const { error } = payload.id
      ? await sb.from("acuerdo_volumenes").update(row).eq("id", payload.id)
      : await sb.from("acuerdo_volumenes").insert(row)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar el acuerdo." }
  }
}

export async function getAcuerdosVolumenes(): Promise<{
  success: boolean
  data: Array<{
    id: number
    idempresa: number
    actividad: string
    actividad_codigo: string | null
    auxiliares: number | null
    muelle: string | null
    tarifa: number | null
    volumen_acordado: number | null
    fechainicio: string
    fechafin: string
  }>
  message?: string
}> {
  try {
    const sb: any = await getSupabaseAdmin()
    const { data, error } = await sb
      .from("acuerdo_volumenes")
      .select("*")
      .order("idempresa", { ascending: true })
      .order("fechainicio", { ascending: true })
    if (error) return { success: false, data: [], message: error.message }
    return {
      success: true,
      data: (data || []).map((r: any) => ({
        id: r.id,
        idempresa: Number(r.idempresa),
        actividad: r.actividad,
        actividad_codigo: r.actividad_codigo ?? null,
        auxiliares: r.auxiliares === null ? null : num(r.auxiliares),
        muelle: r.muelle ?? null,
        tarifa: r.tarifa === null ? null : num(r.tarifa),
        volumen_acordado: r.volumen_acordado === null ? null : num(r.volumen_acordado),
        fechainicio: r.fechainicio,
        fechafin: r.fechafin,
      })),
    }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al leer los acuerdos." }
  }
}
