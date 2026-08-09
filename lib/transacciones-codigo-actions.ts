"use server"

/**
 * Motor de "Movimiento por código" (estilo SAP): el usuario escribe el código
 * de la transacción y el sistema habilita los campos de ESE movimiento,
 * valida, postea a `invtrans` (status aprobado, origen "transaccion manual",
 * cod_movimiento explícito — el trigger de BD recalcula saldos) y deja el
 * registro completo en `inv_correcciones_log` (quién, cuándo, qué, por qué,
 * ids generados) — revisable sin tocar invtrans. Los códigos de CORRECCIÓN
 * exigen además la clave del responsable (`inv_clave_movimiento`).
 *
 * Reutiliza los patrones sancionados del módulo (registerInventoryTransaction /
 * registerProductTransfer / postCorreccionInvtrans) sin modificarlos.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUsuarioForInsert } from "@/lib/company-filter"
import { getColombiaDateTime } from "@/lib/inventory-actions"
import {
  FIELDSETS,
  type CatalogoTransaccion,
  type MovimientoOriginal,
  type EjecutarPayload,
  type CorreccionLogRow,
} from "@/lib/transacciones-codigo"

// ---------------------------------------------------------------------------
// Catálogo (nomenclatura) — columna real: codigo_sap (verificado 2026-08-08)
// ---------------------------------------------------------------------------

export async function getCatalogoTransacciones(): Promise<{
  success: boolean
  data: CatalogoTransaccion[]
  error?: string
}> {
  try {
    const sb: any = await getSupabaseAdmin()
    const { data, error } = await sb
      .from("sig_tipos_movimiento")
      .select("*")
      .eq("activo", true)
      .order("orden", { ascending: true })
    if (error) return { success: false, data: [], error: error.message }
    const rows: CatalogoTransaccion[] = (data ?? []).map((t: any) => ({
      codigo: String(t.codigo_sap ?? t.codigo ?? ""),
      nombre: t.nombre,
      clase: t.clase ?? null,
      descripcion: t.descripcion ?? null,
      origen_lipgo: t.origen_lipgo ?? null,
      afecta_stock: t.afecta_stock ?? null,
    }))
    return { success: true, data: rows.filter((r) => r.codigo) }
  } catch (e: any) {
    return { success: false, data: [], error: e?.message || "Error al leer el catálogo." }
  }
}

// ---------------------------------------------------------------------------
// Clave del responsable (solo códigos de corrección)
// ---------------------------------------------------------------------------

async function resolverClave(sb: any, clave: string): Promise<{ ok: boolean; responsable?: string; error?: string }> {
  const limpia = String(clave || "").trim()
  if (!limpia) return { ok: false, error: "Este código requiere la clave del responsable." }
  const { data, error } = await sb
    .from("inv_clave_movimiento")
    .select("responsable")
    .eq("clave", limpia)
    .eq("activo", true)
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: "Clave incorrecta o inactiva." }
  return { ok: true, responsable: data.responsable }
}

// ---------------------------------------------------------------------------
// Buscar movimiento original (reversos 102/602/552/312) — SOLO LECTURA
// ---------------------------------------------------------------------------

const MARKER_REV = (id: number) => `[rev#${id}]`

export async function buscarMovimientoOriginal(params: {
  selectedEmpresaId: number
  tipo: "entrada" | "salida" | "reproceso" | "traslado"
  codproducto?: string | null
  producto?: string | null
  lote?: string | null
  ocargue?: string | null
  invtransId?: number | null
}): Promise<{ success: boolean; data: MovimientoOriginal[]; error?: string }> {
  try {
    if (!params.selectedEmpresaId) return { success: false, data: [], error: "Selecciona un proyecto en el selector global." }
    const sb: any = await getSupabaseAdmin()
    let q = sb
      .from("invtrans")
      .select("id,tipomov,codproducto,nombreproducto,lote,location,cantidad,ocargue,origen,creado,creadopor,cod_movimiento,status")
      .eq("idempresa", params.selectedEmpresaId)
    if (params.invtransId) {
      q = q.eq("id", params.invtransId)
    } else {
      if (params.tipo === "entrada") q = q.eq("tipomov", "Entrada")
      else if (params.tipo === "salida") q = q.eq("tipomov", "Salida")
      else if (params.tipo === "reproceso") q = q.eq("tipomov", "Reproceso")
      else if (params.tipo === "traslado") q = q.ilike("origen", "%traslado entre localizaciones%").eq("tipomov", "Entrada")
      if (params.codproducto?.trim()) q = q.eq("codproducto", params.codproducto.trim())
      if (params.producto?.trim()) q = q.ilike("nombreproducto", `%${params.producto.trim()}%`)
      if (params.lote?.trim()) q = q.eq("lote", params.lote.trim())
      if (params.ocargue?.trim()) q = q.eq("ocargue", params.ocargue.trim())
    }
    const { data, error } = await q.order("id", { ascending: false }).limit(30)
    if (error) return { success: false, data: [], error: error.message }

    const filas = (data ?? []).filter((r: any) => String(r.status || "").toLowerCase().startsWith("aprob"))
    // Reversos previos de cada candidato (marcador [rev#id] en observaciones).
    const resultado: MovimientoOriginal[] = []
    for (const r of filas) {
      const { data: revs } = await sb
        .from("invtrans")
        .select("cantidad")
        .eq("idempresa", params.selectedEmpresaId)
        .ilike("observaciones", `%${MARKER_REV(Number(r.id))}%`)
      const reversado = (revs ?? []).reduce((s: number, x: any) => s + Math.abs(Number(x.cantidad) || 0), 0)
      const cantidad = Math.abs(Number(r.cantidad) || 0)
      resultado.push({
        id: Number(r.id),
        tipomov: r.tipomov,
        codproducto: r.codproducto ?? null,
        nombreproducto: r.nombreproducto ?? null,
        lote: r.lote ?? null,
        location: r.location ?? null,
        cantidad,
        ocargue: r.ocargue ?? null,
        origen: r.origen ?? null,
        creado: r.creado ?? null,
        creadopor: r.creadopor ?? null,
        cod_movimiento: r.cod_movimiento ?? null,
        reversado,
        reversible: Math.max(0, Math.round((cantidad - reversado) * 100) / 100),
      })
    }
    return { success: true, data: resultado }
  } catch (e: any) {
    return { success: false, data: [], error: e?.message || "Error al buscar el movimiento original." }
  }
}

// ---------------------------------------------------------------------------
// Helpers internos del motor
// ---------------------------------------------------------------------------

async function stockDeLote(sb: any, empresaId: number, producto: string, lote: string, location: string): Promise<number> {
  const { data } = await sb
    .from("saldoinvdetalle")
    .select("stock_actual")
    .eq("idempresa", empresaId)
    .eq("nombreproducto", producto)
    .eq("lote", lote)
    .eq("location", location)
  return (data ?? []).reduce((s: number, r: any) => s + (Number(r.stock_actual) || 0), 0)
}

async function detalleProducto(sb: any, empresaId: number, nombre: string): Promise<{ id: number; codigo: string } | null> {
  const { data } = await sb.from("productos").select("id,codigo").eq("nombre", nombre).limit(1).maybeSingle()
  if (data?.id) return { id: Number(data.id), codigo: String(data.codigo ?? "") }
  // Fallback: resolver desde saldoinvdetalle (mismo criterio que el módulo clásico).
  const { data: s } = await sb
    .from("saldoinvdetalle")
    .select("idproducto,codproducto")
    .eq("idempresa", empresaId)
    .eq("nombreproducto", nombre)
    .limit(1)
    .maybeSingle()
  if (s) return { id: Number(s.idproducto) || 0, codigo: String(s.codproducto ?? "") }
  return null
}

async function ubicacionCuarentena(sb: any, empresaId: number): Promise<string | null> {
  const { data } = await sb
    .from("locations")
    .select("codigo")
    .eq("idempresa", empresaId)
    .ilike("codigo", "%CUARENTENA%")
    .limit(1)
    .maybeSingle()
  return data?.codigo ?? null
}

// ---------------------------------------------------------------------------
// Ejecutar la transacción
// ---------------------------------------------------------------------------

export async function ejecutarTransaccionPorCodigo(payload: EjecutarPayload): Promise<{
  success: boolean
  message: string
  invtransIds?: number[]
  logId?: number
}> {
  try {
    const fs = FIELDSETS[payload.codigo]
    if (!fs) return { success: false, message: `Código ${payload.codigo} no soportado.` }
    const empresaId = Number(payload.selectedEmpresaId)
    if (!empresaId) return { success: false, message: "Selecciona un proyecto en el selector global." }
    const cantidad = Math.abs(Number(payload.cantidad) || 0)
    if (!cantidad) return { success: false, message: "Indica la cantidad." }
    const sb: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert()
    const ahora = await getColombiaDateTime()

    // Clave del responsable (solo códigos de corrección).
    let autorizadoPor: string | null = null
    if (fs.requiereClave) {
      const r = await resolverClave(sb, payload.clave || "")
      if (!r.ok) return { success: false, message: r.error || "Clave inválida." }
      autorizadoPor = r.responsable || null
      if (!String(payload.motivo || "").trim()) return { success: false, message: "Indica el motivo de la corrección." }
    }

    // Referencia (reversos): validar reversible restante.
    let ref: MovimientoOriginal | null = null
    if (fs.referencia && fs.referencia !== "ocargueOpcional") {
      if (!payload.refInvtransId) return { success: false, message: "Selecciona el movimiento original a reversar." }
      const b = await buscarMovimientoOriginal({ selectedEmpresaId: empresaId, tipo: fs.referencia, invtransId: payload.refInvtransId })
      if (!b.success || !b.data.length) return { success: false, message: "No se encontró el movimiento original." }
      ref = b.data[0]
      if (cantidad > ref.reversible) {
        return { success: false, message: `Solo quedan ${ref.reversible} unidades reversibles de ese movimiento (original ${ref.cantidad}, ya reversadas ${ref.reversado}).` }
      }
    }

    // Resolver producto/lote/ubicación efectivos.
    let producto = payload.producto?.trim() || ""
    let lote = payload.lote?.trim() || ""
    let location = payload.location?.trim() || ""
    if (ref) {
      producto = ref.nombreproducto || producto
      lote = ref.lote || lote
      location = ref.location || location
    }
    if (!producto || !lote || !location) return { success: false, message: "Faltan producto, lote o ubicación." }

    // Validar stock del lote origen cuando el movimiento consume stock.
    if (fs.cantidadContra === "stock") {
      const stock = await stockDeLote(sb, empresaId, producto, lote, location)
      if (cantidad > stock) return { success: false, message: `La cantidad (${cantidad}) supera el stock del lote en esa ubicación (${stock}).` }
    }

    // Cuarentena (344 destino / 343 origen).
    let cuarentena: string | null = null
    if (fs.destino === "cuarentena" || fs.origen === "cuarentena") {
      cuarentena = await ubicacionCuarentena(sb, empresaId)
      if (!cuarentena) {
        return { success: false, message: "No existe una ubicación CUARENTENA en este proyecto. Créala en Configuración › ubicaciones y vuelve a intentar." }
      }
      if (fs.origen === "cuarentena") location = cuarentena
    }

    const prodInfo = await detalleProducto(sb, empresaId, producto)
    const productoDestino = payload.productoDestino?.trim() || producto
    const prodDestinoInfo = productoDestino === producto ? prodInfo : await detalleProducto(sb, empresaId, productoDestino)
    if (!prodInfo) return { success: false, message: `Producto "${producto}" no encontrado.` }
    if (!prodDestinoInfo) return { success: false, message: `Producto destino "${productoDestino}" no encontrado.` }

    // Armar la(s) fila(s) de invtrans según el código.
    const { data: maxRow } = await sb.from("invtrans").select("id").order("id", { ascending: false }).limit(1).maybeSingle()
    let nextId = maxRow ? Number(maxRow.id) + 1 : 1
    const motivoTxt = String(payload.motivo || "").trim()
    const obsBase = [
      `Movimiento por código ${payload.codigo}`,
      motivoTxt ? `· ${motivoTxt}` : "",
      autorizadoPor ? `· autoriza: ${autorizadoPor}` : "",
      ref ? `· reversa invtrans #${ref.id} ${MARKER_REV(ref.id)}` : "",
      payload.ocargueRef?.trim() ? `· ref orden ${payload.ocargueRef.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" ")

    const base = (extra: any) => ({
      id: nextId++,
      idempresa: empresaId,
      idproducto: prodInfo.id,
      codproducto: prodInfo.codigo,
      nombreproducto: producto,
      lote,
      location,
      cantidad,
      status: "aprobado",
      origen: "transaccion manual",
      observaciones: obsBase,
      cod_movimiento: payload.codigo,
      creadopor: usuario,
      creado: ahora,
      ...extra,
    })

    const filas: any[] = []
    let logDestino: { producto?: string; codproducto?: string; lote?: string; location?: string } = {}

    switch (payload.codigo) {
      case "101":
      case "561":
      case "653":
      case "701":
        filas.push(base({ tipomov: "Entrada" }))
        break
      case "601":
      case "702":
        filas.push(base({ tipomov: "Salida" }))
        break
      case "551":
        filas.push(base({ tipomov: "Reproceso" }))
        break
      case "102": // reverso de entrada → salida
        filas.push(base({ tipomov: "Salida" }))
        break
      case "602": // reverso de salida → entrada
      case "552": // reverso de merma → entrada
        filas.push(base({ tipomov: "Entrada" }))
        break
      case "311":
      case "312":
      case "344":
      case "343": {
        // Par neto 0: salida de la ubicación origen + entrada a la destino.
        const locDest = payload.codigo === "344" ? cuarentena! : payload.locationDestino?.trim() || ""
        if (!locDest) return { success: false, message: "Indica la ubicación destino." }
        if (locDest === location) return { success: false, message: "La ubicación destino debe ser distinta a la de origen." }
        if (payload.codigo === "312") {
          // El reversible ya se validó contra el traslado original; además el
          // stock debe seguir físicamente en la ubicación a la que llegó.
          const stock = await stockDeLote(sb, empresaId, producto, lote, location)
          if (cantidad > stock) return { success: false, message: `La cantidad (${cantidad}) supera el stock actual del lote en ${location} (${stock}).` }
        }
        filas.push(base({ tipomov: "Salida" }))
        filas.push(base({ tipomov: "Entrada", location: locDest }))
        logDestino = { lote, location: locDest, producto, codproducto: prodInfo.codigo }
        break
      }
      case "309": {
        // Reclasificación: salida del lote/producto/ubicación equivocado +
        // entrada al correcto. Permite cambiar lote, producto y/o ubicación.
        const loteDest = payload.loteDestino?.trim() || lote
        const locDest = payload.locationDestino?.trim() || location
        if (loteDest === lote && locDest === location && productoDestino === producto) {
          return { success: false, message: "El destino es idéntico al origen — no hay nada que corregir." }
        }
        filas.push(base({ tipomov: "Salida" }))
        filas.push(
          base({
            tipomov: "Entrada",
            lote: loteDest,
            location: locDest,
            nombreproducto: productoDestino,
            codproducto: prodDestinoInfo.codigo,
            idproducto: prodDestinoInfo.id,
          }),
        )
        logDestino = { lote: loteDest, location: locDest, producto: productoDestino, codproducto: prodDestinoInfo.codigo }
        break
      }
      default:
        return { success: false, message: `Código ${payload.codigo} no soportado.` }
    }

    const { error: errIns } = await sb.from("invtrans").insert(filas)
    if (errIns) return { success: false, message: `No se pudo registrar el movimiento: ${errIns.message}` }
    const invtransIds = filas.map((f) => Number(f.id))

    // Reprocesos: 551 registra; 552 compensa (best-effort, tabla secundaria).
    if (payload.codigo === "551") {
      try {
        await sb.from("reprocesos").insert([{ idempresa: empresaId, lote, producto, codproducto: prodInfo.codigo, cantidad, creado: ahora, creadopor: usuario }])
      } catch { /* tabla opcional */ }
    }
    if (payload.codigo === "552") {
      try {
        await sb.from("reprocesos").insert([{ idempresa: empresaId, lote, producto, codproducto: prodInfo.codigo, cantidad: -cantidad, creado: ahora, creadopor: usuario }])
      } catch { /* tabla opcional */ }
    }

    // Registro revisable (inv_correcciones_log) — TODO movimiento de esta
    // pantalla queda aquí, con los ids de invtrans como evidencia.
    const { data: logRow, error: errLog } = await sb
      .from("inv_correcciones_log")
      .insert({
        idempresa: empresaId,
        codigo: payload.codigo,
        ref_invtrans_id: ref?.id ?? null,
        codproducto: prodInfo.codigo,
        producto,
        lote_origen: lote,
        location_origen: location,
        codproducto_destino: logDestino.codproducto ?? null,
        producto_destino: logDestino.producto ?? null,
        lote_destino: logDestino.lote ?? null,
        location_destino: logDestino.location ?? null,
        cantidad,
        motivo: motivoTxt || null,
        realizado_por: usuario,
        autorizado_por: autorizadoPor,
        invtrans_ids: invtransIds,
      })
      .select("id")
      .single()
    if (errLog) {
      // El movimiento YA quedó en invtrans (y en la bitácora de auditoría) —
      // se reporta el problema del log sin ocultar el éxito del movimiento.
      return { success: true, message: `Movimiento registrado (invtrans ${invtransIds.join(", ")}), pero el registro del historial falló: ${errLog.message}. ¿Corriste el SQL 52?`, invtransIds }
    }

    return { success: true, message: `Movimiento ${payload.codigo} registrado.`, invtransIds, logId: logRow?.id }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al ejecutar la transacción." }
  }
}

