"use client"

// Comunicacion, autorreporte y PQRSF (estandar 2.8.1).
// Alimenta sst_autorreportes, sst_pqrsf y sst_comunicaciones.

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Row3, Field, Sel } from "@/components/sst/sst-form-ui"
import {
  listAutorreportes,
  saveAutorreporte,
  updateAutorreporte,
  listPqrsf,
  savePqrsf,
  updatePqrsf,
  listComunicaciones,
  saveComunicacion,
} from "@/lib/sst-comunicacion-actions"
import type { AutorreporteRow, PqrsfRow, ComunicacionRow } from "@/lib/sst-evidencia-types"

const TIPO_AR: [string, string][] = [
  ["condicion_insegura", "Condición insegura"],
  ["acto_inseguro", "Acto inseguro"],
  ["estado_salud", "Estado de salud"],
  ["sugerencia", "Sugerencia"],
]
const TIPO_PQ: [string, string][] = [
  ["peticion", "Petición"],
  ["queja", "Queja"],
  ["reclamo", "Reclamo"],
  ["sugerencia", "Sugerencia"],
  ["felicitacion", "Felicitación"],
]
const estadoColor = (e: string) =>
  e === "cerrado" ? SST_TOKENS.ok : e === "en_gestion" || e === "respondido" ? SST_TOKENS.warn : "#8896a5"

