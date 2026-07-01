"use client"

// Investigación de Accidentes / Incidentes — formato ORIGINAL de LIP (SST-FOR-21).
// Calca las 6 páginas del formato de LIP (base FURAT) + Ishikawa (4 ramas) + plan
// de acción F/M/I + testigos + retroalimentación + firmas. Exporta a PDF con logo.
// Alimenta sst_incidentes (+ sst_incidente_acciones + sst_incidente_testigos).

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SoportesDocumentales } from "@/components/sst/soportes-documentales"
import { EspinaPescado, CuadrosCausas } from "@/components/sst/espina-pescado"
import type { IshikawaData, CuadrosCausasData } from "@/components/sst/espina-pescado"
import { listIncidentes, saveIncidente, updateIncidente, listAcciones, listTestigos } from "@/lib/sst-incidentes-actions"
import type { IncidenteRow, IncidenteAccionRow, IncidenteTestigoRow } from "@/lib/sst-evidencia-types"
import { FileText, Eye, Loader2 } from "lucide-react"

// ---- Datos FIJOS del empleador LIP (encabezado del formato, no se digitan) ----
const EMPLEADOR_LIP = {
  razon_social: "LIP PROGRESSIVE INTEGRAL LOGISTICS SAS",
  tipo_id: "NIT",
  nit: "901725963-8",
  direccion: "CL 4 B 20 A 66 BRR CALLEJAS",
  departamento: "CESAR",
  municipio: "VALLEDUPAR",
  telefono: "",
  email: "gerenciageneral@lip-sas.com",
  actividad:
    "MANIPULACIÓN DE CARGA, INCLUYE LA CARGA Y DESCARGA DE MERCANCÍAS Y EQUIPAJE POR ESTIBADORES, COTEROS, PALETIZADORES, EXCEPTO CARGUE Y DESCARGUE DE EMBARCACIONES AÉREAS, MARÍTIMAS Y/O FLUVIALES.",
}
// Centro de trabajo por proyecto (selector global)
const CENTROS: Record<number, { nombre: string; direccion: string; municipio: string }> = {
  1: { nombre: "H. INDUPAN", direccion: "CR 22 # 14 - 12", municipio: "BOGOTÁ D.C" },
  2: { nombre: "AVIMOL (LA INSUPERABLE)", direccion: "", municipio: "" },
  3: { nombre: "CEDI FUNZA", direccion: "", municipio: "FUNZA" },
  4: { nombre: "CEDI MEDELLÍN", direccion: "", municipio: "MEDELLÍN" },
}

const SN: [string, string][] = [["true", "Sí"], ["false", "No"]]
const TIPOS: [string, string][] = [
  ["incidente", "Incidente"],
  ["accidente", "Accidente de trabajo"],
  ["enfermedad_laboral", "Enfermedad laboral"],
]
const GRAVEDAD: [string, string][] = [["leve", "Leve"], ["grave", "Grave"], ["mortal", "Mortal"]]
const ESTADOS: [string, string][] = [
  ["reportado", "Reportado"],
  ["en_investigacion", "En investigación"],
  ["cerrado", "Cerrado"],
]
const VINCULACION: [string, string][] = [
  ["planta", "Planta"],
  ["mision", "Misión"],
  ["contratista", "Contratista"],
  ["independiente", "Independiente"],
  ["dependiente", "Dependiente"],
  ["aprendiz", "Aprendiz"],
]
const JORNADA: [string, string][] = [["normal", "Normal"], ["extra", "Extra"]]
const JORNADA_HAB: [string, string][] = [
  ["diurno", "Diurno"],
  ["nocturno", "Nocturno"],
  ["mixto", "Mixto"],
  ["turnos", "Por turnos"],
]
const SEXO: [string, string][] = [["M", "Masculino"], ["F", "Femenino"]]
const DOC_TIPO: [string, string][] = [
  ["CC", "Cédula de ciudadanía"],
  ["CE", "Cédula de extranjería"],
  ["TI", "Tarjeta de identidad"],
  ["PA", "Pasaporte"],
  ["PEP", "PEP / PPT"],
]
const DIA_SEMANA: [string, string][] = [
  ["lunes", "Lunes"], ["martes", "Martes"], ["miercoles", "Miércoles"], ["jueves", "Jueves"],
  ["viernes", "Viernes"], ["sabado", "Sábado"], ["domingo", "Domingo"],
]
const ZONA: [string, string][] = [["urbana", "Urbana"], ["rural", "Rural"]]
const DENTRO_FUERA: [string, string][] = [["dentro", "Dentro de la empresa"], ["fuera", "Fuera de la empresa"]]
const AUS_TIPO: [string, string][] = [["inicial", "Inicial"], ["prorroga", "Prórroga"]]
const TIPO_ACC: [string, string][] = [
  ["propios_trabajo", "Propios del Trabajo"],
  ["violencia", "Violencia"],
  ["transito", "Tránsito"],
  ["deportivo", "Deportivo"],
  ["recreativo", "Recreativo o Cultural"],
]
// Catálogos FURAT completos (value = etiqueta, se guarda y se imprime tal cual)
const LUGAR: [string, string][] = [
  ["1. Almacenes o depósitos", "1. Almacenes o depósitos"],
  ["2. Áreas de producción", "2. Áreas de producción"],
  ["3. Áreas recreativas o deportivas", "3. Áreas recreativas o deportivas"],
  ["4. Corredores o pasillos", "4. Corredores o pasillos"],
  ["5. Escaleras", "5. Escaleras"],
  ["6. Parqueaderos o áreas de circulación vehicular", "6. Parqueaderos o áreas de circulación vehicular"],
  ["7. Oficinas", "7. Oficinas"],
  ["8. Otras áreas comunes", "8. Otras áreas comunes"],
]
const LESION: [string, string][] = [
  ["1. Fractura", "1. Fractura"],
  ["2. Luxación", "2. Luxación"],
  ["3. Torcedura, esguince, desgarro muscular, hernia o laceración de tendón sin herida", "3. Torcedura / esguince / desgarro / hernia"],
  ["4. Conmoción o trauma interno", "4. Conmoción o trauma interno"],
  ["5. Amputación o enucleación", "5. Amputación o enucleación"],
  ["6. Herida", "6. Herida"],
  ["7. Trauma superficial (rasguño, punción, pinchazo, cuerpo extraño en ojo)", "7. Trauma superficial"],
  ["8. Golpe, contusión o aplastamiento", "8. Golpe, contusión o aplastamiento"],
  ["9. Quemadura", "9. Quemadura"],
  ["10. Envenenamiento o intoxicación aguda o alergia", "10. Envenenamiento / intoxicación / alergia"],
  ["11. Efecto del tiempo, del clima u otro del ambiente", "11. Efecto del tiempo / clima / ambiente"],
  ["12. Asfixia", "12. Asfixia"],
  ["13. Efecto de la electricidad", "13. Efecto de la electricidad"],
  ["14. Efecto nocivo de la radiación", "14. Efecto nocivo de la radiación"],
  ["15. Lesiones múltiples", "15. Lesiones múltiples"],
  ["16. Otro", "16. Otro (especificar)"],
]
const PARTE: [string, string][] = [
  ["1. Cabeza", "1. Cabeza"],
  ["2. Ojo", "2. Ojo"],
  ["3. Cuello", "3. Cuello"],
  ["4. Tronco (espalda, columna vertebral, médula espinal, pelvis)", "4. Tronco (espalda / columna / pelvis)"],
  ["5. Tórax", "5. Tórax"],
  ["6. Abdomen", "6. Abdomen"],
  ["7. Miembros superiores", "7. Miembros superiores"],
  ["8. Manos (dedos, muñeca o puño)", "8. Manos (dedos, muñeca o puño)"],
  ["9. Miembros inferiores", "9. Miembros inferiores"],
  ["10. Pies", "10. Pies"],
  ["12. Ubicaciones múltiples", "12. Ubicaciones múltiples"],
  ["13. Lesiones generales u otras", "13. Lesiones generales u otras"],
]
const AGENTE: [string, string][] = [
  ["1. Máquinas y/o equipos", "1. Máquinas y/o equipos"],
  ["2. Medios de transporte", "2. Medios de transporte"],
  ["3. Aparatos", "3. Aparatos"],
  ["4. Herramientas, implementos o utensilios", "4. Herramientas / implementos / utensilios"],
  ["5. Materiales o sustancias", "5. Materiales o sustancias"],
  ["6. Radiaciones", "6. Radiaciones"],
  ["7. Ambiente de trabajo (superficies, muebles, tejados, etc.)", "7. Ambiente de trabajo"],
  ["8. Otros agentes no clasificados", "8. Otros agentes no clasificados"],
  ["9. Animales (vivos o productos animales)", "9. Animales"],
  ["10. Agentes no clasificados por falta de datos", "10. No clasificado por falta de datos"],
]
const MECANISMO: [string, string][] = [
  ["1. Caída de personas", "1. Caída de personas"],
  ["2. Caída de objetos", "2. Caída de objetos"],
  ["3. Pisadas, choques o golpes", "3. Pisadas, choques o golpes"],
  ["4. Atrapamientos", "4. Atrapamientos"],
  ["5. Sobreesfuerzo, esfuerzo excesivo o falso movimiento", "5. Sobreesfuerzo / falso movimiento"],
  ["6. Exposición o contacto con temperatura extrema", "6. Contacto con temperatura extrema"],
  ["7. Exposición o contacto con la electricidad", "7. Contacto con la electricidad"],
  ["8. Exposición o contacto con sustancias nocivas, radiaciones o salpicaduras", "8. Contacto con sustancias nocivas"],
  ["9. Golpes por o contra objetos", "9. Golpes por o contra objetos"],
  ["10. Otros", "10. Otros (especificar)"],
]
const CONTROL: [string, string][] = [["fuente", "Fuente (F)"], ["medio", "Medio (M)"], ["individuo", "Individuo (I)"]]

