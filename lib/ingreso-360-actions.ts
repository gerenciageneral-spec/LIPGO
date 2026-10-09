"use server"

// VISTA 360 DE UN INGRESO AL INVENTARIO (gerencia, 2026-10-08): "se debe ver el 360 de
// cualquier descargue o ingreso de producción que genera ingresos a inventario, al igual
// que el ingreso de averías, de igual manera el 360 de las salidas que son las órdenes".
//
// Se escribe el número de la orden de descargue (manual o autodescargue) —o el #id de un
// movimiento de entrada— y se ve el ciclo completo: qué dice la orden, de qué cargue de
// planta viene y con qué lotes salió, qué entró de verdad al inventario (lote, ubicación,
// quién aprobó y cuándo), qué sigue por aprobar o se rechazó, y si hay ingresos a mano del
// mismo producto en esos días que debieron citar esta orden (así se encontró el descuadre
// de Cedi Funza: 16.453 unidades digitadas sin el número de orden).
//
// Las fuentes:
//   · ORDEN     `cabeceraoc` + `detalleoc` — lo que se declaró que llegaba.
//   · PLANTA    `historicolotes` del cargue madre (`ordenorigen`) — con qué lotes salió.
//   · INGRESO   `invtrans` tipomov Entrada que cita la orden — lo que entró, por estado.
//   · APROBÓ    `historialaprobaciones` (mismo id que invtrans) — quién y cuándo.

import { getSupabaseAdminAsSystem } from "@/lib/supabase-admin"
import { accesoPedidos } from "@/lib/acceso-empresa"
import { esAprobado, esRechazado, normProducto } from "@/lib/cuadre-por-orden"

const n0 = (v: unknown) => Number(v) || 0

export interface MovIngreso360 {
  id: number
  producto: string
  lote: string | null
  location: string | null
  cantidad: number
  estado: "aprobado" | "pendiente" | "rechazado" | "otro"
  creado: string | null
  creadopor: string | null
  codigo: string | null
  observaciones: string | null
  aprobadoPor: string | null
  aprobadoEn: string | null
}

export interface LoteOrigen360 {
  lote: string
  cantidad: number
  cliente: string | null
}

export interface LineaIngreso360 {
  producto: string
  /** Lo que declaró la orden. */
  orden: number
  /** Lo que entró de verdad (aprobado). */
  recibido: number
  porAprobar: number
  rechazado: number
  diferencia: number
  estado: "cuadra" | "menos" | "mas" | "sin_recibir" | "por_aprobar" | "fuera"
  movimientos: MovIngreso360[]
  /** Con qué lotes salió de planta (solo autodescargue). */
  lotesOrigen: LoteOrigen360[]
  /** Ingresos 101 a mano, sin orden, del mismo producto en esos días: probablemente son de esta orden. */
  candidatos: MovIngreso360[]
}

export interface Ingreso360 {
  referencia: string
  empresaId: number
  clase: "autodescargue" | "descargue" | "movimiento"
  ordenOrigen: string | null
  /** Proyecto y placa del cargue madre (autodescargue). */
  origenDetalle: string | null
  fecha: string | null
  estado: string | null
  placa: string | null
  conductor: string | null
  transporte: string | null
  tiquete: string | null
  pesoBascula: number | null
  pesoOrden: number | null
  remision: string | null
  observaciones: string | null
  linea: { paso: string; hora: string }[]
  lineas: LineaIngreso360[]
  resumen: { orden: number; recibido: number; porAprobar: number; rechazado: number; candidatos: number; diferencia: number; cuadra: boolean }
  documentos: { nombre: string; url: string }[]
}

type Resp<T> = { success: true; data: T } | { success: false; message: string }

function estadoDe(status: unknown): MovIngreso360["estado"] {
  if (esAprobado(status)) return "aprobado"
  if (esRechazado(status)) return "rechazado"
  const s = String(status ?? "").trim()
  return s === "" ? "pendiente" : "otro"
}

