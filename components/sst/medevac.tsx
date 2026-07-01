"use client"

// MEDEVAC — Plan de Emergencias Médicas (SST-FOR-33). Directorio de emergencias
// médicas por colaborador (ISO 45001 / Res. 0312). Filtra por el selector global.
// Alimenta sst_medevac.

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
import { listMedevac, saveMedevac, deleteMedevac } from "@/lib/sst-medevac-actions"
import type { MedevacRow } from "@/lib/sst-evidencia-types"
import { HeartPulse, FileText, Trash2, Search, FileDown } from "lucide-react"

const RH: [string, string][] = [
  ["O+", "O+"], ["O-", "O-"], ["A+", "A+"], ["A-", "A-"],
  ["B+", "B+"], ["B-", "B-"], ["AB+", "AB+"], ["AB-", "AB-"],
]
const DOC: [string, string][] = [
  ["Cedula de ciudadanía", "Cédula de ciudadanía"],
  ["Cedula de extranjería", "Cédula de extranjería"],
  ["Pasaporte", "Pasaporte"],
  ["PEP/PPT", "PEP / PPT"],
]
const CENTRO_POR_EMPRESA: Record<number, string> = {
  1: "H. INDUPAN", 2: "LA INSUPERABLE", 3: "CEDI", 4: "MOLINOS MEDELLIN", 100: "ADMINISTRATIVO",
}

const EMPLEADOR_LIP = { razon: "LIP PROGRESSIVE INTEGRAL LOGISTICS SAS", nit: "901725963-8" }

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
  centro_trabajo: (empresaId && CENTRO_POR_EMPRESA[empresaId]) || "",
  nombres: "", documento_tipo: "Cedula de ciudadanía", documento: "", cargo: "",
  celular: "", alergias: "Ninguna", rh: "O+", arl: "Sura", eps: "",
  contacto_nombre: "", contacto_telefono: "", contacto_parentesco: "", email: "", mes_cumple: "",
})

