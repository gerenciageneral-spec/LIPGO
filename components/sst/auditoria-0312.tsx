"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getAuditoria0312 } from "@/lib/sst-auditoria-actions"
import type {
  AuditoriaData,
  AuditoriaEstandarRow,
  CicloPHVA,
  EstadoCumple,
} from "@/lib/sst-types"
import {
  CICLO_COLOR,
  CICLO_LABEL,
  colorPct,
  ESTADO_LABEL,
  estadoColor,
  fmtPct,
  SST_TOKENS,
  VALORACION_LABEL,
  valoracionColor,
} from "@/components/sst/sst-utils"
import { Loader2, Download, FileWarning, AlertTriangle, Search, ExternalLink } from "lucide-react"

interface Props {
  selectedEmpresaId?: number | null
}

const CICLOS: CicloPHVA[] = ["PLANEAR", "HACER", "VERIFICAR", "ACTUAR"]
const EMPTY: AuditoriaData = {
  autoevaluacion: null,
  porCiclo: [],
  estandares: [],
  evidencia: {},
  aniosDisponibles: [],
}

export function Auditoria0312({ selectedEmpresaId: propEmpresaId }: Props) {
  const { selectedEmpresaId: ctxEmpresaId, selectedEmpresaNombre } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId

  const [data, setData] = useState<AuditoriaData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState<number | null>(null)

  const [search, setSearch] = useState("")
  const [cicloFiltro, setCicloFiltro] = useState<"todos" | CicloPHVA>("todos")
  const [estadoFiltro, setEstadoFiltro] = useState<"todos" | EstadoCumple>("todos")

  useEffect(() => {
    let active = true
    setLoading(true)
    getAuditoria0312(empresaId, anio)
      .then((d) => {
        if (active) setData(d)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [empresaId, anio])

  const { autoevaluacion, porCiclo, estandares, evidencia } = data
  const pctTotal = autoevaluacion?.puntaje_total ?? 0

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return estandares.filter((e) => {
      if (cicloFiltro !== "todos" && e.ciclo !== cicloFiltro) return false
      if (estadoFiltro !== "todos" && e.cumple !== estadoFiltro) return false
      if (!q) return true
      return (
        e.numeral.toLowerCase().includes(q) ||
        e.item.toLowerCase().includes(q) ||
        e.estandar.toLowerCase().includes(q)
      )
    })
  }, [estandares, search, cicloFiltro, estadoFiltro])

  // Brechas: items en no_cumple.
  const brechas = useMemo(() => estandares.filter((e) => e.cumple === "no_cumple"), [estandares])

  // Inconsistencia: marcado "cumple" pero sin evidencia viva en su tabla.
  const sinEvidencia = (e: AuditoriaEstandarRow) =>
    e.tabla ? (evidencia[e.tabla] ?? 0) === 0 : false

  const exportCSV = () => {
    const headers = ["Numeral", "Estandar", "Item", "Ciclo", "Peso", "Estado", "Modulo", "Documento", "Evidencia"]
    const rows = filtered.map((e) => [
      e.numeral,
      e.estandar,
      e.item,
      e.ciclo,
      String(e.peso),
      e.cumple ? ESTADO_LABEL[e.cumple] : "Sin responder",
      e.modulo ?? "",
      e.documento ?? "",
      e.tabla ? String(evidencia[e.tabla] ?? 0) : "",
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `auditoria-0312-${autoevaluacion?.anio ?? ""}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Cargando auditoría 0312...
      </div>
    )
  }

  if (!autoevaluacion) {
    return (
      <div className="space-y-4">
        <Header nombre={selectedEmpresaNombre} />
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FileWarning className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-semibold text-foreground">Sin autoevaluación registrada</p>
          <p className="max-w-md text-sm text-muted-foreground">
            No se encontró una autoevaluación SG-SST para esta empresa. Verifica que el esquema SST
            esté creado y que exista al menos una autoevaluación en{" "}
            <code className="rounded bg-muted px-1">sst_autoevaluaciones</code>.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Header nombre={selectedEmpresaNombre} />

      {/* Encabezado / KPIs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex items-center gap-5 p-5">
          <Gauge pct={pctTotal} />
          <div className="space-y-1.5">
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: valoracionColor(autoevaluacion.valoracion) }}
            >
              {autoevaluacion.valoracion ? VALORACION_LABEL[autoevaluacion.valoracion] : "SIN VALORAR"}
            </span>
            <p className="text-sm text-muted-foreground">
              Año {autoevaluacion.anio}
              {autoevaluacion.sede ? ` · ${autoevaluacion.sede}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">Resolución 0312/2019 · SG-SST</p>
          </div>
        </Card>

        {/* Tiles PHVA */}
        <Card className="p-5 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>
            Ciclo PHVA
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CICLOS.map((c) => {
              const row = porCiclo.find((p) => p.ciclo === c)
              const pct = row?.pct_ciclo ?? 0
              return (
                <div
                  key={c}
                  className="rounded-lg p-3 text-white"
                  style={{ backgroundColor: CICLO_COLOR[c] }}
                >
                  <p className="text-xs font-medium opacity-90">{CICLO_LABEL[c]}</p>
                  <p className="text-2xl font-bold">{fmtPct(pct)}</p>
                  <p className="text-[11px] opacity-90">
                    {(row?.obtenido_ciclo ?? 0).toFixed(0)} / {(row?.peso_ciclo ?? 0).toFixed(0)} pts
                  </p>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Controles */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por numeral, ítem o estándar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={cicloFiltro} onValueChange={(v) => setCicloFiltro(v as typeof cicloFiltro)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Ciclo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los ciclos</SelectItem>
              {CICLOS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CICLO_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={estadoFiltro} onValueChange={(v) => setEstadoFiltro(v as typeof estadoFiltro)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="cumple">Cumple</SelectItem>
              <SelectItem value="no_cumple">No cumple</SelectItem>
              <SelectItem value="no_aplica">No aplica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {data.aniosDisponibles.length > 0 && (
            <Select
              value={String(anio ?? autoevaluacion.anio)}
              onValueChange={(v) => setAnio(Number(v))}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.aniosDisponibles.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Tabla de auditoria */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow style={{ backgroundColor: SST_TOKENS.light }}>
                <TableHead className="w-20">Numeral</TableHead>
                <TableHead>Estándar / Ítem</TableHead>
                <TableHead className="w-24">Ciclo</TableHead>
                <TableHead className="w-16 text-center">Peso</TableHead>
                <TableHead className="w-28">Estado</TableHead>
                <TableHead>Evidencia en LIPgo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No hay estándares para los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e) => {
                  const inconsistente = e.cumple === "cumple" && sinEvidencia(e)
                  return (
                    <TableRow key={e.numeral}>
                      <TableCell className="font-mono text-xs font-semibold">{e.numeral}</TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{e.item}</p>
                        <p className="text-xs text-muted-foreground">{e.estandar}</p>
                        {e.documento && (
                          <Badge variant="outline" className="mt-1 font-mono text-[10px]">
                            {e.documento}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-block rounded px-2 py-0.5 text-[11px] font-medium text-white"
                          style={{ backgroundColor: CICLO_COLOR[e.ciclo] }}
                        >
                          {CICLO_LABEL[e.ciclo]}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-sm">{e.peso}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: estadoColor(e.cumple) }}
                          />
                          {e.cumple ? ESTADO_LABEL[e.cumple] : "Sin responder"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {e.modulo && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <ExternalLink className="h-3 w-3" />
                              {e.modulo}
                            </span>
                          )}
                          {e.tabla ? (
                            (evidencia[e.tabla] ?? 0) > 0 ? (
                              <Badge
                                className="text-white"
                                style={{ backgroundColor: SST_TOKENS.ok }}
                              >
                                {evidencia[e.tabla]} registros
                              </Badge>
                            ) : (
                              <Badge style={{ backgroundColor: SST_TOKENS.warn, color: "#3d2c00" }}>
                                sin evidencia
                              </Badge>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {inconsistente && (
                            <span
                              className="flex items-center gap-1 text-[11px] font-medium"
                              style={{ color: SST_TOKENS.bad }}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              cumple sin evidencia
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Resumen de brechas */}
      {brechas.length > 0 && (
        <Card className="p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: SST_TOKENS.bad }}>
            <FileWarning className="h-4 w-4" />
            Brechas — {brechas.length} estándar(es) en no cumple
          </p>
          <ul className="space-y-2">
            {brechas.map((b) => (
              <li
                key={b.numeral}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs font-semibold">{b.numeral}</span>
                <span className="flex-1 text-foreground">{b.item}</span>
                {b.documento && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {b.documento}
                  </Badge>
                )}
                {b.modulo && <span className="text-xs text-muted-foreground">{b.modulo}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Header({ nombre }: { nombre: string | null }) {
  return (
    <div className="rounded-lg p-4 text-white" style={{ backgroundColor: SST_TOKENS.navy }}>
      <h1 className="text-lg font-bold">SST · Auditoría 0312 — Estándar ↔ Evidencia</h1>
      <p className="text-sm opacity-90">
        {nombre ?? "Empresa"} · Tablero central del SG-SST (Resolución 0312/2019)
      </p>
    </div>
  )
}

// Velocimetro circular con conic-gradient.
function Gauge({ pct }: { pct: number }) {
  const color = colorPct(pct)
  return (
    <div
      className="flex h-28 w-28 flex-col items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${color} ${pct}%, ${SST_TOKENS.grey} 0)` }}
    >
      <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-card">
        <span className="text-2xl font-bold" style={{ color }}>
          {fmtPct(pct)}
        </span>
        <span className="text-[10px] text-muted-foreground">cumplimiento</span>
      </div>
    </div>
  )
}
