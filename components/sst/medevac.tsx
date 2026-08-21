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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Kpi, Sec, Row3, Field, Sel } from "@/components/sst/sst-form-ui"
import {
  listMedevac, saveMedevac, deleteMedevac, buscarColaboradorMedevac,
  resolverRevisionMedevac, getCoberturaMedevac, type CoberturaMedevac,
} from "@/lib/sst-medevac-actions"
import type { MedevacRow } from "@/lib/sst-evidencia-types"
import {
  RH_OPCIONES, DOCUMENTO_TIPOS, MESES, CENTROS_TRABAJO, EPS_OPCIONES,
  ARL_OPCIONES, PARENTESCO_OPCIONES, comoOpciones,
} from "@/lib/sst-datos-catalogos"
import { HeartPulse, FileText, Trash2, Search, FileDown, Pencil, X, AlertTriangle, Check, Users } from "lucide-react"

const CENTRO_POR_EMPRESA: Record<number, string> = {
  1: "HARINERA INDUPAN", 2: "AVIMOL", 3: "CEDI FUNZA", 4: "CEDI MEDELLIN", 100: "ADMINISTRATIVO",
}

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
  const [form, setForm] = useState<Record<string, any>>(() => vacio(empresaId))
  const [saving, setSaving] = useState(false)
  const [card, setCard] = useState<MedevacRow | null>(null)
  const [buscando, setBuscando] = useState(false)
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))
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

  function editar(r: MedevacRow) {
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
    setSaving(false)
    if (res.success) {
      toast({ title: editando ? "Ficha actualizada" : "Colaborador agregado al MEDEVAC" })
      setForm(vacio(empresaId)); cargar(); setTab("directorio")
    } else toast({ title: "Error al guardar", description: res.message })
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
    if (!activos.length) return rows
    return rows.filter((r) =>
      activos.every(({ c, v }) =>
        c.tipo === "lista"
          ? celda(r, c.k) === v
          : comparable(celda(r, c.k)).includes(comparable(v)),
      ),
    )
  }, [rows, filtros])

  const filtrosActivos = COLUMNAS.filter((c) => {
    const v = filtros[c.k as string] ?? ""
    return c.tipo === "lista" ? v && v !== TODOS : v.trim() !== ""
  })
  const hayFiltro = filtrosActivos.length > 0
  const resumenFiltros = filtrosActivos
    .map((c) => `${c.l}: ${filtros[c.k as string]}`)
    .join(" · ")

  const setFiltro = (k: string, v: string) =>
    setFiltros((f) => {
      const n = { ...f }
      if (!v || v === TODOS) delete n[k]
      else n[k] = v
      return n
    })

  function limpiarFiltros() {
    setFiltros({})
  }

  const pendientes = useMemo(() => rows.filter((r) => r.requiere_revision), [rows])

  const mesActual = new Date().toLocaleDateString("es-CO", { month: "long", timeZone: "America/Bogota" }).toLowerCase()
  const kpis = useMemo(() => {
    const base = hayFiltro ? filtered : rows
    const n = base.length
    const conRH = base.filter((r) => (r.rh ?? "").trim()).length
    const conContacto = base.filter((r) => (r.contacto_telefono ?? "").trim()).length
    const conAlergia = base.filter((r) => (r.alergias ?? "").trim() && (r.alergias ?? "").toLowerCase() !== "ninguna").length
    const cumple = base.filter((r) => (r.mes_cumple ?? "").toLowerCase().includes(mesActual)).length
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
        <Kpi t="Con alergias" v={kpis.alergia} c={kpis.alergia ? SST_TOKENS.warn : SST_TOKENS.ok} />
        <Kpi t="Cumpleaños del mes" v={kpis.cumple} />
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
                            o={[[TODOS, "Todos"], ...comoOpciones(opciones[c.k as string] ?? [])]}
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
                    const bg = i % 2 ? "#f7fafc" : "#ffffff"
                    return (
                      <tr key={r.id}>
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
        <TabsContent value="cobertura">
          {!cobertura ? (
            <Card className="p-6 text-center text-muted-foreground">Cargando cobertura…</Card>
          ) : cobertura.activos === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">
              No se pudo calcular la cobertura. Verifica que la vista <code>vw_sst_datos_colaborador</code> exista
              (script <code>scripts/sig/44_medevac_perfil_enlace_y_carga.sql</code>).
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
                <Kpi t="Activos en head count" v={cobertura.activos} />
                <Kpi t="Con ficha MEDEVAC" v={cobertura.conMedevac} />
                <Kpi t="MEDEVAC completo" v={cobertura.medevacCompleto}
                  c={cobertura.medevacCompleto === cobertura.activos ? SST_TOKENS.ok : SST_TOKENS.warn} />
                <Kpi t="Con Perfil Sociodem." v={cobertura.conPerfil} />
                <Kpi t="Perfil completo" v={cobertura.perfilCompleto}
                  c={cobertura.perfilCompleto === cobertura.activos ? SST_TOKENS.ok : SST_TOKENS.warn} />
              </div>
              <Card className="p-0 overflow-x-auto">
                <div className="p-3 text-xs text-muted-foreground border-b">
                  <Users className="mr-1 inline h-3.5 w-3.5" />
                  Personal <b>activo</b> al que le falta completar algo. El portal del trabajador se lo exige
                  cuando entra a pedir un anticipo, un permiso o un certificado.
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                      <th className="p-2 text-left">Colaborador</th>
                      <th className="p-2 text-left">Documento</th>
                      <th className="p-2 text-center">MEDEVAC</th>
                      <th className="p-2 text-center">Perfil Sociodemográfico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobertura.faltantes.map((f, i) => (
                      <tr key={f.identificacion + i} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                        <td className="p-2">{f.nombre}</td>
                        <td className="p-2 text-xs text-muted-foreground">{f.identificacion}</td>
                        <td className="p-2 text-center">
                          <Badge style={{ background: f.tieneMedevac ? SST_TOKENS.ok : SST_TOKENS.bad, color: "white" }}>
                            {f.tieneMedevac ? "Completo" : "Falta"}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">
                          <Badge style={{ background: f.tienePerfil ? SST_TOKENS.ok : SST_TOKENS.bad, color: "white" }}>
                            {f.tienePerfil ? "Completo" : "Falta"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {cobertura.faltantes.length === 0 && (
                      <tr><td colSpan={4} className="p-6 text-center" style={{ color: SST_TOKENS.ok }}>
                        Toda la plantilla activa tiene su MEDEVAC y su Perfil completos.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Filas que entraron por carga masiva pero traen algo que no se pudo
            resolver solo: un teléfono incompleto, un correo que no es correo,
            un campo que llegó dañado desde el formulario original. */}
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
                <Button variant="ghost" size="sm" onClick={() => { setForm(vacio(empresaId)); }}>
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
            <Button onClick={guardar} disabled={saving} style={{ background: SST_TOKENS.navy, color: "white" }}>
              {saving ? "Guardando…" : editando ? "Guardar cambios" : "Agregar al MEDEVAC"}
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
