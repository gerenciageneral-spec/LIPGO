"use server"

/**
 * DEVOLUCIÓN POR MAL CARGUE (654). Las reglas están en `lib/devolucion-mal-cargue.ts` (puro,
 * 20 pruebas); aquí vive solo el ir y venir con la base.
 *
 * Gerencia (2026-10-08): la orden descontó 100 porque eso decía, pero el camión cargó 90. Las
 * 10 que nunca salieron vuelven al inventario y al pedido como pendientes.
 *
 * Qué toca, y qué NO:
 *   SÍ  invtrans            → una entrada 654 por lo devuelto, al mismo lote del que salió.
 *   SÍ  pedidosdetalle      → baja `unidadescargadas` (la columna de pendientes es GENERADA).
 *   SÍ  pedidodetalle_ocargue → el libro: esa orden llevó menos.
 *   SÍ  cabeceraoc.pesoorden → solo si la quincena del cargue sigue abierta (nómina de CEDIs).
 *   NO  detalleoc           → lo que la orden AUTORIZÓ no cambia: es el documento firmado.
 *   NO  la salida 601 original → queda como está, con su rastro. Lo devuelto se resta aparte.
 *   NO  historicolotes      → es la asignación de lo que se preparó, y sí se preparó.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUsuarioForInsert } from "@/lib/company-filter"
import { getColombiaDateTime } from "@/lib/inventory-actions"
import { autorizar } from "@/lib/autorizaciones-core"
import { motivoSinAccion } from "@/lib/puerta-modulo"
import { registrarErrorServidor } from "@/lib/errores-servidor"
import {
  CODIGO_DEVOLUCION_MAL_CARGUE,
  decidirPeso,
  lineasDevolvibles,
  observacionDevolucion,
  repartirEnPedidos,
  validarCantidad,
  type LineaDespachada,
  type LineaDevolvible,
  type MotivoDevolucion,
} from "@/lib/devolucion-mal-cargue"

const n0 = (v: unknown) => Number(v) || 0
const norm = (v: unknown) => String(v ?? "").trim().toUpperCase()

export interface OrdenParaDevolver {
  ordendecargue: string
  idorden: number
  idempresa: number
  fechacargue: string | null
  placa: string | null
  cliente: string | null
  estado: string | null
  pesoOrden: number | null
  /** true = la quincena del cargue sigue abierta, así que el peso se puede ajustar. */
  quincenaAbierta: boolean
  avisoQuincena: string | null
  lineas: LineaDevolvible[]
}

/**
 * Lo que una orden despachó y todavía se puede devolver.
 *
 * Se busca por el número de la orden, no por id: es lo que el coordinador tiene en la mano.
 */
