"use server"

// Cuadro de Mando de Facturación (pestaña dentro de Gestión de Facturas).
// FUENTE DE VERDAD: las órdenes de servicio procesadas (cabeceraoc con fincargue
// y facturar != false). Se cruzan con lo que YA se facturó (estadofactura) para
// garantizar que todo lo procesado se facture — y detectar lo que quedó sin gestionar.
// El valor a facturar por OWNER sale de la vista `facturacion` (tarifa × toneladas,
// misma fuente que la facturación real). El cobro de cartera (que el cliente pague)
// es el paso siguiente y NO se cruza aquí.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { ownerDeIdEmpresa } from "@/lib/owner-utils"
import { esPlacaDistribucion } from "@/lib/distribucion-placas"
import { PLACAS_EXCLUIDAS_FACTURAS } from "@/lib/facturas-exclusiones"

export type CategoriaFactura = "facturado" | "en_proceso" | "sin_gestionar"

// Determinante REAL de "¿se facturó?": existe la FACTURA DE SIIGO (`facturasiigo`).
// Sin factura Siigo → NO facturado (verde), aunque el estado sea "Factura solicitada"
// (eso es solo el trámite del coordinador → ámbar). Con factura Siigo → facturado (rojo).
function categoriaDeFactura(
  facturasiigo: string | null | undefined,
  estado: string | null | undefined,
): CategoriaFactura {
  if (String(facturasiigo ?? "").trim() !== "") return "facturado"
  const e = String(estado ?? "").trim()
  if (e !== "" && !/pendiente/i.test(e)) return "en_proceso" // solicitada, sin Siigo aún
  return "sin_gestionar" // por facturar
}

export interface ControlFacturaFila {
  numeroorden: string
  fecha: string | null
  placa: string | null
  tiquete: string | null
  tipooperacion: string | null
  cliente: string | null
  owner: string
  toneladas: number // CANTIDAD facturable: peso báscula (id 1/2) o peso orden/detalle (id 3/4)
  fuente_peso: "bascula" | "orden"
  tarifa: number | null
  valor_a_facturar: number // total = cantidad × tarifa
  sin_tarifa: boolean
  estadofactura: string | null
  categoria: CategoriaFactura
  valorpago: number | null
}

export interface ResumenOwner {
  owner: string
  operacion: string // separa Cargue / Descargue / Distribucion dentro del owner
  ordenes: number
  toneladas: number
  valor_a_facturar: number
  val_facturado: number
  val_en_proceso: number
  val_sin_gestionar: number
}

export interface ControlFacturacion {
  filas: ControlFacturaFila[]
  porOwner: ResumenOwner[]
  totales: {
    ordenes: number
    toneladas: number
    valor_a_facturar: number
    val_facturado: number
    val_en_proceso: number
    val_sin_gestionar: number
    ordenes_sin_gestionar: number
    ordenes_sin_tarifa: number
  }
  operaciones: string[] // operaciones REALES del proyecto (para el filtro), sin depender del filtro aplicado
}

export interface FiltrosControl {
  desde?: string | null
  hasta?: string | null
  owner?: string | null
  tipooperaciones?: string[] | null // multi-selección de operaciones (vacío/null = todas)
  categoria?: CategoriaFactura | null
  cliente?: string | null
  placa?: string | null
}

const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

export type Servicio =
  | "Cargue/Descargue propio"
  | "Cargue recoge en bodega"
  | "Descargue"
  | "Susanita"