const BOOL_KEYS = [
  "labor_habitual", "causo_muerte", "testigos_presenciaron", "reportado_arl", "reportado_mintrabajo",
  "primeros_auxilios", "remitido_centro_salud", "hospitalizado", "requirio_transporte",
]

// Ishikawa con las 4 ramas del formato LIP
function ishikawaLIP(): IshikawaData {
  return {
    efecto: "",
    categorias: [
      { nombre: "Factores personales", causas: [] },
      { nombre: "Factores del trabajo", causas: [] },
      { nombre: "Actos inseguros", causas: [] },
      { nombre: "Condiciones inseguras", causas: [] },
    ],
  }
}

const vacioAccion = () => ({
  plan: "",
  tipo_control: "fuente",
  fecha_implementacion: "",
  responsable_ejecucion: "",
  fecha_verificacion: "",
  responsable_verificacion: "",
  observacion: "",
  estado: "pendiente",
})
const vacioTestigo = () => ({ nombre: "", documento: "", version: "" })
const firmasVacias = () => ({
  jefe_inmediato: { nombre: "", cargo: "Jefe inmediato / Coordinador de operación", cc: "" },
  coordinador_sst: { nombre: "Michael Josías Castro Alejo", cargo: "Coordinador SST", cc: "" },
  integrante_copasst: { nombre: "", cargo: "Integrante del COPASST", cc: "" },
  responsable_sgsst: { nombre: "Michael Josías Castro Alejo", cargo: "Responsable SG-SST", cc: "" },
  reviso: { nombre: "", cargo: "SST - Coordinador de operaciones", cc: "" },
  cerro: { nombre: "", cargo: "Responsable del SG-SST", cc: "" },
  representante_legal: { nombre: "Jeffrey Joel Jiménez Rodríguez", cargo: "Representante Legal", cc: "" },
})

