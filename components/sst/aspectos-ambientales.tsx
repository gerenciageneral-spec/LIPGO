"use client"

// ISO 14001 — Matriz de Aspectos e Impactos Ambientales (numeral 6.1.2).
// Resalta los aspectos SIGNIFICATIVOS (los que el auditor revisa primero) y
// muestra control y responsable. Datos en sig_aspectos_ambientales.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader } from "@/components/sst/sig-ui"
import {
  getAspectosAmbientales,
  upsertAspectoAmbiental,
  eliminarAspectoAmbiental,
  getIndicadorDigitalizacion,
} from "@/lib/sig-actions"
import type { SigAspectoAmbiental } from "@/lib/sig-types"
import { Loader2, Leaf, AlertTriangle, Plus, Pencil, Trash2, Monitor } from "lucide-react"

type Indicador = { registros: number; hojas: number; resmas: number; kg: number; desglose: { label: string; count: number }[] }

type FormAspecto = {
  id?: number
  actividad: string
  aspecto: string
  impacto: string
  tipo_recurso: string
  condicion: string
  cumplimiento_legal: boolean
  frecuencia: number
  severidad: number
  alcance: number
  significancia: string
  control: string
  responsable: string
}

const VACIO: FormAspecto = {
  actividad: "",
  aspecto: "",
  impacto: "",
  tipo_recurso: "energia",
  condicion: "normal",
  cumplimiento_legal: true,
  frecuencia: 3,
  severidad: 3,
  alcance: 3,
  significancia: "no_significativo",
  control: "",
  responsable: "",
}

interface Props {
  selectedEmpresaId?: number | null
}

const RECURSO_LABEL: Record<string, string> = {
  energia: "Energía",
  agua: "Agua",
  residuos: "Residuos",
  respel: "RESPEL",
  aire: "Aire",
  suelo: "Suelo",
  papel: "Papel/RAEE",
}

