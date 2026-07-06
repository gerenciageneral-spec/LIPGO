"use server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"

// Documento normalizado del repositorio universal. Unifica en un solo esquema los
// documentos que hoy viven en muchas tablas distintas, sin tocar esos flujos.
export interface DocUniversal {
  id: string
  modulo: string
  submodulo: string
  norma: string | null
  tipo: string // extensión del archivo (PDF, IMG, DOC…)
  titulo: string // persona o referencia del documento
  archivo_url: string
  archivo_nombre: string
  fecha: string | null
  fuente: string // tabla de origen
}

function extDe(url: string): string {
  const e = String(url || "").split("?")[0].split(".").pop()?.toLowerCase() || ""
  if (e === "pdf") return "PDF"
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(e)) return "Imagen"
  if (["doc", "docx"].includes(e)) return "Word"
  if (["xls", "xlsx", "csv"].includes(e)) return "Excel"
  return e ? e.toUpperCase() : "Otro"
}
function nombreDe(url: string, fallback: string): string {
  try {
    const seg = decodeURIComponent(String(url).split("/").pop() || "").split("?")[0]
    return seg || fallback
  } catch {
    return fallback
  }
}
const tieneUrl = (v: any) => !!(v && String(v).trim() && String(v).startsWith("http"))

// Columnas-documento de headcount → etiqueta legible.
const HEADCOUNT_DOCS: Record<string, string> = {
  hoja_de_vida: "Hoja de Vida",
  copia_doc_id: "Documento de identidad",
  afiliacion_arl: "Afiliación ARL",
  afiliacion_eps: "Afiliación EPS",
  afiliacion_afp: "Afiliación AFP",
  afiliacion_caja: "Afiliación Caja",
  cert_laborales: "Certificados laborales",
  cert_personales: "Certificados personales",
  antecedentes: "Antecedentes",
  doc_beneficia: "Documentos beneficiarios",
  examenes_ing: "Examen de ingreso",
  cert_m_alimentos: "Cert. manipulación de alimentos",
  cert_eva_med: "Cert. evaluación médica",
  acta_dotacion: "Acta de dotación",
  cert_cuenta: "Certificación bancaria",
  contrato: "Contrato",
  contratosiigo: "Contrato Siigo",
  sst: "SST",
  induccion: "Inducción",
}

