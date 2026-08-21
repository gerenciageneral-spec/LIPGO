"use client"

// MEDEVAC — Plan de Emergencias Médicas (SST-FOR-33). Directorio de emergencias
// médicas por colaborador (ISO 45001 / Res. 0312).
//
// La llave de cada persona es su DOCUMENTO: es lo que enlaza esta ficha con su
// Perfil Sociodemográfico, con el head count y con lo que el trabajador
// diligencia desde el portal. Por eso guardar es un upsert por documento y no
// un insert: una persona no puede tener dos tarjetas de emergencia distintas.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Kpi, Sec, Row3, Field, Sel } from "@/components/sst/sst-form-ui"
import {
  listMedevac, saveMedevac, deleteMedevac, buscarColaboradorMedevac,
  resolverRevisionMedevac, getCoberturaMedevac,
  type CoberturaMedevac, type FilaCobertura,
} from "@/lib/sst-medevac-actions"
import type { MedevacRow } from "@/lib/sst-evidencia-types"
import { getPerfilPorDocumento, savePerfilSociodemografico } from "@/lib/sst-perfil-actions"
import type { PerfilSociodemograficoRow } from "@/lib/sst-evidencia-types"
import {
  RH_OPCIONES, DOCUMENTO_TIPOS, MESES, CENTROS_TRABAJO, EPS_OPCIONES,
  ARL_OPCIONES, PARENTESCO_OPCIONES, AFP_OPCIONES, SEXO_OPCIONES,
  ESCOLARIDAD_OPCIONES, ESTADO_CIVIL_OPCIONES, SI_NO, TIPO_VIVIENDA_OPCIONES,
  CARACTERISTICAS_VIVIENDA_OPCIONES, ZONA_OPCIONES, ESTRATO_OPCIONES,
  TRANSPORTE_OPCIONES, INGRESOS_OPCIONES, GRUPO_ETNICO_OPCIONES,
  ACTIVIDAD_FISICA_OPCIONES, FRECUENCIA_CONSUMO_OPCIONES, TURNO_OPCIONES,
  CENTRO_POR_EMPRESA, comoOpciones, edadDesdeFechaISO,
} from "@/lib/sst-datos-catalogos"
import { HeartPulse, FileText, Trash2, Search, FileDown, Pencil, X, AlertTriangle, Check, Users, Filter } from "lucide-react"

const EMPLEADOR_LIP = { razon: "LIP PROGRESSIVE INTEGRAL LOGISTICS SAS", nit: "901725963-8" }

// Radix Select no admite un item con valor vacío, así que el "sin filtro" usa
// este centinela en vez de "".
const TODOS = "__todos"

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

// Encabezado LIP + SST-FOR-33 en la parte superior del PDF
function encabezadoPDF(doc: any, logo: string | null, subtitulo?: string) {
  const MW = doc.internal.pageSize.getWidth()
  const navy: [number, number, number] = [13, 59, 110]
  if (logo) { try { doc.addImage(logo, "PNG", 40, 26, 92, 28) } catch {} }
  doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(...navy)
  doc.text("PLAN DE EMERGENCIAS MÉDICAS · MEDEVAC", MW / 2, 38, { align: "center" })
  doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(90)
  doc.text("Seguridad y Salud en el Trabajo · Código: SST-FOR-33 · ISO 45001 / Res. 0312", MW / 2, 52, { align: "center" })
  doc.text(`${EMPLEADOR_LIP.razon} · NIT ${EMPLEADOR_LIP.nit}`, MW - 40, 32, { align: "right" })
  if (subtitulo) { doc.setFontSize(9).setTextColor(...navy); doc.text(subtitulo, 40, 70) }
}

// Definicion unica de las columnas del directorio. De aqui salen el
// encabezado, la fila de filtros, las celdas y el PDF: si se agrega una
// columna, aparece en los cuatro lados a la vez y no se pueden desincronizar.
//
//   tipo "lista" -> desplegable con los valores que REALMENTE existen en los
//                   datos, para que ningun filtro pueda dar cero resultados.
//   tipo "texto" -> campo libre, sin distinguir mayusculas ni tildes.
type TipoFiltro = "texto" | "lista"
interface Columna {
  k: keyof MedevacRow
  l: string
  tipo: TipoFiltro
  min: string
  ph?: string
}
const COLUMNAS: Columna[] = [
  { k: "nombres",             l: "Colaborador",        tipo: "texto", min: "15rem", ph: "Nombre…" },
  { k: "estado_headcount",    l: "Estado",             tipo: "lista", min: "9rem"  },
  { k: "documento",           l: "Documento",          tipo: "texto", min: "9rem",  ph: "Cédula…" },
  { k: "documento_tipo",      l: "Tipo doc.",          tipo: "lista", min: "11rem" },
  { k: "cargo",               l: "Cargo",              tipo: "lista", min: "13rem" },
  { k: "centro_trabajo",      l: "Centro de trabajo",  tipo: "lista", min: "12rem" },
  { k: "celular",             l: "Celular",            tipo: "texto", min: "8rem",  ph: "Teléfono…" },
  { k: "rh",                  l: "RH",                 tipo: "lista", min: "6rem"  },
  { k: "alergias",            l: "Alergias",           tipo: "texto", min: "11rem", ph: "Alergia…" },
  { k: "eps",                 l: "EPS",                tipo: "lista", min: "10rem" },
  { k: "arl",                 l: "ARL",                tipo: "lista", min: "8rem"  },
  { k: "contacto_nombre",     l: "Contacto emergencia", tipo: "texto", min: "13rem", ph: "Contacto…" },
  { k: "contacto_telefono",   l: "Tel. contacto",      tipo: "texto", min: "8rem",  ph: "Teléfono…" },
  { k: "contacto_parentesco", l: "Parentesco",         tipo: "lista", min: "8rem"  },
  { k: "email",               l: "Correo",             tipo: "texto", min: "14rem", ph: "Correo…" },
  { k: "mes_cumple",          l: "Cumpleaños",         tipo: "lista", min: "8rem"  },
]

/** Texto comparable: sin mayusculas y sin tildes. Sirve para que buscar
 *  "Berrio" encuentre "Berrio" y "Berrio" con tilde por igual, que en una
 *  planta con apellidos como Berrio, Fandino o Penate importa. */
const comparable = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()

const celda = (r: MedevacRow, k: keyof MedevacRow) => String(r[k] ?? "").trim()

// Respuestas que significan "no tiene alergias". El campo es texto libre, asi
// que llegan de varias formas; sin esta lista, alguien que escribio "No"
// aparecia contado COMO alergico, que en una emergencia es justo al reves.
// Una ficha de alguien que ya no trabaja aqui no se borra -sigue siendo
// evidencia de lo que existia- pero tampoco puede leerse como vigente: en una
// emergencia se llamaria a un contacto que ya no corresponde.
const estaInactivo = (r: MedevacRow) => r.estado_headcount === "Inactivo"
const FONDO_INACTIVO = "#e9edf2"

const SIN_ALERGIA = new Set(["", "ninguna", "ninguno", "no", "n/a", "na", "-", "nada"])
const tieneAlergia = (r: MedevacRow) => !SIN_ALERGIA.has(comparable(r.alergias))

