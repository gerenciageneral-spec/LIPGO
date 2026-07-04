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

// Preguntas SUGERIDAS propias de cada área (grupo del menú). Cada una está
// alineada a datos que LIPbot puede consultar/gestionar EN ESE módulo, para no
// mostrar sugerencias fuera de contexto (ej. no ofrecer "pedidos" en RRHH).
export const AREA_SUGERENCIAS: Record<string, string[]> = {
  integral: ["¿Cómo va el SLA global hoy?", "¿Cumplimos la meta de toneladas?", "¿Qué requiere mi atención hoy?"],
  pedidos: ["¿Cuántos pedidos hay este mes?", "¿Cuánto suman los pedidos del mes?", "¿Qué pedidos están pendientes?"],
  despachos: ["¿Cuántas toneladas cargué hoy?", "¿Cuántos cargues siguen sin cerrar?", "¿Cuántos vehículos se atendieron hoy?"],
  inventarios: ["¿Qué stock hay disponible?", "¿Cómo va la exactitud de inventario?", "¿Cuántos registros de inventario hay?"],
  produccion: ["¿Cuántas toneladas se produjeron este mes?", "¿Cómo va la meta de producción?"],
  lip: ["¿Cómo va el SLA de tiempos?", "¿Cuántos cargues sin cerrar hoy?", "¿Cuántas toneladas cargué este mes?"],
  financiera: ["¿Qué facturas hay por solicitar?", "¿Cuánto suman los gastos del mes?", "Registrar un gasto"],
  rrhh: ["¿Cuántos colaboradores activos hay?", "Registrar una novedad a un trabajador", "¿Cómo va el ausentismo del mes?"],
  certificaciones_lip: ["¿Cómo va la satisfacción del cliente?", "¿Cómo va la satisfacción del conductor?"],
  configuracion: ["Crear un cliente nuevo", "Registrar un producto", "Editar un destino"],
}

// Sugerencias genéricas (Inicio / sin grupo específico).
const SUGERENCIAS_GENERICAS = [
  "¿Qué requiere mi atención hoy?",
  "¿Cuántas toneladas cargué este mes?",
  "¿Cuántos pedidos hay este mes?",
]

/** Sugerencias para un grupo del menú; si no hay mapeo, usa las genéricas. */
export function sugerenciasDe(groupKey?: string): string[] {
  if (groupKey && AREA_SUGERENCIAS[groupKey]) return AREA_SUGERENCIAS[groupKey]
  return SUGERENCIAS_GENERICAS
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
