/**
 * HALLAZGOS DEL CONTEO Y EXACTITUD DEL INVENTARIO (ERI).
 *
 * Módulo PURO (sin "use server", sin base de datos): aquí vive el cálculo, y el ir y venir con la
 * base queda en `lib/sig-actions.ts`.
 *
 * DE DÓNDE SALE. Gerencia, 2026-10-10: el conteo cíclico se hace todos los días y **detecta**; la
 * diferencia que encuentra es el síntoma de un movimiento que no se registró el día que ocurrió.
 * Así que una diferencia no se puede quedar quieta: o alguien la corrige con el código de su causa
 * (551 avería, 653 devolución, 309 cruce de lote, 311 mal ubicado) o alguien escribe por qué no
 * aplica. Lo que llegue sin explicar al cierre entra al Conteo total con su 701/702 y la
 * aprobación de gerencia. Ver [[lipgo-conteo-ciclico-vs-total]].
 *
 * DOS COSAS QUE SE MIDEN DISTINTO, y es la trampa de todos los tableros de inventario:
 *   · ERI por LÍNEAS   = líneas exactas ÷ líneas contadas. Es el indicador clásico.
 *   · ERI por UNIDADES = 1 − (Σ |diferencia| ÷ Σ sistema). **En valor ABSOLUTO**: si un producto
 *     sobra 10 y otro falta 10, el neto es cero y el inventario parece perfecto cuando en
 *     realidad hubo 20 unidades mal registradas.
 */

/** Días que una diferencia puede quedarse sin explicar antes de considerarse vencida. */
export const PLAZO_HALLAZGO_DIAS = 2

export interface ConteoCab {
  id: number
  proyecto_id?: number | null
  fecha?: string | null
  tipo?: string | null
  estado?: string | null
}

export interface ConteoLinea {
  id: number
  cuadre_id: number
  codproducto?: string | null
  producto?: string | null
  lote?: string | null
  location?: string | null
  sistema?: number | null
  conteo?: number | null
  diferencia?: number | null
  observacion?: string | null
  contado_por?: string | null
}

/** Una corrección ya registrada contra una línea del conteo. */
export interface AjusteDeConteo {
  cuadre_id?: number | null
  codproducto?: string | null
  lote?: string | null
  location?: string | null
  cantidad?: number | null
  cod_movimiento?: string | null
}

export interface Hallazgo {
  cuadreId: number
  proyectoId: number | null
  fecha: string | null
  tipo: string
  linea: number
  codproducto: string
  producto: string
  lote: string
  location: string
  /** Lo que el conteo encontró de diferencia. */
  diferencia: number
  /** Lo que queda por explicar: la diferencia menos lo ya corregido. */
  pendiente: number
  novedad: string
  /** El código con el que se corrigió (si ya se hizo). */
  codigosAplicados: string[]
  diasAbierto: number
  vencido: boolean
}

const n0 = (v: unknown) => Number(v) || 0
const red2 = (v: number) => Math.round(v * 100) / 100
const txt = (v: unknown) => String(v ?? "").trim()
const claveLinea = (x: { codproducto?: string | null; lote?: string | null; location?: string | null }) =>
  `${txt(x.codproducto)}|${txt(x.lote)}|${txt(x.location)}`

/** Días completos entre dos fechas AAAA-MM-DD. Negativo si la fecha es futura. */
export function diasEntre(desde: string | null | undefined, hoyISO: string): number {
  const d = txt(desde).slice(0, 10)
  if (!d) return 0
  const a = Date.parse(`${d}T00:00:00Z`)
  const b = Date.parse(`${txt(hoyISO).slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86400000)
}

/**
 * Las diferencias que siguen sin explicar, conteo por conteo.
 *
 * Una línea entra como hallazgo cuando su diferencia NO está cubierta por las correcciones ya
 * registradas para esa misma combinación de producto, lote y ubicación. Se queda fuera la línea
 * que ya se corrigió (con cualquier código) y la que nunca tuvo diferencia.
 */
export function hallazgosPendientes(
  conteos: readonly ConteoCab[],
  lineas: readonly ConteoLinea[],
  ajustes: readonly AjusteDeConteo[],
  hoyISO: string,
  plazoDias = PLAZO_HALLAZGO_DIAS,
): Hallazgo[] {
  const cabPorId = new Map<number, ConteoCab>(conteos.map((c) => [Number(c.id), c]))
  // Lo ya corregido, por conteo y línea.
  const corregido = new Map<string, number>()
  const codigos = new Map<string, string[]>()
  for (const a of ajustes) {
    const k = `${n0(a.cuadre_id)}#${claveLinea(a)}`
    corregido.set(k, red2((corregido.get(k) ?? 0) + n0(a.cantidad)))
    const cod = txt(a.cod_movimiento)
    if (cod) codigos.set(k, [...new Set([...(codigos.get(k) ?? []), cod])])
  }

  const out: Hallazgo[] = []
  for (const l of lineas) {
    const dif = red2(n0(l.diferencia))
    if (dif === 0) continue
    const cab = cabPorId.get(Number(l.cuadre_id))
    if (!cab) continue
    const k = `${Number(l.cuadre_id)}#${claveLinea(l)}`
    const pendiente = red2(dif - (corregido.get(k) ?? 0))
    if (pendiente === 0) continue
    const dias = diasEntre(cab.fecha, hoyISO)
    out.push({
      cuadreId: Number(cab.id),
      proyectoId: cab.proyecto_id == null ? null : Number(cab.proyecto_id),
      fecha: cab.fecha ?? null,
      tipo: txt(cab.tipo) || "total",
      linea: Number(l.id),
      codproducto: txt(l.codproducto),
      producto: txt(l.producto) || txt(l.codproducto),
      lote: txt(l.lote),
      location: txt(l.location),
      diferencia: dif,
      pendiente,
      novedad: txt(l.observacion),
      codigosAplicados: codigos.get(k) ?? [],
      diasAbierto: dias,
      vencido: dias > plazoDias,
    })
  }
  // Lo más viejo primero: es lo que hay que resolver ya.
  return out.sort((a, b) => b.diasAbierto - a.diasAbierto || Math.abs(b.pendiente) - Math.abs(a.pendiente))
}

