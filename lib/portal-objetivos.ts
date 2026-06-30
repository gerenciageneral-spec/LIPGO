// Tipos del aporte individual del trabajador a los objetivos del SIG (módulo
// NORMAL, sin "use server"). La vista del portal es INDIVIDUAL: cada trabajador
// entra con su cédula y solo ve SU información.

export type EstadoTarjeta = "ok" | "warn" | "bad" | "info"

export interface AporteTarjeta {
  area: string // SST | Operación | Formación | Productividad | Desempeño
  label: string
  valor: number
  meta: number | null
  unidad: string // % | ton | # | pts
  sentido: "mayor_mejor" | "menor_mejor"
  estado: EstadoTarjeta
  mensaje: string // "Tu asistencia aporta al objetivo de SST; este mes…"
  consejo?: string | null // qué hacer para mejorar (cuando no está en meta)
  impactoDesempeno?: string | null // a qué dimensión de su evaluación impacta
}

export interface AporteEvento {
  fecha: string | null
  tipo: string // incapacidad | novedad | sla_fuera | curso_ok | curso_pend
  texto: string
  signo: "ok" | "bad" | "info"
}

export interface MetaColaborador {
  id: number
  area: string | null
  indicador: string
  meta: number | null
  unidad: string | null
  sentido: string | null
  valor_actual: number | null
  estado: string | null
  periodo: string | null
}

export interface NivelCompromiso {
  nombre: string // Ejemplar | En camino | A mejorar
  mensaje: string // frase inspiradora
  emoji: string
  color: EstadoTarjeta
}

export interface DesempenoResumen {
  puntaje: number
  riesgo: number
  decision: string | null
  fecha: string | null
}

export interface MiAporte {
  periodoLabel: string
  puntajeCompromiso: number // % global de cumplimiento de sus metas
  nivel: NivelCompromiso
  tarjetas: AporteTarjeta[]
  timeline: AporteEvento[]
  metas: MetaColaborador[]
  desempeno: DesempenoResumen | null // su última evaluación de desempeño
  accionesMejora: string[] // qué hacer para mejorar (consolidado, lo que está en rojo/amarillo)
}
