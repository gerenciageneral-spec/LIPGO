"use client"

// SIG — Análisis de Contexto / Matriz DOFA (numeral 4.1). Cuadrantes
// Fortalezas/Debilidades (internos) y Oportunidades/Amenazas (externos),
// con CRUD. Evidencia del entendimiento de la organización y su contexto.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader } from "@/components/sst/sig-ui"
import { getContextoDofa, upsertDofa, eliminarDofa } from "@/lib/sig-actions"
import type { SigDofa } from "@/lib/sig-types"
import { Loader2, Compass, Plus, Pencil, Trash2, ThumbsUp, ThumbsDown, TrendingUp, AlertTriangle } from "lucide-react"

interface Props {
  selectedEmpresaId?: number | null
}

const CUADRANTES: { key: string; label: string; color: string; Icon: any; sub: string }[] = [
  { key: "fortaleza", label: "Fortalezas", color: SST_TOKENS.ok, Icon: ThumbsUp, sub: "Interno (+)" },
  { key: "debilidad", label: "Debilidades", color: SST_TOKENS.bad, Icon: ThumbsDown, sub: "Interno (−)" },
  { key: "oportunidad", label: "Oportunidades", color: SST_TOKENS.navy, Icon: TrendingUp, sub: "Externo (+)" },
  { key: "amenaza", label: "Amenazas", color: SST_TOKENS.warn, Icon: AlertTriangle, sub: "Externo (−)" },
]

const ESTRATEGIAS: { key: string; label: string; color: string }[] = [
  { key: "FO", label: "FO — Ofensivas (Fortalezas + Oportunidades)", color: SST_TOKENS.ok },
  { key: "FA", label: "FA — Defensivas (Fortalezas + Amenazas)", color: SST_TOKENS.teal },
  { key: "DO", label: "DO — Reorientación (Debilidades + Oportunidades)", color: SST_TOKENS.warn },
  { key: "DA", label: "DA — Supervivencia (Debilidades + Amenazas)", color: SST_TOKENS.bad },
]

type FormDofa = { id?: number; cuadrante: string; descripcion: string }

export function ContextoDofa({ selectedEmpresaId: propEmpresaId }: Props) {
  const { selectedEmpresaId: ctxEmpresaId, selectedEmpresaNombre } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId
  const { toast } = useToast()
  const [rows, setRows] = useState<SigDofa[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormDofa | null>(null)
  const [saving, setSaving] = useState(false)

  async function cargar() {
    setLoading(true)
    const r = await getContextoDofa(empresaId)
    if (r.success) setRows(r.data)
    else toast({ title: "No se pudo cargar", description: r.error })
    setLoading(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const porCuadrante = useMemo(() => {
    const m: Record<string, SigDofa[]> = {}
    for (const r of rows) (m[r.cuadrante] = m[r.cuadrante] || []).push(r)
    return m
  }, [rows])

  async function guardar() {
    if (!form) return
    setSaving(true)
    const res = await upsertDofa(form, empresaId)
    setSaving(false)
    if (res.success) {
      toast({ title: form.id ? "Ítem actualizado" : "Ítem agregado" })
      setForm(null)
      cargar()
    } else toast({ title: "No se pudo guardar", description: res.error })
  }
  async function borrar(r: SigDofa) {
    if (!confirm("¿Eliminar este ítem?")) return
    const res = await eliminarDofa(r.id)
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
        Icon={Compass}
        title="Análisis de Contexto — Matriz DOFA (4.1)"
        subtitle={<>Comprensión de la organización y su contexto{selectedEmpresaNombre ? ` — ${selectedEmpresaNombre}` : ""}</>}
        right={
          <Button size="sm" onClick={() => setForm({ cuadrante: "fortaleza", descripcion: "" })}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo ítem
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        {CUADRANTES.map((c) => {
          const items = porCuadrante[c.key] ?? []
          return (
            <Card key={c.key} className="overflow-hidden border-t-4" style={{ borderTopColor: c.color }}>
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="flex items-center gap-2 font-semibold" style={{ color: c.color }}>
                  <c.Icon className="h-4 w-4" />
                  {c.label}
                  <span className="text-[11px] font-normal text-muted-foreground">{c.sub}</span>
                </span>
                <button
                  onClick={() => setForm({ cuadrante: c.key, descripcion: "" })}
                  className="text-muted-foreground hover:text-foreground"
                  title="Agregar"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <ul className="divide-y">
                {items.length === 0 ? (
                  <li className="px-4 py-3 text-xs text-muted-foreground">Sin ítems.</li>
                ) : (
                  items.map((it) => (
                    <li key={it.id} className="group flex items-start justify-between gap-2 px-4 py-2 text-sm">
                      <span>{it.descripcion}</span>
                      <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => setForm({ id: it.id, cuadrante: it.cuadrante, descripcion: it.descripcion })}
                          className="text-muted-foreground hover:text-foreground"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => borrar(it)} className="text-muted-foreground hover:text-red-600" title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </Card>
          )
        })}
      </div>

      <div>
        <h2 className="mb-1 text-base font-semibold" style={{ color: SST_TOKENS.ink }}>
          Cruces estratégicos (DOFA → estrategias)
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Estrategias accionables derivadas del cruce de factores.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {ESTRATEGIAS.map((e) => {
            const items = porCuadrante[e.key] ?? []
            return (
              <Card key={e.key} className="overflow-hidden border-l-4" style={{ borderLeftColor: e.color }}>
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <span className="text-sm font-semibold" style={{ color: e.color }}>
                    {e.label}
                  </span>
                  <button
                    onClick={() => setForm({ cuadrante: e.key, descripcion: "" })}
                    className="text-muted-foreground hover:text-foreground"
                    title="Agregar"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <ul className="divide-y">
                  {items.length === 0 ? (
                    <li className="px-4 py-3 text-xs text-muted-foreground">Sin estrategias.</li>
                  ) : (
                    items.map((it) => (
                      <li key={it.id} className="group flex items-start justify-between gap-2 px-4 py-2 text-sm">
                        <span>{it.descripcion}</span>
                        <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => setForm({ id: it.id, cuadrante: it.cuadrante, descripcion: it.descripcion })}
                            className="text-muted-foreground hover:text-foreground"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => borrar(it)} className="text-muted-foreground hover:text-red-600" title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </Card>
            )
          })}
        </div>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-md">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{form.id ? "Editar ítem" : "Nuevo ítem"} — DOFA</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <select
                  value={form.cuadrante}
                  onChange={(e) => setForm({ ...form, cuadrante: e.target.value })}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <optgroup label="Factores DOFA">
                    {CUADRANTES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label} ({c.sub})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Estrategias (cruces)">
                    {ESTRATEGIAS.map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <Textarea
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  placeholder="Descripción del factor"
                  className="min-h-[70px]"
                />
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
