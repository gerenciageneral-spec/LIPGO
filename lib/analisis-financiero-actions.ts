"use server"

/**
 * ANÁLISIS FINANCIERO por proyecto — INFORMACIÓN CONFIDENCIAL DE GERENCIA.
 *
 * Compara el ACUERDO DE VOLÚMENES de cada proyecto (tabla
 * `acuerdo_volumenes`: tarifa × volumen mensual mínimo acordado con el
 * cliente) contra el volumen REAL del período. Como LIP paga fijo por turno
 * y cobra por tonelada, el volumen acordado es el mínimo para no perder
 * dinero: **si el real queda por debajo, el faltante SE DEBE FACTURAR al
 * cliente** — eso es lo que este análisis pone de frente para gerencia.
 *
 * El volumen real se mide CON LA LÓGICA PROPIA DE CADA ID (cada proyecto es
 * un cliente distinto):
 *   · ID1: vista `facturacion` — Cargue PT / Cargue subproducto (Mogolla) /
 *     Tolva / Tolva f.
 *   · ID2: cargue por la vista; la producción (Estibado PT / Salvado, con
 *     festivos) por getConciliacionAvimol — su facturación real.
 *   · ID3: por tipooperacion (Cargue / Descargue / Distribucion).
 *   · ID4: Cargue TERCEROS = Cliente Recoge; el resto del cargue (placa
 *     propia y transportadoras) = Cargue Propios; Distribucion = Descargue
 *     distribución; Descargue = Descargue Terceros.
 *
 * Es un LECTOR: no escribe nada. Tolerante a que `acuerdo_volumenes` aún no
 * exista (migración scripts/create_acuerdo_volumenes.sql pendiente).
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getConciliacionAvimol } from "@/lib/conciliacion-avimol-actions"

const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()

/** Subproducto = Mogolla/Salvado/Tercera — mismo criterio del Cuadro. */
const esSubproducto = (subcat: unknown) => {
  const k = norm(subcat)
  return k.includes("MOGOLLA") || k.includes("SALVADO") || k.includes("TERCERA")
}

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
}

function diaSiguiente(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number)
  const [yb, mb, db] = b.split("-").map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000) + 1
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ActividadAnalisis {
  actividad: string
  codigo: string
  tarifa: number
  volumenAcordadoMes: number
  /** Acordado escalado al período (mes × meses del período). */
  volumenAcordado: number
  volumenReal: number
  cumplimientoPct: number | null
  deficit: number
  /** deficit × tarifa: lo que hay que facturar al cliente para no perder. */
  aFacturarAdicional: number
  facturaAcordada: number
  facturaReal: number
}

export interface EstructuraFila {
  actividad: string
  auxiliares: number | null
  muelle: string | null
}

export interface ProyectoAnalisis {
  idempresa: number
  proyecto: string
  actividades: ActividadAnalisis[]
  estructura: EstructuraFila[]
  tonAcordadas: number
  tonReales: number
  cumplimientoPct: number | null
  totalFacturaAcordada: number
  totalFacturaReal: number
  totalAFacturarAdicional: number
  costoNomina: number
  /** Σ facturaReal − costoNomina (solo actividades del acuerdo). */
  margenReal: number
  margenPorTon: number | null
  /** costo ÷ tarifa promedio ponderada del acuerdo = ton mínimas del período. */
  puntoEquilibrioTon: number | null
  /** Proyección lineal de toneladas al cierre (solo si el período está en curso). */
  proyeccionTon: number | null
  notas: string[]
}

export interface AnalisisFinanciero {
  desde: string
  hasta: string
  meses: number
  proyectos: ProyectoAnalisis[]
}

// ---------------------------------------------------------------------------
// Volumen real por actividad_codigo, por proyecto
// ---------------------------------------------------------------------------

