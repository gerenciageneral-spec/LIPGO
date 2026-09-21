// Horarios REALES por actividad/puesto -- puro, sin acceso a BD.
//
// Reemplaza la idea de un catálogo fijo de turnos (T1/T2/T3/AD) por algo que
// se calcula solo a partir de lo que el coordinador realmente programó: para
// cada puesto, qué horario(s) de entrada/salida se usaron y cuántas
// persona-días usaron cada uno. Lo usan dos pantallas que antes calculaban
// esto cada una a su manera:
//   - Vista de quincena (lib/programacion-quincena-actions.ts): "Horarios
//     reales en uso" + Cobertura, ambas ancladas al horario real en vez de a
//     `turnos_definicion`.
//   - Copiloto de rotación (lib/rotacion-sugerida-actions.ts): la hora que le
//     sugiere a alguien para su puesto NUEVO debe ser el horario real de ESE
//     puesto, no el horario habitual de la persona en su puesto viejo.

const NOCTURNO_DESDE = 19 * 60
const NOCTURNO_HASTA = 6 * 60

export function aMinutos(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function fmtMinutos(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Minutos de un turno, contemplando que cruce la medianoche. */
export function minutosTurno(ini: number, fin: number): number {
  return fin > ini ? fin - ini : 24 * 60 - ini + fin
}

/**
 * Minutos del turno que caen en la franja nocturna (19:00-06:00). Se recorre
 * minuto a minuto porque el turno puede cruzar la medianoche Y la franja
 * nocturna también, y con intersección de intervalos hay cuatro casos que es
 * fácil equivocar. Como mucho son 1440 iteraciones.
 */
export function minutosNocturnos(ini: number, fin: number): number {
  const total = minutosTurno(ini, fin)
  let n = 0
  for (let i = 0; i < total; i++) {
    const m = (ini + i) % (24 * 60)
    if (m >= NOCTURNO_DESDE || m < NOCTURNO_HASTA) n++
  }
  return n
}

export interface HorarioActividad {
  puesto: string
  horaInicio: string // "HH:MM"
  horaFin: string
  /** Duración neta en horas, ya contempla cruce de medianoche. */
  horas: number
  /** Estimado de pantalla -- no liquida nada, ver nota en Vista de quincena. */
  horasNocturnas: number
  /** Cuántas persona-día usaron exactamente este horario. */
  muestras: number
}

/**
 * Agrupa filas reales de `registroasistencia` por (puesto, horaEntrada,
 * horaSalida) y cuenta cuántas persona-día usaron cada combinación. Filas de
 * novedad (sin puesto real) o sin horario completo se ignoran -- no hay nada
 * que agrupar ahí.
 *
 * Orden: por puesto, y dentro de cada puesto por `muestras` descendente (el
 * horario más usado primero) -- así un puesto con 2 horarios reales en uso
 * (p.ej. Auxiliar Mixto con dos turnos) muestra ambos, el más común arriba.
 */
export function agruparHorariosPorPuesto(
  filas: { puesto: string | null; horaEntrada: string | null; horaSalida: string | null }[],
): HorarioActividad[] {
  const conteo = new Map<string, { puesto: string; horaInicio: string; horaFin: string; muestras: number }>()
  for (const r of filas) {
    const puesto = r.puesto?.trim()
    if (!puesto) continue
    const ini = aMinutos(r.horaEntrada)
    const fin = aMinutos(r.horaSalida)
    if (ini == null || fin == null) continue
    const horaInicio = fmtMinutos(ini)
    const horaFin = fmtMinutos(fin)
    const key = `${puesto}|${horaInicio}|${horaFin}`
    const actual = conteo.get(key)
    if (actual) actual.muestras++
    else conteo.set(key, { puesto, horaInicio, horaFin, muestras: 1 })
  }

  const resultado: HorarioActividad[] = [...conteo.values()].map((v) => {
    const ini = aMinutos(v.horaInicio)!
    const fin = aMinutos(v.horaFin)!
    return {
      puesto: v.puesto,
      horaInicio: v.horaInicio,
      horaFin: v.horaFin,
      horas: Math.round((minutosTurno(ini, fin) / 60) * 10) / 10,
      horasNocturnas: Math.round((minutosNocturnos(ini, fin) / 60) * 10) / 10,
      muestras: v.muestras,
    }
  })

  resultado.sort((a, b) => a.puesto.localeCompare(b.puesto, "es") || b.muestras - a.muestras)
  return resultado
}

/** El horario real MÁS USADO de un puesto puntual, o null si nunca se usó. */
export function horarioMasUsado(horarios: HorarioActividad[], puesto: string): HorarioActividad | null {
  const deEstePuesto = horarios.filter((h) => h.puesto === puesto)
  if (deEstePuesto.length === 0) return null
  return deEstePuesto.reduce((mejor, h) => (h.muestras > mejor.muestras ? h : mejor))
}
