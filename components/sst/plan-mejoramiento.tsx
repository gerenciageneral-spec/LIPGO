"use client"

// Plan de Mejoramiento del SG-SST. Alimenta/edita sst_plan_mejora
// (ya viene sembrado desde la autoevaluacion 0312). Permite actualizar estado/avance.

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
import { SoportesDocumentales } from "@/components/sst/soportes-documentales"
import {
  listPlanMejora,
  updatePlanMejora,
  createPlanMejora,
  sincronizarPlanConAuditoria,
  cerrarAccionYActualizarEstandar,
} from "@/lib/sst-plan-actions"
import type { PlanMejoraRow } from "@/lib/sst-evidencia-types"
import { RefreshCw, Loader2 } from "lucide-react"

const ESTADO: [string, string][] = [
  ["abierta", "Abierta"],
  ["en_proceso", "En proceso"],
  ["cerrada", "Cerrada"],
  ["vencida", "Vencida"],
]
const TIPO: [string, string][] = [
  ["correctiva", "Correctiva"],
  ["preventiva", "Preventiva"],
  ["mejora", "Mejora"],
]
const estadoColor = (e: string) =>
  e === "cerrada" ? SST_TOKENS.ok : e === "vencida" ? SST_TOKENS.bad : e === "en_proceso" ? SST_TOKENS.warn : "#8896a5"

