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

// Título de la sección por grupo (define también qué grupos tienen tira).
export const AREA_KPI_TITULOS: Record<string, string> = {
  inventarios: "Almacenamiento — a revisar",
  lip: "Operación LIP — pendientes",
  rrhh: "Gestión Humana — pendientes",
  sst: "SST — a revisar",
  financiera: "Gestión Financiera — pendientes",
  certificaciones_lip: "SIG — a revisar",
}

export function tituloAreaKpis(groupKey: string): string {
  return AREA_KPI_TITULOS[groupKey] || ""
}
