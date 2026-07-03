"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/auth-provider"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Kpi } from "@/components/sst/sst-form-ui"
import { SoportesDocumentales } from "@/components/sst/soportes-documentales"
import { listIncidentes } from "@/lib/sst-incidentes-actions"
import type { IncidenteRow } from "@/lib/sst-evidencia-types"
import { RefreshCw, Loader2, Search } from "lucide-react"

type Filtro = "todas" | "abierta" | "en_proceso" | "cerrada"

// Dias entre el evento y la investigacion (cumplimiento plazo Res. 1401/2007: 15 dias).
function diasInvestigacion(r: IncidenteRow): number | null {
  if (!r.fecha_investigacion || !r.fecha_evento) return null
  return Math.round((new Date(r.fecha_investigacion).getTime() - new Date(r.fecha_evento).getTime()) / 86400000)
}

export function InvestigacionesRepositorio({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const [rows, setRows] = useState<IncidenteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todas")

  async function cargar() {
    setLoading(true)
    setRows(await listIncidentes(empresaId))
    setLoading(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const kpis = useMemo(() => {
    const total = rows.length
    const cerradas = rows.filter((r) => r.estado === "cerrada").length
    const abiertas = total - cerradas
    const conInvestig = rows.filter((r) => r.fecha_investigacion).length
    const enPlazo = rows.filter((r) => {
      const d = diasInvestigacion(r)
      return d !== null && d <= 15
    }).length
    const cumplimiento = conInvestig ? Math.round((enPlazo / conInvestig) * 100) : 0
    return { total, cerradas, abiertas, cumplimiento }
  }, [rows])

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filtro !== "todas" && r.estado !== filtro) return false
      if (!t) return true
      return [r.trabajador, r.cargo, r.tipo, r.descripcion, r.area_ocurrencia].some((v) =>
        (v ?? "").toString().toLowerCase().includes(t),
      )
    })
  }, [rows, q, filtro])

  const filtros: { k: Filtro; label: string }[] = [
    { k: "todas", label: "Todas" },
    { k: "abierta", label: "Abiertas" },
    { k: "en_proceso", label: "En proceso" },
    { k: "cerrada", label: "Cerradas" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
            Repositorio de Investigaciones de AT
          </h2>
          <p className="text-xs text-muted-foreground">
            Consulta todas las investigaciones de accidentes e incidentes realizadas, su estado y sus soportes
            documentales (SST-FOR-21).
          </p>
        </div>
        <Button
          onClick={cargar}
          variant="outline"
          disabled={loading}
          style={{ borderColor: SST_TOKENS.navy, color: SST_TOKENS.navy }}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi t="Investigaciones" v={kpis.total} />
        <Kpi t="Abiertas / en proceso" v={kpis.abiertas} c={SST_TOKENS.warn} />
        <Kpi t="Cerradas" v={kpis.cerradas} c={SST_TOKENS.ok} />
        <Kpi t="Cumplimiento plazo (15 días)" v={`${kpis.cumplimiento}%`} c={SST_TOKENS.navy} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por trabajador, cargo, tipo, área o descripción…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {filtros.map((f) => (
            <Button
              key={f.k}
              size="sm"
              variant={filtro === f.k ? "default" : "outline"}
              onClick={() => setFiltro(f.k)}
              style={filtro === f.k ? { background: SST_TOKENS.navy, color: "white" } : undefined}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
              <th className="p-2 text-left">Fecha AT</th>
              <th className="p-2 text-left">Trabajador</th>
              <th className="p-2 text-left">Tipo</th>
              <th className="p-2 text-left">Gravedad</th>
              <th className="p-2 text-center">Días a investigar</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left w-64">Soportes</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((r, i) => {
              const dias = diasInvestigacion(r)
              const enPlazo = dias !== null && dias <= 15
              return (
                <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                  <td className="p-2">{r.fecha_evento}</td>
                  <td className="p-2">
                    <div className="font-medium">{r.trabajador ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.cargo ?? r.area_ocurrencia ?? ""}</div>
                  </td>
                  <td className="p-2 capitalize">{String(r.tipo).replace("_", " ")}</td>
                  <td className="p-2">
                    {r.gravedad ? (
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
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 text-center">
                    {dias === null ? (
                      <span className="text-muted-foreground">pendiente</span>
                    ) : (
                      <Badge style={{ background: enPlazo ? SST_TOKENS.ok : SST_TOKENS.bad, color: "white" }}>
                        {dias} días
                      </Badge>
                    )}
                  </td>
                  <td className="p-2">
                    <Badge
                      style={{
                        background: r.estado === "cerrada" ? SST_TOKENS.ok : SST_TOKENS.warn,
                        color: "white",
                      }}
                    >
                      {r.estado}
                    </Badge>
                  </td>
                  <td className="p-2 align-top">
                    <SoportesDocumentales
                      norma="SST 0312"
                      modulo="Investigación AT"
                      referenciaTipo="incidente"
                      referenciaId={r.id!}
                      referenciaDesc={`${String(r.tipo)} - ${r.trabajador ?? ""}`}
                      empresaId={empresaId}
                    />
                  </td>
                </tr>
              )
            })}
            {!loading && filtradas.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No hay investigaciones registradas para estos filtros.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
