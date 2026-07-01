"use client"

// IPEVR (GTC 45). Alimenta sst_ipevr. NP, NR, interpretacion y aceptabilidad
// los calcula Supabase (columnas generadas + trigger). Aqui solo se capturan ND, NE, NC.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Kpi, Sec, Row3, Field, Sel } from "@/components/sst/sst-form-ui"
import { SoportesDocumentales } from "@/components/sst/soportes-documentales"
import { listIpevr, saveIpevr } from "@/lib/sst-ipevr-actions"
import type { IpevrRow } from "@/lib/sst-evidencia-types"

const CLASIF: [string, string][] = [
  ["Biológico", "Biológico"],
  ["Físico", "Físico"],
  ["Químico", "Químico"],
  ["Biomecánico", "Biomecánico"],
  ["Psicosocial", "Psicosocial"],
  ["Condiciones de seguridad", "Condiciones de seguridad"],
  ["Fenómenos naturales", "Fenómenos naturales"],
]
const ND: [string, string][] = [
  ["0", "0 — Ninguna"],
  ["2", "2 — Baja"],
  ["6", "6 — Media"],
  ["10", "10 — Alta"],
]
const NE: [string, string][] = [
  ["1", "1 — Esporádica"],
  ["2", "2 — Ocasional"],
  ["3", "3 — Frecuente"],
  ["4", "4 — Continua"],
]
const NC: [string, string][] = [
  ["10", "10 — Leve"],
  ["25", "25 — Grave"],
  ["60", "60 — Muy grave"],
  ["100", "100 — Mortal"],
]

function nivelNR(nr: number) {
  if (nr >= 600) return { i: "I", c: SST_TOKENS.bad }
  if (nr >= 150) return { i: "II", c: SST_TOKENS.bad }
  if (nr >= 40) return { i: "III", c: SST_TOKENS.warn }
  return { i: "IV", c: SST_TOKENS.ok }
}
const vacio = () => ({
  proceso: "",
  zona: "",
  actividad: "",
  tarea: "",
  rutinaria: "true",
  clasificacion_peligro: "Físico",
  descripcion_peligro: "",
  especificacion: "",
  efectos_posibles: "",
  control_fuente: "",
  control_medio: "",
  control_individuo: "",
  nd: "6",
  ne: "3",
  nc: "25",
  n_expuestos: 1,
  peor_consecuencia: "",
  // medidas de intervención por jerarquía de controles
  medida_eliminacion: "",
  medida_sustitucion: "",
  control_ingenieria: "",
  control_administrativo: "",
  medida_epp: "",
  // gestión del cambio (seguimiento del plan)
  gc_plan_accion: "",
  gc_fecha_implementacion: "",
  gc_tipo_plan: "",
  gc_controles_propuestos: "",
  gc_controles_implementados: "",
  gc_pct_cumplimiento: 0,
})

