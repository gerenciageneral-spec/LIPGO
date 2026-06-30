"use client"

// Hoja de vida de equipos + cronograma de mantenimiento. Alimenta sst_equipos y
// sst_mantenimientos (cubre estandar 4.2.5). Para montacargas, la 'identificacion'
// es la placa que se cruza con inspecciones_montacargas (preoperacional).

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
import { listEquipos, saveEquipo, listMantenimientos, saveMantenimiento } from "@/lib/sst-mantenimiento-actions"
import type { EquipoRow, MantenimientoRow } from "@/lib/sst-evidencia-types"

const TIPO_EQ: [string, string][] = [
  ["montacargas", "Montacargas"],
  ["banda_transportadora", "Banda transportadora"],
  ["estanteria", "Estantería"],
  ["extintor", "Extintor"],
  ["herramienta", "Herramienta"],
  ["bascula", "Báscula"],
]
const ESTADO_EQ: [string, string][] = [
  ["operativo", "Operativo"],
  ["fuera_servicio", "Fuera de servicio"],
  ["baja", "Baja"],
]
const TIPO_MT: [string, string][] = [
  ["preventivo", "Preventivo"],
  ["correctivo", "Correctivo"],
]
const eqVacio = () => ({
  sede: "",
  tipo: "montacargas",
  identificacion: "",
  marca: "",
  modelo: "",
  serie: "",
  fecha_ingreso: "",
  horometro: 0,
  estado: "operativo",
  observaciones: "",
})
const mtVacio = () => ({
  equipo_id: "",
  tipo: "preventivo",
  fecha_programada: "",
  fecha_ejecucion: "",
  descripcion: "",
  proveedor: "",
  costo: 0,
})

