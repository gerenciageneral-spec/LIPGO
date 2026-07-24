// Clasificación de las novedades del control diario (registroasistencia.asistencia)
// para el PUENTE hacia el módulo de Ausentismos. Puro y client-safe (sin
// "use server"): lo usan el puente (server), la tabla de Ausentismos y Recobro.
//
// REGLA (definida con negocio). SON ausentismo (el puente las envía):
//   - Incapacidades MÉDICAS: enfermedad general (EG) y accidente/enf. laboral (AT).
//     Son las únicas RECOBRABLES (EPS/ARL) y las que alimentan indicadores SST.
//   - Licencia NO REMUNERADA: ausencia SIN soporte médico que nómina rotula así
//     (deducción). Es ausentismo NO médico → NO recobrable, sin diagnóstico.
// NO son ausentismo (el puente NO las envía):
//   - Otras licencias (maternidad/paternidad, luto, remunerada)
//   - Vacaciones (submódulo propio), Descanso / compensatorio, Retiro (baja).

export type CategoriaAusentismo = "ENFERMEDAD_GENERAL" | "ACCIDENTE_LABORAL" | "NO_REMUNERADA"

// Solo estas alimentan recobro (EPS/ARL) e indicadores SST de accidentalidad.
export const CATEGORIAS_MEDICAS: CategoriaAusentismo[] = ["ENFERMEDAD_GENERAL", "ACCIDENTE_LABORAL"]

export function esCategoriaMedica(cat: string | null | undefined): boolean {
  return cat === "ENFERMEDAD_GENERAL" || cat === "ACCIDENTE_LABORAL"
}

export function tipoEventoDeCategoria(cat: string | null | undefined): "EG" | "AT" | null {
  if (cat === "ENFERMEDAD_GENERAL") return "EG"
  if (cat === "ACCIDENTE_LABORAL") return "AT"
  return null // NO_REMUNERADA no tiene tipo_evento (no es médica)
}

// Rótulo de novedad → categoría de ausentismo, o null si NO es ausentismo.
export function categoriaDeNovedad(asistencia: string | null | undefined): CategoriaAusentismo | null {
  const s = String(asistencia || "").toLowerCase()
  if (!s) return null
  if (s.includes("incapacidad")) return s.includes("profesional") ? "ACCIDENTE_LABORAL" : "ENFERMEDAD_GENERAL"
  if (s.includes("no remunerada")) return "NO_REMUNERADA"
  return null // otras licencias, vacaciones, descanso, retiro → NO son ausentismo
}

export const CATEGORIA_LABEL: Record<string, string> = {
  ENFERMEDAD_GENERAL: "Enfermedad general",
  ACCIDENTE_LABORAL: "Accidente / enf. laboral",
  NO_REMUNERADA: "No remunerada (sin soporte médico)",
}

export function etiquetaCategoria(cat: string | null | undefined): string {
  return (cat && CATEGORIA_LABEL[cat]) || "Ausentismo"
}