function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export async function getIngreso360(referencia: string, empresaId: number | null | undefined): Promise<Resp<Ingreso360>> {
  try {
    const ref = String(referencia ?? "").trim()
    if (!ref) return { success: false, message: "Escribe el número de la orden de descargue o el # del movimiento." }
    if (!empresaId) return { success: false, message: "Selecciona un proyecto." }

    const sb: any = await getSupabaseAdminAsSystem()
    const acceso = await accesoPedidos(sb, empresaId)
    if (!acceso) return { success: false, message: "No tienes acceso a este proyecto." }

    // --- Cabecera (orden de descargue) -------------------------------------------------
    const { data: cab, error: cabErr } = await sb
      .from("cabeceraoc")
      .select("*")
      .eq("idempresa", empresaId)
      .ilike("ordendecargue", ref)
      .limit(1)
      .maybeSingle()
    if (cabErr) return { success: false, message: cabErr.message }

    // Sin orden: puede ser el # de un movimiento de entrada (ingreso de producción, devolución).
    if (!cab) {
      if (!/^\d+$/.test(ref)) return { success: false, message: `No se encontró la orden ${ref} en este proyecto.` }
      return await ingresoDeMovimiento(sb, Number(ref), empresaId)
    }

    const oc = String(cab.ordendecargue)
    const [{ data: det, error: detErr }, { data: mov, error: movErr }] = await Promise.all([
      sb.from("detalleoc").select("producto, cantidad, cliente, lote").eq("idorden", cab.id),
      sb
        .from("invtrans")
        .select("id, nombreproducto, lote, location, cantidad, status, creado, creadopor, cod_movimiento, observaciones")
        .eq("ocargue", oc)
        .eq("tipomov", "Entrada")
        .order("id", { ascending: true }),
    ])
    if (detErr) return { success: false, message: detErr.message }
    if (movErr) return { success: false, message: movErr.message }

    // --- Quién aprobó cada ingreso ---------------------------------------------------------
    const aprobo = new Map<number, { por: string | null; en: string | null }>()
    const ids = (mov ?? []).map((m: any) => Number(m.id))
    if (ids.length) {
      const { data: hist } = await sb.from("historialaprobaciones").select("id, aprobadopor, fechahoraaprob").in("id", ids)
      for (const h of hist ?? []) aprobo.set(Number(h.id), { por: h.aprobadopor ?? null, en: h.fechahoraaprob ?? null })
    }
    const aMov = (m: any): MovIngreso360 => ({
      id: Number(m.id),
      producto: String(m.nombreproducto ?? ""),
      lote: m.lote ?? null,
      location: m.location ?? null,
      cantidad: n0(m.cantidad),
      estado: estadoDe(m.status),
      creado: m.creado ?? null,
      creadopor: m.creadopor ?? null,
      codigo: m.cod_movimiento == null ? null : String(m.cod_movimiento),
      observaciones: m.observaciones ?? null,
      aprobadoPor: aprobo.get(Number(m.id))?.por ?? null,
      aprobadoEn: aprobo.get(Number(m.id))?.en ?? null,
    })

    // --- De qué cargue de planta viene y con qué lotes salió (autodescargue) ---------------
    const lotesOrigenPorProducto = new Map<string, LoteOrigen360[]>()
    let origenDetalle: string | null = null
    if (cab.ordenorigen) {
      const clientesDeAqui = new Set((det ?? []).map((d: any) => normProducto(d.cliente)).filter(Boolean))
      const [{ data: madre }, { data: hl }] = await Promise.all([
        sb.from("cabeceraoc").select("idempresa, placa, fechacargue").eq("ordendecargue", cab.ordenorigen).limit(1).maybeSingle(),
        sb.from("historicolotes").select("producto, cliente, lote, cantidad").eq("ordendecargue", cab.ordenorigen),
      ])
      if (madre) origenDetalle = `ID${n0(madre.idempresa)} · placa ${madre.placa ?? "—"}${madre.fechacargue ? ` · cargó el ${madre.fechacargue}` : ""}`
      for (const r of hl ?? []) {
        // Solo las líneas del cargue madre que venían para ESTE CEDI (el clon trae su cliente).
        if (clientesDeAqui.size && !clientesDeAqui.has(normProducto(r.cliente))) continue
        const k = normProducto(r.producto)
        if (!lotesOrigenPorProducto.has(k)) lotesOrigenPorProducto.set(k, [])
        lotesOrigenPorProducto.get(k)!.push({ lote: String(r.lote ?? "—"), cantidad: n0(r.cantidad), cliente: r.cliente ?? null })
      }
    }

    // --- Cruce por producto: orden vs ingreso --------------------------------------------
    const porProducto = new Map<string, LineaIngreso360>()
    const tomar = (producto: string): LineaIngreso360 => {
      const k = normProducto(producto)
      let l = porProducto.get(k)
      if (!l) {
        l = { producto: producto.trim(), orden: 0, recibido: 0, porAprobar: 0, rechazado: 0, diferencia: 0, estado: "cuadra", movimientos: [], lotesOrigen: lotesOrigenPorProducto.get(k) ?? [], candidatos: [] }
        porProducto.set(k, l)
      }
      return l
    }
    for (const d of det ?? []) {
      if (!String(d.producto ?? "").trim()) continue
      tomar(String(d.producto)).orden += n0(d.cantidad)
    }
    for (const m of mov ?? []) {
      const l = tomar(String(m.nombreproducto ?? ""))
      const x = aMov(m)
      l.movimientos.push(x)
      if (x.estado === "aprobado") l.recibido += x.cantidad
      else if (x.estado === "pendiente") l.porAprobar += x.cantidad
      else if (x.estado === "rechazado") l.rechazado += x.cantidad
    }

    // --- Ingresos a mano sin orden, del mismo producto, en esos días -----------------------
    const base = cab.fechacargue ?? cab.fechaorden ?? null
    const faltantes = [...porProducto.values()].filter((l) => l.recibido + 0.5 < l.orden)
    if (base && faltantes.length) {
      const { data: sueltos } = await sb
        .from("invtrans")
        .select("id, nombreproducto, lote, location, cantidad, status, creado, creadopor, cod_movimiento, observaciones")
        .eq("idempresa", empresaId)
        .eq("tipomov", "Entrada")
        .eq("cod_movimiento", "101")
        .is("ocargue", null)
        .gte("creado", `${sumarDias(String(base), -1)}T00:00:00`)
        .lte("creado", `${sumarDias(String(base), 4)}T23:59:59`)
        .order("id", { ascending: true })
        .limit(500)
      for (const s of sueltos ?? []) {
        if (!esAprobado(s.status)) continue
        const l = porProducto.get(normProducto(s.nombreproducto))
        if (l && l.recibido + 0.5 < l.orden) l.candidatos.push(aMov(s))
      }
    }

    const lineas = [...porProducto.values()].map((l) => {
      l.diferencia = Math.round(l.recibido - l.orden)
      l.estado =
        l.orden <= 0.5 && l.recibido > 0.5 ? "fuera"
        : l.recibido <= 0.5 && l.porAprobar > 0.5 ? "por_aprobar"
        : l.recibido <= 0.5 ? "sin_recibir"
        : Math.abs(l.diferencia) <= 0.5 ? "cuadra"
        : l.diferencia < 0 ? "menos" : "mas"
      return l
    })
    lineas.sort((a, b) => (a.estado === b.estado ? a.producto.localeCompare(b.producto) : a.estado === "cuadra" ? 1 : -1))

    const resumen = {
      orden: lineas.reduce((s, l) => s + l.orden, 0),
      recibido: lineas.reduce((s, l) => s + l.recibido, 0),
      porAprobar: lineas.reduce((s, l) => s + l.porAprobar, 0),
      rechazado: lineas.reduce((s, l) => s + l.rechazado, 0),
      candidatos: lineas.reduce((s, l) => s + l.candidatos.reduce((t, c) => t + c.cantidad, 0), 0),
      diferencia: 0,
      cuadra: false,
    }
    resumen.diferencia = Math.round(resumen.recibido - resumen.orden)
    resumen.cuadra = resumen.diferencia === 0 && resumen.porAprobar === 0

    // --- Remisión del cliente (descargue manual con consecutivo automático) ----------------
    const obs = String(cab.observaciones ?? "")
    const remision = /Remisi[oó]n del cliente:\s*([^·\n]+)/i.exec(obs)?.[1]?.trim() ?? null

    // --- Tiempos -------------------------------------------------------------------------
    const hitos: { paso: string; hora: unknown }[] = [
      { paso: "Llegada del vehículo", hora: cab.horavehiculo },
      { paso: "Pesaje inicial", hora: cab.pesajeinicial },
      { paso: "Orden creada", hora: cab.horaorden },
      { paso: "Inicio del descargue", hora: cab.iniciocargue },
      { paso: "Fin del descargue", hora: cab.fincargue },
      { paso: "Pesaje final", hora: cab.pesajefinal },
    ]
    const linea = hitos
      .filter((h) => h.hora != null && String(h.hora).trim() !== "")
      .map((h) => ({ paso: h.paso, hora: String(h.hora).slice(0, 8) }))

    // --- Documentos ----------------------------------------------------------------------
    const documentos: { nombre: string; url: string }[] = []
    if (cab.pdfoc) documentos.push({ nombre: "Orden de descargue (PDF)", url: String(cab.pdfoc) })
    if (cab.doccargue) documentos.push({ nombre: "Documento del descargue (recibido por lote)", url: String(cab.doccargue) })
    if (cab.fotospicking) {
      try {
        const arr = typeof cab.fotospicking === "string" ? JSON.parse(cab.fotospicking) : cab.fotospicking
        if (Array.isArray(arr)) arr.forEach((u: string, i: number) => documentos.push({ nombre: `Foto ${i + 1}`, url: u }))
      } catch {
        /* no es una lista */
      }
    }

    return {
      success: true,
      data: {
        referencia: oc,
        empresaId,
        clase: cab.ordenorigen ? "autodescargue" : "descargue",
        ordenOrigen: cab.ordenorigen ?? null,
        origenDetalle,
        fecha: cab.fechacargue ?? cab.fechaorden ?? null,
        estado: cab.status ?? null,
        placa: cab.placa ?? null,
        conductor: cab.conductor ?? null,
        transporte: cab.transporte ?? null,
        tiquete: cab.tiquetebascula != null ? String(cab.tiquetebascula) : null,
        pesoBascula: cab.pesovascula != null ? Number(cab.pesovascula) : null,
        pesoOrden: cab.pesoorden != null ? Number(cab.pesoorden) : null,
        remision,
        observaciones: obs || null,
        linea,
        lineas,
        resumen,
        documentos,
      },
    }
  } catch (e: any) {
    console.error("[ingreso-360] error:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo armar el detalle del ingreso." }
  }
}

