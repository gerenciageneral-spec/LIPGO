"use client"

import { groups } from "@/lib/dashboard-data"
import { PedidosKpiStrip } from "@/components/orders/pedidos-kpi-strip"
import { DespachoKpiStrip } from "@/components/orders/despacho-kpi-strip"
import { VehiculosNoProcesadosCard } from "@/components/vehiculos-no-procesados-card"
import { AreaKpiStrip } from "@/components/area-kpi-strip"

// Encabezado de KPIs del MÓDULO: se muestra en CUALQUIER submódulo del módulo, para
// que el usuario vea siempre las tareas pendientes / indicadores que ameritan revisión
// del área en la que está trabajando. Detecta el grupo (módulo principal) al que
// pertenece el submódulo actual y pinta sus KPIs (los mismos de la portada del grupo).
function groupKeyOf(moduleName: string | null): string | null {
  if (!moduleName) return null
  for (const g of groups) {
    if (g.modules?.some((m) => m.name === moduleName)) return g.key
    for (const sg of (g as any).subgroups ?? []) {
      if (sg.modules?.some((m: any) => m.name === moduleName)) return g.key
    }
  }
  return null
}

export function ModuleKpiHeader({ selectedModule }: { selectedModule: string | null }) {
  const gk = groupKeyOf(selectedModule)

  if (gk === "pedidos") {
    return (
      <div className="mb-5 space-y-1">
        <div className="text-sm font-semibold text-foreground">Cumplimiento de entregas</div>
        <PedidosKpiStrip />
      </div>
    )
  }
  if (gk === "despachos") {
    return (
      <div className="mb-5 space-y-3">
        <div className="text-sm font-semibold text-foreground">Operación y despacho del día</div>
        <DespachoKpiStrip />
        <VehiculosNoProcesadosCard />
      </div>
    )
  }
  // Resto de módulos: tira rápida. Se pasa el submódulo actual para que muestre
  // SUS datos (si tiene tira propia); si no, cae a la tira general del grupo.
  if (gk) return <AreaKpiStrip groupKey={gk} moduleName={selectedModule} />
  return null
}