export function AspectosAmbientales({ selectedEmpresaId: propEmpresaId }: Props) {
  const { selectedEmpresaId: ctxEmpresaId, selectedEmpresaNombre } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId
  const { toast } = useToast()
  const [rows, setRows] = useState<SigAspectoAmbiental[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormAspecto | null>(null)
  const [saving, setSaving] = useState(false)
  const [indicador, setIndicador] = useState<Indicador | null>(null)

  async function cargar() {
    setLoading(true)
    const r = await getAspectosAmbientales(empresaId)
    if (r.success) setRows(r.data)
    else toast({ title: "No se pudo cargar", description: r.error })
    setLoading(false)
  }
  useEffect(() => {
    getIndicadorDigitalizacion()
      .then((r) => r.success && setIndicador({ registros: r.registros, hojas: r.hojas, resmas: r.resmas, kg: r.kg, desglose: r.desglose }))
      .catch(() => {})
  }, [])
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const significativos = useMemo(() => rows.filter((r) => r.significancia === "significativo").length, [rows])

  function nuevo() {
    setForm({ ...VACIO })
  }
  function editar(a: SigAspectoAmbiental) {
    setForm({
      id: a.id,
      actividad: a.actividad,
      aspecto: a.aspecto,
      impacto: a.impacto ?? "",
      tipo_recurso: a.tipo_recurso ?? "energia",
      condicion: a.condicion ?? "normal",
      cumplimiento_legal: a.cumplimiento_legal ?? true,
      frecuencia: a.frecuencia ?? 3,
      severidad: a.severidad ?? 3,
      alcance: a.alcance ?? 3,
      significancia: a.significancia ?? "no_significativo",
      control: a.control ?? "",
      responsable: a.responsable ?? "",
    })
  }
  async function guardar() {
    if (!form) return
    setSaving(true)
    const res = await upsertAspectoAmbiental(form, empresaId)
    setSaving(false)
    if (res.success) {
      toast({ title: form.id ? "Aspecto actualizado" : "Aspecto creado" })
      setForm(null)
      cargar()
    } else {
      toast({ title: "No se pudo guardar", description: res.error })
    }
  }
  async function borrar(a: SigAspectoAmbiental) {
    if (!confirm(`¿Eliminar el aspecto "${a.aspecto}"?`)) return
    const res = await eliminarAspectoAmbiental(a.id)
    if (res.success) {
      toast({ title: "Aspecto eliminado" })
      cargar()
    } else {
      toast({ title: "No se pudo eliminar", description: res.error })
    }
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
        Icon={Leaf}
        title="Aspectos e Impactos Ambientales — ISO 14001 (6.1.2)"
        subtitle={<>Matriz ambiental{selectedEmpresaNombre ? ` — ${selectedEmpresaNombre}` : ""}</>}
        right={
          <Button size="sm" onClick={nuevo}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo aspecto
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Aspectos identificados</p>
          <p className="text-2xl font-bold" style={{ color: SST_TOKENS.navy }}>{rows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Significativos</p>
          <p className="text-2xl font-bold" style={{ color: SST_TOKENS.bad }}>{significativos}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">No significativos</p>
          <p className="text-2xl font-bold" style={{ color: SST_TOKENS.ok }}>{rows.length - significativos}</p>
        </Card>
      </div>

      {/* Objetivo ambiental: digitalización / ahorro de papel (diferenciador LIP) */}
      {indicador && (
        <Card className="overflow-hidden border-l-4" style={{ borderLeftColor: SST_TOKENS.ok }}>
          <div className="flex flex-wrap items-center gap-4 p-4">
            <div className="rounded-xl p-2.5" style={{ background: `${SST_TOKENS.ok}1a` }}>
              <Monitor className="h-6 w-6" style={{ color: SST_TOKENS.ok }} />
            </div>
            <div className="min-w-[200px] flex-1">
              <p className="text-sm font-bold" style={{ color: SST_TOKENS.ink }}>
                Objetivo ambiental — Digitalización en LIPgo (reducción de papel)
              </p>
              <p className="text-xs text-muted-foreground">
                Procesos gestionados en el software en vez de papel. ISO 14001 (6.2) · control del aspecto “consumo de papel”.
              </p>
            </div>
            <div className="flex gap-5">
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: SST_TOKENS.ok }}>
                  {indicador.registros.toLocaleString("es-CO")}
                </p>
                <p className="text-[11px] text-muted-foreground">registros digitales</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: SST_TOKENS.navy }}>
                  ~{indicador.resmas}
                </p>
                <p className="text-[11px] text-muted-foreground">resmas ahorradas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: SST_TOKENS.navy }}>
                  ~{indicador.kg} kg
                </p>
                <p className="text-[11px] text-muted-foreground">papel evitado</p>
              </div>
            </div>
          </div>
          <div className="border-t bg-muted/30 px-4 py-2">
            <span className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {indicador.desglose.map((d) => (
                <span key={d.label}>
                  {d.label}: <b>{d.count.toLocaleString("es-CO")}</b>
                </span>
              ))}
            </span>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ background: `${SST_TOKENS.ok}12` }}>
                <th className="px-3 py-2 font-semibold">Actividad</th>
                <th className="px-3 py-2 font-semibold">Aspecto</th>
                <th className="px-3 py-2 font-semibold">Impacto</th>
                <th className="px-3 py-2 font-semibold">Recurso</th>
                <th className="px-3 py-2 font-semibold">Condición</th>
                <th className="px-3 py-2 text-center font-semibold">Significancia</th>
                <th className="px-3 py-2 font-semibold">Control</th>
                <th className="px-3 py-2 font-semibold">Responsable</th>
                <th className="px-3 py-2 text-center font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sig = r.significancia === "significativo"
                return (
                  <tr
                    key={r.id}
                    className="border-b align-top"
                    style={sig ? { background: `${SST_TOKENS.bad}0d` } : undefined}
                  >
                    <td className="px-3 py-2 font-medium">{r.actividad}</td>
                    <td className="px-3 py-2">{r.aspecto}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.impacto}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {RECURSO_LABEL[r.tipo_recurso ?? ""] ?? r.tipo_recurso ?? "-"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{r.condicion}</td>
                    <td className="px-3 py-2 text-center">
                      {sig ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: `${SST_TOKENS.bad}1a`, color: SST_TOKENS.bad }}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Significativo
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">No significativo</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.control}</td>
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
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    Aún no hay aspectos ambientales registrados para esta empresa.
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
                <DialogTitle className="text-base">
                  {form.id ? "Editar aspecto ambiental" : "Nuevo aspecto ambiental"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Input
                  value={form.actividad}
                  onChange={(e) => setForm({ ...form, actividad: e.target.value })}
                  placeholder="Actividad (ej. Carga de baterías)"
                />
                <Input
                  value={form.aspecto}
                  onChange={(e) => setForm({ ...form, aspecto: e.target.value })}
                  placeholder="Aspecto ambiental"
                />
                <Textarea
                  value={form.impacto}
                  onChange={(e) => setForm({ ...form, impacto: e.target.value })}
                  placeholder="Impacto ambiental"
                  className="min-h-[44px]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={form.tipo_recurso}
                    onChange={(e) => setForm({ ...form, tipo_recurso: e.target.value })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    {Object.entries(RECURSO_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.condicion}
                    onChange={(e) => setForm({ ...form, condicion: e.target.value })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="normal">Normal</option>
                    <option value="anormal">Anormal</option>
                    <option value="emergencia">Emergencia</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["frecuencia", "severidad", "alcance"] as const).map((k) => (
                    <label key={k} className="text-xs text-muted-foreground">
                      <span className="capitalize">{k}</span> (1-5)
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={form[k]}
                        onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
                        className="mt-0.5 h-8"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.cumplimiento_legal}
                      onChange={(e) => setForm({ ...form, cumplimiento_legal: e.target.checked })}
                    />
                    Cumple requisito legal
                  </label>
                  <select
                    value={form.significancia}
                    onChange={(e) => setForm({ ...form, significancia: e.target.value })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="no_significativo">No significativo</option>
                    <option value="significativo">Significativo</option>
                  </select>
                </div>
                <Textarea
                  value={form.control}
                  onChange={(e) => setForm({ ...form, control: e.target.value })}
                  placeholder="Control / medida"
                  className="min-h-[44px]"
                />
                <Input
                  value={form.responsable}
                  onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                  placeholder="Responsable"
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