export function ComunicacionSST({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [ar, setAr] = useState<AutorreporteRow[]>([])
  const [pq, setPq] = useState<PqrsfRow[]>([])
  const [co, setCo] = useState<ComunicacionRow[]>([])
  const [fAr, setFAr] = useState<Record<string, any>>({ sede: "", trabajador: "", tipo: "condicion_insegura", descripcion: "" })
  const [fPq, setFPq] = useState<Record<string, any>>({ sede: "", remitente: "", tipo: "peticion", descripcion: "" })
  const [fCo, setFCo] = useState<Record<string, any>>({ sede: "", tema: "", dirigido_a: "trabajadores", medio: "charla", frecuencia: "" })

  async function cargar() {
    setAr(await listAutorreportes(empresaId))
    setPq(await listPqrsf(empresaId))
    setCo(await listComunicaciones(empresaId))
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function gAr() {
    if (!fAr.descripcion.trim()) {
      toast({ title: "Falta la descripción" })
      return
    }
    const r = await saveAutorreporte(fAr as Partial<AutorreporteRow>, empresaId)
    if (r.success) {
      toast({ title: "Autorreporte enviado" })
      setFAr({ sede: "", trabajador: "", tipo: "condicion_insegura", descripcion: "" })
      cargar()
    } else toast({ title: "Error", description: r.message })
  }
  async function gPq() {
    if (!fPq.descripcion.trim()) {
      toast({ title: "Falta la descripción" })
      return
    }
    const r = await savePqrsf(fPq as Partial<PqrsfRow>, empresaId)
    if (r.success) {
      toast({ title: "PQRSF registrada" })
      setFPq({ sede: "", remitente: "", tipo: "peticion", descripcion: "" })
      cargar()
    } else toast({ title: "Error", description: r.message })
  }
  async function gCo() {
    if (!fCo.tema.trim()) {
      toast({ title: "Falta el tema" })
      return
    }
    const r = await saveComunicacion(fCo as Partial<ComunicacionRow>, empresaId)
    if (r.success) {
      toast({ title: "Comunicación registrada" })
      setFCo({ sede: "", tema: "", dirigido_a: "trabajadores", medio: "charla", frecuencia: "" })
      cargar()
    } else toast({ title: "Error", description: r.message })
  }

  function ListaGestion({
    rows,
    onEstado,
    estados,
    col,
  }: {
    rows: any[]
    onEstado: (id: number, v: string) => void
    estados: [string, string][]
    col: string
  }) {
    return (
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">Tipo</th>
              <th className="p-2 text-left">Descripción</th>
              <th className="p-2 text-left w-40">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                <td className="p-2">{r.fecha}</td>
                <td className="p-2 capitalize">{String(r[col]).replace(/_/g, " ")}</td>
                <td className="p-2 text-xs">{r.descripcion}</td>
                <td className="p-2">
                  <Sel small v={r.estado} on={(v) => onEstado(r.id, v)} o={estados} />
                  <Badge className="mt-1" style={{ background: estadoColor(r.estado), color: "white" }}>
                    {r.estado}
                  </Badge>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  Sin registros aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
        Comunicación, Autorreporte y PQRSF
      </h2>
      <Tabs defaultValue="autorreporte">
        <TabsList>
          <TabsTrigger value="autorreporte">Autorreporte</TabsTrigger>
          <TabsTrigger value="pqrsf">PQRSF</TabsTrigger>
          <TabsTrigger value="comunicaciones">Comunicaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="autorreporte" className="space-y-3">
          <Card className="p-4 space-y-3">
            <Row3>
              <Field l="Sede">
                <Input value={fAr.sede} onChange={(e) => setFAr({ ...fAr, sede: e.target.value })} />
              </Field>
              <Field l="Trabajador">
                <Input value={fAr.trabajador} onChange={(e) => setFAr({ ...fAr, trabajador: e.target.value })} />
              </Field>
              <Field l="Tipo">
                <Sel v={fAr.tipo} on={(v) => setFAr({ ...fAr, tipo: v })} o={TIPO_AR} />
              </Field>
            </Row3>
            <Field l="Descripción">
              <Textarea value={fAr.descripcion} onChange={(e) => setFAr({ ...fAr, descripcion: e.target.value })} />
            </Field>
            <Button onClick={gAr} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Enviar autorreporte
            </Button>
          </Card>
          <ListaGestion
            rows={ar}
            onEstado={async (id, v) => {
              await updateAutorreporte(id, { estado: v })
              cargar()
            }}
            estados={[
              ["abierto", "Abierto"],
              ["en_gestion", "En gestión"],
              ["cerrado", "Cerrado"],
            ]}
            col="tipo"
          />
        </TabsContent>

        <TabsContent value="pqrsf" className="space-y-3">
          <Card className="p-4 space-y-3">
            <Row3>
              <Field l="Sede">
                <Input value={fPq.sede} onChange={(e) => setFPq({ ...fPq, sede: e.target.value })} />
              </Field>
              <Field l="Remitente">
                <Input value={fPq.remitente} onChange={(e) => setFPq({ ...fPq, remitente: e.target.value })} />
              </Field>
              <Field l="Tipo">
                <Sel v={fPq.tipo} on={(v) => setFPq({ ...fPq, tipo: v })} o={TIPO_PQ} />
              </Field>
            </Row3>
            <Field l="Descripción">
              <Textarea value={fPq.descripcion} onChange={(e) => setFPq({ ...fPq, descripcion: e.target.value })} />
            </Field>
            <Button onClick={gPq} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Registrar PQRSF
            </Button>
          </Card>
          <ListaGestion
            rows={pq}
            onEstado={async (id, v) => {
              await updatePqrsf(id, { estado: v })
              cargar()
            }}
            estados={[
              ["abierto", "Abierto"],
              ["respondido", "Respondido"],
              ["cerrado", "Cerrado"],
            ]}
            col="tipo"
          />
        </TabsContent>

        <TabsContent value="comunicaciones" className="space-y-3">
          <Card className="p-4 space-y-3">
            <Row3>
              <Field l="Sede">
                <Input value={fCo.sede} onChange={(e) => setFCo({ ...fCo, sede: e.target.value })} />
              </Field>
              <Field l="Tema">
                <Input value={fCo.tema} onChange={(e) => setFCo({ ...fCo, tema: e.target.value })} />
              </Field>
              <Field l="Dirigido a">
                <Input value={fCo.dirigido_a} onChange={(e) => setFCo({ ...fCo, dirigido_a: e.target.value })} />
              </Field>
              <Field l="Medio">
                <Input
                  value={fCo.medio}
                  onChange={(e) => setFCo({ ...fCo, medio: e.target.value })}
                  placeholder="cartelera / charla / correo"
                />
              </Field>
              <Field l="Frecuencia">
                <Input value={fCo.frecuencia} onChange={(e) => setFCo({ ...fCo, frecuencia: e.target.value })} />
              </Field>
            </Row3>
            <Button onClick={gCo} style={{ background: SST_TOKENS.navy, color: "white" }}>
              Registrar comunicación
            </Button>
          </Card>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Tema</th>
                  <th className="p-2 text-left">Dirigido a</th>
                  <th className="p-2 text-left">Medio</th>
                </tr>
              </thead>
              <tbody>
                {co.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    <td className="p-2">{r.fecha}</td>
                    <td className="p-2">{r.tema}</td>
                    <td className="p-2">{r.dirigido_a}</td>
                    <td className="p-2">{r.medio}</td>
                  </tr>
                ))}
                {co.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Sin comunicaciones aún.
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

export default ComunicacionSST
