"use client"

// Entrega, uso y reposicion de EPP. Alimenta sst_entrega_epp (cubre estandar 4.2.6).

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
import { Kpi, Row3, Field, Sel } from "@/components/sst/sst-form-ui"
import { listEpp, saveEpp } from "@/lib/sst-epp-actions"
import type { EppRow } from "@/lib/sst-evidencia-types"

const PERSONA: [string, string][] = [
  ["propio", "Trabajador propio"],
  ["contratista", "Contratista"],
]
const MOTIVO: [string, string][] = [
  ["entrega_inicial", "Entrega inicial"],
  ["reposicion", "Reposición"],
]
const ELEMENTOS = [
  "Camisa reflectiva",
  "Pantalón",
  "Botas de seguridad",
  "Cofia / gorro",
  "Guantes",
  "Tapabocas",
  "Protección auditiva",
  "Gafas",
  "Arnés",
  "Chaleco",
]
const vacio = () => ({
  sede: "",
  trabajador: "",
  cedula: "",
  cargo: "",
  tipo_persona: "propio",
  elemento: "Botas de seguridad",
  cantidad: 1,
  motivo: "entrega_inicial",
  motivo_reposicion: "",
  observacion: "",
})

export function EntregaEpp({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [rows, setRows] = useState<EppRow[]>([])
  const [tab, setTab] = useState("registrar")
  const [form, setForm] = useState<Record<string, any>>(vacio())
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function cargar() {
    setRows(await listEpp(empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function guardar() {
    if (!form.trabajador.trim()) {
      toast({ title: "Falta el nombre del trabajador" })
      return
    }
    const res = await saveEpp({ ...form, cantidad: Number(form.cantidad) } as Partial<EppRow>, empresaId)
    if (res.success) {
      toast({ title: "Entrega registrada" })
      setForm(vacio())
      cargar()
      setTab("historial")
    } else toast({ title: "Error", description: res.message })
  }

  const k = useMemo(
    () => ({
      entregas: rows.length,
      trabajadores: new Set(rows.map((r) => r.cedula || r.trabajador)).size,
      reposiciones: rows.filter((r) => r.motivo === "reposicion").length,
    }),
    [rows],
  )

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
        Entrega y Reposición de EPP
      </h2>
      <div className="grid gap-3 grid-cols-3">
        <Kpi t="Entregas" v={k.entregas} />
        <Kpi t="Trabajadores" v={k.trabajadores} />
        <Kpi t="Reposiciones" v={k.reposiciones} c={SST_TOKENS.warn} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="registrar">Registrar</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="registrar">
          <Card className="p-4 space-y-3">
            <Row3>
              <Field l="Sede">
                <Input value={form.sede} onChange={(e) => set("sede", e.target.value)} />
              </Field>
              <Field l="Trabajador">
                <Input value={form.trabajador} onChange={(e) => set("trabajador", e.target.value)} />
              </Field>
              <Field l="Cédula">
                <Input value={form.cedula} onChange={(e) => set("cedula", e.target.value)} />
              </Field>
              <Field l="Cargo">
                <Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
              </Field>
              <Field l="Tipo de persona">
                <Sel v={form.tipo_persona} on={(v) => set("tipo_persona", v)} o={PERSONA} />
              </Field>
              <Field l="Elemento">
                <Sel v={form.elemento} on={(v) => set("elemento", v)} o={ELEMENTOS.map((e) => [e, e]) as [string, string][]} />
              </Field>
              <Field l="Cantidad">
                <Input type="number" value={form.cantidad} onChange={(e) => set("cantidad", e.target.value)} />
              </Field>
              <Field l="Motivo">
                <Sel v={form.motivo} on={(v) => set("motivo", v)} o={MOTIVO} />
              </Field>
              <Field l="Motivo de reposición">
                <Input
                  value={form.motivo_reposicion}
                  onChange={(e) => set("motivo_reposicion", e.target.value)}
                  placeholder="desgaste / daño / vencimiento"
                />
              </Field>
            </Row3>
            <Field l="Observación">
              <Textarea value={form.observacion} onChange={(e) => set("observacion", e.target.value)} />
            </Field>
            <p className="text-xs text-muted-foreground">
              La firma del trabajador puede capturarse en una segunda fase (columna <code>firma</code> en la tabla).
            </p>
            <Button onClick={guardar} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Registrar entrega
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Trabajador</th>
                  <th className="p-2 text-left">Elemento</th>
                  <th className="p-2 text-center">Cant.</th>
                  <th className="p-2 text-left">Motivo</th>
                  <th className="p-2 text-left">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    <td className="p-2">{r.fecha}</td>
                    <td className="p-2">{r.trabajador}</td>
                    <td className="p-2">{r.elemento}</td>
                    <td className="p-2 text-center">{r.cantidad}</td>
                    <td className="p-2">
                      <Badge style={{ background: r.motivo === "reposicion" ? SST_TOKENS.warn : SST_TOKENS.ok, color: "white" }}>
                        {r.motivo === "reposicion" ? "Reposición" : "Inicial"}
                      </Badge>
                    </td>
                    <td className="p-2 text-xs">{r.tipo_persona}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Sin entregas registradas aún.
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

export default EntregaEpp
