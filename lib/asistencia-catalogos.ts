// Catálogo único de novedades de "día" (Siigo) y de puestos operativos.
// Antes vivía duplicado byte-a-byte en 4 archivos (Novedades de Personal,
// Visor de asistencia, LIPbot, Programación de turnos) -- cualquier cambio
// tenía que replicarse a mano en los 4 sin garantía de que quedaran iguales.

export const NOVEDADES_DIA = [
  "38- Licencia no remunerada- Deducción",
  "13- Incapacidad por enfermedad general al 100%",
  "14- Incapacidad por enfermedad general al 50",
  "15- Incapacidad por enfermedad general al 66%- ingreso",
  "16- Incapacidad por enfermedad profesional",
  "20- Licencia maternidad/paternidad",
  "21- Licencia por luto",
  "22- Licencia remunerada",
  "31- Vacaciones disfrutadas",
  "Retiro",
  "Descanso",
  "Descanso compensatorio domingo anterior",
] as const
export type NovedadDia = (typeof NOVEDADES_DIA)[number]

// Movidos desde components/attendance-table.tsx (mismos literales, misma
// fuente ahora también para Asistencia Administrativa).
export const OPERACIONES_OPTIONS = [
  "Cargue/Descargue",
  "Tolva Planchador",
  "Tolva Bulto",
  "Distribución Externa",
  "Auxiliar Mixto",
] as const

export const ESPECIALIDADES_OPTIONS = [
  "Pacas",
  "Cosedor",
  "Arrume Negro",
  "Reempaque",
  "Aseo",
  "Limpieza de Estibas",
  "Clasificacion huevos",
  "Cargue/Descargue Huevos",
  "Estibado PT",
  "Salvado",
  "Producción",
  "Descanso",
  "Distribución Turno",
  "Montacargas de producción",
  "Montacargas de cargue",
  "Operador PT (Carrusel)",
] as const

// Puesto placeholder para personal administrativo (headcount.admin=true) en
// un día trabajado normal. No existe en `tarifasturnos` -- no dispara
// ninguna tarifa de turno por accidente, solo activa `asistio_ok` en
// pagonomina y cae a `valor_diario_ley` (salario/30), que es justo lo que
// corresponde a un día normal de salario fijo.
export const PUESTO_ADMINISTRATIVO = "Administrativo"

// Duplicado intencional de app/api/attendance/register-shifts/route.ts: no
// se centraliza esa ruta del kiosko para no tocarla sin necesidad.
export function horasTurnoParaEspecialidad(puesto: string | null | undefined): number {
  if (!puesto) return 8
  return puesto.trim().toLowerCase() === "salvado" ? 10 : 8
}
