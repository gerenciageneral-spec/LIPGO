"use server"

/**
 * Server actions del módulo "Bonos" (Compensación).
 *
 * Registra, por DÍA y por PERSONA, bonos OPERATIVOS y ADMINISTRATIVOS con su
 * concepto, y los amarra a la liquidación: al APROBARSE entran a
 * `pagonomina.bonif_no_prestacional` y salen en el ARCHIVO PLANO con su propia
 * novedad de Siigo (43 / 50 / 66).
 *
 * Reglas de negocio (confirmadas con el negocio):
 *  - NO PRESTACIONAL: no cotiza a seguridad social (no entra al IBC de la
 *    PILA) ni sirve de base para cesantías/prima/vacaciones. Por eso NO se
 *    suma a `pagonomina.total_liquidado_dia` — ver el comentario del CTE
 *    `bonos_dia` en scripts/pagonomina_reemplazo.sql.
 *  - REQUIERE APROBACIÓN: nace 'pendiente'; solo los 'aprobado' impactan
 *    nómina y archivo plano.
 *  - `tipo` (Operativo/Administrativo) es SOLO clasificación y reporte.
 *
 * Escribe en `bonos_nomina` (scripts/create_bonos_nomina.sql).
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUsuarioForInsert } from "@/lib/user-context"

/**
 * Novedades de Siigo habilitadas para el bono. El `nombre` es el string EXACTO
 * que se emite en `archivoplano.nombrenovedad`; se guarda en la fila al
 * registrar, para que un cambio futuro de nomenclatura no reescriba el
 * histórico ya enviado a Siigo.
 */
export const NOVEDADES_BONO = [
  { codigo: "43", nombre: "43-Bonificaciones ocasionales" },
  { codigo: "50", nombre: "50-Bonificación No Prestacional" },
  { codigo: "66", nombre: "66-Aux. Por Movilidad" },
] as const

export const TIPOS_BONO = ["Operativo", "Administrativo"] as const
export type TipoBono = (typeof TIPOS_BONO)[number]
export type EstadoBono = "pendiente" | "aprobado" | "rechazado"

const num = (v: any) => Number(v || 0)

export interface ColaboradorBono {
  nombre: string
  identificacion: string
  idempresa: number | null
  estado: string
}

export interface BonoRow {
  id: number
  fecha: string
  identificacion: string
  nombre: string
  idempresa: number
  tipo: string
  concepto: string
  novedadSiigo: string
  valor: number
  estado: EstadoBono
  creadoPor: string | null
  creado: string | null
  aprobadoPor: string | null
  aprobadoEn: string | null
  motivoRechazo: string | null
}

export interface BonosResumen {
  pendientes: number
  valorPendiente: number
  aprobados: number
  valorAprobado: number
  rechazados: number
  personas: number
}

/** Colaboradores del Head Count para el selector (mismo criterio que Revisión de nómina). */
export async function getColaboradoresBonos(): Promise<{
  success: boolean
  data: ColaboradorBono[]
  message?: string
}> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { data, error } = await admin
      .from("headcount")
      .select("nombre, identificacion, idempresa, estado")
      .order("estado", { ascending: true })
      .order("nombre", { ascending: true })
    if (error) return { success: false, data: [], message: error.message }

    const vistos = new Set<string>()
    const out: ColaboradorBono[] = []
    for (const r of data || []) {
      const nombre = String(r.nombre || "").trim()
      const identificacion = String(r.identificacion || "").trim()
      if (!nombre || /prueba/i.test(nombre)) continue
      if (vistos.has(nombre)) continue
      vistos.add(nombre)
      out.push({
        nombre,
        identificacion,
        idempresa: r.idempresa != null ? Number(r.idempresa) : null,
        estado: String(r.estado || "").trim() || "—",
      })
    }
    return { success: true, data: out }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al leer colaboradores." }
  }
}

export interface RegistrarBonoInput {
  nombre: string
  fecha: string
  tipo: TipoBono
  concepto: string
  novedadSiigo: string
  valor: number
}

/** Registra un bono en estado 'pendiente'. No impacta nómina hasta aprobarse. */
export async function registrarBono(
  input: RegistrarBonoInput,
): Promise<{ success: boolean; message?: string }> {
  try {
    const nombre = String(input.nombre || "").trim()
    const concepto = String(input.concepto || "").trim()
    const valor = num(input.valor)

    if (!nombre) return { success: false, message: "Selecciona un colaborador." }
    if (!input.fecha) return { success: false, message: "La fecha del bono es requerida." }
    if (!concepto) return { success: false, message: "El concepto del bono es requerido." }
    if (!(valor > 0)) return { success: false, message: "El valor debe ser mayor a 0." }
    if (!TIPOS_BONO.includes(input.tipo)) return { success: false, message: "Tipo de bono inválido." }
    const novedad = NOVEDADES_BONO.find((n) => n.nombre === input.novedadSiigo)
    if (!novedad) return { success: false, message: "Selecciona la novedad de Siigo." }

    const admin: any = await getSupabaseAdmin()

    // La cédula y la empresa se toman del Head Count (no del cliente): la
    // identificación es la llave con la que el archivo plano paga, y el nombre
    // es la llave con la que pagonomina cruza. Si el colaborador no está en
    // Head Count no se puede registrar el bono (no habría a quién pagarle).
    const { data: hc } = await admin
      .from("headcount")
      .select("nombre, identificacion, idempresa")
      .eq("nombre", nombre)
      .limit(1)
      .maybeSingle()
    const identificacion = String(hc?.identificacion || "").trim()
    if (!identificacion) {
      return {
        success: false,
        message: `${nombre} no tiene identificación en Head Count; sin cédula el bono no puede salir en el archivo plano.`,
      }
    }

    const usuario = await getCurrentUsuarioForInsert()
    const { error } = await admin.from("bonos_nomina").insert({
      fecha: input.fecha,
      identificacion,
      nombre,
      idempresa: hc?.idempresa != null ? Number(hc.idempresa) : 0,
      tipo: input.tipo,
      concepto,
      novedad_siigo: novedad.nombre,
      valor,
      estado: "pendiente",
      creado_por: usuario,
    })
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al registrar el bono." }
  }
}