export function EquiposMantenimiento({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [equipos, setEquipos] = useState<EquipoRow[]>([])
  const [mtos, setMtos] = useState<MantenimientoRow[]>([])
  const [tab, setTab] = useState("equipos")
  const [eq, setEq] = useState<Record<string, any>>(eqVacio())
  const [mt, setMt] = useState<Record<string, any>>(mtVacio())
  const setE = (k: string, v: any) => setEq((f) => ({ ...f, [k]: v }))
  const setM = (k: string, v: any) => setMt((f) => ({ ...f, [k]: v }))

  async function cargar() {
    setEquipos(await listEquipos(empresaId))
    setMtos(await listMantenimientos(empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function guardarEq() {
    if (!eq.identificacion.trim()) {
      toast({ title: "Falta la identificación/placa" })
      return
    }
    const res = await saveEquipo({ ...eq, horometro: Number(eq.horometro) } as Partial<EquipoRow>, empresaId)
    if (res.success) {
      toast({ title: "Equipo guardado" })
      setEq(eqVacio())
      cargar()
    } else toast({ title: "Error", description: res.message })
  }
  async function guardarMt() {
    if (!mt.equipo_id) {
      toast({ title: "Selecciona el equipo" })
      return
    }
    const res = await saveMantenimiento(
      { ...mt, equipo_id: Number(mt.equipo_id), costo: Number(mt.costo) } as Partial<MantenimientoRow>,
      empresaId,
    )
    if (res.success) {
      toast({ title: "Mantenimiento programado" })
      setMt(mtVacio())
      cargar()
    } else toast({ title: "Error", description: res.message })
  }

  const k = useMemo(
    () => ({
      equipos: equipos.length,
      operativos: equipos.filter((e) => e.estado === "operativo").length,
      programados: mtos.filter((m) => m.estado === "programado").length,
      vencidos: mtos.filter((m) => m.estado === "vencido").length,
    }),
    [equipos, mtos],
  )
  const eqLabel = (e: EquipoRow) => `${e.identificacion} (${e.tipo})`

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
        Equipos y Mantenimiento
      </h2>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi t="Equipos" v={k.equipos} />
        <Kpi t="Operativos" v={k.operativos} c={SST_TOKENS.ok} />
        <Kpi t="Mtos. programados" v={k.programados} c={SST_TOKENS.warn} />
        <Kpi t="Mtos. vencidos" v={k.vencidos} c={SST_TOKENS.bad} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="equipos">Equipos</TabsTrigger>
          <TabsTrigger value="mantenimiento">Mantenimiento</TabsTrigger>
        </TabsList>

        <TabsContent value="equipos" className="space-y-3">
          <Card className="p-4 space-y-3">
            <Row3>
              <Field l="Sede">
                <Input value={eq.sede} onChange={(e) => setE("sede", e.target.value)} />
              </Field>
              <Field l="Tipo">
                <Sel v={eq.tipo} on={(v) => setE("tipo", v)} o={TIPO_EQ} />
              </Field>
              <Field l="Identificación / placa">
                <Input value={eq.identificacion} onChange={(e) => setE("identificacion", e.target.value)} />
              </Field>
              <Field l="Marca">
                <Input value={eq.marca} onChange={(e) => setE("marca", e.target.value)} />
              </Field>
              <Field l="Modelo">
                <Input value={eq.modelo} onChange={(e) => setE("modelo", e.target.value)} />
              </Field>
              <Field l="Serie">
                <Input value={eq.serie} onChange={(e) => setE("serie", e.target.value)} />
              </Field>
              <Field l="Fecha de ingreso">
                <Input type="date" value={eq.fecha_ingreso} onChange={(e) => setE("fecha_ingreso", e.target.value)} />
              </Field>
              <Field l="Horómetro">
                <Input type="number" value={eq.horometro} onChange={(e) => setE("horometro", e.target.value)} />
              </Field>
              <Field l="Estado">
                <Sel v={eq.estado} on={(v) => setE("estado", v)} o={ESTADO_EQ} />
              </Field>
            </Row3>
            <Field l="Observaciones">
              <Textarea value={eq.observaciones} onChange={(e) => setE("observaciones", e.target.value)} />
            </Field>
            <Button onClick={guardarEq} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Guardar equipo
            </Button>
          </Card>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Identificación</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Sede</th>
                  <th className="p-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {equipos.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    <td className="p-2 font-medium">{e.identificacion}</td>
                    <td className="p-2">{e.tipo}</td>
                    <td className="p-2">{e.sede}</td>
                    <td className="p-2">
                      <Badge style={{ background: e.estado === "operativo" ? SST_TOKENS.ok : SST_TOKENS.bad, color: "white" }}>
                        {e.estado}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {equipos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Sin equipos registrados aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="mantenimiento" className="space-y-3">
          <Card className="p-4 space-y-3">
            <Row3>
              <Field l="Equipo">
                <Sel
                  v={String(mt.equipo_id)}
                  on={(v) => setM("equipo_id", v)}
                  o={equipos.map((e) => [String(e.id), eqLabel(e)]) as [string, string][]}
                />
              </Field>
              <Field l="Tipo">
                <Sel v={mt.tipo} on={(v) => setM("tipo", v)} o={TIPO_MT} />
              </Field>
              <Field l="Fecha programada">
                <Input type="date" value={mt.fecha_programada} onChange={(e) => setM("fecha_programada", e.target.value)} />
              </Field>
              <Field l="Fecha ejecución">
                <Input type="date" value={mt.fecha_ejecucion} onChange={(e) => setM("fecha_ejecucion", e.target.value)} />
              </Field>
              <Field l="Proveedor">
                <Input value={mt.proveedor} onChange={(e) => setM("proveedor", e.target.value)} />
              </Field>
              <Field l="Costo">
                <Input type="number" value={mt.costo} onChange={(e) => setM("costo", e.target.value)} />
              </Field>
            </Row3>
            <Field l="Descripción">
              <Textarea value={mt.descripcion} onChange={(e) => setM("descripcion", e.target.value)} />
            </Field>
            <Button onClick={guardarMt} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Guardar mantenimiento
            </Button>
          </Card>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Programada</th>
                  <th className="p-2 text-left">Equipo</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {mtos.map((m, i) => {
                  const eqj = (m as any).sst_equipos
                  return (
                    <tr key={m.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                      <td className="p-2">{m.fecha_programada}</td>
                      <td className="p-2">{eqj?.identificacion ?? m.equipo_id}</td>
                      <td className="p-2">{m.tipo}</td>
                      <td className="p-2">
                        <Badge
                          style={{
                            background:
                              m.estado === "ejecutado"
                                ? SST_TOKENS.ok
                                : m.estado === "vencido"
                                  ? SST_TOKENS.bad
                                  : SST_TOKENS.warn,
                            color: "white",
                          }}
                        >
                          {m.estado}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
                {mtos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Sin mantenimientos registrados aún.
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

export default EquiposMantenimiento
