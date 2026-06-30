"use client"

// SIG — Mapa de Interacción del Proceso (LIPgo). Guía para el auditor que
// documenta la intervención armónica LIP↔cliente dentro del proceso que corre
// en LIPgo: quién hace cada paso, qué soporte/PDF queda, en qué campo y bajo
// qué requisito ISO. Los pasos del cliente son VALOR AGREGADO de LIP.

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader } from "@/components/sst/sig-ui"
import {
  getProcesoInteraccion,
  upsertProcesoInteraccion,
  eliminarProcesoInteraccion,
} from "@/lib/sig-actions"
import type { SigProcesoInteraccion } from "@/lib/sig-types"
import { Loader2, Workflow, Plus, Pencil, Trash2, Building2, Truck } from "lucide-react"

const RESP: Record<string, { label: string; color: string; Icon: any }> = {
  lip: { label: "LIP (servicio)", color: SST_TOKENS.navy, Icon: Truck },
  cliente: { label: "Cliente (valor agregado)", color: SST_TOKENS.teal, Icon: Building2 },
  ambos: { label: "LIP + Cliente", color: SST_TOKENS.warn, Icon: Workflow },
}

type Form = Partial<SigProcesoInteraccion> & { fase: string; paso: string }

export function MapaInteraccionProceso() {
  const { toast } = useToast()
  const [rows, setRows] = useState<SigProcesoInteraccion[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)

  async function cargar() {
    setLoading(true)
    const r = await getProcesoInteraccion()
    if (r.success) setRows(r.data)
    else toast({ title: "No se pudo cargar", description: r.error })
    setLoading(false)
  }
  useEffect(() => {
    cargar()
  }, [])

  const porFase = useMemo(() => {
    const m: { fase: string; items: SigProcesoInteraccion[] }[] = []
    for (const r of rows) {
      let g = m.find((x) => x.fase === r.fase)
      if (!g) {
        g = { fase: r.fase, items: [] }
        m.push(g)
      }
      g.items.push(r)
    }
    return m
  }, [rows])

  const resumen = useMemo(() => {
    const va = rows.filter((r) => r.es_valor_agregado).length
    return { total: rows.length, lip: rows.length - va, va }
  }, [rows])

  async function guardar() {
    if (!form) return
    setSaving(true)
    const res = await upsertProcesoInteraccion(form as any, null)
    setSaving(false)
    if (res.success) {
      toast({ title: form.id ? "Paso actualizado" : "Paso agregado" })
      setForm(null)
      cargar()
    } else toast({ title: "No se pudo guardar", description: res.error })
  }
  async function borrar(r: SigProcesoInteraccion) {
    if (!confirm("¿Eliminar este paso?")) return
    const res = await eliminarProcesoInteraccion(r.id)
    if (res.success) cargar()
    else toast({ title: "No se pudo eliminar", description: res.error })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: SST_TOKENS.navy }} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SigHeader
        Icon={Workflow}
        title="Mapa de Interacción del Proceso (LIPgo)"
        subtitle="Intervención armónica LIP↔cliente en LIPgo · soportes y trazabilidad para el auditor"
        right={
          <Button
            size="sm"
            onClick={() => setForm({ orden: (rows[rows.length - 1]?.orden ?? 0) + 1, fase: "", paso: "", responsable: "lip" })}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo paso
          </Button>
        }
      />

      {/* Leyenda / resumen */}
      <Card className="flex flex-wrap items-center gap-4 p-3 text-sm">
        <span className="flex items-center gap-2">
          <Truck className="h-4 w-4" style={{ color: SST_TOKENS.navy }} />
          <b>{resumen.lip}</b> pasos de servicio LIP
        </span>
        <span className="flex items-center gap-2">
          <Building2 className="h-4 w-4" style={{ color: SST_TOKENS.teal }} />
          <b>{resumen.va}</b> pasos del cliente (valor agregado LIPgo)
        </span>
        <span className="text-xs text-muted-foreground">
          Los pasos del cliente son herramienta que LIP brinda para control y trazabilidad; no son parte del alcance del servicio, pero LIP los provee en su software.
        </span>
      </Card>

      {porFase.map((g) => (
        <Card key={g.fase} className="overflow-hidden">
          <div className="border-b px-4 py-2 font-semibold" style={{ background: SST_TOKENS.light, color: SST_TOKENS.navy }}>
            {g.fase}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Paso</th>
                  <th className="px-3 py-2">Responsable</th>
                  <th className="px-3 py-2">Acción en LIPgo</th>
                  <th className="px-3 py-2">Evidencia / soporte</th>
                  <th className="px-3 py-2">Requisito ISO</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((r) => {
                  const resp = RESP[r.responsable ?? "lip"] ?? RESP.lip
                  return (
                    <tr key={r.id} className="group border-b align-top last:border-0">
                      <td className="px-3 py-2 font-medium text-muted-foreground">{r.orden}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.paso}</div>
                        {r.modulo_lipgo && <div className="text-[11px] text-muted-foreground">{r.modulo_lipgo}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" style={{ borderColor: resp.color, color: resp.color }}>
                          <resp.Icon className="mr-1 h-3 w-3" />
                          {resp.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.accion_lipgo}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.evidencia}
                        {r.campo_dato && <div className="text-[10px] text-muted-foreground">{r.campo_dato}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.norma_iso}</td>
                      <td className="px-3 py-2">
                        <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button onClick={() => setForm({ ...r })} className="text-muted-foreground hover:text-foreground" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => borrar(r)} className="text-muted-foreground hover:text-red-600" title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{form.id ? "Editar" : "Nuevo"} paso del proceso</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <Input
                    type="number"
                    value={form.orden ?? ""}
                    onChange={(e) => setForm({ ...form, orden: Number(e.target.value) })}
                    placeholder="#"
                  />
                  <Input
                    className="col-span-3"
                    value={form.fase}
                    onChange={(e) => setForm({ ...form, fase: e.target.value })}
                    placeholder="Fase"
                  />
                </div>
                <Input value={form.paso} onChange={(e) => setForm({ ...form, paso: e.target.value })} placeholder="Paso / subproceso" />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={form.responsable ?? "lip"}
                    onChange={(e) =>
                      setForm({ ...form, responsable: e.target.value, es_valor_agregado: e.target.value === "cliente" })
                    }
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="lip">LIP (servicio)</option>
                    <option value="cliente">Cliente (valor agregado)</option>
                    <option value="ambos">LIP + Cliente</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!form.es_valor_agregado}
                      onChange={(e) => setForm({ ...form, es_valor_agregado: e.target.checked })}
                    />
                    Valor agregado
                  </label>
                </div>
                <Input value={form.modulo_lipgo ?? ""} onChange={(e) => setForm({ ...form, modulo_lipgo: e.target.value })} placeholder="Módulo de LIPgo" />
                <Textarea value={form.accion_lipgo ?? ""} onChange={(e) => setForm({ ...form, accion_lipgo: e.target.value })} placeholder="Acción en LIPgo" className="min-h-[44px]" />
                <Input value={form.evidencia ?? ""} onChange={(e) => setForm({ ...form, evidencia: e.target.value })} placeholder="Evidencia / soporte (PDF, registro...)" />
                <Input value={form.campo_dato ?? ""} onChange={(e) => setForm({ ...form, campo_dato: e.target.value })} placeholder="Campo / dato en LIPgo" />
                <Input value={form.norma_iso ?? ""} onChange={(e) => setForm({ ...form, norma_iso: e.target.value })} placeholder="Requisito ISO" />
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setForm(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" disabled={saving} onClick={guardar}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