// Reúne TODOS los documentos de la empresa seleccionada, normalizados. Cada fuente
// se consulta de forma independiente y resiliente (si una tabla no existe, se omite).
export async function getRepositorioUniversal(selectedEmpresaId?: number | null) {
  const sb: any = await getSupabaseAdmin()
  const empresaId = selectedEmpresaId || (await getCurrentEmpresaIdForInsert())
  const docs: DocUniversal[] = []
  const push = (d: DocUniversal) => docs.push(d)

  // 1) Soportes documentales (transversal): ya trae modulo/norma/referencia.
  try {
    const { data } = await sb
      .from("soportes_documentales")
      .select("id,norma,modulo,referencia_tipo,referencia_desc,archivo_url,archivo_nombre,tipo_archivo,vigente,created_at")
      .eq("idempresa", empresaId)
      .order("created_at", { ascending: false })
    for (const r of data ?? []) {
      if (!tieneUrl(r.archivo_url)) continue
      push({
        id: `sop:${r.id}`,
        modulo: r.modulo || "SIG",
        submodulo: r.referencia_tipo || "Soporte",
        norma: r.norma || null,
        tipo: extDe(r.archivo_url),
        titulo: r.referencia_desc || r.archivo_nombre || "Soporte",
        archivo_url: r.archivo_url,
        archivo_nombre: r.archivo_nombre || nombreDe(r.archivo_url, "soporte"),
        fecha: r.created_at || null,
        fuente: "soportes_documentales",
      })
    }
  } catch {}

  // 2) Hojas de vida (Gestión Humana).
  try {
    const { data } = await sb.from("hojas_de_vida").select("id,nombre_candidato,archivo_url,archivo_nombre,created_at").eq("idempresa", empresaId)
    for (const r of data ?? []) {
      if (!tieneUrl(r.archivo_url)) continue
      push({ id: `hv:${r.id}`, modulo: "Gestión Humana", submodulo: "Hojas de Vida", norma: null, tipo: extDe(r.archivo_url), titulo: r.nombre_candidato || "Candidato", archivo_url: r.archivo_url, archivo_nombre: r.archivo_nombre || nombreDe(r.archivo_url, "hoja de vida"), fecha: r.created_at || null, fuente: "hojas_de_vida" })
    }
  } catch {}

  // 3) Antecedentes (Gestión Humana) — hasta 3 documentos por persona.
  try {
    const { data } = await sb.from("antecedentes").select("id,nombre,policia_url,procuraduria_url,contraloria_url,created_at").eq("idempresa", empresaId)
    const slots: [string, string][] = [["policia_url", "Antecedentes Policía"], ["procuraduria_url", "Antecedentes Procuraduría"], ["contraloria_url", "Antecedentes Contraloría"]]
    for (const r of data ?? []) {
      for (const [col, etq] of slots) {
        if (!tieneUrl(r[col])) continue
        push({ id: `ant:${r.id}:${col}`, modulo: "Gestión Humana", submodulo: "Antecedentes", norma: null, tipo: extDe(r[col]), titulo: `${r.nombre || "Colaborador"} — ${etq}`, archivo_url: r[col], archivo_nombre: nombreDe(r[col], etq), fecha: r.created_at || null, fuente: "antecedentes" })
      }
    }
  } catch {}

  // 4) Exámenes médicos (SST).
  try {
    const { data } = await sb.from("examenes_medicos").select("id,nombre,tipo_examen,archivo_url,archivo_nombre,fecha_examen,created_at").eq("idempresa", empresaId)
    for (const r of data ?? []) {
      if (!tieneUrl(r.archivo_url)) continue
      push({ id: `exm:${r.id}`, modulo: "SST", submodulo: "Exámenes Médicos", norma: "SST 0312", tipo: extDe(r.archivo_url), titulo: `${r.nombre || "Colaborador"}${r.tipo_examen ? " — " + r.tipo_examen : ""}`, archivo_url: r.archivo_url, archivo_nombre: r.archivo_nombre || nombreDe(r.archivo_url, "examen médico"), fecha: r.fecha_examen || r.created_at || null, fuente: "examenes_medicos" })
    }
  } catch {}

  // 5) Contratos (Gestión Humana).
  try {
    const { data } = await sb.from("contratos").select("id,colaborador_id,cargo,url_documento,created_at").eq("idempresa", empresaId)
    for (const r of data ?? []) {
      if (!tieneUrl(r.url_documento)) continue
      push({ id: `con:${r.id}`, modulo: "Gestión Humana", submodulo: "Contratación", norma: null, tipo: extDe(r.url_documento), titulo: `Contrato — ${r.colaborador_id || ""}${r.cargo ? " (" + r.cargo + ")" : ""}`, archivo_url: r.url_documento, archivo_nombre: nombreDe(r.url_documento, "contrato"), fecha: r.created_at || null, fuente: "contratos" })
    }
  } catch {}

  // 6) Head Count (Gestión Humana) — expediente por colaborador, una fila por documento.
  try {
    const cols = Object.keys(HEADCOUNT_DOCS)
    const { data } = await sb.from("headcount").select(["id", "identificacion", "nombre", ...cols].join(",")).eq("idempresa", empresaId)
    for (const r of data ?? []) {
      for (const col of cols) {
        if (!tieneUrl(r[col])) continue
        push({ id: `hc:${r.id}:${col}`, modulo: "Gestión Humana", submodulo: `Head Count · ${HEADCOUNT_DOCS[col]}`, norma: null, tipo: extDe(r[col]), titulo: `${r.nombre || r.identificacion || "Colaborador"} — ${HEADCOUNT_DOCS[col]}`, archivo_url: r[col], archivo_nombre: nombreDe(r[col], HEADCOUNT_DOCS[col]), fecha: null, fuente: "headcount" })
      }
    }
  } catch {}

  // 7) Investigación de AT (SST).
  try {
    const { data } = await sb.from("sst_incidentes").select("id,trabajador,fecha_evento,soporte_url,documento_url,documento_editable_url,created_at").eq("idempresa", empresaId)
    const slots: [string, string][] = [["documento_url", "Investigación"], ["documento_editable_url", "Investigación (editable)"], ["soporte_url", "Soporte"]]
    for (const r of data ?? []) {
      for (const [col, etq] of slots) {
        if (!tieneUrl(r[col])) continue
        push({ id: `at:${r.id}:${col}`, modulo: "SST", submodulo: "Investigación de AT", norma: "SST 0312", tipo: extDe(r[col]), titulo: `${r.trabajador || "AT"} — ${etq}`, archivo_url: r[col], archivo_nombre: nombreDe(r[col], etq), fecha: r.fecha_evento || r.created_at || null, fuente: "sst_incidentes" })
      }
    }
  } catch {}

  // 8) Recobro de incapacidades (SST).
  try {
    const { data } = await sb.from("ausentismosst").select("id,nombre_colaborador,soporte_radicado_url,soporte_pago_url,created_at").eq("idempresa", empresaId)
    const slots: [string, string][] = [["soporte_radicado_url", "Radicado recobro"], ["soporte_pago_url", "Pago recobro"]]
    for (const r of data ?? []) {
      for (const [col, etq] of slots) {
        if (!tieneUrl(r[col])) continue
        push({ id: `aus:${r.id}:${col}`, modulo: "SST", submodulo: "Recobro de Incapacidades", norma: "SST 0312", tipo: extDe(r[col]), titulo: `${r.nombre_colaborador || "Colaborador"} — ${etq}`, archivo_url: r[col], archivo_nombre: nombreDe(r[col], etq), fecha: r.created_at || null, fuente: "ausentismosst" })
      }
    }
  } catch {}

  // 9) Cierre mensual de inventario (Operación LIP).
  try {
    const { data } = await sb.from("sig_inventario_cierre_mes").select("id,mes,documento_url,firma_url,proyecto_id").eq("proyecto_id", empresaId)
    const slots: [string, string][] = [["documento_url", "Acta de cierre"], ["firma_url", "Firma"]]
    for (const r of data ?? []) {
      for (const [col, etq] of slots) {
        if (!tieneUrl(r[col])) continue
        push({ id: `cie:${r.id}:${col}`, modulo: "Operación LIP", submodulo: "Cierre de Inventario", norma: "ISO 9001", tipo: extDe(r[col]), titulo: `Cierre ${r.mes || ""} — ${etq}`, archivo_url: r[col], archivo_nombre: nombreDe(r[col], etq), fecha: null, fuente: "sig_inventario_cierre_mes" })
      }
    }
  } catch {}

  return { success: true, data: docs }
}