export function MatrizIpevr({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [tab, setTab] = useState("registrar")
  const [form, setForm] = useState<Record<string, any>>(vacio())
  const [rows, setRows] = useState<IpevrRow[]>([])
  const [saving, setSaving] = useState(false)
  const [detalle, setDetalle] = useState<IpevrRow | null>(null)
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  const np = Number(form.nd) * Number(form.ne)
  const nr = np * Number(form.nc)
  const nivel = nivelNR(nr)

  async function cargar() {
    setRows(await listIpevr(empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function guardar() {
    if (!form.descripcion_peligro.trim()) {
      toast({ title: "Falta la descripción del peligro" })
      return
    }
    setSaving(true)
    const medidasResumen = [
      ["Eliminación", form.medida_eliminacion],
      ["Sustitución", form.medida_sustitucion],
      ["Ing.", form.control_ingenieria],
      ["Admin.", form.control_administrativo],
      ["EPP", form.medida_epp],
    ]
      .map(([l, v]) => (String(v || "").trim() ? `${l}: ${String(v).trim()}` : ""))
      .filter(Boolean)
      .join(" | ")
    const payload = {
      ...form,
      rutinaria: form.rutinaria === "true",
      nd: Number(form.nd),
      ne: Number(form.ne),
      nc: Number(form.nc),
      n_expuestos: Number(form.n_expuestos),
      gc_pct_cumplimiento: Number(form.gc_pct_cumplimiento) || 0,
      medidas_intervencion: medidasResumen || form.medidas_intervencion || "",
    }
    const res = await saveIpevr(payload as Partial<IpevrRow>, empresaId)
    setSaving(false)
    if (res.success) {
      toast({ title: "Peligro registrado" })
      setForm(vacio())
      cargar()
      setTab("matriz")
    } else toast({ title: "Error al guardar", description: res.message })
  }

  const kpis = useMemo(() => {
    const f = (i: string) => rows.filter((r) => r.interpretacion_nr === i).length
    return {
      total: rows.length,
      i: f("I"),
      ii: f("II"),
      iii: f("III"),
      iv: f("IV"),
      noAcept: rows.filter((r) => (r.aceptabilidad ?? "").toLowerCase().includes("no acept")).length,
    }
  }, [rows])

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
        Identificación de Peligros y Valoración de Riesgos (IPEVR · GTC 45)
      </h2>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-6">
        <Kpi t="Peligros" v={kpis.total} />
        <Kpi t="Nivel I" v={kpis.i} c={SST_TOKENS.bad} />
        <Kpi t="Nivel II" v={kpis.ii} c={SST_TOKENS.bad} />
        <Kpi t="Nivel III" v={kpis.iii} c={SST_TOKENS.warn} />
        <Kpi t="Nivel IV" v={kpis.iv} c={SST_TOKENS.ok} />
        <Kpi t="No aceptables" v={kpis.noAcept} c={SST_TOKENS.bad} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="registrar">Registrar peligro</TabsTrigger>
          <TabsTrigger value="matriz">Matriz</TabsTrigger>
        </TabsList>

        <TabsContent value="registrar">
          <Card className="p-4 space-y-6">
            <Sec n="Contexto">
              <Row3>
                <Field l="Proceso">
                  <Input value={form.proceso} onChange={(e) => set("proceso", e.target.value)} />
                </Field>
                <Field l="Zona / lugar">
                  <Input value={form.zona} onChange={(e) => set("zona", e.target.value)} />
                </Field>
                <Field l="Actividad">
                  <Input value={form.actividad} onChange={(e) => set("actividad", e.target.value)} />
                </Field>
                <Field l="Tarea">
                  <Input value={form.tarea} onChange={(e) => set("tarea", e.target.value)} />
                </Field>
                <Field l="¿Rutinaria?">
                  <Sel
                    v={form.rutinaria}
                    on={(v) => set("rutinaria", v)}
                    o={[
                      ["true", "Sí"],
                      ["false", "No"],
                    ]}
                  />
                </Field>
                <Field l="Clasificación">
                  <Sel v={form.clasificacion_peligro} on={(v) => set("clasificacion_peligro", v)} o={CLASIF} />
                </Field>
              </Row3>
              <Field l="Descripción del peligro (clasificación específica)">
                <Textarea value={form.descripcion_peligro} onChange={(e) => set("descripcion_peligro", e.target.value)} />
              </Field>
              <Field l="Especificación (situación / cómo se genera)">
                <Textarea value={form.especificacion} onChange={(e) => set("especificacion", e.target.value)} />
              </Field>
              <Field l="Efectos posibles">
                <Textarea value={form.efectos_posibles} onChange={(e) => set("efectos_posibles", e.target.value)} />
              </Field>
            </Sec>

            <Sec n="Controles existentes">
              <Row3>
                <Field l="Fuente">
                  <Input value={form.control_fuente} onChange={(e) => set("control_fuente", e.target.value)} />
                </Field>
                <Field l="Medio">
                  <Input value={form.control_medio} onChange={(e) => set("control_medio", e.target.value)} />
                </Field>
                <Field l="Individuo">
                  <Input value={form.control_individuo} onChange={(e) => set("control_individuo", e.target.value)} />
                </Field>
              </Row3>
            </Sec>

            <Sec n="Valoración del riesgo">
              <Row3>
                <Field l="Nivel de Deficiencia (ND)">
                  <Sel v={form.nd} on={(v) => set("nd", v)} o={ND} />
                </Field>
                <Field l="Nivel de Exposición (NE)">
                  <Sel v={form.ne} on={(v) => set("ne", v)} o={NE} />
                </Field>
                <Field l="Nivel de Consecuencia (NC)">
                  <Sel v={form.nc} on={(v) => set("nc", v)} o={NC} />
                </Field>
                <Field l="N.º expuestos">
                  <Input
                    type="number"
                    value={form.n_expuestos}
                    onChange={(e) => set("n_expuestos", Number(e.target.value))}
                  />
                </Field>
              </Row3>
              <div className="flex items-center gap-4 p-3 rounded flex-wrap" style={{ background: SST_TOKENS.light }}>
                <span className="text-sm">
                  NP = <b>{np}</b>
                </span>
                <span className="text-sm">
                  NR = <b>{nr}</b>
                </span>
                <Badge style={{ background: nivel.c, color: "white" }}>Nivel {nivel.i}</Badge>
                <span className="text-xs text-muted-foreground">
                  (NP, NR e interpretación los recalcula la base de datos)
                </span>
              </div>
              <Field l="Peor consecuencia">
                <Input value={form.peor_consecuencia} onChange={(e) => set("peor_consecuencia", e.target.value)} />
              </Field>
            </Sec>

            <Sec n="Medidas de intervención propuestas (jerarquía de controles)">
              <Row3>
                <Field l="Eliminación">
                  <Textarea rows={2} value={form.medida_eliminacion} onChange={(e) => set("medida_eliminacion", e.target.value)} />
                </Field>
                <Field l="Sustitución">
                  <Textarea rows={2} value={form.medida_sustitucion} onChange={(e) => set("medida_sustitucion", e.target.value)} />
                </Field>
                <Field l="Controles de ingeniería">
                  <Textarea rows={2} value={form.control_ingenieria} onChange={(e) => set("control_ingenieria", e.target.value)} />
                </Field>
                <Field l="Controles administrativos">
                  <Textarea rows={2} value={form.control_administrativo} onChange={(e) => set("control_administrativo", e.target.value)} />
                </Field>
                <Field l="Elementos de protección personal (EPP)">
                  <Textarea rows={2} value={form.medida_epp} onChange={(e) => set("medida_epp", e.target.value)} />
                </Field>
              </Row3>
            </Sec>

            <Sec n="Gestión del cambio (seguimiento del plan de acción)">
              <Row3>
                <Field l="Plan de acción">
                  <Input value={form.gc_plan_accion} onChange={(e) => set("gc_plan_accion", e.target.value)} />
                </Field>
                <Field l="Fecha de implementación">
                  <Input value={form.gc_fecha_implementacion} onChange={(e) => set("gc_fecha_implementacion", e.target.value)} placeholder="dd/mm/aaaa" />
                </Field>
                <Field l="Tipo de plan (jerarquización)">
                  <Input value={form.gc_tipo_plan} onChange={(e) => set("gc_tipo_plan", e.target.value)} />
                </Field>
                <Field l="Controles propuestos">
                  <Input value={form.gc_controles_propuestos} onChange={(e) => set("gc_controles_propuestos", e.target.value)} />
                </Field>
                <Field l="Controles implementados">
                  <Input value={form.gc_controles_implementados} onChange={(e) => set("gc_controles_implementados", e.target.value)} />
                </Field>
                <Field l="% de cumplimiento">
                  <Input type="number" value={form.gc_pct_cumplimiento} onChange={(e) => set("gc_pct_cumplimiento", Number(e.target.value))} />
                </Field>
              </Row3>
            </Sec>

            <Button onClick={guardar} disabled={saving} style={{ background: SST_TOKENS.navy, color: "white" }}>
              {saving ? "Guardando…" : "Registrar peligro"}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="matriz">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Proceso</th>
                  <th className="p-2 text-left">Peligro</th>
                  <th className="p-2 text-left">Clasif.</th>
                  <th className="p-2 text-center">NR</th>
                  <th className="p-2 text-center">Nivel</th>
                  <th className="p-2 text-left">Aceptabilidad</th>
                  <th className="p-2 text-center">% Cumpl.</th>
                  <th className="p-2 text-center">Detalle</th>
                  <th className="p-2 text-left w-64">Soportes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const n = nivelNR(Number(r.nr ?? 0))
                  return (
                    <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                      <td className="p-2">{r.proceso}</td>
                      <td className="p-2">{r.descripcion_peligro}</td>
                      <td className="p-2">{r.clasificacion_peligro}</td>
                      <td className="p-2 text-center font-semibold">{r.nr}</td>
                      <td className="p-2 text-center">
                        <Badge style={{ background: n.c, color: "white" }}>{r.interpretacion_nr ?? n.i}</Badge>
                      </td>
                      <td className="p-2 text-xs">{r.aceptabilidad}</td>
                      <td className="p-2 text-center">
                        {r.gc_pct_cumplimiento != null ? (
                          <Badge style={{ background: Number(r.gc_pct_cumplimiento) >= 100 ? SST_TOKENS.ok : Number(r.gc_pct_cumplimiento) >= 50 ? SST_TOKENS.warn : SST_TOKENS.bad, color: "white" }}>
                            {Number(r.gc_pct_cumplimiento)}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setDetalle(r)}>Ver</Button>
                      </td>
                      <td className="p-2 align-top">
                        <SoportesDocumentales
                          norma="SST 0312"
                          modulo="IPEVR"
                          referenciaTipo="ipevr"
                          referenciaId={r.id!}
                          referenciaDesc={`${r.proceso ?? ""} - ${r.descripcion_peligro ?? ""}`}
                          empresaId={empresaId}
                        />
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      Sin peligros registrados aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base" style={{ color: SST_TOKENS.navy }}>
                  {detalle.proceso} · {detalle.descripcion_peligro}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <DetSec t="Contexto" rows={[
                  ["Proceso", detalle.proceso],
                  ["Actividad", detalle.actividad],
                  ["Tarea", detalle.tarea],
                  ["Zona / lugar", detalle.zona],
                  ["¿Rutinaria?", detalle.rutinaria ? "Sí" : "No"],
                  ["N.º expuestos", detalle.n_expuestos],
                ]} />
                <DetSec t="Peligro" rows={[
                  ["Clasificación", detalle.clasificacion_peligro],
                  ["Descripción", detalle.descripcion_peligro],
                  ["Especificación", detalle.especificacion],
                  ["Efectos posibles", detalle.efectos_posibles],
                ]} />
                <DetSec t="Controles existentes" rows={[
                  ["Fuente", detalle.control_fuente],
                  ["Medio", detalle.control_medio],
                  ["Individuo", detalle.control_individuo],
                ]} />
                <DetSec t="Valoración del riesgo (GTC 45)" rows={[
                  ["ND · NE · NP", `${detalle.nd} · ${detalle.ne} · ${detalle.np ?? ""}`],
                  ["NC · NR", `${detalle.nc} · ${detalle.nr ?? ""}`],
                  ["Interpretación NR", detalle.interpretacion_nr],
                  ["Aceptabilidad", detalle.aceptabilidad],
                  ["Peor consecuencia", detalle.peor_consecuencia],
                ]} />
                <DetSec t="Medidas de intervención (jerarquía)" rows={[
                  ["Eliminación", detalle.medida_eliminacion],
                  ["Sustitución", detalle.medida_sustitucion],
                  ["Controles de ingeniería", detalle.control_ingenieria],
                  ["Controles administrativos", detalle.control_administrativo],
                  ["EPP", detalle.medida_epp],
                ]} />
                <DetSec t="Gestión del cambio" rows={[
                  ["Plan de acción", detalle.gc_plan_accion],
                  ["Fecha implementación", detalle.gc_fecha_implementacion],
                  ["Tipo de plan", detalle.gc_tipo_plan],
                  ["Controles propuestos", detalle.gc_controles_propuestos],
                  ["Controles implementados", detalle.gc_controles_implementados],
                  ["% de cumplimiento", detalle.gc_pct_cumplimiento != null ? `${detalle.gc_pct_cumplimiento}%` : ""],
                ]} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetSec({ t, rows }: { t: string; rows: [string, any][] }) {
  const visibles = rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
  if (!visibles.length) return null
  return (
    <div className="rounded-md border">
      <div className="px-2 py-1 text-xs font-bold text-white" style={{ background: SST_TOKENS.navy }}>{t}</div>
      <table className="w-full">
        <tbody>
          {visibles.map(([k, v], i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="px-2 py-1 align-top text-xs font-medium text-muted-foreground w-48">{k}</td>
              <td className="px-2 py-1 align-top text-xs">{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default MatrizIpevr
