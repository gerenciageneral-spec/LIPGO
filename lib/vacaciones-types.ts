// Tipos del submódulo Vacaciones (fuera de "use server" para poder exportarlos).

export interface VacacionResumen {
  cedula: string
  nombre: string
  cargo: string | null
  fecha_ingreso: string | null
  anios: number // antigüedad en años (para mostrar)
  causados: number // días hábiles causados (1.25/mes)
  disfrutados: number // días tomados (control diario)
  liquidados: number // días compensados en dinero
  programados: number // días de solicitudes aprobadas a futuro (aún no tomadas)
  saldo: number // causados − disfrutados − liquidados
  valor_dia: number // salario/30
  valor_saldo: number // saldo × valor_dia
  alerta: "ok" | "warn" | "crit" // acumulación
}

export interface SolicitudVacaciones {
  id: string
  idempresa: number
  cedula: string
  nombre: string | null
  cargo: string | null
  fecha_inicio: string
  fecha_fin: string
  dias_habiles: number
  estado: string // PENDIENTE | APROBADA | RECHAZADA
  aprobado_por: string | null
  fecha_aprobacion: string | null
  motivo_rechazo: string | null
  observaciones: string | null
  created_at: string
}

// Días hábiles entre dos fechas ISO, inclusive: lunes a sábado, EXCLUYENDO
// domingos y FESTIVOS (Colombia). Pásale el conjunto de festivos (fechas ISO) para
// que los descuente; sin él, solo excluye domingos.
export function diasHabilesEntre(iniISO: string, finISO: string, festivos?: Iterable<string>): string[] {
  const fest = festivos instanceof Set ? festivos : new Set(festivos ?? [])
  const out: string[] = []
  const d = new Date(`${iniISO}T00:00:00`)
  const fin = new Date(`${finISO}T00:00:00`)
  if (Number.isNaN(d.getTime()) || Number.isNaN(fin.getTime()) || d > fin) return out
  while (d <= fin) {
    const dow = d.getDay() // 0=dom, 1=lun ... 6=sáb
    const iso = d.toISOString().slice(0, 10)
    if (dow !== 0 && !fest.has(iso)) out.push(iso) // lun–sáb y no festivo
    d.setDate(d.getDate() + 1)
  }
  return out
}
