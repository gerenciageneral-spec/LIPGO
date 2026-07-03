"use client"

// Investigacion de Accidentes / Incidentes / EL - formato LIP SST-FOR-21.
// Alimenta sst_incidentes (+ sst_incidente_acciones). Sigue las convenciones
// del modulo SST: useAuth, useToast, SST_TOKENS, supabase via server actions.

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SoportesDocumentales } from "@/components/sst/soportes-documentales"
import { EspinaPescado, CuadrosCausas, ishikawaVacia } from "@/components/sst/espina-pescado"
import type { IshikawaData, CuadrosCausasData } from "@/components/sst/espina-pescado"
import { listIncidentes, saveIncidente, updateIncidente } from "@/lib/sst-incidentes-actions"
import type { IncidenteRow, IncidenteAccionRow } from "@/lib/sst-evidencia-types"

const SN: [string, string][] = [
  ["true", "Sí"],
  ["false", "No"],
]
const TIPOS: [string, string][] = [
  ["incidente", "Incidente"],
  ["accidente", "Accidente de trabajo"],
  ["enfermedad_laboral", "Enfermedad laboral"],
]
const GRAVEDAD: [string, string][] = [
  ["leve", "Leve"],
  ["grave", "Grave"],
  ["mortal", "Mortal"],
]
const ESTADOS: [string, string][] = [
  ["reportado", "Reportado"],
  ["en_investigacion", "En investigación"],
  ["cerrado", "Cerrado"],
]
const VINCULACION: [string, string][] = [
  ["planta", "Planta"],
  ["mision", "Misión"],
  ["contratista", "Contratista"],
  ["aprendiz", "Aprendiz"],
  ["dependiente", "Dependiente"],
  ["independiente", "Independiente"],
]
const JORNADA: [string, string][] = [
  ["normal", "Normal"],
  ["extra", "Extra"],
]
const TIPO_ACC: [string, string][] = [
  ["propios_trabajo", "Propios del trabajo"],
  ["violencia", "Violencia"],
  ["transito", "Tránsito"],
  ["deportivo", "Deportivo"],
  ["recreativo", "Recreativo o cultural"],
]
const LUGAR: [string, string][] = [
  ["almacenes", "Almacenes o depósitos"],
  ["produccion", "Áreas de producción"],
  ["recreativas", "Áreas recreativas/deportivas"],
  ["corredores", "Corredores o pasillos"],
  ["escaleras", "Escaleras"],
  ["parqueaderos", "Parqueaderos / circulación vehicular"],
  ["oficinas", "Oficinas"],
  ["comunes", "Otras áreas comunes"],
  ["otros", "Otros"],
]
const LESION: [string, string][] = [
  ["fractura", "Fractura"],
  ["luxacion", "Luxación"],
  ["esguince", "Esguince/desgarro/hernia"],
  ["trauma_interno", "Conmoción/trauma interno"],
  ["amputacion", "Amputación"],
  ["herida", "Herida"],
  ["trauma_superficial", "Trauma superficial"],
  ["golpe", "Golpe/contusión/aplastamiento"],
  ["quemadura", "Quemadura"],
  ["envenenamiento", "Intoxicación/alergia"],
  ["asfixia", "Asfixia"],
  ["electricidad", "Efecto de electricidad"],
  ["multiples", "Lesiones múltiples"],
  ["otro", "Otro"],
]
const PARTE: [string, string][] = [
  ["cabeza", "Cabeza"],
  ["ojo", "Ojo"],
  ["cuello", "Cuello"],
  ["tronco", "Tronco/columna"],
  ["torax", "Tórax"],
  ["abdomen", "Abdomen"],
  ["miembros_sup", "Miembros superiores"],
  ["manos", "Manos"],
  ["miembros_inf", "Miembros inferiores"],
  ["pies", "Pies"],
  ["multiples", "Ubicaciones múltiples"],
]
const AGENTE: [string, string][] = [
  ["maquinas", "Máquinas/equipos"],
  ["transporte", "Medios de transporte"],
  ["herramientas", "Herramientas/utensilios"],
  ["materiales", "Materiales o sustancias"],
  ["ambiente", "Ambiente de trabajo"],
  ["animales", "Animales"],
  ["otros", "Otros"],
]
const MECANISMO: [string, string][] = [
  ["caida_personas", "Caída de personas"],
  ["caida_objetos", "Caída de objetos"],
  ["pisadas_golpes", "Pisadas/choques/golpes"],
  ["atrapamientos", "Atrapamientos"],
  ["sobreesfuerzo", "Sobreesfuerzo"],
  ["golpes_objetos", "Golpes por/contra objetos"],
  ["otro", "Otro"],
]
const CONTROL: [string, string][] = [
  ["fuente", "Fuente (F)"],
  ["medio", "Medio (M)"],
  ["individuo", "Individuo (I)"],
]
const BOOL_KEYS = [
  "labor_habitual",
  "causo_muerte",
  "testigos_presenciaron",
  "reportado_arl",
  "reportado_mintrabajo",
  "primeros_auxilios",
  "remitido_centro_salud",
  "hospitalizado",
]