// ---------------------------------------------------------------------------
// Consulta de movimientos (cualquier movimiento de invtrans, desde–hasta en
// HORA COLOMBIA, toda la información, exportable a Excel desde la UI).
// SOLO LECTURA — no toca invtrans.
// ---------------------------------------------------------------------------

export async function getConsultaMovimientos(filtros: {
  selectedEmpresaId: number
  desde: string // YYYY-MM-DD (día calendario Colombia)
  hasta: string // YYYY-MM-DD
  producto?: string | null
  lote?: string | null
  location?: string | null
  tipomov?: string | null
  codigo?: string | null
  usuario?: string | null
}): Promise<{ success: boolean; data: any[]; truncado: boolean; error?: string }> {
  try {
    if (!filtros.selectedEmpresaId) return { success: false, data: [], truncado: false, error: "Selecciona un proyecto en el selector global." }
    if (!filtros.desde || !filtros.hasta) return { success: false, data: [], truncado: false, error: "Indica el rango de fechas (desde y hasta)." }
    const sb: any = await getSupabaseAdmin()
    // Día calendario de Colombia (UTC-5): el día D arranca a las D T05:00Z y
    // termina a las (D+1) T04:59:59Z.
    const desdeUtc = `${filtros.desde}T05:00:00Z`
    const hastaD = new Date(`${filtros.hasta}T00:00:00Z`)
    hastaD.setUTCDate(hastaD.getUTCDate() + 1)
    const hastaUtc = `${hastaD.toISOString().slice(0, 10)}T04:59:59Z`

    const filas: any[] = []
    let from = 0
    const MAX = 5000
    while (true) {
      let q = sb
        .from("invtrans")
        .select("id, codproducto, nombreproducto, lote, location, almacen, cantidad, tipomov, cod_movimiento, status, origen, ocargue, observaciones, creadopor, creado, pdf")
        .eq("idempresa", filtros.selectedEmpresaId)
        .gte("creado", desdeUtc)
        .lte("creado", hastaUtc)
      if (filtros.producto?.trim()) q = q.or(`nombreproducto.ilike.%${filtros.producto.trim()}%,codproducto.ilike.%${filtros.producto.trim()}%`)
      if (filtros.lote?.trim()) q = q.eq("lote", filtros.lote.trim())
      if (filtros.location?.trim()) q = q.eq("location", filtros.location.trim())
      if (filtros.tipomov?.trim()) q = q.eq("tipomov", filtros.tipomov.trim())
      if (filtros.codigo?.trim()) q = q.eq("cod_movimiento", filtros.codigo.trim())
      if (filtros.usuario?.trim()) q = q.ilike("creadopor", `%${filtros.usuario.trim()}%`)
      const { data, error } = await q.order("id", { ascending: false }).range(from, from + 999)
      if (error) return { success: false, data: [], truncado: false, error: error.message }
      filas.push(...(data ?? []))
      if (!data || data.length < 1000 || filas.length >= MAX) break
      from += 1000
    }
    return { success: true, data: filas.slice(0, MAX), truncado: filas.length >= MAX }
  } catch (e: any) {
    return { success: false, data: [], truncado: false, error: e?.message || "Error en la consulta." }
  }
}

