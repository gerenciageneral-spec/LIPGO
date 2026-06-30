"use client"

// SIG — Gestión de No Conformidades (ISO 9001 10.2 y 8.7).
// Dos vistas:
//  - Catálogo preventivo: posibles no conformes por proceso/etapa (interno vs
//    externo / afecta o no al cliente). Análisis basado en riesgos (6.1).
//  - Registro real: NC ocurridas con corrección, causa raíz, acción correctiva,
//    estado y eficacia (10.2). El catálogo alimenta el registro.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader } from "@/components/sst/sig-ui"
import {
  getProcesos,
  getNcCatalogo,
  upsertNcCatalogo,
  eliminarNcCatalogo,
  getNoConformidades,
  upsertNoConformidad,
  eliminarNoConformidad,
} from "@/lib/sig-actions"
import { getClientesLIP } from "@/lib/sig-actions"
import type { SigProceso, SigNcCatalogo, SigNoConformidad } from "@/lib/sig-types"
import { Loader2, AlertOctagon, Plus, Pencil, Trash2, ShieldAlert, ClipboardList } from "lucide-react"

interface Props {
  selectedEmpresaId?: number | null
}

const ESTADO_NC: Record<string, { label: string; color: string }> = {
  abierta: { label: "Abierta", color: SST_TOKENS.bad },
  en_proceso: { label: "En proceso", color: SST_TOKENS.warn },
  cerrada: { label: "Cerrada", color: SST_TOKENS.ok },
  anulada: { label: "Anulada", color: "#94a3b8" },
}

const ORIGENES = [
  { v: "proceso", l: "Detectada en el proceso" },
  { v: "auditoria", l: "Auditoría interna" },
  { v: "queja", l: "Queja / PQRSF del cliente" },
  { v: "inspeccion", l: "Inspección" },
  { v: "autorreporte", l: "Autorreporte" },
  { v: "revision_direccion", l: "Revisión por la dirección" },
]

type FormCat = Partial<SigNcCatalogo> & { proceso_codigo: string; descripcion: string }
type FormNc = Partial<SigNoConformidad> & { descripcion: string }

