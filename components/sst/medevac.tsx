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
  const [q, setQ] = useState("")
  const [fCargo, setFCargo] = useState(TODOS)
  const [fCentro, setFCentro] = useState(TODOS)
  const [fEps, setFEps] = useState(TODOS)
  const [fArl, setFArl] = useState(TODOS)
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

  // Directorio MEDEVAC completo (con los filtros aplicados) en PDF
  async function pdfDirectorio() {
    const { default: jsPDF } = await import("jspdf")
    const autoTable = (await import("jspdf-autotable")).default
    const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" })
    const navy: [number, number, number] = [13, 59, 110]
    encabezadoPDF(doc, await loadLogo(), `Directorio de emergencias médicas${resumenFiltros ? ` · ${resumenFiltros}` : " · todos"}`)
    autoTable(doc, {
      startY: 82,
      head: [["Colaborador", "Doc.", "Cargo", "Centro", "RH", "Alergias", "EPS/ARL", "Emergencia: avisar a", "Tel."]],
      body: filtered.map((r) => [
        r.nombres ?? "", r.documento ?? "", r.cargo ?? "", r.centro_trabajo ?? "", r.rh ?? "",
        r.alergias ?? "", `${r.eps ?? ""}/${r.arl ?? ""}`,
        `${r.contacto_nombre ?? ""} ${r.contacto_parentesco ? "(" + r.contacto_parentesco + ")" : ""}`, r.contacto_telefono ?? "",
      ]),
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: navy, textColor: 255, fontSize: 7.5 },
    })
    doc.save(`MEDEVAC directorio.pdf`)
  }

  // Opciones de los filtros: se arman con lo que realmente hay en los datos,
  // no con una lista fija, para que nunca ofrezcan un filtro que da cero.
  const opciones = useMemo(() => {
    const uniq = (campo: keyof MedevacRow) =>
      [...new Set(rows.map((r) => String(r[campo] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    return { cargos: uniq("cargo"), centros: uniq("centro_trabajo"), eps: uniq("eps"), arl: uniq("arl") }
  }, [rows])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (fCargo !== TODOS && String(r.cargo ?? "").trim() !== fCargo) return false
      if (fCentro !== TODOS && String(r.centro_trabajo ?? "").trim() !== fCentro) return false
      if (fEps !== TODOS && String(r.eps ?? "").trim() !== fEps) return false
      if (fArl !== TODOS && String(r.arl ?? "").trim() !== fArl) return false
      if (!t) return true
      return `${r.nombres} ${r.documento} ${r.cargo} ${r.centro_trabajo} ${r.rh} ${r.eps} ${r.arl} ${r.contacto_nombre}`
        .toLowerCase().includes(t)
    })
  }, [rows, q, fCargo, fCentro, fEps, fArl])

  const hayFiltro = q.trim() !== "" || [fCargo, fCentro, fEps, fArl].some((v) => v !== TODOS)
  const resumenFiltros = [
    fCentro !== TODOS ? fCentro : "",
    fCargo !== TODOS ? fCargo : "",
    fEps !== TODOS ? `EPS ${fEps}` : "",
    fArl !== TODOS ? `ARL ${fArl}` : "",
  ].filter(Boolean).join(" · ")

  function limpiarFiltros() {
    setQ(""); setFCargo(TODOS); setFCentro(TODOS); setFEps(TODOS); setFArl(TODOS)
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
          {/* Filtros. El buscador cubre nombre, documento y contacto; los cuatro
              selectores acotan por las dimensiones con las que SST realmente
              consulta el directorio en una emergencia. */}
          <Card className="mb-3 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[16rem] flex-1">
                <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Colaborador</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, cédula, contacto…" className="pl-8" />
                </div>
              </div>
              <div className="w-44">
                <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Cargo</label>
                <Sel v={fCargo} on={setFCargo} o={[[TODOS, "Todos los cargos"], ...comoOpciones(opciones.cargos)]} />
              </div>
              <div className="w-44">
                <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Centro de trabajo</label>
                <Sel v={fCentro} on={setFCentro} o={[[TODOS, "Todos los centros"], ...comoOpciones(opciones.centros)]} />
              </div>
              <div className="w-40">
                <label className="text-xs" style={{ color: SST_TOKENS.ink }}>EPS</label>
                <Sel v={fEps} on={setFEps} o={[[TODOS, "Todas las EPS"], ...comoOpciones(opciones.eps)]} />
              </div>
              <div className="w-36">
                <label className="text-xs" style={{ color: SST_TOKENS.ink }}>ARL</label>
                <Sel v={fArl} on={setFArl} o={[[TODOS, "Todas las ARL"], ...comoOpciones(opciones.arl)]} />
              </div>
              {hayFiltro && (
                <Button variant="ghost" size="sm" onClick={limpiarFiltros} title="Quitar todos los filtros">
                  <X className="mr-1 h-4 w-4" /> Limpiar
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={pdfDirectorio} disabled={filtered.length === 0}>
                <FileDown className="mr-1 h-4 w-4" /> Exportar (PDF)
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {hayFiltro
                ? <>Mostrando <b>{filtered.length}</b> de {rows.length}. El PDF exporta exactamente lo que estás viendo.</>
                : <>{rows.length} colaboradores en el directorio.</>}
            </div>
          </Card>

          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Colaborador</th>
                  <th className="p-2 text-left">Cargo</th>
                  <th className="p-2 text-left">Centro</th>
                  <th className="p-2 text-center">RH</th>
                  <th className="p-2 text-left">Alergias</th>
                  <th className="p-2 text-left">EPS / ARL</th>
                  <th className="p-2 text-left">Contacto emergencia</th>
                  <th className="p-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    <td className="p-2">
                      <div className="font-medium flex items-center gap-1">
                        {r.nombres}
                        {r.requiere_revision && (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: SST_TOKENS.warn }} aria-label="Requiere revisión" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.documento_tipo} {r.documento} · {r.celular}</div>
                    </td>
                    <td className="p-2 text-xs">{r.cargo || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2 text-xs">{r.centro_trabajo || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2 text-center">
                      <Badge style={{ background: SST_TOKENS.bad, color: "white" }}>{r.rh || "—"}</Badge>
                    </td>
                    <td className="p-2 text-xs">{r.alergias}</td>
                    <td className="p-2 text-xs">{r.eps} / {r.arl}</td>
                    <td className="p-2 text-xs">
                      {r.contacto_nombre ? (
                        <>{r.contacto_nombre} ({r.contacto_parentesco}) · {r.contacto_telefono}</>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setCard(r)}>Ver</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => editar(r)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => eliminar(r.id)} title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">
                    {hayFiltro ? "Ningún colaborador coincide con los filtros." : "Sin colaboradores registrados."}
                  </td></tr>
                )}
              </tbody>
            </table>
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