const vacio = (empresaId?: number | null) => {
  const c = (empresaId && CENTROS[empresaId]) || { nombre: "", direccion: "", municipio: "" }
  return {
    tipo: "accidente",
    gravedad: "leve",
    fecha_reporte: new Date().toISOString().slice(0, 10),
    // clasificación
    centro_trabajo: c.nombre,
    centro_direccion: c.direccion,
    centro_municipio: c.municipio,
    codigo_actividad: "",
    // persona
    trabajador: "",
    documento_tipo: "CC",
    documento_numero: "",
    fecha_nacimiento: "",
    sexo: "M",
    eps: "",
    arl: "",
    afp: "",
    cargo: "",
    ocupacion_habitual: "",
    codigo_ocupacion: "",
    tipo_vinculacion: "planta",
    fecha_ingreso: "",
    antiguedad_dias: 0,
    salario: 0,
    jornada_habitual: "diurno",
    funciones_asignadas: "",
    epp_portado: "",
    // evento
    fecha_evento: new Date().toISOString().slice(0, 10),
    hora_evento: "",
    dia_semana: "",
    tiempo_laborado_previo: "",
    jornada_evento: "normal",
    labor_habitual: "true",
    tipo_accidente: "propios_trabajo",
    dentro_fuera_empresa: "dentro",
    departamento_evento: "",
    municipio_evento: "",
    zona_evento: "urbana",
    area_ocurrencia: "",
    lugar_ocurrencia: LUGAR[1][0],
    tipo_lesion: LESION[7][0],
    parte_cuerpo: PARTE[0][0],
    agente_accidente: AGENTE[6][0],
    mecanismo: MECANISMO[3][0],
    descripcion: "",
    // manejo
    causo_muerte: "false",
    primeros_auxilios: "false",
    remitido_centro_salud: "false",
    centro_salud: "",
    hospitalizado: "false",
    requirio_transporte: "false",
    // ausentismo
    ausentismo_tipo: "inicial",
    ausentismo_fecha_inicial: "",
    ausentismo_fecha_final: "",
    dias_incapacidad_inicial: 0,
    dias_prorroga: 0,
    dias_incapacidad: 0,
    cie10_codigo: "",
    cie10_diagnostico: "",
    // reporte legal
    testigos_presenciaron: "false",
    reportado_arl: "false",
    fecha_reporte_arl: "",
    furat_radicado: "",
    reportado_mintrabajo: "false",
    // investigación
    equipo_investigador: "",
    fecha_investigacion: "",
    ishikawa: ishikawaLIP(),
    causa_actos_inseguros: "",
    causa_condiciones_inseguras: "",
    causa_factores_personales: "",
    causa_factores_trabajo: "",
    observaciones_investigadores: "",
    // retroalimentación
    divulgacion_leccion: "",
    charla_seguridad: "",
    retroalimentacion: "",
    // firmas + cierre
    firmas: firmasVacias(),
    estado: "reportado",
    fecha_cierre: "",
  } as Record<string, any>
}

const labelOf = (o: [string, string][], v: any) => o.find(([k]) => k === String(v))?.[1] ?? (v ?? "")

async function loadLogo(): Promise<string | null> {
  try {
    const r = await fetch("/lip-logo.png")
    const b = await r.blob()
    return await new Promise((res) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result as string)
      fr.onerror = () => res(null)
      fr.readAsDataURL(b)
    })
  } catch {
    return null
  }
}

