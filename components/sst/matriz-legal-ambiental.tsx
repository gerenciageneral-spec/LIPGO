"use client"

// ISO 14001 — Matriz Legal Ambiental (numeral 6.1.3): normatividad aplicable +
// evaluación de cumplimiento. KPI de % de cumplimiento legal + CRUD.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS, colorPct } from "@/components/sst/sst-utils"
import { SigHeader } from "@/components/sst/sig-ui"
import { getRequisitosLegales, upsertRequisitoLegal, eliminarRequisitoLegal } from "@/lib/sig-actions"
import type { SigRequisitoLegal } from "@/lib/sig-types"
import { Loader2, Scale, Plus, Pencil, Trash2 } from "lucide-react"

interface Props {
  selectedEmpresaId?: number | null
}

const CUMPLE_META: Record<string, { label: string; color: string }> = {
  cumple: { label: "Cumple", color: SST_TOKENS.ok },
  parcial: { label: "Parcial", color: SST_TOKENS.warn },
  no_cumple: { label: "No cumple", color: SST_TOKENS.bad },
  no_aplica: { label: "No aplica", color: "#8896a5" },
}

type FormLegal = {
  id?: number
  tipo_norma: string
  identificacion: string
  titulo: string
  requisito: string
  como_cumple: string
  cumple: string
  responsable: string
}
const VACIO: FormLegal = {
  tipo_norma: "Decreto",
  identificacion: "",
  titulo: "",
  requisito: "",
  como_cumple: "",
  cumple: "cumple",
  responsable: "",
}

export function MatrizLegalAmbiental({ selectedEmpresaId: propEmpresaId }: Props) {
  const { selectedEmpresaId: ctxEmpresaId, selectedEmpresaNombre } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId
  const { toast } = useToast()
  const [rows, setRows] = useState<SigRequisitoLegal[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormLegal | null>(null)
  const [saving, setSaving] = useState(false)

  async function cargar() {
    setLoading(true)
    const r = await getRequisitosLegales(empresaId)
    if (r.success) setRows(r.data)
    else toast({ title: "No se pudo cargar", description: r.error })
    setLoading(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  // % de cumplimiento legal (cumple=1, parcial=0.5; no_aplica se excluye).
  const pct = useMemo(() => {
    const aplican = rows.filter((r) => r.cumple !== "no_aplica")
    if (!aplican.length) return 0
    const suma = aplican.reduce((s, r) => s + (r.cumple === "cumple" ? 1 : r.cumple === "parcial" ? 0.5 : 0), 0)
    return Math.round((suma / aplican.length) * 100)
  }, [rows])

  function editar(r: SigRequisitoLegal) {
    setForm({
      id: r.id,
      tipo_norma: r.tipo_norma ?? "Decreto",
      identificacion: r.identificacion ?? "",
      titulo: r.titulo ?? "",
      requisito: r.requisito ?? "",
      como_cumple: r.como_cumple ?? "",
      cumple: r.cumple ?? "cumple",
      responsable: r.responsable ?? "",
    })
  }
  async function guardar() {
    if (!form) return
    setSaving(true)
    const res = await upsertRequisitoLegal({ ...form, norma_codigo: "ISO14001" }, empresaId)
    setSaving(false)
    if (res.success) {
      toast({ title: form.id ? "Requisito actualizado" : "Requisito creado" })
      setForm(null)
      cargar()
    } else toast({ title: "No se pudo guardar", description: res.error })
  }
  async function borrar(r: SigRequisitoLegal) {
    if (!confirm(`¿Eliminar "${r.identificacion}"?`)) return
    const res = await eliminarRequisitoLegal(r.id)
    if (res.success) {
      toast({ title: "Requisito eliminado" })
      cargar()
    } else toast({ title: "No se pudo eliminar", description: res.error })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: SST_TOKENS.ok }} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SigHeader
        Icon={Scale}
        title="Matriz Legal Ambiental — ISO 14001 (6.1.3)"
        subtitle={<>Normatividad aplicable y evaluación de cumplimiento{selectedEmpresaNombre ? ` — ${selectedEmpresaNombre}` : ""}</>}
        right={
          <Button size="sm" onClick={() => setForm({ ...VACIO })}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva norma
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">% Cumplimiento legal</p>
          <p className="text-2xl font-bold" style={{ color: colorPct(pct) }}>{pct}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Normas aplicables</p>
          <p className="text-2xl font-bold" style={{ color: SST_TOKENS.navy }}>
            {rows.filter((r) => r.cumple !== "no_aplica").length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total registradas</p>
          <p className="text-2xl font-bold" style={{ color: SST_TOKENS.navy }}>{rows.length}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ background: `${SST_TOKENS.ok}12` }}>
                <th className="px-3 py-2 font-semibold">Norma</th>
                <th className="px-3 py-2 font-semibold">Título</th>
                <th className="px-3 py-2 font-semibold">Requisito</th>
                <th className="px-3 py-2 font-semibold">Cómo cumple</th>
                <th className="px-3 py-2 text-center font-semibold">Cumplimiento</th>
                <th className="px-3 py-2 font-semibold">Responsable</th>
                <th className="px-3 py-2 text-center font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cm = CUMPLE_META[r.cumple ?? "cumple"] ?? CUMPLE_META.cumple
                return (
                  <tr key={r.id} className="border-b align-top hover:bg-muted/40">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{r.identificacion}</span>
                      {r.tipo_norma && (
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {r.tipo_norma}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.titulo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.requisito}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.como_cumple}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: `${cm.color}1a`, color: cm.color }}
                      >
                        {cm.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.responsable}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => editar(r)} className="text-muted-foreground hover:text-foreground" title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => borrar(r)} className="text-muted-foreground hover:text-red-600" title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Aún no hay requisitos legales registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{form.id ? "Editar requisito legal" : "Nuevo requisito legal"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={form.tipo_norma}
                    onChange={(e) => setForm({ ...form, tipo_norma: e.target.value })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="Ley">Ley</option>
                    <option value="Decreto">Decreto</option>
                    <option value="Resolución">Resolución</option>
                    <option value="Otro">Otro</option>
                  </select>
                  <Input
                    value={form.identificacion}
                    onChange={(e) => setForm({ ...form, identificacion: e.target.value })}
                    placeholder="Ej. Decreto 1076 de 2015"
                  />
                </div>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Título de la norma" />
                <Textarea value={form.requisito} onChange={(e) => setForm({ ...form, requisito: e.target.value })} placeholder="Requisito (qué exige)" className="min-h-[44px]" />
                <Textarea value={form.como_cumple} onChange={(e) => setForm({ ...form, como_cumple: e.target.value })} placeholder="Cómo cumple LIP (evidencia/control)" className="min-h-[44px]" />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={form.cumple}
                    onChange={(e) => setForm({ ...form, cumple: e.target.value })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="cumple">Cumple</option>
                    <option value="parcial">Parcial</option>
                    <option value="no_cumple">No cumple</option>
                    <option value="no_aplica">No aplica</option>
                  </select>
                  <Input value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} placeholder="Responsable" />
                </div>
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