export async function getOrdenParaDevolver(
  ocargue: string,
  selectedEmpresaId: number | null | undefined,
): Promise<{ success: boolean; data?: OrdenParaDevolver; message?: string }> {
  try {
    const oc = String(ocargue ?? "").trim()
    if (!oc) return { success: false, message: "Escribe el número de la orden de cargue." }
    const empresaId = Number(selectedEmpresaId)
    if (!empresaId) return { success: false, message: "Selecciona un proyecto en el selector global." }

    const sb: any = await getSupabaseAdmin()
    const { data: cab, error: errCab } = await sb
      .from("cabeceraoc")
      .select("id, idempresa, ordendecargue, tipooperacion, status, fechacargue, placa, cliente, pesoorden")
      .eq("idempresa", empresaId)
      .ilike("ordendecargue", oc)
      .limit(1)
      .maybeSingle()
    if (errCab) return { success: false, message: errCab.message }
    if (!cab) return { success: false, message: `No se encontró la orden ${oc} en este proyecto.` }
    if (String(cab.tipooperacion ?? "").trim().toLowerCase() !== "cargue") {
      return { success: false, message: `La orden ${cab.ordendecargue} es un ${cab.tipooperacion}. Una devolución por mal cargue solo aplica a una orden de CARGUE.` }
    }

    // Lo que salió (601 aprobado) y lo que ya volvió (654), de la misma orden.
    const { data: movs, error: errMov } = await sb
      .from("invtrans")
      .select("id, nombreproducto, codproducto, lote, location, cantidad, tipomov, cod_movimiento, status, observaciones")
      .eq("ocargue", cab.ordendecargue)
      .order("id", { ascending: true })
    if (errMov) return { success: false, message: errMov.message }

    const aprobado = (s: unknown) => String(s ?? "").trim().toLowerCase().startsWith("aprob")
    const salidas = (movs ?? []).filter((m: any) => m.tipomov === "Salida" && String(m.cod_movimiento ?? "") === "601" && aprobado(m.status))
    // Cada devolución dice de qué salida viene ("#<id>"), así el tope es por línea y no se
    // mezclan dos lotes del mismo producto.
    const devueltoPorSalida = new Map<number, number>()
    for (const m of movs ?? []) {
      if (m.tipomov !== "Entrada" || String(m.cod_movimiento ?? "") !== CODIGO_DEVOLUCION_MAL_CARGUE || !aprobado(m.status)) continue
      const ref = /invtrans #(\d+)/.exec(String(m.observaciones ?? ""))
      const id = ref ? Number(ref[1]) : 0
      if (id) devueltoPorSalida.set(id, (devueltoPorSalida.get(id) ?? 0) + n0(m.cantidad))
    }

    const despachadas: LineaDespachada[] = salidas.map((s: any) => ({
      invtransId: Number(s.id),
      producto: String(s.nombreproducto ?? ""),
      codproducto: String(s.codproducto ?? ""),
      lote: String(s.lote ?? ""),
      location: String(s.location ?? ""),
      despachado: n0(s.cantidad),
      devuelto: devueltoPorSalida.get(Number(s.id)) ?? 0,
    }))

    const q = decidirPeso({
      fechaCargue: cab.fechacargue,
      pesoOrden: cab.pesoorden,
      toneladasLinea: 1,
      cantidadLinea: 1,
      cantidadDevuelta: 0,
    })

    return {
      success: true,
      data: {
        ordendecargue: String(cab.ordendecargue),
        idorden: Number(cab.id),
        idempresa: Number(cab.idempresa),
        fechacargue: cab.fechacargue ?? null,
        placa: cab.placa ?? null,
        cliente: cab.cliente ?? null,
        estado: cab.status ?? null,
        pesoOrden: cab.pesoorden != null ? Number(cab.pesoorden) : null,
        quincenaAbierta: q.ajustar || /sigue abierta/.test(q.motivo),
        avisoQuincena: q.ajustar ? null : q.motivo,
        lineas: lineasDevolvibles(despachadas),
      },
    }
  } catch (e: any) {
    void registrarErrorServidor("inventario.getOrdenParaDevolver", e)
    return { success: false, message: e?.message || "No se pudo leer la orden." }
  }
}

export interface DevolucionPayload {
  selectedEmpresaId: number | null | undefined
  ocargue: string
  /** El id de la salida 601 de la que vuelve el producto. */
  invtransOrigen: number
  cantidad: number
  /** A dónde vuelve físicamente. Por defecto, la ubicación de la que salió. */
  location: string
  motivo: MotivoDevolucion
  detalle?: string | null
  clave: string
}

export interface DevolucionResultado {
  success: boolean
  message: string
  invtransId?: number
  pedidosAjustados?: Array<{ idpedido: number; devolver: number }>
  pesoAjustado?: { de: number; a: number } | null
  avisoPeso?: string
}

/**
 * Registra la devolución: entra al inventario, el pedido vuelve a pendiente y —si la quincena
 * sigue abierta— baja el peso de la orden. Todo o nada hasta donde la base lo permite: si el
 * movimiento de inventario falla no se toca nada más, y si falla algo después, se borra el
 * movimiento para no dejar el inventario corregido a medias.
 */
