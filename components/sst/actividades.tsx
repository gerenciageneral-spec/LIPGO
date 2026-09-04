"use client"

// Actividades (capacitacion, pausas activas, estilos de vida, simulacros) + comites.
// Alimenta sst_actividades y sst_comite_miembros.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Kpi, Row3, Field, Sel } from "@/components/sst/sst-form-ui"
import { listActividades, saveActividad, listComiteMiembros, saveComiteMiembro } from "@/lib/sst-actividades-actions"
import type { ActividadRow, ComiteMiembroRow } from "@/lib/sst-evidencia-types"

const TIPO_ACT: [string, string][] = [
  ["capacitacion", "Capacitación"],
  ["pausa_activa", "Pausa activa"],
  ["estilos_vida", "Estilos de vida saludable"],
  ["simulacro", "Simulacro"],
  ["induccion", "Inducción"],
  ["reinduccion", "Reinducción"],
  ["copasst", "Reunión COPASST"],
  ["comite_convivencia", "Comité de Convivencia"],
]
const COMITE: [string, string][] = [
  ["copasst", "COPASST"],
  ["convivencia", "Convivencia"],
]
const ROL: [string, string][] = [
  ["presidente", "Presidente"],
  ["secretario", "Secretario"],
  ["representante_empleador", "Representante del empleador"],
  ["representante_trabajadores", "Representante de trabajadores"],
  ["suplente", "Suplente"],
]
const actVacio = () => ({
  sede: "",
  tipo: "capacitacion",
  tema: "",
  fecha: new Date().toISOString().slice(0, 10),
  facilitador: "",
  n_asistentes: 0,
  duracion_horas: 1,
  observacion: "",
})
const miemVacio = () => ({
  comite: "copasst",
  nombre: "",
  documento: "",
  rol: "representante_trabajadores",
  periodo_inicio: "",
  periodo_fin: "",
})