export function PlanMejoramiento({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [rows, setRows] = useState<PlanMejoraRow[]>([])
  const [tab, setTab] = useState("seguimiento")
  const [sincronizando, setSincronizando] = useState(false)
  const [nuevo, setNuevo] = useState({ hallazgo: "", accion: "", tipo_accion: "correctiva", responsable: "", fecha_fin: "" })
  const setN = (k: string, v: any) => setNuevo((f) => ({ ...f, [k]: v }))

  async function cargar() {
    setRows(await listPlanMejora(empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function patch(id: number, p: Partial<PlanMejoraRow>) {
    // Si se marca como "cerrada", cerramos la accion Y subimos el estandar a cumple.
    if (p.estado === "cerrada") {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, estado: "cerrada", avance: 100 } : r)))
      const res = await cerrarAccionYActualizarEstandar(id)
      if (res.success) {
        toast({
          title: "Acción cerrada",
          description: res.estandarActualizado
            ? "El estándar pasó a CUMPLE y se recalculó la auditoría 0312."
            : "Acción cerrada (sin estándar vinculado).",
        })
      } else {
        toast({ title: "Error al cerrar", description: res.message })
      }
      return
    }
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
    const res = await updatePlanMejora(id, p)
    if (!res.success) toast({ title: "Error al actualizar", description: res.message })
  }

  async function sincronizar() {
    setSincronizando(true)
    const res = await sincronizarPlanConAuditoria(empresaId)
    setSincronizando(false)
    if (res.success) {
      toast({
        title: "Plan sincronizado con la auditoría",
        description: `${res.creadas} acción(es) creada(s) para nuevos no-cumple · ${res.cerradas} acción(es) cerrada(s) por estándares ya subsanados.`,
      })
      cargar()
    } else {
      toast({ title: "No se pudo sincronizar", description: res.message })
    }
  }
  async function crear() {
    if (!nuevo.accion.trim()) {
      toast({ title: "Falta la acción" })
      return
    }
    const res = await createPlanMejora({ ...nuevo, estado: "abierta", avance: 0 } as Partial<PlanMejoraRow>, empresaId)
    if (res.success) {
      toast({ title: "Acción agregada" })
      setNuevo({ hallazgo: "", accion: "", tipo_accion: "correctiva", responsable: "", fecha_fin: "" })
      cargar()
      setTab("seguimiento")
    } else toast({ title: "Error", description: res.message })
  }

  const k = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10)
    return {
      total: rows.length,
      cerradas: rows.filter((r) => r.estado === "cerrada").length,
      pend: rows.filter((r) => r.estado === "abierta" || r.estado === "en_proceso").length,
      venc: rows.filter((r) => r.estado !== "cerrada" && r.fecha_fin && r.fecha_fin < hoy).length,
      avance: rows.length ? Math.round(rows.reduce((s, r) => s + (Number(r.avance) || 0), 0) / rows.length) : 0,
    }
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
          Plan de Mejoramiento del SG-SST
        </h2>
        <Button
          onClick={sincronizar}
          disabled={sincronizando}
          variant="outline"
          style={{ borderColor: SST_TOKENS.navy, color: SST_TOKENS.navy }}
        >
          {sincronizando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sincronizar con auditoría
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        La sincronización crea acciones para los estándares en <strong>no cumple</strong> que aún no las
        tienen y cierra las de estándares ya subsanados. Al marcar una acción como <strong>Cerrada</strong>,
        su estándar pasa a <strong>cumple</strong> y se recalcula la auditoría 0312.
      </p>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Kpi t="Acciones" v={k.total} />
        <Kpi t="Cerradas" v={k.cerradas} c={SST_TOKENS.ok} />
        <Kpi t="Pendientes" v={k.pend} c={SST_TOKENS.warn} />
        <Kpi t="Vencidas" v={k.venc} c={SST_TOKENS.bad} />
        <Kpi t="Avance prom." v={`${k.avance}%`} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="nueva">Agregar acción</TabsTrigger>
        </TabsList>

        <TabsContent value="seguimiento">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Hallazgo / Acción</th>
                  <th className="p-2 text-left">Responsable</th>
                  <th className="p-2 text-left">Fecha fin</th>
                  <th className="p-2 text-center w-28">Avance</th>
                  <th className="p-2 text-left w-36">Estado</th>
                  <th className="p-2 text-left w-64">Soportes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    <td className="p-2">
                      <div className="font-medium">{r.accion}</div>
                      <div className="text-xs text-muted-foreground">{r.hallazgo}</div>
                    </td>
                    <td className="p-2 text-xs">{r.responsable}</td>
                    <td className="p-2 text-xs">{r.fecha_fin}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={r.avance ?? 0}
                        className="h-8"
                        onChange={(e) => patch(r.id, { avance: Number(e.target.value) })}
                      />
                    </td>
                    <td className="p-2">
                      <Sel small v={r.estado} on={(v) => patch(r.id, { estado: v })} o={ESTADO} />
                      <Badge className="mt-1" style={{ background: estadoColor(r.estado), color: "white" }}>
                        {r.estado}
                      </Badge>
                    </td>
                    <td className="p-2 align-top">
                      <SoportesDocumentales
                        norma="SST 0312"
                        modulo="Plan de Mejoramiento"
                        referenciaTipo="plan_mejora"
                        referenciaId={r.id}
                        referenciaDesc={r.accion}
                        empresaId={empresaId}
                      />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Sin acciones. Corre el seed del plan o agrega una.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="nueva">
          <Card className="p-4 space-y-3">
            <Field l="Hallazgo">
              <Input value={nuevo.hallazgo} onChange={(e) => setN("hallazgo", e.target.value)} />
            </Field>
            <Field l="Acción">
              <Textarea value={nuevo.accion} onChange={(e) => setN("accion", e.target.value)} />
            </Field>
            <Row3>
              <Field l="Tipo">
                <Sel v={nuevo.tipo_accion} on={(v) => setN("tipo_accion", v)} o={TIPO} />
              </Field>
              <Field l="Responsable">
                <Input value={nuevo.responsable} onChange={(e) => setN("responsable", e.target.value)} />
              </Field>
              <Field l="Fecha fin">
                <Input type="date" value={nuevo.fecha_fin} onChange={(e) => setN("fecha_fin", e.target.value)} />
              </Field>
            </Row3>
            <Button onClick={crear} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Agregar acción
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default PlanMejoramiento
