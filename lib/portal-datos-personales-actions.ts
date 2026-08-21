"use server"

// Datos personales del trabajador en el portal: MEDEVAC (SST-FOR-33) y Perfil
// Sociodemográfico (SST-FOR-32).
//
// Los dos formatos quedan enlazados por el DOCUMENTO del trabajador, que es la
// misma llave que usa el head count. Por eso todas las funciones de aquí toman
// la identificación de la sesión y la imponen como `documento` del registro:
// nunca se usa un documento que venga en el formulario. Sin esa regla, un
// trabajador podría sobrescribir la ficha de emergencia de otro con solo
// cambiar un campo del formulario.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import type { MedevacRow, PerfilSociodemograficoRow } from "@/lib/sst-evidencia-types"

function normalizar(v: unknown): string {
  return String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase()
}

function limpiarTexto(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(/\s+/g, " ")
  return s === "" ? null : s
}

function limpiarEntero(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

// Lo mínimo que hace útil una tarjeta MEDEVAC en una emergencia real: grupo
// sanguíneo, alergias, EPS y alguien a quién llamar con su teléfono. Es el
// mismo criterio que aplica la vista vw_sst_datos_colaborador, para que el
// portal y el módulo de SST no discrepen sobre quién está completo.
function medevacEstaCompleto(m: Partial<MedevacRow> | null | undefined): boolean {
  if (!m) return false
  return !!(limpiarTexto(m.rh) && limpiarTexto(m.alergias) && limpiarTexto(m.eps)
    && limpiarTexto(m.contacto_nombre) && limpiarTexto(m.contacto_telefono))
}

function perfilEstaCompleto(p: Partial<PerfilSociodemograficoRow> | null | undefined): boolean {
  if (!p) return false
  return !!(limpiarTexto(p.fecha_nacimiento) && limpiarTexto(p.sexo) && limpiarTexto(p.nivel_escolaridad)
    && limpiarTexto(p.estado_civil) && limpiarTexto(p.tipo_vivienda))
}

export interface EstadoDatosPersonales {
  medevacCompleto: boolean
  perfilCompleto: boolean
  todoCompleto: boolean
  // Si la consulta falla no se bloquea a nadie: un error de red no puede dejar
  // a un trabajador sin poder pedir su anticipo. Este campo lo indica.
  indeterminado: boolean
}

/**
 * Responde si al trabajador le faltan datos. Es lo que consulta la guarda que
 * protege Anticipos, Permisos y Certificados.
 *
 * FALLA-ABIERTO a propósito: si Supabase responde con error, devuelve todo en
 * `true` con `indeterminado: true`. Bloquear un trámite por un fallo técnico
 * sería peor que dejar pasar a alguien con la ficha incompleta.
 */
export async function getEstadoDatosPersonales(identificacion: string): Promise<EstadoDatosPersonales> {
  const doc = normalizar(identificacion)
  const abierto: EstadoDatosPersonales = { medevacCompleto: true, perfilCompleto: true, todoCompleto: true, indeterminado: true }
  if (!doc) return abierto

  try {
    const supabase: any = await getSupabaseAdmin()
    const [med, per] = await Promise.all([
      supabase.from("sst_medevac").select("rh, alergias, eps, contacto_nombre, contacto_telefono")
        .eq("documento_norm", doc).limit(1).maybeSingle(),
      supabase.from("sst_perfil_sociodemografico").select("fecha_nacimiento, sexo, nivel_escolaridad, estado_civil, tipo_vivienda")
        .eq("documento_norm", doc).limit(1).maybeSingle(),
    ])
    if (med.error || per.error) {
      console.error("[v0] getEstadoDatosPersonales:",
        med.error?.message, med.error?.code, per.error?.message, per.error?.code)
      return abierto
    }
    const medevacCompleto = medevacEstaCompleto(med.data)
    const perfilCompleto = perfilEstaCompleto(per.data)
    return { medevacCompleto, perfilCompleto, todoCompleto: medevacCompleto && perfilCompleto, indeterminado: false }
  } catch (err: any) {
    console.error("[v0] getEstadoDatosPersonales excepción:", err?.message)
    return abierto
  }
}

export interface MisDatosPortal {
  medevac: MedevacRow | null
  perfil: PerfilSociodemograficoRow | null
  // Del head count, para prellenar lo que la empresa ya sabe y el trabajador
  // no tiene por qué volver a escribir.
  headcount: { nombre: string; cargo: string | null; celular: string | null; idempresa: number | null } | null
}

export async function getMisDatosPortal(identificacion: string): Promise<MisDatosPortal> {
  const doc = normalizar(identificacion)
  const vacio: MisDatosPortal = { medevac: null, perfil: null, headcount: null }
  if (!doc) return vacio

  try {
    const supabase: any = await getSupabaseAdmin()
    const [med, per, hc] = await Promise.all([
      supabase.from("sst_medevac").select("*").eq("documento_norm", doc).limit(1).maybeSingle(),
      supabase.from("sst_perfil_sociodemografico").select("*").eq("documento_norm", doc).limit(1).maybeSingle(),
      supabase.from("headcount").select("nombre, cargo, celular, idempresa").eq("identificacion", doc).limit(1).maybeSingle(),
    ])
    if (med.error) console.error("[v0] getMisDatosPortal medevac:", med.error.message, med.error.code)
    if (per.error) console.error("[v0] getMisDatosPortal perfil:", per.error.message, per.error.code)
    if (hc.error) console.error("[v0] getMisDatosPortal headcount:", hc.error.message, hc.error.code)
    return {
      medevac: (med.data ?? null) as MedevacRow | null,
      perfil: (per.data ?? null) as PerfilSociodemograficoRow | null,
      headcount: hc.data
        ? { nombre: hc.data.nombre ?? "", cargo: hc.data.cargo ?? null, celular: hc.data.celular ?? null, idempresa: hc.data.idempresa ?? null }
        : null,
    }
  } catch (err: any) {
    console.error("[v0] getMisDatosPortal excepción:", err?.message)
    return vacio
  }
}

/**
 * Confirma que la cédula corresponde a alguien vigente en el head count antes
 * de dejarlo escribir. La sesión del portal vive en `localStorage` y no caduca,
 * así que se revalida en cada escritura.
 */
async function colaboradorVigente(supabase: any, doc: string): Promise<{ ok: boolean; error?: string; nombre?: string; idempresa?: number | null; cargo?: string | null }> {
  const { data, error } = await supabase
    .from("headcount").select("nombre, estado, idempresa, cargo")
    .eq("identificacion", doc).limit(1).maybeSingle()
  if (error) return { ok: false, error: "No se pudo verificar tu vinculación. Intenta de nuevo." }
  if (!data) return { ok: false, error: "Tu documento no aparece en el head count. Avisa a Gestión Humana." }
  const estado = String(data.estado ?? "").trim().toLowerCase()
  if (estado && estado !== "activo") return { ok: false, error: "Tu registro no está activo. Avisa a Gestión Humana." }
  return { ok: true, nombre: data.nombre ?? "", idempresa: data.idempresa ?? null, cargo: data.cargo ?? null }
}

export interface MedevacPortalInput {
  documento_tipo: string
  celular: string
  rh: string
  alergias: string
  eps: string
  arl: string
  contacto_nombre: string
  contacto_telefono: string
  contacto_parentesco: string
  email: string
  mes_cumple: string
  centro_trabajo: string
}

export async function guardarMedevacPortal(
  identificacion: string,
  datos: MedevacPortalInput,
): Promise<{ success: boolean; error?: string }> {
  const doc = normalizar(identificacion)
  if (!doc) return { success: false, error: "Sesión inválida. Vuelve a iniciar sesión." }

  const supabase: any = await getSupabaseAdmin()
  const vig = await colaboradorVigente(supabase, doc)
  if (!vig.ok) return { success: false, error: vig.error }

  // Lo que la ficha necesita para servir en una emergencia. Si falta algo de
  // esto, la ficha no cumple su función y no se guarda a medias.
  const faltan: string[] = []
  if (!limpiarTexto(datos.rh)) faltan.push("grupo sanguíneo (RH)")
  if (!limpiarTexto(datos.alergias)) faltan.push("alergias")
  if (!limpiarTexto(datos.eps)) faltan.push("EPS")
  if (!limpiarTexto(datos.contacto_nombre)) faltan.push("nombre del contacto de emergencia")
  if (!limpiarTexto(datos.contacto_telefono)) faltan.push("teléfono del contacto de emergencia")
  if (faltan.length) return { success: false, error: `Falta ${faltan.join(", ")}.` }

  const tel = String(datos.contacto_telefono ?? "").replace(/\D/g, "")
  if (tel.length < 7) return { success: false, error: "El teléfono del contacto de emergencia no parece válido." }

  const correo = limpiarTexto(datos.email)
  if (correo && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(correo)) {
    return { success: false, error: "El correo electrónico no es válido. Déjalo vacío si no tienes." }
  }

  // `documento` sale SIEMPRE de la sesión, nunca del formulario: es lo que
  // impide que alguien escriba sobre la ficha de otra persona.
  const payload = {
    idempresa: vig.idempresa ?? 100,
    documento: doc,
    documento_tipo: limpiarTexto(datos.documento_tipo) ?? "Cedula de ciudadanía",
    nombres: vig.nombre || null,
    cargo: vig.cargo ?? null,
    centro_trabajo: limpiarTexto(datos.centro_trabajo),
    celular: String(datos.celular ?? "").replace(/[^\d+]/g, "") || null,
    alergias: limpiarTexto(datos.alergias),
    rh: limpiarTexto(datos.rh),
    arl: limpiarTexto(datos.arl),
    eps: limpiarTexto(datos.eps),
    contacto_nombre: limpiarTexto(datos.contacto_nombre),
    contacto_telefono: tel,
    contacto_parentesco: limpiarTexto(datos.contacto_parentesco),
    email: correo,
    mes_cumple: limpiarTexto(datos.mes_cumple),
    // El trabajador diligenció su propia ficha: eso resuelve cualquier marca de
    // revisión que hubiera dejado la carga masiva sobre esta persona.
    requiere_revision: false,
    revision_nota: null,
    origen: "portal",
    actualizado_en: new Date().toISOString(),
    actualizado_por: `Portal · ${doc}`,
  }

  const { error } = await supabase.from("sst_medevac").upsert([payload], { onConflict: "documento_norm" })
  if (error) {
    console.error("[v0] guardarMedevacPortal:", error.message, error.code, error.details, error.hint)
    return { success: false, error: "No se pudo guardar. Intenta de nuevo." }
  }
  return { success: true }
}

export interface PerfilPortalInput {
  fecha_nacimiento: string
  sexo: string
  pais_nacimiento: string
  depto_nacimiento: string
  municipio_residencia: string
  grupo_etnico: string
  nivel_escolaridad: string
  estado_civil: string
  cabeza_familia: string
  num_hijos: string
  personas_hogar: string
  ingresos_familiares: string
  tipo_vivienda: string
  caracteristicas_vivienda: string
  zona: string
  direccion: string
  transporte: string
  estrato: string
  consume_alcohol: string
  actividad_fisica: string
  fumador: string
  afp: string
  eps: string
  arl: string
  turno: string
}

/**
 * Calcula la edad en años a partir de una fecha `YYYY-MM-DD`, comparando por
 * texto contra la fecha de hoy en Colombia.
 *
 * No usa `new Date("YYYY-MM-DD")`: ese constructor interpreta la cadena como
 * UTC y en Colombia (UTC-5) devuelve el día anterior, lo que hace que alguien
 * que cumple años hoy aparezca con un año menos.
 */
function edadDesde(fechaISO: string | null): number | null {
  if (!fechaISO || !/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) return null
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) // YYYY-MM-DD
  const [ay, am, ad] = fechaISO.split("-").map(Number)
  const [hy, hm, hd] = hoy.split("-").map(Number)
  let edad = hy - ay
  if (hm < am || (hm === am && hd < ad)) edad--
  return edad >= 0 && edad < 120 ? edad : null
}