/** Un movimiento de entrada suelto (ingreso de producción, devolución, sobrante): su propio 360. */
async function ingresoDeMovimiento(sb: any, id: number, empresaId: number): Promise<Resp<Ingreso360>> {
  const { data: m, error } = await sb
    .from("invtrans")
    .select("id, idempresa, nombreproducto, lote, location, cantidad, status, creado, creadopor, cod_movimiento, observaciones, origen, ocargue, tipomov")
    .eq("id", id)
    .maybeSingle()
  if (error) return { success: false, message: error.message }
  if (!m || Number(m.idempresa) !== Number(empresaId)) return { success: false, message: `No existe el movimiento #${id} en este proyecto.` }
  if (m.tipomov !== "Entrada") return { success: false, message: `El movimiento #${id} no es una entrada (es ${m.tipomov}).` }
  const { data: h } = await sb.from("historialaprobaciones").select("aprobadopor, fechahoraaprob").eq("id", id).maybeSingle()
  const x: MovIngreso360 = {
    id,
    producto: String(m.nombreproducto ?? ""),
    lote: m.lote ?? null,
    location: m.location ?? null,
    cantidad: n0(m.cantidad),
    estado: estadoDe(m.status),
    creado: m.creado ?? null,
    creadopor: m.creadopor ?? null,
    codigo: m.cod_movimiento == null ? null : String(m.cod_movimiento),
    observaciones: m.observaciones ?? null,
    aprobadoPor: h?.aprobadopor ?? null,
    aprobadoEn: h?.fechahoraaprob ?? null,
  }
  const linea: LineaIngreso360 = {
    producto: x.producto,
    orden: 0,
    recibido: x.estado === "aprobado" ? x.cantidad : 0,
    porAprobar: x.estado === "pendiente" ? x.cantidad : 0,
    rechazado: x.estado === "rechazado" ? x.cantidad : 0,
    diferencia: 0,
    estado: x.estado === "pendiente" ? "por_aprobar" : x.estado === "aprobado" ? "fuera" : "sin_recibir",
    movimientos: [x],
    lotesOrigen: [],
    candidatos: [],
  }
  return {
    success: true,
    data: {
      referencia: `#${id}`,
      empresaId,
      clase: "movimiento",
      ordenOrigen: m.ocargue ?? null,
      origenDetalle: m.origen ?? null,
      fecha: m.creado ? String(m.creado).slice(0, 10) : null,
      estado: x.estado,
      placa: null,
      conductor: null,
      transporte: null,
      tiquete: null,
      pesoBascula: null,
      pesoOrden: null,
      remision: null,
      observaciones: m.observaciones ?? null,
      linea: [],
      lineas: [linea],
      resumen: { orden: 0, recibido: linea.recibido, porAprobar: linea.porAprobar, rechazado: linea.rechazado, candidatos: 0, diferencia: 0, cuadra: linea.recibido > 0 },
      documentos: [],
    },
  }
}
