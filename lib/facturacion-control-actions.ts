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

// Clasificación de estadofactura → categoría del control.
const ESTADOS_FACTURADO = new Set([
  "CF - Cerrado",
  "SF - Cerrado",
  "Facturado - por validar",
  "Confirmado - recibido",
])
const ESTADOS_EN_PROCESO = new Set(["CF - Factura solicitada", "SF - Pago confirmado", "A credito"])

function categoriaDeEstado(estado: string | null | undefined): CategoriaFactura {
  const e = String(estado ?? "").trim()
  if (ESTADOS_FACTURADO.has(e)) return "facturado"
  if (ESTADOS_EN_PROCESO.has(e)) return "en_proceso"
  if (/validado/i.test(e)) return "facturado"
  return "sin_gestionar" // null / vacío / desconocido
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
}

export interface FiltrosControl {
  desde?: string | null
  hasta?: string | null
  owner?: string | null
  tipooperacion?: string | null
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
  if (cl.includes("SUSANITA")) return "Susanita"
  // La PLACA DE DISTRIBUCIÓN (vehículo propio) manda: "Cargue Y Descargue propio"
  // agrupa todas sus operaciones (cargue, distribución y descargue).
  if (esPlacaDistribucion(empresa, placa)) return "Cargue/Descargue propio"
  if (op === "descargue") return "Descargue"
  if (tr === "TERCEROS") return "Cargue recoge en bodega"
  return "Cargue recoge en bodega" // fallback (cargue de tercero)
}