const vacioAccion = () => ({
  plan: "",
  tipo_control: "fuente",
  fecha_implementacion: "",
  responsable_ejecucion: "",
  fecha_verificacion: "",
  responsable_verificacion: "",
  estado: "pendiente",
})
const vacio = () => ({
  tipo: "accidente",
  gravedad: "leve",
  fecha_evento: new Date().toISOString().slice(0, 10),
  hora_evento: "",
  dia_semana: "",
  departamento_evento: "",
  municipio_evento: "",
  zona_evento: "urbana",
  area_ocurrencia: "",
  lugar_ocurrencia: "almacenes",
  jornada_evento: "normal",
  labor_habitual: "true",
  tipo_accidente: "propios_trabajo",
  causo_muerte: "false",
  trabajador: "",
  cargo: "",
  tipo_vinculacion: "planta",
  ocupacion_habitual: "",
  antiguedad_dias: 0,
  funciones_asignadas: "",
  epp_portado: "",
  tipo_lesion: "golpe",
  parte_cuerpo: "cabeza",
  agente_accidente: "ambiente",
  mecanismo: "golpes_objetos",
  descripcion: "",
  testigos_presenciaron: "false",
  reportado_arl: "false",
  fecha_reporte_arl: "",
  furat_radicado: "",
  reportado_mintrabajo: "false",
  equipo_investigador: "",
  metodologia: "",
  causas_inmediatas: "",
  causas_basicas: "",
  observaciones_investigadores: "",
  ishikawa: ishikawaVacia(),
  causa_actos_inseguros: "",
  causa_condiciones_inseguras: "",
  causa_factores_personales: "",
  causa_factores_trabajo: "",
  fecha_investigacion: "",
  primeros_auxilios: "false",
  remitido_centro_salud: "false",
  centro_salud: "",
  hospitalizado: "false",
  dias_incapacidad_inicial: 0,
  dias_prorroga: 0,
  dias_incapacidad: 0,
  cie10_codigo: "",
  cie10_diagnostico: "",
  estado: "reportado",
  fecha_cierre: "",
})