export function ActividadesSST({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [acts, setActs] = useState<ActividadRow[]>([])
  const [miembros, setMiembros] = useState<ComiteMiembroRow[]>([])
  const [comiteSel, setComiteSel] = useState("copasst")
  const [act, setAct] = useState<Record<string, any>>(actVacio())
  const [miem, setMiem] = useState<Record<string, any>>(miemVacio())
  const setA = (k: string, v: any) => setAct((f) => ({ ...f, [k]: v }))
  const setMi = (k: string, v: any) => setMiem((f) => ({ ...f, [k]: v }))

  async function cargar() {
    setActs(await listActividades(empresaId))
    setMiembros(await listComiteMiembros(comiteSel, empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, comiteSel])

  async function guardarAct() {
    if (!act.tema.trim()) {
      toast({ title: "Falta el tema" })
      return
    }
    const res = await saveActividad(
      { ...act, n_asistentes: Number(act.n_asistentes), duracion_horas: Number(act.duracion_horas) } as Partial<ActividadRow>,
      empresaId,
    )
    if (res.success) {
      toast({ title: "Actividad registrada" })
      setAct(actVacio())
      cargar()
    } else toast({ title: "Error", description: res.message })
  }
  async function guardarMiem() {
    if (!miem.nombre.trim()) {
      toast({ title: "Falta el nombre" })
      return
    }
    const res = await saveComiteMiembro(miem as Partial<ComiteMiembroRow>, empresaId)
    if (res.success) {
      toast({ title: "Miembro agregado" })
      setMiem({ ...miemVacio(), comite: miem.comite })
      setComiteSel(miem.comite)
      cargar()
    } else toast({ title: "Error", description: res.message })
  }

  const k = useMemo(
    () => ({
      total: acts.length,
      cap: acts.filter((a) => a.tipo === "capacitacion").length,
      pausas: acts.filter((a) => a.tipo === "pausa_activa").length,
      asistentes: acts.reduce((s, a) => s + (Number(a.n_asistentes) || 0), 0),
    }),
    [acts],
  )

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
        Actividades, Capacitación y Comités
      </h2>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi t="Actividades" v={k.total} />
        <Kpi t="Capacitaciones" v={k.cap} />
        <Kpi t="Pausas activas" v={k.pausas} />
        <Kpi t="Asistentes" v={k.asistentes} />
      </div>

      <Tabs defaultValue="actividades">
        <TabsList>
          <TabsTrigger value="actividades">Actividades</TabsTrigger>
          <TabsTrigger value="comites">Comités</TabsTrigger>
        </TabsList>

        <TabsContent value="actividades" className="space-y-3">
          <Card className="p-4 space-y-3">
            <Row3>
              <Field l="Sede">
                <Input value={act.sede} onChange={(e) => setA("sede", e.target.value)} />
              </Field>
              <Field l="Tipo">
                <Sel v={act.tipo} on={(v) => setA("tipo", v)} o={TIPO_ACT} />
              </Field>
              <Field l="Fecha">
                <DatePickerField value={act.fecha} onChange={(value) => setA("fecha", value)} />
              </Field>
              <Field l="Facilitador">
                <Input value={act.facilitador} onChange={(e) => setA("facilitador", e.target.value)} />
              </Field>
              <Field l="N.º asistentes">
                <Input type="number" value={act.n_asistentes} onChange={(e) => setA("n_asistentes", e.target.value)} />
              </Field>
              <Field l="Duración (horas)">
                <Input type="number" value={act.duracion_horas} onChange={(e) => setA("duracion_horas", e.target.value)} />
              </Field>
            </Row3>
            <Field l="Tema">
              <Input value={act.tema} onChange={(e) => setA("tema", e.target.value)} />
            </Field>
            <Field l="Observación">
              <Textarea value={act.observacion} onChange={(e) => setA("observacion", e.target.value)} />
            </Field>
            <Button onClick={guardarAct} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Registrar actividad
            </Button>
          </Card>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Tema</th>
                  <th className="p-2 text-center">Asist.</th>
                </tr>
              </thead>
              <tbody>
                {acts.map((a, i) => (
                  <tr key={a.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    <td className="p-2">{a.fecha}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="capitalize">
                        {String(a.tipo).replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="p-2">{a.tema}</td>
                    <td className="p-2 text-center">{a.n_asistentes}</td>
                  </tr>
                ))}
                {acts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Sin actividades aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="comites" className="space-y-3">
          <Card className="p-4 space-y-3">
            <Row3>
              <Field l="Comité">
                <Sel v={miem.comite} on={(v) => setMi("comite", v)} o={COMITE} />
              </Field>
              <Field l="Nombre">
                <Input value={miem.nombre} onChange={(e) => setMi("nombre", e.target.value)} />
              </Field>
              <Field l="Documento">
                <Input value={miem.documento} onChange={(e) => setMi("documento", e.target.value)} />
              </Field>
              <Field l="Rol">
                <Sel v={miem.rol} on={(v) => setMi("rol", v)} o={ROL} />
              </Field>
              <Field l="Periodo inicio">
                <DatePickerField value={miem.periodo_inicio} onChange={(value) => setMi("periodo_inicio", value)} />
              </Field>
              <Field l="Periodo fin">
                <DatePickerField value={miem.periodo_fin} onChange={(value) => setMi("periodo_fin", value)} />
              </Field>
            </Row3>
            <Button onClick={guardarMiem} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Agregar miembro
            </Button>
          </Card>
          <div className="flex gap-2">
            {COMITE.map(([v, l]) => (
              <Button
                key={v}
                variant={comiteSel === v ? "default" : "outline"}
                size="sm"
                onClick={() => setComiteSel(v)}
                style={comiteSel === v ? { background: SST_TOKENS.navy } : {}}
              >
                {l}
              </Button>
            ))}
          </div>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Nombre</th>
                  <th className="p-2 text-left">Documento</th>
                  <th className="p-2 text-left">Rol</th>
                  <th className="p-2 text-left">Periodo</th>
                </tr>
              </thead>
              <tbody>
                {miembros.map((m, i) => (
                  <tr key={m.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    <td className="p-2 font-medium">{m.nombre}</td>
                    <td className="p-2">{m.documento}</td>
                    <td className="p-2 capitalize">{String(m.rol).replace(/_/g, " ")}</td>
                    <td className="p-2 text-xs">
                      {m.periodo_inicio} — {m.periodo_fin}
                    </td>
                  </tr>
                ))}
                {miembros.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Sin miembros en este comité.
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

export default ActividadesSST