export interface ResumenHallazgos {
  total: number
  vencidos: number
  sinNovedad: number
  unidadesPendientes: number
  /** Cuántos hallazgos por producto, de mayor a menor: dónde está el problema de verdad. */
  porProducto: Array<{ producto: string; hallazgos: number; unidades: number }>
}

export function resumirHallazgos(hallazgos: readonly Hallazgo[]): ResumenHallazgos {
  const porProducto = new Map<string, { hallazgos: number; unidades: number }>()
  for (const h of hallazgos) {
    const e = porProducto.get(h.producto) ?? { hallazgos: 0, unidades: 0 }
    e.hallazgos++
    e.unidades = red2(e.unidades + Math.abs(h.pendiente))
    porProducto.set(h.producto, e)
  }
  return {
    total: hallazgos.length,
    vencidos: hallazgos.filter((h) => h.vencido).length,
    sinNovedad: hallazgos.filter((h) => !h.novedad).length,
    unidadesPendientes: red2(hallazgos.reduce((s, h) => s + Math.abs(h.pendiente), 0)),
    porProducto: [...porProducto.entries()]
      .map(([producto, v]) => ({ producto, ...v }))
      .sort((a, b) => b.unidades - a.unidades || b.hallazgos - a.hallazgos),
  }
}

export interface ExactitudConteo {
  cuadreId: number
  fecha: string | null
  tipo: string
  lineas: number
  lineasExactas: number
  /** líneas exactas ÷ líneas contadas, en %. */
  eriLineas: number
  unidadesSistema: number
  /** Σ |diferencia|: las unidades mal registradas, sin que se compensen entre sí. */
  unidadesErradas: number
  /** 1 − (unidades erradas ÷ unidades del sistema), en %. */
  eriUnidades: number
}

/**
 * La exactitud de cada conteo. Solo cuenta las líneas que ALGUIEN CONTÓ: una línea sin digitar no
 * es un acierto, y meterla como exacta infla el indicador hasta volverlo inútil.
 */
export function exactitudPorConteo(
  conteos: readonly ConteoCab[],
  lineas: readonly ConteoLinea[],
): ExactitudConteo[] {
  const porConteo = new Map<number, ConteoLinea[]>()
  for (const l of lineas) {
    const k = Number(l.cuadre_id)
    porConteo.set(k, [...(porConteo.get(k) ?? []), l])
  }
  const out: ExactitudConteo[] = []
  for (const c of conteos) {
    const todas = porConteo.get(Number(c.id)) ?? []
    const contadas = todas.filter((l) => txt(l.contado_por) !== "" && !txt(l.contado_por).startsWith("RECONTAR"))
    const base = contadas.length ? contadas : []
    const exactas = base.filter((l) => red2(n0(l.diferencia)) === 0).length
    const sistema = red2(base.reduce((s, l) => s + Math.abs(n0(l.sistema)), 0))
    const erradas = red2(base.reduce((s, l) => s + Math.abs(n0(l.diferencia)), 0))
    out.push({
      cuadreId: Number(c.id),
      fecha: c.fecha ?? null,
      tipo: txt(c.tipo) || "total",
      lineas: base.length,
      lineasExactas: exactas,
      eriLineas: base.length ? red2((exactas / base.length) * 100) : 0,
      unidadesSistema: sistema,
      unidadesErradas: erradas,
      eriUnidades: sistema > 0 ? red2(Math.max(0, 1 - erradas / sistema) * 100) : base.length ? 100 : 0,
    })
  }
  return out.sort((a, b) => txt(a.fecha).localeCompare(txt(b.fecha)))
}

/** ¿Va mejorando? Compara el promedio de los últimos N con el de los N anteriores. */
export function tendenciaEri(serie: readonly ExactitudConteo[], ventana = 5): { antes: number; ahora: number; delta: number } {
  const conDato = serie.filter((s) => s.lineas > 0)
  if (conDato.length === 0) return { antes: 0, ahora: 0, delta: 0 }
  const ahoraArr = conDato.slice(-ventana)
  const antesArr = conDato.slice(-ventana * 2, -ventana)
  const prom = (xs: readonly ExactitudConteo[]) => (xs.length ? red2(xs.reduce((s, x) => s + x.eriUnidades, 0) / xs.length) : 0)
  const ahora = prom(ahoraArr)
  const antes = antesArr.length ? prom(antesArr) : ahora
  return { antes, ahora, delta: red2(ahora - antes) }
}