export function InvestigacionAT({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [tab, setTab] = useState("registrar")
  const [form, setForm] = useState<Record<string, any>>(vacio())
  const [acciones, setAcciones] = useState<Record<string, any>[]>([vacioAccion()])
  const [rows, setRows] = useState<IncidenteRow[]>([])
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))
  const setAcc = (i: number, k: string, v: any) => setAcciones((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function cargar() {
    setRows(await listIncidentes(empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function guardar() {
    setSaving(true)
    const payload: Record<string, any> = { ...form }
    BOOL_KEYS.forEach((k) => {
      payload[k] = payload[k] === "true"
    })
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null
    })
    const accs = acciones.map((a) => {
      const c = { ...a }
      Object.keys(c).forEach((k) => {
        if (c[k] === "") c[k] = null
      })
      return c
    })
    const res = await saveIncidente(payload as Partial<IncidenteRow>, accs as Partial<IncidenteAccionRow>[], empresaId)
    setSaving(false)
    if (res.success) {
      toast({ title: "Investigación guardada" })
      setForm(vacio())
      setAcciones([vacioAccion()])
      await cargar()
      setTab("historial")
    } else {
      toast({ title: "Error al guardar", description: res.message ?? "Intenta de nuevo." })
    }
  }

  const kpis = useMemo(() => {
    const c = (f: (r: IncidenteRow) => boolean) => rows.filter(f).length
    const inv = rows.filter((r) => r.tipo !== "incidente")
    const enPlazo = inv.filter(
      (r) =>
        r.fecha_investigacion &&
        (new Date(r.fecha_investigacion).getTime() - new Date(r.fecha_evento).getTime()) / 86400000 <= 15,
    ).length
    return {
      acc: c((r) => r.tipo === "accidente"),
      inc: c((r) => r.tipo === "incidente"),
      el: c((r) => r.tipo === "enfermedad_laboral"),
      graves: c((r) => r.gravedad === "grave"),
      mortales: c((r) => r.gravedad === "mortal"),
      dias: rows.reduce((s, r) => s + (Number(r.dias_incapacidad) || 0), 0),
      pct: inv.length ? Math.round((100 * enPlazo) / inv.length) : 0,
    }
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
          Investigación de Accidentes / Incidentes (SST-FOR-21)
        </h2>
        <Badge variant="outline">Res. 1401/2007 · investigación ≤ 15 días</Badge>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-7">
        <Kpi t="Accidentes" v={kpis.acc} />
        <Kpi t="Incidentes" v={kpis.inc} />
        <Kpi t="Enf. laborales" v={kpis.el} />
        <Kpi t="AT graves" v={kpis.graves} c={SST_TOKENS.warn} />
        <Kpi t="AT mortales" v={kpis.mortales} c={SST_TOKENS.bad} />
        <Kpi t="Días perdidos" v={kpis.dias} />
        <Kpi t="Investig. ≤15d" v={`${kpis.pct}%`} c={SST_TOKENS.ok} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="registrar">Registrar</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="registrar">
          <Card className="p-4 space-y-6">
            <Sec n="1. Datos del evento">
              <G3>
                <F l="Tipo">
                  <S v={form.tipo} on={(v) => set("tipo", v)} o={TIPOS} />
                </F>
                <F l="Gravedad">
                  <S v={form.gravedad} on={(v) => set("gravedad", v)} o={GRAVEDAD} />
                </F>
                <F l="Fecha del evento">
                  <Input type="date" value={form.fecha_evento} onChange={(e) => set("fecha_evento", e.target.value)} />
                </F>
                <F l="Hora">
                  <Input type="time" value={form.hora_evento} onChange={(e) => set("hora_evento", e.target.value)} />
                </F>
                <F l="Día de la semana">
                  <Input value={form.dia_semana} onChange={(e) => set("dia_semana", e.target.value)} />
                </F>
                <F l="Departamento">
                  <Input
                    value={form.departamento_evento}
                    onChange={(e) => set("departamento_evento", e.target.value)}
                  />
                </F>
                <F l="Municipio">
                  <Input value={form.municipio_evento} onChange={(e) => set("municipio_evento", e.target.value)} />
                </F>
                <F l="Zona">
                  <S
                    v={form.zona_evento}
                    on={(v) => set("zona_evento", v)}
                    o={[
                      ["urbana", "Urbana"],
                      ["rural", "Rural"],
                    ]}
                  />
                </F>
                <F l="Área de ocurrencia">
                  <Input value={form.area_ocurrencia} onChange={(e) => set("area_ocurrencia", e.target.value)} />
                </F>
                <F l="Lugar">
                  <S v={form.lugar_ocurrencia} on={(v) => set("lugar_ocurrencia", v)} o={LUGAR} />
                </F>
                <F l="Jornada">
                  <S v={form.jornada_evento} on={(v) => set("jornada_evento", v)} o={JORNADA} />
                </F>
                <F l="¿Labor habitual?">
                  <S v={form.labor_habitual} on={(v) => set("labor_habitual", v)} o={SN} />
                </F>
                <F l="Tipo de accidente">
                  <S v={form.tipo_accidente} on={(v) => set("tipo_accidente", v)} o={TIPO_ACC} />
                </F>
                <F l="¿Causó la muerte?">
                  <S v={form.causo_muerte} on={(v) => set("causo_muerte", v)} o={SN} />
                </F>
              </G3>
            </Sec>

            <Sec n="2. Persona">
              <G3>
                <F l="Cargo">
                  <Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
                </F>
                <F l="Tipo de vinculación">
                  <S v={form.tipo_vinculacion} on={(v) => set("tipo_vinculacion", v)} o={VINCULACION} />
                </F>
                <F l="Antigüedad (días)">
                  <Input
                    type="number"
                    value={form.antiguedad_dias}
                    onChange={(e) => set("antiguedad_dias", Number(e.target.value))}
                  />
                </F>
                <F l="Ocupación habitual">
                  <Input value={form.ocupacion_habitual} onChange={(e) => set("ocupacion_habitual", e.target.value)} />
                </F>
              </G3>
              <F l="Funciones asignadas">
                <Textarea value={form.funciones_asignadas} onChange={(e) => set("funciones_asignadas", e.target.value)} />
              </F>
              <F l="EPP que portaba">
                <Input value={form.epp_portado} onChange={(e) => set("epp_portado", e.target.value)} />
              </F>
            </Sec>

            <Sec n="3. Caracterización de la lesión">
              <G3>
                <F l="Tipo de lesión">
                  <S v={form.tipo_lesion} on={(v) => set("tipo_lesion", v)} o={LESION} />
                </F>
                <F l="Parte del cuerpo">
                  <S v={form.parte_cuerpo} on={(v) => set("parte_cuerpo", v)} o={PARTE} />
                </F>
                <F l="Agente">
                  <S v={form.agente_accidente} on={(v) => set("agente_accidente", v)} o={AGENTE} />
                </F>
                <F l="Mecanismo / forma">
                  <S v={form.mecanismo} on={(v) => set("mecanismo", v)} o={MECANISMO} />
                </F>
                <F l="¿Hubo testigos?">
                  <S v={form.testigos_presenciaron} on={(v) => set("testigos_presenciaron", v)} o={SN} />
                </F>
              </G3>
              <F l="Descripción del accidente">
                <Textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
              </F>
            </Sec>

            <Sec n="4. Reporte legal">
              <p className="text-xs p-2 rounded" style={{ background: "#FFF7E6", color: "#8a6d00" }}>
                AT grave o mortal: reportar a ARL/EPS y MinTrabajo dentro de 2 días hábiles.
              </p>
              <G3>
                <F l="¿Reportado a ARL?">
                  <S v={form.reportado_arl} on={(v) => set("reportado_arl", v)} o={SN} />
                </F>
                <F l="Fecha reporte ARL">
                  <Input
                    type="date"
                    value={form.fecha_reporte_arl}
                    onChange={(e) => set("fecha_reporte_arl", e.target.value)}
                  />
                </F>
                <F l="FURAT radicado">
                  <Input value={form.furat_radicado} onChange={(e) => set("furat_radicado", e.target.value)} />
                </F>
                <F l="¿Reportado a MinTrabajo?">
                  <S v={form.reportado_mintrabajo} on={(v) => set("reportado_mintrabajo", v)} o={SN} />
                </F>
              </G3>
            </Sec>

            <Sec n="5. Investigación (≤ 15 días · Res. 1401/2007)">
              <F l="Equipo investigador">
                <Input
                  value={form.equipo_investigador}
                  onChange={(e) => set("equipo_investigador", e.target.value)}
                  placeholder="Jefe inmediato, COPASST, resp. SST…"
                />
              </F>
              <div className="space-y-1">
                <label className="text-sm font-medium" style={{ color: SST_TOKENS.navy }}>
                  Metodología de investigación (espina de pescado · Ishikawa)
                </label>
                <EspinaPescado value={form.ishikawa as IshikawaData} onChange={(v) => set("ishikawa", v)} />
              </div>
              <CuadrosCausas
                value={
                  {
                    actos_inseguros: form.causa_actos_inseguros ?? "",
                    condiciones_inseguras: form.causa_condiciones_inseguras ?? "",
                    factores_personales: form.causa_factores_personales ?? "",
                    factores_trabajo: form.causa_factores_trabajo ?? "",
                    observaciones: form.observaciones_investigadores ?? "",
                  } as CuadrosCausasData
                }
                onChange={(patch) => {
                  if (patch.actos_inseguros !== undefined) set("causa_actos_inseguros", patch.actos_inseguros)
                  if (patch.condiciones_inseguras !== undefined)
                    set("causa_condiciones_inseguras", patch.condiciones_inseguras)
                  if (patch.factores_personales !== undefined)
                    set("causa_factores_personales", patch.factores_personales)
                  if (patch.factores_trabajo !== undefined) set("causa_factores_trabajo", patch.factores_trabajo)
                  if (patch.observaciones !== undefined) set("observaciones_investigadores", patch.observaciones)
                }}
              />
              <F l="Fecha de investigación">
                <Input
                  type="date"
                  value={form.fecha_investigacion}
                  onChange={(e) => set("fecha_investigacion", e.target.value)}
                />
              </F>
            </Sec>

            <Sec n="6. Manejo y ausentismo">
              <G3>
                <F l="¿Primeros auxilios?">
                  <S v={form.primeros_auxilios} on={(v) => set("primeros_auxilios", v)} o={SN} />
                </F>
                <F l="¿Remitido a centro de salud?">
                  <S v={form.remitido_centro_salud} on={(v) => set("remitido_centro_salud", v)} o={SN} />
                </F>
                <F l="Centro de salud">
                  <Input value={form.centro_salud} onChange={(e) => set("centro_salud", e.target.value)} />
                </F>
                <F l="¿Hospitalizado?">
                  <S v={form.hospitalizado} on={(v) => set("hospitalizado", v)} o={SN} />
                </F>
                <F l="Incapacidad inicial (días)">
                  <Input
                    type="number"
                    value={form.dias_incapacidad_inicial}
                    onChange={(e) => set("dias_incapacidad_inicial", Number(e.target.value))}
                  />
                </F>
                <F l="Prórroga (días)">
                  <Input
                    type="number"
                    value={form.dias_prorroga}
                    onChange={(e) => set("dias_prorroga", Number(e.target.value))}
                  />
                </F>
                <F l="Ausentismo total (días)">
                  <Input
                    type="number"
                    value={form.dias_incapacidad}
                    onChange={(e) => set("dias_incapacidad", Number(e.target.value))}
                  />
                </F>
                <F l="Código CIE-10">
                  <Input value={form.cie10_codigo} onChange={(e) => set("cie10_codigo", e.target.value)} />
                </F>
                <F l="Diagnóstico CIE-10">
                  <Input value={form.cie10_diagnostico} onChange={(e) => set("cie10_diagnostico", e.target.value)} />
                </F>
              </G3>
            </Sec>

            <Sec n="7. Plan de acción (control Fuente / Medio / Individuo)">
              {acciones.map((a, i) => (
                <div key={i} className="border rounded p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium" style={{ color: SST_TOKENS.ink }}>
                      Acción {i + 1}
                    </span>
                    {acciones.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setAcciones((x) => x.filter((_, j) => j !== i))}>
                        Quitar
                      </Button>
                    )}
                  </div>
                  <F l="Plan de acción">
                    <Input value={a.plan} onChange={(e) => setAcc(i, "plan", e.target.value)} />
                  </F>
                  <G3>
                    <F l="Tipo de control">
                      <S v={a.tipo_control} on={(v) => setAcc(i, "tipo_control", v)} o={CONTROL} />
                    </F>
                    <F l="Fecha implementación">
                      <Input
                        type="date"
                        value={a.fecha_implementacion}
                        onChange={(e) => setAcc(i, "fecha_implementacion", e.target.value)}
                      />
                    </F>
                    <F l="Responsable ejecución">
                      <Input
                        value={a.responsable_ejecucion}
                        onChange={(e) => setAcc(i, "responsable_ejecucion", e.target.value)}
                      />
                    </F>
                    <F l="Fecha verificación">
                      <Input
                        type="date"
                        value={a.fecha_verificacion}
                        onChange={(e) => setAcc(i, "fecha_verificacion", e.target.value)}
                      />
                    </F>
                    <F l="Responsable verificación">
                      <Input
                        value={a.responsable_verificacion}
                        onChange={(e) => setAcc(i, "responsable_verificacion", e.target.value)}
                      />
                    </F>
                    <F l="Estado">
                      <S
                        v={a.estado}
                        on={(v) => setAcc(i, "estado", v)}
                        o={[
                          ["pendiente", "Pendiente"],
                          ["implementado", "Implementado"],
                          ["verificado", "Verificado"],
                        ]}
                      />
                    </F>
                  </G3>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setAcciones((x) => [...x, vacioAccion()])}>
                + Agregar acción
              </Button>
            </Sec>

            <G3>
              <F l="Estado del caso">
                <S v={form.estado} on={(v) => set("estado", v)} o={ESTADOS} />
              </F>
              <F l="Fecha de cierre">
                <Input type="date" value={form.fecha_cierre} onChange={(e) => set("fecha_cierre", e.target.value)} />
              </F>
            </G3>

            <Button onClick={guardar} disabled={saving} style={{ background: SST_TOKENS.navy, color: "white" }}>
              {saving ? "Guardando…" : "Guardar investigación"}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Cargo</th>
                  <th className="p-2 text-left">Gravedad</th>
                  <th className="p-2 text-center">Días</th>
                  <th className="p-2 text-left">Investigación</th>
                  <th className="p-2 text-left">Estado</th>
                  <th className="p-2 text-left w-64">Soportes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const dias = r.fecha_investigacion
                    ? Math.round(
                        (new Date(r.fecha_investigacion).getTime() - new Date(r.fecha_evento).getTime()) / 86400000,
                      )
                    : null
                  const ok = dias !== null && dias <= 15
                  return (
                    <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                      <td className="p-2">{r.fecha_evento}</td>
                      <td className="p-2 capitalize">{String(r.tipo).replace("_", " ")}</td>
                      <td className="p-2">{r.cargo}</td>
                      <td className="p-2">
                        <Badge
                          style={{
                            background:
                              r.gravedad === "mortal"
                                ? SST_TOKENS.bad
                                : r.gravedad === "grave"
                                  ? SST_TOKENS.warn
                                  : SST_TOKENS.ok,
                            color: "white",
                          }}
                        >
                          {r.gravedad}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">{r.dias_incapacidad ?? 0}</td>
                      <td className="p-2">
                        {dias === null ? (
                          <span className="text-muted-foreground">pendiente</span>
                        ) : (
                          <Badge style={{ background: ok ? SST_TOKENS.ok : SST_TOKENS.bad, color: "white" }}>
                            {dias} días
                          </Badge>
                        )}
                      </td>
                      <td className="p-2">
                        <S
                          v={r.estado}
                          small
                          on={async (v) => {
                            await updateIncidente(r.id!, { estado: v })
                            cargar()
                          }}
                          o={ESTADOS}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <SoportesDocumentales
                          norma="SST 0312"
                          modulo="Investigación AT"
                          referenciaTipo="incidente"
                          referenciaId={r.id!}
                          referenciaDesc={`${String(r.tipo)} - ${r.cargo ?? ""}`}
                          empresaId={empresaId}
                        />
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      Sin registros aún.
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

function Kpi({ t, v, c }: { t: string; v: any; c?: string }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold" style={{ color: c ?? SST_TOKENS.navy }}>
        {v}
      </div>
      <div className="text-xs text-muted-foreground">{t}</div>
    </Card>
  )
}
function Sec({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold" style={{ color: SST_TOKENS.navy }}>
        {n}
      </h3>
      {children}
    </section>
  )
}
function G3({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-3">{children}</div>
}
function F({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs" style={{ color: SST_TOKENS.ink }}>
        {l}
      </label>
      {children}
    </div>
  )
}
function S({ v, on, o, small }: { v: string; on: (v: string) => void; o: [string, string][]; small?: boolean }) {
  return (
    <Select value={v} onValueChange={on}>
      <SelectTrigger className={small ? "h-8" : ""}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {o.map(([val, lab]) => (
          <SelectItem key={val} value={val}>
            {lab}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default InvestigacionAT