export async function registrarDevolucionMalCargue(payload: DevolucionPayload): Promise<DevolucionResultado> {
  const motivoAccion = await motivoSinAccion(["Transacciones de Inventario"], "crear", "Devolución por mal cargue")
  if (motivoAccion) return { success: false, message: motivoAccion }
  try {
    const empresaId = Number(payload.selectedEmpresaId)
    if (!empresaId) return { success: false, message: "Selecciona un proyecto en el selector global." }
    if (!String(payload.detalle ?? "").trim() && !payload.motivo) return { success: false, message: "Indica el motivo de la devolución." }

    const orden = await getOrdenParaDevolver(payload.ocargue, empresaId)
    if (!orden.success || !orden.data) return { success: false, message: orden.message ?? "No se encontró la orden." }
    const o = orden.data

    const linea = o.lineas.find((l) => l.invtransId === Number(payload.invtransOrigen))
    const v = validarCantidad(linea, payload.cantidad)
    if (!v.ok) return { success: false, message: v.error! }
    const cantidad = n0(payload.cantidad)

    // Clave del responsable (regla de gerencia: "con clave del responsable").
    const auth = await autorizar({
      proceso: `inv_${CODIGO_DEVOLUCION_MAL_CARGUE}`,
      idempresa: empresaId,
      clave: payload.clave,
      referencia: `devolución por mal cargue de ${o.ordendecargue}: ${cantidad} de ${linea!.producto} (lote ${linea!.lote})`,
    })
    if (!auth.ok) return { success: false, message: auth.error || "Clave no autorizada." }

    const sb: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert()
    const ahora = await getColombiaDateTime()
    const location = String(payload.location ?? "").trim() || linea!.location

    // 1) EL INVENTARIO. Se fecha HOY, no el día del cargue: el producto vuelve hoy, y así una
    //    devolución de una orden vieja no le mete un ingreso a un mes ya conciliado.
    const { data: maxRow } = await sb.from("invtrans").select("id").order("id", { ascending: false }).limit(1).maybeSingle()
    const nuevoId = (Number(maxRow?.id) || 0) + 1
    const { data: prod } = await sb.from("productos").select("id").eq("codigo", linea!.codproducto).limit(1).maybeSingle()
    const { error: errIns } = await sb.from("invtrans").insert({
      id: nuevoId,
      idempresa: empresaId,
      idproducto: prod?.id ?? null,
      codproducto: linea!.codproducto,
      nombreproducto: linea!.producto,
      lote: linea!.lote,
      location,
      cantidad,
      tipomov: "Entrada",
      cod_movimiento: CODIGO_DEVOLUCION_MAL_CARGUE,
      status: "aprobado",
      origen: "devolución por mal cargue",
      ocargue: o.ordendecargue,
      creado: ahora,
      creadopor: usuario,
      observaciones: observacionDevolucion({
        ocargue: o.ordendecargue,
        motivo: payload.motivo,
        detalle: payload.detalle,
        invtransOrigen: linea!.invtransId,
        autorizadoPor: auth.autorizadoPor,
      }),
    })
    if (errIns) return { success: false, message: `No se pudo registrar la devolución: ${errIns.message}` }

    const deshacer = async (porque: string): Promise<DevolucionResultado> => {
      await sb.from("invtrans").delete().eq("id", nuevoId)
      return { success: false, message: `${porque} No se registró nada.` }
    }

    // 2) EL PEDIDO. El libro dice cuánto le llevó ESTA orden a cada línea; de ahí se baja.
    const { data: libro, error: errLibro } = await sb
      .from("pedidodetalle_ocargue")
      .select("transid, idpedido, unidades")
      .eq("ocargue", o.ordendecargue)
    if (errLibro) return await deshacer(`No se pudo leer el control del pedido: ${errLibro.message}.`)

    const transids = (libro ?? []).map((f: any) => Number(f.transid))
    let lineasPedido: any[] = []
    if (transids.length) {
      const { data, error } = await sb
        .from("pedidosdetalle")
        .select("transid, idpedido, producto, unidades, unidadescargadas")
        .in("transid", transids)
      if (error) return await deshacer(`No se pudieron leer las líneas del pedido: ${error.message}.`)
      lineasPedido = data ?? []
    }
    // Solo las líneas del MISMO producto: una orden puede llevar varios y no se cruzan.
    const delProducto = (libro ?? []).filter((f: any) => {
      const l = lineasPedido.find((x: any) => Number(x.transid) === Number(f.transid))
      return l && norm(l.producto) === norm(linea!.producto)
    })
    const ajustes = repartirEnPedidos(
      delProducto.map((f: any) => ({ transid: Number(f.transid), idpedido: Number(f.idpedido), unidadesEnLibro: n0(f.unidades) })),
      cantidad,
    )

    for (const a of ajustes) {
      const l = lineasPedido.find((x: any) => Number(x.transid) === a.transid)
      const cargadasNuevas = Math.max(0, n0(l?.unidadescargadas) - a.devolver)
      // `unidadespendientes` es GENERADA: se recalcula sola al bajar las cargadas.
      const { error } = await sb.from("pedidosdetalle").update({ unidadescargadas: cargadasNuevas }).eq("transid", a.transid)
      if (error) return await deshacer(`No se pudo devolver el pendiente al pedido ${a.idpedido}: ${error.message}.`)

      if (a.unidadesNuevasEnLibro > 0) {
        await sb.from("pedidodetalle_ocargue").update({ unidades: a.unidadesNuevasEnLibro }).eq("transid", a.transid).eq("ocargue", o.ordendecargue)
      } else {
        await sb.from("pedidodetalle_ocargue").delete().eq("transid", a.transid).eq("ocargue", o.ordendecargue)
      }
    }

    // 3) EL PESO DE LA ORDEN, solo si la quincena sigue abierta.
    const { data: det } = await sb
      .from("detalleoc")
      .select("cantidad, toneladas")
      .eq("idorden", o.idorden)
      .eq("producto", linea!.producto)
      .limit(1)
      .maybeSingle()
    const peso = decidirPeso({
      fechaCargue: o.fechacargue,
      pesoOrden: o.pesoOrden,
      toneladasLinea: det?.toneladas,
      cantidadLinea: det?.cantidad,
      cantidadDevuelta: cantidad,
    })
    let pesoAjustado: { de: number; a: number } | null = null
    if (peso.ajustar && peso.pesoNuevo != null) {
      const { error } = await sb.from("cabeceraoc").update({ pesoorden: peso.pesoNuevo }).eq("id", o.idorden)
      if (error) return await deshacer(`No se pudo ajustar el peso de la orden: ${error.message}.`)
      pesoAjustado = { de: n0(o.pesoOrden), a: peso.pesoNuevo }
    }

    const quePaso = [
      `${cantidad} ${cantidad === 1 ? "unidad" : "unidades"} de ${linea!.producto} volvieron al inventario (lote ${linea!.lote}, ${location}).`,
      ajustes.length
        ? `Pendiente devuelto a ${ajustes.length === 1 ? `el pedido ${ajustes[0].idpedido}` : `${ajustes.length} pedidos`}.`
        : "La orden no tiene pedido ligado, así que no hubo pendiente que devolver.",
      pesoAjustado ? `Peso de la orden: ${pesoAjustado.de} → ${pesoAjustado.a}.` : "",
    ]
      .filter(Boolean)
      .join(" ")

    return {
      success: true,
      message: quePaso,
      invtransId: nuevoId,
      pedidosAjustados: ajustes.map((a) => ({ idpedido: a.idpedido, devolver: a.devolver })),
      pesoAjustado,
      avisoPeso: peso.ajustar ? undefined : peso.motivo,
    }
  } catch (e: any) {
    void registrarErrorServidor("inventario.registrarDevolucionMalCargue", e)
    return { success: false, message: e?.message || "No se pudo registrar la devolución." }
  }
}
