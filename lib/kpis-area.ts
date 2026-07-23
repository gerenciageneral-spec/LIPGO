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
  // Metas SINCRONIZADAS con el BSC (sig_indicadores, LIP 100) — clase mundial 3PL.
  // Fuente oficial de la meta = sig_indicadores; estas tiras deben mostrar lo mismo.
  sla_tiempos: { nombre: "SLA de tiempos", fmt: "pct", meta: 98, higherBetter: true },
  sla_global: { nombre: "Nivel de servicio", fmt: "pct", meta: 98, higherBetter: true },
  desp_cumplimiento: { nombre: "Cumplim. de cargues", fmt: "pct", meta: 99, higherBetter: true },
  desp_ciclo_cerrado: { nombre: "Ciclo cerrado", fmt: "pct", meta: 98, higherBetter: true },
  desp_meta_ton: { nombre: "Cumpl. meta toneladas", fmt: "pct", meta: 100, higherBetter: true },
  desp_ordenes: { nombre: "Órdenes", fmt: "num" },
  desp_toneladas: { nombre: "Toneladas", fmt: "ton" },
  vehiculos_atendidos: { nombre: "Vehículos atendidos", fmt: "num" },
  lip_tiempo_cargue: { nombre: "Tiempo de cargue", fmt: "min", higherBetter: false },
  lip_evidencia: { nombre: "Evidencia de cargue", fmt: "pct", meta: 98, higherBetter: true },
  lip_facturacion: { nombre: "Facturación gestionada", fmt: "pct", meta: 98, higherBetter: true },
  inv_exactitud: { nombre: "Exactitud de inventario", fmt: "pct", meta: 99.5, higherBetter: true },
  inv_rechazos: { nombre: "Rechazos", fmt: "num", higherBetter: false },
  gh_activos: { nombre: "Colaboradores activos", fmt: "num" },
  gh_ausentismo: { nombre: "Ausentismo médico", fmt: "pct", meta: 3, higherBetter: false },
  gh_cobertura: { nombre: "Cobertura de planta", fmt: "pct", meta: 100, higherBetter: true },
  gh_recobro: { nombre: "Recobro de incapacidades", fmt: "pct", meta: 95, higherBetter: true },
  sat_conductor: { nombre: "Satisfacción conductor", fmt: "pct", meta: 90, higherBetter: true },
  sat_cliente: { nombre: "Satisfacción cliente", fmt: "pct", meta: 90, higherBetter: true },
  // SST (BSC del área): SG-SST 0312, accidentalidad y IPEVR.
  // 0312 se mantiene en 86% (umbral "aceptable" Res. 0312 Art. 28) — fuente oficial
  // sig_indicadores (IND-SST-0312). Si se sube a meta interna, cambiar en AMBOS lados.
  sgsst_0312: { nombre: "Cumplimiento SG-SST 0312", fmt: "pct", meta: 86, higherBetter: true },
  sst_at_count: { nombre: "Accidentes de trabajo", fmt: "num", meta: 0, higherBetter: false },
  sst_at_dias: { nombre: "Días perdidos por AT", fmt: "num", meta: 0, higherBetter: false },
  sst_ipevr_cumpl: { nombre: "Intervención de peligros (IPEVR)", fmt: "pct", meta: 95, higherBetter: true },
  sst_frecuencia: { nombre: "Frecuencia de accidentalidad", fmt: "num", meta: 9, higherBetter: false },
  // Indicadores adicionales (misma fuente en vivo, metas sincronizadas con el BSC).
  inv_eri: { nombre: "Exactitud inventario físico (ERI)", fmt: "pct", meta: 99.5, higherBetter: true },
  gh_formacion: { nombre: "Formación aprobada", fmt: "pct", meta: 95, higherBetter: true },
  nc_cerradas: { nombre: "NC cerradas a tiempo", fmt: "pct", meta: 95, higherBetter: true },
  legal_cumplimiento: { nombre: "Cumplimiento legal", fmt: "pct", meta: 100, higherBetter: true },
  sig_implementacion: { nombre: "Implementación del SIG", fmt: "pct", meta: 100, higherBetter: true },
}

// Qué indicadores muestra cada grupo del menú (por su `key`). Curados a los MÁS
// IMPORTANTES de cada área según el análisis de clase mundial (3PL): resultado de
// servicio + eficiencia + calidad. Todas las metas salen de KPI_DEFS (sincronizadas
// con el BSC/sig_indicadores). Máx ~5 por área para que la tira sea legible.
export const AREA_KPIS: Record<string, string[]> = {
  // Gerencia / vista integral: los resultados estratégicos de LIP.
  integral: ["sla_global", "sat_cliente", "desp_cumplimiento", "desp_meta_ton", "sgsst_0312"],
  pedidos: ["desp_ordenes", "desp_toneladas", "desp_cumplimiento"],
  // Operaciones (Cargue/Descargue): servicio, cumplimiento, calidad, volumen.
  despachos: ["desp_cumplimiento", "sla_tiempos", "lip_evidencia", "desp_meta_ton", "sat_conductor"],
  // Almacenamiento e Inventarios: exactitud world-class.
  inventarios: ["inv_eri", "inv_exactitud", "inv_rechazos"],
  produccion: ["desp_meta_ton", "desp_toneladas"],
  // Operación LIP (SLA de servicio de outsourcing).
  lip: ["sla_tiempos", "desp_cumplimiento", "lip_evidencia", "lip_tiempo_cargue", "lip_facturacion"],
  financiera: ["lip_facturacion"],
  // Gestión Humana: rotación/ausentismo/cobertura/recobro/formación.
  rrhh: ["gh_ausentismo", "gh_cobertura", "gh_recobro", "gh_formacion"],
  // SIG / Certificaciones (transversal, ISO 9001·14001·45001).
  certificaciones_lip: ["sgsst_0312", "sig_implementacion", "nc_cerradas", "legal_cumplimiento", "sat_cliente"],
  // SST: cumplimiento SG-SST + accidentalidad + intervención de peligros.
  sst: ["sgsst_0312", "sst_ipevr_cumpl", "sst_frecuencia", "sst_at_count", "sst_at_dias"],
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
  sst: ["¿Cómo va el cumplimiento del SG-SST 0312?", "¿Cuántos accidentes de trabajo hay?", "¿Cómo va la intervención de peligros (IPEVR)?"],
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