export function InvestigacionAT({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [tab, setTab] = useState("registrar")
  const [form, setForm] = useState<Record<string, any>>(() => vacio(empresaId))
  const [acciones, setAcciones] = useState<Record<string, any>[]>([vacioAccion()])
  const [testigos, setTestigos] = useState<Record<string, any>[]>([vacioTestigo()])
  const [rows, setRows] = useState<IncidenteRow[]>([])
  const [saving, setSaving] = useState(false)
  const [pdfId, setPdfId] = useState<number | "form" | null>(null)
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))
  const setAcc = (i: number, k: string, v: any) => setAcciones((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const setTes = (i: number, k: string, v: any) => setTestigos((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const setFirma = (rol: string, k: string, v: any) =>
    setForm((f) => ({ ...f, firmas: { ...(f.firmas || {}), [rol]: { ...(f.firmas?.[rol] || {}), [k]: v } } }))

  async function cargar() {
    setRows(await listIncidentes(empresaId))
  }
  useEffect(() => {
    cargar()
    // al cambiar de proyecto, prellenar el centro de trabajo si aún es un form nuevo
    setForm((f) => {
      const c = (empresaId && CENTROS[empresaId]) || null
      if (c && !f.trabajador) return { ...f, centro_trabajo: c.nombre, centro_direccion: c.direccion, centro_municipio: c.municipio }
      return f
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function guardar() {
    setSaving(true)
    const payload: Record<string, any> = { ...form }
    BOOL_KEYS.forEach((k) => {
      payload[k] = payload[k] === "true"
    })
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null
    })
    const accs = acciones.map((a) => {
      const c = { ...a }
      Object.keys(c).forEach((k) => {
        if (c[k] === "") c[k] = null
      })
      return c
    })
    const tess = testigos.filter((t) => (t.nombre || "").trim() || (t.documento || "").trim())
    const res = await saveIncidente(
      payload as Partial<IncidenteRow>,
      accs as Partial<IncidenteAccionRow>[],
      empresaId,
      tess as Partial<IncidenteTestigoRow>[],
    )
    setSaving(false)
    if (res.success) {
      toast({ title: "Investigación guardada (SST-FOR-21)" })
      setForm(vacio(empresaId))
      setAcciones([vacioAccion()])
      setTestigos([vacioTestigo()])
      await cargar()
      setTab("historial")
    } else {
      toast({ title: "Error al guardar", description: res.message ?? "Intenta de nuevo." })
    }
  }

  // ---- PDF calcado del formato LIP ----
  async function generarPDF(data: Record<string, any>, accs: any[], tess: any[]) {
    const { default: jsPDF } = await import("jspdf")
    const autoTable = (await import("jspdf-autotable")).default
    const doc = new jsPDF({ unit: "pt", format: "letter" })
    const MW = doc.internal.pageSize.getWidth()
    const navy: [number, number, number] = [13, 59, 110]
    const b = (v: any) => (v === true || v === "true" ? "SÍ" : v === false || v === "false" ? "NO" : v ?? "")
    const logo = await loadLogo()
    if (logo) { try { doc.addImage(logo, "PNG", 40, 28, 96, 30) } catch {} }
    doc.setFontSize(11).setFont("helvetica", "bold").setTextColor(...navy)
    doc.text("FORMATO DE INVESTIGACIÓN DE ACCIDENTE / INCIDENTE LABORAL", MW / 2, 40, { align: "center" })
    doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(90)
    doc.text("Seguridad y Salud en el Trabajo · Código: SST-FOR-21 · Res. 1401/2007", MW / 2, 54, { align: "center" })
    doc.text(EMPLEADOR_LIP.razon_social + " · NIT " + EMPLEADOR_LIP.nit, MW - 40, 34, { align: "right" })

    const sec = (title: string, body: any[][]) =>
      autoTable(doc, {
        startY: (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 68,
        head: [[{ content: title, colSpan: 2 }]],
        body,
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 2, textColor: 20 },
        headStyles: { fillColor: navy, textColor: 255, fontStyle: "bold", fontSize: 8 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 150 } },
      })

    sec("1. IDENTIFICACIÓN DEL EMPLEADOR / CONTRATANTE", [
      ["Razón social", EMPLEADOR_LIP.razon_social],
      ["Tipo id / NIT", `${EMPLEADOR_LIP.tipo_id} · ${EMPLEADOR_LIP.nit}`],
      ["Dirección", `${EMPLEADOR_LIP.direccion} · ${EMPLEADOR_LIP.municipio} (${EMPLEADOR_LIP.departamento})`],
      ["Correo", EMPLEADOR_LIP.email],
      ["Actividad económica", EMPLEADOR_LIP.actividad],
      ["Centro de trabajo", `${data.centro_trabajo ?? ""} · ${data.centro_direccion ?? ""} · ${data.centro_municipio ?? ""}`],
      ["Clasificación / Severidad", `${labelOf(TIPOS, data.tipo)} · ${labelOf(GRAVEDAD, data.gravedad)}`],
      ["Fecha de reporte", data.fecha_reporte ?? ""],
    ])
    sec("2. INFORMACIÓN DE LA PERSONA", [
      ["Nombres y apellidos", data.trabajador ?? ""],
      ["Documento", `${data.documento_tipo ?? ""} ${data.documento_numero ?? ""}`],
      ["Fecha nacimiento / Sexo", `${data.fecha_nacimiento ?? ""} · ${labelOf(SEXO, data.sexo)}`],
      ["EPS / ARL / AFP", `${data.eps ?? ""} · ${data.arl ?? ""} · ${data.afp ?? ""}`],
      ["Cargo / Ocupación", `${data.cargo ?? ""} · ${data.ocupacion_habitual ?? ""} (cód ${data.codigo_ocupacion ?? ""})`],
      ["Vinculación", labelOf(VINCULACION, data.tipo_vinculacion)],
      ["Ingreso / Antigüedad", `${data.fecha_ingreso ?? ""} · ${data.antiguedad_dias ?? 0} días`],
      ["Salario / Jornada habitual", `$${(Number(data.salario) || 0).toLocaleString("es-CO")} · ${labelOf(JORNADA_HAB, data.jornada_habitual)}`],
      ["Funciones asignadas", data.funciones_asignadas ?? ""],
      ["EPP y dotación", data.epp_portado ?? ""],
    ])
    sec("3. INFORMACIÓN SOBRE EL ACCIDENTE / INCIDENTE", [
      ["Fecha / Día / Hora", `${data.fecha_evento ?? ""} · ${labelOf(DIA_SEMANA, data.dia_semana)} · ${data.hora_evento ?? ""}`],
      ["Jornada / T. laborado previo", `${labelOf(JORNADA, data.jornada_evento)} · ${data.tiempo_laborado_previo ?? ""}`],
      ["¿Labor habitual? / Tipo", `${b(data.labor_habitual)} · ${labelOf(TIPO_ACC, data.tipo_accidente)}`],
      ["Ocurrió", `${labelOf(DENTRO_FUERA, data.dentro_fuera_empresa)} · ${data.departamento_evento ?? ""} ${data.municipio_evento ?? ""} (${labelOf(ZONA, data.zona_evento)})`],
      ["Área / Lugar", `${data.area_ocurrencia ?? ""} · ${data.lugar_ocurrencia ?? ""}`],
      ["Tipo de lesión", data.tipo_lesion ?? ""],
      ["Parte del cuerpo", data.parte_cuerpo ?? ""],
      ["Agente", data.agente_accidente ?? ""],
      ["Mecanismo / forma", data.mecanismo ?? ""],
      ["Descripción", data.descripcion ?? ""],
    ])
    sec("4. MANEJO Y AUSENTISMO", [
      ["¿Causó muerte?", b(data.causo_muerte)],
      ["Primeros auxilios / Remitido", `${b(data.primeros_auxilios)} · ${b(data.remitido_centro_salud)} ${data.centro_salud ? "(" + data.centro_salud + ")" : ""}`],
      ["Hospitalizado / Transporte", `${b(data.hospitalizado)} · ${b(data.requirio_transporte)}`],
      ["Ausentismo", `${labelOf(AUS_TIPO, data.ausentismo_tipo)} · ${data.ausentismo_fecha_inicial ?? ""} → ${data.ausentismo_fecha_final ?? ""}`],
      ["Días inicial / prórroga / total", `${data.dias_incapacidad_inicial ?? 0} · ${data.dias_prorroga ?? 0} · ${data.dias_incapacidad ?? 0}`],
      ["CIE-10", `${data.cie10_codigo ?? ""} ${data.cie10_diagnostico ?? ""}`],
      ["Reporte legal", `ARL: ${b(data.reportado_arl)} (${data.fecha_reporte_arl ?? ""}) · FURAT: ${data.furat_radicado ?? ""} · MinTrabajo: ${b(data.reportado_mintrabajo)}`],
    ])
    if (tess.length) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [["TESTIGO", "CÉDULA", "VERSIÓN"]],
        body: tess.map((t) => [t.nombre ?? "", t.documento ?? "", t.version ?? ""]),
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: navy, textColor: 255, fontSize: 8 },
      })
    }
    const ish = (data.ishikawa as IshikawaData) || null
    sec("5. ANÁLISIS DE CAUSAS (Ishikawa · causalidad)", [
      ["Efecto analizado", ish?.efecto ?? ""],
      ["Causas inmediatas – Actos inseguros", data.causa_actos_inseguros ?? ""],
      ["Causas inmediatas – Condiciones inseguras", data.causa_condiciones_inseguras ?? ""],
      ["Causas básicas – Factores personales", data.causa_factores_personales ?? ""],
      ["Causas básicas – Factores del trabajo", data.causa_factores_trabajo ?? ""],
      ["Observaciones investigadores", data.observaciones_investigadores ?? ""],
      ["Equipo investigador / Fecha", `${data.equipo_investigador ?? ""} · ${data.fecha_investigacion ?? ""}`],
    ])
    if (accs.length) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [["MEDIDA DE INTERVENCIÓN", "CONTROL", "RESP. EJEC.", "F. IMPL.", "VERIFICA", "ESTADO"]],
        body: accs.map((a) => [
          a.plan ?? "", labelOf(CONTROL, a.tipo_control), a.responsable_ejecucion ?? "",
          a.fecha_implementacion ?? "", a.responsable_verificacion ?? "", a.estado ?? "",
        ]),
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: navy, textColor: 255, fontSize: 7.5 },
      })
    }
    sec("6. RETROALIMENTACIÓN Y LECCIÓN APRENDIDA", [
      ["Divulgación / lección aprendida", data.divulgacion_leccion ?? ""],
      ["Charla de seguridad", data.charla_seguridad ?? ""],
      ["Retroalimentación", data.retroalimentacion ?? ""],
    ])
    const fr = data.firmas || {}
    const rolLab: [string, string][] = [
      ["jefe_inmediato", "Jefe inmediato / Coord. operación"],
      ["coordinador_sst", "Coordinador SST"],
      ["integrante_copasst", "Integrante COPASST"],
      ["responsable_sgsst", "Responsable SG-SST"],
      ["reviso", "Revisó"],
      ["cerro", "Cerró"],
      ["representante_legal", "Representante legal"],
    ]
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["ROL", "NOMBRE", "CARGO", "C.C."]],
      body: rolLab.map(([k, l]) => [l, fr[k]?.nombre ?? "", fr[k]?.cargo ?? "", fr[k]?.cc ?? ""]),
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: navy, textColor: 255, fontSize: 8 },
    })
    doc.save(`SST-FOR-21 investigacion ${(data.trabajador || "").trim() || data.fecha_evento || ""}.pdf`)
  }

  async function pdfDesdeHistorial(r: IncidenteRow) {
    setPdfId(r.id!)
    try {
      const [accs, tess] = await Promise.all([listAcciones(r.id!), listTestigos(r.id!)])
      await generarPDF(r as any, accs, tess)
    } catch (e: any) {
      toast({ title: "No se pudo generar el PDF", description: e?.message })
    } finally {
      setPdfId(null)
    }
  }

  const kpis = useMemo(() => {
    const c = (f: (r: IncidenteRow) => boolean) => rows.filter(f).length
    const inv = rows.filter((r) => r.tipo !== "incidente")
    const enPlazo = inv.filter(
      (r) =>
        r.fecha_investigacion &&
        (new Date(r.fecha_investigacion).getTime() - new Date(r.fecha_evento).getTime()) / 86400000 <= 15,
    ).length
    return {
      acc: c((r) => r.tipo === "accidente"),
      inc: c((r) => r.tipo === "incidente"),
      el: c((r) => r.tipo === "enfermedad_laboral"),
      graves: c((r) => r.gravedad === "grave"),
      mortales: c((r) => r.gravedad === "mortal"),
      dias: rows.reduce((s, r) => s + (Number(r.dias_incapacidad) || 0), 0),
      pct: inv.length ? Math.round((100 * enPlazo) / inv.length) : 0,
    }
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
          Investigación de Accidentes / Incidentes (SST-FOR-21)
        </h2>
        <Badge variant="outline">Formato original LIP · Res. 1401/2007 · investigación ≤ 15 días</Badge>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-7">
        <Kpi t="Accidentes" v={kpis.acc} />
        <Kpi t="Incidentes" v={kpis.inc} />
        <Kpi t="Enf. laborales" v={kpis.el} />
        <Kpi t="AT graves" v={kpis.graves} c={SST_TOKENS.warn} />
        <Kpi t="AT mortales" v={kpis.mortales} c={SST_TOKENS.bad} />
        <Kpi t="Días perdidos" v={kpis.dias} />
        <Kpi t="Investig. ≤15d" v={`${kpis.pct}%`} c={SST_TOKENS.ok} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="registrar">Registrar</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="registrar">
          <Card className="p-4 space-y-6">
            {/* Encabezado fijo LIP */}
            <div className="rounded-lg border p-3" style={{ background: SST_TOKENS.light }}>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/lip-logo.png" alt="LIP" className="h-8" />
                <div className="text-xs" style={{ color: SST_TOKENS.ink }}>
                  <div className="font-bold">{EMPLEADOR_LIP.razon_social}</div>
                  <div>NIT {EMPLEADOR_LIP.nit} · {EMPLEADOR_LIP.direccion}, {EMPLEADOR_LIP.municipio} · {EMPLEADOR_LIP.email}</div>
                </div>
                <Badge variant="outline" className="ml-auto">SST-FOR-21</Badge>
              </div>
            </div>

            <Sec n="1. Clasificación y centro de trabajo">
              <G3>
                <F l="Tipo (clasificación del evento)"><S v={form.tipo} on={(v) => set("tipo", v)} o={TIPOS} /></F>
                <F l="Severidad del evento"><S v={form.gravedad} on={(v) => set("gravedad", v)} o={GRAVEDAD} /></F>
                <F l="Fecha de reporte"><Input type="date" value={form.fecha_reporte} onChange={(e) => set("fecha_reporte", e.target.value)} /></F>
                <F l="Centro de trabajo"><Input value={form.centro_trabajo} onChange={(e) => set("centro_trabajo", e.target.value)} /></F>
                <F l="Dirección centro"><Input value={form.centro_direccion} onChange={(e) => set("centro_direccion", e.target.value)} /></F>
                <F l="Municipio centro"><Input value={form.centro_municipio} onChange={(e) => set("centro_municipio", e.target.value)} /></F>
              </G3>
            </Sec>

            <Sec n="2. Información de la persona">
              <G3>
                <F l="Nombres y apellidos completos"><Input value={form.trabajador} onChange={(e) => set("trabajador", e.target.value)} /></F>
                <F l="Tipo de documento"><S v={form.documento_tipo} on={(v) => set("documento_tipo", v)} o={DOC_TIPO} /></F>
                <F l="N° de documento"><Input value={form.documento_numero} onChange={(e) => set("documento_numero", e.target.value)} /></F>
                <F l="Fecha de nacimiento"><Input type="date" value={form.fecha_nacimiento} onChange={(e) => set("fecha_nacimiento", e.target.value)} /></F>
                <F l="Sexo"><S v={form.sexo} on={(v) => set("sexo", v)} o={SEXO} /></F>
                <F l="EPS"><Input value={form.eps} onChange={(e) => set("eps", e.target.value)} /></F>
                <F l="ARL"><Input value={form.arl} onChange={(e) => set("arl", e.target.value)} /></F>
                <F l="AFP"><Input value={form.afp} onChange={(e) => set("afp", e.target.value)} /></F>
                <F l="Cargo"><Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} /></F>
                <F l="Ocupación habitual"><Input value={form.ocupacion_habitual} onChange={(e) => set("ocupacion_habitual", e.target.value)} /></F>
                <F l="Código ocupación"><Input value={form.codigo_ocupacion} onChange={(e) => set("codigo_ocupacion", e.target.value)} /></F>
                <F l="Tipo de vinculación"><S v={form.tipo_vinculacion} on={(v) => set("tipo_vinculacion", v)} o={VINCULACION} /></F>
                <F l="Fecha de ingreso"><Input type="date" value={form.fecha_ingreso} onChange={(e) => set("fecha_ingreso", e.target.value)} /></F>
                <F l="Antigüedad (días)"><Input type="number" value={form.antiguedad_dias} onChange={(e) => set("antiguedad_dias", Number(e.target.value))} /></F>
                <F l="Salario / honorarios (mes)"><Input type="number" value={form.salario} onChange={(e) => set("salario", Number(e.target.value))} /></F>
                <F l="Jornada de trabajo habitual"><S v={form.jornada_habitual} on={(v) => set("jornada_habitual", v)} o={JORNADA_HAB} /></F>
              </G3>
              <F l="Funciones asignadas"><Textarea value={form.funciones_asignadas} onChange={(e) => set("funciones_asignadas", e.target.value)} /></F>
              <F l="EPP y dotación que portaba"><Input value={form.epp_portado} onChange={(e) => set("epp_portado", e.target.value)} /></F>
            </Sec>

            <Sec n="3. Información sobre el accidente / incidente">
              <G3>
                <F l="Fecha del evento"><Input type="date" value={form.fecha_evento} onChange={(e) => set("fecha_evento", e.target.value)} /></F>
                <F l="Día de la semana"><S v={form.dia_semana} on={(v) => set("dia_semana", v)} o={DIA_SEMANA} /></F>
                <F l="Hora (0–23) : minutos"><Input value={form.hora_evento} onChange={(e) => set("hora_evento", e.target.value)} placeholder="HH:MM" /></F>
                <F l="Tiempo laborado previo"><Input value={form.tiempo_laborado_previo} onChange={(e) => set("tiempo_laborado_previo", e.target.value)} placeholder="HH:MM" /></F>
                <F l="Jornada en que sucede"><S v={form.jornada_evento} on={(v) => set("jornada_evento", v)} o={JORNADA} /></F>
                <F l="¿Realizaba labor habitual?"><S v={form.labor_habitual} on={(v) => set("labor_habitual", v)} o={SN} /></F>
                <F l="Tipo de accidente"><S v={form.tipo_accidente} on={(v) => set("tipo_accidente", v)} o={TIPO_ACC} /></F>
                <F l="Se produjo"><S v={form.dentro_fuera_empresa} on={(v) => set("dentro_fuera_empresa", v)} o={DENTRO_FUERA} /></F>
                <F l="Departamento del accidente"><Input value={form.departamento_evento} onChange={(e) => set("departamento_evento", e.target.value)} /></F>
                <F l="Municipio del accidente"><Input value={form.municipio_evento} onChange={(e) => set("municipio_evento", e.target.value)} /></F>
                <F l="Zona"><S v={form.zona_evento} on={(v) => set("zona_evento", v)} o={ZONA} /></F>
                <F l="Área donde ocurrió"><Input value={form.area_ocurrencia} onChange={(e) => set("area_ocurrencia", e.target.value)} /></F>
                <F l="Lugar donde ocurrió"><S v={form.lugar_ocurrencia} on={(v) => set("lugar_ocurrencia", v)} o={LUGAR} /></F>
              </G3>
              <G2>
                <F l="Tipo de lesión"><S v={form.tipo_lesion} on={(v) => set("tipo_lesion", v)} o={LESION} /></F>
                <F l="Parte del cuerpo afectada"><S v={form.parte_cuerpo} on={(v) => set("parte_cuerpo", v)} o={PARTE} /></F>
                <F l="Agente del accidente"><S v={form.agente_accidente} on={(v) => set("agente_accidente", v)} o={AGENTE} /></F>
                <F l="Mecanismo o forma del accidente"><S v={form.mecanismo} on={(v) => set("mecanismo", v)} o={MECANISMO} /></F>
              </G2>
              <F l="Descripción del accidente / incidente"><Textarea rows={4} value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} /></F>
            </Sec>

            <Sec n="4. Testigos">
              {testigos.map((t, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-12 items-end border rounded p-2">
                  <div className="md:col-span-4"><F l="Nombre del testigo"><Input value={t.nombre} onChange={(e) => setTes(i, "nombre", e.target.value)} /></F></div>
                  <div className="md:col-span-2"><F l="Cédula"><Input value={t.documento} onChange={(e) => setTes(i, "documento", e.target.value)} /></F></div>
                  <div className="md:col-span-5"><F l="Versión del testigo"><Input value={t.version} onChange={(e) => setTes(i, "version", e.target.value)} /></F></div>
                  <div className="md:col-span-1">
                    {testigos.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setTestigos((x) => x.filter((_, j) => j !== i))}>Quitar</Button>
                    )}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setTestigos((x) => [...x, vacioTestigo()])}>+ Agregar testigo</Button>
            </Sec>

            <Sec n="5. Manejo del accidente y ausentismo">
              <G3>
                <F l="¿Causó la muerte?"><S v={form.causo_muerte} on={(v) => set("causo_muerte", v)} o={SN} /></F>
                <F l="¿Recibió primeros auxilios?"><S v={form.primeros_auxilios} on={(v) => set("primeros_auxilios", v)} o={SN} /></F>
                <F l="¿Remitido a centro de salud?"><S v={form.remitido_centro_salud} on={(v) => set("remitido_centro_salud", v)} o={SN} /></F>
                <F l="¿Cuál centro de salud?"><Input value={form.centro_salud} onChange={(e) => set("centro_salud", e.target.value)} /></F>
                <F l="¿Hospitalizado?"><S v={form.hospitalizado} on={(v) => set("hospitalizado", v)} o={SN} /></F>
                <F l="¿Requirió transporte?"><S v={form.requirio_transporte} on={(v) => set("requirio_transporte", v)} o={SN} /></F>
                <F l="Tipo de ausentismo"><S v={form.ausentismo_tipo} on={(v) => set("ausentismo_tipo", v)} o={AUS_TIPO} /></F>
                <F l="Fecha inicial"><Input type="date" value={form.ausentismo_fecha_inicial} onChange={(e) => set("ausentismo_fecha_inicial", e.target.value)} /></F>
                <F l="Fecha final"><Input type="date" value={form.ausentismo_fecha_final} onChange={(e) => set("ausentismo_fecha_final", e.target.value)} /></F>
                <F l="Días incapacidad inicial"><Input type="number" value={form.dias_incapacidad_inicial} onChange={(e) => set("dias_incapacidad_inicial", Number(e.target.value))} /></F>
                <F l="Días de prórroga"><Input type="number" value={form.dias_prorroga} onChange={(e) => set("dias_prorroga", Number(e.target.value))} /></F>
                <F l="Días de ausentismo total"><Input type="number" value={form.dias_incapacidad} onChange={(e) => set("dias_incapacidad", Number(e.target.value))} /></F>
                <F l="Código CIE-10"><Input value={form.cie10_codigo} onChange={(e) => set("cie10_codigo", e.target.value)} /></F>
                <F l="Diagnóstico CIE-10"><Input value={form.cie10_diagnostico} onChange={(e) => set("cie10_diagnostico", e.target.value)} /></F>
              </G3>
            </Sec>

            <Sec n="6. Reporte legal">
              <p className="text-xs p-2 rounded" style={{ background: "#FFF7E6", color: "#8a6d00" }}>
                AT grave o mortal: reportar a ARL/EPS y MinTrabajo dentro de 2 días hábiles.
              </p>
              <G3>
                <F l="¿Reportado a ARL?"><S v={form.reportado_arl} on={(v) => set("reportado_arl", v)} o={SN} /></F>
                <F l="Fecha reporte ARL"><Input type="date" value={form.fecha_reporte_arl} onChange={(e) => set("fecha_reporte_arl", e.target.value)} /></F>
                <F l="FURAT radicado"><Input value={form.furat_radicado} onChange={(e) => set("furat_radicado", e.target.value)} /></F>
                <F l="¿Reportado a MinTrabajo?"><S v={form.reportado_mintrabajo} on={(v) => set("reportado_mintrabajo", v)} o={SN} /></F>
              </G3>
            </Sec>

            <Sec n="7. Investigación — metodología y causas (≤ 15 días)">
              <F l="Equipo investigador">
                <Input value={form.equipo_investigador} onChange={(e) => set("equipo_investigador", e.target.value)} placeholder="Jefe inmediato, COPASST, resp. SST…" />
              </F>
              <div className="space-y-1">
                <label className="text-sm font-medium" style={{ color: SST_TOKENS.navy }}>
                  Metodología de investigación (espina de pescado · Ishikawa)
                </label>
                <EspinaPescado value={form.ishikawa as IshikawaData} onChange={(v) => set("ishikawa", v)} />
              </div>
              <CuadrosCausas
                value={{
                  actos_inseguros: form.causa_actos_inseguros ?? "",
                  condiciones_inseguras: form.causa_condiciones_inseguras ?? "",
                  factores_personales: form.causa_factores_personales ?? "",
                  factores_trabajo: form.causa_factores_trabajo ?? "",
                  observaciones: form.observaciones_investigadores ?? "",
                } as CuadrosCausasData}
                onChange={(patch) => {
                  if (patch.actos_inseguros !== undefined) set("causa_actos_inseguros", patch.actos_inseguros)
                  if (patch.condiciones_inseguras !== undefined) set("causa_condiciones_inseguras", patch.condiciones_inseguras)
                  if (patch.factores_personales !== undefined) set("causa_factores_personales", patch.factores_personales)
                  if (patch.factores_trabajo !== undefined) set("causa_factores_trabajo", patch.factores_trabajo)
                  if (patch.observaciones !== undefined) set("observaciones_investigadores", patch.observaciones)
                }}
              />
              <F l="Fecha de investigación"><Input type="date" value={form.fecha_investigacion} onChange={(e) => set("fecha_investigacion", e.target.value)} /></F>
            </Sec>

            <Sec n="8. Planes de acción (control Fuente / Medio / Individuo)">
              {acciones.map((a, i) => (
                <div key={i} className="border rounded p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium" style={{ color: SST_TOKENS.ink }}>Acción {i + 1}</span>
                    {acciones.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setAcciones((x) => x.filter((_, j) => j !== i))}>Quitar</Button>
                    )}
                  </div>
                  <F l="Medida de intervención necesaria"><Input value={a.plan} onChange={(e) => setAcc(i, "plan", e.target.value)} /></F>
                  <G3>
                    <F l="Tipo de control"><S v={a.tipo_control} on={(v) => setAcc(i, "tipo_control", v)} o={CONTROL} /></F>
                    <F l="Fecha implementación"><Input type="date" value={a.fecha_implementacion} onChange={(e) => setAcc(i, "fecha_implementacion", e.target.value)} /></F>
                    <F l="Responsable ejecución"><Input value={a.responsable_ejecucion} onChange={(e) => setAcc(i, "responsable_ejecucion", e.target.value)} /></F>
                    <F l="Fecha verificación"><Input type="date" value={a.fecha_verificacion} onChange={(e) => setAcc(i, "fecha_verificacion", e.target.value)} /></F>
                    <F l="Responsable verificación"><Input value={a.responsable_verificacion} onChange={(e) => setAcc(i, "responsable_verificacion", e.target.value)} /></F>
                    <F l="Estado">
                      <S v={a.estado} on={(v) => setAcc(i, "estado", v)} o={[["pendiente", "Pendiente"], ["implementado", "Implementado"], ["verificado", "Verificado"]]} />
                    </F>
                  </G3>
                  <F l="Observación"><Input value={a.observacion} onChange={(e) => setAcc(i, "observacion", e.target.value)} /></F>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setAcciones((x) => [...x, vacioAccion()])}>+ Agregar acción</Button>
            </Sec>

            <Sec n="9. Retroalimentación y lección aprendida">
              <F l="Divulgación del evento y lección aprendida"><Textarea value={form.divulgacion_leccion} onChange={(e) => set("divulgacion_leccion", e.target.value)} /></F>
              <G2>
                <F l="Charla de seguridad"><Input value={form.charla_seguridad} onChange={(e) => set("charla_seguridad", e.target.value)} /></F>
                <F l="Retroalimentación"><Input value={form.retroalimentacion} onChange={(e) => set("retroalimentacion", e.target.value)} /></F>
              </G2>
            </Sec>

            <Sec n="10. Firmas y responsables de revisión / cierre">
              <div className="grid gap-2 md:grid-cols-2">
                {[
                  ["jefe_inmediato", "Jefe inmediato / Coord. operación"],
                  ["coordinador_sst", "Coordinador SST"],
                  ["integrante_copasst", "Integrante del COPASST"],
                  ["responsable_sgsst", "Responsable SG-SST"],
                  ["reviso", "Revisó la investigación"],
                  ["cerro", "Cerró la investigación"],
                  ["representante_legal", "Representante legal"],
                ].map(([rol, lab]) => (
                  <div key={rol} className="border rounded p-2 space-y-1">
                    <p className="text-xs font-semibold" style={{ color: SST_TOKENS.navy }}>{lab}</p>
                    <div className="grid gap-2 md:grid-cols-3">
                      <Input placeholder="Nombre" value={form.firmas?.[rol]?.nombre ?? ""} onChange={(e) => setFirma(rol, "nombre", e.target.value)} />
                      <Input placeholder="Cargo" value={form.firmas?.[rol]?.cargo ?? ""} onChange={(e) => setFirma(rol, "cargo", e.target.value)} />
                      <Input placeholder="C.C." value={form.firmas?.[rol]?.cc ?? ""} onChange={(e) => setFirma(rol, "cc", e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
            </Sec>

            <G2>
              <F l="Estado del caso"><S v={form.estado} on={(v) => set("estado", v)} o={ESTADOS} /></F>
              <F l="Fecha de cierre"><Input type="date" value={form.fecha_cierre} onChange={(e) => set("fecha_cierre", e.target.value)} /></F>
            </G2>

            <div className="flex flex-wrap gap-2">
              <Button onClick={guardar} disabled={saving} style={{ background: SST_TOKENS.navy, color: "white" }}>
                {saving ? "Guardando…" : "Guardar investigación"}
              </Button>
              <Button variant="outline" onClick={() => generarPDF(form, acciones, testigos)}>
                <FileText className="mr-1 h-4 w-4" /> Vista previa PDF (SST-FOR-21)
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Trabajador</th>
                  <th className="p-2 text-left">Gravedad</th>
                  <th className="p-2 text-center">Días</th>
                  <th className="p-2 text-left">Investigación</th>
                  <th className="p-2 text-left">Estado</th>
                  <th className="p-2 text-center">PDF</th>
                  <th className="p-2 text-left w-64">Soportes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const dias = r.fecha_investigacion
                    ? Math.round((new Date(r.fecha_investigacion).getTime() - new Date(r.fecha_evento).getTime()) / 86400000)
                    : null
                  const ok = dias !== null && dias <= 15
                  return (
                    <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                      <td className="p-2">{r.fecha_evento}</td>
                      <td className="p-2 capitalize">{String(r.tipo).replace("_", " ")}</td>
                      <td className="p-2">{r.trabajador ?? r.cargo}</td>
                      <td className="p-2">
                        <Badge style={{ background: r.gravedad === "mortal" ? SST_TOKENS.bad : r.gravedad === "grave" ? SST_TOKENS.warn : SST_TOKENS.ok, color: "white" }}>
                          {r.gravedad}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">{r.dias_incapacidad ?? 0}</td>
                      <td className="p-2">
                        {dias === null ? (
                          <span className="text-muted-foreground">pendiente</span>
                        ) : (
                          <Badge style={{ background: ok ? SST_TOKENS.ok : SST_TOKENS.bad, color: "white" }}>{dias} días</Badge>
                        )}
                      </td>
                      <td className="p-2">
                        <S v={r.estado} small on={async (v) => { await updateIncidente(r.id!, { estado: v }); cargar() }} o={ESTADOS} />
                      </td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" title="Ver documento (PDF no editable)" disabled={pdfId === r.id} onClick={() => pdfDesdeHistorial(r)}>
                          {pdfId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} PDF
                        </Button>
                        {r.documento_editable_url && (
                          <a href={r.documento_editable_url} target="_blank" rel="noreferrer" title="Descargar original editable (Excel)" className="ml-1 inline-flex items-center text-[11px] text-muted-foreground hover:underline">
                            <FileText className="h-3.5 w-3.5" /> Excel
                          </a>
                        )}
                      </td>
                      <td className="p-2 align-top">
                        <SoportesDocumentales
                          norma="SST 0312"
                          modulo="Investigación AT"
                          referenciaTipo="incidente"
                          referenciaId={r.id!}
                          referenciaDesc={`${String(r.tipo)} - ${r.trabajador ?? r.cargo ?? ""}`}
                          empresaId={empresaId}
                        />
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">Sin registros aún.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Kpi({ t, v, c }: { t: string; v: any; c?: string }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold" style={{ color: c ?? SST_TOKENS.navy }}>{v}</div>
      <div className="text-xs text-muted-foreground">{t}</div>
    </Card>
  )
}
function Sec({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold" style={{ color: SST_TOKENS.navy }}>{n}</h3>
      {children}
    </section>
  )
}
function G3({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-3">{children}</div>
}
function G2({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>
}
function F({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs" style={{ color: SST_TOKENS.ink }}>{l}</label>
      {children}
    </div>
  )
}
function S({ v, on, o, small }: { v: string; on: (v: string) => void; o: [string, string][]; small?: boolean }) {
  return (
    <Select value={v} onValueChange={on}>
      <SelectTrigger className={small ? "h-8" : ""}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {o.map(([val, lab]) => (
          <SelectItem key={val} value={val}>{lab}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default InvestigacionAT
