// CONSULTAS de las comprobaciones de convergencia. Reciben el cliente de Supabase (service
// role) para poder correr igual desde el cron y desde scripts/verificar_convergencia.mts.
// Todas son de SOLO LECTURA y paginadas con orden único (lib/orden-paginacion.ts).
//
// Cada check cruza dos fuentes que DEBEN coincidir. Lo que vigila cada uno está en la regla.

import { fetchAllRows } from "@/lib/fetch-all-rows"
import { hallazgosPendientes } from "@/lib/conteo-hallazgos"
import { resultadoDe, sinDatos, type ResultadoCheck } from "@/lib/convergencia"

const n0 = (v: unknown) => Number(v) || 0
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase()
const diasAtrasISO = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

type SB = any

// ───────────────────────────── Inventario y despacho ─────────────────────────────

const CHK_DUPLICADAS = {
  clave: "salidas_duplicadas",
  titulo: "La misma estiba salió dos veces en la misma orden",
  regla: "Una orden se confirma una sola vez; la misma estiba (QR) no puede salir dos veces. Caso real: agosto 2026, 41 unidades de más.",
  gravedad: "critico" as const,
}
export async function checkSalidasDuplicadas(sb: SB, dias = 30): Promise<ResultadoCheck> {
  try {
    const filas = await fetchAllRows((from, to) =>
      sb
        .from("invtrans")
        .select("id, ocargue, qrestiba, nombreproducto, cantidad, creado")
        .eq("tipomov", "Salida")
        .ilike("status", "apr%")
        .not("qrestiba", "is", null)
        .gte("creado", diasAtrasISO(dias))
        .order("id", { ascending: true })
        .range(from, to),
    )
    const vistos = new Map<string, any[]>()
    for (const f of filas) {
      const k = `${norm(f.ocargue)}|${f.qrestiba}`
      vistos.set(k, [...(vistos.get(k) ?? []), f])
    }
    const casos: string[] = []
    for (const [k, fs] of vistos) {
      if (fs.length > 1) casos.push(`orden ${fs[0].ocargue} · estiba ${fs[0].qrestiba} · ${fs.length} salidas de ${fs[0].nombreproducto} (ids ${fs.map((f) => f.id).join(", ")})`)
    }
    return resultadoDe(CHK_DUPLICADAS, casos)
  } catch (e: any) {
    return sinDatos(CHK_DUPLICADAS, e?.message ?? String(e))
  }
}

const CHK_SALIO_MAS = {
  clave: "salio_mas_que_orden",
  titulo: "Salió más de lo que la orden de cargue autorizó",
  regla: "Nunca puede salir más de lo que dice la orden de cargue, ni un producto que la orden no incluía.",
  gravedad: "critico" as const,
}
export async function checkSalioMasQueOrden(sb: SB, dias = 30): Promise<ResultadoCheck> {
  // LA FECHA SE TOMA DE `primera_salida`, NUNCA DE `fechaorden`.
  //
  // Encontrado el 2026-10-07: este chequeo filtraba por `fechaorden`, y en las filas
  // FUERA_DE_LA_ORDEN no hay línea de orden de donde sacar la fecha, así que `fechaorden`
  // y `fechacargue` vienen NULAS. Un filtro por ellas descartaba el 100 % de esas filas,
  // que son justo las más graves: 79 líneas y 7.299 unidades que salieron de un producto
  // que la orden no incluía (ID3 62 líneas / 5.547 und, ID1 17 / 1.752) llevaban
  // invisibles desde que existe el chequeo, mientras sí reportaba el SALIO_MAS vecino.
  // `primera_salida` es la fecha en que el producto salió de verdad y está poblada en
  // todas las filas con salidas (los SIN_SALIDA no entran en este chequeo).
  //
  // Se pagina en vez de topar en 200: un día malo puede traer más casos que el tope, y un
  // chequeo que trunca informa de menos sin decirlo.
  const desde = diasAtrasISO(dias)
  try {
    const filas = await fetchAllRows((from, to) =>
      sb
        .from("v_orden_vs_salidas")
        .select("idempresa, ocargue, producto, autorizado, despachado, estado_alerta, primera_salida")
        .in("estado_alerta", ["SALIO_MAS", "FUERA_DE_LA_ORDEN"])
        .gte("primera_salida", desde)
        .order("ocargue", { ascending: true })
        .order("producto", { ascending: true })
        .range(from, to),
    )
    const casos = filas.map(
      (r: any) =>
        `ID${n0(r.idempresa)} · ${r.ocargue} · ${r.producto}: autorizado ${n0(r.autorizado)}, salió ${n0(r.despachado)} (${r.estado_alerta === "FUERA_DE_LA_ORDEN" ? "NO estaba en la orden" : "de más"})`,
    )
    return resultadoDe(CHK_SALIO_MAS, casos)
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    const falta = /does not exist|schema cache|not find/i.test(msg)
    return sinDatos(CHK_SALIO_MAS, falta ? "la vista v_orden_vs_salidas no existe: falta correr scripts/sig/63_orden_vs_salidas.sql" : msg)
  }
}

const CHK_A_MEDIAS = {
  clave: "ordenes_a_medias",
  titulo: "Órdenes con picking a medias",
  regla: "El picking es todo o nada: una orden no puede tener salidas aprobadas y, a la vez, líneas por descontar.",
  gravedad: "critico" as const,
}
const CHK_RESERVAS = {
  clave: "reservas_viejas",
  titulo: "Reservas de asignación sin picking hace más de 3 días",
  regla: "La asignación reserva y el picking despacha; una reserva vieja bloquea el Conteo total del mes y suele ser una orden olvidada.",
  gravedad: "alerta" as const,
}
export async function checkPendientesInventario(sb: SB): Promise<ResultadoCheck[]> {
  try {
    const pendientes = await fetchAllRows((from, to) =>
      sb
        .from("invtrans")
        .select("id, ocargue, nombreproducto, lote, cantidad, status, creado")
        .eq("tipomov", "Salida")
        .ilike("origen", "orden de cargue")
        .ilike("status", "por descontar")
        .order("id", { ascending: true })
        .range(from, to),
    )
    const porOrden = new Map<string, any[]>()
    for (const p of pendientes) porOrden.set(String(p.ocargue), [...(porOrden.get(String(p.ocargue)) ?? []), p])

    const aMedias: string[] = []
    const ocs = [...porOrden.keys()]
    for (let i = 0; i < ocs.length; i += 100) {
      const { data } = await sb
        .from("invtrans")
        .select("ocargue")
        .in("ocargue", ocs.slice(i, i + 100))
        .eq("tipomov", "Salida")
        .ilike("origen", "orden de cargue")
        .ilike("status", "apr%")
        .limit(1000)
      const conAprobadas = new Set((data ?? []).map((r: any) => String(r.ocargue)))
      for (const oc of ocs.slice(i, i + 100)) {
        if (conAprobadas.has(oc)) aMedias.push(`orden ${oc}: ${porOrden.get(oc)!.length} líneas por descontar junto a salidas aprobadas`)
      }
    }
    const limite = diasAtrasISO(3)
    const viejas = pendientes
      .filter((p) => String(p.creado ?? "") < limite)
      .map((p) => `orden ${p.ocargue} · ${p.nombreproducto} lote ${p.lote} (${n0(p.cantidad)}) desde ${String(p.creado).slice(0, 10)}`)
    return [resultadoDe(CHK_A_MEDIAS, aMedias), resultadoDe(CHK_RESERVAS, viejas)]
  } catch (e: any) {
    return [sinDatos(CHK_A_MEDIAS, e?.message ?? String(e)), sinDatos(CHK_RESERVAS, e?.message ?? String(e))]
  }
}

