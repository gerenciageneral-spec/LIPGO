"use client"

// SIG — Objetivos y Metas (numeral 6.2) de las 3 normas. Tabla con filtro por
// norma, estado (en curso/cumplido/atrasado) y CRUD. El objetivo de papel
// muestra el indicador de digitalización EN VIVO.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader } from "@/components/sst/sig-ui"
import { getObjetivos, upsertObjetivo, eliminarObjetivo, getIndicadorDigitalizacion } from "@/lib/sig-actions"
import type { SigObjetivo } from "@/lib/sig-types"
import { Loader2, Target, Plus, Pencil, Trash2 } from "lucide-react"

interface Props {
  selectedEmpresaId?: number | null
}

const NORMAS = ["ISO9001", "ISO14001", "ISO45001", "SIG"]
const NORMA_LABEL: Record<string, string> = {
  ISO9001: "ISO 9001",
  ISO14001: "ISO 14001",
  ISO45001: "ISO 45001",
  SIG: "SIG (integrado)",
}
const NORMA_COLOR: Record<string, string> = {
  ISO9001: "#0D3B6E",
  ISO14001: "#1E8449",
  ISO45001: "#00B4CC",
  SIG: "#5e35b1",
}
const ESTADO_META: Record<string, { label: string; color: string }> = {
  en_curso: { label: "En curso", color: SST_TOKENS.warn },
  cumplido: { label: "Cumplido", color: SST_TOKENS.ok },
  atrasado: { label: "Atrasado", color: SST_TOKENS.bad },
}

type FormObj = {
  id?: number
  norma_codigo: string
  objetivo: string
  meta: string
  indicador: string
  unidad: string
  linea_base: string
  valor_actual: string
  responsable: string
  estado: string
}
const VACIO: FormObj = {
  norma_codigo: "ISO14001",
  objetivo: "",
  meta: "",
  indicador: "",
  unidad: "",
  linea_base: "",
  valor_actual: "",
  responsable: "",
  estado: "en_curso",
}

