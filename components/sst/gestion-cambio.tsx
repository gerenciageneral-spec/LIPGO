"use client"

// Gestion del Cambio (estandar 2.11.1). Alimenta sst_gestion_cambio.

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
import { listGestionCambio, saveGestionCambio, updateGestionCambio } from "@/lib/sst-gestion-cambio-actions"
import type { GestionCambioRow } from "@/lib/sst-evidencia-types"

const TIPO: [string, string][] = [
  ["proceso", "Proceso"],
  ["equipo", "Equipo"],
  ["sustancia", "Sustancia"],
  ["instalacion", "Instalación"],
  ["normativo", "Normativo"],
  ["organizacional", "Organizacional"],
]
const ESTADO: [string, string][] = [
  ["evaluacion", "En evaluación"],
  ["aprobado", "Aprobado"],
  ["implementado", "Implementado"],
]
const SN: [string, string][] = [
  ["true", "Sí"],
  ["false", "No"],
]
const estadoColor = (e: string) => (e === "implementado" ? SST_TOKENS.ok : e === "aprobado" ? SST_TOKENS.warn : "#8896a5")
const vacio = () => ({
  sede: "",
  tipo_cambio: "proceso",
  descripcion: "",
  impacto_sst: "",
  controles: "",
  ipevr_actualizado: "false",
  capacitacion_realizada: "false",
  estado: "evaluacion",
  responsable: "",
  fecha_implementacion: "",
})

export function GestionCambio({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [rows, setRows] = useState<GestionCambioRow[]>([])
  const [tab, setTab] = useState("registrar")
  const [form, setForm] = useState<Record<string, any>>(vacio())
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function cargar() {
    setRows(await listGestionCambio(empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function guardar() {
    if (!form.descripcion.trim()) {
      toast({ title: "Falta la descripción del cambio" })
      return
    }
    const payload = {
      ...form,
      ipevr_actualizado: form.ipevr_actualizado === "true",
      capacitacion_realizada: form.capacitacion_realizada === "true",
    }
    const res = await saveGestionCambio(payload as Partial<GestionCambioRow>, empresaId)
    if (res.success) {
      toast({ title: "Cambio registrado" })
      setForm(vacio())
      cargar()
      setTab("historial")
    } else toast({ title: "Error", description: res.message })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
        Gestión del Cambio
      </h2>
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
              <Field l="Tipo de cambio">
                <Sel v={form.tipo_cambio} on={(v) => set("tipo_cambio", v)} o={TIPO} />
              </Field>
              <Field l="Responsable">
                <Input value={form.responsable} onChange={(e) => set("responsable", e.target.value)} />
              </Field>
            </Row3>
            <Field l="Descripción del cambio">
              <Textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
            </Field>
            <Field l="Impacto en SST (peligros/riesgos)">
              <Textarea value={form.impacto_sst} onChange={(e) => set("impacto_sst", e.target.value)} />
            </Field>
            <Field l="Controles definidos antes de implementar">
              <Textarea value={form.controles} onChange={(e) => set("controles", e.target.value)} />
            </Field>
            <Row3>
              <Field l="¿IPEVR actualizada?">
                <Sel v={form.ipevr_actualizado} on={(v) => set("ipevr_actualizado", v)} o={SN} />
              </Field>
              <Field l="¿Capacitación realizada?">
                <Sel v={form.capacitacion_realizada} on={(v) => set("capacitacion_realizada", v)} o={SN} />
              </Field>
              <Field l="Estado">
                <Sel v={form.estado} on={(v) => set("estado", v)} o={ESTADO} />
              </Field>
              <Field l="Fecha de implementación">
                <Input
                  type="date"
                  value={form.fecha_implementacion}
                  onChange={(e) => set("fecha_implementacion", e.target.value)}
                />
              </Field>
            </Row3>
            <Button onClick={guardar} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Registrar cambio
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Descripción</th>
                  <th className="p-2 text-center">IPEVR</th>
                  <th className="p-2 text-left w-40">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    <td className="p-2">{r.fecha_reporte}</td>
                    <td className="p-2 capitalize">{r.tipo_cambio}</td>
                    <td className="p-2 text-xs">{r.descripcion}</td>
                    <td className="p-2 text-center">{r.ipevr_actualizado ? "✓" : "—"}</td>
                    <td className="p-2">
                      <Sel
                        small
                        v={r.estado}
                        on={async (v) => {
                          await updateGestionCambio(r.id!, { estado: v })
                          cargar()
                        }}
                        o={ESTADO}
                      />
                      <Badge className="mt-1" style={{ background: estadoColor(r.estado), color: "white" }}>
                        {r.estado}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      Sin cambios registrados aún.
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

export default GestionCambio