// Mes de hoy en Colombia, escrito como lo guardan los datos ("Agosto", no
// "agosto"): es lo que permite que al hacer clic en la tarjeta de cumpleanos
// el filtro de esa columna case exactamente.
function mesDeHoy(): string {
  const hoy = comparable(new Date().toLocaleDateString("es-CO", { month: "long", timeZone: "America/Bogota" }))
  return MESES.find(([v]) => comparable(v) === hoy)?.[0] ?? ""
}

// Alto exacto del encabezado, en pixeles. La fila de filtros se ancla justo
// debajo con este mismo valor: si se dejara al alto natural habria que
// adivinarlo y la fila quedaria montada sobre el encabezado o despegada.
const ALTO_ENCABEZADO = 34

const vacio = (empresaId?: number | null): Record<string, any> => ({
  id: undefined,
  centro_trabajo: (empresaId && CENTRO_POR_EMPRESA[empresaId]) || "",
  nombres: "", documento_tipo: "Cedula de ciudadanía", documento: "", cargo: "",
  celular: "", alergias: "Ninguna", rh: "O+", arl: "Sura", eps: "",
  contacto_nombre: "", contacto_telefono: "", contacto_parentesco: "", email: "", mes_cumple: "",
})

// Perfil Sociodemografico (SST-FOR-32) en blanco. Se captura desde aqui para
// poder crear el registro COMPLETO de una persona -ficha de emergencia y
// perfil- sin esperar a que el trabajador entre al portal a diligenciarlo.
const perfilVacio = (): Record<string, any> => ({
  fecha_nacimiento: "", sexo: "", pais_nacimiento: "Colombia", depto_nacimiento: "",
  municipio_residencia: "", grupo_etnico: "", nivel_escolaridad: "", estado_civil: "",
  cabeza_familia: "", num_hijos: "", personas_hogar: "", ingresos_familiares: "",
  tipo_vivienda: "", caracteristicas_vivienda: "", zona: "", direccion: "",
  transporte: "", estrato: "", consume_alcohol: "", actividad_fisica: "", fumador: "",
  afp: "", turno: "",
})

/** Lista de sugerencias para un `<input list=…>`: lo del catálogo más lo que ya
 *  esté en los datos, sin repetir. Permite escribir un valor nuevo. */
function sugerencias(catalogo: string[], rows: MedevacRow[], campo: keyof MedevacRow): string[] {
  const s = new Set(catalogo)
  for (const r of rows) {
    const v = String(r[campo] ?? "").trim()
    if (v) s.add(v)
  }
  return [...s].sort((a, b) => a.localeCompare(b))
}

