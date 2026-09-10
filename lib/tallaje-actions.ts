"use server"

// ---------------------------------------------------------------------------
// TALLAJE DE PRODUCTOS — convertir un producto en tallado y repartir su stock.
//
// El reparto NO inventa un mecanismo de inventario. Reusa exactamente el del
// codigo 309 ("Reclasificacion", lib/transacciones-codigo-actions.ts:339-359):
// salida del producto origen + entrada a otro producto, conservando el lote.
// La unica diferencia es que aqui es 1-a-N: una salida del padre y una entrada
// por cada talla.
//
// El stock no se escribe: se insertan filas en `invtrans` y un TRIGGER de la
// base recalcula `saldoinvdetalle`. Regla del proyecto, textual:
// "para cuadrar el fisico NUNCA editar invtrans" — siempre filas nuevas.
//
// Ver scripts/productos_tallaje.sql.
// ---------------------------------------------------------------------------

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUsuarioForInsert } from "@/lib/user-context"
import { checkModulePermission } from "@/lib/permissions-actions"
// OJO: hay dos getColombiaDateTime. La de date-utils devuelve Date; esta
// devuelve string ISO, que es lo que espera invtrans.creado. Es la misma que
// usa ejecutarTransaccionPorCodigo.
import { getColombiaDateTime } from "@/lib/inventory-actions"
import type {
  ProductoTalla,
  RepartoTallajeInput,
  OrigenDisponible,
  ResultadoReparto,
} from "@/lib/tallaje-tipos"

/** ¿Este cliente maneja productos por talla? */
export async function empresaUsaTallaje(selectedEmpresaId: number): Promise<boolean> {
  if (!selectedEmpresaId) return false
  try {
    const sb: any = await getSupabaseAdmin()
    const { data } = await sb
      .from("tallaje_empresa")
      .select("activo")
      .eq("idempresa", selectedEmpresaId)
      .eq("activo", true)
      .limit(1)
      .maybeSingle()
    return !!data
  } catch {
    // Si la tabla aun no existe (script sin correr), el tallaje simplemente no
    // aparece. No se rompe el modulo de Productos.
    return false
  }
}

/** Tallas sugeridas para el cliente, solo como ayuda al escribir. */
export async function getTallasSugeridas(selectedEmpresaId: number): Promise<string[]> {
  if (!selectedEmpresaId) return []
  try {
    const sb: any = await getSupabaseAdmin()
    const { data } = await sb
      .from("tallaje_empresa")
      .select("tallas_sugeridas")
      .eq("idempresa", selectedEmpresaId)
      .maybeSingle()
    return (data?.tallas_sugeridas as string[]) ?? []
  } catch {
    return []
  }
}

/** Tallas ya creadas de un producto padre. */
export async function getTallasDeProducto(
  productoPadreId: number,
): Promise<{ success: boolean; data: ProductoTalla[]; error?: string }> {
  if (!productoPadreId) return { success: false, data: [], error: "Falta el producto." }
  try {
    const sb: any = await getSupabaseAdmin()
    const { data, error } = await sb
      .from("productos")
      .select("id, nombre, codigo, talla, talla_orden")
      .eq("producto_padre_id", productoPadreId)
      .order("talla_orden", { ascending: true, nullsFirst: false })
    if (error) return { success: false, data: [], error: error.message }
    return {
      success: true,
      data: (data ?? []).map((p: any) => ({
        id: Number(p.id),
        nombre: p.nombre,
        codigo: p.codigo ?? "",
        talla: p.talla ?? "",
        tallaOrden: p.talla_orden == null ? null : Number(p.talla_orden),
      })),
    }
  } catch (e: any) {
    return { success: false, data: [], error: e?.message || "No se pudieron leer las tallas." }
  }
}

/**
 * Lotes y ubicaciones donde el producto padre tiene stock.
 *
 * Se reparte SIEMPRE desde un lote y una ubicacion concretos, no desde un total
 * global: el stock vive por (producto, lote, ubicacion) y las tallas tienen que
 * heredar el lote exacto del que salieron para no perder la trazabilidad.
 */