export function NoConformidadesSIG({ selectedEmpresaId: propEmpresaId }: Props) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId
  const { toast } = useToast()

  const [procesos, setProcesos] = useState<SigProceso[]>([])
  const [catalogo, setCatalogo] = useState<SigNcCatalogo[]>([])
  const [registro, setRegistro] = useState<SigNoConformidad[]>([])
  const [clientes, setClientes] = useState<{ id: number; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [formCat, setFormCat] = useState<FormCat | null>(null)
  const [formNc, setFormNc] = useState<FormNc | null>(null)
  const [saving, setSaving] = useState(false)
  const [filtroProceso, setFiltroProceso] = useState<string>("")
  const [filtroCliente, setFiltroCliente] = useState<string>("")

  async function cargar() {
    setLoading(true)
    const [p, c, r, emp] = await Promise.all([
      getProcesos(empresaId),
      getNcCatalogo(empresaId),
      getNoConformidades(empresaId),
      getAllEmpresas(),
    ])
    if (p.success) setProcesos(p.data)
    if (c.success) setCatalogo(c.data)
    if (r.success) setRegistro(r.data)
    setClientes(emp ?? [])
    if (!p.success || !c.success || !r.success)
      toast({ title: "No se pudo cargar", description: p.error || c.error || r.error })
    setLoading(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const nombreProceso = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of procesos) m[p.codigo] = p.nombre
    return m
  }, [procesos])

  const nombreCliente = useMemo(() => {
    const m: Record<number, string> = {}
    for (const c of clientes) m[c.id] = c.nombre
    return m
  }, [clientes])

  const catPorProceso = useMemo(() => {
    const m: Record<string, SigNcCatalogo[]> = {}
    for (const c of catalogo) (m[c.proceso_codigo] = m[c.proceso_codigo] || []).push(c)
    return m
  }, [catalogo])

  const registroFiltrado = useMemo(
    () =>
      registro.filter(
        (r) =>
          (!filtroProceso || r.proceso_codigo === filtroProceso) &&
          (!filtroCliente || String(r.proyecto_id ?? "") === filtroCliente),
      ),
    [registro, filtroProceso, filtroCliente],
  )

  const kpis = useMemo(() => {
    const abiertas = registro.filter((r) => r.estado === "abierta").length
    const enProceso = registro.filter((r) => r.estado === "en_proceso").length
    const cerradas = registro.filter((r) => r.estado === "cerrada").length
    const afectanCliente = registro.filter((r) => r.afecta_cliente).length
    return { total: registro.length, abiertas, enProceso, cerradas, afectanCliente }
  }, [registro])

  async function guardarCat() {
    if (!formCat) return
    setSaving(true)
    const res = await upsertNcCatalogo(formCat, empresaId)
    setSaving(false)
    if (res.success) {
      toast({ title: formCat.id ? "Ítem actualizado" : "Ítem agregado" })
      setFormCat(null)
      cargar()
    } else toast({ title: "No se pudo guardar", description: res.error })
  }
  async function borrarCat(c: SigNcCatalogo) {
    if (!confirm("¿Eliminar este posible no conforme del catálogo?")) return
    const res = await eliminarNcCatalogo(c.id)
    if (res.success) cargar()
    else toast({ title: "No se pudo eliminar", description: res.error })
  }

  async function guardarNc() {
    if (!formNc) return
    setSaving(true)
    const res = await upsertNoConformidad(formNc, empresaId)
    setSaving(false)
    if (res.success) {
      toast({ title: formNc.id ? "NC actualizada" : "NC registrada" })
      setFormNc(null)
      cargar()
    } else toast({ title: "No se pudo guardar", description: res.error })
  }
  async function borrarNc(r: SigNoConformidad) {
    if (!confirm("¿Eliminar esta no conformidad?")) return
    const res = await eliminarNoConformidad(r.id)
    if (res.success) cargar()
    else toast({ title: "No se pudo eliminar", description: res.error })
  }

  // Pre-cargar el formulario de NC a partir de un ítem del catálogo.
  function nuevaNcDesde(c: SigNcCatalogo) {
    setFormNc({
      proceso_codigo: c.proceso_codigo,
      catalogo_id: c.id,
      descripcion: c.descripcion,
      tipo: c.tipo,
      afecta_cliente: c.afecta_cliente ?? false,
      requisito_incumplido: c.requisito_iso,
      origen: "proceso",
      estado: "abierta",
      eficacia: "pendiente",
    })
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
        Icon={AlertOctagon}
        title="No Conformidades (10.2 / 8.7)"
        subtitle="Análisis preventivo por proceso y gestión de NC reales · SIG único de LIP (las NC se etiquetan por cliente/sitio)"
      />

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo">
            <ShieldAlert className="mr-2 h-4 w-4" />
            Catálogo preventivo por proceso
          </TabsTrigger>
          <TabsTrigger value="registro">
            <ClipboardList className="mr-2 h-4 w-4" />
            Registro de NC ({kpis.total})
          </TabsTrigger>
        </TabsList>

        {/* ---------------- CATÁLOGO PREVENTIVO ---------------- */}
        <TabsContent value="catalogo" className="space-y-4 pt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Posibles no conformes anticipados por proceso/etapa. <b>Interno</b> = afecta a LIP;{" "}
              <b>externo</b> = puede llegar al cliente (salida no conforme, 8.7).
            </p>
            <Button
              size="sm"
              onClick={() => setFormCat({ proceso_codigo: procesos[0]?.codigo ?? "", descripcion: "", tipo: "interno" })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo
            </Button>
          </div>

          {procesos.map((p) => {
            const items = catPorProceso[p.codigo] ?? []
            if (items.length === 0) return null
            return (
              <Card key={p.codigo} className="overflow-hidden">
                <div className="flex items-center justify-between border-b px-4 py-2" style={{ background: SST_TOKENS.light }}>
                  <span className="font-semibold" style={{ color: SST_TOKENS.navy }}>
                    {p.nombre}
                    <span className="ml-2 text-[11px] font-normal uppercase text-muted-foreground">{p.tipo}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{items.length} posibles NC</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                        <th className="px-3 py-2">Etapa</th>
                        <th className="px-3 py-2">Posible no conforme</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Cliente</th>
                        <th className="px-3 py-2">Requisito ISO</th>
                        <th className="px-3 py-2">Detección</th>
                        <th className="px-3 py-2">Acción</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((c) => (
                        <tr key={c.id} className="group border-b align-top last:border-0">
                          <td className="px-3 py-2 font-medium">{c.etapa}</td>
                          <td className="px-3 py-2">{c.descripcion}</td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              style={{
                                borderColor: c.tipo === "externo" ? SST_TOKENS.bad : SST_TOKENS.navy,
                                color: c.tipo === "externo" ? SST_TOKENS.bad : SST_TOKENS.navy,
                              }}
                            >
                              {c.tipo}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {c.afecta_cliente ? (
                              <span style={{ color: SST_TOKENS.bad }}>Sí</span>
                            ) : (
                              <span className="text-muted-foreground">No</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{c.requisito_iso}</td>
                          <td className="px-3 py-2 text-xs">{c.deteccion}</td>
                          <td className="px-3 py-2 text-xs">{c.accion}</td>
                          <td className="px-3 py-2">
                            <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={() => nuevaNcDesde(c)}
                                className="text-muted-foreground hover:text-red-600"
                                title="Registrar NC real a partir de este ítem"
                              >
                                <AlertOctagon className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setFormCat({ ...c })}
                                className="text-muted-foreground hover:text-foreground"
                                title="Editar"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => borrarCat(c)}
                                className="text-muted-foreground hover:text-red-600"
                                title="Eliminar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          })}
        </TabsContent>

        {/* ---------------- REGISTRO REAL ---------------- */}
        <TabsContent value="registro" className="space-y-4 pt-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { l: "Total", v: kpis.total, c: SST_TOKENS.navy },
              { l: "Abiertas", v: kpis.abiertas, c: SST_TOKENS.bad },
              { l: "En proceso", v: kpis.enProceso, c: SST_TOKENS.warn },
              { l: "Cerradas", v: kpis.cerradas, c: SST_TOKENS.ok },
              { l: "Afectan cliente", v: kpis.afectanCliente, c: SST_TOKENS.bad },
            ].map((k) => (
              <Card key={k.l} className="p-3">
                <div className="text-2xl font-bold" style={{ color: k.c }}>
                  {k.v}
                </div>
                <div className="text-[11px] uppercase text-muted-foreground">{k.l}</div>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <select
                value={filtroProceso}
                onChange={(e) => setFiltroProceso(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Todos los procesos</option>
                {procesos.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <select
                value={filtroCliente}
                onChange={(e) => setFiltroCliente(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Todos los clientes/sitios</option>
                {clientes.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <Button size="sm" onClick={() => setFormNc({ descripcion: "", proceso_codigo: procesos[0]?.codigo, estado: "abierta", eficacia: "pendiente", origen: "proceso", tipo: "interno" })}>
              <Plus className="mr-2 h-4 w-4" />
              Registrar NC
            </Button>
          </div>

          {registroFiltrado.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No hay no conformidades registradas{filtroProceso ? " para este proceso" : ""}.
            </Card>
          ) : (
            <div className="space-y-2">
              {registroFiltrado.map((r) => {
                const est = ESTADO_NC[r.estado ?? "abierta"] ?? ESTADO_NC.abierta
                return (
                  <Card key={r.id} className="group overflow-hidden border-l-4 p-3" style={{ borderLeftColor: est.color }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold" style={{ color: SST_TOKENS.ink }}>
                            {r.codigo || "NC"}
                          </span>
                          <Badge style={{ background: est.color, color: "white" }}>{est.label}</Badge>
                          <span className="text-xs text-muted-foreground">{nombreProceso[r.proceso_codigo ?? ""] || r.proceso_codigo}</span>
                          {r.proyecto_id != null && nombreCliente[r.proyecto_id] && (
                            <Badge variant="outline" style={{ borderColor: SST_TOKENS.teal, color: SST_TOKENS.teal }}>
                              {nombreCliente[r.proyecto_id]}
                            </Badge>
                          )}
                          {r.afecta_cliente && (
                            <Badge variant="outline" style={{ borderColor: SST_TOKENS.bad, color: SST_TOKENS.bad }}>
                              Afecta cliente
                            </Badge>
                          )}
                          {r.fecha && <span className="text-xs text-muted-foreground">{r.fecha}</span>}
                        </div>
                        <p className="mt-1 text-sm">{r.descripcion}</p>
                        <div className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground md:grid-cols-2">
                          {r.requisito_incumplido && <span><b>Requisito:</b> {r.requisito_incumplido}</span>}
                          {r.causa_raiz && <span><b>Causa raíz:</b> {r.causa_raiz}</span>}
                          {r.correccion && <span><b>Corrección:</b> {r.correccion}</span>}
                          {r.accion_correctiva && <span><b>Acción correctiva:</b> {r.accion_correctiva}</span>}
                          {r.responsable && <span><b>Responsable:</b> {r.responsable}</span>}
                          {r.fecha_compromiso && <span><b>Compromiso:</b> {r.fecha_compromiso}</span>}
                        </div>
                      </div>
                      <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => setFormNc({ ...r })} className="text-muted-foreground hover:text-foreground" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => borrarNc(r)} className="text-muted-foreground hover:text-red-600" title="Eliminar">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ---------------- DIALOG CATÁLOGO ---------------- */}
      <Dialog open={!!formCat} onOpenChange={(o) => !o && setFormCat(null)}>
        <DialogContent className="max-w-lg">
          {formCat && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  {formCat.id ? "Editar" : "Nuevo"} posible no conforme
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={formCat.proceso_codigo}
                    onChange={(e) => setFormCat({ ...formCat, proceso_codigo: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    {procesos.map((p) => (
                      <option key={p.codigo} value={p.codigo}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={formCat.etapa ?? ""}
                    onChange={(e) => setFormCat({ ...formCat, etapa: e.target.value })}
                    placeholder="Etapa / momento"
                  />
                </div>
                <Textarea
                  value={formCat.descripcion}
                  onChange={(e) => setFormCat({ ...formCat, descripcion: e.target.value })}
                  placeholder="Posible no conforme"
                  className="min-h-[60px]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={formCat.tipo ?? "interno"}
                    onChange={(e) => setFormCat({ ...formCat, tipo: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="interno">Interno (afecta a LIP)</option>
                    <option value="externo">Externo (puede llegar al cliente)</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!formCat.afecta_cliente}
                      onChange={(e) => setFormCat({ ...formCat, afecta_cliente: e.target.checked })}
                    />
                    Afecta al cliente
                  </label>
                </div>
                <Input
                  value={formCat.requisito_iso ?? ""}
                  onChange={(e) => setFormCat({ ...formCat, requisito_iso: e.target.value })}
                  placeholder="Requisito ISO (ej. ISO 9001 8.5.1)"
                />
                <Textarea
                  value={formCat.deteccion ?? ""}
                  onChange={(e) => setFormCat({ ...formCat, deteccion: e.target.value })}
                  placeholder="¿Cómo se detecta?"
                  className="min-h-[44px]"
                />
                <Textarea
                  value={formCat.accion ?? ""}
                  onChange={(e) => setFormCat({ ...formCat, accion: e.target.value })}
                  placeholder="Acción típica"
                  className="min-h-[44px]"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setFormCat(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" disabled={saving} onClick={guardarCat}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------------- DIALOG REGISTRO NC ---------------- */}
      <Dialog open={!!formNc} onOpenChange={(o) => !o && setFormNc(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {formNc && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{formNc.id ? "Editar" : "Registrar"} no conformidad</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={formNc.codigo ?? ""}
                    onChange={(e) => setFormNc({ ...formNc, codigo: e.target.value })}
                    placeholder="Código (NC-2026-00X)"
                  />
                  <Input
                    type="date"
                    value={formNc.fecha ?? ""}
                    onChange={(e) => setFormNc({ ...formNc, fecha: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={formNc.proceso_codigo ?? ""}
                    onChange={(e) => setFormNc({ ...formNc, proceso_codigo: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">— Proceso —</option>
                    {procesos.map((p) => (
                      <option key={p.codigo} value={p.codigo}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <select
                    value={formNc.origen ?? "proceso"}
                    onChange={(e) => setFormNc({ ...formNc, origen: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    {ORIGENES.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.l}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={formNc.proyecto_id ?? ""}
                  onChange={(e) =>
                    setFormNc({ ...formNc, proyecto_id: e.target.value ? Number(e.target.value) : null })
                  }
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">— Cliente / sitio (opcional) —</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <Textarea
                  value={formNc.descripcion}
                  onChange={(e) => setFormNc({ ...formNc, descripcion: e.target.value })}
                  placeholder="Descripción de la no conformidad"
                  className="min-h-[60px]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={formNc.tipo ?? "interno"}
                    onChange={(e) => setFormNc({ ...formNc, tipo: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="interno">Interno</option>
                    <option value="externo">Externo</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!formNc.afecta_cliente}
                      onChange={(e) => setFormNc({ ...formNc, afecta_cliente: e.target.checked })}
                    />
                    Afecta al cliente
                  </label>
                </div>
                <Input
                  value={formNc.requisito_incumplido ?? ""}
                  onChange={(e) => setFormNc({ ...formNc, requisito_incumplido: e.target.value })}
                  placeholder="Requisito incumplido"
                />
                <Textarea
                  value={formNc.correccion ?? ""}
                  onChange={(e) => setFormNc({ ...formNc, correccion: e.target.value })}
                  placeholder="Corrección / contención inmediata"
                  className="min-h-[44px]"
                />
                <Textarea
                  value={formNc.causa_raiz ?? ""}
                  onChange={(e) => setFormNc({ ...formNc, causa_raiz: e.target.value })}
                  placeholder="Análisis de causa raíz"
                  className="min-h-[44px]"
                />
                <Textarea
                  value={formNc.accion_correctiva ?? ""}
                  onChange={(e) => setFormNc({ ...formNc, accion_correctiva: e.target.value })}
                  placeholder="Acción correctiva (10.2)"
                  className="min-h-[44px]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={formNc.responsable ?? ""}
                    onChange={(e) => setFormNc({ ...formNc, responsable: e.target.value })}
                    placeholder="Responsable"
                  />
                  <Input
                    type="date"
                    value={formNc.fecha_compromiso ?? ""}
                    onChange={(e) => setFormNc({ ...formNc, fecha_compromiso: e.target.value })}
                    placeholder="Fecha compromiso"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={formNc.estado ?? "abierta"}
                    onChange={(e) => setFormNc({ ...formNc, estado: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="abierta">Abierta</option>
                    <option value="en_proceso">En proceso</option>
                    <option value="cerrada">Cerrada</option>
                    <option value="anulada">Anulada</option>
                  </select>
                  <select
                    value={formNc.eficacia ?? "pendiente"}
                    onChange={(e) => setFormNc({ ...formNc, eficacia: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="pendiente">Eficacia pendiente</option>
                    <option value="eficaz">Eficaz</option>
                    <option value="no_eficaz">No eficaz</option>
                  </select>
                </div>
                {(formNc.estado === "cerrada" || formNc.fecha_cierre) && (
                  <Input
                    type="date"
                    value={formNc.fecha_cierre ?? ""}
                    onChange={(e) => setFormNc({ ...formNc, fecha_cierre: e.target.value })}
                    placeholder="Fecha de cierre"
                  />
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setFormNc(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" disabled={saving} onClick={guardarNc}>
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
