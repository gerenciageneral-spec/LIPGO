"use server"

import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaId } from "@/lib/company-filter"
import { getUserPermissions } from "@/lib/permissions-actions"
import { MODULE_PERMISSION_MAP } from "@/lib/permissions-map"

// Ítem de "atención del día" que la IA prioriza. Datos REALES por empresa.
export interface AtencionRow {
  label: string
  sev: "crit" | "warn" | "info"
  /** Módulo a abrir al tocar la alerta (nombre exacto del módulo). */
  modulo?: string
}

function colombiaDate(): string {
  const now = new Date()
  const t = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }))
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`
}

function colombiaHour(): number {
  const now = new Date()
  return new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" })).getHours()
}

/**
 * Calcula lo que "requiere atención hoy" para la empresa seleccionada (cookie
 * del selector global). Defensivo: cualquier fallo devuelve lista vacía y la
 * tarjeta de IA simplemente no muestra el bloque.
 */
export async function getAtencionDelDia(userId?: string, selectedEmpresaId?: number): Promise<{ success: boolean; items: AtencionRow[] }> {
  try {
    const supabase = await createClient()
    const empresaId = selectedEmpresaId ?? (await getCurrentEmpresaId())
    if (!empresaId) return { success: true, items: [] }

    const items: AtencionRow[] = []
    const today = colombiaDate()

    // 1) Cargues del día sin cerrar (fincargue null) → riesgo de SLA.
    const { count: sinCerrar } = await supabase
      .from("cabeceraoc")
      .select("ordendecargue", { count: "exact", head: true })
      .eq("idempresa", empresaId)
      .eq("fechacargue", today)
      .is("fincargue", null)
    if (sinCerrar && sinCerrar > 0) {
      items.push({
        label: `${sinCerrar} cargue${sinCerrar !== 1 ? "s" : ""} sin cerrar hoy`,
        sev: sinCerrar > 3 ? "crit" : "warn",
        modulo: "Gestión de Ordenes",
      })
    }

    // NOTA: la alerta de "facturas por solicitar" NO se emite aquí (banner global del
    // home). Es una tarea/KPI PROPIA del Coordinador en el módulo Operaciones LIP y
    // vive dentro de ese panel (panel-operacion-lip · "Facturación pendiente por
    // solicitar"). Así LIPbot no la muestra fuera de su módulo.

    // GATE por área: cada tarea pertenece a un módulo/KPI de un área (p. ej. las
    // facturas por solicitar son del Coordinador de LIP). Se muestra SOLO a quien
    // tiene el permiso de ese módulo, para que LIPbot no exhiba tareas ajenas al
    // rol. Si no hay registro de permisos (p. ej. gerencia/admin), no se oculta.
    let permisos: any = null
    try {
      permisos = await getUserPermissions(userId)
    } catch {
      permisos = null
    }
    const permitido = (it: AtencionRow): boolean => {
      if (!it.modulo) return true
      const key = MODULE_PERMISSION_MAP[it.modulo]
      if (!key) return true
      if (!permisos) return true
      return !!permisos[key]
    }
    const visibles = items.filter(permitido)

    // "Vida propia" de la IA: si hay pendientes y ya es tarde (>= 3pm Colombia),
    // escala una alerta de CUMPLIMIENTO al frente — no se están atendiendo a
    // tiempo. Así el asistente insiste en el cierre del día.
    if (visibles.length > 0 && colombiaHour() >= 15) {
      visibles.unshift({
        label: "⚠ Cumplimiento: atiende los pendientes antes del cierre del día",
        sev: "crit",
      })
    }

    return { success: true, items: visibles }
  } catch (e) {
    console.error("[atencion] error:", e)
    return { success: false, items: [] }
  }
}