const CHK_STOCK_PRODUCTO = {
  clave: "stock_negativo_producto",
  titulo: "Productos con existencias negativas en total",
  regla: "Un producto no puede quedar en negativo sumando todos sus lotes: salió más de lo que entró más la base del mes.",
  gravedad: "critico" as const,
}
const CHK_STOCK_LOTE = {
  clave: "stock_negativo_lote",
  titulo: "Lotes o ubicaciones en negativo con el producto en positivo",
  regla: "El total del producto cuadra, pero una salida se cargó a un lote o ubicación que no tenía existencias: afecta la trazabilidad por lote y el FIFO.",
  gravedad: "alerta" as const,
}
/** Medido el 2026-10-05: 19 lotes en negativo (ID1 17, ID3 2) de 11 productos; 2 productos de ID1 negativos en total. */
export async function checkStockNegativo(sb: SB): Promise<ResultadoCheck[]> {
  try {
    const { data: neg, error } = await sb
      .from("saldoinvdetalle")
      .select("idempresa, idproducto, nombreproducto, lote, location, stock_actual")
      .lt("stock_actual", 0)
      .order("idempresa")
      .order("nombreproducto")
      .order("lote")
      .limit(300)
    if (error) return [sinDatos(CHK_STOCK_PRODUCTO, error.message), sinDatos(CHK_STOCK_LOTE, error.message)]
    const claves = [...new Set<string>((neg ?? []).map((r: any) => `${r.idempresa}|${r.idproducto}`))]
    const productosNegativos: string[] = []
    const lotesNegativos: string[] = []
    for (const k of claves) {
      const [emp, prod] = k.split("|").map(Number)
      const { data: filas } = await sb.from("saldoinvdetalle").select("nombreproducto, lote, location, stock_actual").eq("idempresa", emp).eq("idproducto", prod)
      const total = (filas ?? []).reduce((s: number, f: any) => s + n0(f.stock_actual), 0)
      const negs = (filas ?? []).filter((f: any) => n0(f.stock_actual) < 0)
      const nombre = String(filas?.[0]?.nombreproducto ?? prod)
      const detalle = negs.map((f: any) => `lote ${f.lote} en ${f.location}: ${n0(f.stock_actual)}`).join("; ")
      if (total < -0.01) productosNegativos.push(`ID${emp} · ${nombre}: total ${total} (${detalle})`)
      else lotesNegativos.push(`ID${emp} · ${nombre}: total ${total}, pero ${detalle}`)
    }
    return [resultadoDe(CHK_STOCK_PRODUCTO, productosNegativos), resultadoDe(CHK_STOCK_LOTE, lotesNegativos)]
  } catch (e: any) {
    const m = e?.message ?? String(e)
    return [sinDatos(CHK_STOCK_PRODUCTO, m), sinDatos(CHK_STOCK_LOTE, m)]
  }
}

// ───────────────────────────── Pedidos ─────────────────────────────

const CHK_PEDIDO_MAS = {
  clave: "pedido_despacho_mayor",
  titulo: "Líneas de pedido con más cargado que lo pedido",
  regla: "Un pedido no puede despachar más de lo que se creó; menos sí, con justificación.",
  gravedad: "critico" as const,
}
const CHK_LIBRO = {
  clave: "libro_vs_linea",
  titulo: "El libro de órdenes y la línea del pedido no coinciden (últimos 7 días)",
  regla: "Lo cargado de una línea es la suma de lo que se llevó cada orden; si difieren, una orden se escribió sin anotarse.",
  gravedad: "alerta" as const,
}
/**
 * Los excesos HISTÓRICOS que gerencia ya revisó (2026-10-07), con la cantidad exacta que
 * salió. A diferencia de una excepción por línea, aquí se congela el NÚMERO: si esa misma
 * línea vuelve a crecer un solo bulto, la alerta salta igual. Así una excepción no se
 * convierte en una puerta abierta.
 *
 * Estas 8 no se pueden "corregir": las unidades salieron de verdad, con su orden y su
 * picking, y el cliente las recibió. Lo que se corrigió (script 253) fue el pendiente que
 * seguían mostrando. El exceso queda registrado para siempre en `pedidodetalle_ocargue`.
 *
 * Todas son de antes del 2026-10-04, cuando la segunda orden sobrescribía el contador en
 * vez de sumarle y la pantalla volvía a ofrecer el pedido. Desde el tope duro no hay
 * ninguna: 14.194 líneas despachadas después de esa fecha cuadran al 100 %.
 */
const EXCESOS_HISTORICOS_REVISADOS: Record<number, { salio: number; nota: string }> = {
  19866: { salio: 721, nota: "ID2 pedido 9827 · pidió 700" },
  19998: { salio: 1292, nota: "ID2 pedido 9876 · pidió 1.000" },
  20043: { salio: 1955, nota: "ID2 pedido 9899 · pidió 800, salió en 8 órdenes" },
  20371: { salio: 250, nota: "ID2 pedido 10056 · pidió 200" },
  20538: { salio: 1320, nota: "ID2 pedido 10130 · pidió 800" },
  22525: { salio: 1238, nota: "ID2 pedido 11026 · pidió 1.000" },
  22764: { salio: 1324, nota: "ID2 pedido 11108 · pidió 800" },
  24807: { salio: 1080, nota: "ID2 pedido 12013 · pidió 800" },
}

const CHK_SUMA_ORDENES = {
  clave: "pedido_suma_ordenes_mayor",
  titulo: "Sumando TODAS sus órdenes, el pedido recibió más de lo que pidió",
  regla:
    "Un pedido puede salir en varias órdenes y cada una le resta por producto, pero la suma de todas nunca puede superar lo pedido. Lo que manda es el libro de órdenes, no el contador de la línea.",
  gravedad: "critico" as const,
}

/**
 * Líneas históricas que gerencia revisó una por una y dio por cerradas AUNQUE sigan
 * incumpliendo la regla. Sirve para no repetir todas las noches una alerta ya decidida,
 * que es la mejor forma de enseñarle a la gente a ignorar las alertas.
 *
 * HOY ESTÁ VACÍO, y es lo correcto: una excepción solo se justifica mientras el dato
 * siga mal. La única que hubo, la línea 260 del pedido 147 de ID1, dejó de hacer falta
 * el 2026-10-07 cuando gerencia ordenó corregir el dato en vez de taparlo: la línea
 * decía 2 unidades pedidas y 2.000 cargadas, y se corrigió a 2.000 pedidas con el
 * script 246. Dejar la excepción puesta habría escondido cualquier recaída de esa
 * misma línea.
 *
 * Una línea nueva que incumpla SÍ salta, que es para lo que sirve el control.
 */