export function ObjetivosSIG({ selectedEmpresaId: propEmpresaId }: Props) {
  const { selectedEmpresaId: ctxEmpresaId, selectedEmpresaNombre } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId
  const { toast } = useToast()
  const [rows, setRows] = useState<SigObjetivo[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState("ALL")
  const [form, setForm] = useState<FormObj | null>(null)
  const [saving, setSaving] = useState(false)
  const [registrosVivos, setRegistrosVivos] = useState<number | null>(null)

  async function cargar() {
    setLoading(true)
    const r = await getObjetivos(empresaId)
    if (r.success) setRows(r.data)
    else toast({ title: "No se pudo cargar", description: r.error })
    setLoading(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])
  useEffect(() => {
    getIndicadorDigitalizacion()
      .then((r) => r.success && setRegistrosVivos(r.registros))
      .catch(() => {})
  }, [])

  const filtrados = useMemo(
    () => (filtro === "ALL" ? rows : rows.filter((r) => r.norma_codigo === filtro)),
    [rows, filtro],
  )

  function valorMostrado(o: SigObjetivo): string {
    // El objetivo de digitalización muestra el conteo real en vivo.
    if (o.indicador && /registros digitales/i.test(o.indicador) && registrosVivos != null) {
      return `${registrosVivos.toLocaleString("es-CO")} registros`
    }
    return o.valor_actual ?? "—"
  }

  function editar(o: SigObjetivo) {
    setForm({
      id: o.id,
      norma_codigo: o.norma_codigo ?? "SIG",
      objetivo: o.objetivo,
      meta: o.meta ?? "",
      indicador: o.indicador ?? "",
      unidad: o.unidad ?? "",
      linea_base: o.linea_base ?? "",
      valor_actual: o.valor_actual ?? "",
      responsable: o.responsable ?? "",
      estado: o.estado ?? "en_curso",
    })
  }
  async function guardar() {
    if (!form) return
    setSaving(true)
    const res = await upsertObjetivo(form, empresaId)
    setSaving(false)
    if (res.success) {
      toast({ title: form.id ? "Objetivo actualizado" : "Objetivo creado" })
      setForm(null)
      cargar()
    } else toast({ title: "No se pudo guardar", description: res.error })
  }
  async function borrar(o: SigObjetivo) {
    if (!confirm(`¿Eliminar el objetivo "${o.objetivo}"?`)) return
    const res = await eliminarObjetivo(o.id)
    if (res.success) {
      toast({ title: "Objetivo eliminado" })
      cargar()
    } else toast({ title: "No se pudo eliminar", description: res.error })
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
        Icon={Target}
        title="Objetivos y Metas del SIG (6.2)"
        subtitle={<>Las 3 normas{selectedEmpresaNombre ? ` — ${selectedEmpresaNombre}` : ""}</>}
        right={
          <Button size="sm" onClick={() => setForm({ ...VACIO })}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo objetivo
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filtro === "ALL" ? "default" : "outline"} onClick={() => setFiltro("ALL")}>
          Todas
        </Button>
        {NORMAS.map((n) => (
          <Button key={n} size="sm" variant={filtro === n ? "default" : "outline"} onClick={() => setFiltro(n)}>
            {NORMA_LABEL[n]}
          </Button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ background: SST_TOKENS.light }}>
                <th className="px-3 py-2 font-semibold">Norma</th>
                <th className="px-3 py-2 font-semibold">Objetivo</th>
                <th className="px-3 py-2 font-semibold">Meta</th>
                <th className="px-3 py-2 font-semibold">Indicador</th>
                <th className="px-3 py-2 font-semibold">Valor actual</th>
                <th className="px-3 py-2 font-semibold">Responsable</th>
                <th className="px-3 py-2 text-center font-semibold">Estado</th>
                <th className="px-3 py-2 text-center font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((o) => {
                const em = ESTADO_META[o.estado ?? "en_curso"] ?? ESTADO_META.en_curso
                return (
                  <tr key={o.id} className="border-b align-top hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{ background: NORMA_COLOR[o.norma_codigo ?? "SIG"] ?? SST_TOKENS.navy }}
                      >
                        {NORMA_LABEL[o.norma_codigo ?? "SIG"] ?? o.norma_codigo}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{o.objetivo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{o.meta}</td>
                    <td className="px-3 py-2 text-muted-foreground">{o.indicador}</td>
                    <td className="px-3 py-2 font-medium">{valorMostrado(o)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{o.responsable}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: `${em.color}1a`, color: em.color }}
                      >
                        {em.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => editar(o)} className="text-muted-foreground hover:text-foreground" title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => borrar(o)} className="text-muted-foreground hover:text-red-600" title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    No hay objetivos para el filtro actual.
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
                <DialogTitle className="text-base">{form.id ? "Editar objetivo" : "Nuevo objetivo"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <select
                  value={form.norma_codigo}
                  onChange={(e) => setForm({ ...form, norma_codigo: e.target.value })}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {NORMAS.map((n) => (
                    <option key={n} value={n}>
                      {NORMA_LABEL[n]}
                    </option>
                  ))}
                </select>
                <Textarea value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} placeholder="Objetivo" className="min-h-[44px]" />
                <Input value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} placeholder="Meta" />
                <Input value={form.indicador} onChange={(e) => setForm({ ...form, indicador: e.target.value })} placeholder="Indicador" />
                <div className="grid grid-cols-3 gap-2">
                  <Input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="Unidad" />
                  <Input value={form.linea_base} onChange={(e) => setForm({ ...form, linea_base: e.target.value })} placeholder="Línea base" />
                  <Input value={form.valor_actual} onChange={(e) => setForm({ ...form, valor_actual: e.target.value })} placeholder="Valor actual" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} placeholder="Responsable" />
                  <select
                    value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="en_curso">En curso</option>
                    <option value="cumplido">Cumplido</option>
                    <option value="atrasado">Atrasado</option>
                  </select>
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