// Clasifica una orden en el SERVICIO de la prefactura (mapeo confirmado):
//   · Susanita           = cliente Tostaditos Susanita (cualquier operación).
//   · Descargue          = operación Descargue.
//   · Propio             = la PLACA DE DISTRIBUCIÓN del proyecto (vehículo propio),
//                          operaciones Cargue/Distribución.
//   · Recoge en bodega   = Cargue con transporte TERCEROS (el cliente recoge).
function servicioDe(
  empresa: number,
  operacion: string | null,
  transporte: string | null,
  cliente: string | null,
  placa: string | null,
): Servicio {
  const op = String(operacion ?? "").trim().toLowerCase()
  const tr = String(transporte ?? "").trim().toUpperCase()
  const cl = String(cliente ?? "").toUpperCase()
  // Susanita se identifica por el TRANSPORTE "SUSANITA" (el cliente suele venir vacío)
  // o por el nombre del cliente. La vista ya le pone owner=AVIMOL y tarifa 31.544.
  if (cl.includes("SUSANITA") || tr === "SUSANITA") return "Susanita"
  // La PLACA DE DISTRIBUCIÓN (vehículo propio) manda: "Cargue Y Descargue propio"
  // agrupa todas sus operaciones (cargue, distribución y descargue).
  if (esPlacaDistribucion(empresa, placa)) return "Cargue/Descargue propio"
  if (op === "descargue") return "Descargue"
  if (tr === "TERCEROS") return "Cargue recoge en bodega"
  return "Cargue recoge en bodega" // fallback (cargue de tercero)
}

// Tarifas de una empresa POR (operación, OWNER), leídas de `tarifasoperacion`.
// Las tarifas varían por owner/empresafactura (ej. en Funza el Cargue de Molinos
// es 17.318 y el de AVIMOL/Indupan 14.844). Todo sale de la tabla, sin hardcodear.
export interface TarifasEmpresa {
  cargue: Map<string, number>
  distribucion: Map<string, number>
  descargue: Map<string, number>
  susanita: number
}