export async function guardarPerfilPortal(
  identificacion: string,
  datos: PerfilPortalInput,
): Promise<{ success: boolean; error?: string }> {
  const doc = normalizar(identificacion)
  if (!doc) return { success: false, error: "Sesión inválida. Vuelve a iniciar sesión." }

  const supabase: any = await getSupabaseAdmin()
  const vig = await colaboradorVigente(supabase, doc)
  if (!vig.ok) return { success: false, error: vig.error }

  const nacimiento = limpiarTexto(datos.fecha_nacimiento)
  if (!nacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) {
    return { success: false, error: "La fecha de nacimiento es obligatoria." }
  }
  const edad = edadDesde(nacimiento)
  if (edad === null) return { success: false, error: "La fecha de nacimiento no es válida." }

  const faltan: string[] = []
  if (!limpiarTexto(datos.sexo)) faltan.push("sexo")
  if (!limpiarTexto(datos.nivel_escolaridad)) faltan.push("nivel de escolaridad")
  if (!limpiarTexto(datos.estado_civil)) faltan.push("estado civil")
  if (!limpiarTexto(datos.tipo_vivienda)) faltan.push("tipo de vivienda")
  if (faltan.length) return { success: false, error: `Falta ${faltan.join(", ")}.` }

  // El nombre se parte para que el módulo de SST pueda ordenar por apellido,
  // que es como se lee el censo. El head count guarda "Apellidos Nombres" en un
  // solo campo, así que se toman las dos primeras palabras como apellidos.
  const partes = String(vig.nombre ?? "").trim().split(/\s+/)
  const apellidos = partes.slice(0, 2).join(" ") || null
  const nombres = partes.slice(2).join(" ") || null

  const payload = {
    idempresa: vig.idempresa ?? 100,
    estado: "activo",
    documento: doc,
    documento_tipo: "Cedula de ciudadanía",
    nombres,
    apellidos,
    fecha_nacimiento: nacimiento,
    edad,
    sexo: limpiarTexto(datos.sexo),
    eps: limpiarTexto(datos.eps),
    afp: limpiarTexto(datos.afp),
    arl: limpiarTexto(datos.arl),
    turno: limpiarTexto(datos.turno),
    cargo: vig.cargo ?? null,
    pais_nacimiento: limpiarTexto(datos.pais_nacimiento),
    depto_nacimiento: limpiarTexto(datos.depto_nacimiento),
    municipio_residencia: limpiarTexto(datos.municipio_residencia),
    grupo_etnico: limpiarTexto(datos.grupo_etnico),
    nivel_escolaridad: limpiarTexto(datos.nivel_escolaridad),
    estado_civil: limpiarTexto(datos.estado_civil),
    cabeza_familia: limpiarTexto(datos.cabeza_familia),
    num_hijos: limpiarEntero(datos.num_hijos),
    personas_hogar: limpiarEntero(datos.personas_hogar),
    ingresos_familiares: limpiarTexto(datos.ingresos_familiares),
    tipo_vivienda: limpiarTexto(datos.tipo_vivienda),
    caracteristicas_vivienda: limpiarTexto(datos.caracteristicas_vivienda),
    zona: limpiarTexto(datos.zona),
    direccion: limpiarTexto(datos.direccion),
    transporte: limpiarTexto(datos.transporte),
    estrato: limpiarTexto(datos.estrato),
    consume_alcohol: limpiarTexto(datos.consume_alcohol),
    actividad_fisica: limpiarTexto(datos.actividad_fisica),
    fumador: limpiarTexto(datos.fumador),
    origen: "portal",
    actualizado_en: new Date().toISOString(),
    actualizado_por: `Portal · ${doc}`,
  }

  const { error } = await supabase.from("sst_perfil_sociodemografico").upsert([payload], { onConflict: "documento_norm" })
  if (error) {
    console.error("[v0] guardarPerfilPortal:", error.message, error.code, error.details, error.hint)
    return { success: false, error: "No se pudo guardar. Intenta de nuevo." }
  }
  return { success: true }
}
