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
  rutinaria: "true",
  clasificacion_peligro: "Físico",
  descripcion_peligro: "",
  efectos_posibles: "",
  control_fuente: "",
  control_medio: "",
  control_individuo: "",
  nd: "6",
  ne: "3",
  nc: "25",
  n_expuestos: 1,
  peor_consecuencia: "",
  medidas_intervencion: "",
})

export function MatrizIpevr({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [tab, setTab] = useState("registrar")
  const [form, setForm] = useState<Record<string, any>>(vacio())
  const [rows, setRows] = useState<IpevrRow[]>([])
  const [saving, setSaving] = useState(false)
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
    const payload = {
      ...form,
      rutinaria: form.rutinaria === "true",
      nd: Number(form.nd),
      ne: Number(form.ne),
      nc: Number(form.nc),
      n_expuestos: Number(form.n_expuestos),
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
              <Field l="Descripción del peligro">
                <Textarea value={form.descripcion_peligro} onChange={(e) => set("descripcion_peligro", e.target.value)} />
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
              <Field l="Medidas de intervención (jerarquía de controles)">
                <Textarea value={form.medidas_intervencion} onChange={(e) => set("medidas_intervencion", e.target.value)} />
              </Field>
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
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Sin peligros registrados aún.
                    </td>
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

export default MatrizIpevr
