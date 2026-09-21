// Tipos de la programación por quincena.
//
// Van aparte del archivo de acciones porque ese es "use server" y esos archivos
// solo pueden exportar funciones async.

import type { HorarioActividad } from "@/lib/horarios-actividad-utils"
export type { HorarioActividad } from "@/lib/horarios-actividad-utils"

/** Día de la quincena, con su contexto de calendario. */
export interface DiaQuincena {
  fecha: string
  diaMes: number
  /** "lu", "ma", ... */
  diaSemana: string
  esDomingo: boolean
  esFestivo: boolean
}

/** Lo que tiene una persona asignado un día. */
export interface CeldaAsignacion {
  /** id de la fila de registroasistencia, para poder borrarla. */
  id: number | null
  puesto: string | null
  horaEntrada: string | null
  horaSalida: string | null
  /** Texto de la novedad. Si viene, la persona no trabaja ese día. */
  novedad: string | null
  /** Ya marcó en portería: la fila refleja algo que ocurrió. */
  marco: boolean
}

/** Una fila de la grilla: una persona con sus días. */
export interface FilaPersona {
  identificacion: string
  nombre: string
  cargo: string | null
  equipoId: number | null
  equipoNombre: string | null
  /** fecha ISO -> asignación */
  dias: Record<string, CeldaAsignacion>
  /** Horas programadas en la quincena, sumando los turnos reconocidos. */
  horasQuincena: number
  /** Días con turno asignado. */
  diasConTurno: number
}

export interface EquipoResumen {
  id: number
  nombre: string
  area: string | null
  color: string | null
  patronId: number | null
  patronNombre: string | null
  integrantes: number
  horasSemana: number | null
}

export interface PatronResumen {
  id: number
  nombre: string
  descripcion: string | null
  secuencia: string[]
  horasSemana: number | null
}

/** Una celda de la vista de Cobertura: requerido vs asignado. */
export interface CeldaCobertura {
  fecha: string
  requeridos: number
  asignados: number
  /** cubierto | parcial | deficit | sin_demanda */
  estado: "cubierto" | "parcial" | "deficit" | "sin_demanda"
}

/** Una fila de Cobertura: un puesto con un horario real de entrada, a lo largo de la quincena. */
export interface FilaCobertura {
  puesto: string
  /** Hora de entrada real ("HH:MM") -- ya no un código de turno fijo. */
  horaInicio: string
  /** Demanda base declarada (la que aplica todos los días). */
  requeridosBase: number
  dias: CeldaCobertura[]
}

export interface ProgramacionQuincenaData {
  quincena: { anio: number; mes: number; numero: 1 | 2; desde: string; hasta: string; etiqueta: string }
  dias: DiaQuincena[]
  /** Horarios reales usados esta quincena, agrupados por puesto -- reemplaza al catálogo fijo de turnos. */
  horariosReales: HorarioActividad[]
  personas: FilaPersona[]
  equipos: EquipoResumen[]
  patrones: PatronResumen[]
  cobertura: FilaCobertura[]
  /**
   * Puestos sobre los que se puede declarar demanda.
   *
   * Salen de `tarifasturnos` --el MISMO catalogo que usa la programacion
   * diaria-- para que lo que se exige coincida con lo que se puede programar.
   * Si se ofreciera una lista propia, se podria pedir gente para un puesto que
   * nadie puede asignar.
   */
  puestos: string[]
  /** Totales de la quincena, para la barra de resumen. */
  totales: {
    personas: number
    diasProgramados: number
    horasProgramadas: number
    /** Informativo: el sistema todavía no liquida horas nocturnas. */
    horasNocturnasEstimadas: number
  }
  /** Lo que no se pudo leer o todavía no existe. Se muestra, no se esconde. */
  avisos: string[]
  /** true = falta correr el script de esta entrega. */
  faltaMigracion: boolean
}
