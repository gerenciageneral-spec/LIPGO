/**
 * INGRESO AUTOMÁTICO DE UN DESCARGUE: cuántas filas de inventario nacen, con qué lote y cantidad.
 *
 * Módulo PURO (sin "use server", sin base de datos) para poder probarlo. Lo usa
 * `generarIngresoProduccionDesdeDescargue` (lib/orders-actions.tsx).
 *
 * EL DEFECTO QUE ESTO CORRIGE (Cedi Funza, descargue MOL202609299667 del 2-oct-2026)
 *
 * Los lotes del ingreso salen del cargue madre, en un mapa por (producto + cliente).
 * El detalle del descargue traía DOS líneas del mismo producto para el mismo cliente
 * —380 y 4 de POLI PANADERIA para CEDI FUNZA— y cada línea pedía al mapa "sus" lotes:
 * las dos recibían la MISMA lista completa (39 + 40 + 301 + 4 = 384) y cada una la
 * empujaba entera. Resultado: 384 unidades fantasma en el inventario de Funza, que
 * después se despacharon como si existieran, y al borrar las filas repetidas los lotes
 * quedaron en negativo. El mismo defecto había entrado dos veces en Cedi Medellín en
 * agosto (+685 y +1.527 unidades).
 *
 * LA REGLA: los lotes de una llave (producto + cliente) se emiten UNA sola vez, contra
 * la SUMA de las líneas del detalle que comparten esa llave. Si la suma de lotes no
 * coincide con la suma del detalle, se conservan las cantidades por lote (son el dato
 * real de lo que salió) y se avisa; igual que antes, pero sin duplicar.
 */

export interface LineaDetalleDescargue {
  producto: string | null | undefined
  cantidad: number | string | null | undefined
  cliente?: string | null | undefined
  /** Lote capturado a mano al generar la orden (recepciones sin cargue madre). */
  lote?: string | null | undefined
}

export interface LoteOrigen {
  lote: string
  cantidad: number
}

export interface FilaIngreso {
  producto: string
  cliente: string | null
  lote: string | null
  cantidad: number
}

export interface AvisoIngreso {
  producto: string
  cliente: string | null
  sumaLotes: number
  sumaDetalle: number
}

export const norm = (s: unknown) => String(s ?? "").trim().toUpperCase()

/**
 * @param detalle líneas del descargue (`detalleoc`).
 * @param lotesPorProducto lotes del traslado (`despachotraslados`), por producto. Mandan.
 * @param lotesPorLinea lotes del cargue madre (`historicolotes`), por producto|cliente.
 */
export function filasDeIngreso(
  detalle: readonly LineaDetalleDescargue[],
  lotesPorProducto: ReadonlyMap<string, LoteOrigen[]>,
  lotesPorLinea: ReadonlyMap<string, LoteOrigen[]>,
): { filas: FilaIngreso[]; avisos: AvisoIngreso[] } {
  // 1) Agrupar el detalle por la MISMA llave con la que se buscan los lotes. Dos líneas
  //    del mismo producto y cliente son una sola entrega a efectos del ingreso.
  type Grupo = { producto: string; cliente: string | null; cantidad: number; loteLinea: string | null }
  const grupos = new Map<string, Grupo>()
  for (const d of detalle) {
    const cant = Number(d.cantidad) || 0
    if (cant <= 0) continue
    const producto = String(d.producto ?? "").trim()
    if (!producto) continue
    const cliente = d.cliente == null ? null : String(d.cliente)
    const k = norm(producto) + "|" + norm(cliente)
    const g = grupos.get(k) ?? { producto, cliente, cantidad: 0, loteLinea: null }
    g.cantidad += cant
    // El lote escrito a mano: se conserva el primero que venga con valor.
    const loteLinea = String(d.lote ?? "").trim()
    if (loteLinea && !g.loteLinea) g.loteLinea = loteLinea
    grupos.set(k, g)
  }

  // 2) Una emisión por llave. El pool de lotes de una llave se gasta una sola vez.
  const filas: FilaIngreso[] = []
  const avisos: AvisoIngreso[] = []
  const usados = new Set<string>()
  for (const [k, g] of grupos) {
    const kProducto = norm(g.producto)
    // Orden de preferencia: el despacho del traslado manda sobre el cargue madre,
    // porque es el registro de lo que REALMENTE salió de la bodega.
    const pool = lotesPorProducto.get(kProducto) ?? lotesPorLinea.get(k)
    const llavePool = lotesPorProducto.has(kProducto) ? "P|" + kProducto : "L|" + k
    if (pool && pool.length && !usados.has(llavePool)) {
      usados.add(llavePool)
      const sumaLotes = pool.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)
      if (Math.abs(sumaLotes - g.cantidad) > 0.001) {
        avisos.push({ producto: g.producto, cliente: g.cliente, sumaLotes, sumaDetalle: g.cantidad })
      }
      for (const l of pool) {
        const c = Number(l.cantidad) || 0
        if (c <= 0) continue
        filas.push({ producto: g.producto, cliente: g.cliente, lote: String(l.lote), cantidad: c })
      }
    } else if (pool && pool.length) {
      // Ya se gastó ese pool con otra llave que mapea al mismo producto (traslado):
      // no se vuelve a emitir. Lo que diga esta línea de más queda en el aviso.
      avisos.push({ producto: g.producto, cliente: g.cliente, sumaLotes: 0, sumaDetalle: g.cantidad })
    } else {
      // Sin traslado ni cargue madre: el lote propio de la línea, si lo hay.
      filas.push({ producto: g.producto, cliente: g.cliente, lote: g.loteLinea, cantidad: g.cantidad })
    }
  }
  return { filas, avisos }
}