// Normaliza un nombre de owner/empresafactura para casar la vista con tarifasoperacion.
function ownerKey(s: string | null | undefined): string {
  return String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
const maxMapa = (m: Map<string, number>): number => {
  let mx = 0
  for (const v of m.values()) if (v > mx) mx = v
  return mx
}

async function tarifasDeEmpresa(sb: any, idempresa: number): Promise<TarifasEmpresa> {
  const t: TarifasEmpresa = { cargue: new Map(), distribucion: new Map(), descargue: new Map(), susanita: 0 }
  const setMax = (m: Map<string, number>, k: string, v: number) => m.set(k, Math.max(m.get(k) || 0, v))
  const { data: tar } = await sb
    .from("tarifasoperacion")
    .select("operacion, empresafactura, tarifa")
    .eq("empresaid", idempresa)
  for (const r of tar || []) {
    const op = String(r.operacion ?? "").trim().toLowerCase()
    const owner = ownerKey(r.empresafactura)
    const v = num(r.tarifa)
    if (v <= 0) continue
    if (op === "cargue") setMax(t.cargue, owner, v)
    else if (op === "distribucion") setMax(t.distribucion, owner, v)
    else if (op === "descargue") {
      if (owner === "SUSANITA") t.susanita = Math.max(t.susanita, v)
      else setMax(t.descargue, owner, v)
    }
  }
  return t
}

// Tarifa de UNA línea, por (servicio, operación real, OWNER del producto). Reglas:
//   · Recoge en bodega (Cargue TERCEROS) se cobra a la tarifa de DESCARGUE del owner.
//   · Susanita → Descargue SUSANITA.
//   · Propio / Descargue / demás → la tarifa de SU operación real, por owner.
// Si un owner no tiene tarifa propia para esa operación, cae al máximo de la operación.
function tarifaDeServicio(
  servicio: Servicio,
  operacion: string | null,
  owner: string,
  tarifas: TarifasEmpresa,
): number {
  const k = ownerKey(owner)
  const op = String(operacion ?? "").trim().toLowerCase()
  const desc = tarifas.descargue.get(k) ?? maxMapa(tarifas.descargue)
  const carg = tarifas.cargue.get(k) ?? maxMapa(tarifas.cargue)
  const dist = tarifas.distribucion.get(k) ?? maxMapa(tarifas.distribucion)
  switch (servicio) {
    case "Susanita":
      return tarifas.susanita || desc
    case "Descargue":
      return desc
    case "Cargue recoge en bodega":
      return desc // recoge en bodega = tarifa de descargue (por owner)
    case "Cargue/Descargue propio":
      // El vehículo propio hace cargue/distribución/descargue: usa la tarifa de SU operación.
      if (op === "descargue") return desc
      if (op === "distribucion") return dist || carg
      return carg
    default:
      return carg
  }
}

export interface PrefacturaLinea {
  fechaorden: string | null
  fechacargue: string | null
  cliente: string | null
  numeroorden: string
  tiquete: string | null
  placa: string | null
  producto: string | null
  pesobascula: number
  toneladas: number
  owner: string
  subcategoria: string | null
  idempresa: number
  transporte: string | null
  tipooperacion: string | null
  tarifa: string | number | null
  valor_a_facturar: number
  servicio: string
  tarifaServicio: number // tarifa REAL del servicio (la que factura la prefactura)
  valorServicio: number // toneladas × tarifaServicio (para que el soporte cuadre con el resumen)
  estadofactura: string | null
  categoria: CategoriaFactura // semáforo: sin_gestionar=por facturar · en_proceso · facturado
}
export interface PrefacturaResumen {
  owner: string
  operacion: string // TIPO DE OPERACIÓN (Cargue / Descargue / Distribucion)
  toneladas: number
  tarifa: number // tarifa efectiva del grupo (valor/ton), refleja tarifas por owner
  valor: number // suma del valor por línea (tarifa real por owner/operación)
  // Desglose por estado de factura (para el semáforo y no facturar doble):
  tonPorFacturar: number
  valorPorFacturar: number // solo lo NO gestionado (verde)
  tonEnProceso: number
  valorEnProceso: number // factura solicitada / a crédito (ámbar)
  tonFacturado: number
  valorFacturado: number // ya facturado — NO volver a facturar (rojo)
}
export interface Prefactura {
  origen: PrefacturaLinea[]
  resumen: PrefacturaResumen[]
  totalValor: number
  totalToneladas: number
}

// ---------- Prefacturas GUARDADAS (borrador/aprobada) ----------
export interface PrefacturaLineaGuardada {
  owner: string
  servicio: string
  toneladas: number
  tarifa: number
  total: number
}
// Línea del SOPORTE (anexo) congelado: detalle de órdenes que respalda la factura.
export interface SoporteLinea {
  owner: string
  operacion: string
  servicio: string
  fecha: string | null
  numeroorden: string
  placa: string | null
  cliente: string | null
  producto: string | null
  toneladas: number
  tarifa: number
  valor: number
}
export interface PrefacturaGuardada {
  id: number
  idempresa: number
  proyecto: string | null
  periodo_desde: string | null
  periodo_hasta: string | null
  lineas: PrefacturaLineaGuardada[]
  soporte: SoporteLinea[]
  total: number
  toneladas: number
  estado: "borrador" | "aprobada"
  usuario: string | null
  observacion: string | null
  created_at: string
}

export async function guardarPrefactura(payload: {
  idempresa: number
  proyecto?: string | null
  periodo_desde?: string | null
  periodo_hasta?: string | null
  lineas: PrefacturaLineaGuardada[]
  soporte?: SoporteLinea[] // detalle de órdenes que respalda la factura (congelado)
  total: number
  toneladas: number
  usuario?: string | null
  observacion?: string | null
}): Promise<{ success: boolean; id?: number; message?: string }> {
  if (!payload?.idempresa) return { success: false, message: "Falta el proyecto." }
  if (!payload.lineas?.length) return { success: false, message: "La prefactura no tiene líneas seleccionadas." }
  try {
    const sb: any = await getSupabaseAdmin()
    const { data, error } = await sb
      .from("prefacturas")
      .insert({
        idempresa: payload.idempresa,
        proyecto: payload.proyecto ?? null,
        periodo_desde: payload.periodo_desde || null,
        periodo_hasta: payload.periodo_hasta || null,
        lineas: payload.lineas,
        soporte: payload.soporte ?? [],
        total: payload.total,
        toneladas: payload.toneladas,
        estado: "borrador",
        usuario: payload.usuario ?? null,
        observacion: payload.observacion ?? null,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()
    if (error) return { success: false, message: error.message }
    return { success: true, id: data?.id }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar la prefactura." }
  }
}

export async function listarPrefacturas(
  idempresa: number,
): Promise<{ success: boolean; data: PrefacturaGuardada[]; message?: string }> {
  if (!idempresa) return { success: true, data: [] }
  try {
    const sb: any = await getSupabaseAdmin()
    const { data, error } = await sb
      .from("prefacturas")
      .select("*")
      .eq("idempresa", idempresa)
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) return { success: false, data: [], message: error.message }
    return { success: true, data: (data || []) as PrefacturaGuardada[] }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al listar prefacturas." }
  }
}

export async function cambiarEstadoPrefactura(
  id: number,
  estado: "borrador" | "aprobada",
): Promise<{ success: boolean; message?: string }> {
  try {
    const sb: any = await getSupabaseAdmin()
    const { error } = await sb.from("prefacturas").update({ estado, updated_at: new Date().toISOString() }).eq("id", id)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al cambiar el estado." }
  }
}

export async function eliminarPrefactura(id: number): Promise<{ success: boolean; message?: string }> {
  try {
    const sb: any = await getSupabaseAdmin()
    const { error } = await sb.from("prefacturas").delete().eq("id", id).eq("estado", "borrador")
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al eliminar." }
  }
}

/**
 * Arma la PREFACTURA de un proyecto (idempresa) para un rango: la TABLA ORIGEN
 * (líneas de la vista `facturacion`, owner ya resuelto) + un resumen por
 * owner×servicio. Solo órdenes procesadas. Base para el anexo/soporte de factura.
 */
export async function getPrefactura(
  idempresa: number,
  filtros: { desde?: string | null; hasta?: string | null; tipooperaciones?: string[] | null } = {},
): Promise<{ success: boolean; data?: Prefactura; message?: string }> {
  if (!idempresa) return { success: false, message: "Selecciona un proyecto/empresa." }
  try {
    const sb: any = await getSupabaseAdmin()

    // Tarifas por servicio desde tarifasoperacion (Cargue, Descargue, Descargue SUSANITA).
    const tarifas = await tarifasDeEmpresa(sb, idempresa)

    // Placas que NO atiende LIP (excepto cuando cargan a Susanita). Ej. WMP446 en id 4.
    const placasExcluidas = new Set((PLACAS_EXCLUIDAS_FACTURAS[idempresa] || []).map((p) => p.toUpperCase()))
    // Filtro multi-operación (vacío = todas).
    const opSet = new Set((filtros.tipooperaciones || []).map((o) => String(o).trim().toLowerCase()))

    // Procesadas del proyecto (fuente de verdad) + ESTADO DE FACTURA por orden.
    // El estado dice qué ya se gestionó (para el semáforo y NO facturar doble): en
    // Medellín los descargues ya se facturan a las transportadoras y quedan con estado.
    const procesadas = new Set<string>()
    const estadoPorOrden = new Map<string, { estado: string | null; facturasiigo: string | null }>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb
        .from("cabeceraoc")
        .select("ordendecargue, fincargue, facturar, tipooperacion, estadofactura, facturasiigo")
        .eq("idempresa", idempresa)
        .neq("tipooperacion", "proyeccion")
        .range(offset, offset + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      for (const o of data) {
        const on = String(o.ordendecargue || "").trim()
        estadoPorOrden.set(on, { estado: o.estadofactura ?? null, facturasiigo: o.facturasiigo ?? null })
        if (o.fincargue && o.facturar !== false) procesadas.add(on)
      }
      if (data.length < 1000) break
    }

    // Líneas de la vista facturacion (TABLA ORIGEN).
    const origen: PrefacturaLinea[] = []
    for (let offset = 0; ; offset += 1000) {
      let q = sb
        .from("facturacion")
        .select("fechaorden, fechacargue, cliente, numeroorden, tiquetebascula, placa, producto, pesobascula, toneladas, owner, subcategoria, idempresa, transporte, tipooperacion, tarifa, valor_a_facturar")
        .eq("idempresa", idempresa)
      if (filtros.desde) q = q.gte("fechacargue", filtros.desde)
      if (filtros.hasta) q = q.lte("fechacargue", filtros.hasta)
      const { data, error } = await q.range(offset, offset + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      for (const r of data) {
        const on = String(r.numeroorden || "").trim()
        if (!procesadas.has(on)) continue
        const placa = String(r.placa ?? "").trim().toUpperCase()
        const cl = String(r.cliente ?? "").toUpperCase()
        // WMP446 (u otras excluidas) NO las atiende LIP, SALVO cuando cargan a Susanita.
        if (placasExcluidas.has(placa) && !cl.includes("SUSANITA")) continue
        const servicio = servicioDe(idempresa, r.tipooperacion, r.transporte, r.cliente, r.placa)
        // Filtro multi-operación (Susanita se conserva siempre, es factura del owner).
        if (opSet.size > 0 && servicio !== "Susanita" && !opSet.has(String(r.tipooperacion ?? "").trim().toLowerCase())) continue
        // Owner por el id_empresa del PRODUCTO (dueño real), incluido el propio.
        const owner = String(r.owner || "SIN OWNER")
        const est = estadoPorOrden.get(on)
        const estadofactura = est?.estado ?? null
        const tServicio = tarifaDeServicio(servicio, r.tipooperacion, owner, tarifas)
        origen.push({
          fechaorden: r.fechaorden ?? null,
          fechacargue: r.fechacargue ?? null,
          cliente: r.cliente ?? null,
          numeroorden: on,
          tiquete: r.tiquetebascula ?? null,
          placa: r.placa ?? null,
          producto: r.producto ?? null,
          pesobascula: num(r.pesobascula),
          toneladas: num(r.toneladas),
          owner,
          subcategoria: r.subcategoria ?? null,
          idempresa: Number(r.idempresa),
          transporte: r.transporte ?? null,
          tipooperacion: r.tipooperacion ?? null,
          tarifa: r.tarifa ?? null,
          valor_a_facturar: num(r.valor_a_facturar),
          servicio,
          tarifaServicio: tServicio,
          valorServicio: num(r.toneladas) * tServicio,
          estadofactura,
          categoria: categoriaDeFactura(est?.facturasiigo, estadofactura),
        })
      }
      if (data.length < 1000) break
    }

    // Resumen por owner × servicio, facturado a la TARIFA DEL SERVICIO (no la de la línea).
    // Se desglosa por ESTADO para el semáforo: por facturar (verde) / en proceso (ámbar)
    // / facturado (rojo, NO volver a facturar).
    const map = new Map<string, PrefacturaResumen>()
    let totalToneladas = 0
    for (const l of origen) {
      const op = l.tipooperacion || "(sin operación)"
      const k = `${l.owner}|||${op}`
      const r =
        map.get(k) ||
        {
          owner: l.owner, operacion: op, toneladas: 0, tarifa: l.tarifaServicio, valor: 0,
          tonPorFacturar: 0, valorPorFacturar: 0, tonEnProceso: 0, valorEnProceso: 0,
          tonFacturado: 0, valorFacturado: 0,
        }
      // Valor POR LÍNEA (ya calculado con la tarifa del owner/operación real).
      const v = l.valorServicio
      r.toneladas += l.toneladas
      r.valor += v
      if (l.categoria === "facturado") {
        r.tonFacturado += l.toneladas
        r.valorFacturado += v
      } else if (l.categoria === "en_proceso") {
        r.tonEnProceso += l.toneladas
        r.valorEnProceso += v
      } else {
        r.tonPorFacturar += l.toneladas
        r.valorPorFacturar += v
      }
      map.set(k, r)
      totalToneladas += l.toneladas
    }
    let totalValor = 0
    for (const r of map.values()) {
      // Tarifa EFECTIVA del grupo (valor/ton) — refleja tarifas por owner/operación.
      r.tarifa = r.toneladas > 0 ? Math.round(r.valor / r.toneladas) : r.tarifa
      totalValor += r.valor
    }
    const resumen = Array.from(map.values()).sort(
      (a, b) => a.owner.localeCompare(b.owner) || a.operacion.localeCompare(b.operacion),
    )

    return { success: true, data: { origen, resumen, totalValor, totalToneladas } }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar la prefactura." }
  }
}

/**
 * Cruce del cuadro para UNA empresa/ID (owner del proyecto). Trae la vista
 * `facturacion` (valor por owner) de esa empresa y le cruza el `estadofactura` de
 * `cabeceraoc` para clasificar cada orden. `idempresa` null no se soporta: la
 * facturación es por proyecto seleccionado.
 */
export async function getControlFacturacion(
  idempresa: number,
  filtros: FiltrosControl = {},
): Promise<{ success: boolean; data?: ControlFacturacion; message?: string }> {
  if (!idempresa) return { success: false, message: "Selecciona un proyecto/empresa." }
  try {
    const sb: any = await getSupabaseAdmin()

    // Tarifas POR SERVICIO (misma valoración que la prefactura) y placas que LIP no
    // atiende (WMP446), para que "lo que se debe facturar" sea REAL y consistente.
    const tarifas = await tarifasDeEmpresa(sb, idempresa)
    const placasExcluidas = new Set((PLACAS_EXCLUIDAS_FACTURAS[idempresa] || []).map((p) => p.toUpperCase()))

    // 1) Estado + vínculo de las órdenes de la empresa (fuente de verdad).
    //    Solo procesadas (fincargue) y facturables (facturar != false).
    const estadoPorOrden = new Map<
      string,
      { estado: string | null; facturasiigo: string | null; valorpago: number | null; pesovascula: number }
    >()
    const procesadas = new Set<string>()
    // Operaciones REALES del proyecto (para poblar el filtro con lo que sí existe).
    const operacionesSet = new Set<string>()
    {
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await sb
          .from("cabeceraoc")
          .select("ordendecargue, estadofactura, facturasiigo, valorpago, fincargue, facturar, tipooperacion, pesovascula")
          .eq("idempresa", idempresa)
          .neq("tipooperacion", "proyeccion")
          .range(offset, offset + pageSize - 1)
        if (error) return { success: false, message: error.message }
        if (!data || data.length === 0) break
        for (const o of data) {
          const on = String(o.ordendecargue || "").trim()
          if (!on) continue
          estadoPorOrden.set(on, {
            estado: o.estadofactura ?? null,
            facturasiigo: o.facturasiigo ?? null,
            valorpago: o.valorpago ?? null,
            pesovascula: num(o.pesovascula),
          })
          const procesada = o.fincargue && o.facturar !== false
          if (procesada) procesadas.add(on)
          const op = String(o.tipooperacion ?? "").trim()
          if (procesada && op) operacionesSet.add(op)
        }
        if (data.length < pageSize) break
      }
    }
    const operaciones = Array.from(operacionesSet).sort((a, b) => a.localeCompare(b))

    // 2) Líneas de la vista `facturacion` de la empresa (valor por owner).
    let facturas: any[] = []
    {
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        let q = sb
          .from("facturacion")
          .select("numeroorden, fechacargue, fechaorden, placa, tiquetebascula, cliente, producto, toneladas, owner, transporte, tipooperacion, tarifa, valor_a_facturar")
          .eq("idempresa", idempresa)
        if (filtros.desde) q = q.gte("fechacargue", filtros.desde)
        if (filtros.hasta) q = q.lte("fechacargue", filtros.hasta)
        if (filtros.owner) q = q.eq("owner", filtros.owner)
        if (filtros.placa) q = q.ilike("placa", `%${filtros.placa}%`)
        if (filtros.cliente) q = q.ilike("cliente", `%${filtros.cliente}%`)
        const { data, error } = await q.range(offset, offset + pageSize - 1)
        if (error) return { success: false, message: error.message }
        if (!data || data.length === 0) break
        facturas = facturas.concat(data)
        if (data.length < pageSize) break
      }
    }

    // 3) Agregar según la FUENTE DE VERDAD del peso:
    //   · ID 1/2 (plantas con báscula: Harinera Indupan, Avimol) → PESO DE BÁSCULA.
    //     El cobro real es MAX(peso_báscula) × MAX(tarifa) por orden (regla vigente en
    //     Gestión de Facturas). Una fila por ORDEN; owner = el de la planta.
    //   · ID 3/4 y demás (cedis sin báscula: Funza, Medellín) → PESO DE LA ORDEN.
    //     Una fila por ORDEN+OWNER: cantidad = Σ toneladas del detalle, total = Σ valor.
    const esBascula = idempresa === 1 || idempresa === 2
    const filasMap = new Map<string, ControlFacturaFila>()

    // WMP446 (u otras excluidas) NO las atiende LIP, SALVO cuando cargan a Susanita.
    const esExcluida = (r: any) => {
      const placa = String(r.placa ?? "").trim().toUpperCase()
      const cl = String(r.cliente ?? "").toUpperCase()
      return placasExcluidas.has(placa) && !cl.includes("SUSANITA")
    }
    // Filtro multi-operación (en código para conservar Susanita aunque se excluya Descargue).
    const opSet = new Set((filtros.tipooperaciones || []).map((o) => String(o).trim().toLowerCase()))
    const filtraOperacion = (r: any, servicio: Servicio | null) => {
      if (opSet.size === 0) return false // sin filtro → no descarta
      if (servicio === "Susanita") return false // Susanita se conserva siempre (factura del owner)
      return !opSet.has(String(r.tipooperacion ?? "").trim().toLowerCase())
    }

    if (esBascula) {
      // Acumular por orden: tarifa máxima y datos de cabecera.
      const porOrden = new Map<string, { tarifaMax: number; sinTarifa: boolean; r: any }>()
      for (const r of facturas) {
        const on = String(r.numeroorden || "").trim()
        if (!on || !procesadas.has(on)) continue
        if (esExcluida(r)) continue
        if (filtraOperacion(r, null)) continue
        const tNum = num(r.tarifa)
        const sinTarifa = String(r.tarifa) === "SIN TARIFA EN MAESTRO" || r.tarifa == null
        const prev = porOrden.get(on)
        if (prev) {
          if (tNum > prev.tarifaMax) prev.tarifaMax = tNum
          prev.sinTarifa = prev.sinTarifa && sinTarifa
        } else {
          porOrden.set(on, { tarifaMax: tNum, sinTarifa, r })
        }
      }
      const ownerPlanta = ownerDeIdEmpresa(idempresa)
      for (const [on, v] of porOrden) {
        const est = estadoPorOrden.get(on)
        const cantidad = est?.pesovascula ?? 0 // peso de báscula (fuente de verdad)
        const total = cantidad * v.tarifaMax
        filasMap.set(on, {
          numeroorden: on,
          fecha: v.r.fechacargue ?? v.r.fechaorden ?? null,
          placa: v.r.placa ?? null,
          tiquete: v.r.tiquetebascula ?? null,
          tipooperacion: v.r.tipooperacion ?? null,
          cliente: v.r.cliente ?? null,
          owner: ownerPlanta,
          toneladas: cantidad,
          fuente_peso: "bascula",
          tarifa: v.tarifaMax || null,
          valor_a_facturar: total,
          sin_tarifa: v.tarifaMax <= 0,
          estadofactura: est?.estado ?? null,
          categoria: categoriaDeFactura(est?.facturasiigo, est?.estado),
          valorpago: est?.valorpago ?? null,
        })
      }
    } else {
      // Cedis: por orden+owner, con toneladas del detalle (peso de la orden). El VALOR
      // se calcula con la TARIFA DEL SERVICIO real (propio 18.942 / recoge en bodega y
      // descargue 19.792 / Susanita 31.544) — la MISMA valoración que la prefactura, NO
      // la tarifa cruda de la vista. Así "lo que se debe facturar" es real y coincide.
      const key = (o: string, w: string) => `${o}|||${w}`
      const acc = new Map<string, { valor: number; ton: number }>()
      for (const r of facturas) {
        const on = String(r.numeroorden || "").trim()
        if (!on || !procesadas.has(on)) continue
        if (esExcluida(r)) continue
        const servicio = servicioDe(idempresa, r.tipooperacion, r.transporte, r.cliente, r.placa)
        if (filtraOperacion(r, servicio)) continue
        // Owner por el id_empresa del PRODUCTO (el dueño real, ya resuelto en la vista).
        // El propio también se atribuye al owner del producto, NO al del vehículo.
        const owner = String(r.owner || "SIN OWNER")
        const est = estadoPorOrden.get(on)
        const tarifaServ = tarifaDeServicio(servicio, r.tipooperacion, owner, tarifas)
        const ton = num(r.toneladas)
        const val = ton * tarifaServ
        const sinTarifa = tarifaServ <= 0
        const k = key(on, owner)
        const prev = filasMap.get(k)
        if (prev) {
          const a = acc.get(k)!
          a.valor += val
          a.ton += ton
          prev.toneladas = a.ton
          prev.valor_a_facturar = a.valor
          prev.tarifa = a.ton > 0 ? Math.round(a.valor / a.ton) : null
          prev.sin_tarifa = prev.sin_tarifa || sinTarifa
        } else {
          acc.set(k, { valor: val, ton })
          filasMap.set(k, {
            numeroorden: on,
            fecha: r.fechacargue ?? r.fechaorden ?? null,
            placa: r.placa ?? null,
            tiquete: r.tiquetebascula ?? null,
            tipooperacion: r.tipooperacion ?? null,
            cliente: r.cliente ?? null,
            owner,
            toneladas: ton,
            fuente_peso: "orden",
            tarifa: sinTarifa ? null : tarifaServ,
            valor_a_facturar: val,
            sin_tarifa: sinTarifa,
            estadofactura: est?.estado ?? null,
            categoria: categoriaDeFactura(est?.facturasiigo, est?.estado),
            valorpago: est?.valorpago ?? null,
          })
        }
      }
    }

    let filas = Array.from(filasMap.values())
    if (filtros.categoria) filas = filas.filter((f) => f.categoria === filtros.categoria)

    // 4) Resumen por owner + totales.
    const ownerMap = new Map<string, ResumenOwner>()
    const ordenesSet = new Set<string>()
    const ordenesSinGestionar = new Set<string>()
    const ordenesSinTarifa = new Set<string>()
    const t = {
      ordenes: 0, toneladas: 0, valor_a_facturar: 0,
      val_facturado: 0, val_en_proceso: 0, val_sin_gestionar: 0,
      ordenes_sin_gestionar: 0, ordenes_sin_tarifa: 0,
    }
    // Resumen por OWNER × TIPO DE OPERACIÓN (un owner puede tener Cargue, Descargue,
    // Distribución y se muestran separados).
    const grupoKey = (owner: string, op: string) => `${owner}|||${op}`
    for (const f of filas) {
      ordenesSet.add(f.numeroorden)
      if (f.categoria === "sin_gestionar") ordenesSinGestionar.add(f.numeroorden)
      if (f.sin_tarifa) ordenesSinTarifa.add(f.numeroorden)
      const op = f.tipooperacion || "(sin operación)"
      const gk = grupoKey(f.owner, op)
      const o = ownerMap.get(gk) || {
        owner: f.owner, operacion: op, ordenes: 0, toneladas: 0, valor_a_facturar: 0,
        val_facturado: 0, val_en_proceso: 0, val_sin_gestionar: 0,
      }
      o.toneladas += f.toneladas
      o.valor_a_facturar += f.valor_a_facturar
      if (f.categoria === "facturado") o.val_facturado += f.valor_a_facturar
      else if (f.categoria === "en_proceso") o.val_en_proceso += f.valor_a_facturar
      else o.val_sin_gestionar += f.valor_a_facturar
      ownerMap.set(gk, o)
      t.toneladas += f.toneladas
      t.valor_a_facturar += f.valor_a_facturar
      if (f.categoria === "facturado") t.val_facturado += f.valor_a_facturar
      else if (f.categoria === "en_proceso") t.val_en_proceso += f.valor_a_facturar
      else t.val_sin_gestionar += f.valor_a_facturar
    }
    // órdenes distintas por owner × operación
    const ordenesPorGrupo = new Map<string, Set<string>>()
    for (const f of filas) {
      const gk = grupoKey(f.owner, f.tipooperacion || "(sin operación)")
      const s = ordenesPorGrupo.get(gk) || new Set<string>()
      s.add(f.numeroorden)
      ordenesPorGrupo.set(gk, s)
    }
    for (const [gk, o] of ownerMap) o.ordenes = ordenesPorGrupo.get(gk)?.size || 0

    t.ordenes = ordenesSet.size
    t.ordenes_sin_gestionar = ordenesSinGestionar.size
    t.ordenes_sin_tarifa = ordenesSinTarifa.size

    const porOwner = Array.from(ownerMap.values()).sort(
      (a, b) => a.owner.localeCompare(b.owner) || a.operacion.localeCompare(b.operacion),
    )
    filas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

    return { success: true, data: { filas, porOwner, totales: t, operaciones } }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al calcular el control de facturación." }
  }
}