const PEDIDO_MAS_REVISADOS: Record<number, string> = {}

export async function checkPedidos(sb: SB): Promise<ResultadoCheck[]> {
  const out: ResultadoCheck[] = []
  try {
    // TODAS las líneas, no las primeras 5.000: `pedidosdetalle` tiene más de
    // 24.000 y con el tope una línea nueva con transid alto nunca se habría
    // mirado (encontrado el 2026-10-07).
    const data = await fetchAllRows((from, to) =>
      sb
        .from("pedidosdetalle")
        .select("transid, idpedido, id_empresa, producto, unidades, unidadescargadas")
        .not("unidadescargadas", "is", null)
        .order("transid", { ascending: true })
        // `transid` solo no es la llave única comprobada de pedidosdetalle (ver
        // lib/orden-paginacion.ts): se completa con idpedido/producto al final
        // para no mover el orden visible de `casos`.
        .order("idpedido", { ascending: true })
        .order("producto", { ascending: true })
        .range(from, to),
    )
    const casos = (data ?? [])
      .filter((l: any) => n0(l.unidadescargadas) > n0(l.unidades) + 0.01 && !PEDIDO_MAS_REVISADOS[Number(l.transid)])
      .map((l: any) => `ID${l.id_empresa} pedido ${l.idpedido} · ${l.producto}: pedidas ${n0(l.unidades)}, cargadas ${n0(l.unidadescargadas)}`)
    out.push(resultadoDe(CHK_PEDIDO_MAS, casos))
  } catch (e: any) {
    out.push(sinDatos(CHK_PEDIDO_MAS, e?.message ?? String(e)))
  }
  try {
    // Solo lo que escribió la APP (origen = app): las filas reconstruidas el 4-oct llevan la
    // fecha de ese día y entrarían todas en "últimos 7 días" (13.888 filas → la consulta
    // `.in()` reventaba por tamaño y el check quedaba "sin comprobar" con motivo vacío).
    const recientes = await fetchAllRows((from, to) =>
      sb
        .from("pedidodetalle_ocargue")
        .select("transid, idpedido, ocargue, unidades")
        .eq("origen", "app")
        .gte("creado_en", diasAtrasISO(7))
        .order("id", { ascending: true })
        .range(from, to),
    )
    const transids = [...new Set<number>(recientes.map((r: any) => Number(r.transid)))]
    const sumaPorLinea = new Map<number, number>()
    if (transids.length > 0) {
      // Las listas `.in()` van en tandas de 150 ids: una URL demasiado larga falla.
      const todas: any[] = []
      const lineas: any[] = []
      for (let i = 0; i < transids.length; i += 150) {
        const tanda = transids.slice(i, i + 150)
        todas.push(
          ...(await fetchAllRows((from, to) =>
            sb.from("pedidodetalle_ocargue").select("transid, unidades").in("transid", tanda).order("id", { ascending: true }).range(from, to),
          )),
        )
        lineas.push(
          ...(await fetchAllRows((from, to) =>
            sb.from("pedidosdetalle").select("transid, idpedido, producto, unidadescargadas, unidades_cargadas").in("transid", tanda).order("transid", { ascending: true }).order("idpedido", { ascending: true }).order("producto", { ascending: true }).range(from, to),
          )),
        )
      }
      for (const r of todas) sumaPorLinea.set(Number(r.transid), (sumaPorLinea.get(Number(r.transid)) ?? 0) + n0(r.unidades))
      const casos: string[] = []
      for (const l of lineas) {
        const libro = sumaPorLinea.get(Number(l.transid)) ?? 0
        const dice = n0(l.unidadescargadas ?? l.unidades_cargadas)
        if (Math.abs(libro - dice) > 0.01) casos.push(`pedido ${l.idpedido} · ${l.producto}: línea dice ${dice}, órdenes suman ${libro}`)
      }
      out.push(resultadoDe(CHK_LIBRO, casos))
    } else {
      out.push(resultadoDe(CHK_LIBRO, []))
    }
  } catch (e: any) {
    const texto = e?.message || e?.details || e?.hint || String(e) || "error sin mensaje"
    const falta = /does not exist|schema cache|not find/i.test(texto)
    out.push(sinDatos(CHK_LIBRO, falta ? "la tabla pedidodetalle_ocargue no existe: falta correr scripts/226_pedido_ordenes_cargue.sql" : texto))
  }

  // EL HUECO QUE ESTO TAPA (encontrado el 2026-10-07)
  //
  // `CHK_PEDIDO_MAS` compara el CONTADOR de la línea (`unidadescargadas`) contra lo pedido,
  // y desde el 4-oct ese contador está topado en lo pedido: por construcción no puede
  // pasarse, así que esa alerta no podía saltar nunca por este motivo. `CHK_LIBRO` sí mira
  // el libro, pero solo lo que escribió la app en los últimos 7 días.
  //
  // El exceso de verdad vive en el libro y es histórico: 8 líneas de ID2 donde la suma de
  // todas las órdenes se pasó de lo pedido (hasta 1.955 unidades despachadas contra un
  // pedido de 800), porque antes del 4-oct la segunda orden SOBRESCRIBÍA el contador en vez
  // de sumarle, el pendiente volvía a su valor anterior y la pantalla seguía ofreciendo el
  // pedido para cargarlo otra vez. Ninguna de las dos comprobaciones las veía.
  //
  // Se mira el libro COMPLETO, sin ventana de días: son ~20.000 filas y el exceso no
  // caduca, sigue siendo plata despachada de más mientras nadie lo cierre.
  try {
    const libro = await fetchAllRows((from, to) =>
      sb.from("pedidodetalle_ocargue").select("transid, idpedido, ocargue, unidades").order("id", { ascending: true }).range(from, to),
    )
    const sumaPorLinea = new Map<number, { und: number; ordenes: Set<string> }>()
    for (const r of libro) {
      const k = Number(r.transid)
      const v = sumaPorLinea.get(k) ?? { und: 0, ordenes: new Set<string>() }
      v.und += n0(r.unidades)
      v.ordenes.add(String(r.ocargue))
      sumaPorLinea.set(k, v)
    }
    const lineas = await fetchAllRows((from, to) =>
      sb
        .from("pedidosdetalle")
        .select("transid, idpedido, id_empresa, producto, unidades")
        .order("transid", { ascending: true })
        // Completa la llave única de pedidosdetalle (ver lib/orden-paginacion.ts)
        // sin tocar el orden visible primario (transid).
        .order("idpedido", { ascending: true })
        .order("producto", { ascending: true })
        .range(from, to),
    )
    const casos: string[] = []
    for (const l of lineas) {
      const pedidas = n0(l.unidades)
      const s = sumaPorLinea.get(Number(l.transid))
      if (!s || pedidas <= 0) continue
      if (s.und <= pedidas + 0.01) continue
      // Un exceso ya revisado solo se calla mientras no CREZCA.
      const revisado = EXCESOS_HISTORICOS_REVISADOS[Number(l.transid)]
      if (revisado && s.und <= revisado.salio + 0.01) continue
      casos.push(
        `ID${l.id_empresa} pedido ${l.idpedido} · ${l.producto}: pidió ${pedidas} y entre ${s.ordenes.size} órdenes salieron ${s.und} (${s.und - pedidas} de más)${
          revisado ? ` · ESTE CASO YA ESTABA REVISADO en ${revisado.salio} y volvió a crecer` : ""
        }`,
      )
    }
    out.push(resultadoDe(CHK_SUMA_ORDENES, casos))
  } catch (e: any) {
    const texto = e?.message || e?.details || e?.hint || String(e) || "error sin mensaje"
    const falta = /does not exist|schema cache|not find/i.test(texto)
    out.push(sinDatos(CHK_SUMA_ORDENES, falta ? "la tabla pedidodetalle_ocargue no existe: falta correr scripts/226_pedido_ordenes_cargue.sql" : texto))
  }
  return out
}