// Tarifa que factura cada SERVICIO (desde tarifasoperacion). Clave: recoge en bodega
// se cobra a la tarifa de DESCARGUE, no a la de cargue.
//   Propio → Cargue · Recoge en bodega/Descargue → Descargue · Susanita → Descargue SUSANITA.
function tarifaDeServicio(
  servicio: Servicio,
  tarifas: { cargue: number; descargue: number; susanita: number },
): number {
  switch (servicio) {
    case "Cargue/Descargue propio":
      return tarifas.cargue
    case "Cargue recoge en bodega":
    case "Descargue":
      return tarifas.descargue
    case "Susanita":
      return tarifas.susanita
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
}
export interface PrefacturaResumen {
  owner: string
  servicio: string
  toneladas: number
  tarifa: number
  valor: number // toneladas × tarifa del servicio
}
export interface Prefactura {
  origen: PrefacturaLinea[]
  resumen: PrefacturaResumen[]
  totalValor: number
  totalToneladas: number
}

/**
 * Arma la PREFACTURA de un proyecto (idempresa) para un rango: la TABLA ORIGEN
 * (líneas de la vista `facturacion`, owner ya resuelto) + un resumen por
 * owner×servicio. Solo órdenes procesadas. Base para el anexo/soporte de factura.
 */
export async function getPrefactura(
  idempresa: number,
  filtros: { desde?: string | null; hasta?: string | null } = {},
): Promise<{ success: boolean; data?: Prefactura; message?: string }> {
  if (!idempresa) return { success: false, message: "Selecciona un proyecto/empresa." }
  try {
    const sb: any = await getSupabaseAdmin()

    // Tarifas por servicio desde tarifasoperacion (Cargue, Descargue, Descargue SUSANITA).
    const tarifas = { cargue: 0, descargue: 0, susanita: 0 }
    {
      const { data: tar } = await sb
        .from("tarifasoperacion")
        .select("operacion, empresafactura, tarifa")
        .eq("empresaid", idempresa)
      for (const t of tar || []) {
        const op = String(t.operacion ?? "").trim().toLowerCase()
        const fact = String(t.empresafactura ?? "").trim().toUpperCase()
        const v = num(t.tarifa)
        if (op === "cargue" || op === "distribucion") tarifas.cargue = Math.max(tarifas.cargue, v)
        else if (op === "descargue") {
          if (fact === "SUSANITA") tarifas.susanita = Math.max(tarifas.susanita, v)
          else tarifas.descargue = Math.max(tarifas.descargue, v)
        }
      }
    }

    // Placas que NO atiende LIP (excepto cuando cargan a Susanita). Ej. WMP446 en id 4.
    const placasExcluidas = new Set((PLACAS_EXCLUIDAS_FACTURAS[idempresa] || []).map((p) => p.toUpperCase()))

    // Procesadas del proyecto (fuente de verdad).
    const procesadas = new Set<string>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb
        .from("cabeceraoc")
        .select("ordendecargue, fincargue, facturar, tipooperacion")
        .eq("idempresa", idempresa)
        .neq("tipooperacion", "proyeccion")
        .range(offset, offset + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      for (const o of data) {
        if (o.fincargue && o.facturar !== false) procesadas.add(String(o.ordendecargue || "").trim())
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
          owner: String(r.owner || "SIN OWNER"),
          subcategoria: r.subcategoria ?? null,
          idempresa: Number(r.idempresa),
          transporte: r.transporte ?? null,
          tipooperacion: r.tipooperacion ?? null,
          tarifa: r.tarifa ?? null,
          valor_a_facturar: num(r.valor_a_facturar),
          servicio,
        })
      }
      if (data.length < 1000) break
    }

    // Resumen por owner × servicio, facturado a la TARIFA DEL SERVICIO (no la de la línea).
    const map = new Map<string, PrefacturaResumen>()
    let totalToneladas = 0
    for (const l of origen) {
      const k = `${l.owner}|||${l.servicio}`
      const tarifaServ = tarifaDeServicio(l.servicio as Servicio, tarifas)
      const r = map.get(k) || { owner: l.owner, servicio: l.servicio, toneladas: 0, tarifa: tarifaServ, valor: 0 }
      r.toneladas += l.toneladas
      r.tarifa = tarifaServ
      map.set(k, r)
      totalToneladas += l.toneladas
    }
    let totalValor = 0
    for (const r of map.values()) {
      r.valor = r.toneladas * r.tarifa
      totalValor += r.valor
    }
    const resumen = Array.from(map.values()).sort(
      (a, b) => a.owner.localeCompare(b.owner) || a.servicio.localeCompare(b.servicio),
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

    // 1) Estado + vínculo de las órdenes de la empresa (fuente de verdad).
    //    Solo procesadas (fincargue) y facturables (facturar != false).
    const estadoPorOrden = new Map<
      string,
      { estado: string | null; valorpago: number | null; pesovascula: number }
    >()
    const procesadas = new Set<string>()
    {
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await sb
          .from("cabeceraoc")
          .select("ordendecargue, estadofactura, valorpago, fincargue, facturar, tipooperacion, pesovascula")
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
            valorpago: o.valorpago ?? null,
            pesovascula: num(o.pesovascula),
          })
          if (o.fincargue && o.facturar !== false) procesadas.add(on)
        }
        if (data.length < pageSize) break
      }
    }

    // 2) Líneas de la vista `facturacion` de la empresa (valor por owner).
    let facturas: any[] = []
    {
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        let q = sb
          .from("facturacion")
          .select("numeroorden, fechacargue, fechaorden, placa, tiquetebascula, cliente, producto, toneladas, owner, tipooperacion, tarifa, valor_a_facturar")
          .eq("idempresa", idempresa)
        if (filtros.desde) q = q.gte("fechacargue", filtros.desde)
        if (filtros.hasta) q = q.lte("fechacargue", filtros.hasta)
        if (filtros.owner) q = q.eq("owner", filtros.owner)
        if (filtros.tipooperacion) q = q.eq("tipooperacion", filtros.tipooperacion)
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

    if (esBascula) {
      // Acumular por orden: tarifa máxima y datos de cabecera.
      const porOrden = new Map<string, { tarifaMax: number; sinTarifa: boolean; r: any }>()
      for (const r of facturas) {
        const on = String(r.numeroorden || "").trim()
        if (!on || !procesadas.has(on)) continue
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
          categoria: categoriaDeEstado(est?.estado),
          valorpago: est?.valorpago ?? null,
        })
      }
    } else {
      // Cedis: por orden+owner, con toneladas del detalle (peso de la orden).
      const key = (o: string, w: string) => `${o}|||${w}`
      for (const r of facturas) {
        const on = String(r.numeroorden || "").trim()
        if (!on || !procesadas.has(on)) continue
        const owner = String(r.owner || "SIN OWNER")
        const est = estadoPorOrden.get(on)
        const sinTarifa = String(r.tarifa) === "SIN TARIFA EN MAESTRO" || r.tarifa == null
        const k = key(on, owner)
        const prev = filasMap.get(k)
        const val = num(r.valor_a_facturar)
        const ton = num(r.toneladas)
        if (prev) {
          prev.toneladas += ton
          prev.valor_a_facturar += val
          prev.sin_tarifa = prev.sin_tarifa || sinTarifa
        } else {
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
            tarifa: sinTarifa ? null : num(r.tarifa),
            valor_a_facturar: val,
            sin_tarifa: sinTarifa,
            estadofactura: est?.estado ?? null,
            categoria: categoriaDeEstado(est?.estado),
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
    for (const f of filas) {
      ordenesSet.add(f.numeroorden)
      if (f.categoria === "sin_gestionar") ordenesSinGestionar.add(f.numeroorden)
      if (f.sin_tarifa) ordenesSinTarifa.add(f.numeroorden)
      const o = ownerMap.get(f.owner) || {
        owner: f.owner, ordenes: 0, toneladas: 0, valor_a_facturar: 0,
        val_facturado: 0, val_en_proceso: 0, val_sin_gestionar: 0,
      }
      o.toneladas += f.toneladas
      o.valor_a_facturar += f.valor_a_facturar
      if (f.categoria === "facturado") o.val_facturado += f.valor_a_facturar
      else if (f.categoria === "en_proceso") o.val_en_proceso += f.valor_a_facturar
      else o.val_sin_gestionar += f.valor_a_facturar
      ownerMap.set(f.owner, o)
      t.toneladas += f.toneladas
      t.valor_a_facturar += f.valor_a_facturar
      if (f.categoria === "facturado") t.val_facturado += f.valor_a_facturar
      else if (f.categoria === "en_proceso") t.val_en_proceso += f.valor_a_facturar
      else t.val_sin_gestionar += f.valor_a_facturar
    }
    // ordenes por owner (distintas)
    const ordenesPorOwner = new Map<string, Set<string>>()
    for (const f of filas) {
      const s = ordenesPorOwner.get(f.owner) || new Set<string>()
      s.add(f.numeroorden)
      ordenesPorOwner.set(f.owner, s)
    }
    for (const [w, o] of ownerMap) o.ordenes = ordenesPorOwner.get(w)?.size || 0

    t.ordenes = ordenesSet.size
    t.ordenes_sin_gestionar = ordenesSinGestionar.size
    t.ordenes_sin_tarifa = ordenesSinTarifa.size

    const porOwner = Array.from(ownerMap.values()).sort((a, b) => b.valor_a_facturar - a.valor_a_facturar)
    filas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

    return { success: true, data: { filas, porOwner, totales: t } }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al calcular el control de facturación." }
  }
}
