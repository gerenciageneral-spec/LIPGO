// Mapeo ÁREA (grupo del menú) → indicadores del BSC que le corresponden, y
// la definición de presentación de cada indicador (nombre, formato, meta).
// Las CLAVES coinciden con las que produce `getIndicadoresValores` (sig-actions).
// Es config pura (client-safe): NO consulta datos.

export interface KpiDef {
  nombre: string
  fmt: "pct" | "num" | "ton" | "min"
  meta?: number
  /** true = más alto es mejor (default); false = más bajo es mejor. */
  higherBetter?: boolean
}

export const KPI_DEFS: Record<string, KpiDef> = {
  sla_tiempos: { nombre: "SLA de tiempos", fmt: "pct", meta: 90, higherBetter: true },
  sla_global: { nombre: "Nivel de servicio", fmt: "pct", meta: 90, higherBetter: true },
  desp_cumplimiento: { nombre: "Cumplim. de cargues", fmt: "pct", meta: 98, higherBetter: true },
  desp_ciclo_cerrado: { nombre: "Ciclo cerrado", fmt: "pct", meta: 100, higherBetter: true },
  desp_meta_ton: { nombre: "Cumpl. meta toneladas", fmt: "pct", meta: 100, higherBetter: true },
  desp_ordenes: { nombre: "Órdenes", fmt: "num" },
  desp_toneladas: { nombre: "Toneladas", fmt: "ton" },
  vehiculos_atendidos: { nombre: "Vehículos atendidos", fmt: "num" },
  lip_tiempo_cargue: { nombre: "Tiempo de cargue", fmt: "min", higherBetter: false },
  lip_evidencia: { nombre: "Evidencia de cargue", fmt: "pct", meta: 90, higherBetter: true },
  lip_facturacion: { nombre: "Facturación gestionada", fmt: "pct", meta: 95, higherBetter: true },
  inv_exactitud: { nombre: "Exactitud de inventario", fmt: "pct", meta: 98, higherBetter: true },
  inv_rechazos: { nombre: "Rechazos", fmt: "num", higherBetter: false },
  gh_activos: { nombre: "Colaboradores activos", fmt: "num" },
  gh_ausentismo: { nombre: "Ausentismo médico", fmt: "pct", meta: 5, higherBetter: false },
  gh_cobertura: { nombre: "Cobertura de planta", fmt: "pct", meta: 100, higherBetter: true },
  gh_recobro: { nombre: "Recobro de incapacidades", fmt: "pct", meta: 90, higherBetter: true },
  sat_conductor: { nombre: "Satisfacción conductor", fmt: "pct", meta: 85, higherBetter: true },
  sat_cliente: { nombre: "Satisfacción cliente", fmt: "pct", meta: 85, higherBetter: true },
}

// Qué indicadores muestra cada grupo del menú (por su `key`).
export const AREA_KPIS: Record<string, string[]> = {
  integral: ["sla_global", "desp_meta_ton", "desp_cumplimiento"],
  pedidos: ["desp_ordenes", "desp_toneladas"],
  despachos: ["sla_tiempos", "desp_cumplimiento", "desp_meta_ton", "vehiculos_atendidos"],
  inventarios: ["inv_exactitud", "inv_rechazos", "desp_toneladas"],
  produccion: ["desp_meta_ton", "desp_toneladas"],
  lip: ["sla_tiempos", "sat_conductor", "desp_cumplimiento", "lip_tiempo_cargue"],
  financiera: ["lip_facturacion"],
  rrhh: ["gh_activos", "gh_ausentismo", "gh_cobertura", "gh_recobro"],
  certificaciones_lip: ["sla_global", "sat_cliente", "sat_conductor"],
  // mrp / configuracion: sin indicadores de área en el BSC → no muestran KPIs.
}

export function formatKpi(def: KpiDef, valor: number): string {
  switch (def.fmt) {
    case "pct":
      return `${valor}%`
    case "ton":
      return `${valor} t`
    case "min":
      return `${valor} min`
    default:
      return `${valor}`
  }
}

export type KpiSev = "good" | "warn" | "crit" | "none"

export function kpiSev(def: KpiDef, valor: number): KpiSev {
  if (def.meta == null) return "none"
  const higher = def.higherBetter !== false
  if (higher) {
    if (valor >= def.meta) return "good"
    if (valor >= def.meta * 0.9) return "warn"
    return "crit"
  }
  // menor es mejor (ausentismo, tiempo de cargue, rechazos)
  if (valor <= def.meta) return "good"
  if (valor <= def.meta * 1.2) return "warn"
  return "crit"
}