// ───────────────────────────── El propio monitoreo ─────────────────────────────

const CHK_ERRORES = {
  clave: "errores_legibles",
  titulo: "La tabla de errores se puede leer",
  regla: "Un monitoreo que no puede leer su tabla no puede decir 'todo bien' (lección del 5-oct: una columna mal escrita hizo leer 0 cuando había 7).",
  gravedad: "critico" as const,
}
export async function checkErroresLegibles(sb: SB): Promise<ResultadoCheck> {
  const { error } = await sb.from("app_errores").select("id, created_at").order("id", { ascending: false }).limit(1)
  if (error) return sinDatos(CHK_ERRORES, error.message)
  return resultadoDe(CHK_ERRORES, [])
}

/** Corre todas las comprobaciones. Cada una falla por separado: nunca una tumba a las demás. */
const CHK_RASTRO_SIN_ORDEN = {
  clave: "rastro_sin_orden",
  titulo: "Rastros de una orden que ya no existe",
  regla:
    "Toda orden que viva en el sistema debe tener su proceso completo. Si se borra una orden, se van con ella su asignación de lotes y sus movimientos de inventario: un rastro suelto es inventario o lotes atribuidos a un documento que nadie puede abrir.",
  gravedad: "critico" as const,
}

/**
 * Órdenes historicas con rastro suelto, revisadas una por una el 2026-10-08 y dejadas
 * QUIETAS por instrucción expresa de gerencia: "yo no quiero mover inventarios al día de
 * hoy, todo está cuadrado y no podemos revivir lotes o cambiar nada del pasado".
 *
 * Medido completo: 49 órdenes, 149 movimientos de inventario TODOS aprobados por 17.986
 * unidades, más 72 filas de asignación de lote. Por proyecto: ID3 26 órdenes / 15.539 und,
 * ID1 20 / 1.083, ID2 2 / 1.364, ID4 1 / 0. Todas entre el 8 de enero y el 11 de agosto:
 * NINGUNA de septiembre ni de octubre, que es lo que dice que el flujo de hoy está limpio.
 *
 * Son tres cosas distintas y ninguna se toca:
 *
 *   · 24 órdenes con asignación de lote Y con inventario que sí salió y sigue descontado.
 *     Borrar su asignación dejaría un movimiento real sin su único soporte.
 *   · 20 órdenes de ID3 de la primera semana de enero con SOLO movimientos de inventario,
 *     sin asignación. Son las que destapó quitar la ventana de días.
 *   ·  5 órdenes sin ningún movimiento (9 filas, 2.643 unidades asignadas que nunca
 *     salieron). Son inertes; se dejan igual porque no hay razón para tocar el pasado.
 *
 * SE MIRA TODO EL HISTÓRICO, SIN VENTANA DE DÍAS. Antes solo miraba 30 días, y eso dejaba un
 * hueco real: si mañana se borra una orden de hace tres meses, su asignación lleva la fecha
 * vieja y la alerta no la habría visto nunca. Con la lista de revisadas, lo conocido calla y
 * cualquier caso nuevo —de cualquier fecha— salta.
 */
const RASTROS_HISTORICOS_REVISADOS = new Set<string>([
  // Con asignación de lote y con inventario que sí salió. No se tocan jamás.
  "IND202601084", "IND2026011014", "IND2026011116", "IND20260126316", "IND20260131503",
  "IND20260202559", "IND20260203609", "IND20260203623", "IND20260204641", "MOL20260209833",
  "IND20260210890", "IND20260211956", "IND202602231399", "MOL202603172248", "MOL202603242464",
  "MOL202603242466", "MOL202603312769", "MOL202604012832", "IND202604103114", "IND202604183488",
  "IND202604233678", "AVI202605114366", "IND202606065517", "AVI202608107821",
  // Con asignación de lote y sin ningún movimiento de inventario. Inertes.
  "MED202602131090", "IND202602191290", "IND202602251524", "IND202603071876", "IND202606035359",
  // Solo movimientos de inventario, sin asignación: las 20 de ID3 de la primera semana de
  // enero, cuando el sistema arrancaba. Su `creado` viene nulo, que es por lo que la ventana
  // de 30 días tampoco las habría visto nunca.
  "MOL202601021", "MOL202601022", "MOL202601023", "MOL202601025", "MOL202601026",
  "MOL202601031", "MOL202601032", "MOL202601051", "MOL202601052", "MOL202601053",
  "MOL202601054", "MOL202601055", "MOL202601061", "MOL202601062", "MOL202601063",
  "MOL202601064", "MOL202601071", "MOL202601072", "MOL202601073", "MOL202601074",
])

/**
 * Asignaciones de lote y movimientos de inventario cuya orden de cargue ya no existe.
 *
 * Regla de gerencia (2026-10-07): "toda orden que viva en el sistema debe tener su proceso
 * completo; si no es así es una alerta y debe quedar visible".
 *
 * Desde el 2026-10-06 el borrado de una orden se lleva sus rastros, y desde el 2026-10-07
 * ni se puede borrar una orden que ya despachó, así que lo que aparezca aquí es nuevo.
 */
