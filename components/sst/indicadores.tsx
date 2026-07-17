"use client"

// Indicadores minimos del SG-SST (Art. 30). Alimenta sst_indicadores (upsert por periodo+tipo).

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Row3, Field, Sel } from "@/components/sst/sst-form-ui"
import { listIndicadores, upsertIndicador } from "@/lib/sst-plan-actions"
import type { IndicadorRow } from "@/lib/sst-evidencia-types"

const TIPOS: [string, string][] = [
  ["frecuencia_at", "Frecuencia de accidentalidad"],
  ["severidad_at", "Severidad de accidentalidad"],
  ["mortalidad_at", "Mortalidad por AT"],
  ["prevalencia_el", "Prevalencia EL"],
  ["incidencia_el", "Incidencia EL"],
  ["ausentismo", "Ausentismo por causa médica"],
  ["investigaciones", "Cumplimiento de investigación de AT/incidentes"],
  ["rotacion_personal", "Índice de rotación de personal"],
  ["cobertura_epp", "Cobertura de EPP"],
  ["cumplimiento_capacitacion", "Cumplimiento de capacitación"],
  ["ejecucion_plan_anual", "Ejecución plan anual"],
  ["cumplimiento_estandares", "Cumplimiento de estándares"],
]
const labelTipo = (t: string) => TIPOS.find(([v]) => v === t)?.[1] ?? t
const vacio = () => ({
  periodo: new Date().toISOString().slice(0, 7),
  tipo: "frecuencia_at",
  numerador: 0,
  denominador: 0,
  valor: 0,
  meta: 0,
  unidad: "",
  observacion: "",
})

export function IndicadoresSST({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [rows, setRows] = useState<IndicadorRow[]>([])
  const [tab, setTab] = useState("tablero")
  const [form, setForm] = useState<Record<string, any>>(vacio())
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function cargar() {
    setRows(await listIndicadores(empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function guardar() {
    const payload = {
      ...form,
      numerador: Number(form.numerador),
      denominador: Number(form.denominador),
      valor: Number(form.valor),
      meta: Number(form.meta),
    }
    const res = await upsertIndicador(payload as Partial<IndicadorRow>, empresaId)
    if (res.success) {
      toast({ title: "Indicador guardado" })
      setForm(vacio())
      cargar()
      setTab("tablero")
    } else toast({ title: "Error", description: res.message })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
        Indicadores del SG-SST
      </h2>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tablero">Tablero</TabsTrigger>
          <TabsTrigger value="registrar">Registrar</TabsTrigger>
        </TabsList>

        <TabsContent value="tablero">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Periodo</th>
                  <th className="p-2 text-left">Indicador</th>
                  <th className="p-2 text-center">Valor</th>
                  <th className="p-2 text-center">Meta</th>
                  <th className="p-2 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const enMeta = r.meta == null || (r.valor ?? 0) <= (r.meta ?? 0)
                  return (
                    <tr key={r.id ?? i} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                      <td className="p-2">{r.periodo}</td>
                      <td className="p-2">{labelTipo(r.tipo)}</td>
                      <td className="p-2 text-center font-semibold">
                        {r.valor}
                        {r.unidad ? ` ${r.unidad}` : ""}
                      </td>
                      <td className="p-2 text-center">{r.meta}</td>
                      <td className="p-2 text-center">
                        <Badge style={{ background: enMeta ? SST_TOKENS.ok : SST_TOKENS.bad, color: "white" }}>
                          {enMeta ? "En meta" : "Fuera"}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      Sin indicadores registrados aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="registrar">
          <Card className="p-4 space-y-3">
            <Row3>
              <Field l="Periodo (AAAA-MM)">
                <Input value={form.periodo} onChange={(e) => set("periodo", e.target.value)} placeholder="2026-06" />
              </Field>
              <Field l="Indicador">
                <Sel v={form.tipo} on={(v) => set("tipo", v)} o={TIPOS} />
              </Field>
              <Field l="Unidad">
                <Input value={form.unidad} onChange={(e) => set("unidad", e.target.value)} placeholder="%, índice…" />
              </Field>
              <Field l="Numerador">
                <Input type="number" value={form.numerador} onChange={(e) => set("numerador", e.target.value)} />
              </Field>
              <Field l="Denominador">
                <Input type="number" value={form.denominador} onChange={(e) => set("denominador", e.target.value)} />
              </Field>
              <Field l="Valor del indicador">
                <Input type="number" value={form.valor} onChange={(e) => set("valor", e.target.value)} />
              </Field>
              <Field l="Meta">
                <Input type="number" value={form.meta} onChange={(e) => set("meta", e.target.value)} />
              </Field>
            </Row3>
            <Field l="Observación">
              <Textarea value={form.observacion} onChange={(e) => set("observacion", e.target.value)} />
            </Field>
            <Button onClick={guardar} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Guardar indicador
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default IndicadoresSST
