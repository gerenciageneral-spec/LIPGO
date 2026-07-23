// Utilidades puras de las tiras de KPIs por área (sin "use server": importable desde
// server actions y componentes cliente).

export type AreaKpiVariant = "primary" | "success" | "warning" | "danger"

export interface AreaKpiItem {
  label: string
  value: string
  subtext?: string
  variant: AreaKpiVariant
  icon: string
}

// Título de la sección por grupo (define también qué grupos tienen tira). Ahora
// las tiras muestran INDICADORES del BSC (valor + meta + semáforo): el módulo
// madre sus indicadores gerenciales, cada submódulo el indicador de su área que
// alimenta. Los grupos sin indicadores (mrp, configuración) no aparecen → sin tira.
export const AREA_KPI_TITULOS: Record<string, string> = {
  integral: "Indicadores gerenciales",
  pedidos: "Indicadores — Pedidos",
  despachos: "Indicadores — Recepción y Despacho",
  inventarios: "Indicadores — Almacenamiento",
  produccion: "Indicadores — Producción",
  lip: "Indicadores — Operación LIP",
  financiera: "Indicadores — Gestión Financiera",
  rrhh: "Indicadores — Gestión Humana",
  certificaciones_lip: "Indicadores — SIG / Certificaciones",
  sst: "Indicadores — SST",
}

export function tituloAreaKpis(groupKey: string): string {
  return AREA_KPI_TITULOS[groupKey] || ""
}