export async function checkRastroSinOrden(sb: SB): Promise<ResultadoCheck> {
  try {

    // Las órdenes que existen hoy. Se traen todas: son ~9.500 y el cruce tiene que ser exacto.
    const ordenes = await fetchAllRows((from, to) =>
      sb.from("cabeceraoc").select("ordendecargue").order("id", { ascending: true }).range(from, to),
    )
    const existen = new Set(ordenes.map((o: any) => String(o.ordendecargue ?? "").trim()).filter(Boolean))
    if (existen.size === 0) {
      return sinDatos(CHK_RASTRO_SIN_ORDEN, "no se pudo leer ninguna orden de cargue: sin eso el cruce diría que todo está huérfano")
    }

    const movimientos = await fetchAllRows((from, to) =>
      sb
        .from("invtrans")
        .select("id, ocargue, idempresa, nombreproducto, cantidad, status, creado")
        .not("ocargue", "is", null)
        .ilike("origen", "orden de cargue")
        .order("id", { ascending: true })
        .range(from, to),
    )
    const lotes = await fetchAllRows((from, to) =>
      sb
        .from("historicolotes")
        .select("id, ordendecargue, idempresa, producto, cantidad, fecha")
        .order("id", { ascending: true })
        .range(from, to),
    )

    const casos: string[] = []
    const porOrdenMov = new Map<string, { n: number; und: number; id: number }>()
    for (const m of movimientos) {
      const oc = String(m.ocargue ?? "").trim()
      if (!oc || existen.has(oc) || RASTROS_HISTORICOS_REVISADOS.has(oc)) continue
      const v = porOrdenMov.get(oc) ?? { n: 0, und: 0, id: m.idempresa }
      v.n++
      v.und += n0(m.cantidad)
      porOrdenMov.set(oc, v)
    }
    for (const [oc, v] of porOrdenMov) {
      casos.push(`ID${v.id} · ${oc}: ${v.n} movimiento(s) de inventario por ${n0(v.und)} unidades, y la orden no existe`)
    }

    const porOrdenLote = new Map<string, { n: number; id: number }>()
    for (const l of lotes) {
      const oc = String(l.ordendecargue ?? "").trim()
      if (!oc || existen.has(oc) || RASTROS_HISTORICOS_REVISADOS.has(oc)) continue
      const v = porOrdenLote.get(oc) ?? { n: 0, id: l.idempresa }
      v.n++
      porOrdenLote.set(oc, v)
    }
    for (const [oc, v] of porOrdenLote) {
      casos.push(`ID${v.id} · ${oc}: ${v.n} línea(s) de asignación de lote, y la orden no existe`)
    }

    return resultadoDe(CHK_RASTRO_SIN_ORDEN, casos)
  } catch (e: any) {
    return sinDatos(CHK_RASTRO_SIN_ORDEN, e?.message ?? String(e))
  }
}

const CHK_VINCULO_POR_ID = {
  clave: "vinculo_orden_por_id",
  titulo: "Rastros nuevos que no quedaron ligados a su orden por id",
  regla:
    "Toda fila nueva que nombre una orden de cargue debe guardar también su id (`idorden`), no solo el código de texto. El código no es único (cabeceraoc tiene 55 repetidos), así que por texto no siempre se sabe de qué orden habla una fila. Es el termómetro del paso 3: cuando esto lleve días en cero, se puede poner la llave foránea y el huérfano se vuelve imposible.",
  gravedad: "alerta" as const,
}

/**
 * Filas RECIENTES que traen código de orden pero no su id.
 *
 * Mira solo los últimos días a propósito: el histórico anterior al script 251 tiene su
 * residuo conocido y medido (38 ambiguas y 322 huérfanas en invtrans, 30 y 77 en
 * historicolotes, 24 y 254 en el libro) y no se va a mover. Lo que importa aquí es si el
 * CÓDIGO NUEVO está escribiendo el vínculo, que es la condición para el paso 3.
 */
export async function checkVinculoPorId(sb: SB, dias = 15): Promise<ResultadoCheck> {
  try {
    const desde = diasAtrasISO(dias)
    const desdeFecha = desde.slice(0, 10)
    const casos: string[] = []

    const mov = await fetchAllRows((from, to) =>
      sb
        .from("invtrans")
        .select("id, ocargue, idorden, creado")
        .not("ocargue", "is", null)
        .ilike("origen", "orden de cargue")
        .is("idorden", null)
        .gte("creado", desde)
        .order("id", { ascending: true })
        .range(from, to),
    )
    if (mov.length > 0) casos.push(`invtrans: ${mov.length} movimiento(s) con código de orden y sin idorden (ids ${mov.slice(0, 5).map((m: any) => m.id).join(", ")}${mov.length > 5 ? "…" : ""})`)

    const lotes = await fetchAllRows((from, to) =>
      sb
        .from("historicolotes")
        .select("id, ordendecargue, idorden, fecha")
        .not("ordendecargue", "is", null)
        .is("idorden", null)
        .gte("fecha", desdeFecha)
        .order("id", { ascending: true })
        .range(from, to),
    )
    if (lotes.length > 0) casos.push(`historicolotes: ${lotes.length} asignación(es) con código de orden y sin idorden`)

    // Solo lo que escribió la APP. Las filas que reconstruyó el backfill del 4-oct llevan
    // la fecha de ese día y son histórico, no trabajo nuevo: contarlas diría que el código
    // no está escribiendo el vínculo cuando sí lo está.
    const libro = await fetchAllRows((from, to) =>
      sb
        .from("pedidodetalle_ocargue")
        .select("id, ocargue, idorden, creado_en")
        .eq("origen", "app")
        .not("ocargue", "is", null)
        .is("idorden", null)
        .gte("creado_en", desde)
        .order("id", { ascending: true })
        .range(from, to),
    )
    if (libro.length > 0) casos.push(`pedidodetalle_ocargue: ${libro.length} atribución(es) con código de orden y sin idorden`)

    return resultadoDe(CHK_VINCULO_POR_ID, casos)
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    const falta = /idorden|column .* does not exist/i.test(msg)
    return sinDatos(CHK_VINCULO_POR_ID, falta ? "falta correr scripts/251_ligar_rastros_a_la_orden_por_id.sql" : msg)
  }
}

const CHK_CICLO_ESTANCADO = {
  clave: "ciclo_facturacion_estancado",
  titulo: "Prefacturas aprobadas que llevan días sin avanzar en el ciclo de cobro",
  regla:
    "Una prefactura aprobada tiene que avanzar: firmar el anexo, emitir la factura y cobrarla. Si se queda quieta, es plata entregada que nadie está cobrando y nadie se entera hasta que alguien abre la pantalla.",
  gravedad: "alerta" as const,
}

/**
 * El ciclo de facturación, mirado por el lado del dinero.
 *
 * Medido el 2026-10-08: las 59 prefacturas aprobadas estaban TODAS en el primer paso
 * (`pendiente_firma_anexo`), 23 de ellas con más de dos semanas quietas, por $172.418.009.
 * El cron las crea y las aprueba solo todas las madrugadas, pero el paso siguiente es humano
 * —conseguir el anexo firmado— y desde que arrancó el ciclo el 1 de octubre nadie lo había
 * dado. No fallaba nada: simplemente nadie estaba mirando.
 *
 * Se respeta el MISMO corte que la pantalla (`CORTE_CICLO_SIIGO`, hoy 2026-10-01). Lo
 * anterior se facturó por fuera y mostrarlo aquí invitaría a volver a facturarlo, que es
 * justo lo que ese corte evita: una factura electrónica de más no se borra.
 */
