"use server"

// Cuadro de Mando de Facturación (pestaña dentro de Gestión de Facturas).
// FUENTE DE VERDAD: las órdenes de servicio procesadas (cabeceraoc con fincargue
// y facturar != false). Se cruzan con lo que YA se facturó (estadofactura) para
// garantizar que todo lo procesado se facture — y detectar lo que quedó sin gestionar.
// El valor a facturar por OWNER sale de la vista `facturacion` (tarifa × toneladas,
// misma fuente que la facturación real). El cobro de cartera (que el cliente pague)
// es el paso siguiente y NO se cruza aquí.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { esPlacaDistribucion, cargarPlacasDistribucion } from "@/lib/distribucion-placas"
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

// Tarifas de una empresa POR (operación, OWNER, SUBCATEGORÍA de producto), leídas de
// `tarifasoperacion`. La tarifa varía por owner (empresafactura) Y por producto/subcategoría
// (ej. en Avimol Cargue de PT=15.099 y de sub-producto Mogolla=19.416; en Funza Cargue
// Molinos=17.318 vs AVIMOL/Indupan=14.844). Todo sale de la tabla, sin hardcodear.
export interface TarifasEmpresa {
  exact: Map<string, number> // `${op}|||${ownerK}|||${subcatK}` → tarifa
  porOpOwner: Map<string, number> // `${op}|||${ownerK}` → máximo (fallback si no hay subcat)
  porOp: Map<string, number> // `${op}` → máximo (fallback general)
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

// Normaliza la SUBCATEGORÍA a la categoría de tarifa. Los SUB-PRODUCTOS (Mogolla,
// Salvado, Harina de Tercera) comparten la misma tarifa "Mogolla Kg." (confirmado por
// el usuario); lo demás (Producto Terminado, etc.) queda con su nombre normalizado.
function subcatKey(s: string | null | undefined): string {
  const k = ownerKey(s)
  if (k.includes("MOGOLLA") || k.includes("SALVADO") || k.includes("TERCERA")) return "MOGOLLA KG."
  return k
}

async function tarifasDeEmpresa(sb: any, idempresa: number): Promise<TarifasEmpresa> {
  const t: TarifasEmpresa = { exact: new Map(), porOpOwner: new Map(), porOp: new Map(), susanita: 0 }
  const setMax = (m: Map<string, number>, k: string, v: number) => m.set(k, Math.max(m.get(k) || 0, v))
  const { data: tar } = await sb
    .from("tarifasoperacion")
    .select("operacion, empresafactura, producto, tarifa")
    .eq("empresaid", idempresa)
  for (const r of tar || []) {
    const op = String(r.operacion ?? "").trim().toLowerCase()
    const owner = ownerKey(r.empresafactura)
    const subcat = subcatKey(r.producto) // el JOIN de la vista es t.producto = subcategoría del producto
    const v = num(r.tarifa)
    if (!op || v <= 0) continue
    // Descargue SUSANITA es una tarifa especial por cliente, no por owner/producto.
    if (op === "descargue" && owner === "SUSANITA") { t.susanita = Math.max(t.susanita, v); continue }
    setMax(t.exact, `${op}|||${owner}|||${subcat}`, v)
    setMax(t.porOpOwner, `${op}|||${owner}`, v)
    setMax(t.porOp, op, v)
  }
  return t
}

// Tarifa por (operación, owner, subcategoría) con fallback: exacta → (op+owner) → (op).
function lookupTarifa(operacion: string | null, owner: string, subcategoria: string | null, t: TarifasEmpresa): number {
  const op = String(operacion ?? "").trim().toLowerCase()
  const ok = ownerKey(owner)
  const sk = subcatKey(subcategoria)
  return (
    t.exact.get(`${op}|||${ok}|||${sk}`) ??
    t.porOpOwner.get(`${op}|||${ok}`) ??
    t.porOp.get(op) ??
    0
  )
}

// Tarifa de UNA línea por (operación REAL, OWNER, SUBCATEGORÍA del producto), todo desde la tabla:
//   · Susanita (cliente/transporte SUSANITA) → Descargue SUSANITA.
//   · Recoge en bodega SOLO en cedis (Cargue + transporte TERCEROS, placa no propia) → tarifa de DESCARGUE.
//   · Todo lo demás (Cargue/Descargue/Distribucion/Tolva…) → tarifa de SU operación, por owner y subcategoría.
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
  const tr = String(transporte ?? "").trim().toUpperCase()
  const cl = String(cliente ?? "").toUpperCase()
  if (cl.includes("SUSANITA") || tr === "SUSANITA") return tarifas.susanita || lookupTarifa("descargue", owner, subcategoria, tarifas)
  // "Recoge en bodega" (Cargue TERCEROS cobrado a tarifa de DESCARGUE) es regla SOLO de
  // Medellín (id4). En Funza (id3) y demás, un Cargue usa la tarifa de CARGUE normal.
  if (idempresa === 4 && op === "cargue" && tr === "TERCEROS" && !esPlacaDistribucion(idempresa, placa)) {
    return lookupTarifa("descargue", owner, subcategoria, tarifas) // recoge en bodega (Medellín)
  }
  return lookupTarifa(op, owner, subcategoria, tarifas)
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
    await cargarPlacasDistribucion() // caché de placas de distribución para servicioDe/tarifaDe

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
    const estadoPorOrden = new Map<string, { estado: string | null; facturasiigo: string | null; pesovascula: number }>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb
        .from("cabeceraoc")
        .select("ordendecargue, fincargue, facturar, tipooperacion, estadofactura, facturasiigo, pesovascula")
        .eq("idempresa", idempresa)
        .neq("tipooperacion", "proyeccion")
        .range(offset, offset + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      for (const o of data) {
        const on = String(o.ordendecargue || "").trim()
        estadoPorOrden.set(on, { estado: o.estadofactura ?? null, facturasiigo: o.facturasiigo ?? null, pesovascula: num(o.pesovascula) })
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
        const tServicio = tarifaDeServicio(idempresa, r.tipooperacion, r.transporte, r.cliente, r.placa, owner, r.subcategoria, tarifas)
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

    // PLANTAS (id 1/2, con báscula): el peso a facturar es el de BÁSCULA (tiquete),
    // prorrateado entre owners por su participación en el detalle. Se escala toneladas
    // y valor de cada línea por (pesovascula / Σ detalle de la orden). Σ por owner = báscula.
    if (idempresa === 1 || idempresa === 2) {
      const totalDetOrden = new Map<string, number>()
      for (const l of origen) totalDetOrden.set(l.numeroorden, (totalDetOrden.get(l.numeroorden) || 0) + l.toneladas)
      for (const l of origen) {
        const P = estadoPorOrden.get(l.numeroorden)?.pesovascula ?? 0
        const totalDet = totalDetOrden.get(l.numeroorden) || 0
        if (P > 0 && totalDet > 0) {
          const scale = P / totalDet
          l.toneladas = l.toneladas * scale
          l.valorServicio = l.valorServicio * scale
        }
      }
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
    await cargarPlacasDistribucion() // caché de placas de distribución para servicioDe/tarifaDe

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
          .select("numeroorden, fechacargue, fechaorden, placa, tiquetebascula, cliente, producto, subcategoria, toneladas, owner, transporte, tipooperacion, tarifa, valor_a_facturar")
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

    // 3) Agregar por ORDEN+OWNER. Toneladas por el id_empresa del PRODUCTO (dueño real);
    //    valor = Σ(toneladas × tarifa por operación/owner). En PLANTAS (id 1/2, con báscula)
    //    el peso a facturar es el de BÁSCULA (pesovascula, el del tiquete): se PRORRATEA
    //    entre los owners según su participación en el detalle (Σ pesos por owner = báscula).
    //    En CEDIS (sin báscula) se usa el peso del detalle de la orden.
    const esBascula = idempresa === 1 || idempresa === 2

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

    const key = (o: string, w: string) => `${o}|||${w}`
    type Acc = { on: string; owner: string; op: string; tonDet: number; valorDet: number; sinTarifa: boolean; r: any }
    const accMap = new Map<string, Acc>()
    const ordenTotalDet = new Map<string, number>() // Σ toneladas del detalle por orden (todos los owners)
    for (const r of facturas) {
      const on = String(r.numeroorden || "").trim()
      if (!on || !procesadas.has(on)) continue
      if (esExcluida(r)) continue
      const servicio = servicioDe(idempresa, r.tipooperacion, r.transporte, r.cliente, r.placa)
      if (filtraOperacion(r, servicio)) continue
      const owner = String(r.owner || "SIN OWNER")
      const ton = num(r.toneladas)
      const tarifa = tarifaDeServicio(idempresa, r.tipooperacion, r.transporte, r.cliente, r.placa, owner, r.subcategoria, tarifas)
      const sinTarifa = tarifa <= 0
      const k = key(on, owner)
      const a = accMap.get(k)
      if (a) {
        a.tonDet += ton
        a.valorDet += ton * tarifa
        a.sinTarifa = a.sinTarifa && sinTarifa
      } else {
        accMap.set(k, { on, owner, op: r.tipooperacion || "", tonDet: ton, valorDet: ton * tarifa, sinTarifa, r })
      }
      ordenTotalDet.set(on, (ordenTotalDet.get(on) || 0) + ton)
    }

    const filasMap = new Map<string, ControlFacturaFila>()
    for (const [k, a] of accMap) {
      const est = estadoPorOrden.get(a.on)
      let toneladas = a.tonDet
      let valor = a.valorDet
      let fuente: "bascula" | "orden" = "orden"
      if (esBascula) {
        const P = est?.pesovascula ?? 0
        const totalDet = ordenTotalDet.get(a.on) || 0
        if (P > 0 && totalDet > 0) {
          const scale = P / totalDet // reparte el peso de báscula por participación del detalle
          toneladas = a.tonDet * scale
          valor = a.valorDet * scale
          fuente = "bascula"
        }
      }
      filasMap.set(k, {
        numeroorden: a.on,
        fecha: a.r.fechacargue ?? a.r.fechaorden ?? null,
        placa: a.r.placa ?? null,
        tiquete: a.r.tiquetebascula ?? null,
        tipooperacion: a.op || null,
        cliente: a.r.cliente ?? null,
        owner: a.owner,
        toneladas,
        fuente_peso: fuente,
        tarifa: a.sinTarifa || toneladas <= 0 ? null : Math.round(valor / toneladas),
        valor_a_facturar: valor,
        sin_tarifa: a.sinTarifa,
        estadofactura: est?.estado ?? null,
        categoria: categoriaDeFactura(est?.facturasiigo, est?.estado),
        valorpago: est?.valorpago ?? null,
      })
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

/**
 * Valor NETO por orden (mismo cálculo del cuadro/prefactura: cada operación × tarifa por
 * owner/id_empresa/subcategoría; báscula prorrateada en plantas). LIGERO: solo calcula
 * las órdenes que se le pasan (la página visible de Gestión de Facturas). Base antes de
 * IVA/retefuente (la factura de Siigo suma esos). Devuelve { ordendecargue: valorNeto }.
 */
export async function getValoresNetosOrden(
  idempresa: number,
  ordenes: string[],
): Promise<{ success: boolean; data: Record<string, number>; message?: string }> {
  if (!idempresa || !ordenes?.length) return { success: true, data: {} }
  try {
    const sb: any = await getSupabaseAdmin()
    await cargarPlacasDistribucion() // caché de placas de distribución para tarifaDeServicio
    const tarifas = await tarifasDeEmpresa(sb, idempresa)
    const placasExcluidas = new Set((PLACAS_EXCLUIDAS_FACTURAS[idempresa] || []).map((p) => p.toUpperCase()))
    const esBascula = idempresa === 1 || idempresa === 2
    const nums = [...new Set(ordenes.map((o) => String(o || "").trim()).filter(Boolean))]
    const chunks: string[][] = []
    for (let i = 0; i < nums.length; i += 200) chunks.push(nums.slice(i, i + 200))

    // Peso de báscula por orden (solo plantas, para prorratear).
    const pesoV = new Map<string, number>()
    if (esBascula) {
      for (const chunk of chunks) {
        const { data } = await sb.from("cabeceraoc").select("ordendecargue, pesovascula").eq("idempresa", idempresa).in("ordendecargue", chunk)
        for (const o of data || []) pesoV.set(String(o.ordendecargue || "").trim(), num(o.pesovascula))
      }
    }

    // Líneas de la vista SOLO de esas órdenes.
    const valorAcc = new Map<string, number>()
    const totalDet = new Map<string, number>()
    for (const chunk of chunks) {
      const { data } = await sb
        .from("facturacion")
        .select("numeroorden, owner, subcategoria, toneladas, tipooperacion, transporte, placa, cliente")
        .eq("idempresa", idempresa)
        .in("numeroorden", chunk)
      for (const r of data || []) {
        const on = String(r.numeroorden || "").trim()
        const placa = String(r.placa ?? "").trim().toUpperCase()
        const cl = String(r.cliente ?? "").toUpperCase()
        if (placasExcluidas.has(placa) && !cl.includes("SUSANITA")) continue // WMP446 salvo Susanita
        const owner = String(r.owner || "SIN OWNER")
        const ton = num(r.toneladas)
        const tarifa = tarifaDeServicio(idempresa, r.tipooperacion, r.transporte, r.cliente, r.placa, owner, r.subcategoria, tarifas)
        valorAcc.set(on, (valorAcc.get(on) || 0) + ton * tarifa)
        totalDet.set(on, (totalDet.get(on) || 0) + ton)
      }
    }

    const map: Record<string, number> = {}
    for (const [on, valor] of valorAcc) {
      let v = valor
      if (esBascula) {
        const P = pesoV.get(on) || 0
        const td = totalDet.get(on) || 0
        if (P > 0 && td > 0) v = valor * (P / td) // prorratea el valor al peso de báscula
      }
      map[on] = Math.round(v)
    }
    return { success: true, data: map }
  } catch (e: any) {
    return { success: false, data: {}, message: e?.message || "Error al calcular valores netos." }
  }
}
