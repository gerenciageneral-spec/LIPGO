"use server"

// Server actions del cuadro de mando de nómina: lee/guarda los parámetros legales
// por año en parametros_legales_anio (misma tabla que usa SST/ausentismos; ver
// scripts/extend_parametros_nomina.sql). Usa service role, patrón de tarifas-actions.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { PARAMS_NOMINA_DEFAULTS, type ParametrosNomina } from "@/lib/parametros-nomina"

// Mapea la fila cruda de la tabla a ParametrosNomina, aplicando defaults si una
// columna viniera nula (p.ej. filas viejas antes de correr la migración).
function rowToParametros(anio: number, r: any | null): ParametrosNomina {
  return {
    anio,
    smlv: Number(r?.smlv) || 0,
    auxilio: Number(r?.auxilio_transporte) || 0,
    diasCalendario: r?.dias_calendario != null ? Number(r.dias_calendario) : PARAMS_NOMINA_DEFAULTS.diasCalendario,
    jornadaHoras: r?.jornada_horas != null ? Number(r.jornada_horas) : PARAMS_NOMINA_DEFAULTS.jornadaHoras,
    pctHed: r?.pct_hed != null ? Number(r.pct_hed) : PARAMS_NOMINA_DEFAULTS.pctHed,
    pctHen: r?.pct_hen != null ? Number(r.pct_hen) : PARAMS_NOMINA_DEFAULTS.pctHen,
    pctHn: r?.pct_hn != null ? Number(r.pct_hn) : PARAMS_NOMINA_DEFAULTS.pctHn,
    pctRecargoDominical:
      r?.pct_recargo_dominical != null ? Number(r.pct_recargo_dominical) : PARAMS_NOMINA_DEFAULTS.pctRecargoDominical,
    pctHedf: r?.pct_hedf != null ? Number(r.pct_hedf) : PARAMS_NOMINA_DEFAULTS.pctHedf,
    pctHef: r?.pct_hef != null ? Number(r.pct_hef) : PARAMS_NOMINA_DEFAULTS.pctHef,
    pctRecargoNocturnoDominical:
      r?.pct_recargo_nocturno_dominical != null
        ? Number(r.pct_recargo_nocturno_dominical)
        : PARAMS_NOMINA_DEFAULTS.pctRecargoNocturnoDominical,
  }
}

// Lee los parámetros del año. Si no existe la fila, devuelve defaults (con SMLV/aux
// en 0 para que el usuario los cargue). success=true igual, con `existe` para la UI.
export async function getParametrosNomina(
  anio: number,
): Promise<{ success: boolean; data?: ParametrosNomina; existe?: boolean; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { data, error } = await admin
      .from("parametros_legales_anio")
      .select("*")
      .eq("anio", anio)
      .maybeSingle()
    if (error) return { success: false, message: error.message }
    return { success: true, data: rowToParametros(anio, data), existe: !!data }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al leer los parámetros." }
  }
}

// Guarda (upsert por anio) SOLO las columnas del cuadro de mando. No toca
// dias_cargo_empleador / pct_pago_incapacidad (los usa SST/ausentismos).
export async function guardarParametrosNomina(
  p: ParametrosNomina,
): Promise<{ success: boolean; message?: string }> {
  if (!p?.anio) return { success: false, message: "Año inválido." }
  try {
    const admin: any = await getSupabaseAdmin()
    const payload = {
      anio: p.anio,
      smlv: p.smlv,
      auxilio_transporte: p.auxilio,
      dias_calendario: p.diasCalendario,
      jornada_horas: p.jornadaHoras,
      pct_hed: p.pctHed,
      pct_hen: p.pctHen,
      pct_hn: p.pctHn,
      pct_recargo_dominical: p.pctRecargoDominical,
      pct_hedf: p.pctHedf,
      pct_hef: p.pctHef,
      pct_recargo_nocturno_dominical: p.pctRecargoNocturnoDominical,
      actualizado_at: new Date().toISOString(),
    }
    const { error } = await admin
      .from("parametros_legales_anio")
      .upsert(payload, { onConflict: "anio" })
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar los parámetros." }
  }
}