export async function checkCicloFacturacion(sb: SB, dias = 7): Promise<ResultadoCheck> {
  try {
    const { CORTE_CICLO_SIIGO } = await import("@/lib/ciclo-facturacion-shared")
    const filas = await fetchAllRows((from, to) =>
      sb
        .from("prefacturas")
        .select("id, idempresa, proyecto, periodo_desde, periodo_hasta, total, estado, estado_ciclo, ciclo_actualizado_en, created_at")
        .gte("periodo_hasta", CORTE_CICLO_SIIGO)
        .order("id", { ascending: true })
        .range(from, to),
    )
    const limite = Date.now() - dias * 24 * 60 * 60 * 1000
    const quietas = filas.filter((p: any) => {
      // Lo cerrado ya no espera a nadie.
      if (/anulad|cerrad|cobrad|pagad/i.test(String(p.estado_ciclo ?? "") + String(p.estado ?? ""))) return false
      const desde = p.ciclo_actualizado_en ?? p.created_at
      return desde ? new Date(desde).getTime() < limite : false
    })
    if (quietas.length === 0) return resultadoDe(CHK_CICLO_ESTANCADO, [])

    const porPaso = new Map<string, { n: number; v: number; emp: Set<number>; masVieja: number }>()
    for (const p of quietas) {
      const k = String(p.estado_ciclo ?? "sin paso")
      const v = porPaso.get(k) ?? { n: 0, v: 0, emp: new Set<number>(), masVieja: Date.now() }
      v.n++
      v.v += n0(p.total)
      v.emp.add(Number(p.idempresa))
      const t = new Date(p.ciclo_actualizado_en ?? p.created_at).getTime()
      if (t < v.masVieja) v.masVieja = t
      porPaso.set(k, v)
    }
    const casos = [...porPaso.entries()].map(([paso, v]) => {
      const diasQuieta = Math.floor((Date.now() - v.masVieja) / (24 * 60 * 60 * 1000))
      const plata = "$" + Math.round(v.v).toLocaleString("es-CO")
      const proyectos = [...v.emp].sort().map((e) => `ID${e}`).join(", ")
      return `${v.n} prefactura(s) en «${paso}» por ${plata} (${proyectos}); la más vieja lleva ${diasQuieta} días quieta`
    })
    return resultadoDe(CHK_CICLO_ESTANCADO, casos)
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    const falta = /does not exist|schema cache|not find/i.test(msg)
    return sinDatos(CHK_CICLO_ESTANCADO, falta ? "la tabla prefacturas no existe todavía" : msg)
  }
}

// ───────────────────────────── Ingresos a un CEDI ─────────────────────────────

const CHK_INGRESOS_SIN_CRUCE = {
  clave: "ingresos_sin_cruce",
  titulo: "Descargues sin ingreso al inventario, e ingresos a mano sin orden (CEDI)",
  regla:
    "En un CEDI todo lo que entra viene de un descargue (o es devolución / ajuste de conteo): cada descargue finalizado debe tener su ingreso 101 aprobado citando la orden, y ningún 101 debe digitarse sin número de orden. Si no, la orden queda 'sin inventario', el ingreso 'sin orden', y nada cruza.",
  gravedad: "alerta" as const,
}
/** Proyectos que reciben PT por descargue y no producen: ID3 Cedi Funza (ID4 Medellín, entregado). */
const CEDIS_RECEPTORES = [3, 4]
export async function checkIngresosSinCruce(sb: SB, dias = 7): Promise<ResultadoCheck> {
  // Encontrado el 2026-10-08 en Cedi Funza: 16.453 unidades de "ingreso producción" digitadas
  // a mano sin el número de orden desde septiembre, porque al aprobar el ingreso automático no
  // se podía corregir la cantidad y el CEDI rechazaba y volvía a digitar. Esto avisa al día
  // siguiente, no al mes.
  const desdeISO = diasAtrasISO(dias)
  const desdeFecha = desdeISO.slice(0, 10)
  try {
    const ords = await fetchAllRows((from, to) =>
      sb
        .from("cabeceraoc")
        .select("id, idempresa, ordendecargue, status, fechacargue")
        .in("idempresa", CEDIS_RECEPTORES)
        .eq("tipooperacion", "Descargue")
        .gte("fechacargue", desdeFecha)
        .order("id", { ascending: true })
        .range(from, to),
    )
    const finalizadas = ords.filter((o: any) => norm(o.status).startsWith("final") || norm(o.status).startsWith("cerrad"))
    const codigos = [...new Set(finalizadas.map((o: any) => String(o.ordendecargue ?? "")).filter(Boolean))]
    const conIngreso = new Set<string>()
    for (let i = 0; i < codigos.length; i += 100) {
      const filas = await fetchAllRows((from, to) =>
        sb
          .from("invtrans")
          .select("id, ocargue, status")
          .eq("tipomov", "Entrada")
          .eq("cod_movimiento", "101")
          .in("ocargue", codigos.slice(i, i + 100))
          .order("id", { ascending: true })
          .range(from, to),
      )
      for (const f of filas) if (norm(f.status).startsWith("apr")) conIngreso.add(String(f.ocargue))
    }
    const casos = finalizadas
      .filter((o: any) => !conIngreso.has(String(o.ordendecargue)))
      .map((o: any) => `ID${n0(o.idempresa)} · descargue ${o.ordendecargue} del ${o.fechacargue}: finalizado y sin ningún ingreso 101 aprobado que lo cite`)

    const aMano = await fetchAllRows((from, to) =>
      sb
        .from("invtrans")
        .select("id, idempresa, nombreproducto, cantidad, creadopor, creado, status, ocargue")
        .in("idempresa", CEDIS_RECEPTORES)
        .eq("tipomov", "Entrada")
        .eq("cod_movimiento", "101")
        .is("ocargue", null)
        .gte("creado", desdeISO)
        .order("id", { ascending: true })
        .range(from, to),
    )
    for (const m of aMano) {
      if (!norm(m.status).startsWith("apr")) continue
      casos.push(`ID${n0(m.idempresa)} · ingreso 101 #${m.id} a mano sin orden: ${m.nombreproducto} ${n0(m.cantidad)} und (${m.creadopor ?? "sin usuario"}, ${String(m.creado).slice(0, 10)})`)
    }
    return resultadoDe(CHK_INGRESOS_SIN_CRUCE, casos)
  } catch (e: any) {
    return sinDatos(CHK_INGRESOS_SIN_CRUCE, e?.message ?? String(e))
  }
}

const CHK_ASIGNACION = {
  clave: "asignacion_vs_invtrans",
  titulo: "La asignación de lotes dice una cosa y el inventario otra",
  regla:
    "invtrans es la FUENTE DE VERDAD del inventario: el saldo (saldoinvdetalle, invglobal) se deriva de ella sola. Pero `historicolotes` —la asignación de lotes que alimenta el picking y los PDF— se escribe aparte y NO se recalcula: si alguien corrige invtrans sin corregirla, los papeles del despacho mienten aunque el saldo esté bien.",
  gravedad: "alerta" as const,
}
/**
 * Vigila la única tabla de inventario que puede quedar desalineada de invtrans sin que el
 * saldo lo note. Medido el 2026-10-08: CERO descuadres en ID1 (481 órdenes), ID2 (278) e
 * ID3 (182) desde el 1-sep. Nace limpio, así que cualquier caso nuevo es real.
 */