export function Medevac({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [tab, setTab] = useState("directorio")
  const [rows, setRows] = useState<MedevacRow[]>([])
  const [cobertura, setCobertura] = useState<CoberturaMedevac | null>(null)
  // Un filtro por columna. Vive en un solo objeto -y no en una variable por
  // campo- para que agregar una columna a COLUMNAS no obligue a tocar el estado.
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  // Filtro aparte del de columnas: "tiene alguna alergia" no se puede expresar
  // como "el texto de la columna contiene X", porque lo que lo define es
  // justamente que NO sea una de las formas de decir "ninguna".
  const [soloAlergias, setSoloAlergias] = useState(false)
  const [form, setForm] = useState<Record<string, any>>(() => vacio(empresaId))
  const [perfil, setPerfil] = useState<Record<string, any>>(perfilVacio)
  const [conPerfil, setConPerfil] = useState(false)
  // Filtros propios de la pestana Cobertura. No comparte los del Directorio
  // porque filtran conjuntos distintos: alli son las fichas que existen, aqui
  // es el personal activo del head count, tenga ficha o no.
  const [cobQ, setCobQ] = useState("")
  const [cobCentro, setCobCentro] = useState(TODOS)
  const [cobCargo, setCobCargo] = useState(TODOS)
  const [cobEstado, setCobEstado] = useState("pendientes")
  const [saving, setSaving] = useState(false)
  const [card, setCard] = useState<MedevacRow | null>(null)
  const [buscando, setBuscando] = useState(false)
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))
  const setP = (k: string, v: any) => setPerfil((f) => ({ ...f, [k]: v }))
  const editando = !!form.id

  // Autorrelleno por N° de documento desde head count / Trabajadores (valida el proyecto del selector)
  async function autofillPorDocumento() {
    const doc = String(form.documento || "").trim()
    if (!doc) return
    setBuscando(true)
    const r = await buscarColaboradorMedevac(doc, empresaId)
    setBuscando(false)
    if (r.found && r.data) {
      const centro = CENTRO_POR_EMPRESA[r.data.idempresa] ?? (empresaId ? CENTRO_POR_EMPRESA[empresaId] : "") ?? ""
      // headcount guarda EPS/ARL como PDF de afiliación (URL), no como nombre:
      // solo tomamos texto útil (nombre/cargo/celular). EPS se confirma manual; ARL queda en el default.
      const esUrl = (v: string) => /^https?:\/\//i.test(String(v || ""))
      setForm((f) => ({
        ...f,
        nombres: r.data.nombres || f.nombres,
        cargo: r.data.cargo || f.cargo,
        celular: r.data.celular || f.celular,
        eps: !esUrl(r.data.eps) && r.data.eps ? r.data.eps : f.eps,
        arl: !esUrl(r.data.arl) && r.data.arl ? r.data.arl : f.arl,
        centro_trabajo: centro || f.centro_trabajo,
      }))
      cargarPerfilDe(doc)
      toast({ title: "Datos autocompletados", description: `${r.data.nombres} — verifica EPS y ARL` })
    } else {
      toast({ title: "No encontrado", description: r.message || "El documento no está en el head count del proyecto" })
    }
  }

  async function cargar() {
    const [lista, cob] = await Promise.all([listMedevac(empresaId), getCoberturaMedevac()])
    setRows(lista)
    setCobertura(cob)
  }
  useEffect(() => {
    cargar()
    setForm((f) => (!f.nombres && !f.id && empresaId && CENTRO_POR_EMPRESA[empresaId] ? { ...f, centro_trabajo: CENTRO_POR_EMPRESA[empresaId] } : f))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  /** Trae el perfil de esa persona, si ya lo tiene, para no volver a pedirlo. */
  async function cargarPerfilDe(documento: string) {
    const doc = String(documento || "").trim()
    if (!doc) return
    const pr = await getPerfilPorDocumento(doc)
    if (!pr) { setPerfil(perfilVacio()); setConPerfil(false); return }
    setPerfil({
      fecha_nacimiento: pr.fecha_nacimiento ?? "", sexo: pr.sexo ?? "",
      pais_nacimiento: pr.pais_nacimiento ?? "Colombia", depto_nacimiento: pr.depto_nacimiento ?? "",
      municipio_residencia: pr.municipio_residencia ?? "", grupo_etnico: pr.grupo_etnico ?? "",
      nivel_escolaridad: pr.nivel_escolaridad ?? "", estado_civil: pr.estado_civil ?? "",
      cabeza_familia: pr.cabeza_familia ?? "",
      num_hijos: pr.num_hijos == null ? "" : String(pr.num_hijos),
      personas_hogar: pr.personas_hogar == null ? "" : String(pr.personas_hogar),
      ingresos_familiares: pr.ingresos_familiares ?? "", tipo_vivienda: pr.tipo_vivienda ?? "",
      caracteristicas_vivienda: pr.caracteristicas_vivienda ?? "", zona: pr.zona ?? "",
      direccion: pr.direccion ?? "", transporte: pr.transporte ?? "", estrato: pr.estrato ?? "",
      consume_alcohol: pr.consume_alcohol ?? "", actividad_fisica: pr.actividad_fisica ?? "",
      fumador: pr.fumador ?? "", afp: pr.afp ?? "", turno: pr.turno ?? "",
    })
    setConPerfil(true)
  }

  function editar(r: MedevacRow) {
    cargarPerfilDe(r.documento ?? "")
    setForm({
      id: r.id,
      centro_trabajo: r.centro_trabajo ?? "", nombres: r.nombres ?? "",
      documento_tipo: r.documento_tipo ?? "Cedula de ciudadanía", documento: r.documento ?? "",
      cargo: r.cargo ?? "", celular: r.celular ?? "", alergias: r.alergias ?? "",
      rh: r.rh ?? "O+", arl: r.arl ?? "", eps: r.eps ?? "",
      contacto_nombre: r.contacto_nombre ?? "", contacto_telefono: r.contacto_telefono ?? "",
      contacto_parentesco: r.contacto_parentesco ?? "", email: r.email ?? "", mes_cumple: r.mes_cumple ?? "",
    })
    setTab("registrar")
  }

  async function guardar() {
    if (!String(form.documento || "").trim()) { toast({ title: "Falta el N° de documento", description: "Es la llave que enlaza al colaborador con su perfil y su head count." }); return }
    if (!String(form.nombres || "").trim()) { toast({ title: "Falta el nombre del colaborador" }); return }
    setSaving(true)
    const { id, ...datos } = form
    const res = await saveMedevac({ ...datos, idempresa: empresaId ?? undefined } as Partial<MedevacRow>, empresaId)
    if (!res.success) {
      setSaving(false)
      toast({ title: "Error al guardar", description: res.message })
      return
    }

    // El perfil se guarda DESPUES y solo si la ficha entro bien: las dos filas
    // se enlazan por el documento, y un perfil sin su ficha de emergencia seria
    // un registro suelto que nadie ve desde este modulo.
    let avisoPerfil = ""
    if (conPerfil) {
      const nombreCompleto = String(form.nombres ?? "").trim().split(/\s+/)
      const rp = await savePerfilSociodemografico(
        {
          ...perfil,
          documento: form.documento,
          documento_tipo: form.documento_tipo,
          // El head count guarda "Apellidos Nombres" en un solo campo; el censo
          // se lee ordenado por apellido, asi que se parte por las dos primeras
          // palabras. Es una aproximacion, no una regla exacta.
          apellidos: nombreCompleto.slice(0, 2).join(" ") || null,
          nombres: nombreCompleto.slice(2).join(" ") || null,
          cargo: form.cargo,
          centro_trabajo: form.centro_trabajo,
          eps: form.eps,
          arl: form.arl,
          estado: "activo",
          idempresa: empresaId ?? undefined,
        } as Partial<PerfilSociodemograficoRow>,
        empresaId,
      )
      if (!rp.success) avisoPerfil = ` La ficha se guardo, pero el perfil no: ${rp.message}`
    }
    setSaving(false)

    toast({
      title: editando ? "Ficha actualizada" : "Colaborador agregado al MEDEVAC",
      description: avisoPerfil || (conPerfil ? "Se guardaron la ficha de emergencia y el perfil sociodemografico." : undefined),
    })
    setForm(vacio(empresaId)); setPerfil(perfilVacio()); setConPerfil(false)
    cargar(); setTab("directorio")
  }

  async function eliminar(id?: number) {
    if (!id) return
    await deleteMedevac(id); cargar()
  }

  async function marcarRevisado(id?: number) {
    if (!id) return
    const r = await resolverRevisionMedevac(id)
    if (r.success) { toast({ title: "Marcado como corregido" }); cargar() }
    else toast({ title: "No se pudo marcar", description: r.message })
  }

  // Tarjeta MEDEVAC individual (PDF con logo + encabezado SST-FOR-33)
  async function pdfTarjeta(c: MedevacRow) {
    const { default: jsPDF } = await import("jspdf")
    const autoTable = (await import("jspdf-autotable")).default
    const doc = new jsPDF({ unit: "pt", format: "letter" })
    const navy: [number, number, number] = [13, 59, 110]
    encabezadoPDF(doc, await loadLogo(), `Tarjeta de emergencia médica · ${c.centro_trabajo ?? ""}`)
    autoTable(doc, {
      startY: 82,
      head: [[{ content: c.nombres ?? "", colSpan: 2 }]],
      body: [
        ["Documento", `${c.documento_tipo ?? ""} ${c.documento ?? ""}`],
        ["Cargo / Centro", `${c.cargo ?? ""} · ${c.centro_trabajo ?? ""}`],
        ["Celular", c.celular ?? ""],
        ["RH (grupo sanguíneo)", c.rh ?? ""],
        ["Alergias", c.alergias ?? ""],
        ["EPS", c.eps ?? ""],
        ["ARL", c.arl ?? ""],
        ["Mes de cumpleaños", c.mes_cumple ?? ""],
      ],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: navy, textColor: 255, fontSize: 11 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 170 } },
    })
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "EN CASO DE EMERGENCIA AVISAR A", colSpan: 2 }]],
      body: [
        ["Nombre", c.contacto_nombre ?? ""],
        ["Parentesco", c.contacto_parentesco ?? ""],
        ["Teléfono", c.contacto_telefono ?? ""],
        ["Correo", c.email ?? ""],
      ],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [176, 0, 32], textColor: 255, fontSize: 9 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 170 } },
    })
    doc.save(`MEDEVAC ${(c.nombres || "").trim()}.pdf`)
  }

  // Directorio MEDEVAC completo (con los filtros aplicados) en PDF.
  // Las columnas salen de COLUMNAS, las mismas que se ven en pantalla: el PDF
  // no puede mostrar algo distinto de lo que el usuario acaba de filtrar.
  async function pdfDirectorio() {
    const { default: jsPDF } = await import("jspdf")
    const autoTable = (await import("jspdf-autotable")).default
    const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" })
    const navy: [number, number, number] = [13, 59, 110]
    encabezadoPDF(doc, await loadLogo(), `Directorio de emergencias médicas${resumenFiltros ? ` · ${resumenFiltros}` : " · todos"}`)
    autoTable(doc, {
      startY: 82,
      head: [COLUMNAS.map((c) => c.l)],
      body: filtered.map((r) => COLUMNAS.map((c) => celda(r, c.k))),
      theme: "grid",
      styles: { fontSize: 6, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: navy, textColor: 255, fontSize: 6.5 },
    })
    doc.save(`MEDEVAC directorio.pdf`)
  }

  // Opciones de cada desplegable: se arman con lo que REALMENTE hay en los
  // datos, no con una lista fija, para que ningun filtro pueda dar cero.
  const opciones = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const c of COLUMNAS) {
      if (c.tipo !== "lista") continue
      m[c.k as string] = [...new Set(rows.map((r) => celda(r, c.k)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "es"))
    }
    return m
  }, [rows])

  const filtered = useMemo(() => {
    const activos = COLUMNAS
      .map((c) => ({ c, v: filtros[c.k as string] ?? "" }))
      .filter(({ c, v }) => (c.tipo === "lista" ? v && v !== TODOS : v.trim() !== ""))
    if (!activos.length && !soloAlergias) return rows
    return rows.filter((r) => {
      if (soloAlergias && !tieneAlergia(r)) return false
      return activos.every(({ c, v }) =>
        c.tipo === "lista"
          ? celda(r, c.k) === v
          : comparable(celda(r, c.k)).includes(comparable(v)),
      )
    })
  }, [rows, filtros, soloAlergias])

  const filtrosActivos = COLUMNAS.filter((c) => {
    const v = filtros[c.k as string] ?? ""
    return c.tipo === "lista" ? v && v !== TODOS : v.trim() !== ""
  })
  const hayFiltro = filtrosActivos.length > 0 || soloAlergias
  const resumenFiltros = [
    ...(soloAlergias ? ["Solo con alergias"] : []),
    ...filtrosActivos.map((c) => `${c.l}: ${filtros[c.k as string]}`),
  ].join(" · ")

  const setFiltro = (k: string, v: string) =>
    setFiltros((f) => {
      const n = { ...f }
      if (!v || v === TODOS) delete n[k]
      else n[k] = v
      return n
    })

  function limpiarFiltros() {
    setFiltros({})
    setSoloAlergias(false)
  }

  // Un desplegable de columna siempre debe incluir el valor que tiene puesto,
  // aunque ninguna fila lo use: si no, al filtrar por un mes en el que nadie
  // cumple, el desplegable se veria vacio y no habria como quitar el filtro.
  const opcionesDe = (k: string) => {
    const base = opciones[k] ?? []
    const sel = filtros[k]
    return sel && sel !== TODOS && !base.includes(sel) ? [sel, ...base] : base
  }

  // Las dos tarjetas que filtran. Alternan: un segundo clic quita el filtro.
  // Llevan al Directorio porque desde Cobertura o Por corregir no se veria el
  // efecto de lo que se acaba de pulsar.
  function alternarSoloAlergias() {
    setSoloAlergias((v) => !v)
    setTab("directorio")
  }

  function alternarCumpleDelMes() {
    const mes = mesDeHoy()
    if (!mes) return
    setFiltro("mes_cumple", filtros.mes_cumple === mes ? "" : mes)
    setTab("directorio")
  }

  const pendientes = useMemo(() => rows.filter((r) => r.requiere_revision), [rows])

  // --- Cobertura -----------------------------------------------------------
  const filasCobertura = cobertura?.filas ?? []

  const cobOpciones = useMemo(() => {
    const uniq = (f: (x: FilaCobertura) => string | null) =>
      [...new Set(filasCobertura.map((x) => String(f(x) ?? "").trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "es"))
    return { centros: uniq((x) => x.centroTrabajo), cargos: uniq((x) => x.cargo) }
  }, [filasCobertura])

  const cobFiltrada = useMemo(() => {
    const t = comparable(cobQ)
    return filasCobertura.filter((x) => {
      if (cobCentro !== TODOS && String(x.centroTrabajo ?? "").trim() !== cobCentro) return false
      if (cobCargo !== TODOS && String(x.cargo ?? "").trim() !== cobCargo) return false
      if (cobEstado === "pendientes" && x.medevacCompleto && x.perfilCompleto) return false
      if (cobEstado === "sin_medevac" && x.medevacCompleto) return false
      if (cobEstado === "sin_perfil" && x.perfilCompleto) return false
      if (cobEstado === "completos" && !(x.medevacCompleto && x.perfilCompleto)) return false
      if (t && !comparable(`${x.nombre} ${x.identificacion}`).includes(t)) return false
      return true
    })
  }, [filasCobertura, cobQ, cobCentro, cobCargo, cobEstado])

  // Los indicadores se calculan sobre lo FILTRADO: filtrar por CEDI FUNZA y que
  // los numeros siguieran mostrando el total de la empresa haria que no
  // cuadraran con la tabla que se esta viendo justo debajo.
  const cobKpis = useMemo(() => {
    const n = cobFiltrada.length
    return {
      n,
      conMedevac: cobFiltrada.filter((x) => x.tieneMedevac).length,
      medevacCompleto: cobFiltrada.filter((x) => x.medevacCompleto).length,
      conPerfil: cobFiltrada.filter((x) => x.tienePerfil).length,
      perfilCompleto: cobFiltrada.filter((x) => x.perfilCompleto).length,
    }
  }, [cobFiltrada])

  const hayFiltroCob = cobQ.trim() !== "" || cobCentro !== TODOS || cobCargo !== TODOS || cobEstado !== "pendientes"

  function limpiarFiltrosCobertura() {
    setCobQ(""); setCobCentro(TODOS); setCobCargo(TODOS); setCobEstado("pendientes")
  }

  const mesActual = mesDeHoy()
  const kpis = useMemo(() => {
    const base = hayFiltro ? filtered : rows
    const n = base.length
    const conRH = base.filter((r) => (r.rh ?? "").trim()).length
    const conContacto = base.filter((r) => (r.contacto_telefono ?? "").trim()).length
    // Mismos criterios que usan los filtros de las tarjetas: si la tarjeta
    // dijera 5 y al pulsarla quedaran 3 filas, el numero no seria creible.
    const conAlergia = base.filter(tieneAlergia).length
    const cumple = base.filter((r) => comparable(r.mes_cumple) === comparable(mesActual)).length
    return {
      n,
      rh: n ? Math.round((100 * conRH) / n) : 0,
      contacto: n ? Math.round((100 * conContacto) / n) : 0,
      alergia: conAlergia,
      cumple,
    }
  }, [rows, filtered, hayFiltro, mesActual])

  const sugCargos = sugerencias([], rows, "cargo")
  const sugCentros = sugerencias(CENTROS_TRABAJO, rows, "centro_trabajo")
  const sugEps = sugerencias(EPS_OPCIONES, rows, "eps")
  const sugArl = sugerencias(ARL_OPCIONES, rows, "arl")
  const sugParentesco = sugerencias(PARENTESCO_OPCIONES, rows, "contacto_parentesco")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: SST_TOKENS.navy }}>
          <HeartPulse className="h-5 w-5" /> MEDEVAC · Plan de Emergencias Médicas (SST-FOR-33)
        </h2>
        <Badge variant="outline">ISO 45001 · Res. 0312 — preparación y respuesta ante emergencias</Badge>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Kpi t={hayFiltro ? "Colaboradores (filtrados)" : "Colaboradores"} v={kpis.n} />
        <Kpi t="RH registrado" v={`${kpis.rh}%`} c={kpis.rh >= 95 ? SST_TOKENS.ok : SST_TOKENS.warn} />
        <Kpi t="Contacto emergencia" v={`${kpis.contacto}%`} c={kpis.contacto >= 95 ? SST_TOKENS.ok : SST_TOKENS.warn} />
        <KpiFiltro
          t="Con alergias"
          v={kpis.alergia}
          c={kpis.alergia ? SST_TOKENS.warn : SST_TOKENS.ok}
          activo={soloAlergias}
          onClick={alternarSoloAlergias}
          titulo={soloAlergias ? "Quitar el filtro de alergias" : "Ver solo a quienes tienen alguna alergia"}
        />
        <KpiFiltro
          t={mesActual ? `Cumpleaños de ${mesActual}` : "Cumpleaños del mes"}
          v={kpis.cumple}
          activo={filtros.mes_cumple === mesActual && !!mesActual}
          onClick={alternarCumpleDelMes}
          titulo={filtros.mes_cumple === mesActual ? "Quitar el filtro de cumpleaños" : `Ver solo a quienes cumplen en ${mesActual}`}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="directorio">Directorio</TabsTrigger>
          <TabsTrigger value="cobertura">Cobertura</TabsTrigger>
          <TabsTrigger value="pendientes">
            Por corregir
            {pendientes.length > 0 && (
              <span className="ml-1.5 rounded-full px-1.5 text-[10px] font-bold" style={{ background: SST_TOKENS.warn, color: "white" }}>
                {pendientes.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="registrar">{editando ? "Editar ficha" : "Agregar colaborador"}</TabsTrigger>
        </TabsList>

        <TabsContent value="directorio">
          <Card className="mb-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {hayFiltro
                  ? <>Mostrando <b>{filtered.length}</b> de {rows.length} · <span style={{ color: SST_TOKENS.navy }}>{resumenFiltros}</span></>
                  : <><b>{rows.length}</b> colaboradores. Cada columna tiene su propio filtro en la fila gris; se combinan entre si.</>}
              </div>
              <div className="flex items-center gap-2">
                {hayFiltro && (
                  <Button variant="ghost" size="sm" onClick={limpiarFiltros} title="Quitar todos los filtros">
                    <X className="mr-1 h-4 w-4" /> Limpiar filtros
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={pdfDirectorio} disabled={filtered.length === 0}>
                  <FileDown className="mr-1 h-4 w-4" /> Exportar (PDF)
                </Button>
              </div>
            </div>
          </Card>

          {/* La tabla muestra TODOS los campos de la ficha, asi que no cabe a lo
              ancho: se desplaza horizontalmente dentro de su propio contenedor.
              Para que el desplazamiento no haga perder el hilo, la columna del
              colaborador queda fija a la izquierda y la de acciones a la
              derecha; el encabezado y la fila de filtros quedan fijos arriba. */}
          <Card className="p-0">
            <div className="relative max-h-[70vh] overflow-auto">
              <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    {COLUMNAS.map((c, idx) => (
                      <th
                        key={String(c.k)}
                        className={`sticky top-0 whitespace-nowrap p-2 text-left text-xs font-semibold ${idx === 0 ? "left-0 z-30" : "z-20"}`}
                        style={{ background: SST_TOKENS.navy, color: "white", minWidth: c.min, height: ALTO_ENCABEZADO }}
                      >
                        {c.l}
                      </th>
                    ))}
                    <th
                      className="sticky right-0 top-0 z-30 p-2 text-center text-xs font-semibold"
                      style={{ background: SST_TOKENS.navy, color: "white", minWidth: "8rem", height: ALTO_ENCABEZADO }}
                    >
                      Acciones
                    </th>
                  </tr>
                  {/* Una fila de filtros alineada bajo su columna: se ve de
                      inmediato por que campo se esta filtrando. */}
                  <tr>
                    {COLUMNAS.map((c, idx) => (
                      <th
                        key={String(c.k)}
                        className={`sticky border-b p-1 ${idx === 0 ? "left-0 z-30" : "z-20"}`}
                        style={{ background: "#eef2f7", minWidth: c.min, top: ALTO_ENCABEZADO }}
                      >
                        {c.tipo === "lista" ? (
                          <Sel
                            small
                            v={filtros[c.k as string] ?? TODOS}
                            on={(v) => setFiltro(c.k as string, v)}
                            o={[[TODOS, "Todos"], ...comoOpciones(opcionesDe(c.k as string))]}
                          />
                        ) : (
                          <Input
                            className="h-8 bg-white text-xs"
                            value={filtros[c.k as string] ?? ""}
                            onChange={(e) => setFiltro(c.k as string, e.target.value)}
                            placeholder={c.ph ?? "Buscar…"}
                          />
                        )}
                      </th>
                    ))}
                    <th className="sticky right-0 z-30 border-b p-1 text-center" style={{ background: "#eef2f7", top: ALTO_ENCABEZADO }}>
                      {hayFiltro && (
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px]" onClick={limpiarFiltros}>
                          <X className="mr-1 h-3 w-3" /> Limpiar
                        </Button>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    // El fondo se repite en las celdas fijas: sin esto se
                    // verian transparentes y el contenido pasaria por debajo.
                    const inactivo = estaInactivo(r)
                    const bg = inactivo ? FONDO_INACTIVO : i % 2 ? "#f7fafc" : "#ffffff"
                    return (
                      <tr key={r.id} className={inactivo ? "text-muted-foreground" : ""}>
                        {COLUMNAS.map((c, idx) => (
                          <td
                            key={String(c.k)}
                            className={`border-b p-2 align-top text-xs ${idx === 0 ? "sticky left-0 z-10 font-medium" : ""}`}
                            style={{ background: bg, minWidth: c.min }}
                          >
                            {c.k === "nombres" ? (
                              <span className="flex items-start gap-1">
                                <span className="text-sm">{celda(r, "nombres") || "—"}</span>
                                {r.requiere_revision && (
                                  <AlertTriangle
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                    style={{ color: SST_TOKENS.warn }}
                                    aria-label="Requiere revisión"
                                  />
                                )}
                              </span>
                            ) : c.k === "estado_headcount" ? (
                              <EtiquetaEstado v={r.estado_headcount} />
                            ) : c.k === "rh" ? (
                              <Badge style={{ background: SST_TOKENS.bad, color: "white" }}>{celda(r, "rh") || "—"}</Badge>
                            ) : (
                              celda(r, c.k) || <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        ))}
                        <td className="sticky right-0 z-10 whitespace-nowrap border-b p-2 text-center" style={{ background: bg }}>
                          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setCard(r)}>Ver</Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => editar(r)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => eliminar(r.id)} title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNAS.length + 1} className="p-6 text-center text-muted-foreground">
                        {hayFiltro ? "Ningún colaborador coincide con los filtros." : "Sin colaboradores registrados."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Cobertura contra el head count: la pregunta de auditoría es "¿todos
            los trabajadores tienen plan de emergencia?", y se responde aquí. */}

        {/* Cobertura contra el head count: la pregunta de auditoría es "¿todos
            los trabajadores tienen plan de emergencia?", y se responde aquí.
            Parte del personal ACTIVO, tenga ficha o no: por eso puede listar
            gente que en el Directorio todavía no existe. */}
        <TabsContent value="cobertura">
          {!cobertura ? (
            <Card className="p-6 text-center text-muted-foreground">Cargando cobertura…</Card>
          ) : !cobertura.disponible ? (
            <Card className="p-6 text-sm text-muted-foreground">
              No se pudo calcular la cobertura. Verifica que la vista <code>vw_sst_datos_colaborador</code> exista
              (script <code>scripts/sig/44_medevac_perfil_enlace_y_carga.sql</code>).
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
                <Kpi t={hayFiltroCob ? "Activos (filtrados)" : "Activos en head count"} v={cobKpis.n} />
                <Kpi t="Con ficha MEDEVAC" v={cobKpis.conMedevac} />
                <Kpi
                  t="MEDEVAC completo"
                  v={cobKpis.medevacCompleto}
                  c={cobKpis.n > 0 && cobKpis.medevacCompleto === cobKpis.n ? SST_TOKENS.ok : SST_TOKENS.warn}
                />
                <Kpi t="Con Perfil Sociodem." v={cobKpis.conPerfil} />
                <Kpi
                  t="Perfil completo"
                  v={cobKpis.perfilCompleto}
                  c={cobKpis.n > 0 && cobKpis.perfilCompleto === cobKpis.n ? SST_TOKENS.ok : SST_TOKENS.warn}
                />
              </div>

              <Card className="p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[14rem] flex-1">
                    <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Colaborador</label>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input value={cobQ} onChange={(e) => setCobQ(e.target.value)} placeholder="Nombre o cédula…" className="pl-8" />
                    </div>
                  </div>
                  <div className="w-48">
                    <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Centro de trabajo</label>
                    <Sel v={cobCentro} on={setCobCentro} o={[[TODOS, "Todos los centros"], ...comoOpciones(cobOpciones.centros)]} />
                  </div>
                  <div className="w-48">
                    <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Cargo</label>
                    <Sel v={cobCargo} on={setCobCargo} o={[[TODOS, "Todos los cargos"], ...comoOpciones(cobOpciones.cargos)]} />
                  </div>
                  <div className="w-52">
                    <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Estado de los datos</label>
                    <Sel
                      v={cobEstado}
                      on={setCobEstado}
                      o={[
                        ["pendientes", "Con algo pendiente"],
                        ["sin_medevac", "Sin MEDEVAC completo"],
                        ["sin_perfil", "Sin Perfil completo"],
                        ["completos", "Solo los completos"],
                        ["todos", "Todos"],
                      ]}
                    />
                  </div>
                  {hayFiltroCob && (
                    <Button variant="ghost" size="sm" onClick={limpiarFiltrosCobertura} title="Volver al estado inicial">
                      <X className="mr-1 h-4 w-4" /> Limpiar
                    </Button>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <Users className="mr-1 inline h-3.5 w-3.5" />
                  Personal <b>activo</b> en el head count. El portal del trabajador le exige completar
                  sus datos cuando entra a pedir un anticipo, un permiso o un certificado.
                  {" "}Mostrando <b>{cobFiltrada.length}</b> de {filasCobertura.length}.
                </div>
              </Card>

              <Card className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                      <th className="p-2 text-left">Colaborador</th>
                      <th className="p-2 text-left">Documento</th>
                      <th className="p-2 text-left">Centro de trabajo</th>
                      <th className="p-2 text-left">Cargo</th>
                      <th className="p-2 text-center">MEDEVAC</th>
                      <th className="p-2 text-center">Perfil Sociodemográfico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobFiltrada.map((f, i) => (
                      <tr key={f.identificacion + i} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                        <td className="p-2">{f.nombre}</td>
                        <td className="p-2 text-xs text-muted-foreground">{f.identificacion}</td>
                        <td className="p-2 text-xs">{f.centroTrabajo || <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2 text-xs">{f.cargo || <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2 text-center"><SemaforoDatos completo={f.medevacCompleto} existe={f.tieneMedevac} /></td>
                        <td className="p-2 text-center"><SemaforoDatos completo={f.perfilCompleto} existe={f.tienePerfil} /></td>
                      </tr>
                    ))}
                    {cobFiltrada.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center" style={{ color: hayFiltroCob ? undefined : SST_TOKENS.ok }}>
                          {hayFiltroCob
                            ? "Nadie coincide con los filtros."
                            : "Toda la plantilla activa tiene su MEDEVAC y su Perfil completos."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pendientes">
          <Card className="p-0 overflow-x-auto">
            <div className="p-3 text-xs text-muted-foreground border-b">
              Fichas que entraron con algún dato que hay que corregir a mano. Al editarlas y guardar,
              o al marcarlas como corregidas, salen de esta lista.
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.warn, color: "white" }}>
                  <th className="p-2 text-left">Colaborador</th>
                  <th className="p-2 text-left">Qué hay que corregir</th>
                  <th className="p-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#fffaf0" : "white" }}>
                    <td className="p-2">
                      <div className="font-medium">{r.nombres}</div>
                      <div className="text-xs text-muted-foreground">{r.documento} · {r.centro_trabajo || "sin centro"}</div>
                    </td>
                    <td className="p-2 text-xs">{r.revision_nota}</td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => editar(r)}>
                        <Pencil className="mr-1 h-3 w-3" /> Corregir
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => marcarRevisado(r.id)} title="Ya está bien así">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {pendientes.length === 0 && (
                  <tr><td colSpan={3} className="p-6 text-center" style={{ color: SST_TOKENS.ok }}>
                    No hay fichas pendientes por corregir.
                  </td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="registrar">
          <Card className="p-4 space-y-6">
            {editando && (
              <div className="flex items-center justify-between rounded-md px-3 py-2 text-xs" style={{ background: SST_TOKENS.light }}>
                <span>Editando la ficha de <b>{form.nombres}</b>. El documento es la llave: si lo cambias, se creará una ficha nueva.</span>
                <Button variant="ghost" size="sm" onClick={() => { setForm(vacio(empresaId)); setPerfil(perfilVacio()); setConPerfil(false) }}>
                  <X className="mr-1 h-3.5 w-3.5" /> Cancelar edición
                </Button>
              </div>
            )}
            <Sec n="Colaborador">
              <p className="text-[11px] text-muted-foreground -mt-1">
                Digita el <b>N° de documento</b> y sal del campo (o pulsa Buscar): se autocompletan <b>nombre, cargo, centro y celular</b> desde el <b>head count / Trabajadores</b> del proyecto seleccionado. <b>EPS y ARL</b> confírmalas manual (en el head count están como PDF de afiliación, no como nombre). Si el documento ya existe en el MEDEVAC, <b>se actualiza esa ficha</b>: no se crea una segunda.
              </p>
              <Row3>
                <Field l="N° de documento">
                  <div className="flex gap-1">
                    <Input
                      value={form.documento}
                      onChange={(e) => set("documento", e.target.value)}
                      onBlur={autofillPorDocumento}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); autofillPorDocumento() } }}
                      placeholder="Cédula…"
                    />
                    <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={buscando} onClick={autofillPorDocumento}>
                      {buscando ? "…" : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </Field>
                <Field l="Tipo de documento"><Sel v={form.documento_tipo} on={(v) => set("documento_tipo", v)} o={DOCUMENTO_TIPOS} /></Field>
                <Field l="Apellidos y nombres"><Input value={form.nombres} onChange={(e) => set("nombres", e.target.value)} /></Field>
                <Field l="Cargo">
                  <Input list="medevac-cargos" value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
                  <datalist id="medevac-cargos">{sugCargos.map((v) => <option key={v} value={v} />)}</datalist>
                </Field>
                <Field l="Centro de trabajo">
                  <Input list="medevac-centros" value={form.centro_trabajo} onChange={(e) => set("centro_trabajo", e.target.value)} />
                  <datalist id="medevac-centros">{sugCentros.map((v) => <option key={v} value={v} />)}</datalist>
                </Field>
                <Field l="Teléfono celular"><Input value={form.celular} onChange={(e) => set("celular", e.target.value)} /></Field>
              </Row3>
            </Sec>
            <Sec n="Información médica">
              <Row3>
                <Field l="RH (grupo sanguíneo)"><Sel v={form.rh} on={(v) => set("rh", v)} o={RH_OPCIONES} /></Field>
                <Field l="Alergias"><Input value={form.alergias} onChange={(e) => set("alergias", e.target.value)} placeholder="Ninguna" /></Field>
                <Field l="EPS">
                  <Input list="medevac-eps" value={form.eps} onChange={(e) => set("eps", e.target.value)} />
                  <datalist id="medevac-eps">{sugEps.map((v) => <option key={v} value={v} />)}</datalist>
                </Field>
                <Field l="ARL">
                  <Input list="medevac-arl" value={form.arl} onChange={(e) => set("arl", e.target.value)} />
                  <datalist id="medevac-arl">{sugArl.map((v) => <option key={v} value={v} />)}</datalist>
                </Field>
              </Row3>
            </Sec>
            <Sec n="Contacto en caso de emergencia">
              <Row3>
                <Field l="Nombre del contacto"><Input value={form.contacto_nombre} onChange={(e) => set("contacto_nombre", e.target.value)} /></Field>
                <Field l="Teléfono del contacto"><Input value={form.contacto_telefono} onChange={(e) => set("contacto_telefono", e.target.value)} /></Field>
                <Field l="Parentesco">
                  <Input list="medevac-parentesco" value={form.contacto_parentesco} onChange={(e) => set("contacto_parentesco", e.target.value)} />
                  <datalist id="medevac-parentesco">{sugParentesco.map((v) => <option key={v} value={v} />)}</datalist>
                </Field>
                <Field l="Correo electrónico"><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
                <Field l="Mes que cumple años">
                  {/* Antes era texto libre y entraban "Sept", "septiembre" y
                      "Septiembre " como tres meses distintos, lo que rompía el
                      conteo de cumpleaños del mes. */}
                  <Sel v={form.mes_cumple || ""} on={(v) => set("mes_cumple", v)} o={MESES} />
                </Field>
              </Row3>
            </Sec>
            {/* Registro completo: la ficha de emergencia y el perfil
                sociodemografico son los dos formatos que el SG-SST exige de
                cada persona y comparten llave -el documento-. Capturarlos
                juntos evita depender de que el trabajador entre al portal. */}
            <div className="rounded-md border p-3" style={{ background: conPerfil ? SST_TOKENS.light : undefined }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: SST_TOKENS.navy }}>
                    Perfil Sociodemográfico (SST-FOR-32)
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Actívalo para dejar el <b>registro completo</b> de la persona en un solo paso.
                    Si lo dejas apagado, solo se guarda la ficha de emergencia y el trabajador
                    tendrá que completar su perfil desde el portal.
                  </p>
                </div>
                <Switch checked={conPerfil} onCheckedChange={setConPerfil} aria-label="Capturar el perfil sociodemográfico" />
              </div>

              {conPerfil && (
                <div className="mt-4 space-y-5">
                  <Sec n="Datos personales">
                    <Row3>
                      <Field l="Fecha de nacimiento">
                        <Input type="date" value={perfil.fecha_nacimiento} onChange={(e) => setP("fecha_nacimiento", e.target.value)} />
                      </Field>
                      <Field l="Edad">
                        {/* Solo lectura: se deriva de la fecha. Una edad escrita
                            a mano deja de ser cierta al año siguiente. */}
                        <Input readOnly value={edadDesdeFechaISO(perfil.fecha_nacimiento) ?? ""} placeholder="Se calcula sola" className="bg-muted" />
                      </Field>
                      <Field l="Sexo"><Sel v={perfil.sexo || ""} on={(v) => setP("sexo", v)} o={SEXO_OPCIONES} /></Field>
                      <Field l="País de nacimiento"><Input value={perfil.pais_nacimiento} onChange={(e) => setP("pais_nacimiento", e.target.value)} /></Field>
                      <Field l="Departamento de nacimiento"><Input value={perfil.depto_nacimiento} onChange={(e) => setP("depto_nacimiento", e.target.value)} /></Field>
                      <Field l="Grupo étnico"><Sel v={perfil.grupo_etnico || ""} on={(v) => setP("grupo_etnico", v)} o={GRUPO_ETNICO_OPCIONES} /></Field>
                      <Field l="Nivel de escolaridad"><Sel v={perfil.nivel_escolaridad || ""} on={(v) => setP("nivel_escolaridad", v)} o={ESCOLARIDAD_OPCIONES} /></Field>
                      <Field l="Turno"><Sel v={perfil.turno || ""} on={(v) => setP("turno", v)} o={TURNO_OPCIONES} /></Field>
                      <Field l="Fondo de pensiones (AFP)">
                        <Input list="medevac-afp" value={perfil.afp} onChange={(e) => setP("afp", e.target.value)} />
                        <datalist id="medevac-afp">{AFP_OPCIONES.map((v) => <option key={v} value={v} />)}</datalist>
                      </Field>
                    </Row3>
                  </Sec>

                  <Sec n="Familia">
                    <Row3>
                      <Field l="Estado civil"><Sel v={perfil.estado_civil || ""} on={(v) => setP("estado_civil", v)} o={ESTADO_CIVIL_OPCIONES} /></Field>
                      <Field l="Cabeza de familia"><Sel v={perfil.cabeza_familia || ""} on={(v) => setP("cabeza_familia", v)} o={SI_NO} /></Field>
                      <Field l="N° de hijos"><Input type="number" min={0} value={perfil.num_hijos} onChange={(e) => setP("num_hijos", e.target.value)} /></Field>
                      <Field l="Personas en el hogar"><Input type="number" min={1} value={perfil.personas_hogar} onChange={(e) => setP("personas_hogar", e.target.value)} /></Field>
                      <Field l="Ingresos del hogar"><Sel v={perfil.ingresos_familiares || ""} on={(v) => setP("ingresos_familiares", v)} o={INGRESOS_OPCIONES} /></Field>
                    </Row3>
                  </Sec>

                  <Sec n="Vivienda y desplazamiento">
                    <Row3>
                      <Field l="Tipo de vivienda"><Sel v={perfil.tipo_vivienda || ""} on={(v) => setP("tipo_vivienda", v)} o={TIPO_VIVIENDA_OPCIONES} /></Field>
                      <Field l="Tenencia de la vivienda"><Sel v={perfil.caracteristicas_vivienda || ""} on={(v) => setP("caracteristicas_vivienda", v)} o={CARACTERISTICAS_VIVIENDA_OPCIONES} /></Field>
                      <Field l="Zona"><Sel v={perfil.zona || ""} on={(v) => setP("zona", v)} o={ZONA_OPCIONES} /></Field>
                      <Field l="Estrato"><Sel v={perfil.estrato || ""} on={(v) => setP("estrato", v)} o={ESTRATO_OPCIONES} /></Field>
                      <Field l="Municipio de residencia"><Input value={perfil.municipio_residencia} onChange={(e) => setP("municipio_residencia", e.target.value)} /></Field>
                      <Field l="Dirección"><Input value={perfil.direccion} onChange={(e) => setP("direccion", e.target.value)} /></Field>
                      <Field l="Medio de transporte"><Sel v={perfil.transporte || ""} on={(v) => setP("transporte", v)} o={TRANSPORTE_OPCIONES} /></Field>
                    </Row3>
                  </Sec>

                  <Sec n="Hábitos y estilo de vida">
                    <Row3>
                      <Field l="Actividad física"><Sel v={perfil.actividad_fisica || ""} on={(v) => setP("actividad_fisica", v)} o={ACTIVIDAD_FISICA_OPCIONES} /></Field>
                      <Field l="Consumo de alcohol"><Sel v={perfil.consume_alcohol || ""} on={(v) => setP("consume_alcohol", v)} o={FRECUENCIA_CONSUMO_OPCIONES} /></Field>
                      <Field l="Fumador"><Sel v={perfil.fumador || ""} on={(v) => setP("fumador", v)} o={FRECUENCIA_CONSUMO_OPCIONES} /></Field>
                    </Row3>
                  </Sec>

                  <p className="text-[11px] text-muted-foreground">
                    La EPS, la ARL, el cargo y el centro de trabajo se toman de la ficha de arriba:
                    no se piden dos veces.
                  </p>
                </div>
              )}
            </div>

            <Button onClick={guardar} disabled={saving} style={{ background: SST_TOKENS.navy, color: "white" }}>
              {saving
                ? "Guardando…"
                : editando
                  ? conPerfil ? "Guardar ficha y perfil" : "Guardar cambios"
                  : conPerfil ? "Crear registro completo" : "Agregar al MEDEVAC"}
            </Button>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Tarjeta MEDEVAC imprimible */}
      <Dialog open={!!card} onOpenChange={(o) => !o && setCard(null)}>
        <DialogContent className="max-w-md print:shadow-none">
          {card && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2" style={{ color: SST_TOKENS.navy }}>
                  <HeartPulse className="h-5 w-5" style={{ color: SST_TOKENS.bad }} /> Tarjeta MEDEVAC
                </DialogTitle>
              </DialogHeader>
              <div id="medevac-card" className="space-y-3 rounded-lg border p-4">
                <div className="text-lg font-bold" style={{ color: SST_TOKENS.ink }}>{card.nombres}</div>
                <div className="text-xs text-muted-foreground">{card.documento_tipo} {card.documento} · {card.cargo} · {card.centro_trabajo}</div>
                <div className="grid grid-cols-2 gap-2">
                  <CardKV k="RH (sangre)" v={card.rh} big />
                  <CardKV k="Alergias" v={card.alergias} />
                  <CardKV k="EPS" v={card.eps} />
                  <CardKV k="ARL" v={card.arl} />
                  <CardKV k="Celular" v={card.celular} />
                </div>
                <div className="rounded-md p-2" style={{ background: SST_TOKENS.light }}>
                  <div className="text-[11px] font-semibold" style={{ color: SST_TOKENS.navy }}>EN CASO DE EMERGENCIA AVISAR A</div>
                  <div className="text-sm font-medium">{card.contacto_nombre} {card.contacto_parentesco ? `(${card.contacto_parentesco})` : ""}</div>
                  <div className="text-sm">{card.contacto_telefono}</div>
                </div>
              </div>
              <div className="flex justify-end print:hidden">
                <Button onClick={() => pdfTarjeta(card)}>
                  <FileText className="mr-1 h-4 w-4" /> Descargar tarjeta (PDF)
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Estado de un formato para una persona. Distingue tres casos porque no se
 *  resuelven igual: "Falta" es que no hay registro y hay que crearlo entero;
 *  "Incompleto" es que ya existe y solo le falta un dato. */
function SemaforoDatos({ completo, existe }: { completo: boolean; existe: boolean }) {
  if (completo) return <Badge style={{ background: SST_TOKENS.ok, color: "white" }}>Completo</Badge>
  if (existe) return <Badge style={{ background: SST_TOKENS.warn, color: "white" }}>Incompleto</Badge>
  return <Badge style={{ background: SST_TOKENS.bad, color: "white" }}>Falta</Badge>
}

/** Estado de la persona en el head count. "Sin head count" no es lo mismo que
 *  inactivo: significa que el documento no aparece alli -normalmente porque
 *  esta escrito distinto- y eso lo corrige Gestion Humana, no SST. */
function EtiquetaEstado({ v }: { v?: string | null }) {
  if (!v) return <span className="text-muted-foreground">—</span>
  if (v === "Activo") return <Badge style={{ background: SST_TOKENS.ok, color: "white" }}>Activo</Badge>
  if (v === "Inactivo") return <Badge style={{ background: "#64748b", color: "white" }}>Inactivo</Badge>
  return <Badge variant="outline" className="font-normal">Sin head count</Badge>
}

/** Tarjeta de indicador que ademas filtra la tabla al pulsarla. Se queda en
 *  este archivo -y no en `sst-form-ui`- porque el `Kpi` compartido lo usan los
 *  demas modulos de SST, donde las tarjetas no filtran nada. */
function KpiFiltro({
  t, v, c, activo, onClick, titulo,
}: { t: string; v: React.ReactNode; c?: string; activo: boolean; onClick: () => void; titulo: string }) {
  const color = c ?? SST_TOKENS.navy
  return (
    <Card
      role="button"
      tabIndex={0}
      title={titulo}
      aria-pressed={activo}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() }
      }}
      className="cursor-pointer p-4 transition hover:shadow-md focus:outline-none"
      style={activo ? { boxShadow: `0 0 0 2px ${color}`, background: SST_TOKENS.light } : undefined}
    >
      <div className="text-2xl font-bold" style={{ color }}>{v}</div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{t}</span>
        {activo
          ? <X className="h-3 w-3 shrink-0" style={{ color }} />
          : <Filter className="h-3 w-3 shrink-0 opacity-50" />}
      </div>
    </Card>
  )
}

function CardKV({ k, v, big }: { k: string; v: any; big?: boolean }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
      <div className={big ? "text-xl font-bold" : "text-sm font-medium"} style={{ color: big ? SST_TOKENS.bad : SST_TOKENS.ink }}>
        {v || "—"}
      </div>
    </div>
  )
}

export default Medevac
