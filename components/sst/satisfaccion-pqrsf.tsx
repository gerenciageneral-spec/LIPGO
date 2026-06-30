"use client"

// SIG — Satisfacción del cliente y partes interesadas + PQRSF (ISO 9001 9.1.2).
// Encuestas a clientes y conductores (alimentan IND-G-01/G-02) + gestión de
// Peticiones/Quejas/Reclamos/Sugerencias/Felicitaciones. Por cliente/sitio.

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader, SigFilterBar } from "@/components/sst/sig-ui"
import {
  getSatisfaccion,
  upsertSatisfaccion,
  eliminarSatisfaccion,
  getPQRSF,
  upsertPQRSF,
  eliminarPQRSF,
} from "@/lib/sig-actions"
import { useAuth } from "@/components/auth-provider"
import type { SigSatisfaccion, SigPQRSF } from "@/lib/sig-types"
import { Loader2, Smile, MessageSquareWarning, Plus, Pencil, Trash2 } from "lucide-react"

const ESTADO_PQRSF: Record<string, { label: string; color: string }> = {
  abierta: { label: "Abierta", color: SST_TOKENS.bad },
  en_proceso: { label: "En proceso", color: SST_TOKENS.warn },
  cerrada: { label: "Cerrada", color: SST_TOKENS.ok },
}
const TIPO_PQRSF = [
  { v: "peticion", l: "Petición" },
  { v: "queja", l: "Queja" },
  { v: "reclamo", l: "Reclamo" },
  { v: "sugerencia", l: "Sugerencia" },
  { v: "felicitacion", l: "Felicitación" },
]

function KPI({ label, valor, unidad, color, sub }: { label: string; valor: number | string; unidad?: string; color: string; sub?: string }) {
  return (
    <Card className="border-t-4 p-3" style={{ borderTopColor: color }}>
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-end gap-1">
        <span className="text-2xl font-bold" style={{ color }}>{valor}</span>
        {unidad && <span className="mb-0.5 text-xs text-muted-foreground">{unidad}</span>}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  )
}