export async function checkAsignacionVsInvtrans(sb: SB, dias = 30): Promise<ResultadoCheck> {
  const desdeFecha = diasAtrasISO(dias).slice(0, 10)
  try {
    const ords = await fetchAllRows((from, to) =>
      sb
        .from("cabeceraoc")
        .select("id, idempresa, ordendecargue, fechacargue")
        .eq("tipooperacion", "Cargue")
        .gte("fechacargue", desdeFecha)
        .order("id", { ascending: true })
        .range(from, to),
    )
    const empresaDe = new Map<string, number>()
    for (const o of ords) empresaDe.set(String(o.ordendecargue ?? ""), n0(o.idempresa))
    const codigos = [...empresaDe.keys()].filter(Boolean)

    const salida = new Map<string, number>()
    const asignado = new Map<string, number>()
    const sumar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
    for (let i = 0; i < codigos.length; i += 100) {
      const grupo = codigos.slice(i, i + 100)
      const movs = await fetchAllRows((from, to) =>
        sb
          .from("invtrans")
          .select("id, ocargue, nombreproducto, cantidad, tipomov, cod_movimiento, status")
          .in("ocargue", grupo)
          .order("id", { ascending: true })
          .range(from, to),
      )
      for (const m of movs) {
        if (m.tipomov !== "Salida" || String(m.cod_movimiento ?? "") !== "601" || !norm(m.status).startsWith("apr")) continue
        sumar(salida, `${m.ocargue}|${norm(m.nombreproducto)}`, n0(m.cantidad))
      }
      const hl = await fetchAllRows((from, to) =>
        sb
          .from("historicolotes")
          .select("id, ordendecargue, producto, cantidad")
          .in("ordendecargue", grupo)
          .order("id", { ascending: true })
          .range(from, to),
      )
      // OJO: `historicolotes.cantidad` es TEXTO (ver docs/diccionario-trampas.md §2).
      for (const h of hl) sumar(asignado, `${h.ordendecargue}|${norm(h.producto)}`, n0(h.cantidad))
    }

    const casos: string[] = []
    for (const k of new Set([...salida.keys(), ...asignado.keys()])) {
      const inv = salida.get(k) ?? 0
      const asg = asignado.get(k) ?? 0
      if (Math.abs(inv - asg) <= 0.5) continue
      const [oc, producto] = k.split("|")
      casos.push(`ID${empresaDe.get(oc) ?? "?"} · ${oc} · ${producto}: inventario ${inv}, asignación de lotes ${asg} (dif ${asg - inv})`)
    }
    return resultadoDe(CHK_ASIGNACION, casos)
  } catch (e: any) {
    return sinDatos(CHK_ASIGNACION, e?.message ?? String(e))
  }
}

const CHK_AJUSTE_HUERFANO = {
  clave: "ajuste_conteo_sin_movimiento",
  titulo: "Ajuste de un conteo que dice haber movido stock, y no lo movió",
  regla:
    "Un conteo vive en dos sitios: la línea (fija el inicial del mes) y su ajuste + movimiento en invtrans (mueve el stock). Si se borra el movimiento y el ajuste queda 'aprobado', el conteo cree que descontó algo que el inventario nunca descontó, y el Kardex del mes queda 'sin soporte' para siempre.",
  gravedad: "critico" as const,
}
/**
 * Encontrado el 2026-10-08 en ID3: 3 de los 29 ajustes del Conteo #39 habían perdido su
 * movimiento (se borraron a mano para quitar lotes negativos, sin tocar el ajuste), y eso
 * explicaba 316 unidades "sin soporte" en el Kardex de octubre: POLI PANADERIA −285,
 * HARINA 24LB −30 y FIDEO A LA MESA −1. Nadie se enteró hasta que gerencia miró el Kardex.
 *
 * Mira SOLO los ajustes de un conteo (`cuadre_id` no nulo), que son los que fijan el inicial
 * del mes. Las correcciones sueltas (309/311 registradas fuera de un conteo) viven en otro
 * flujo y no mueven la base: medido el mismo día, ID1 tiene 206 así, en pares que se
 * compensan; meterlas aquí ahogaría los casos que sí importan.
 */
