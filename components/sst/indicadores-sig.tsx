"use client"

// SIG — Tablero de Indicadores / Balanced Scorecard (ISO 9001 9.1 + 6.2).
// El "cerebro" de las 3 ISO: conecta los OBJETIVOS de la empresa con los
// indicadores por PERSPECTIVA (BSC) y por ÁREA, mostrando para cada uno su
// finalidad, fórmula, responsable, cliente interno/externo, su contribución
// al objetivo gerencial y su EFICACIA (resultado vs meta). Los automáticos se
// calculan EN VIVO desde LIPgo (cabeceraoc, citasvehiculos, invtrans, headcount,
// sig_satisfaccion) y se filtran por cliente/sitio y periodo.

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader, SigFilterBar, SigField, SigKpi, SigDatePicker } from "@/components/sst/sig-ui"
import { useAuth } from "@/components/auth-provider"
import {
  getIndicadores,
  getIndicadoresValores,
  getObjetivos,
  upsertIndicador,
  eliminarIndicador,
} from "@/lib/sig-actions"
import type { SigIndicador, SigIndicadorValor, SigObjetivo } from "@/lib/sig-types"
import { Loader2, Gauge, Plus, Pencil, Trash2, Zap, Target, Layers } from "lucide-react"

const PARTES: { v: string; l: string }[] = [
  { v: "cliente", l: "Cliente" },
  { v: "conductor", l: "Conductor / transportista" },
  { v: "proveedor", l: "Proveedor" },
  { v: "colaborador", l: "Colaborador" },
  { v: "direccion", l: "Dirección" },
  { v: "legal", l: "Legal / entes de control" },
]

// Las 4 perspectivas del Balanced Scorecard.
const PERSPECTIVAS: { v: string; l: string; desc: string; color: string }[] = [
  { v: "financiera", l: "Financiera / Dirección", desc: "Sostenibilidad y resultados para la dirección", color: SST_TOKENS.navy },
  { v: "cliente", l: "Cliente y partes interesadas", desc: "Valor percibido por el cliente externo", color: SST_TOKENS.teal },
  { v: "procesos", l: "Procesos internos", desc: "Eficiencia operativa del servicio", color: "#7c3aed" },
  { v: "aprendizaje", l: "Aprendizaje y crecimiento", desc: "Personas, tecnología y mejora", color: "#d97706" },
]

const AREAS = [
  "Dirección Estratégica",
  "Cargue y Descargue",
  "Almacenamiento e Inventarios",
  "Gestión Humana",
  "Seguridad y Salud en el Trabajo (SST)",
  "Compras y Proveedores",
  "Evaluación y Mejora",
  "Tecnología (LIPgo)",
]

type FormInd = Partial<SigIndicador> & { codigo: string; nombre: string }