export function SatisfaccionPQRSF() {
  const { toast } = useToast()
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const proyecto = selectedEmpresaId ? String(selectedEmpresaId) : "" // lo define el selector global
  const [enc, setEnc] = useState<SigSatisfaccion[]>([])
  const [pqrsf, setPqrsf] = useState<SigPQRSF[]>([])
  const [loading, setLoading] = useState(true)
  const [formEnc, setFormEnc] = useState<any | null>(null)
  const [formP, setFormP] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)

  async function cargar() {
    setLoading(true)
    const pid = proyecto ? Number(proyecto) : null
    const [s, p] = await Promise.all([getSatisfaccion(pid), getPQRSF(pid)])
    if (s.success) setEnc(s.data)
    if (p.success) setPqrsf(p.data)
    setLoading(false)
  }
  useEffect(() => { cargar() /* eslint-disable-next-line */ }, [proyecto])

  const nombreCliente = useMemo(() => {
    const m: Record<number, string> = {}
    if (selectedEmpresaId) m[selectedEmpresaId] = selectedEmpresaNombre || ""
    return m
  }, [selectedEmpresaId, selectedEmpresaNombre])

  const kpis = useMemo(() => {
    const avg = (tipo: string) => {
      const v = enc.filter((e) => e.tipo === tipo).map((e) => Number(e.calificacion) || 0).filter((x) => x > 0)
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length / 5) * 1000) / 10 : 0
    }
    const rec = enc.filter((e) => e.recomendaria != null)
    const recPct = rec.length ? Math.round((rec.filter((e) => e.recomendaria).length / rec.length) * 1000) / 10 : 0
    const abiertas = pqrsf.filter((p) => p.estado !== "cerrada").length
    const cerradas = pqrsf.filter((p) => p.estado === "cerrada").length
    const tiempos = pqrsf.map((p) => p.dias_respuesta).filter((d): d is number => d != null)
    const tProm = tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0
    return { satCli: avg("cliente"), satCon: avg("conductor"), recPct, abiertas, cerradas, tProm, nCli: enc.filter(e=>e.tipo==="cliente").length, nCon: enc.filter(e=>e.tipo==="conductor").length }
  }, [enc, pqrsf])

  async function guardarEnc() {
    if (!formEnc) return
    setSaving(true)
    const r = await upsertSatisfaccion(Number(proyecto || formEnc.proyecto_id), formEnc)
    setSaving(false)
    if (r.success) { toast({ title: formEnc.id ? "Encuesta actualizada" : "Encuesta registrada" }); setFormEnc(null); cargar() }
    else toast({ title: "No se pudo guardar", description: r.error })
  }
  async function guardarP() {
    if (!formP) return
    setSaving(true)
    const r = await upsertPQRSF(Number(proyecto || formP.proyecto_id), formP)
    setSaving(false)
    if (r.success) { toast({ title: formP.id ? "PQRSF actualizada" : "PQRSF registrada" }); setFormP(null); cargar() }
    else toast({ title: "No se pudo guardar", description: r.error })
  }

  const estrellas = (n: number | null) => "★".repeat(Math.round(Number(n) || 0)) + "☆".repeat(5 - Math.round(Number(n) || 0))
  const requireProyecto = !proyecto

  return (
    <div className="space-y-5">
      <SigHeader
        Icon={Smile}
        title="Satisfacción y PQRSF (9.1.2)"
        subtitle="Satisfacción de clientes y conductores + peticiones/quejas/reclamos · alimenta los indicadores de satisfacción"
      />

      <SigFilterBar cliente={selectedEmpresaNombre}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" style={{ color: SST_TOKENS.teal }} />}
      </SigFilterBar>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KPI label="Satisfacción cliente" valor={kpis.satCli} unidad="%" color={kpis.satCli >= 90 ? SST_TOKENS.ok : kpis.satCli >= 76 ? SST_TOKENS.warn : SST_TOKENS.bad} sub={`${kpis.nCli} encuestas`} />
        <KPI label="Satisfacción conductor" valor={kpis.satCon} unidad="%" color={kpis.satCon >= 85 ? SST_TOKENS.ok : kpis.satCon >= 72 ? SST_TOKENS.warn : SST_TOKENS.bad} sub={`${kpis.nCon} encuestas`} />
        <KPI label="Recomendaría" valor={kpis.recPct} unidad="%" color={SST_TOKENS.navy} />
        <KPI label="PQRSF abiertas" valor={kpis.abiertas} color={kpis.abiertas ? SST_TOKENS.bad : SST_TOKENS.ok} />
        <KPI label="PQRSF cerradas" valor={kpis.cerradas} color={SST_TOKENS.ok} />
        <KPI label="Tiempo respuesta" valor={kpis.tProm} unidad="días" color={SST_TOKENS.navy} />
      </div>

      <Tabs defaultValue="satisfaccion">
        <TabsList>
          <TabsTrigger value="satisfaccion"><Smile className="mr-2 h-4 w-4" />Encuestas ({enc.length})</TabsTrigger>
          <TabsTrigger value="pqrsf"><MessageSquareWarning className="mr-2 h-4 w-4" />PQRSF ({pqrsf.length})</TabsTrigger>
        </TabsList>

        {/* ENCUESTAS */}
        <TabsContent value="satisfaccion" className="space-y-3 pt-3">
          <div className="flex justify-end">
            <Button size="sm" disabled={requireProyecto} onClick={() => setFormEnc({ tipo: "cliente", fecha: "", calificacion: 5, recomendaria: true })}>
              <Plus className="mr-2 h-4 w-4" />Nueva encuesta
            </Button>
          </div>
          {requireProyecto && <p className="text-xs text-muted-foreground">Selecciona un cliente/sitio para registrar encuestas.</p>}
          {enc.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Sin encuestas registradas.</Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                    <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Encuestado</th>
                    <th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Calificación</th><th className="px-3 py-2">Comentario</th><th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {enc.map((e) => (
                    <tr key={e.id} className="group border-b last:border-0">
                      <td className="px-3 py-1.5">{e.fecha}</td>
                      <td className="px-3 py-1.5"><Badge variant="outline">{e.tipo}</Badge></td>
                      <td className="px-3 py-1.5">{e.encuestado}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{nombreCliente[e.proyecto_id ?? 0]}</td>
                      <td className="px-3 py-1.5" style={{ color: SST_TOKENS.warn }} title={`${e.calificacion}/5`}>{estrellas(e.calificacion)}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{e.comentario}</td>
                      <td className="px-3 py-1.5">
                        <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button onClick={() => setFormEnc({ ...e })} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => { if (confirm("¿Eliminar?")) eliminarSatisfaccion(e.id).then(cargar) }} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        {/* PQRSF */}
        <TabsContent value="pqrsf" className="space-y-3 pt-3">
          <div className="flex justify-end">
            <Button size="sm" disabled={requireProyecto} onClick={() => setFormP({ tipo: "queja", parte_interesada: "cliente", fecha: "", descripcion: "", estado: "abierta" })}>
              <Plus className="mr-2 h-4 w-4" />Nueva PQRSF
            </Button>
          </div>
          {pqrsf.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Sin registros PQRSF.</Card>
          ) : (
            <div className="space-y-2">
              {pqrsf.map((p) => {
                const est = ESTADO_PQRSF[p.estado ?? "abierta"] ?? ESTADO_PQRSF.abierta
                return (
                  <Card key={p.id} className="group overflow-hidden border-l-4 p-3" style={{ borderLeftColor: est.color }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{p.tipo}</Badge>
                          <Badge style={{ background: est.color, color: "white" }}>{est.label}</Badge>
                          <span className="text-xs text-muted-foreground">{p.parte_interesada} · {nombreCliente[p.proyecto_id ?? 0]}</span>
                          {p.fecha && <span className="text-xs text-muted-foreground">{p.fecha}</span>}
                          {p.dias_respuesta != null && <span className="text-xs text-muted-foreground">{p.dias_respuesta} días</span>}
                        </div>
                        <p className="mt-1 text-sm">{p.descripcion}</p>
                        {p.respuesta && <p className="mt-0.5 text-xs text-muted-foreground"><b>Respuesta:</b> {p.respuesta}</p>}
                      </div>
                      <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => setFormP({ ...p })} className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => { if (confirm("¿Eliminar?")) eliminarPQRSF(p.id).then(cargar) }} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog encuesta */}
      <Dialog open={!!formEnc} onOpenChange={(o) => !o && setFormEnc(null)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          {formEnc && (
            <>
              <DialogHeader><DialogTitle className="text-base">{formEnc.id ? "Editar" : "Nueva"} encuesta de satisfacción</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={formEnc.tipo} onChange={(e) => setFormEnc({ ...formEnc, tipo: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="cliente">Cliente</option>
                    <option value="conductor">Conductor</option>
                  </select>
                  <Input type="date" value={formEnc.fecha ?? ""} onChange={(e) => setFormEnc({ ...formEnc, fecha: e.target.value })} />
                </div>
                <Input value={formEnc.encuestado ?? ""} onChange={(e) => setFormEnc({ ...formEnc, encuestado: e.target.value })} placeholder="Encuestado (nombre / empresa / placa)" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Calificación:</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setFormEnc({ ...formEnc, calificacion: n })} className="text-xl" style={{ color: n <= (formEnc.calificacion || 0) ? SST_TOKENS.warn : "#cbd5e1" }}>★</button>
                  ))}
                  <span className="text-xs text-muted-foreground">{formEnc.calificacion}/5</span>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!formEnc.recomendaria} onChange={(e) => setFormEnc({ ...formEnc, recomendaria: e.target.checked })} />
                  Recomendaría el servicio
                </label>
                <Textarea value={formEnc.comentario ?? ""} onChange={(e) => setFormEnc({ ...formEnc, comentario: e.target.value })} placeholder="Comentario / observación" className="min-h-[50px]" />
                <Input value={formEnc.responsable ?? ""} onChange={(e) => setFormEnc({ ...formEnc, responsable: e.target.value })} placeholder="Responsable / quién registra" />
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setFormEnc(null)}>Cancelar</Button>
                  <Button size="sm" disabled={saving} onClick={guardarEnc}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog PQRSF */}
      <Dialog open={!!formP} onOpenChange={(o) => !o && setFormP(null)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          {formP && (
            <>
              <DialogHeader><DialogTitle className="text-base">{formP.id ? "Editar" : "Nueva"} PQRSF</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={formP.tipo} onChange={(e) => setFormP({ ...formP, tipo: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    {TIPO_PQRSF.map((t) => (<option key={t.v} value={t.v}>{t.l}</option>))}
                  </select>
                  <select value={formP.parte_interesada} onChange={(e) => setFormP({ ...formP, parte_interesada: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="cliente">Cliente</option>
                    <option value="conductor">Conductor</option>
                    <option value="proveedor">Proveedor</option>
                    <option value="colaborador">Colaborador</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={formP.fecha ?? ""} onChange={(e) => setFormP({ ...formP, fecha: e.target.value })} />
                  <Input value={formP.canal ?? ""} onChange={(e) => setFormP({ ...formP, canal: e.target.value })} placeholder="Canal" />
                </div>
                <Textarea value={formP.descripcion ?? ""} onChange={(e) => setFormP({ ...formP, descripcion: e.target.value })} placeholder="Descripción" className="min-h-[60px]" />
                <Textarea value={formP.respuesta ?? ""} onChange={(e) => setFormP({ ...formP, respuesta: e.target.value })} placeholder="Respuesta / tratamiento" className="min-h-[44px]" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={formP.responsable ?? ""} onChange={(e) => setFormP({ ...formP, responsable: e.target.value })} placeholder="Responsable" />
                  <select value={formP.estado} onChange={(e) => setFormP({ ...formP, estado: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="abierta">Abierta</option>
                    <option value="en_proceso">En proceso</option>
                    <option value="cerrada">Cerrada</option>
                  </select>
                </div>
                {(formP.estado === "cerrada" || formP.fecha_cierre) && (
                  <Input type="date" value={formP.fecha_cierre ?? ""} onChange={(e) => setFormP({ ...formP, fecha_cierre: e.target.value })} placeholder="Fecha de cierre" />
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!formP.genera_nc} onChange={(e) => setFormP({ ...formP, genera_nc: e.target.checked })} />
                  Escala a No Conformidad (10.2)
                </label>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setFormP(null)}>Cancelar</Button>
                  <Button size="sm" disabled={saving} onClick={guardarP}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