/** Aprueba un bono: desde aquí YA impacta pagonomina y el archivo plano. */
export async function aprobarBono(id: number): Promise<{ success: boolean; message?: string }> {
  try {
    if (!id) return { success: false, message: "Bono inválido." }
    const admin: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert()
    const { error } = await admin
      .from("bonos_nomina")
      .update({
        estado: "aprobado",
        aprobado_por: usuario,
        aprobado_en: new Date().toISOString(),
        motivo_rechazo: null,
      })
      .eq("id", id)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al aprobar el bono." }
  }
}

/** Rechaza un bono (no impacta nómina). El motivo queda registrado. */
export async function rechazarBono(
  id: number,
  motivo: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    if (!id) return { success: false, message: "Bono inválido." }
    const admin: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert()
    const { error } = await admin
      .from("bonos_nomina")
      .update({
        estado: "rechazado",
        aprobado_por: usuario,
        aprobado_en: new Date().toISOString(),
        motivo_rechazo: String(motivo || "").trim() || null,
      })
      .eq("id", id)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al rechazar el bono." }
  }
}

/** Elimina un bono. Solo se permite si sigue PENDIENTE (un aprobado ya se pagó). */
export async function eliminarBono(id: number): Promise<{ success: boolean; message?: string }> {
  try {
    if (!id) return { success: false, message: "Bono inválido." }
    const admin: any = await getSupabaseAdmin()
    const { data: actual } = await admin.from("bonos_nomina").select("estado").eq("id", id).maybeSingle()
    if (actual?.estado === "aprobado") {
      return {
        success: false,
        message: "No se puede eliminar un bono ya aprobado (ya impacta la nómina). Recházalo si fue un error.",
      }
    }
    const { error } = await admin.from("bonos_nomina").delete().eq("id", id)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al eliminar el bono." }
  }
}

export interface FiltrosBonos {
  desde: string
  hasta: string
  estado?: EstadoBono | "todos"
  tipo?: TipoBono | "todos"
  empresa?: number // 0 = todas
}

/** Lista los bonos del rango con sus filtros, más el resumen del periodo. */
export async function getBonos(
  filtros: FiltrosBonos,
): Promise<{ success: boolean; data: BonoRow[]; resumen?: BonosResumen; message?: string }> {
  try {
    const { desde, hasta } = filtros
    if (!desde || !hasta) return { success: false, data: [], message: "El rango de fechas es requerido." }
    if (desde > hasta) return { success: false, data: [], message: "La fecha 'desde' no puede ser mayor que 'hasta'." }

    const admin: any = await getSupabaseAdmin()
    const rows: BonoRow[] = []
    for (let off = 0; ; off += 1000) {
      let q = admin
        .from("bonos_nomina")
        .select(
          "id, fecha, identificacion, nombre, idempresa, tipo, concepto, novedad_siigo, valor, estado, creado_por, creado, aprobado_por, aprobado_en, motivo_rechazo",
        )
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false })
        .range(off, off + 999)
      if (filtros.estado && filtros.estado !== "todos") q = q.eq("estado", filtros.estado)
      if (filtros.tipo && filtros.tipo !== "todos") q = q.eq("tipo", filtros.tipo)
      if (filtros.empresa) q = q.eq("idempresa", filtros.empresa)

      const { data, error } = await q
      if (error) return { success: false, data: [], message: error.message }
      if (!data || data.length === 0) break
      for (const r of data) {
        rows.push({
          id: Number(r.id),
          fecha: String(r.fecha).slice(0, 10),
          identificacion: String(r.identificacion || ""),
          nombre: String(r.nombre || ""),
          idempresa: Number(r.idempresa) || 0,
          tipo: String(r.tipo || ""),
          concepto: String(r.concepto || ""),
          novedadSiigo: String(r.novedad_siigo || ""),
          valor: num(r.valor),
          estado: (String(r.estado || "pendiente") as EstadoBono),
          creadoPor: r.creado_por || null,
          creado: r.creado || null,
          aprobadoPor: r.aprobado_por || null,
          aprobadoEn: r.aprobado_en || null,
          motivoRechazo: r.motivo_rechazo || null,
        })
      }
      if (data.length < 1000) break
    }

    const personas = new Set(rows.map((r) => r.identificacion))
    const resumen: BonosResumen = {
      pendientes: rows.filter((r) => r.estado === "pendiente").length,
      valorPendiente: rows.filter((r) => r.estado === "pendiente").reduce((a, r) => a + r.valor, 0),
      aprobados: rows.filter((r) => r.estado === "aprobado").length,
      valorAprobado: rows.filter((r) => r.estado === "aprobado").reduce((a, r) => a + r.valor, 0),
      rechazados: rows.filter((r) => r.estado === "rechazado").length,
      personas: personas.size,
    }
    return { success: true, data: rows, resumen }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al listar los bonos." }
  }
}