export async function checkAjusteConteoSinMovimiento(sb: SB): Promise<ResultadoCheck> {
  try {
    const ajustes = await fetchAllRows((from, to) =>
      sb
        .from("sig_inventario_ajuste")
        .select("id, proyecto_id, cuadre_id, producto, lote, location, cantidad, tipo, estado, invtrans_id")
        .eq("activo", true)
        .eq("estado", "aprobado")
        .not("cuadre_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
    )
    const ids = [...new Set(ajustes.map((a: any) => a.invtrans_id).filter(Boolean))]
    const existen = new Set<number>()
    for (let i = 0; i < ids.length; i += 200) {
      const filas = await fetchAllRows((from, to) =>
        sb.from("invtrans").select("id").in("id", ids.slice(i, i + 200)).order("id", { ascending: true }).range(from, to),
      )
      for (const f of filas) existen.add(Number(f.id))
    }
    const casos: string[] = []
    for (const a of ajustes) {
      const falta = !a.invtrans_id
        ? "nunca se le registró el movimiento"
        : !existen.has(Number(a.invtrans_id))
          ? `su movimiento invtrans #${a.invtrans_id} ya no existe`
          : null
      if (!falta) continue
      casos.push(
        `ID${n0(a.proyecto_id)} · conteo #${n0(a.cuadre_id)} · aj#${n0(a.id)} ${a.producto} lote ${a.lote ?? "—"} ${a.location ?? ""}: ${n0(a.cantidad) === 0 ? "0" : a.cantidad} (${a.tipo}) — ${falta}`,
      )
    }
    return resultadoDe(CHK_AJUSTE_HUERFANO, casos)
  } catch (e: any) {
    return sinDatos(CHK_AJUSTE_HUERFANO, e?.message ?? String(e))
  }
}

const CHK_HALLAZGO_VENCIDO = {
  clave: "hallazgo_conteo_vencido",
  titulo: "Diferencias del conteo que llevan días sin explicarse",
  regla:
    "El conteo cíclico detecta; la diferencia que encuentra es el síntoma de un movimiento que no se registró el día que ocurrió. Si nadie la explica en dos días ya no se puede reconstruir: el producto se movió, la gente cambió de turno y la causa se pierde.",
  gravedad: "alerta" as const,
}
/**
 * El vigilante del plazo (gerencia 2026-10-10). El cálculo es el mismo de la pestaña "Hallazgos y
 * exactitud" (`lib/conteo-hallazgos.ts`, puro y con pruebas), para que el correo de la madrugada y
 * la pantalla nunca digan cosas distintas.
 */
export async function checkHallazgosVencidos(sb: SB, dias = 20): Promise<ResultadoCheck> {
  try {
    const desde = diasAtrasISO(dias).slice(0, 10)
    const conteos = await fetchAllRows((from, to) =>
      sb
        .from("sig_inventario_cuadre")
        .select("id, proyecto_id, fecha, tipo, estado")
        .gte("fecha", desde)
        .order("id", { ascending: true })
        .range(from, to),
    )
    const vivos = (conteos ?? []).filter((c: any) => !["anulado", "borrador"].includes(String(c.estado ?? "")))
    if (vivos.length === 0) return resultadoDe(CHK_HALLAZGO_VENCIDO, [])
    const ids = vivos.map((c: any) => Number(c.id))
    const lineas: any[] = []
    const ajustes: any[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const tanda = ids.slice(i, i + 50)
      lineas.push(
        ...(await fetchAllRows((from, to) =>
          sb
            .from("sig_inventario_cuadre_detalle")
            .select("id, cuadre_id, codproducto, producto, lote, location, sistema, conteo, diferencia, observacion, contado_por")
            .in("cuadre_id", tanda)
            .order("id", { ascending: true })
            .range(from, to),
        )),
      )
      ajustes.push(
        ...(await fetchAllRows((from, to) =>
          sb
            .from("sig_inventario_ajuste")
            .select("id, cuadre_id, codproducto, lote, location, cantidad, cod_movimiento")
            .in("cuadre_id", tanda)
            .eq("activo", true)
            .order("id", { ascending: true })
            .range(from, to),
        )),
      )
    }
    const hoy = new Date().toISOString().slice(0, 10)
    const vencidos = hallazgosPendientes(vivos, lineas, ajustes, hoy).filter((h) => h.vencido)
    const casos = vencidos
      .slice(0, 25)
      .map(
        (h) =>
          `ID${h.proyectoId ?? "?"} · conteo #${h.cuadreId} del ${h.fecha} (${h.tipo}) · ${h.producto} lote ${h.lote || "—"} ${h.location || ""}: ` +
          `${h.pendiente > 0 ? "+" : ""}${h.pendiente} sin explicar, ${h.diasAbierto} días` +
          (h.novedad ? ` · novedad: "${h.novedad}"` : " · SIN novedad escrita"),
      )
    if (vencidos.length > 25) casos.push(`… y ${vencidos.length - 25} más`)
    return resultadoDe(CHK_HALLAZGO_VENCIDO, casos)
  } catch (e: any) {
    return sinDatos(CHK_HALLAZGO_VENCIDO, e?.message ?? String(e))
  }
}

const CHK_ORDEN_BORRADA_CON_VALOR = {
  clave: "orden_eliminada_con_valor",
  titulo: "Se borró una orden que se llevaba inventario o facturación",
  regla:
    "Borrar una orden finalizada devuelve al stock lo que el camión ya se llevó, y puede arrastrar la facturación de su clon de distribución. Si pasa, hay que saberlo el mismo día, no tres semanas después.",
  gravedad: "critico" as const,
}
/**
 * Nace de dos casos reales encontrados el 2026-10-10, ninguno de los cuales avisó a nadie:
 *   · AVI202610069897 (ID2, 7-oct): se borró con 3 salidas APROBADAS → 114 unidades volvieron al
 *     stock de ID2 mientras el camión ya las había entregado.
 *   · MOL202609289628 (ID3, 8-oct): igual, con 126 unidades de Fideo a la Mesa.
 *   · Y el clon AVI202610069897D facturaba 4,4397 t por $183.324 SIN un solo movimiento de
 *     inventario: un aviso que solo mire inventario se lo pierde.
 * La fuente es `ordenes_eliminadas` (script 279), que el disparador llena con esas señales en el
 * momento del borrado. Mira los últimos 15 días: el pasado ya está informado y congelado.
 */
export async function checkOrdenEliminadaConValor(sb: SB, dias = 15): Promise<ResultadoCheck> {
  try {
    const desde = diasAtrasISO(dias)
    const filas = await fetchAllRows((from, to) =>
      sb
        .from("ordenes_eliminadas")
        .select(
          "id, idempresa, ordendecargue, tipooperacion, status, eliminada_en, eliminada_por_nombre, origen, movimientos_inventario, unidades_inventario, facturaba_toneladas, facturaba_valor, tenia_clon",
        )
        .gte("eliminada_en", desde)
        .order("id", { ascending: true })
        .range(from, to),
    )
    const casos: string[] = []
    for (const f of filas as any[]) {
      const movs = n0(f.movimientos_inventario)
      const valor = n0(f.facturaba_valor)
      const ton = n0(f.facturaba_toneladas)
      if (movs === 0 && valor === 0 && ton === 0) continue
      const señales: string[] = []
      if (movs > 0) señales.push(`se llevó ${movs} movimiento(s) de inventario por ${n0(f.unidades_inventario)} unidades`)
      if (valor > 0 || ton > 0) señales.push(`facturaba ${ton} t por $${Math.round(valor).toLocaleString("es-CO")}`)
      casos.push(
        `ID${n0(f.idempresa)} · ${f.ordendecargue ?? "sin código"} (${f.tipooperacion ?? ""}, estado ${f.status ?? "—"}) ` +
          `borrada el ${String(f.eliminada_en).slice(0, 16).replace("T", " ")} por ${f.eliminada_por_nombre} ` +
          `desde ${f.origen}: ${señales.join(" y ")}`,
      )
    }
    return resultadoDe(CHK_ORDEN_BORRADA_CON_VALOR, casos)
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    const falta = /ordenes_eliminadas|schema cache|does not exist/i.test(msg)
    return sinDatos(CHK_ORDEN_BORRADA_CON_VALOR, falta ? "falta correr scripts/279_ordenes_eliminadas.sql" : msg)
  }
}

export async function correrChecks(sb: SB): Promise<ResultadoCheck[]> {
  const [dup, mas, pend, stock, ped, err, rastro, vinculo, ciclo, ingresos, asignacion, huerfano, borradas, hallazgos] = await Promise.all([
    checkSalidasDuplicadas(sb),
    checkSalioMasQueOrden(sb),
    checkPendientesInventario(sb),
    checkStockNegativo(sb),
    checkPedidos(sb),
    checkErroresLegibles(sb),
    checkRastroSinOrden(sb),
    checkVinculoPorId(sb),
    checkCicloFacturacion(sb),
    checkIngresosSinCruce(sb),
    checkAsignacionVsInvtrans(sb),
    checkAjusteConteoSinMovimiento(sb),
    checkOrdenEliminadaConValor(sb),
    checkHallazgosVencidos(sb),
  ])
  return [dup, mas, ...pend, ...stock, ...ped, err, rastro, vinculo, ciclo, ingresos, asignacion, huerfano, borradas, hallazgos]
}