async function volumenRealPorCodigo(
  sb: any,
  idempresa: number,
  desde: string,
  hasta: string,
  notas: string[],
): Promise<Map<string, number>> {
  const vol = new Map<string, number>()
  const add = (codigo: string, ton: number) => vol.set(codigo, (vol.get(codigo) || 0) + ton)
  const hastaExclusivo = diaSiguiente(hasta)

  // Toneladas de la vista `facturacion` (la misma fuente del P&L).
  let filas: any[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb
      .from("facturacion")
      .select("tipooperacion, subcategoria, transporte, toneladas")
      .eq("idempresa", idempresa)
      .gte("fechacargue", desde)
      .lt("fechacargue", hastaExclusivo)
      .range(off, off + 999)
    if (error) {
      notas.push(`No se pudo leer la facturación: ${error.message}`)
      break
    }
    if (!data || data.length === 0) break
    filas = filas.concat(data)
    if (data.length < 1000) break
  }

  for (const r of filas) {
    const op = norm(r.tipooperacion)
    const ton = num(r.toneladas)
    if (ton <= 0) continue

    if (idempresa === 1 || idempresa === 2) {
      if (op === "CARGUE") add(esSubproducto(r.subcategoria) ? "cargue_subproducto" : "aux_cargue_descargue", ton)
      else if (op === "TOLVA") add("tolva", ton)
      else if (op === "TOLVA F") add("tolva_domingo", ton)
    } else if (idempresa === 3) {
      if (op === "CARGUE") add("cargue", ton)
      else if (op === "DESCARGUE") add("descargue", ton)
      else if (op === "DISTRIBUCION") add("distribucion", ton)
    } else if (idempresa === 4) {
      if (op === "CARGUE") add(norm(r.transporte) === "TERCEROS" ? "cargue_cliente_recoge" : "cargue_propios", ton)
      else if (op === "DISTRIBUCION") add("descargue_distribucion", ton)
      else if (op === "DESCARGUE") add("descargue_terceros", ton)
    }
  }

  // ID2: la producción real (Estibado/Salvado con festivos) sale de la
  // conciliación — su facturación real, no la vista.
  if (idempresa === 2) {
    const conc = await getConciliacionAvimol(desde, hasta)
    if (conc.success && conc.data) {
      for (const d of conc.data.dias) {
        for (const p of d.productos) {
          const op = norm(p.operacion)
          if (op === "ESTIBADO PT") add("estibado_pt", p.toneladas)
          else if (op === "ESTIBADO PT FESTIVO") add("estibado_pt_festivo", p.toneladas)
          else if (op === "SALVADO") add("salvado", p.toneladas)
          else if (op === "SALVADO FESTIVO") add("salvado_festivo", p.toneladas)
        }
      }
    } else {
      notas.push(`No se pudo leer la producción de la conciliación: ${conc.message || "error"}`)
    }
  }

  return vol
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export async function getAnalisisFinanciero(
  ids: number[],
  desde: string,
  hasta: string,
  meses: number,
): Promise<{ success: boolean; data?: AnalisisFinanciero; message?: string }> {
  try {
    if (!ids?.length) return { success: false, message: "Sin proyectos en el alcance." }
    const sb: any = await getSupabaseAdmin()

    // Acuerdos vigentes que TOQUEN el período. Tolerante a tabla inexistente.
    const { data: acuerdos, error: errAc } = await sb
      .from("acuerdo_volumenes")
      .select("*")
      .in("idempresa", ids)
      .lte("fechainicio", hasta)
      .gte("fechafin", desde)
    if (errAc) {
      return {
        success: true,
        data: { desde, hasta, meses, proyectos: [] },
        message: "La tabla acuerdo_volumenes no existe todavía — correr scripts/create_acuerdo_volumenes.sql.",
      }
    }

    const { data: empresasData } = await sb.from("empresas").select("id, nombre").in("id", ids)
    const nombreDe = new Map<number, string>((empresasData || []).map((e: any) => [Number(e.id), String(e.nombre)]))

    // Nómina del período por proyecto (mismo neteo del P&L: liquidado + bono
    // con compuerta del 16-jul).
    const BONO_DESDE = "2026-07-16"
    const costoDe = new Map<number, number>()
    {
      const bonoQ = new Map<string, number>()
      for (let off = 0; ; off += 1000) {
        const { data, error } = await sb
          .from("pagonomina")
          .select("idempresaliquidacion, persona, fecha, total_liquidado_dia, bonif_prestacional")
          .in("idempresaliquidacion", ids)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .range(off, off + 999)
        if (error) break
        if (!data || data.length === 0) break
        for (const r of data) {
          const id = Number(r.idempresaliquidacion)
          costoDe.set(id, (costoDe.get(id) || 0) + num(r.total_liquidado_dia))
          const f = String(r.fecha).slice(0, 10)
          if (f >= BONO_DESDE) {
            const q = `${id}|${String(r.persona).trim()}|${f.slice(0, 7)}-${Number(f.slice(8, 10)) <= 15 ? "Q1" : "Q2"}`
            bonoQ.set(q, (bonoQ.get(q) || 0) + num(r.bonif_prestacional))
          }
        }
        if (data.length < 1000) break
      }
      for (const [k, v] of bonoQ) {
        if (v > 0) {
          const id = Number(k.split("|")[0])
          costoDe.set(id, (costoDe.get(id) || 0) + v)
        }
      }
    }

    // Período en curso → factor de proyección lineal.
    const hoy = hoyBogota()
    const enCurso = hoy >= desde && hoy <= hasta
    const factorProyeccion = enCurso ? diasEntre(desde, hasta) / Math.max(1, diasEntre(desde, hoy)) : null

    const proyectos: ProyectoAnalisis[] = []
    for (const id of ids) {
      const propios = (acuerdos || []).filter((a: any) => Number(a.idempresa) === id)
      if (!propios.length) continue

      const notas: string[] = []
      const real = await volumenRealPorCodigo(sb, id, desde, hasta, notas)

      // El acuerdo puede tener VARIAS vigencias dentro del período (ID2 cambió
      // el 1-jul): cada actividad acumula acordado = Σ(volumen × meses de su
      // vigencia dentro del período). Aproximación por meses calendario.
      type Acc = {
        actividad: string
        codigo: string
        tarifa: number
        volMes: number
        volAcordado: number
        facturaAcordada: number
      }
      const actividades = new Map<string, Acc>()
      const estructura: EstructuraFila[] = []

      for (const a of propios) {
        if (a.volumen_acordado === null || a.tarifa === null) {
          // Fila de estructura (informativa): se toma la de la vigencia que
          // cubra el final del período (la más reciente).
          if (String(a.fechafin) >= hasta || String(a.fechafin) >= hoy) {
            estructura.push({ actividad: a.actividad, auxiliares: a.auxiliares === null ? null : num(a.auxiliares), muelle: a.muelle ?? null })
          }
          continue
        }
        // Meses de esta vigencia dentro del período (aprox. por meses de 30d).
        const ini = String(a.fechainicio) > desde ? String(a.fechainicio) : desde
        const fin = String(a.fechafin) < hasta ? String(a.fechafin) : hasta
        const mesesVig = Math.min(meses, Math.max(0, diasEntre(ini, fin) / 30.4))
        const codigo = String(a.actividad_codigo ?? "").trim()
        if (!codigo) continue
        const acc = actividades.get(codigo) || {
          actividad: a.actividad,
          codigo,
          tarifa: num(a.tarifa),
          volMes: num(a.volumen_acordado),
          volAcordado: 0,
          facturaAcordada: 0,
        }
        acc.tarifa = num(a.tarifa) // la más reciente manda para valorar déficit
        acc.volMes = num(a.volumen_acordado)
        acc.volAcordado += num(a.volumen_acordado) * mesesVig
        acc.facturaAcordada += num(a.volumen_acordado) * num(a.tarifa) * mesesVig
        actividades.set(codigo, acc)
      }

      const lista: ActividadAnalisis[] = []
      for (const acc of actividades.values()) {
        const volumenReal = real.get(acc.codigo) || 0
        const deficit = Math.max(0, acc.volAcordado - volumenReal)
        lista.push({
          actividad: acc.actividad,
          codigo: acc.codigo,
          tarifa: acc.tarifa,
          volumenAcordadoMes: acc.volMes,
          volumenAcordado: Math.round(acc.volAcordado * 10) / 10,
          volumenReal: Math.round(volumenReal * 10) / 10,
          cumplimientoPct: acc.volAcordado > 0 ? Math.round((volumenReal / acc.volAcordado) * 100) : null,
          deficit: Math.round(deficit * 10) / 10,
          aFacturarAdicional: Math.round(deficit * acc.tarifa),
          facturaAcordada: Math.round(acc.facturaAcordada),
          facturaReal: Math.round(volumenReal * acc.tarifa),
        })
      }
      lista.sort((a, b) => b.facturaAcordada - a.facturaAcordada)

      const tonAcordadas = lista.reduce((s, a) => s + a.volumenAcordado, 0)
      const tonReales = lista.reduce((s, a) => s + a.volumenReal, 0)
      const totalFacturaAcordada = lista.reduce((s, a) => s + a.facturaAcordada, 0)
      const totalFacturaReal = lista.reduce((s, a) => s + a.facturaReal, 0)
      const totalAFacturarAdicional = lista.reduce((s, a) => s + a.aFacturarAdicional, 0)
      const costoNomina = Math.round(costoDe.get(id) || 0)
      const tarifaPromedio = tonAcordadas > 0 ? totalFacturaAcordada / tonAcordadas : 0

      proyectos.push({
        idempresa: id,
        proyecto: nombreDe.get(id) || `Empresa ${id}`,
        actividades: lista,
        estructura,
        tonAcordadas: Math.round(tonAcordadas * 10) / 10,
        tonReales: Math.round(tonReales * 10) / 10,
        cumplimientoPct: tonAcordadas > 0 ? Math.round((tonReales / tonAcordadas) * 100) : null,
        totalFacturaAcordada,
        totalFacturaReal,
        totalAFacturarAdicional,
        costoNomina,
        margenReal: totalFacturaReal - costoNomina,
        margenPorTon: tonReales > 0 ? Math.round((totalFacturaReal - costoNomina) / tonReales) : null,
        puntoEquilibrioTon: tarifaPromedio > 0 ? Math.round(costoNomina / tarifaPromedio) : null,
        proyeccionTon: factorProyeccion ? Math.round(tonReales * factorProyeccion * 10) / 10 : null,
        notas,
      })
    }

    return { success: true, data: { desde, hasta, meses, proyectos } }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error calculando el análisis financiero." }
  }
}

// ---------------------------------------------------------------------------
// Edición ligera del acuerdo (reajustes anuales / correcciones)
// ---------------------------------------------------------------------------

export async function guardarAcuerdoVolumen(payload: {
  id?: number
  idempresa: number
  actividad: string
  actividad_codigo: string | null
  auxiliares: number | null
  muelle: string | null
  tarifa: number | null
  volumen_acordado: number | null
  fechainicio: string
  fechafin: string
}): Promise<{ success: boolean; message?: string }> {
  try {
    const sb: any = await getSupabaseAdmin()
    const row = {
      idempresa: payload.idempresa,
      actividad: payload.actividad.trim(),
      actividad_codigo: payload.actividad_codigo,
      auxiliares: payload.auxiliares,
      muelle: payload.muelle,
      tarifa: payload.tarifa,
      volumen_acordado: payload.volumen_acordado,
      fechainicio: payload.fechainicio,
      fechafin: payload.fechafin,
    }
    const { error } = payload.id
      ? await sb.from("acuerdo_volumenes").update(row).eq("id", payload.id)
      : await sb.from("acuerdo_volumenes").insert(row)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar el acuerdo." }
  }
}

export async function getAcuerdosVolumenes(): Promise<{
  success: boolean
  data: Array<{
    id: number
    idempresa: number
    actividad: string
    actividad_codigo: string | null
    auxiliares: number | null
    muelle: string | null
    tarifa: number | null
    volumen_acordado: number | null
    fechainicio: string
    fechafin: string
  }>
  message?: string
}> {
  try {
    const sb: any = await getSupabaseAdmin()
    const { data, error } = await sb
      .from("acuerdo_volumenes")
      .select("*")
      .order("idempresa", { ascending: true })
      .order("fechainicio", { ascending: true })
    if (error) return { success: false, data: [], message: error.message }
    return {
      success: true,
      data: (data || []).map((r: any) => ({
        id: r.id,
        idempresa: Number(r.idempresa),
        actividad: r.actividad,
        actividad_codigo: r.actividad_codigo ?? null,
        auxiliares: r.auxiliares === null ? null : num(r.auxiliares),
        muelle: r.muelle ?? null,
        tarifa: r.tarifa === null ? null : num(r.tarifa),
        volumen_acordado: r.volumen_acordado === null ? null : num(r.volumen_acordado),
        fechainicio: r.fechainicio,
        fechafin: r.fechafin,
      })),
    }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al leer los acuerdos." }
  }
}