// ---------------------------------------------------------------------------
// Historial de correcciones (pestaña de revisión, solo lectura)
// ---------------------------------------------------------------------------

export async function getHistorialCorrecciones(filtros: {
  selectedEmpresaId: number
  codigo?: string | null
  producto?: string | null
  usuario?: string | null
  desde?: string | null
  hasta?: string | null
}): Promise<{ success: boolean; data: CorreccionLogRow[]; error?: string }> {
  try {
    if (!filtros.selectedEmpresaId) return { success: false, data: [], error: "Selecciona un proyecto en el selector global." }
    const sb: any = await getSupabaseAdmin()
    let q = sb.from("inv_correcciones_log").select("*").eq("idempresa", filtros.selectedEmpresaId)
    if (filtros.codigo?.trim()) q = q.eq("codigo", filtros.codigo.trim())
    if (filtros.producto?.trim()) q = q.or(`producto.ilike.%${filtros.producto.trim()}%,codproducto.ilike.%${filtros.producto.trim()}%`)
    if (filtros.usuario?.trim()) q = q.ilike("realizado_por", `%${filtros.usuario.trim()}%`)
    if (filtros.desde) q = q.gte("created_at", filtros.desde)
    if (filtros.hasta) q = q.lte("created_at", `${filtros.hasta}T23:59:59`)
    const { data, error } = await q.order("id", { ascending: false }).limit(500)
    if (error) return { success: false, data: [], error: error.message }
    return { success: true, data: (data ?? []) as CorreccionLogRow[] }
  } catch (e: any) {
    return { success: false, data: [], error: e?.message || "Error al leer el historial." }
  }
}