export async function getOrigenesDisponibles(
  selectedEmpresaId: number,
  nombreProducto: string,
): Promise<{ success: boolean; data: OrigenDisponible[]; error?: string }> {
  if (!selectedEmpresaId || !nombreProducto) {
    return { success: false, data: [], error: "Falta el proyecto o el producto." }
  }
  try {
    const sb: any = await getSupabaseAdmin()
    const { data, error } = await sb
      .from("saldoinvdetalle")
      .select("lote, location, stock_actual")
      .eq("idempresa", selectedEmpresaId)
      .eq("nombreproducto", nombreProducto)
      .gt("stock_actual", 0)
    if (error) return { success: false, data: [], error: error.message }
    const filas: OrigenDisponible[] = (data ?? [])
      .map((r: any) => ({
        lote: r.lote ?? "",
        location: r.location ?? "",
        stock: Number(r.stock_actual) || 0,
      }))
      .filter((r: OrigenDisponible) => r.stock > 0)
    // El lote es AAAAMMDD, asi que el orden alfabetico ES el cronologico: lo
    // mas viejo primero, que es lo que se reparte primero (FEFO).
    filas.sort((a, b) => a.lote.localeCompare(b.lote) || a.location.localeCompare(b.location))
    return { success: true, data: filas }
  } catch (e: any) {
    return { success: false, data: [], error: e?.message || "No se pudo leer el stock." }
  }
}

/** Marca (o desmarca) un producto como manejado por tallas. */
export async function marcarProductoTallado(
  productoId: number,
  esTallado: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (!productoId) return { success: false, error: "Falta el producto." }
  try {
    if (!(await checkModulePermission("Productos"))) {
      return { success: false, error: "No tienes permiso para editar productos." }
    }
    const sb: any = await getSupabaseAdmin()

    // Desmarcar con tallas que aun tienen stock dejaria unidades en productos
    // que la pantalla ya no muestra como tallas: stock invisible.
    if (!esTallado) {
      const { data: hijos } = await sb
        .from("productos")
        .select("nombre")
        .eq("producto_padre_id", productoId)
      if (hijos?.length) {
        const nombres = hijos.map((h: any) => h.nombre)
        const { data: conStock } = await sb
          .from("saldoinvdetalle")
          .select("nombreproducto, stock_actual")
          .in("nombreproducto", nombres)
          .gt("stock_actual", 0)
        if (conStock?.length) {
          return {
            success: false,
            error: `No se puede quitar el tallaje: ${conStock.length} talla(s) todavia tienen stock. Devuelvelas al producto padre primero.`,
          }
        }
      }
    }

    const { error } = await sb.from("productos").update({ es_tallado: esTallado }).eq("id", productoId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || "No se pudo actualizar el producto." }
  }
}

/**
 * Reparte stock del producto padre entre sus tallas.
 *
 * Una salida del padre + una entrada por talla, todo con el mismo lote y la
 * misma ubicacion. La suma de las entradas es exactamente igual a la salida:
 * el reparto no crea ni destruye unidades, solo cambia como se llaman.
 */