export function Medevac({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [tab, setTab] = useState("directorio")
  const [rows, setRows] = useState<MedevacRow[]>([])
  const [q, setQ] = useState("")
  const [form, setForm] = useState<Record<string, any>>(() => vacio(empresaId))
  const [saving, setSaving] = useState(false)
  const [card, setCard] = useState<MedevacRow | null>(null)
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function cargar() {
    setRows(await listMedevac(empresaId))
  }
  useEffect(() => {
    cargar()
    setForm((f) => (!f.nombres && empresaId && CENTRO_POR_EMPRESA[empresaId] ? { ...f, centro_trabajo: CENTRO_POR_EMPRESA[empresaId] } : f))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function guardar() {
    if (!form.nombres.trim()) { toast({ title: "Falta el nombre del colaborador" }); return }
    setSaving(true)
    const res = await saveMedevac({ ...form, idempresa: empresaId ?? undefined } as Partial<MedevacRow>, empresaId)
    setSaving(false)
    if (res.success) {
      toast({ title: "Colaborador agregado al MEDEVAC" })
      setForm(vacio(empresaId)); cargar(); setTab("directorio")
    } else toast({ title: "Error al guardar", description: res.message })
  }

  async function eliminar(id?: number) {
    if (!id) return
    await deleteMedevac(id); cargar()
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

  // Directorio MEDEVAC completo (filtrado) en PDF
  async function pdfDirectorio() {
    const { default: jsPDF } = await import("jspdf")
    const autoTable = (await import("jspdf-autotable")).default
    const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" })
    const navy: [number, number, number] = [13, 59, 110]
    encabezadoPDF(doc, await loadLogo(), `Directorio de emergencias médicas${empresaId ? "" : " · consolidado"}`)
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

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter((r) => `${r.nombres} ${r.documento} ${r.cargo} ${r.centro_trabajo} ${r.rh} ${r.eps}`.toLowerCase().includes(t))
  }, [rows, q])

  const mesActual = new Date().toLocaleDateString("es-CO", { month: "long" }).toLowerCase()
  const kpis = useMemo(() => {
    const n = rows.length
    const conRH = rows.filter((r) => (r.rh ?? "").trim()).length
    const conContacto = rows.filter((r) => (r.contacto_telefono ?? "").trim()).length
    const conAlergia = rows.filter((r) => (r.alergias ?? "").trim() && (r.alergias ?? "").toLowerCase() !== "ninguna").length
    const cumple = rows.filter((r) => (r.mes_cumple ?? "").toLowerCase().includes(mesActual)).length
    return {
      n,
      rh: n ? Math.round((100 * conRH) / n) : 0,
      contacto: n ? Math.round((100 * conContacto) / n) : 0,
      alergia: conAlergia,
      cumple,
    }
  }, [rows, mesActual])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: SST_TOKENS.navy }}>
          <HeartPulse className="h-5 w-5" /> MEDEVAC · Plan de Emergencias Médicas (SST-FOR-33)
        </h2>
        <Badge variant="outline">ISO 45001 · Res. 0312 — preparación y respuesta ante emergencias</Badge>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Kpi t="Colaboradores" v={kpis.n} />
        <Kpi t="RH registrado" v={`${kpis.rh}%`} c={kpis.rh >= 95 ? SST_TOKENS.ok : SST_TOKENS.warn} />
        <Kpi t="Contacto emergencia" v={`${kpis.contacto}%`} c={kpis.contacto >= 95 ? SST_TOKENS.ok : SST_TOKENS.warn} />
        <Kpi t="Con alergias" v={kpis.alergia} c={kpis.alergia ? SST_TOKENS.warn : SST_TOKENS.ok} />
        <Kpi t="Cumpleaños del mes" v={kpis.cumple} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="directorio">Directorio</TabsTrigger>
          <TabsTrigger value="registrar">Agregar colaborador</TabsTrigger>
        </TabsList>

        <TabsContent value="directorio">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, cédula, cargo, RH…" className="pl-8" />
            </div>
            <Button variant="outline" size="sm" onClick={pdfDirectorio} disabled={filtered.length === 0}>
              <FileDown className="mr-1 h-4 w-4" /> Exportar directorio (PDF)
            </Button>
            {!empresaId && <span className="text-xs text-muted-foreground">Consolidado (todos los proyectos). Usa el selector global para filtrar.</span>}
          </div>
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
                  <th className="p-2 text-center">Tarjeta</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    <td className="p-2">
                      <div className="font-medium">{r.nombres}</div>
                      <div className="text-xs text-muted-foreground">{r.documento_tipo} {r.documento} · {r.celular}</div>
                    </td>
                    <td className="p-2 text-xs">{r.cargo}</td>
                    <td className="p-2 text-xs">{r.centro_trabajo}</td>
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
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => eliminar(r.id)} title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sin colaboradores registrados.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="registrar">
          <Card className="p-4 space-y-6">
            <Sec n="Colaborador">
              <Row3>
                <Field l="Apellidos y nombres"><Input value={form.nombres} onChange={(e) => set("nombres", e.target.value)} /></Field>
                <Field l="Tipo de documento"><Sel v={form.documento_tipo} on={(v) => set("documento_tipo", v)} o={DOC} /></Field>
                <Field l="N° de documento"><Input value={form.documento} onChange={(e) => set("documento", e.target.value)} /></Field>
                <Field l="Cargo"><Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} /></Field>
                <Field l="Centro de trabajo"><Input value={form.centro_trabajo} onChange={(e) => set("centro_trabajo", e.target.value)} /></Field>
                <Field l="Teléfono celular"><Input value={form.celular} onChange={(e) => set("celular", e.target.value)} /></Field>
              </Row3>
            </Sec>
            <Sec n="Información médica">
              <Row3>
                <Field l="RH (grupo sanguíneo)"><Sel v={form.rh} on={(v) => set("rh", v)} o={RH} /></Field>
                <Field l="Alergias"><Input value={form.alergias} onChange={(e) => set("alergias", e.target.value)} /></Field>
                <Field l="EPS"><Input value={form.eps} onChange={(e) => set("eps", e.target.value)} /></Field>
                <Field l="ARL"><Input value={form.arl} onChange={(e) => set("arl", e.target.value)} /></Field>
              </Row3>
            </Sec>
            <Sec n="Contacto en caso de emergencia">
              <Row3>
                <Field l="Nombre del contacto"><Input value={form.contacto_nombre} onChange={(e) => set("contacto_nombre", e.target.value)} /></Field>
                <Field l="Teléfono del contacto"><Input value={form.contacto_telefono} onChange={(e) => set("contacto_telefono", e.target.value)} /></Field>
                <Field l="Parentesco"><Input value={form.contacto_parentesco} onChange={(e) => set("contacto_parentesco", e.target.value)} /></Field>
                <Field l="Correo electrónico"><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
                <Field l="Mes que cumple años"><Input value={form.mes_cumple} onChange={(e) => set("mes_cumple", e.target.value)} /></Field>
              </Row3>
            </Sec>
            <Button onClick={guardar} disabled={saving} style={{ background: SST_TOKENS.navy, color: "white" }}>
              {saving ? "Guardando…" : "Agregar al MEDEVAC"}
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