export function IndicadoresSIG() {
  const { toast } = useToast()
  const [indicadores, setIndicadores] = useState<SigIndicador[]>([])
  const [objetivos, setObjetivos] = useState<SigObjetivo[]>([])
  const [valores, setValores] = useState<Record<string, SigIndicadorValor>>({})
  const [loading, setLoading] = useState(true)
  const [calculando, setCalculando] = useState(false)
  const [form, setForm] = useState<FormInd | null>(null)
  const [saving, setSaving] = useState(false)

  // El cliente/sitio lo define el SELECTOR GLOBAL (conector) de la app.
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const [desde, setDesde] = useState<string>("")
  const [hasta, setHasta] = useState<string>("")

  async function cargarCatalogo() {
    setLoading(true)
    const [ind, obj] = await Promise.all([getIndicadores(), getObjetivos()])
    if (ind.success) setIndicadores(ind.data)
    else toast({ title: "No se pudo cargar", description: ind.error })
    if (obj.success) setObjetivos(obj.data)
    setLoading(false)
  }
  async function calcularValores() {
    setCalculando(true)
    const r = await getIndicadoresValores(selectedEmpresaId ?? null, desde || null, hasta || null)
    if (r.success) setValores(r.valores)
    else toast({ title: "No se pudieron calcular los valores", description: r.error })
    setCalculando(false)
  }

  useEffect(() => {
    cargarCatalogo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    calcularValores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId, desde, hasta])

  // Valor efectivo (vivo o manual).
  function valorDe(ind: SigIndicador): { valor: number | null; base?: string; vivo: boolean } {
    if (ind.calculo_auto && valores[ind.calculo_auto]) {
      return { valor: valores[ind.calculo_auto].valor, base: valores[ind.calculo_auto].base, vivo: true }
    }
    return { valor: ind.valor_manual ?? null, vivo: false }
  }
  // Eficacia % = qué tanto se acerca el resultado a la meta (según el sentido).
  function eficaciaDe(ind: SigIndicador, valor: number | null): number | null {
    if (valor == null || ind.meta == null || !ind.sentido) return null
    if (ind.sentido === "mayor_mejor") return ind.meta > 0 ? Math.round((valor / ind.meta) * 100) : null
    // menor_mejor
    if (valor <= ind.meta) return 100
    return valor > 0 ? Math.round((ind.meta / valor) * 100) : 100
  }
  function colorEf(ef: number | null): string {
    if (ef == null) return SST_TOKENS.navy
    if (ef >= 100) return SST_TOKENS.ok
    if (ef >= 85) return SST_TOKENS.warn
    return SST_TOKENS.bad
  }
  function colorSemaforo(ind: SigIndicador, valor: number | null): string {
    return colorEf(eficaciaDe(ind, valor))
  }
  const efOf = (i: SigIndicador) => eficaciaDe(i, valorDe(i).valor)
  const fmtV = (v: number | null) => (v == null ? "—" : v.toLocaleString("es-CO"))

  // ----- Scorecard global -----
  const score = useMemo(() => {
    const conMeta = indicadores.filter((i) => i.meta != null && i.sentido)
    const efs = conMeta.map(efOf).filter((x): x is number => x != null)
    const eficaciaGlobal = efs.length ? Math.round(efs.reduce((a, b) => a + b, 0) / efs.length) : null
    const enMeta = conMeta.filter((i) => { const e = efOf(i); return e != null && e >= 100 }).length
    const vivos = indicadores.filter((i) => i.calculo_auto).length
    const objCumplidos = objetivos.filter((o) => o.estado === "cumplido").length
    return { eficaciaGlobal, enMeta, conMeta: conMeta.length, vivos, objTotal: objetivos.length, objCumplidos }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicadores, valores, objetivos])

  const gerenciales = useMemo(() => indicadores.filter((i) => i.tipo === "gerencial"), [indicadores])
  const porProceso = useMemo(() => indicadores.filter((i) => i.tipo !== "gerencial"), [indicadores])

  async function guardar() {
    if (!form) return
    setSaving(true)
    const res = await upsertIndicador(form as any, null)
    setSaving(false)
    if (res.success) {
      toast({ title: form.id ? "Indicador actualizado" : "Indicador agregado" })
      setForm(null)
      cargarCatalogo()
    } else toast({ title: "No se pudo guardar", description: res.error })
  }
  async function borrar(i: SigIndicador) {
    if (!confirm("¿Eliminar este indicador?")) return
    const res = await eliminarIndicador(i.id)
    if (res.success) cargarCatalogo()
    else toast({ title: "No se pudo eliminar", description: res.error })
  }

  // ---- Fila de indicador (tabla del tablero) ----
  function filaInd(ind: SigIndicador) {
    const { valor, base, vivo } = valorDe(ind)
    const ef = eficaciaDe(ind, valor)
    const color = colorEf(ef)
    return (
      <tr key={ind.id} className="group border-b align-top last:border-0">
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5 font-medium" style={{ color: SST_TOKENS.ink }}>
            {ind.nombre}
            {vivo && <Zap className="h-3.5 w-3.5" style={{ color: SST_TOKENS.teal }} aria-label="En vivo" />}
          </div>
          <div className="text-[11px] text-muted-foreground">{ind.codigo} · {ind.area}</div>
          {ind.finalidad && <div className="mt-0.5 text-[11px] text-muted-foreground">{ind.finalidad}</div>}
        </td>
        <td className="px-3 py-2 text-[11px] text-muted-foreground">{ind.formula}</td>
        <td className="px-3 py-2 text-[11px]">
          <div><span className="text-muted-foreground">Resp.:</span> {ind.responsable || "—"}</div>
          <div><span className="text-muted-foreground">C. interno:</span> {ind.cliente_interno || "—"}</div>
          <div><span className="text-muted-foreground">C. externo:</span> {ind.cliente_externo || "—"}</div>
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <span className="text-lg font-bold" style={{ color }}>{fmtV(valor)}</span>
          <span className="ml-0.5 text-[11px] text-muted-foreground">{ind.unidad}</span>
          {ind.meta != null && (
            <div className="text-[11px] text-muted-foreground">meta {ind.sentido === "menor_mejor" ? "≤" : "≥"} {ind.meta}{ind.unidad === "%" ? "%" : ""}</div>
          )}
          {base && <div className="text-[10px] text-muted-foreground">{base}</div>}
        </td>
        <td className="px-3 py-2" style={{ minWidth: 110 }}>
          {ef == null ? (
            <span className="text-[11px] text-muted-foreground">{ind.fuente !== "manual" && !vivo ? "por alimentar" : "informativo"}</span>
          ) : (
            <div>
              <div className="flex items-center justify-between text-[11px]"><span className="font-semibold" style={{ color }}>{ef}%</span></div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${Math.min(ef, 100)}%`, background: color }} />
              </div>
              {ind.contribucion && <div className="mt-0.5 text-[10px] text-muted-foreground">{ind.contribucion}</div>}
            </div>
          )}
        </td>
        <td className="px-2 py-2">
          <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={() => setForm({ ...ind })} className="text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => borrar(ind)} className="text-muted-foreground hover:text-red-600" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
          </span>
        </td>
      </tr>
    )
  }

  function tablaInd(items: SigIndicador[]) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
              <th className="px-3 py-1.5">Indicador / finalidad</th>
              <th className="px-3 py-1.5">Fórmula</th>
              <th className="px-3 py-1.5">Responsable · clientes</th>
              <th className="px-3 py-1.5 text-right">Resultado</th>
              <th className="px-3 py-1.5">Eficacia · contribución</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>{items.map(filaInd)}</tbody>
        </table>
      </div>
    )
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
        Icon={Gauge}
        title="BSC · Cuadro de Mando Integral"
        subtitle={<>Tablero gerencial: objetivos → perspectivas → indicadores por área, eficacia y contribución · <Zap className="inline h-3 w-3 text-white" /> en vivo desde LIPgo</>}
        right={
          <Button size="sm" variant="secondary" onClick={() => setForm({ codigo: "", nombre: "", tipo: "resultado", sentido: "mayor_mejor", unidad: "%", perspectiva: "procesos" })}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo indicador
          </Button>
        }
      />

      <SigFilterBar cliente={selectedEmpresaNombre}>
        <SigField label="Desde">
          <SigDatePicker value={desde} onChange={setDesde} />
        </SigField>
        <SigField label="Hasta">
          <SigDatePicker value={hasta} onChange={setHasta} />
        </SigField>
        {(desde || hasta) && (
          <Button variant="ghost" size="sm" onClick={() => { setDesde(""); setHasta("") }}>Limpiar</Button>
        )}
        {calculando && <Loader2 className="h-4 w-4 animate-spin" style={{ color: SST_TOKENS.teal }} />}
      </SigFilterBar>

      {/* Scorecard global */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SigKpi label="Eficacia global del SIG" Icon={Gauge} accent={colorEf(score.eficaciaGlobal)} valueColor={colorEf(score.eficaciaGlobal)}
          value={score.eficaciaGlobal == null ? "—" : `${score.eficaciaGlobal}%`} sub="promedio de eficacia vs meta" />
        <SigKpi label="Indicadores en meta" Icon={Target} accent={SST_TOKENS.ok} valueColor={SST_TOKENS.ok}
          value={<>{score.enMeta}<span className="text-base text-muted-foreground">/{score.conMeta}</span></>} sub="cumpliendo su objetivo" />
        <SigKpi label="Objetivos estratégicos" Icon={Target} accent={SST_TOKENS.navy}
          value={<>{score.objCumplidos}<span className="text-base text-muted-foreground">/{score.objTotal}</span></>} sub="cumplidos" />
        <SigKpi label="Indicadores en vivo" Icon={Zap} accent={SST_TOKENS.teal} valueColor={SST_TOKENS.teal}
          value={<>{score.vivos}<span className="text-base text-muted-foreground">/{indicadores.length}</span></>} sub="calculados desde LIPgo" />
      </div>

      <Tabs defaultValue="areas">
        <TabsList>
          <TabsTrigger value="areas">Por área</TabsTrigger>
          <TabsTrigger value="perspectivas">Perspectivas (BSC)</TabsTrigger>
          <TabsTrigger value="objetivos">Por objetivo estratégico</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo ({indicadores.length})</TabsTrigger>
        </TabsList>

        {/* ---- Tablero por PERSPECTIVA (BSC) ---- */}
        <TabsContent value="perspectivas" className="space-y-4 pt-3">
          {PERSPECTIVAS.map((p) => {
            const items = indicadores.filter((i) => (i.perspectiva || "procesos") === p.v)
            if (items.length === 0) return null
            const efs = items.map(efOf).filter((x): x is number => x != null)
            const efProm = efs.length ? Math.round(efs.reduce((a, b) => a + b, 0) / efs.length) : null
            return (
              <Card key={p.v} className="overflow-hidden border-l-4 p-0" style={{ borderLeftColor: p.color }}>
                <div className="flex items-center justify-between px-3 py-2" style={{ background: `${p.color}10` }}>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: p.color }}>{p.l}</div>
                    <div className="text-[11px] text-muted-foreground">{p.desc}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold" style={{ color: colorEf(efProm) }}>{efProm == null ? "—" : `${efProm}%`}</span>
                    <div className="text-[10px] text-muted-foreground">{items.length} indicadores</div>
                  </div>
                </div>
                {tablaInd(items)}
              </Card>
            )
          })}
        </TabsContent>

        {/* ---- Cascada por OBJETIVO estratégico ---- */}
        <TabsContent value="objetivos" className="space-y-4 pt-3">
          <p className="text-xs text-muted-foreground">Cada objetivo de la empresa con las áreas e indicadores que contribuyen a lograrlo (6.2 ↔ 9.1).</p>
          {objetivos.map((o) => {
            const items = indicadores.filter((i) => i.objetivo_id === o.id)
            const efs = items.map(efOf).filter((x): x is number => x != null)
            const efProm = efs.length ? Math.round(efs.reduce((a, b) => a + b, 0) / efs.length) : null
            const estadoColor = o.estado === "cumplido" ? SST_TOKENS.ok : o.estado === "atrasado" ? SST_TOKENS.bad : SST_TOKENS.warn
            return (
              <Card key={o.id} className="overflow-hidden p-0">
                <div className="flex items-start justify-between gap-3 border-b px-3 py-2">
                  <div className="flex items-start gap-2">
                    <Target className="mt-0.5 h-4 w-4" style={{ color: SST_TOKENS.navy }} />
                    <div>
                      <div className="text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>{o.objetivo}</div>
                      <div className="text-[11px] text-muted-foreground">{o.norma_codigo} · Meta: {o.meta || "—"} · Resp.: {o.responsable || "—"}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge style={{ background: estadoColor, color: "white" }}>{o.estado}</Badge>
                    {efProm != null && <div className="mt-0.5 text-sm font-bold" style={{ color: colorEf(efProm) }}>{efProm}%</div>}
                  </div>
                </div>
                {items.length > 0 ? tablaInd(items) : <div className="px-3 py-3 text-[11px] text-muted-foreground">Sin indicadores amarrados todavía.</div>}
              </Card>
            )
          })}
        </TabsContent>

        {/* ---- Por ÁREA ---- */}
        <TabsContent value="areas" className="space-y-4 pt-3">
          {AREAS.map((a) => {
            const items = indicadores.filter((i) => (i.area || "") === a)
            if (items.length === 0) return null
            const efs = items.map(efOf).filter((x): x is number => x != null)
            const efProm = efs.length ? Math.round(efs.reduce((s, b) => s + b, 0) / efs.length) : null
            return (
              <Card key={a} className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>
                    <Layers className="h-4 w-4" style={{ color: SST_TOKENS.navy }} /> {a}
                  </div>
                  <span className="text-sm font-bold" style={{ color: colorEf(efProm) }}>{efProm == null ? "—" : `${efProm}%`}</span>
                </div>
                {tablaInd(items)}
              </Card>
            )
          })}
        </TabsContent>

        {/* ---- Catálogo (tarjetas) ---- */}
        <TabsContent value="catalogo" className="space-y-5 pt-3">
          {gerenciales.length > 0 && (
            <div>
              <h2 className="mb-2 text-base font-semibold" style={{ color: SST_TOKENS.ink }}>Indicadores gerenciales</h2>
              <Card className="overflow-hidden p-0">{tablaInd(gerenciales)}</Card>
            </div>
          )}
          {porProceso.length > 0 && (
            <div>
              <h2 className="mb-2 text-base font-semibold" style={{ color: SST_TOKENS.ink }}>Indicadores de resultado por proceso / área</h2>
              <Card className="overflow-hidden p-0">{tablaInd(porProceso)}</Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* DIALOG CRUD */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{form.id ? "Editar" : "Nuevo"} indicador</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Código (IND-CD-01)" />
                  <select value={form.tipo ?? "resultado"} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="gerencial">Gerencial (estratégico)</option>
                    <option value="resultado">Resultado por proceso</option>
                  </select>
                </div>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre del indicador" />
                <Input value={form.formula ?? ""} onChange={(e) => setForm({ ...form, formula: e.target.value })} placeholder="Fórmula / definición" />
                <Input value={form.finalidad ?? ""} onChange={(e) => setForm({ ...form, finalidad: e.target.value })} placeholder="Finalidad (¿para qué sirve?)" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={form.perspectiva ?? ""} onChange={(e) => setForm({ ...form, perspectiva: e.target.value || null })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">— Perspectiva BSC —</option>
                    {PERSPECTIVAS.map((p) => (<option key={p.v} value={p.v}>{p.l}</option>))}
                  </select>
                  <select value={form.area ?? ""} onChange={(e) => setForm({ ...form, area: e.target.value || null })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">— Área —</option>
                    {AREAS.map((a) => (<option key={a} value={a}>{a}</option>))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={form.proceso_codigo ?? ""} onChange={(e) => setForm({ ...form, proceso_codigo: e.target.value || null })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">— Proceso —</option>
                    {["DE", "CD", "AI", "GH", "TI", "CO", "EM"].map((p) => (<option key={p} value={p}>{p}</option>))}
                  </select>
                  <select value={form.objetivo_id ?? ""} onChange={(e) => setForm({ ...form, objetivo_id: e.target.value === "" ? null : Number(e.target.value) })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">— Objetivo estratégico —</option>
                    {objetivos.map((o) => (<option key={o.id} value={o.id}>{o.objetivo.slice(0, 40)}</option>))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.cliente_interno ?? ""} onChange={(e) => setForm({ ...form, cliente_interno: e.target.value })} placeholder="Cliente interno" />
                  <Input value={form.cliente_externo ?? ""} onChange={(e) => setForm({ ...form, cliente_externo: e.target.value })} placeholder="Cliente externo" />
                </div>
                <Input value={form.contribucion ?? ""} onChange={(e) => setForm({ ...form, contribucion: e.target.value })} placeholder="Contribución al objetivo gerencial" />
                <div className="grid grid-cols-3 gap-2">
                  <Input value={form.unidad ?? ""} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="Unidad (%, ton, #)" />
                  <Input type="number" value={form.meta ?? ""} onChange={(e) => setForm({ ...form, meta: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Meta" />
                  <select value={form.sentido ?? ""} onChange={(e) => setForm({ ...form, sentido: e.target.value || null })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">— Sentido —</option>
                    <option value="mayor_mejor">Mayor es mejor</option>
                    <option value="menor_mejor">Menor es mejor</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.frecuencia ?? ""} onChange={(e) => setForm({ ...form, frecuencia: e.target.value })} placeholder="Frecuencia" />
                  <select value={form.parte_interesada ?? ""} onChange={(e) => setForm({ ...form, parte_interesada: e.target.value || null })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">— Parte interesada —</option>
                    {PARTES.map((p) => (<option key={p.v} value={p.v}>{p.l}</option>))}
                  </select>
                </div>
                <Input value={form.responsable ?? ""} onChange={(e) => setForm({ ...form, responsable: e.target.value })} placeholder="Responsable" />
                {!form.calculo_auto ? (
                  <Input type="number" value={form.valor_manual ?? ""} onChange={(e) => setForm({ ...form, valor_manual: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Valor actual (manual)" />
                ) : (
                  <p className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">Indicador automático ({form.calculo_auto}): el valor se calcula en vivo desde LIPgo.</p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setForm(null)}>Cancelar</Button>
                  <Button size="sm" disabled={saving} onClick={guardar}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