export async function repartirEnTallas(input: RepartoTallajeInput): Promise<ResultadoReparto> {
  try {
    const empresaId = Number(input.selectedEmpresaId)
    if (!empresaId) return { success: false, message: "Selecciona un proyecto en el selector global." }
    if (!input.productoPadreId) return { success: false, message: "Falta el producto." }

    // Ocultar el boton en la pantalla no es seguridad: esta accion se puede
    // invocar directamente. Repartir mueve stock real, asi que se exige aqui el
    // mismo permiso que para el codigo 309.
    if (!(await checkModulePermission("Transacciones de Inventario"))) {
      return { success: false, message: "No tienes permiso para mover stock." }
    }

    const lote = input.lote?.trim() || ""
    const location = input.location?.trim() || ""
    if (!lote || !location) return { success: false, message: "Indica el lote y la ubicacion de origen." }

    // Asignaciones con cantidad real.
    const asigs = (input.asignaciones ?? [])
      .map((a) => ({ ...a, talla: String(a.talla || "").trim(), cantidad: Math.abs(Number(a.cantidad) || 0) }))
      .filter((a) => a.talla && a.cantidad > 0)
    if (asigs.length === 0) return { success: false, message: "Asigna una cantidad a por lo menos una talla." }

    // Una talla repetida partiria el stock en dos entradas del mismo producto.
    const vistas = new Set<string>()
    for (const a of asigs) {
      const k = a.talla.toLowerCase()
      if (vistas.has(k)) return { success: false, message: `La talla "${a.talla}" esta repetida.` }
      vistas.add(k)
    }

    const total = asigs.reduce((s, a) => s + a.cantidad, 0)

    const sb: any = await getSupabaseAdmin()

    // Repartir mueve stock real: se exige la misma clave que el codigo 309.
    const claveLimpia = String(input.clave || "").trim()
    if (!claveLimpia) return { success: false, message: "Indica la clave del responsable." }
    const { data: claveRow } = await sb
      .from("inv_clave_movimiento")
      .select("responsable")
      .eq("clave", claveLimpia)
      .eq("activo", true)
      .limit(1)
      .maybeSingle()
    if (!claveRow) return { success: false, message: "Clave incorrecta o inactiva." }
    if (!String(input.motivo || "").trim()) return { success: false, message: "Indica el motivo del reparto." }

    // El producto padre.
    const { data: padre } = await sb
      .from("productos")
      .select("id, nombre, codigo, id_empresa, categoria, subcategoria, gramaje, und, peso_unitkg, pesobruto, und_equivalente, equivalencia_bultos, unidades_estiba, vidautildias, es_tallado")
      .eq("id", input.productoPadreId)
      .maybeSingle()
    if (!padre) return { success: false, message: "No se encontro el producto." }

    // Stock disponible en ese lote y ubicacion. Se valida ANTES de escribir
    // nada: repartir mas de lo que hay dejaria el saldo en negativo.
    const { data: saldos } = await sb
      .from("saldoinvdetalle")
      .select("stock_actual")
      .eq("idempresa", empresaId)
      .eq("nombreproducto", padre.nombre)
      .eq("lote", lote)
      .eq("location", location)
    const stock = (saldos ?? []).reduce((s: number, r: any) => s + (Number(r.stock_actual) || 0), 0)
    if (total > stock) {
      return {
        success: false,
        message: `Estas repartiendo ${total} pero el lote ${lote} en ${location} solo tiene ${stock}.`,
      }
    }

    // Crear las tallas que no existan todavia.
    const tallasCreadas: string[] = []
    const resueltas: Array<{ productoId: number; codigo: string; nombre: string; talla: string; cantidad: number }> = []

    for (const a of asigs) {
      if (a.productoId) {
        const { data: hijo } = await sb
          .from("productos")
          .select("id, nombre, codigo")
          .eq("id", a.productoId)
          .maybeSingle()
        if (!hijo) return { success: false, message: `No se encontro la talla "${a.talla}".` }
        resueltas.push({ productoId: Number(hijo.id), codigo: hijo.codigo ?? "", nombre: hijo.nombre, talla: a.talla, cantidad: a.cantidad })
        continue
      }

      // ¿Ya existe esa talla para este padre? Evita duplicarla si la pantalla
      // llego con productoId en null por estar desactualizada.
      const { data: ya } = await sb
        .from("productos")
        .select("id, nombre, codigo")
        .eq("producto_padre_id", padre.id)
        .eq("talla", a.talla)
        .maybeSingle()
      if (ya) {
        resueltas.push({ productoId: Number(ya.id), codigo: ya.codigo ?? "", nombre: ya.nombre, talla: a.talla, cantidad: a.cantidad })
        continue
      }

      // La talla hereda del padre todo lo logistico --pesos, estiba, vida util,
      // categoria--: es el mismo producto fisico, solo que separado por talla.
      const nombreHijo = `${padre.nombre} - ${a.talla}`
      const { data: creado, error: errCrear } = await sb
        .from("productos")
        .insert({
          id_empresa: padre.id_empresa,
          nombre: nombreHijo,
          gramaje: padre.gramaje,
          und: padre.und,
          peso_unitkg: padre.peso_unitkg,
          pesobruto: padre.pesobruto,
          und_equivalente: padre.und_equivalente,
          equivalencia_bultos: padre.equivalencia_bultos,
          unidades_estiba: padre.unidades_estiba,
          categoria: padre.categoria,
          subcategoria: padre.subcategoria,
          vidautildias: padre.vidautildias,
          activo: true,
          producto_padre_id: padre.id,
          talla: a.talla,
          talla_orden: asigs.indexOf(a) + 1,
        })
        .select("id")
        .single()
      if (errCrear || !creado) {
        return { success: false, message: errCrear?.message || `No se pudo crear la talla "${a.talla}".` }
      }

      // El codigo se genera igual que en el CRUD de Productos: PT000<id>.
      const codigoHijo = `PT000${creado.id}`
      await sb.from("productos").update({ codigo: codigoHijo }).eq("id", creado.id)

      tallasCreadas.push(a.talla)
      resueltas.push({ productoId: Number(creado.id), codigo: codigoHijo, nombre: nombreHijo, talla: a.talla, cantidad: a.cantidad })
    }

    // Las filas de invtrans. El id NO es autoincremental: se calcula max+1,
    // igual que en ejecutarTransaccionPorCodigo.
    const usuario = await getCurrentUsuarioForInsert()
    const ahora = await getColombiaDateTime()
    const { data: maxRow } = await sb.from("invtrans").select("id").order("id", { ascending: false }).limit(1).maybeSingle()
    let nextId = maxRow ? Number(maxRow.id) + 1 : 1

    const obs = `Reparto en tallas de ${padre.nombre} · ${input.motivo.trim()} · autoriza: ${claveRow.responsable}`

    const filas: any[] = [
      {
        id: nextId++,
        idempresa: empresaId,
        idproducto: padre.id,
        codproducto: padre.codigo,
        nombreproducto: padre.nombre,
        lote,
        location,
        cantidad: total,
        tipomov: "Salida",
        status: "aprobado",
        origen: "transaccion manual",
        observaciones: obs,
        cod_movimiento: "309",
        creadopor: usuario,
        creado: ahora,
      },
      ...resueltas.map((r) => ({
        id: nextId++,
        idempresa: empresaId,
        idproducto: r.productoId,
        codproducto: r.codigo,
        nombreproducto: r.nombre,
        // MISMO lote y MISMA ubicacion: la talla hereda la trazabilidad y la
        // posicion FEFO del lote del que salio.
        lote,
        location,
        cantidad: r.cantidad,
        tipomov: "Entrada",
        status: "aprobado",
        origen: "transaccion manual",
        observaciones: obs,
        cod_movimiento: "309",
        creadopor: usuario,
        creado: ahora,
      })),
    ]

    const { error: errIns } = await sb.from("invtrans").insert(filas)
    if (errIns) return { success: false, message: errIns.message }

    const invtransIds = filas.map((f) => f.id)

    // El reparto como UNA operacion, para poder responder despues "quien
    // repartio estas unidades y en que tallas" sin rearmarlo desde movimientos
    // sueltos. Si esto falla, el stock YA se movio: no se revierte, se avisa.
    let repartoId: number | undefined
    try {
      const { data: rep } = await sb
        .from("producto_tallaje_reparto")
        .insert({
          idempresa: empresaId,
          producto_padre_id: padre.id,
          codproducto_padre: padre.codigo,
          lote,
          location,
          cantidad_origen: total,
          detalle: resueltas.map((r) => ({
            talla: r.talla,
            producto_id: r.productoId,
            codproducto: r.codigo,
            cantidad: r.cantidad,
          })),
          invtrans_ids: invtransIds,
          motivo: input.motivo.trim(),
          realizado_por: usuario,
        })
        .select("id")
        .single()
      repartoId = rep?.id ? Number(rep.id) : undefined
    } catch (e: any) {
      console.error("[v0] repartirEnTallas: no se pudo guardar el rastro:", e?.message ?? e)
    }

    // Si era la primera vez, el padre queda marcado como tallado.
    if (!padre.es_tallado) {
      await sb.from("productos").update({ es_tallado: true }).eq("id", padre.id)
    }

    return {
      success: true,
      message: `${total} unidad(es) repartidas en ${resueltas.length} talla(s).`,
      invtransIds,
      repartoId,
      tallasCreadas,
    }
  } catch (e: any) {
    console.error("[v0] repartirEnTallas excepcion:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo repartir." }
  }
}
